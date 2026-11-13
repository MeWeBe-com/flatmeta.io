import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, pool, schema } from '../src/db/client.js';
import { outbox } from '../src/lib/mail.js';
import { closeRedis } from '../src/lib/redis.js';
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

describe('health and docs', () => {
  it('serves health and the OpenAPI document', async () => {
    expect((await app.inject('/healthz')).statusCode).toBe(200);
    const spec = json(await app.inject('/openapi.json'));
    expect(spec.openapi).toBe('3.1.0');
    expect(Object.keys(spec.paths)).toContain('/v1/plots/claim');
  });

  it('lists public URLs for the sitemap', async () => {
    const res = await app.inject('/v1/sitemap');
    expect(res.statusCode).toBe(200);
    const body = json(res);
    expect(Array.isArray(body.plots)).toBe(true);
    expect(Array.isArray(body.regions)).toBe(true);
    // S1: company (showcase) plots are flagged so the web app lists them in sitemap-companies.xml.
    for (const p of body.plots as { company: unknown }[]) expect(typeof p.company).toBe('boolean');
  });
});

describe('auth', () => {
  it('signs in with an emailed code and rejects wrong codes', async () => {
    const email = 'codeflow@test.dev';
    const req = json(await app.inject({ method: 'POST', url: '/v1/auth/request-code', payload: { email } }));
    expect(req.devCode).toMatch(/^\d{6}$/);
    expect(outbox.at(-1)?.to).toBe(email);
    const wrong = await app.inject({ method: 'POST', url: '/v1/auth/verify-code', payload: { email, code: req.devCode === '000000' ? '111111' : '000000' } });
    expect(wrong.statusCode).toBe(400);
    const ok = await app.inject({ method: 'POST', url: '/v1/auth/verify-code', payload: { email, code: req.devCode } });
    expect(ok.statusCode).toBe(200);
    expect(json(ok).isNew).toBe(true);
    const cookie = ok.cookies.find((c) => c.name === 'fm_session');
    expect(cookie?.httpOnly).toBe(true);
    const me = json(await app.inject({ url: '/v1/me', headers: { cookie: `fm_session=${cookie!.value}` } }));
    expect(me.user.email).toBe(email);
    // A used code can't be reused.
    const again = await app.inject({ method: 'POST', url: '/v1/auth/verify-code', payload: { email, code: req.devCode } });
    expect(again.statusCode).toBe(400);
  });
});

describe('claiming land', () => {
  it('quotes and claims a free Homestead, with game rewards', async () => {
    const { headers } = await login();
    const rect = freeRect();
    const q = json(await app.inject({ method: 'POST', url: '/v1/plots/quote', headers, payload: rect })).quote;
    expect(q.free).toBe(true);
    expect(q.available).toBe(true);
    const res = await app.inject({ method: 'POST', url: '/v1/plots/claim', headers, payload: { rect, title: 'My test plot' } });
    expect(res.statusCode).toBe(200);
    const body = json(res);
    expect(body.plot.kind).toBe('homestead');
    expect(body.plot.coverImageUrl).toBeTruthy();
    expect(body.game.xp).toBeGreaterThanOrEqual(100);
    expect(body.game.achievements.map((a: { key: string }) => a.key)).toContain('first-flag');
    // Second free claim is not allowed.
    const second = json(await app.inject({ method: 'POST', url: '/v1/plots/quote', headers, payload: freeRect() })).quote;
    expect(second.free).toBe(false);
  });

  it('never sells the same cell twice, even under concurrency', async () => {
    const rect = freeRect();
    const a = await login();
    const b = await login();
    const [ra, rb] = await Promise.all([
      app.inject({ method: 'POST', url: '/v1/plots/claim', headers: a.headers, payload: { rect } }),
      app.inject({ method: 'POST', url: '/v1/plots/claim', headers: b.headers, payload: { rect } }),
    ]);
    const codes = [ra.statusCode, rb.statusCode].sort();
    expect(codes[0]).toBe(200);
    expect(codes[1]).toBeGreaterThanOrEqual(400);
    const overlap = await app.inject({ method: 'POST', url: '/v1/plots/quote', headers: a.headers, payload: { ...rect, maxGx: rect.maxGx + 1 } });
    expect(json(overlap).quote.conflicts.length).toBe(1);
  });

  it('holds paid land until the (mock) payment completes', async () => {
    const { headers, user } = await login();
    await db.update(schema.users).set({ homesteadUsed: true }).where(eq(schema.users.id, user.id));
    const rect = freeRect(3, 3);
    const res = json(await app.inject({ method: 'POST', url: '/v1/plots/claim', headers, payload: { rect, title: 'Paid plot' } }));
    expect(res.checkoutUrl).toContain('/checkout/mock');
    const [pending] = await db.select().from(schema.plots).where(eq(schema.plots.id, res.plotId));
    expect(pending!.status).toBe('pending_payment');
    const session = new URL(res.checkoutUrl).searchParams.get('session');
    const done = await app.inject({ method: 'POST', url: '/v1/billing/mock/complete', headers, payload: { session } });
    expect(json(done).status).toBe('paid');
    const [active] = await db.select().from(schema.plots).where(eq(schema.plots.id, res.plotId));
    expect(active!.status).toBe('active');
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, res.orderId));
    expect(order!.status).toBe('paid');
    expect(order!.amountCents).toBe(9 * 100); // ocean tier
  });
});

describe('editing and permissions', () => {
  it('lets owners edit and publish, and blocks everyone else', async () => {
    const owner = await login();
    const other = await login();
    const plot = json(await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: owner.headers, payload: { rect: freeRect() } })).plot;
    const patch = { title: 'Sunny Corner', tagline: 'Hello world', links: [{ label: 'Site', url: 'example.com' }, { label: 'Bad', url: 'javascript:alert(1)' }] };
    const denied = await app.inject({ method: 'PATCH', url: `/v1/plots/${plot.id}`, headers: other.headers, payload: patch });
    expect(denied.statusCode).toBe(403);
    const ok = json(await app.inject({ method: 'PATCH', url: `/v1/plots/${plot.id}`, headers: owner.headers, payload: patch }));
    expect(ok.plot.title).toBe('Sunny Corner');
    expect(ok.plot.links).toEqual([{ label: 'Site', url: 'https://example.com/' }]);
    const pub = json(await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/publish`, headers: owner.headers }));
    expect(pub.plot.published).toBe(true);
    const listed = json(await app.inject({ url: '/v1/plots?q=Sunny' }));
    expect(listed.plots.some((p: { id: string }) => p.id === plot.id)).toBe(true);
  });

  it('refuses publishing content the moderator flags', async () => {
    const owner = await login();
    const plot = json(await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: owner.headers, payload: { rect: freeRect() } })).plot;
    await app.inject({ method: 'PATCH', url: `/v1/plots/${plot.id}`, headers: owner.headers, payload: { tagline: 'double your bitcoin now' } });
    const res = await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/publish`, headers: owner.headers });
    expect(res.statusCode).toBe(400);
    const flags = await db.select().from(schema.moderationFlags).where(eq(schema.moderationFlags.targetId, plot.id));
    expect(flags.length).toBeGreaterThan(0);
  });
});

describe('social and game', () => {
  it('awards like XP once and notifies the owner', async () => {
    const owner = await login();
    const fan = await login();
    const plot = json(await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: owner.headers, payload: { rect: freeRect() } })).plot;
    const first = json(await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/like`, headers: fan.headers }));
    expect(first.likesCount).toBe(1);
    expect(first.game.xp).toBe(2);
    await app.inject({ method: 'DELETE', url: `/v1/plots/${plot.id}/like`, headers: fan.headers });
    const again = json(await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/like`, headers: fan.headers }));
    expect(again.game.xp).toBe(0); // same plot, same day: no extra XP
    const notes = json(await app.inject({ url: '/v1/me/notifications', headers: owner.headers }));
    expect(notes.notifications.some((n: { kind: string }) => n.kind === 'like')).toBe(true);
  });

  it('tracks quests and pays rewards on claim', async () => {
    const { headers } = await login();
    await app.inject({ method: 'POST', url: '/v1/me/tour', headers });
    const progress = json(await app.inject({ url: '/v1/me/progress', headers }));
    const tour = progress.quests.find((q: { key: string }) => q.key === 'take-tour');
    expect(tour.completed).toBe(true);
    const before = progress.xp;
    const claimed = json(await app.inject({ method: 'POST', url: `/v1/me/quests/${tour.id}/claim`, headers }));
    expect(claimed.game.xp).toBe(25);
    const twice = await app.inject({ method: 'POST', url: `/v1/me/quests/${tour.id}/claim`, headers });
    expect(twice.statusCode).toBe(400);
    const after = json(await app.inject({ url: '/v1/me/progress', headers }));
    expect(after.xp).toBe(before + 25);
  });

  it('checks in once a day', async () => {
    const { headers } = await login();
    const a = json(await app.inject({ method: 'POST', url: '/v1/me/checkin', headers }));
    expect(a.checkedIn).toBe(true);
    expect(a.streak).toBe(1);
    const b = json(await app.inject({ method: 'POST', url: '/v1/me/checkin', headers }));
    expect(b.checkedIn).toBe(false);
  });

  it('serves leaderboards', async () => {
    const res = json(await app.inject('/v1/leaderboards/xp'));
    expect(res.rows.length).toBeGreaterThan(0);
    expect(res.rows[0].rank).toBe(1);
  });
});

describe('AI designer (heuristic provider)', () => {
  it('produces 3 variations with images and applies one', async () => {
    const { headers } = await login();
    const plot = json(await app.inject({ method: 'POST', url: '/v1/plots/claim', headers, payload: { rect: freeRect() } })).plot;
    const { jobId } = json(await app.inject({ method: 'POST', url: '/v1/ai/design', headers, payload: { plotId: plot.id, brief: 'A tiny coffee bar for cyclists' } }));
    let job;
    for (let i = 0; i < 40; i++) {
      job = json(await app.inject({ url: `/v1/ai/jobs/${jobId}`, headers })).job;
      if (job.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(job.status).toBe('done');
    expect(job.output.variations).toHaveLength(3);
    expect(job.output.variations[0].image.url).toContain('/media/');
    const applied = json(await app.inject({ method: 'POST', url: `/v1/ai/jobs/${jobId}/apply`, headers, payload: { index: 0 } }));
    expect(applied.plot.category).toBe('food & drink');
  });
});

describe('API keys and MCP', () => {
  it('authenticates with an API key and lists MCP tools', async () => {
    const { headers } = await login();
    const created = json(await app.inject({ method: 'POST', url: '/v1/me/api-keys', headers, payload: { name: 'agent' } }));
    expect(created.secret).toMatch(/^fm_live_/);
    const me = json(await app.inject({ url: '/v1/me/plots', headers: { authorization: `Bearer ${created.secret}` } }));
    expect(Array.isArray(me.plots)).toBe(true);
    const mcp = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${created.secret}` },
      payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });
    const tools = json(mcp).result.tools.map((t: { name: string }) => t.name);
    expect(tools).toEqual(expect.arrayContaining(['search_plots', 'get_plot', 'check_availability', 'claim_plot', 'update_plot']));
  });
});

describe('admin', () => {
  it('is staff-only and updates pricing', async () => {
    const user = await login();
    expect((await app.inject({ url: '/v1/admin/stats', headers: user.headers })).statusCode).toBe(403);
    const admin = await login(undefined, 'admin');
    const stats = json(await app.inject({ url: '/v1/admin/stats', headers: admin.headers }));
    expect(stats.plots.active).toBeGreaterThan(0);
    const put = await app.inject({ method: 'PUT', url: '/v1/admin/pricing', headers: admin.headers, payload: { tiers: [{ tier: 'C', priceCents: 250 }] } });
    expect(put.statusCode).toBe(200);
    const plans = json(await app.inject('/v1/billing/plans'));
    expect(plans.tiers.find((t: { tier: string }) => t.tier === 'C').priceCents).toBe(250);
    await app.inject({ method: 'PUT', url: '/v1/admin/pricing', headers: admin.headers, payload: { tiers: [{ tier: 'C', priceCents: 200 }] } });
  });
});
