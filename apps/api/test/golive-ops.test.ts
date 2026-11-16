import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../src/db/client.js';
import { closeRedis } from '../src/lib/redis.js';
import { config } from '../src/config.js';
import { reportError, scrub, setErrorReportFetchForTests } from '../src/lib/error-report.js';
import type { App } from '../src/app.js';
import { getApp } from './helpers.js';

/** GL6: the uptime check URL and the error-tracking hook. */
let app: App;
beforeAll(async () => {
  app = await getApp();
});
afterAll(async () => {
  config.ERROR_WEBHOOK_URL = undefined;
  setErrorReportFetchForTests(null);
  await app.close();
  await pool.end();
  await closeRedis();
});

describe('health (GL6)', () => {
  it('/v1/health answers 200 with database and Redis round trips, the release and uptime, never cached', async () => {
    const res = await app.inject({ url: '/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = JSON.parse(res.body);
    expect(body).toMatchObject({ ok: true, env: config.APP_ENV, database: { ok: true }, redis: { ok: true } });
    expect(typeof body.release).toBe('string');
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});

describe('error reports (GL6)', () => {
  it('scrubs emails, keys and long tokens before anything leaves the server', () => {
    expect(scrub('boom for ann@example.com with sk_live_abcdefghijklmnop and ' + 'x'.repeat(40))).toBe('boom for <email> with <secret> and <token>');
    expect(scrub('word '.repeat(100))).toHaveLength(300);
  });

  it('sends to the webhook, once per error per 10 minutes, at most 20 a minute; nothing without a webhook', async () => {
    const sent: string[] = [];
    setErrorReportFetchForTests((async (_url: string | URL | Request, init?: RequestInit) => {
      sent.push(JSON.parse(String(init!.body)).text);
      return new Response('ok');
    }) as typeof fetch);
    config.ERROR_WEBHOOK_URL = undefined;
    expect(await reportError({ source: 'api', where: 'GET /x', name: 'Error', message: 'off' })).toBe(false);
    config.ERROR_WEBHOOK_URL = 'https://hooks.example.test/T0/B0/x';
    expect(await reportError({ source: 'api', where: 'GET /v1/plots/:id', name: 'TypeError', message: 'cannot read x of undefined for bob@example.com' })).toBe(true);
    expect(sent[0]).toMatch(/^\[FlatMeta \w+ [\w-]+\] api error at GET \/v1\/plots\/:id: TypeError: cannot read x of undefined for <email>$/);
    expect(await reportError({ source: 'api', where: 'GET /v1/plots/:id', name: 'TypeError', message: 'cannot read x of undefined for bob@example.com' })).toBe(false); // same error again
    for (let i = 0; i < 30; i++) await reportError({ source: 'api', where: `GET /n/${i}`, name: 'Error', message: `e${i}` });
    expect(sent.length).toBe(20); // the minute's budget
  });

  it('the web app reports browser errors through /v1/client-errors (rate-limited, 204)', async () => {
    const sent: string[] = [];
    setErrorReportFetchForTests((async (_u: string | URL | Request, init?: RequestInit) => {
      sent.push(JSON.parse(String(init!.body)).text);
      return new Response('ok');
    }) as typeof fetch);
    config.ERROR_WEBHOOK_URL = 'https://hooks.example.test/T0/B0/x';
    const res = await app.inject({ method: 'POST', url: '/v1/client-errors', payload: { where: 'page /pricing', name: 'TypeError', message: 'x is undefined', digest: 'abc123' } });
    expect(res.statusCode).toBe(204);
    await new Promise((r) => setTimeout(r, 20));
    expect(sent.at(-1)).toMatch(/web error at page \/pricing: TypeError: x is undefined \(digest abc123\)/);
    expect((await app.inject({ method: 'POST', url: '/v1/client-errors', payload: { where: 'x' } })).statusCode).toBe(400);
  });
});
