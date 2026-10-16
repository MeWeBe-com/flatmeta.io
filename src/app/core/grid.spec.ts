import { boundsOf, gridCenterLatLng, gridToLatLng, gridToThreeWords, latLngToGrid, slugify, snapToAllowedZoom } from './grid';

describe('grid', () => {
  it('round-trips a square through its north-west corner', () => {
    for (const [lat, lng] of [[51.50972, -0.104317], [24.8591, 66.9983], [-33.8688, 151.2093], [0.0001, -179.99]]) {
      const { gx, gy } = latLngToGrid(lat, lng);
      const nw = gridToLatLng(gx, gy);
      // The stored corner is rounded to 6 decimals; stepping 1e-5 inside must land in the same square.
      expect(latLngToGrid(nw.lat - 1e-5, nw.lng + 1e-5)).toEqual({ gx, gy });
      const c = gridCenterLatLng(gx, gy);
      expect(latLngToGrid(c.lat, c.lng)).toEqual({ gx, gy });
    }
  });

  it('puts horizontal neighbours one square apart', () => {
    const a = latLngToGrid(24.854665 - 1e-5, 67.003555 + 1e-5);
    const b = latLngToGrid(24.854665 - 1e-5, 67.005272 + 1e-5);
    expect(b.gx - a.gx).toBe(1);
    expect(b.gy).toBe(a.gy);
  });

  it('only allows the three zoom levels', () => {
    expect([1, 5, 7, 8, 10, 12, 13, 15, 18].map(snapToAllowedZoom)).toEqual([5, 5, 5, 10, 10, 10, 15, 15, 15]);
  });

  it('builds bounds and deterministic 3-word addresses', () => {
    expect(boundsOf([{ gx: 3, gy: 9 }, { gx: 1, gy: 4 }])).toEqual({ minGx: 1, minGy: 4, maxGx: 3, maxGy: 9 });
    expect(boundsOf([])).toBeNull();
    expect(gridToThreeWords(10, 20)).toBe(gridToThreeWords(10, 20));
    expect(gridToThreeWords(10, 20)).toMatch(/^[a-z]+\.[a-z]+\.[a-z]+$/);
  });

  it('turns any text into a safe /u/ slug', () => {
    expect(slugify('https://flatmeta.io/u/Pepsi Land!')).toBe('pepsi-land');
    expect(slugify('  --My__Shop--  ')).toBe('my-shop');
    expect(slugify('<script>')).toBe('script');
  });
});
