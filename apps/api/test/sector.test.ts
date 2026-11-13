import { describe, expect, it } from 'vitest';
import { sectorLabel } from '../src/lib/sector.js';

/** M7: one spelling per sector on /brands, whatever wrote it (generator, company-land job, admin, older rows). */
describe('sector labels', () => {
  it('maps every known spelling to one label', () => {
    expect(sectorLabel('tech')).toBe('Technology');
    expect(sectorLabel('Technology')).toBe('Technology');
    expect(sectorLabel('TECH')).toBe('Technology');
    expect(sectorLabel(' food ')).toBe('Food & drink');
    expect(sectorLabel('Food & drink')).toBe('Food & drink');
    expect(sectorLabel('FINANCE')).toBe('Finance');
    expect(sectorLabel('tourism')).toBe('Travel');
  });
  it('sentence-cases anything else, and drops empty values', () => {
    expect(sectorLabel('REAL  estate')).toBe('Real estate');
    expect(sectorLabel('')).toBeNull();
    expect(sectorLabel(null)).toBeNull();
    expect(sectorLabel(undefined)).toBeNull();
  });
});
