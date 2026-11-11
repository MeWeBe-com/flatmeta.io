import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, pool, schema } from '../src/db/client.js';
import { closeRedis } from '../src/lib/redis.js';
import { outbox } from '../src/lib/mail.js';
import { sendWeeklyDigests, unsubscribeToken } from '../src/services/weekly-digest.js';
import type { App } from '../src/app.js';
import { freeRect, getApp, login } from './helpers.js';

let app: App;
beforeAll(async () => {
  app = await getApp();
});
afterAll(async () => {
  await app.close();
  await pool.end();
  await closeRedis();
});
const json = (res: { body: string }) => JSON.parse(res.body);

async function signUp(ref?: string) {
  const email = `ref-${Math.random().toString(36).slice(2, 10)}@test.dev`;
  const { devCode } = json(await app.inject({ method: 'POST', url: '/v1/auth/request-code', payload: { email } }));
  const res = await app.inject({ method: 'POST', url: '/v1/auth/verify-code', payload: { email, code: devCode, ...(ref ? { ref } : {}) } });
  const cookie = String(res.headers['set-cookie']).split(';')[0]!;
  return { user: json(res).user as { id: string; username: string }, headers: { cookie } };
}
const bonusOf = async (id: string) => (await db.select().from(schema.users).where(eq(schema.users.id, id)))[0]!;

describe('referrals (G11)', () => {
  it('gives both people bonus squares when the invited friend claims their first land, once', async () => {
    const referrer = await login();
    expect((await app.inject({ url: '/v1/me/referral' })).statusCode).toBe(401);
    const mine = json(await app.inject({ url: '/v1/me/referral', headers: referrer.headers }));
    expect(mine.code).toMatch(/^[a-z0-9]{8}$/);
    expect(mine.link).toMatch(new RegExp(`/\\?ref=${mine.code}$`));
    expect(json(await app.inject({ url: '/v1/me/referral', headers: referrer.headers })).code).toBe(mine.code); // stable

    const friend = await signUp(mine.code);
    expect((await bonusOf(friend.user.id)).referredBy).toBe(referrer.user.id);
    expect((await bonusOf(friend.user.id)).bonusCells).toBe(0); // nothing until they claim
    await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: friend.headers, payload: { rect: freeRect() } });
    expect((await bonusOf(friend.user.id)).bonusCells).toBe(10);
    expect((await bonusOf(referrer.user.id)).bonusCells).toBe(10);
    const notes = await db.select().from(schema.notifications).where(and(eq(schema.notifications.userId, referrer.user.id), eq(schema.notifications.kind, 'referral_bonus')));
    expect(notes).toHaveLength(1);
    // A second claim doesn't reward again; the stats count the friend.
    await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: friend.headers, payload: { rect: freeRect(1, 1) } });
    expect((await bonusOf(referrer.user.id)).bonusCells).toBe(10);
    expect(json(await app.inject({ url: '/v1/me/referral', headers: referrer.headers }))).toMatchObject({ invited: 1, claimed: 1, bonusCells: 10 });
  });

  it('refuses self-referral, unknown codes, a second referrer and accounts older than a day', async () => {
    const a = await signUp();
    const code = json(await app.inject({ url: '/v1/me/referral', headers: a.headers })).code;
    expect((await app.inject({ method: 'POST', url: '/v1/me/referrer', headers: a.headers, payload: { code } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/v1/me/referrer', headers: a.headers, payload: { code: 'zzzzzzzz' } })).statusCode).toBe(400);
    const b = await signUp();
    expect((await app.inject({ method: 'POST', url: '/v1/me/referrer', headers: b.headers, payload: { code } })).statusCode).toBe(200);
    const c = await login();
    const other = json(await app.inject({ url: '/v1/me/referral', headers: c.headers })).code;
    expect((await app.inject({ method: 'POST', url: '/v1/me/referrer', headers: b.headers, payload: { code: other } })).statusCode).toBe(400); // already set
    const old = await signUp();
    await db.update(schema.users).set({ createdAt: new Date(Date.now() - 3 * 86400_000) }).where(eq(schema.users.id, old.user.id));
    expect((await app.inject({ method: 'POST', url: '/v1/me/referrer', headers: old.headers, payload: { code } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/v1/me/referrer', payload: { code } })).statusCode).toBe(401);
  });

  it('bonus squares pay for a claim that fits in them, and are spent', async () => {
    const u = await login();
    await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: u.headers, payload: { rect: freeRect() } }); // homestead
    await db.update(schema.users).set({ bonusCells: 6 }).where(eq(schema.users.id, u.user.id));
    const { config } = await import('../src/config.js');
    if (config.PAID_CHECKOUT_ENABLED === 'false') return; // only meaningful while paid land is on
    const ok = json(await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: u.headers, payload: { rect: freeRect(2, 2) } }));
    expect(ok.plot?.status).toBe('active');
    expect((await bonusOf(u.user.id)).bonusCellsUsed).toBe(4);
    const paid = json(await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: u.headers, payload: { rect: freeRect(2, 2) } }));
    expect(paid.checkoutUrl).toBeTruthy(); // only 2 left: this one needs paying
  });
});

describe('weekly owner email (G11)', () => {
  it('sends once a week to owners of published land, with one-click unsubscribe that works', async () => {
    const owner = await login();
    const plot = json(await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: owner.headers, payload: { rect: freeRect() } })).plot;
    await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/publish`, headers: owner.headers });
    const before = outbox.length;
    expect((await sendWeeklyDigests({ userIds: [owner.user.id] })).sent).toBe(1);
    const mail = outbox.slice(before).find((m) => m.type === 'weekly_digest');
    expect(mail?.to).toBe(owner.user.email);
    expect(mail?.text).toContain(plot.title);
    const unsub = mail!.headers!['List-Unsubscribe']!.slice(1, -1);
    expect(mail!.headers!['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect((await sendWeeklyDigests({ userIds: [owner.user.id] })).sent).toBe(0); // not twice in a week

    const u = new URL(unsub);
    expect(u.searchParams.get('t')).toBe(unsubscribeToken(owner.user.id));
    expect((await app.inject({ url: `/v1/email/unsubscribe?u=${owner.user.id}&t=${'0'.repeat(32)}` })).statusCode).toBe(400);
    const other = await login();
    expect((await app.inject({ url: `/v1/email/unsubscribe?u=${other.user.id}&t=${u.searchParams.get('t')}` })).statusCode).toBe(400); // token is per user
    expect((await app.inject({ method: 'POST', url: `/v1/email/unsubscribe${u.search}` })).statusCode).toBe(200);
    expect((await bonusOf(owner.user.id)).weeklyEmail).toBe(false);
    const nextWeek = new Date(Date.now() + 8 * 86400_000);
    expect((await sendWeeklyDigests({ userIds: [owner.user.id], now: nextWeek })).sent).toBe(0);
    // Settings can turn it back on.
    expect(json(await app.inject({ method: 'PATCH', url: '/v1/me', headers: owner.headers, payload: { weeklyEmail: true } })).user.weeklyEmail).toBe(true);
    expect((await sendWeeklyDigests({ userIds: [owner.user.id], now: nextWeek })).sent).toBe(1);
  });
});
