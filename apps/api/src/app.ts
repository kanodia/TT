import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyRequest } from 'fastify';
import { mkdirSync } from 'node:fs';
import { requireRole, requireUser } from './lib/auth.js';
import { HttpError, badRequest, notFound } from './lib/http.js';
import { z } from 'zod';
import { parse } from './lib/http.js';
import { MAX_UPLOAD_BYTES, PRIVATE_MIME, UPLOAD_DIR, finishSignedUpload, readPrivate, saveDocument, saveImage, signUpload } from './lib/uploads.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { configRoutes } from './routes/config.js';
import { dinerRoutes } from './routes/diner.js';
import { fieldRoutes } from './routes/field.js';
import { partnerRoutes } from './routes/partner.js';

export async function buildApp() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    // Behind a load balancer, use the client IP from X-Forwarded-For for rate limits.
    trustProxy: process.env.TRUST_PROXY === '1',
    bodyLimit: 25 * 1024 * 1024, // field sync carries photos as data URLs
  });

  await app.register(cors, {
    origin: (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(','),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
    throw new Error('Set JWT_SECRET (32+ characters) in production');
  }
  // Access tokens live 15 minutes and refresh tokens are opaque DB rows, so rotating JWT_SECRET
  // only forces a silent refresh — nobody is signed out (spec 11.2).
  await app.register(jwt, { secret: process.env.JWT_SECRET ?? 'dev-only-change-me' });
  // 60 req/min per IP for anonymous calls, more for signed-in users (spec 11.2). In-memory store;
  // pass a Redis client via RATE_LIMIT_REDIS when running several API instances.
  // Signed-in users are limited per account (many diners share a carrier IP); anonymous callers per IP.
  const userKey = (req: FastifyRequest) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return null;
    try {
      return (app.jwt.verify(auth.slice(7)) as { sub: string }).sub;
    } catch {
      return null;
    }
  };
  const internalKey = process.env.INTERNAL_API_KEY;
  await app.register(rateLimit, {
    global: true,
    keyGenerator: (req) => {
      const sub = userKey(req);
      return sub ? `u:${sub}` : `ip:${req.ip}`;
    },
    max: (_req, key) => (key.startsWith('u:') ? 300 : Number(process.env.RATE_LIMIT_ANON ?? 60)),
    timeWindow: '1 minute',
    // The web server's own server-side fetches (page metadata) carry the internal key.
    allowList: (req) => req.url === '/health' || req.url.startsWith('/uploads/') || (!!internalKey && req.headers['x-internal-key'] === internalKey),
    errorResponseBuilder: (_req, ctx) => Object.assign(new Error(`Too many requests. Try again in ${Math.ceil(ctx.ttl / 1000)} s.`), { statusCode: 429 }),
  });
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
  mkdirSync(UPLOAD_DIR, { recursive: true });
  await app.register(fastifyStatic, { root: UPLOAD_DIR, prefix: '/uploads/' });

  app.setErrorHandler((error: Error & { statusCode?: number; code?: string }, _req, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.status).send({ error: { code: error.code, message: error.message, details: error.details } });
    }
    if (error.code === 'P2025') {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } });
    }
    const status = error.statusCode ?? 500;
    if (status >= 500) app.log.error(error);
    if (status === 429) {
      return reply.code(429).send({ error: { code: 'rate_limited', message: error.message || 'Too many requests. Please slow down.' } });
    }
    return reply.code(status).send({
      error: { code: status >= 500 ? 'server_error' : 'bad_request', message: status >= 500 ? 'Something went wrong' : error.message },
    });
  });

  app.get('/health', async () => ({ ok: true }));

  // ?kind=document stores privately (licences, ownership proof); default is a public photo.
  app.post('/v1/uploads', async (req) => {
    await requireUser(req);
    const { kind } = req.query as { kind?: string };
    const file = await req.file();
    if (!file) throw badRequest('Attach a file');
    const buffer = await file.toBuffer();
    if (kind === 'document') return { url: await saveDocument(buffer, file.mimetype) };
    return saveImage(buffer, file.mimetype);
  });

  // Pre-signed direct upload (spec 10.2); in local dev this points back at POST /v1/uploads.
  app.post('/v1/uploads/sign', async (req) => {
    await requireUser(req);
    const body = parse(z.object({ contentType: z.string(), kind: z.enum(['photo', 'document']).default('photo') }), req.body);
    return signUpload(body.contentType, body.kind);
  });

  app.post('/v1/uploads/complete', async (req) => {
    await requireUser(req);
    const body = parse(z.object({ key: z.string(), contentType: z.string(), kind: z.enum(['photo', 'document']).default('photo') }), req.body);
    return finishSignedUpload(body.key, body.contentType, body.kind);
  });

  app.get('/v1/admin/files/:name', async (req, reply) => {
    await requireRole(req, ['admin']);
    const { name } = req.params as { name: string };
    if (!/^[\w-]+\.(jpg|png|webp|pdf)$/.test(name)) throw notFound('File');
    try {
      const data = await readPrivate(name);
      return reply.type(PRIVATE_MIME[name.split('.').pop()!]).header('cache-control', 'private, no-store').send(data);
    } catch {
      throw notFound('File');
    }
  });

  await app.register(authRoutes);
  await app.register(configRoutes);
  await app.register(dinerRoutes);
  await app.register(partnerRoutes);
  await app.register(fieldRoutes);
  await app.register(adminRoutes);

  return app;
}
