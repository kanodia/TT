import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { buildApp } from '../src/app.js';

let app: FastifyInstance | null = null;

export async function getApp() {
  if (!app) {
    app = await buildApp();
    await app.ready();
  }
  return app;
}

export async function closeApp() {
  await app?.close();
  app = null;
}

type Opts = { token?: string; body?: unknown; headers?: Record<string, string> };

export async function call<T = any>(method: string, url: string, opts: Opts = {}): Promise<{ status: number; body: T }> {
  const a = await getApp();
  const res = await a.inject({
    method: method as 'GET',
    url,
    headers: { ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}), ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}), ...opts.headers },
    payload: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
}

/** Signs a phone in with the dev master code and returns its tokens. */
export async function login(phone: string, name?: string) {
  const r = await call('POST', '/v1/auth/otp/verify', { body: { phone, code: '123456', ...(name ? { name } : {}) } });
  if (r.status !== 200) throw new Error(`login failed: ${JSON.stringify(r.body)}`);
  return r.body as { accessToken: string; refreshToken: string; user: { id: string } };
}

export const ADMIN = '9999999999';
export const PARTNER = '8888888888';
export const AGENT = '7777777777';

let n = 0;
/** A fresh diner phone per test so review cooldowns never collide. */
export const freshPhone = () => `6${String(Date.now()).slice(-7)}${String(n++ % 100).padStart(2, '0')}`;

export const NKT = { lat: 27.7365, lng: 75.7812 };

export async function jpegDataUrl() {
  const buf = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#c33' } }).jpeg().toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}
