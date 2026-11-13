import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { cellToLngLat, lngLatToCell, normalizeRect, rectCells, rectsIntersect, threeWords } from '@/lib/grid';
import { flag, openNow, usd } from '@/lib/format';
import { t } from '@/lib/i18n';
import en from '../../messages/en.json';

describe('grid', () => {
  it('round-trips a cell through lng/lat', () => {
    const c = lngLatToCell(-0.1276, 51.5072);
    const ll = cellToLngLat(c.gx, c.gy);
    expect(lngLatToCell(ll.lng + 1e-6, ll.lat - 1e-6)).toEqual(c);
  });

  it('normalises and measures rectangles', () => {
    const r = normalizeRect({ minGx: 10, minGy: 20, maxGx: 8, maxGy: 18 });
    expect(r).toEqual({ minGx: 8, minGy: 18, maxGx: 10, maxGy: 20 });
    expect(rectCells(r)).toBe(9);
    expect(rectsIntersect(r, { minGx: 10, minGy: 20, maxGx: 12, maxGy: 22 })).toBe(true);
    expect(rectsIntersect(r, { minGx: 11, minGy: 20, maxGx: 12, maxGy: 22 })).toBe(false);
  });

  it('gives every cell a stable three-word name', () => {
    expect(threeWords(1234, 5678)).toBe(threeWords(1234, 5678));
    expect(threeWords(1234, 5678)).not.toBe(threeWords(1235, 5678));
    expect(threeWords(1, 2).split('.')).toHaveLength(3);
  });
});

describe('format', () => {
  it('formats money from cents', () => {
    expect(usd(900)).toBe('$9');
    expect(usd(250)).toBe('$2.50');
  });
  it('turns country codes into flags', () => {
    expect(flag('gb')).toBe('🇬🇧');
    expect(flag(null)).toBe('🌊');
  });
  it('knows when a business is open', () => {
    const allWeek = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['00:00', '24:00']] as [string, string][]]));
    expect(openNow(allWeek, 'Europe/London')).toBe(true);
    expect(openNow({}, 'UTC')).toBeNull();
  });
});

describe('i18n', () => {
  it('interpolates and falls back to the key', () => {
    expect(t('app.name')).toBe('FlatMeta');
    expect(t('missing.key')).toBe('missing.key');
  });

  it('has a message for every t() key used in the app', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(f)) files.push(p);
      }
    };
    walk(join(__dirname, '../../src'));
    const keys = new Set<string>();
    for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) keys.add(m[1]);
    const missing = [...keys].filter((k) => k.split('.').reduce<unknown>((n, p) => (n as Record<string, unknown> | undefined)?.[p], en) === undefined);
    expect(missing).toEqual([]);
  });
});

import { HOME_PLAZA, pickSpawn, wantsPrecise } from '../../src/lib/spawn';

describe('spawn order', () => {
  const ip = { source: 'ip' as const, lat: 48.85, lng: 2.35, zoom: 12, approximate: true, city: 'Paris', country: 'FR' };
  it('prefers the saved spot, then this device, then the approximate location, then home', () => {
    expect(pickSpawn({ server: { ...ip, source: 'saved', approximate: false }, device: { lat: 1, lng: 1 } })).toMatchObject({ source: 'saved', lat: 48.85 });
    expect(pickSpawn({ server: ip, device: { lat: 40.4, lng: -3.7 } })).toMatchObject({ source: 'device', lat: 40.4, approximate: false });
    expect(pickSpawn({ server: ip, device: null })).toMatchObject({ source: 'ip', city: 'Paris', approximate: true, zoom: 12 });
    expect(pickSpawn({ server: { ...ip, source: 'country', city: null }, device: null })).toMatchObject({ source: 'country', zoom: 7 });
    expect(pickSpawn({ server: null, device: null })).toMatchObject({ source: 'home', lat: HOME_PLAZA.lat, lng: HOME_PLAZA.lng });
  });
  it('ignores broken or empty positions instead of spawning somewhere random', () => {
    expect(pickSpawn({ server: { ...ip, lat: NaN }, device: { lat: 0, lng: 0 } }).source).toBe('home');
    expect(pickSpawn({ server: null, device: { lat: 99, lng: 10 } }).source).toBe('home');
  });
  it('offers precise location only after an approximate start', () => {
    expect(wantsPrecise(pickSpawn({ server: ip, device: null }))).toBe(true);
    expect(wantsPrecise(pickSpawn({ server: null, device: { lat: 40, lng: 2 } }))).toBe(false);
  });
});

import { buildCsp, originsOf, securityHeaders } from '../../src/lib/csp';

describe('content security policy', () => {
  it('requires the per-request nonce for scripts and forbids framing', () => {
    const csp = buildCsp({ nonce: 'abc123', dev: false, connect: ['https://tiles.openfreemap.org'], frames: ['https://usercontent.flatmeta.io'] });
    expect(csp).toMatch(/script-src 'self' 'nonce-abc123' 'strict-dynamic';/);
    expect(csp).not.toMatch(/unsafe-eval/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
    expect(csp).toMatch(/object-src 'none'/);
    expect(csp).toMatch(/connect-src 'self' https:\/\/tiles\.openfreemap\.org;/);
    expect(csp).toMatch(/frame-src 'self' https:\/\/usercontent\.flatmeta\.io;/);
    expect(csp).toMatch(/upgrade-insecure-requests$/);
    // An http site (local, CI) must not ask for upgrades: Safari applies them to localhost too and nothing loads.
    expect(buildCsp({ nonce: 'x', dev: false, connect: [], frames: [], https: false })).not.toMatch(/upgrade-insecure-requests/);
    expect(buildCsp({ nonce: 'x', dev: true, connect: [], frames: [] })).toMatch(/'unsafe-eval'/);
  });
  it('turns configured URLs into origins and ignores junk', () => {
    expect(originsOf(['https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf', 'wss://live.example.com/v1/live', 'javascript:alert(1)', undefined, ''])).toEqual(['https://tiles.openfreemap.org', 'wss://live.example.com']);
  });
  it('sends HSTS only for https sites', () => {
    const keys = (h: { key: string }[]) => h.map((x) => x.key);
    expect(keys(securityHeaders(true))).toEqual(expect.arrayContaining(['Strict-Transport-Security', 'X-Frame-Options', 'X-Content-Type-Options', 'Referrer-Policy']));
    expect(securityHeaders(true).find((h) => h.key === 'Strict-Transport-Security')!.value).toBe('max-age=31536000; includeSubDomains');
    expect(securityHeaders(true).find((h) => h.key === 'X-Frame-Options')!.value).toBe('DENY');
    expect(keys(securityHeaders(false))).not.toContain('Strict-Transport-Security');
  });
});

import { canonicalUrl } from '../../src/lib/canonical';

describe('canonical host', () => {
  it('uses www for production on the bare domain, and leaves everything else alone', () => {
    expect(canonicalUrl({ APP_ENV: 'production', NODE_ENV: 'production', APP_URL: 'https://flatmeta.io' })).toBe('https://www.flatmeta.io');
    expect(canonicalUrl({ APP_ENV: 'production', APP_URL: 'https://www.flatmeta.io/' })).toBe('https://www.flatmeta.io');
    expect(canonicalUrl({ APP_ENV: 'staging', APP_URL: 'https://staging.flatmeta.io' })).toBe('https://staging.flatmeta.io');
    expect(canonicalUrl({ APP_ENV: 'production', APP_URL: 'https://flatmeta.io', CANONICAL_WWW: 'false' })).toBe('https://flatmeta.io');
    expect(canonicalUrl({ APP_ENV: 'production', APP_URL: 'https://flatmeta.io', CANONICAL_URL: 'https://flatmeta.io/' })).toBe('https://flatmeta.io');
    expect(canonicalUrl({ APP_URL: 'http://localhost:3200' })).toBe('http://localhost:3200');
  });
});
