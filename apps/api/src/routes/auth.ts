import { randomInt } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';
import { issueTokens, permissionsFor, requireUser, revokeRefreshToken, rotateRefreshToken } from '../lib/auth.js';
import { prisma } from '../lib/db.js';
import { HttpError, badRequest, notFound, parse, tooMany } from '../lib/http.js';
import { notify, TEMPLATES } from '../lib/notify.js';
import { getBrand } from '../lib/settings.js';

const phoneSchema = z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number');
const DEV_MASTER_CODE = '123456';

/**
 * Dev sign-in (code shown on screen, 123456 always works) is on for local development.
 * On a deployed staging server set DEV_OTP_KEY: dev sign-in then only works for requests that
 * carry that key in `x-dev-otp-key`, so the public API can't be used to sign in as anyone.
 * In production without DEV_OTP_KEY it is always off.
 */
function devOtpAllowed(req: FastifyRequest) {
  const key = process.env.DEV_OTP_KEY;
  if (key) return req.headers['x-dev-otp-key'] === key;
  return process.env.NODE_ENV !== 'production';
}
const OTP_PER_HOUR = 5;

/** Checks a phone OTP and marks it used. The dev master code only works where dev sign-in is allowed. */
async function consumeOtp(phone: string, code: string, isDev: boolean) {
  const otp = await prisma.otpCode.findFirst({
    where: { phone, code, used: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp && !(isDev && code === DEV_MASTER_CODE)) throw badRequest('Incorrect or expired OTP');
  if (otp) await prisma.otpCode.update({ where: { id: otp.id }, data: { used: true } });
}

async function signedIn(app: FastifyInstance, userId: string, userAgent?: string) {
  const user = await prisma.user.update({
    where: { id: userId },
    // Signing in again cancels a pending account deletion (spec 11.2).
    data: { phoneVerified: true, lastLoginAt: new Date(), deletionRequestedAt: null },
  });
  if (user.status !== 'active') throw badRequest('This account is suspended');
  const tokens = await issueTokens(app, user, userAgent);
  // `token` kept for older clients.
  return { ...tokens, token: tokens.accessToken, user };
}

const PROVIDERS = {
  google: { jwks: 'https://www.googleapis.com/oauth2/v3/certs', issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: process.env.GOOGLE_CLIENT_ID },
  apple: { jwks: 'https://appleid.apple.com/auth/keys', issuer: ['https://appleid.apple.com'], audience: process.env.APPLE_CLIENT_ID },
} as const;
const jwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function authRoutes(app: FastifyInstance) {
  app.post('/v1/auth/otp/request', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req) => {
    const { phone } = parse(z.object({ phone: phoneSchema }), req.body);
    const recent = await prisma.otpCode.count({
      where: { phone, createdAt: { gte: new Date(Date.now() - 3600_000) } },
    });
    if (recent >= OTP_PER_HOUR) throw tooMany('Too many OTP requests. Try again in an hour.');
    const code = String(randomInt(100000, 1000000));
    await prisma.otpCode.create({ data: { phone, code, expiresAt: new Date(Date.now() + 10 * 60_000) } });
    await notify({ to: phone, channel: 'sms', template: 'otp', payload: { code } });
    return { sent: true, ...(devOtpAllowed(req) ? { devCode: code } : {}) };
  });

  app.post('/v1/auth/otp/verify', async (req) => {
    const body = parse(
      z.object({ phone: phoneSchema, code: z.string().length(6), name: z.string().max(80).optional() }),
      req.body,
    );
    await consumeOtp(body.phone, body.code, devOtpAllowed(req));
    const user = await prisma.user.upsert({
      where: { phone: body.phone },
      create: { phone: body.phone, name: body.name },
      update: body.name ? { name: body.name } : {},
    });
    return signedIn(app, user.id, req.headers['user-agent']);
  });

  // Social sign-in (spec 10.1). Accounts are phone-first: a new Google/Apple email is linked to a
  // verified phone number in the same call, so the provider must send phone + OTP the first time.
  app.post('/v1/auth/oauth/:provider', async (req) => {
    const { provider } = req.params as { provider: string };
    const cfg = PROVIDERS[provider as keyof typeof PROVIDERS];
    if (!cfg) throw notFound('Provider');
    if (!cfg.audience) throw new HttpError(501, 'not_configured', `${provider} sign-in is not configured`);
    const body = parse(z.object({ idToken: z.string(), phone: phoneSchema.optional(), code: z.string().length(6).optional(), name: z.string().max(80).optional() }), req.body);
    if (!jwks.has(provider)) jwks.set(provider, createRemoteJWKSet(new URL(cfg.jwks)));
    let email: string;
    try {
      const { payload } = await jwtVerify(body.idToken, jwks.get(provider)!, { issuer: [...cfg.issuer], audience: cfg.audience });
      if (!payload.email || payload.email_verified === false || payload.email_verified === 'false') throw new Error('no email');
      email = String(payload.email).toLowerCase();
    } catch {
      throw badRequest('Could not verify the sign-in token');
    }
    const existing = await prisma.user.findFirst({ where: { email } });
    if (existing) return signedIn(app, existing.id, req.headers['user-agent']);
    if (!body.phone || !body.code) throw new HttpError(409, 'phone_required', 'Verify your mobile number to finish signing in', { email });
    await consumeOtp(body.phone, body.code, devOtpAllowed(req));
    const user = await prisma.user.upsert({
      where: { phone: body.phone },
      create: { phone: body.phone, email, name: body.name },
      update: { email },
    });
    return signedIn(app, user.id, req.headers['user-agent']);
  });

  app.post('/v1/auth/refresh', async (req) => {
    const { refreshToken } = parse(z.object({ refreshToken: z.string().min(10) }), req.body);
    const tokens = await rotateRefreshToken(app, refreshToken, req.headers['user-agent']);
    return { ...tokens, token: tokens.accessToken };
  });

  app.post('/v1/auth/logout', async (req) => {
    const { refreshToken } = parse(z.object({ refreshToken: z.string().optional() }), req.body ?? {});
    if (refreshToken) await revokeRefreshToken(refreshToken);
    return { ok: true };
  });

  app.get('/v1/me', async (req) => {
    const { id } = await requireUser(req);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id },
      include: {
        memberships: { where: { status: 'active' }, include: { restaurant: { select: { id: true, name: true, slug: true, status: true } } } },
      },
    });
    const unread = await prisma.notification.count({ where: { userId: id, channel: 'in_app', readAt: null } });
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      avatarUrl: user.avatarUrl,
      role: user.role,
      notificationPrefs: user.notificationPrefs,
      unreadNotifications: unread,
      memberships: user.memberships.map((m) => ({ role: m.role, permissions: permissionsFor(m.role), restaurant: m.restaurant })),
    };
  });

  app.patch('/v1/me', async (req) => {
    const { id } = await requireUser(req);
    const data = parse(
      z.object({
        name: z.string().trim().min(1).max(80).optional(),
        email: z.email().nullable().optional(),
        avatarUrl: z.string().startsWith('/uploads/').nullable().optional(),
        notificationPrefs: z.object({ sms: z.boolean(), email: z.boolean(), push: z.boolean(), digest: z.boolean() }).partial().optional(),
      }),
      req.body,
    );
    const u = await prisma.user.update({ where: { id }, data });
    return { id: u.id, name: u.name, email: u.email, avatarUrl: u.avatarUrl, notificationPrefs: u.notificationPrefs };
  });

  // ---- Saved addresses (spec 2.1) ----
  const addressSchema = z.object({
    label: z.enum(['home', 'work', 'other']),
    addressText: z.string().trim().min(2).max(200),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    isDefault: z.boolean().optional(),
  });

  app.get('/v1/me/addresses', async (req) => {
    const { id } = await requireUser(req);
    return { data: await prisma.userAddress.findMany({ where: { userId: id }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] }) };
  });

  app.post('/v1/me/addresses', async (req, reply) => {
    const { id } = await requireUser(req);
    const body = parse(addressSchema, req.body);
    if ((await prisma.userAddress.count({ where: { userId: id } })) >= 10) throw badRequest('You can save up to 10 places');
    if (body.isDefault) await prisma.userAddress.updateMany({ where: { userId: id }, data: { isDefault: false } });
    reply.code(201);
    return prisma.userAddress.create({ data: { ...body, userId: id } });
  });

  app.patch('/v1/me/addresses/:aid', async (req) => {
    const { id } = await requireUser(req);
    const { aid } = req.params as { aid: string };
    const body = parse(addressSchema.partial(), req.body);
    if (body.isDefault) await prisma.userAddress.updateMany({ where: { userId: id }, data: { isDefault: false } });
    const { count } = await prisma.userAddress.updateMany({ where: { id: aid, userId: id }, data: body });
    if (!count) throw notFound('Address');
    return { ok: true };
  });

  app.delete('/v1/me/addresses/:aid', async (req) => {
    const { id } = await requireUser(req);
    await prisma.userAddress.deleteMany({ where: { id: (req.params as { aid: string }).aid, userId: id } });
    return { ok: true };
  });

  // ---- In-app notifications ----
  app.get('/v1/me/notifications', async (req) => {
    const { id } = await requireUser(req);
    const rows = await prisma.notification.findMany({ where: { userId: id, channel: 'in_app' }, orderBy: { createdAt: 'desc' }, take: 50 });
    const brand = (await getBrand()).appName;
    return {
      data: rows.map((n) => {
        const render = TEMPLATES[n.template as keyof typeof TEMPLATES] as (p: never, b: string) => { title: string; body: string };
        return { id: n.id, template: n.template, ...render(n.payload as never, brand), payload: n.payload, readAt: n.readAt, createdAt: n.createdAt };
      }),
    };
  });

  app.post('/v1/me/notifications/read', async (req) => {
    const { id } = await requireUser(req);
    await prisma.notification.updateMany({ where: { userId: id, channel: 'in_app', readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  });

  // ---- Privacy: data export and deletion (DPDP Act 2023, spec 11.2) ----
  app.get('/v1/me/export', async (req) => {
    const { id } = await requireUser(req);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id },
      include: {
        addresses: true,
        reviews: { include: { restaurant: { select: { name: true } }, reply: true } },
        lists: { include: { items: { include: { restaurant: { select: { name: true, slug: true } } } } } },
        memberships: { include: { restaurant: { select: { name: true } } } },
        votes: true,
      },
    });
    const { notificationPrefs, ...profile } = user;
    return { exportedAt: new Date(), profile, notificationPrefs };
  });

  app.delete('/v1/me', async (req) => {
    const { id } = await requireUser(req);
    const owned = await prisma.restaurantMember.count({ where: { userId: id, role: 'owner' } });
    if (owned) throw badRequest('Transfer or remove the restaurants you own before deleting your account');
    const user = await prisma.user.update({ where: { id }, data: { deletionRequestedAt: new Date() } });
    await prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await notify({ userId: id, to: user.phone, channel: 'sms', template: 'account_deletion' });
    return { scheduledFor: new Date(Date.now() + 7 * 864e5) };
  });
}
