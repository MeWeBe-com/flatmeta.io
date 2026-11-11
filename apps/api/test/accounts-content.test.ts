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
    // Served as its own sandboxed document (G2), not shipped in the plot view for srcdoc.
    expect(view.plot.hasCustomHtml).toBe(true);
    const doc = await app.inject({ url: `/v1/plots/${plot.id}/sandbox` });
    expect(doc.body).toContain('Content-Security-Policy');
    expect(String(doc.headers['content-security-policy'])).toMatch(/^sandbox allow-scripts;/);
    expect(view.plot.customHtml).toBeUndefined(); // raw source is for editors only
  });
});

describe('custom HTML sandbox documents (G2)', () => {
  it('serves owner HTML as its own sandboxed document, never inside our origin', async () => {
    const { db, schema } = await import('../src/db/client.js');
    const { eq } = await import('drizzle-orm');
    const owner = await login();
    const plot = JSON.parse((await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: owner.headers, payload: { rect: freeRect() } })).body).plot;
    await db.update(schema.plots).set({ customHtml: '<h1>Hi</h1><script>document.body.dataset.ok="1"</script>' }).where(eq(schema.plots.id, plot.id));
    const res = await app.inject({ url: `/v1/plots/${plot.id}/sandbox` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    const csp = String(res.headers['content-security-policy']);
    expect(csp).toMatch(/^sandbox allow-scripts;/); // opaque origin even when opened directly
    expect(csp).not.toMatch(/allow-same-origin|allow-top-navigation|allow-forms|allow-popups/);
    expect(csp).toMatch(/connect-src 'none'/);
    expect(csp).toMatch(/frame-ancestors http/);
    expect(res.headers['x-frame-options']).toBeUndefined();
    expect(res.body).toContain('<h1>Hi</h1>');
    // The plot view no longer ships the document for srcdoc.
    expect(JSON.parse((await app.inject({ url: `/v1/plots/${plot.id}` })).body).plot.customHtmlDoc).toBeUndefined();
    // Hidden or flagged plots don't serve it.
    await db.update(schema.plots).set({ moderationStatus: 'flagged' }).where(eq(schema.plots.id, plot.id));
    expect((await app.inject({ url: `/v1/plots/${plot.id}/sandbox` })).statusCode).toBe(404);
  });

  it('previews drafts only for signed-in users, screened, in the same sandbox', async () => {
    const form = (html: string) => `html=${encodeURIComponent(html)}`;
    const anon = await app.inject({ method: 'POST', url: '/v1/sandbox/preview', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: form('<b>x</b>') });
    expect(anon.statusCode).toBe(401);
    const u = await login();
    const ok = await app.inject({ method: 'POST', url: '/v1/sandbox/preview', headers: { ...u.headers, 'content-type': 'application/x-www-form-urlencoded' }, payload: form('<b>hello</b>') });
    expect(ok.statusCode).toBe(200);
    expect(String(ok.headers['content-security-policy'])).toMatch(/^sandbox allow-scripts;/);
    expect(ok.body).toContain('<b>hello</b>');
    const bad = await app.inject({ method: 'POST', url: '/v1/sandbox/preview', headers: { ...u.headers, 'content-type': 'application/x-www-form-urlencoded' }, payload: form('<script>alert(document.cookie)</script>') });
    expect(bad.body).toMatch(/can’t be published: reads cookies/);
    expect(bad.body).not.toContain('alert(document.cookie)');
  });
});
