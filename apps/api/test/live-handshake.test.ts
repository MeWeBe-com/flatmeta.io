import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { pool } from '../src/db/client.js';
import { closeRedis } from '../src/lib/redis.js';
import { config } from '../src/config.js';
import type { App } from '../src/app.js';
import { getApp } from './helpers.js';

/**
 * M9: the live socket's handshake must not share the page's request budget. Production logged a storm of failed
 * wss://…/api/v1/live handshakes while a bare socket opened fine: once a busy map page (plots per move, nearest plots)
 * used up the per-IP API limit, the app's own reconnects were refused with 429, every retry too.
 */
let app: App;
let base = '';
beforeAll(async () => {
  app = await getApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
});
afterAll(async () => {
  await app.close();
  await pool.end();
  await closeRedis();
});

const open = (url: string) =>
  new Promise<{ ok: boolean; status?: number }>((resolve) => {
    const ws = new WebSocket(url);
    ws.on('open', () => {
      ws.close();
      resolve({ ok: true });
    });
    ws.on('unexpected-response', (_req, res) => resolve({ ok: false, status: res.statusCode }));
    ws.on('error', () => resolve({ ok: false }));
  });

describe('live socket handshake', () => {
  it('still opens after the page has used up its per-minute API budget', async () => {
    // Use up this IP's budget with ordinary API traffic, as a busy map page does.
    let limited = false;
    for (let i = 0; i < config.RATE_LIMIT_PER_MINUTE + 20 && !limited; i++) {
      const r = await fetch(`${base}/v1/world/stats`);
      limited = r.status === 429;
    }
    expect(limited, 'the API budget is used up').toBe(true);
    expect(await open(`${base.replace('http', 'ws')}/v1/live`)).toEqual({ ok: true });
  });

  it('has its own (generous) handshake limit, so a reconnect loop can be stopped', async () => {
    const results: { ok: boolean; status?: number }[] = [];
    for (let i = 0; i < 70; i++) results.push(await open(`${base.replace('http', 'ws')}/v1/live`));
    expect(results.filter((r) => r.ok).length).toBeGreaterThanOrEqual(55); // 60 a minute, one used above
    expect(results.some((r) => r.status === 429)).toBe(true);
  });
});
