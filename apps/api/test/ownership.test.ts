import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';
import WebSocket from 'ws';
import { db, pool, schema } from '../src/db/client.js';
import { closeRedis } from '../src/lib/redis.js';
import type { App } from '../src/app.js';
import { freeRect, getApp, login } from './helpers.js';

/**
 * H3: only the owner (or an admin) can add or change content on land; reserved company land is admin-only;
 * after a transfer the old owner loses access; every content change is in the audit log.
 */
let app: App;
let png: Buffer;
beforeAll(async () => {
  app = await getApp();
  png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#2DE2C4' } }).png().toBuffer();
});
afterAll(async () => {
  await app.close();
  await pool.end();
  await closeRedis();
});
const json = (res: { body: string }) => JSON.parse(res.body);
type H = Record<string, string>;
const multipart = (data: Buffer) => {
  const boundary = '----fmown' + Math.random().toString(36).slice(2);
  return { payload: Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`), data, Buffer.from(`\r\n--${boundary}--\r\n`)]), type: `multipart/form-data; boundary=${boundary}` };
};
const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

/** Every way to write plot content. Each returns the HTTP status. */
const WRITES: { name: string; run: (h: H, plotId: string) => Promise<number> }[] = [
  { name: 'title, text, links', run: (h, id) => app.inject({ method: 'PATCH', url: `/v1/plots/${id}`, headers: h, payload: { title: 'Changed', descriptionMd: 'New text', links: [{ label: 'Site', url: 'https://example.com' }] } }).then((r) => r.statusCode) },
  { name: 'colours and frame', run: (h, id) => app.inject({ method: 'PATCH', url: `/v1/plots/${id}`, headers: h, payload: { theme: { primary: '#112233', accent: '#445566' } } }).then((r) => r.statusCode) },
  { name: 'cover / gallery upload', run: (h, id) => { const m = multipart(png); return app.inject({ method: 'POST', url: `/v1/plots/${id}/media?use=gallery`, headers: { ...h, 'content-type': m.type }, payload: m.payload }).then((r) => r.statusCode); } },
  { name: 'custom HTML', run: (h, id) => app.inject({ method: 'PATCH', url: `/v1/plots/${id}`, headers: h, payload: { customHtml: '<h1>Hi</h1>' } }).then((r) => r.statusCode) },
  { name: 'custom HTML versions', run: (h, id) => app.inject({ url: `/v1/plots/${id}/custom-html/versions`, headers: h }).then((r) => r.statusCode) },
  { name: 'publish', run: (h, id) => app.inject({ method: 'POST', url: `/v1/plots/${id}/publish`, headers: h }).then((r) => r.statusCode) },
  { name: 'open house', run: (h, id) => app.inject({ method: 'POST', url: `/v1/plots/${id}/open-houses`, headers: h, payload: { title: 'Drop by', startsAt: inMinutes(60 + Math.floor(Math.random() * 50000)), minutes: 15 } }).then((r) => r.statusCode) },
  { name: 'AI designer', run: (h, id) => app.inject({ method: 'POST', url: '/v1/ai/design', headers: h, payload: { plotId: id, brief: 'a cosy reading corner' } }).then((r) => r.statusCode) },
  { name: 'Spotlight boost', run: (h, id) => app.inject({ method: 'POST', url: `/v1/plots/${id}/upgrade`, headers: h, payload: { kind: 'beacon' } }).then((r) => r.statusCode) },
];
const ok = (s: number) => s >= 200 && s < 300;

async function ownedPlot() {
  const owner = await login();
  await db.update(schema.users).set({ plan: 'plus' }).where(eq(schema.users.id, owner.user.id));
  const plot = json(await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: owner.headers, payload: { rect: freeRect() } })).plot;
  await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/publish`, headers: owner.headers });
  return { owner, plot: plot as { id: string; slug: string } };
}

describe('only owners can add content to their land (H3)', () => {
  for (const w of WRITES) {
    it(`${w.name}: owner yes; another user, a guest and the old owner after a transfer, no`, async () => {
      const { owner, plot } = await ownedPlot();
      const other = await login();
      expect(ok(await w.run(owner.headers, plot.id)), 'owner').toBe(true);
      const denied = await w.run(other.headers, plot.id);
      expect(denied, 'another user').toBe(403);
      expect(await w.run({}, plot.id), 'guest').toBe(401);
      // Transfer (marketplace sale, admin move): the new owner gets access, the old one loses it.
      await db.update(schema.plots).set({ ownerUserId: other.user.id }).where(eq(schema.plots.id, plot.id));
      await db.update(schema.users).set({ plan: 'plus' }).where(eq(schema.users.id, other.user.id));
      expect(await w.run(owner.headers, plot.id), 'old owner').toBe(403);
      expect(ok(await w.run(other.headers, plot.id)), 'new owner').toBe(true);
    });
  }

  it('the 403 says why, plainly', async () => {
    const { plot } = await ownedPlot();
    const other = await login();
    const res = await app.inject({ method: 'PATCH', url: `/v1/plots/${plot.id}`, headers: other.headers, payload: { title: 'Mine now' } });
    expect(json(res).error.message).toBe('Only the owner of this land can change it.');
  });

  it('reserved company land: nobody but an admin, until a claim completes', async () => {
    const { plot } = await ownedPlot();
    await db.update(schema.plots).set({ kind: 'showcase', status: 'showcase', ownerUserId: null, showcase: { brand: 'Reservedco', website: 'https://reservedco.example', sector: 'x', kind: 'company', city: 'x', useCase: 'x', highlights: [], imagePrompt: 'x', palette: ['#000000', '#111111', '#222222'], motif: 'star', approved: true } }).where(eq(schema.plots.id, plot.id));
    const user = await login();
    const admin = await login(undefined, 'admin');
    for (const w of WRITES.filter((x) => !['AI designer', 'Spotlight boost', 'open house', 'publish'].includes(x.name))) {
      const r = await w.run(user.headers, plot.id);
      expect(r, w.name).toBe(403);
    }
    const msg = json(await app.inject({ method: 'PATCH', url: `/v1/plots/${plot.id}`, headers: user.headers, payload: { title: 'Taken over' } })).error.message;
    expect(msg).toMatch(/reserved for Reservedco. Only FlatMeta admins can change it until the company completes its claim/);
    expect(ok(await WRITES[0]!.run(admin.headers, plot.id))).toBe(true);
    // Visitors can't sign a guestbook on land nobody owns.
    expect((await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/guestbook`, headers: user.headers, payload: { body: 'hello' } })).statusCode).toBe(403);
  });

  it('unpaid land, released land and land with no owner are not editable', async () => {
    const { owner, plot } = await ownedPlot();
    for (const status of ['pending_payment', 'released'] as const) {
      await db.update(schema.plots).set({ status }).where(eq(schema.plots.id, plot.id));
      expect((await WRITES[0]!.run(owner.headers, plot.id)), status).toBe(403);
    }
    await db.update(schema.plots).set({ status: 'active', ownerUserId: null }).where(eq(schema.plots.id, plot.id));
    expect(await WRITES[0]!.run(owner.headers, plot.id)).toBe(403);
  });

  it('organisation land: only people the organisation invited with an edit role', async () => {
    const { owner, plot } = await ownedPlot();
    const [org] = await db.insert(schema.organizations).values({ slug: `own-${Math.random().toString(36).slice(2, 8)}`, name: 'Own Org', kind: 'business', plan: 'business' }).returning();
    await db.insert(schema.orgMembers).values({ orgId: org!.id, userId: owner.user.id, role: 'owner' });
    const editor = await login();
    const viewer = await login();
    await db.insert(schema.orgMembers).values({ orgId: org!.id, userId: editor.user.id, role: 'editor' });
    await db.insert(schema.orgMembers).values({ orgId: org!.id, userId: viewer.user.id, role: 'viewer' });
    await db.update(schema.plots).set({ ownerOrgId: org!.id }).where(eq(schema.plots.id, plot.id));
    expect(ok(await WRITES[0]!.run(owner.headers, plot.id))).toBe(true);
    expect(ok(await WRITES[0]!.run(editor.headers, plot.id))).toBe(true);
    expect(await WRITES[0]!.run(viewer.headers, plot.id)).toBe(403);
    await db.delete(schema.orgMembers).where(and(eq(schema.orgMembers.orgId, org!.id), eq(schema.orgMembers.userId, editor.user.id)));
    expect(await WRITES[0]!.run(editor.headers, plot.id)).toBe(403); // removed from the organisation: access gone
  });

  it('MCP update_plot follows the same rule', async () => {
    const { plot } = await ownedPlot();
    const other = await login();
    const { secret } = json(await app.inject({ method: 'POST', url: '/v1/me/api-keys', headers: other.headers, payload: { name: 'agent' } }));
    const res = json(
      await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${secret}` },
        payload: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'update_plot', arguments: { id: plot.id, fields: { title: 'Hijacked' } } } },
      }),
    ).result;
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Only the owner of this land can change it/);
    expect((await db.select().from(schema.plots).where(eq(schema.plots.id, plot.id)))[0]!.title).not.toBe('Hijacked');
  });

  it('owners can close their guestbook', async () => {
    const { owner, plot } = await ownedPlot();
    const visitor = await login();
    expect((await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/guestbook`, headers: visitor.headers, payload: { body: 'Lovely place' } })).statusCode).toBe(200);
    await app.inject({ method: 'PATCH', url: `/v1/plots/${plot.id}`, headers: owner.headers, payload: { guestbookOpen: false } });
    const closed = await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/guestbook`, headers: visitor.headers, payload: { body: 'Hello again' } });
    expect(closed.statusCode).toBe(403);
    expect(json(closed).error.message).toBe('The owner has closed this guestbook.');
    expect(json(await app.inject({ url: `/v1/plots/${plot.id}` })).plot.guestbookOpen).toBe(false);
  });

  it('every content change is in the audit log: who, which plot, what', async () => {
    const { owner, plot } = await ownedPlot();
    await app.inject({ method: 'PATCH', url: `/v1/plots/${plot.id}`, headers: owner.headers, payload: { tagline: 'Fresh tagline', theme: { primary: '#000000', accent: '#ffffff' } } });
    const m = multipart(png);
    await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/media?use=cover`, headers: { ...owner.headers, 'content-type': m.type }, payload: m.payload });
    const rows = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.targetType, 'plot'), eq(schema.auditLog.targetId, plot.id)));
    const edit = rows.find((r) => r.action === 'plot.edit' && (r.meta as { fields: string[] }).fields.includes('tagline'));
    expect(edit?.actorId).toBe(owner.user.id);
    expect((edit!.meta as { fields: string[] }).fields).toEqual(expect.arrayContaining(['tagline', 'theme']));
    expect(rows.some((r) => r.action === 'plot.upload' && r.actorId === owner.user.id)).toBe(true);
    expect(rows.some((r) => r.action === 'plot.publish')).toBe(true);
  });

  it('walk mode: visitors can move, chat and emote, and nothing else (no message places anything on land)', async () => {
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { plot } = await ownedPlot();
    const visitor = await login();
    const before = (await db.select().from(schema.plots).where(eq(schema.plots.id, plot.id)))[0]!;
    const ws = new WebSocket(`ws://127.0.0.1:${(app.server.address() as { port: number }).port}/v1/live`, { headers: { cookie: visitor.cookie } });
    const inbox: { type: string }[] = [];
    ws.on('message', (d) => inbox.push(JSON.parse(d.toString())));
    await new Promise((r) => ws.once('open', r));
    for (const t of ['place', 'build', 'upload', 'edit_plot', 'set_cover', 'custom_html']) ws.send(JSON.stringify({ type: t, plotId: plot.id, title: 'Graffiti', url: 'https://evil.example/x.png' }));
    ws.send(JSON.stringify({ type: 'ping' }));
    await new Promise((r) => setTimeout(r, 400));
    expect(inbox.some((m) => m.type === 'pong')).toBe(true); // still connected; the others were ignored
    const after = (await db.select().from(schema.plots).where(eq(schema.plots.id, plot.id)))[0]!;
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(after.title).toBe(before.title);
    ws.close();
  });
});
