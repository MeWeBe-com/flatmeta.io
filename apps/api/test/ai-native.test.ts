import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, pool, schema } from '../src/db/client.js';
import { closeRedis } from '../src/lib/redis.js';
import { fallbackAnswer } from '../src/routes/ask.js';
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

async function mcp(secret: string, method: string, params: object = {}) {
  const res = await app.inject({
    method: 'POST',
    url: '/mcp',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${secret}` },
    payload: { jsonrpc: '2.0', id: 1, method, params },
  });
  return json(res).result;
}
const toolJson = (r: { content: { text: string }[] }) => JSON.parse(r.content[0]!.text);

describe('Ask FlatMeta (G14)', () => {
  it('answers from FlatMeta’s own results, without AI when no key is set', async () => {
    const owner = await login();
    const tag = `Zephyrine${Math.random().toString(36).slice(2, 7)}`;
    const plot = json(await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: owner.headers, payload: { rect: freeRect(), title: `${tag} Tea House` } })).plot;
    await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/publish`, headers: owner.headers });
    const r = json(await app.inject({ url: `/v1/ask?q=${tag}` }));
    expect(r.provider).toBe('search');
    expect(r.answer).toContain(`${tag} Tea House`);
    expect(r.plots[0].slug).toBe(plot.slug);
    expect((await app.inject({ url: '/v1/ask?q=a' })).statusCode).toBe(400);
    expect(fallbackAnswer('unicorn bakery', { plots: [], places: [] })).toMatch(/Nothing on FlatMeta matches/);
    expect(fallbackAnswer('x', { plots: [], places: [{ name: 'Lisbon', label: 'Lisbon', lat: 0, lng: 0, countryCode: 'PT', type: 'city' }] })).toMatch(/near Lisbon.*claim free land/);
  });
});

describe('MCP for agents (G14)', () => {
  it('lists the discovery tools and finds places near a point', async () => {
    const u = await login();
    const { secret } = json(await app.inject({ method: 'POST', url: '/v1/me/api-keys', headers: u.headers, payload: { name: 'agent' } }));
    const tools = (await mcp(secret, 'tools/list')).tools.map((t: { name: string }) => t.name);
    expect(tools).toEqual(expect.arrayContaining(['ask_flatmeta', 'find_nearby', 'list_companies', 'list_open_houses', 'search_plots', 'claim_plot']));
    const owner = await login();
    const plot = json(await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: owner.headers, payload: { rect: freeRect(), title: 'Agent test plot' } })).plot;
    await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/publish`, headers: owner.headers });
    const near = toolJson(await mcp(secret, 'tools/call', { name: 'find_nearby', arguments: { lat: plot.center.lat, lng: plot.center.lng, limit: 3 } }));
    expect(near[0]).toMatchObject({ slug: plot.slug });
    expect(near[0].distanceKm).toBeLessThan(0.5);
    const ask = toolJson(await mcp(secret, 'tools/call', { name: 'ask_flatmeta', arguments: { question: 'Agent test plot' } }));
    expect(ask.answer).toContain('Agent test plot');
  });

  it('claim_plot uses the same free-land rules as the website: Homestead, then bonus squares', async () => {
    const u = await login();
    const { secret } = json(await app.inject({ method: 'POST', url: '/v1/me/api-keys', headers: u.headers, payload: { name: 'agent' } }));
    // Free coordinates: the centre of a free 1×1 rect, from the API's own quote.
    const rect = freeRect(1, 1);
    const { quote } = json(await app.inject({ method: 'POST', url: '/v1/plots/quote', headers: u.headers, payload: rect }));
    const first = toolJson(await mcp(secret, 'tools/call', { name: 'claim_plot', arguments: { lat: quote.center.lat, lng: quote.center.lng, width: 1, height: 1, title: 'Agent homestead' } }));
    expect(first).toMatchObject({ ok: true, free: true });
    await db.update(schema.users).set({ bonusCells: 4 }).where(eq(schema.users.id, u.user.id));
    const rect2 = freeRect(1, 1);
    const { quote: q2 } = json(await app.inject({ method: 'POST', url: '/v1/plots/quote', headers: u.headers, payload: rect2 }));
    const second = toolJson(await mcp(secret, 'tools/call', { name: 'claim_plot', arguments: { lat: q2.center.lat, lng: q2.center.lng, width: 1, height: 1, title: 'Agent bonus plot' } }));
    expect(second).toMatchObject({ ok: true, free: true });
    expect((await db.select().from(schema.users).where(eq(schema.users.id, u.user.id)))[0]!.bonusCellsUsed).toBe(1);
  });
});
