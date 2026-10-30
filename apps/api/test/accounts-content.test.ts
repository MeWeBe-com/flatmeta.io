import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, pool, schema } from '../src/db/client.js';
import { closeRedis } from '../src/lib/redis.js';
import { screenCustomHtml } from '../src/lib/html.js';
import { hashPassword, verifyPassword } from '../src/lib/crypto.js';
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

describe('passwords (optional)', () => {
  it('hashes with scrypt and verifies', async () => {
    const h = await hashPassword('correct horse battery');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct horse battery', h)).toBe(true);
    expect(await verifyPassword('wrong', h)).toBe(false);
    expect(await verifyPassword('anything', null)).toBe(false);
  });

  it('sets a first password only with a fresh emailed code, then signs in with it', async () => {
    const email = `pw-${Date.now()}@test.dev`;
    const u = await login(email);
    const noCode = await app.inject({ method: 'PUT', url: '/v1/me/password', headers: u.headers, payload: { password: 'a-long-password-1' } });
    expect(noCode.statusCode).toBe(400);
    const { devCode } = json(await app.inject({ method: 'POST', url: '/v1/auth/request-code', payload: { email } }));
    const set = await app.inject({ method: 'PUT', url: '/v1/me/password', headers: u.headers, payload: { password: 'a-long-password-1', code: devCode } });
    expect(set.statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/v1/auth/password-login', payload: { email, password: 'nope-nope-nope' } })).statusCode).toBe(400);
    const ok = await app.inject({ method: 'POST', url: '/v1/auth/password-login', payload: { email, password: 'a-long-password-1' } });
    expect(ok.statusCode).toBe(200);
    expect(json(ok).user.hasPassword).toBe(true);
    expect(ok.headers['set-cookie']).toBeTruthy();
    // changing needs the current password
    const bad = await app.inject({ method: 'PUT', url: '/v1/me/password', headers: u.headers, payload: { password: 'another-long-pass-2', current: 'x' } });
    expect(bad.statusCode).toBe(400);
  });

  it('stores an avatar', async () => {
    const u = await login();
    const res = json(await app.inject({ method: 'PATCH', url: '/v1/me', headers: u.headers, payload: { avatar: { face: '🦊', color: '#ff8800' } } }));
    expect(res.user.avatar).toEqual({ face: '🦊', color: '#ff8800' });
  });
});

describe('custom HTML', () => {
  it('screens dangerous markup', () => {
    expect(screenCustomHtml('<h1>Hello</h1><p style="color:red">hi</p>').ok).toBe(true);
    expect(screenCustomHtml('<script>document.cookie</script>').ok).toBe(false);
    expect(screenCustomHtml('<script src="https://evil.example/x.js"></script>').ok).toBe(false);
    expect(screenCustomHtml('<script>top.location="https://evil"</script>').ok).toBe(false);
    expect(screenCustomHtml('<iframe src="https://evil.example"></iframe>').ok).toBe(false);
    expect(screenCustomHtml('<iframe src="https://www.youtube.com/embed/abc"></iframe>').ok).toBe(true);
    expect(screenCustomHtml('x'.repeat(60_000)).ok).toBe(false);
  });

  it('is a paid feature, screened, and only shown as a sandbox document', async () => {
    const free = await login();
    const plot = json(await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: free.headers, payload: { rect: freeRect() } })).plot;
    const denied = await app.inject({ method: 'PATCH', url: `/v1/plots/${plot.id}`, headers: free.headers, payload: { customHtml: '<h1>Hi</h1>' } });
    expect(denied.statusCode).toBe(402);

    await db.update(schema.users).set({ plan: 'plus' }).where(eq(schema.users.id, free.user.id));
    const bad = await app.inject({ method: 'PATCH', url: `/v1/plots/${plot.id}`, headers: free.headers, payload: { customHtml: '<script>eval("1")</script>' } });
    expect(bad.statusCode).toBe(400);
    const ok = json(await app.inject({ method: 'PATCH', url: `/v1/plots/${plot.id}`, headers: free.headers, payload: { customHtml: '<h1>Welcome</h1>' } }));
    expect(ok.plot.hasCustomHtml).toBe(true);
    const view = json(await app.inject({ url: `/v1/plots/${plot.slug}` }));
    expect(view.plot.customHtmlDoc).toContain('Content-Security-Policy');
    expect(view.plot.customHtml).toBeUndefined(); // raw source is for editors only
  });
});
