import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { eq } from 'drizzle-orm';
import { db, pool, schema } from '../src/db/client.js';
import { closeRedis } from '../src/lib/redis.js';
import { HOME_PLAZA, resolveStart } from '../src/lib/start-location.js';
import type { App } from '../src/app.js';
import { getApp, login } from './helpers.js';

const centres: Record<string, { lat: number; lng: number }> = { FR: { lat: 46, lng: 2 } };
const countryCentre = (c: string) => centres[c] ?? null;
const CF = { 'cf-iplatitude': '48.8566', 'cf-iplongitude': '2.3522', 'cf-ipcity': 'Paris', 'cf-ipcountry': 'FR' };

describe('start location fallback order (unit)', () => {
  it('1. a saved position wins over everything', async () => {
    const r = await resolveStart({ saved: { lat: 40.4, lng: -3.7 }, headers: CF, countryCentre });
    expect(r).toMatchObject({ source: 'saved', lat: 40.4, lng: -3.7, approximate: false, zoom: 16 });
  });
  it('2. then Cloudflare IP coordinates, at City zoom, with the city name decoded', async () => {
    const r = await resolveStart({ saved: { lat: null, lng: null }, headers: { ...CF, 'cf-ipcity': 'S%C3%A3o%20Paulo' }, countryCentre });
    expect(r).toMatchObject({ source: 'ip', lat: 48.8566, lng: 2.3522, zoom: 12, approximate: true, city: 'São Paulo', country: 'FR' });
  });
  it('3. then the country centre', async () => {
    const r = await resolveStart({ headers: { 'cf-ipcountry': 'fr' }, countryCentre });
    expect(r).toMatchObject({ source: 'country', lat: 46, lng: 2, zoom: 7, country: 'FR' });
  });
  it('4. then the Home plaza, never a random point', async () => {
    for (const headers of [{}, { 'cf-ipcountry': 'XX' }, { 'cf-ipcountry': 'T1' }, { 'cf-ipcountry': 'ZZ' }, { 'cf-iplatitude': '0', 'cf-iplongitude': '0' }, { 'cf-iplatitude': 'abc', 'cf-iplongitude': '2' }, { 'cf-iplatitude': '95', 'cf-iplongitude': '2' }]) {
      const r = await resolveStart({ headers, countryCentre });
      expect(r, JSON.stringify(headers)).toMatchObject({ source: 'home', lat: HOME_PLAZA.lat, lng: HOME_PLAZA.lng, approximate: true });
    }
  });
});

let app: App;
let base = '';
beforeAll(async () => {
  app = await getApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  base = `ws://127.0.0.1:${(app.server.address() as { port: number }).port}/v1/live`;
});
afterAll(async () => {
  await app.close();
  await pool.end();
  await closeRedis();
});
const json = (res: { body: string }) => JSON.parse(res.body);

describe('GET /v1/me/approx-location', () => {
  it('uses Cloudflare headers for guests, falls back without them, and stores nothing', async () => {
    const r = await app.inject({ url: '/v1/me/approx-location', headers: CF });
    expect(r.headers['cache-control']).toBe('private, no-store');
    expect(json(r)).toMatchObject({ source: 'ip', lat: 48.8566, lng: 2.3522, city: 'Paris' });
    expect(json(await app.inject({ url: '/v1/me/approx-location', headers: { 'cf-ipcountry': 'GB' } }))).toMatchObject({ source: 'country', lat: 54, lng: -2 });
    expect(json(await app.inject({ url: '/v1/me/approx-location' }))).toMatchObject({ source: 'home' });
  });

  it('remembers where a signed-in player walked and starts them there next time', async () => {
    const u = await login();
    expect(json(await app.inject({ url: '/v1/me/approx-location', headers: { ...u.headers, ...CF } })).source).toBe('ip');
    const ws = new WebSocket(base, { headers: { cookie: u.cookie } });
    await new Promise((r) => ws.once('open', r));
    await new Promise((r) => setTimeout(r, 200));
    ws.send(JSON.stringify({ type: 'move', lat: 41.3874, lng: 2.1686 }));
    await new Promise((r) => setTimeout(r, 300));
    ws.close(); // the last position is saved when the socket closes, if not already
    let row: { lat: number | null } | undefined;
    for (let i = 0; i < 30 && !row?.lat; i++) {
      await new Promise((r) => setTimeout(r, 100));
      [row] = await db.select({ lat: schema.users.lastLat }).from(schema.users).where(eq(schema.users.id, u.user.id));
    }
    const r = json(await app.inject({ url: '/v1/me/approx-location', headers: { ...u.headers, ...CF } }));
    expect(r).toMatchObject({ source: 'saved', lat: 41.3874, lng: 2.1686, approximate: false });
  });

  it('never saves a guest position', async () => {
    const before = await db.select({ n: schema.users.id }).from(schema.users).where(eq(schema.users.lastLat, -12.3456));
    const ws = new WebSocket(base);
    await new Promise((r) => ws.once('open', r));
    ws.send(JSON.stringify({ type: 'move', lat: -12.3456, lng: 45.6789 }));
    await new Promise((r) => setTimeout(r, 300));
    ws.close();
    await new Promise((r) => setTimeout(r, 300));
    const after = await db.select({ n: schema.users.id }).from(schema.users).where(eq(schema.users.lastLat, -12.3456));
    expect(after.length).toBe(before.length);
  });
});
