import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp, { type Metadata } from 'sharp';
import { badRequest, HttpError } from './http.js';

// Local disk in development; S3 (+ CloudFront via MEDIA_BASE_URL) when S3_BUCKET is set (spec 8.1).
export const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');
// Partner documents (licences, ownership proof) are never public; admins fetch them via the API.
export const PRIVATE_DIR = path.resolve(process.cwd(), 'private-uploads');

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const DOC_MIME: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
export const PRIVATE_MIME: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' };

/** Three sizes served as WebP (spec 11.1). Stored URL points at `md`; clients swap the suffix. */
export const SIZES = { sm: 320, md: 800, lg: 1600 } as const;

const s3 = process.env.S3_BUCKET ? new S3Client({ region: process.env.AWS_REGION ?? 'ap-south-1' }) : null;
const PUBLIC_BUCKET = process.env.S3_BUCKET;
const PRIVATE_BUCKET = process.env.S3_PRIVATE_BUCKET ?? process.env.S3_BUCKET;

async function put(key: string, body: Buffer, contentType: string, isPrivate = false) {
  if (s3) {
    await s3.send(
      new PutObjectCommand({
        Bucket: isPrivate ? PRIVATE_BUCKET : PUBLIC_BUCKET,
        Key: isPrivate ? `private/${key}` : `uploads/${key}`,
        Body: body,
        ContentType: contentType,
        ...(isPrivate ? { ServerSideEncryption: 'AES256' } : { CacheControl: 'public, max-age=31536000, immutable' }),
      }),
    );
    return;
  }
  const dir = isPrivate ? PRIVATE_DIR : UPLOAD_DIR;
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, key), body);
}

/** Optional ClamAV scan (clamd INSTREAM) when CLAMAV_HOST is set (spec 11.2). */
async function virusScan(buffer: Buffer) {
  const host = process.env.CLAMAV_HOST;
  if (!host) return;
  const [h, p] = host.split(':');
  const verdict = await new Promise<string>((resolve, reject) => {
    const sock = net.createConnection({ host: h, port: Number(p ?? 3310) }, () => {
      sock.write('zINSTREAM\0');
      for (let i = 0; i < buffer.length; i += 64 * 1024) {
        const chunk = buffer.subarray(i, i + 64 * 1024);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(chunk.length);
        sock.write(len);
        sock.write(chunk);
      }
      sock.write(Buffer.alloc(4));
    });
    let out = '';
    sock.on('data', (d) => (out += d.toString()));
    sock.on('end', () => resolve(out));
    sock.on('error', reject);
    sock.setTimeout(15_000, () => sock.destroy(new Error('scan timeout')));
  });
  if (!verdict.includes('OK')) throw badRequest('This file was rejected by the virus scanner');
}

export type SavedImage = { url: string; width: number; height: number };

/** Re-encodes to WebP in three sizes. Re-encoding drops EXIF, so diners' GPS never leaves the upload. */
export async function saveImage(buffer: Buffer, mimeType: string): Promise<SavedImage> {
  if (!IMAGE_MIME.includes(mimeType)) throw badRequest('Photos must be JPEG, PNG, WebP or HEIC');
  if (buffer.length > MAX_UPLOAD_BYTES) throw badRequest('File is larger than 10 MB');
  await virusScan(buffer);
  const id = randomUUID();
  let meta: Metadata;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    throw badRequest('That file is not a readable image');
  }
  for (const [size, max] of Object.entries(SIZES)) {
    const out = await sharp(buffer).rotate().resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
    await put(`${id}-${size}.webp`, out, 'image/webp');
  }
  const upright = (meta.orientation ?? 1) >= 5;
  const w = (upright ? meta.height : meta.width) ?? 0;
  const h = (upright ? meta.width : meta.height) ?? 0;
  const scale = Math.min(1, SIZES.lg / Math.max(w, h, 1));
  return { url: mediaUrl(`${id}-md.webp`), width: Math.round(w * scale), height: Math.round(h * scale) };
}

/** Private documents keep their original bytes (licences may be PDFs). */
export async function saveDocument(buffer: Buffer, mimeType: string) {
  const ext = DOC_MIME[mimeType];
  if (!ext) throw badRequest(`File type ${mimeType} is not allowed`);
  if (buffer.length > MAX_UPLOAD_BYTES) throw badRequest('File is larger than 10 MB');
  await virusScan(buffer);
  const name = `${randomUUID()}.${ext}`;
  await put(name, buffer, mimeType, true);
  return `/private/${name}`;
}

export function mediaUrl(key: string) {
  const base = process.env.MEDIA_BASE_URL;
  return base ? `${base.replace(/\/$/, '')}/uploads/${key}` : `/uploads/${key}`;
}

/** Field app sends photos captured offline as data URLs. */
export async function saveDataUrl(dataUrl: string) {
  const match = /^data:([\w/+.-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw badRequest('Invalid photo data');
  return saveImage(Buffer.from(match[2], 'base64'), match[1]);
}

/** Direct-to-S3 upload for large files (spec 10.2 /uploads/sign). Local dev falls back to POST /v1/uploads. */
export async function signUpload(contentType: string, kind: 'photo' | 'document') {
  if (!s3) return { method: 'POST' as const, url: `/v1/uploads${kind === 'document' ? '?kind=document' : ''}`, fields: 'multipart' };
  const key = `incoming/${randomUUID()}`;
  const url = await getSignedUrl(s3, new PutObjectCommand({ Bucket: PRIVATE_BUCKET, Key: key, ContentType: contentType }), { expiresIn: 600 });
  return { method: 'PUT' as const, url, key };
}

/** After a direct upload, process the object like a normal upload (resize/scan/privatise). */
export async function finishSignedUpload(key: string, contentType: string, kind: 'photo' | 'document') {
  if (!s3 || !key.startsWith('incoming/')) throw new HttpError(400, 'invalid_input', 'Unknown upload');
  const obj = await s3.send(new GetObjectCommand({ Bucket: PRIVATE_BUCKET, Key: key }));
  const buffer = Buffer.from(await obj.Body!.transformToByteArray());
  return kind === 'document' ? { url: await saveDocument(buffer, contentType) } : saveImage(buffer, contentType);
}

export async function readPrivate(name: string) {
  if (s3) {
    const obj = await s3.send(new GetObjectCommand({ Bucket: PRIVATE_BUCKET, Key: `private/${name}` }));
    return Buffer.from(await obj.Body!.transformToByteArray());
  }
  return readFile(path.join(PRIVATE_DIR, name));
}
