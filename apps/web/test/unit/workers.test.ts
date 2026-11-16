import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS worker modules (ops/cloudflare), tested for their pure routing logic
import { imageOptions, routeFor } from '../../../../ops/cloudflare/edge/worker.js';
// @ts-expect-error plain JS worker module
import { CHECKS, changes, check } from '../../../../ops/cloudflare/uptime/worker.js';

describe('GL6 edge worker', () => {
  it('routes only images and feeds; HTML and writes pass through', () => {
    expect(routeFor('GET', '/api/v1/plots/flatmeta-hq/cover.jpg')).toBe('image');
    expect(routeFor('GET', '/media/abc/def.webp')).toBe('image');
    expect(routeFor('GET', '/sitemap.xml')).toBe('feed');
    expect(routeFor('GET', '/sitemap-plots-1.xml')).toBe('feed');
    expect(routeFor('HEAD', '/llms-full.txt')).toBe('feed');
    expect(routeFor('GET', '/robots.txt')).toBe('feed');
    expect(routeFor('GET', '/')).toBe('pass');
    expect(routeFor('GET', '/p/flatmeta-hq')).toBe('pass');
    expect(routeFor('GET', '/api/v1/plots/flatmeta-hq')).toBe('pass');
    expect(routeFor('POST', '/sitemap.xml')).toBe('pass');
  });
  it('clamps the width and picks the best format the browser accepts', () => {
    const u = (q: string) => new URL(`https://www.flatmeta.io/media/a.png${q}`);
    expect(imageOptions(u(''), 'image/webp')).toBeNull();
    expect(imageOptions(u('?w=abc'), '')).toBeNull();
    expect(imageOptions(u('?w=9999'), 'image/avif,image/webp')).toMatchObject({ width: 2048, format: 'avif', fit: 'scale-down' });
    expect(imageOptions(u('?w=5'), 'image/webp')).toMatchObject({ width: 32, format: 'webp' });
    expect(imageOptions(u('?w=480'), 'image/png')).not.toHaveProperty('format');
  });
});

describe('GL6 uptime worker', () => {
  it('checks health and home on each site', () => {
    expect(CHECKS({ SITES: 'https://a.test/, https://b.test' })).toEqual(['https://a.test/api/v1/health', 'https://a.test/', 'https://b.test/api/v1/health', 'https://b.test/']);
  });
  it('treats a health answer without ok:true as down', async () => {
    const fake = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status });
    expect((await check('https://a.test/api/v1/health', fake({ ok: true }))).ok).toBe(true);
    expect((await check('https://a.test/api/v1/health', fake({ ok: false }))).ok).toBe(false);
    expect((await check('https://a.test/', fake({}, 502))).ok).toBe(false);
    expect((await check('https://a.test/', async () => { throw new Error('boom'); })).ok).toBe(false);
  });
  it('alerts only on a change of state', () => {
    const r = [{ url: 'u1', ok: false, status: 503, ms: 5 }, { url: 'u2', ok: true, status: 200, ms: 5 }, { url: 'u3', ok: true, status: 200, ms: 9 }];
    const out = changes(r, { u1: true, u2: true, u3: false });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatch(/u1 is DOWN \(status 503/);
    expect(out[1]).toMatch(/u3 is back up/);
    expect(changes(r, { u1: false, u2: true, u3: true })).toEqual([]);
  });
});
