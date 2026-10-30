import type {} from '@fastify/cookie';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { db, schema } from '../db/client.js';
import type { User } from '../db/schema.js';
import { hashToken, randomToken } from './crypto.js';
import { forbidden, unauthorized } from './errors.js';

export const SESSION_COOKIE = 'fm_session';
const SESSION_DAYS = 60;

export async function createSession(userId: string, req: FastifyRequest, reply: FastifyReply): Promise<string> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.insert(schema.sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    userAgent: req.headers['user-agent']?.slice(0, 300),
    ip: req.ip,
  });
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.COOKIE_SECURE,
    domain: config.COOKIE_DOMAIN,
    expires: expiresAt,
  });
  return token;
}

export async function destroySession(req: FastifyRequest, reply: FastifyReply) {
  const token = req.cookies[SESSION_COOKIE];
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, hashToken(token)));
  reply.clearCookie(SESSION_COOKIE, { path: '/', domain: config.COOKIE_DOMAIN });
}

export async function userFromSession(token: string): Promise<User | null> {
  const rows = await db
    .select({ user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(and(eq(schema.sessions.tokenHash, hashToken(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0]?.user ?? null;
}

export const API_KEY_PREFIX = 'fm_live_';

export async function userFromApiKey(raw: string): Promise<{ user: User; keyId: string; orgId: string | null; scopes: string[] } | null> {
  if (!raw.startsWith(API_KEY_PREFIX)) return null;
  const rows = await db
    .select({ user: schema.users, key: schema.apiKeys })
    .from(schema.apiKeys)
    .innerJoin(schema.users, eq(schema.apiKeys.userId, schema.users.id))
    .where(and(eq(schema.apiKeys.keyHash, hashToken(raw)), isNull(schema.apiKeys.revokedAt)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  // Touch last_used_at at most once a minute.
  if (!row.key.lastUsedAt || Date.now() - row.key.lastUsedAt.getTime() > 60_000) {
    await db.update(schema.apiKeys).set({ lastUsedAt: sql`now()` }).where(eq(schema.apiKeys.id, row.key.id));
  }
  return { user: row.user, keyId: row.key.id, orgId: row.key.orgId, scopes: row.key.scopes };
}

export function newApiKey() {
  const raw = `${API_KEY_PREFIX}${randomToken(24)}`;
  return { raw, prefix: raw.slice(0, 12), hash: hashToken(raw) };
}

export function requireUser(req: FastifyRequest): User {
  if (!req.user) throw unauthorized();
  if (req.user.bannedAt) throw forbidden('This account is suspended');
  return req.user;
}

export function requireStaff(req: FastifyRequest): User {
  const u = requireUser(req);
  if (u.role !== 'admin' && u.role !== 'moderator') throw forbidden('Staff only');
  return u;
}

export function requireAdmin(req: FastifyRequest): User {
  const u = requireUser(req);
  if (u.role !== 'admin') throw forbidden('Admins only');
  return u;
}

export function requireScope(req: FastifyRequest, scope: string) {
  if (req.authKind === 'apikey' && !req.apiScopes.includes(scope) && !req.apiScopes.includes('*')) {
    throw forbidden(`API key is missing the "${scope}" scope`);
  }
}
