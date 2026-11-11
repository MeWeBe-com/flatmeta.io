import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from '../app.js';
import { config } from '../config.js';
import { db, schema } from '../db/client.js';
import { requireUser } from '../lib/auth.js';
import { badRequest } from '../lib/errors.js';
import { attachReferrer, ensureReferralCode, referralStats } from '../services/referrals.js';
import { unsubscribeWeekly, verifyUnsubscribe } from '../services/weekly-digest.js';

/** G11 growth loop: referral link and stats, late referral (Google sign-up), weekly email unsubscribe. */
export default async function growthRoutes(app: App) {
  app.get('/v1/me/referral', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } }, schema: { tags: ['me'], summary: 'My invite link and what it has earned' } }, async (req) => {
    const user = requireUser(req);
    const code = await ensureReferralCode(user.id);
    return { code, link: `${config.APP_URL}/?ref=${code}`, bonusPerFriend: config.REFERRAL_BONUS_CELLS, ...(await referralStats(user.id)) };
  });

  app.post(
    '/v1/me/referrer',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } }, schema: { tags: ['me'], summary: 'Record who invited me (new accounts only, once)', body: z.object({ code: z.string().min(4).max(16) }) } },
    async (req) => {
      const user = requireUser(req);
      const [fresh] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
      const ok = await attachReferrer(fresh!, req.body.code);
      if (!ok) throw badRequest('That invite code can’t be used for this account.');
      return { ok: true };
    },
  );

  // One-click unsubscribe (RFC 8058): mail clients POST, people click the GET link. Signed per user, no session.
  const query = z.object({ u: z.uuid(), t: z.string().regex(/^[a-f0-9]{32}$/) });
  const handle = async (q: { u: string; t: string }) => {
    if (!verifyUnsubscribe(q.u, q.t)) throw badRequest('This unsubscribe link is not valid.');
    await unsubscribeWeekly(q.u);
  };
  app.get('/v1/email/unsubscribe', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { hide: true, querystring: query } }, async (req, reply) => {
    await handle(req.query);
    return reply
      .header('content-type', 'text/html; charset=utf-8')
      .header('cache-control', 'no-store')
      .send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed</title><body style="font-family:system-ui;background:#0B1020;color:#E8ECF8;display:grid;place-items:center;min-height:90vh"><div style="max-width:420px;text-align:center"><h1 style="color:#2DE2C4">You’re unsubscribed</h1><p>You won’t get the weekly ${config.APP_NAME} email any more. You can turn it back on in Settings.</p><p><a style="color:#2DE2C4" href="${config.APP_URL}/dashboard/settings">Settings</a></p></div></body>`);
  });
  app.post('/v1/email/unsubscribe', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { hide: true, querystring: query } }, async (req) => {
    await handle(req.query);
    return { ok: true };
  });
}
