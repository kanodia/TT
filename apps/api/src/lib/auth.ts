import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from './db.js';
import { forbidden, notFound, unauthorized } from './http.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; role: string; typ: 'access' };
    user: { sub: string; role: string; typ: 'access' };
  }
}

export type AuthUser = { id: string; role: string };

export const ACCESS_TTL = '15m';
const REFRESH_TTL_MS = 30 * 864e5;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/** Access token (15 min) + rotating refresh token (30 days, stored hashed) — spec 10.1, 11.2. */
export async function issueTokens(app: FastifyInstance, user: { id: string; role: string }, userAgent?: string) {
  const accessToken = await app.jwt.sign({ sub: user.id, role: user.role, typ: 'access' }, { expiresIn: ACCESS_TTL });
  const refreshToken = randomBytes(32).toString('base64url');
  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: hash(refreshToken), expiresAt: new Date(Date.now() + REFRESH_TTL_MS), userAgent: userAgent?.slice(0, 200) },
  });
  return { accessToken, refreshToken, expiresIn: 15 * 60 };
}

/** Swaps a refresh token for a new pair. Re-use of a revoked token revokes the whole family. */
export async function rotateRefreshToken(app: FastifyInstance, refreshToken: string, userAgent?: string) {
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: hash(refreshToken) }, include: { user: true } });
  if (!row) throw unauthorized('Session expired. Please sign in again.');
  if (row.revokedAt) {
    await prisma.refreshToken.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    throw unauthorized('Session expired. Please sign in again.');
  }
  if (row.expiresAt < new Date() || row.user.status !== 'active') throw unauthorized('Session expired. Please sign in again.');
  await prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
  return issueTokens(app, row.user, userAgent);
}

export async function revokeRefreshToken(refreshToken: string) {
  await prisma.refreshToken.updateMany({ where: { tokenHash: hash(refreshToken), revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function requireUser(req: FastifyRequest): Promise<AuthUser> {
  try {
    await req.jwtVerify();
  } catch {
    throw unauthorized();
  }
  if (req.user.typ !== 'access') throw unauthorized();
  const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
  if (!user || user.status !== 'active') throw unauthorized('Account not active');
  return { id: user.id, role: user.role };
}

/** Returns the signed-in user, or null for anonymous requests. */
export async function optionalUser(req: FastifyRequest): Promise<AuthUser | null> {
  if (!req.headers.authorization) return null;
  try {
    return await requireUser(req);
  } catch {
    return null;
  }
}

export async function requireRole(req: FastifyRequest, roles: string[]): Promise<AuthUser> {
  const user = await requireUser(req);
  if (!roles.includes(user.role)) throw forbidden();
  return user;
}

export const FIELD_ROLES = ['field_agent', 'field_supervisor', 'admin'];
export const REVIEWER_ROLES = ['field_supervisor', 'admin'];

// Partner permissions (spec 5.3).
export type PartnerArea = 'profile' | 'menu' | 'photos' | 'reviews' | 'offers' | 'team' | 'core' | 'analytics';
const PERMISSIONS: Record<string, PartnerArea[]> = {
  owner: ['profile', 'menu', 'photos', 'reviews', 'offers', 'team', 'core', 'analytics'],
  manager: ['profile', 'menu', 'photos', 'reviews', 'offers', 'analytics'],
  staff: ['menu', 'photos'],
};

export async function requireMember(req: FastifyRequest, restaurantId: string, area: PartnerArea) {
  const user = await requireUser(req);
  const restaurant = await prisma.restaurant.findFirst({ where: { id: restaurantId, deletedAt: null } });
  if (!restaurant) throw notFound('Restaurant');
  if (user.role === 'admin') return { user, restaurant, memberRole: 'owner' };
  const member = await prisma.restaurantMember.findUnique({
    where: { restaurantId_userId: { restaurantId, userId: user.id } },
  });
  if (!member || member.status !== 'active') throw forbidden('You are not a member of this restaurant');
  if (!PERMISSIONS[member.role]?.includes(area)) throw forbidden(`Your role (${member.role}) cannot change ${area}`);
  return { user, restaurant, memberRole: member.role };
}

export function permissionsFor(role: string) {
  return PERMISSIONS[role] ?? [];
}
