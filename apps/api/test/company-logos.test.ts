import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { db, pool, schema } from '../src/db/client.js';
import { closeRedis } from '../src/lib/redis.js';
import { BlockedUrlError, checkUrl, guardedLookup, isPrivateAddress, onDomain, safeFetch, setHop, type Hop } from '../src/companies/safe-fetch.js';
import { backfillLogos, iconCandidates, normalizeLogo, pngFromIco, sanitizeSvg, setLogosGloballyDisabled, setWikimediaGap } from '../src/companies/logos.js';
import type { App } from '../src/app.js';
import { freeRect, getApp, login } from './helpers.js';

let app: App;
let png64: Buffer;
beforeAll(async () => {
  app = await getApp();
  setWikimediaGap(0);
  png64 = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 1 } } }).png().toBuffer();
});
afterAll(async () => {
  setHop(null);
  await app.close();
  await pool.end();
  await closeRedis();
});
const json = (res: { body: string }) => JSON.parse(res.body);
type Route = { status?: number; type?: string; body?: Buffer | string; location?: string };
const norm = (u: string) => decodeURIComponent(new URL(u).toString());
const fakeNet = (routes: Record<string, Route>, seen: string[] = []): Hop => async (url) => {
  seen.push(url.toString());
  const r = Object.entries(routes).find(([k]) => norm(k) === norm(url.toString()))?.[1];
  if (!r) return { status: 404, contentType: 'text/plain', body: Buffer.from('nope') };
  return { status: r.status ?? 200, location: r.location, contentType: r.type ?? 'text/html', body: Buffer.isBuffer(r.body) ? r.body : Buffer.from(r.body ?? '') };
};

describe('SSRF guard (H1)', () => {
  it('refuses private, local and odd URLs, and hosts off the official domain', () => {
    const apple = onDomain('apple.com');
    for (const bad of ['http://127.0.0.1/x', 'http://[::1]/', 'http://localhost/', 'http://intranet.local/', 'ftp://apple.com/x', 'https://apple.com:8443/', 'https://user:pw@apple.com/', 'https://evil.example/logo.png', 'https://apple.com.evil.example/', 'file:///etc/passwd', 'javascript:alert(1)']) {
      expect(() => checkUrl(bad, apple), bad).toThrow(BlockedUrlError);
    }
    expect(checkUrl('https://www.apple.com/favicon.ico', apple).hostname).toBe('www.apple.com');
    expect(checkUrl('https://apple.com/a.png', apple).hostname).toBe('apple.com');
    for (const ip of ['10.0.0.1', '172.16.5.4', '192.168.1.1', '127.0.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::ffff:127.0.0.1', 'fd00::1', 'fe80::1']) expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ['8.8.8.8', '151.101.1.69', '2a04:4e42::81']) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it('the real connection refuses names that resolve to private addresses', async () => {
    const err = await new Promise<Error | null>((r) => guardedLookup('localhost', {}, (e) => r(e)));
    expect(err).toBeInstanceOf(BlockedUrlError);
  });

  it('checks every redirect hop and the size limit', async () => {
    setHop(fakeNet({ 'https://www.apple.com/': { status: 302, location: 'https://evil.example/x.png' } }));
    await expect(safeFetch('https://www.apple.com/', { allow: onDomain('apple.com') })).rejects.toThrow(/not an allowed host/);
    setHop(fakeNet({ 'https://www.apple.com/': { status: 301, location: 'http://169.254.169.254/latest/meta-data' } }));
    await expect(safeFetch('https://www.apple.com/', { allow: onDomain('apple.com') })).rejects.toThrow(BlockedUrlError);
    setHop(fakeNet({ 'https://www.apple.com/a': { status: 302, location: '/b' }, 'https://www.apple.com/b': { status: 302, location: '/a' } }));
    await expect(safeFetch('https://www.apple.com/a', { allow: onDomain('apple.com') })).rejects.toThrow(/too many redirects/);
    setHop(fakeNet({ 'https://www.apple.com/big.png': { type: 'image/png', body: Buffer.alloc(1_200_000) } }));
    await expect(safeFetch('https://www.apple.com/big.png', { allow: onDomain('apple.com'), maxBytes: 1_000_000 })).rejects.toThrow(/larger than/);
    setHop(null);
  });
});

describe('logo files (H1)', () => {
  it('checks the declared type against the real bytes, and resizes to at most 128×128 PNG', async () => {
    const out = await normalizeLogo(png64, 'image/png');
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('png');
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(128);
    await expect(normalizeLogo(png64, 'text/html')).rejects.toThrow(/does not match/);
    await expect(normalizeLogo(Buffer.from('<html><body>hi</body></html>'), 'image/png')).rejects.toThrow(/not an image/);
    await expect(normalizeLogo(Buffer.alloc(1_000_001), 'image/png')).rejects.toThrow(/1 MB/);
    const tiny = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#000' } }).png().toBuffer();
    await expect(normalizeLogo(tiny, 'image/png')).rejects.toThrow(/too small/);
  });

  it('sanitises SVG: no scripts, handlers, foreign content or external references; DOCTYPE/entities refused', async () => {
    const evil = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="64" height="64" onload="alert(1)">
      <script>alert(1)</script><foreignObject><iframe src="https://evil"/></foreignObject>
      <image href="http://169.254.169.254/latest" width="10" height="10"/><use xlink:href="https://evil.example/a.svg#x"/>
      <style>@import url(https://evil.example/x.css); rect { fill: url(https://evil.example/p) }</style>
      <rect width="64" height="64" fill="#f00"/><use href="#local"/></svg>`;
    const clean = sanitizeSvg(evil)!;
    expect(clean).not.toMatch(/script|onload|foreignObject|iframe|169\.254|evil\.example|@import/i);
    expect(clean).toContain('href="#local"');
    expect(sanitizeSvg('<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg>&x;</svg>')).toBeNull();
    const out = await normalizeLogo(Buffer.from(evil), 'image/svg+xml');
    expect((await sharp(out).metadata()).format).toBe('png');
    await expect(normalizeLogo(Buffer.from(evil), 'text/plain')).rejects.toThrow(/does not match/);
  });

  it('reads PNG images inside .ico files and skips BMP-only icons', async () => {
    const ico = Buffer.alloc(6 + 16);
    ico.writeUInt16LE(0, 0);
    ico.writeUInt16LE(1, 2);
    ico.writeUInt16LE(1, 4);
    ico[6] = 64;
    ico[7] = 64;
    ico.writeUInt32LE(png64.length, 6 + 8);
    ico.writeUInt32LE(22, 6 + 12);
    const withPng = Buffer.concat([ico, png64]);
    expect(pngFromIco(withPng)?.equals(png64)).toBe(true);
    expect((await sharp(await normalizeLogo(withPng, 'image/x-icon')).metadata()).format).toBe('png');
    const bmp = Buffer.concat([ico, Buffer.alloc(64)]);
    await expect(normalizeLogo(bmp, 'image/x-icon')).rejects.toThrow(/no PNG/);
  });

  it('ranks icon links: apple-touch-icon, then SVG, then the largest PNG', () => {
    const html = `<link rel="icon" href="/f.ico"><link rel="icon" type="image/png" sizes="32x32" href="/32.png"><link rel="icon" type="image/png" sizes="192x192" href="/192.png"><link rel="icon" href="/i.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="https://cdn.apple.com/touch.png">`;
    expect(iconCandidates(html, 'https://www.apple.com/')).toEqual(['https://cdn.apple.com/touch.png', 'https://www.apple.com/i.svg', 'https://www.apple.com/192.png', 'https://www.apple.com/32.png', 'https://www.apple.com/f.ico']);
  });
});

async function showcasePlot(name: string, website: string) {
  const owner = await login();
  const plot = json(await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: owner.headers, payload: { rect: freeRect() } })).plot;
  const slug = `${name.toLowerCase().replace(/\W+/g, '-')}-${Math.random().toString(36).slice(2, 6)}`;
  await db
    .update(schema.plots)
    .set({ kind: 'showcase', status: 'showcase', ownerUserId: null, slug, title: name, showcase: { brand: name, website, sector: 'Retail', kind: 'company', city: 'London', useCase: 'x', highlights: [], imagePrompt: 'x', palette: ['#000000', '#111111', '#222222'], motif: 'star', approved: true } })
    .where(eq(schema.plots.id, plot.id));
  return { id: plot.id as string, slug };
}

describe('finding, storing and showing logos (H1)', () => {
  it('Wikidata P154 through Commons first (file page, licence, author), else the official website; stored on company_sources', async () => {
    const a = await showcasePlot('Acme Widgets', 'https://www.acme-widgets.example');
    const b = await showcasePlot('Bolt Bikes', 'https://boltbikes.example');
    const seen: string[] = [];
    setHop(
      fakeNet(
        {
          'https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=7&search=Acme%20Widgets': { type: 'application/json', body: JSON.stringify({ search: [{ id: 'Q1' }, { id: 'Q2' }] }) },
          'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids=Q1|Q2': {
            type: 'application/json',
            body: JSON.stringify({ entities: { Q1: { claims: { P856: [{ mainsnak: { datavalue: { value: 'https://other.example' } } }] } }, Q2: { claims: { P856: [{ mainsnak: { datavalue: { value: 'https://acme-widgets.example/' } } }] } } } }),
          },
          'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids=Q2': { type: 'application/json', body: JSON.stringify({ entities: { Q2: { claims: { P154: [{ mainsnak: { datavalue: { value: 'Acme logo.svg' } } }] } } } }) },
          'https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url%7Cmime%7Csize%7Cextmetadata&iiurlwidth=256&titles=File%3AAcme%20logo.svg': {
            type: 'application/json',
            body: JSON.stringify({ query: { pages: { '1': { imageinfo: [{ thumburl: 'https://upload.wikimedia.org/acme.png', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Acme_logo.svg', extmetadata: { LicenseShortName: { value: 'Public domain' }, Artist: { value: '<a href="x">Acme Inc.</a>' } } }] } } } }),
          },
          'https://upload.wikimedia.org/acme.png': { type: 'image/png', body: png64 },
          // Bolt: nothing on Wikidata; its site has an apple-touch-icon on a subdomain, and a logo on a third-party host (ignored).
          'https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=7&search=Bolt%20Bikes': { type: 'application/json', body: JSON.stringify({ search: [] }) },
          'https://boltbikes.example/': { type: 'text/html', body: '<link rel="icon" href="https://logos.thirdparty.example/bolt.png"><link rel="apple-touch-icon" href="https://cdn.boltbikes.example/t.png">' },
          'https://cdn.boltbikes.example/t.png': { type: 'image/png', body: png64 },
        },
        seen,
      ),
    );
    const r = await backfillLogos({ apply: true, plotIds: [a.id, b.id], concurrency: 1 });
    expect(r).toMatchObject({ checked: 2, wikidata: 1, website: 1, none: 0 });
    expect(seen.some((u) => u.includes('thirdparty'))).toBe(false); // never off the official domain
    const [srcA] = await db.select().from(schema.companySources).where(eq(schema.companySources.plotId, a.id));
    expect(srcA).toMatchObject({ source: 'curated', logoSource: 'wikidata', logoSourceUrl: 'https://commons.wikimedia.org/wiki/File:Acme_logo.svg', logoLicense: 'Public domain', logoAuthor: 'Acme Inc.' });
    expect(srcA!.logoUrl).toMatch(/^\/media\/logos\/.+\.png$/);
    expect(srcA!.logoFetchedAt).toBeTruthy();
    const [srcB] = await db.select().from(schema.companySources).where(eq(schema.companySources.plotId, b.id));
    expect(srcB).toMatchObject({ logoSource: 'website', logoSourceUrl: 'https://cdn.boltbikes.example/t.png' });
    // Shown small on the plot, the map feed and /brands; the generic cover stays.
    const view = json(await app.inject({ url: `/v1/plots/${a.slug}` })).plot;
    expect(view.showcase.logo).toMatchObject({ source: 'wikidata', license: 'Public domain' });
    expect(view.coverImageUrl).not.toBe(view.showcase.logo.url);
    expect(json(await app.inject({ url: `/v1/brands?q=${encodeURIComponent('Acme Widgets')}` })).brands[0]?.logoUrl ?? null).toBe(srcA!.logoUrl);
    setHop(null);
  });

  it('kill-switches: global hides every logo, per plot hides one, admins only; a takedown hides it at once', async () => {
    const p = await showcasePlot('Cobalt Coffee', 'https://cobalt.example');
    await db.update(schema.plots).set({ showcase: { ...(await db.select().from(schema.plots).where(eq(schema.plots.id, p.id)))[0]!.showcase!, logo: { url: '/media/logos/c.png', source: 'website', sourceUrl: 'https://cobalt.example/c.png', license: null, author: null } } }).where(eq(schema.plots.id, p.id));
    const logo = async () => json(await app.inject({ url: `/v1/plots/${p.slug}` })).plot.showcase.logo;
    expect(await logo()).toBeTruthy();
    const user = await login();
    const admin = await login(undefined, 'admin');
    expect((await app.inject({ method: 'POST', url: '/v1/admin/company-logos/global', headers: user.headers, payload: { disabled: true } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: `/v1/admin/plots/${p.id}/logo`, headers: user.headers, payload: { hidden: true } })).statusCode).toBe(403);
    await app.inject({ method: 'POST', url: '/v1/admin/company-logos/global', headers: admin.headers, payload: { disabled: true } });
    try {
      expect(await logo()).toBeNull();
    } finally {
      await setLogosGloballyDisabled(false, admin.user.id);
    }
    expect(await logo()).toBeTruthy();
    await app.inject({ method: 'POST', url: `/v1/admin/plots/${p.id}/logo`, headers: admin.headers, payload: { hidden: true } });
    expect(await logo()).toBeNull();
    await app.inject({ method: 'POST', url: `/v1/admin/plots/${p.id}/logo`, headers: admin.headers, payload: { hidden: false } });
    expect(await logo()).toBeTruthy();
    // A removal request hides the logo immediately; the plot stays until the 48 h process.
    await app.inject({ method: 'POST', url: `/v1/showcase/${p.slug}/takedown`, payload: { name: 'Legal', email: 'legal@cobalt.example', message: 'Please remove our logo.' } });
    expect(await logo()).toBeNull();
    expect(json(await app.inject({ url: `/v1/plots/${p.slug}` })).plot.status).toBe('showcase');
  });
});
