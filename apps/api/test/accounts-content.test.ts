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

describe('personalising land (G7)', () => {
  const multipart = (name: string, data: Buffer, type: string) => {
    const boundary = '----fmtest' + Math.random().toString(36).slice(2);
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${type}\r\n\r\n`),
      data,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return { payload: body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
  };

  it('strips EXIF (incl. GPS) and resizes uploads, rejects non-images, and lets owners remove one gallery image', async () => {
    const sharp = (await import('sharp')).default;
    const { config } = await import('../src/config.js');
    const path = await import('node:path');
    const { readFile } = await import('node:fs/promises');
    const owner = await login();
    const plot = json(await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: owner.headers, payload: { rect: freeRect() } })).plot;
    const jpeg = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#3366cc' } })
      .jpeg()
      .withExif({ IFD0: { Make: 'SecretCam', Copyright: 'me' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '51/1 30/1 0/1', GPSLongitudeRef: 'W', GPSLongitude: '0/1 7/1 0/1' } })
      .toBuffer();
    expect((await sharp(jpeg).metadata()).exif).toBeTruthy(); // the original has EXIF
    const mp = multipart('photo.jpg', jpeg, 'image/jpeg');
    const res = await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/media?use=gallery`, headers: { ...owner.headers, ...mp.headers }, payload: mp.payload });
    expect(res.statusCode, res.body).toBe(200);
    const url: string = json(res).plot.gallery.at(-1);
    const prefix = config.MEDIA_PUBLIC_URL.replace(/\/$/, '') + '/';
    const stored = await readFile(path.resolve(config.MEDIA_DIR, url.slice(url.indexOf(prefix) + prefix.length)));
    const meta = await sharp(stored).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
    expect(meta.width).toBeLessThanOrEqual(1600);

    const notImage = multipart('x.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'image/svg+xml');
    expect((await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/media`, headers: { ...owner.headers, ...notImage.headers }, payload: notImage.payload })).statusCode).toBe(400);
    const stranger = await login();
    expect((await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/media`, headers: { ...stranger.headers, ...mp.headers }, payload: mp.payload })).statusCode).toBe(403);

    const removed = json(await app.inject({ method: 'PATCH', url: `/v1/plots/${plot.id}`, headers: owner.headers, payload: { galleryRemove: url } }));
    expect(removed.plot.gallery).not.toContain(url);
  });

  it('rate-limits edits per minute and caps them per day', async () => {
    const owner = await login();
    const plot = json(await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: owner.headers, payload: { rect: freeRect() } })).plot;
    const edit = await app.inject({ method: 'PATCH', url: `/v1/plots/${plot.id}`, headers: owner.headers, payload: { tagline: 'Hello' } });
    expect(edit.statusCode).toBe(200);
    const { redis, key } = await import('../src/lib/redis.js');
    const { dayKey } = await import('../src/game/dates.js');
    await redis.set(key('cap', 'plot-edit', owner.user.id, dayKey()), '300', 'EX', 60);
    const capped = await app.inject({ method: 'PATCH', url: `/v1/plots/${plot.id}`, headers: owner.headers, payload: { tagline: 'Again' } });
    expect(capped.statusCode).toBe(429);
    expect(capped.body).toMatch(/today's limit of 300 plot edits/);
  });
});
