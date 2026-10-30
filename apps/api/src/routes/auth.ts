import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from '../app.js';
import { config } from '../config.js';
import { db, schema } from '../db/client.js';
import { createSession, destroySession, requireUser } from '../lib/auth.js';
import { hashPassword, hashToken, randomToken, safeEqual, sixDigitCode, verifyPassword } from '../lib/crypto.js';
import { badRequest, tooMany } from '../lib/errors.js';
import { sendCodeEmail } from '../lib/mail.js';
import { findOrCreateUser, userCount } from '../lib/users.js';
import { unlock } from '../game/engine.js';
import { privateUser } from './views.js';

const CODE_TTL_MIN = 15;
const MAX_ATTEMPTS = 5;

/** Issues a 6-digit code by email. Returns the code only in dev when no SMTP is configured. */
export async function issueCode(email: string, purpose: 'login' | 'claim', ref?: string, orgName?: string): Promise<string | undefined> {
  const normal = email.trim().toLowerCase();
  const recent = await db
    .select({ id: schema.loginCodes.id })
    .from(schema.loginCodes)
    .where(and(eq(schema.loginCodes.email, normal), gt(schema.loginCodes.createdAt, new Date(Date.now() - 15 * 60_000))));
  if (recent.length >= 5) throw tooMany('Too many codes requested for this email. Wait 15 minutes and try again.');
  const code = sixDigitCode();
  await db.insert(schema.loginCodes).values({
    email: normal,
    codeHash: hashToken(`${normal}:${code}`),
    purpose,
    ref: ref ?? null,
    expiresAt: new Date(Date.now() + CODE_TTL_MIN * 60_000),
  });
  await sendCodeEmail(normal, code, purpose, orgName);
  return !config.SMTP_HOST && config.NODE_ENV !== 'production' ? code : undefined;
}

/** Verifies and consumes the newest code for an email. */
export async function consumeCode(email: string, code: string, purpose: 'login' | 'claim', ref?: string): Promise<boolean> {
  const normal = email.trim().toLowerCase();
  const [row] = await db
    .select()
    .from(schema.loginCodes)
    .where(
      and(
        eq(schema.loginCodes.email, normal),
        eq(schema.loginCodes.purpose, purpose),
        isNull(schema.loginCodes.consumedAt),
        gt(schema.loginCodes.expiresAt, new Date()),
        ...(ref ? [eq(schema.loginCodes.ref, ref)] : []),
      ),
    )
    .orderBy(desc(schema.loginCodes.createdAt))
    .limit(1);
  if (!row) return false;
  if (row.attempts >= MAX_ATTEMPTS) return false;
  const ok = safeEqual(row.codeHash, hashToken(`${normal}:${code.trim()}`));
  await db
    .update(schema.loginCodes)
    .set(ok ? { consumedAt: sql`now()` } : { attempts: sql`${schema.loginCodes.attempts} + 1` })
    .where(eq(schema.loginCodes.id, row.id));
  return ok;
}

export default async function authRoutes(app: App) {
  const strict = { rateLimit: { max: 10, timeWindow: '1 minute' } };

  app.post(
    '/v1/auth/request-code',
    {
      config: strict,
      schema: {
        tags: ['auth'],
        summary: 'Email a 6-digit sign-in code',
        body: z.object({ email: z.email().max(200) }),
      },
    },
    async (req) => {
      const devCode = await issueCode(req.body.email, 'login');
      return { ok: true, ...(devCode ? { devCode } : {}) };
    },
  );

  app.post(
    '/v1/auth/verify-code',
    {
      config: strict,
      schema: {
        tags: ['auth'],
        summary: 'Sign in (or sign up) with the emailed code; sets the session cookie',
        body: z.object({
          email: z.email().max(200),
          code: z.string().regex(/^\d{6}$/),
          displayName: z.string().min(2).max(40).optional(),
          countryHint: z.string().length(2).optional(),
        }),
      },
    },
    async (req, reply) => {
      const ok = await consumeCode(req.body.email, req.body.code, 'login');
      if (!ok) throw badRequest('That code is wrong or has expired. Request a new one.');
      const country = req.body.countryHint ?? (req.headers['cf-ipcountry'] as string | undefined) ?? null;
      const { user, isNew } = await findOrCreateUser(req.body.email, { displayName: req.body.displayName, homeCountry: country });
      if (user.bannedAt) throw badRequest('This account is suspended.');
      if (isNew && (await userCount()) <= 10_000) await unlock(user.id, 'founder');
      await createSession(user.id, req, reply);
      const [fresh] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
      return { user: privateUser(fresh!), isNew };
    },
  );

  app.post(
    '/v1/auth/password-login',
    {
      config: { rateLimit: { max: 8, timeWindow: '1 minute' } },
      schema: {
        tags: ['auth'],
        summary: 'Sign in with email and password (only for accounts that set one; the email code always works)',
        body: z.object({ email: z.email().max(200), password: z.string().min(1).max(200) }),
      },
    },
    async (req, reply) => {
      const [u] = await db.select().from(schema.users).where(eq(schema.users.email, req.body.email.trim().toLowerCase()));
      const ok = await verifyPassword(req.body.password, u?.passwordHash);
      if (!u || !ok || u.bannedAt) throw badRequest('Email or password is wrong. You can always sign in with an emailed code instead.');
      await createSession(u.id, req, reply);
      return { user: privateUser(u), isNew: false };
    },
  );

  app.put(
    '/v1/me/password',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['auth'],
        summary: 'Set, change or remove my password. Changing needs the current password; setting the first one needs a fresh emailed code.',
        body: z.object({
          password: z.string().min(10).max(200).nullable(),
          current: z.string().max(200).optional(),
          code: z.string().regex(/^\d{6}$/).optional(),
        }),
      },
    },
    async (req) => {
      const user = requireUser(req);
      const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
      if (row!.passwordHash) {
        if (!req.body.current || !(await verifyPassword(req.body.current, row!.passwordHash))) throw badRequest('Your current password is wrong.');
      } else if (req.body.password !== null) {
        if (!req.body.code || !(await consumeCode(row!.email, req.body.code, 'login'))) throw badRequest('Request a sign-in code and enter it to set your first password.');
      }
      const passwordHash = req.body.password === null ? null : await hashPassword(req.body.password);
      await db.update(schema.users).set({ passwordHash, updatedAt: new Date() }).where(eq(schema.users.id, user.id));
      return { ok: true, hasPassword: !!passwordHash };
    },
  );

  app.post('/v1/auth/logout', { schema: { tags: ['auth'], summary: 'Sign out' } }, async (req, reply) => {
    await destroySession(req, reply);
    return { ok: true };
  });

  // ── Optional Google sign-in ──
  if (config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET) {
    const redirectUri = `${config.APP_URL}/api/v1/auth/google/callback`;
    app.get('/v1/auth/google', { schema: { tags: ['auth'], summary: 'Start Google sign-in', querystring: z.object({ next: z.string().optional() }) } }, async (req, reply) => {
      const state = randomToken(16);
      reply.setCookie('fm_oauth', `${state}|${req.query.next ?? '/'}`, { path: '/', httpOnly: true, sameSite: 'lax', secure: config.COOKIE_SECURE, maxAge: 600 });
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({
        client_id: config.GOOGLE_CLIENT_ID!,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        prompt: 'select_account',
      }).toString();
      return reply.redirect(url.toString());
    });

    app.get(
      '/v1/auth/google/callback',
      { schema: { hide: true, querystring: z.object({ code: z.string().optional(), state: z.string().optional() }) } },
      async (req, reply) => {
        const [state, next] = (req.cookies.fm_oauth ?? '').split('|');
        const fail = () => reply.redirect(`${config.APP_URL}/login?error=google`);
        if (!req.query.code || !state || state !== req.query.state) return fail();
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code: req.query.code,
            client_id: config.GOOGLE_CLIENT_ID!,
            client_secret: config.GOOGLE_CLIENT_SECRET!,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
          }),
        });
        if (!tokenRes.ok) return fail();
        const tokens = (await tokenRes.json()) as { access_token?: string };
        const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${tokens.access_token}` } });
        const info = (await infoRes.json()) as { email?: string; email_verified?: boolean; name?: string; picture?: string };
        if (!info.email || !info.email_verified) return fail();
        const { user, isNew } = await findOrCreateUser(info.email, { displayName: info.name });
        if (isNew && info.picture) await db.update(schema.users).set({ avatarUrl: info.picture }).where(eq(schema.users.id, user.id));
        if (isNew && (await userCount()) <= 10_000) await unlock(user.id, 'founder');
        await createSession(user.id, req, reply);
        reply.clearCookie('fm_oauth', { path: '/' });
        const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
        return reply.redirect(`${config.APP_URL}${safeNext}`);
      },
    );
  }
}
