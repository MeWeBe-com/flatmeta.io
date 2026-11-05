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
