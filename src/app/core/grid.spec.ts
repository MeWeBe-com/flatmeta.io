import {
  bboxParam,
  boundsOf,
  boxContains,
  boxContainsPoint,
  boxesOverlap,
  gridBoundsToBox,
  gridCenterLatLng,
  gridToLatLng,
  gridToThreeWords,
  latLngToGrid,
  padBox,
  slugify,
  snapToAllowedZoom,
} from './grid';

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

  it('pads, compares and overlaps lat/lng boxes, across the antimeridian too', () => {
    const view = { minLat: 51, minLng: -1, maxLat: 52, maxLng: 1 };
    expect(padBox(view, 0.5)).toEqual({ minLat: 50.5, minLng: -2, maxLat: 52.5, maxLng: 2 });
    expect(padBox({ minLat: 80, minLng: 0, maxLat: 89, maxLng: 1 }, 1).maxLat).toBe(90);
    expect(boxContains(padBox(view, 0.5), view)).toBeTrue();
    expect(boxContains(view, padBox(view, 0.5))).toBeFalse();

    expect(boxesOverlap(view, { minLat: 51.5, minLng: 0.5, maxLat: 51.6, maxLng: 0.6 })).toBeTrue();
    expect(boxesOverlap(view, { minLat: 53, minLng: 0, maxLat: 54, maxLng: 1 })).toBeFalse();
    // A view scrolled one world east (lng 170..190) still sees changes at lng -175.
    const wrapped = { minLat: 0, minLng: 170, maxLat: 10, maxLng: 190 };
    expect(boxesOverlap(wrapped, { minLat: 1, minLng: -175, maxLat: 2, maxLng: -174 })).toBeTrue();
    expect(boxContainsPoint(wrapped, 5, -175)).toBeTrue();
    expect(boxContainsPoint(wrapped, 5, 0)).toBeFalse();
  });

  it('formats the API bbox with wrapped longitudes', () => {
    expect(bboxParam({ minLat: 51, minLng: -1, maxLat: 52, maxLng: 1 })).toBe('51,-1,52,1');
    expect(bboxParam({ minLat: 0, minLng: 170, maxLat: 10, maxLng: 190 })).toBe('0,170,10,-170');
    expect(bboxParam({ minLat: -80, minLng: -400, maxLat: 80, maxLng: 400 })).toBe('-80,-180,80,180');
  });

  it('turns grid bounds into the lat/lng box of those squares', () => {
    const { gx, gy } = latLngToGrid(51.50972, -0.104317);
    const box = gridBoundsToBox({ minGx: gx, minGy: gy, maxGx: gx + 1, maxGy: gy });
    const nw = gridToLatLng(gx, gy);
    expect(box.maxLat).toBe(nw.lat);
    expect(box.minLng).toBe(nw.lng);
    expect(box.minLat).toBeLessThan(box.maxLat);
    const c = gridCenterLatLng(gx + 1, gy);
    expect(boxContainsPoint(box, c.lat, c.lng)).toBeTrue();
  });
});
