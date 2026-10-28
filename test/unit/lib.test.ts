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
