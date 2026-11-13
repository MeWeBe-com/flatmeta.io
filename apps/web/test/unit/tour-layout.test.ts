import { describe, expect, it } from 'vitest';
import { placeTour } from '../../src/lib/tour-layout';

/** M1: the tour card's placement never leaves the screen and never covers its target. */
describe('placeTour', () => {
  it('uses a sheet under 640 px, at the top when the target is at the bottom', () => {
    expect(placeTour({ vw: 375, vh: 812, target: null, cardHeight: 200 })).toEqual({ mode: 'sheet', edge: 'bottom' });
    expect(placeTour({ vw: 375, vh: 812, target: { left: 72, top: 12, width: 290, height: 44 }, cardHeight: 200 })).toEqual({ mode: 'sheet', edge: 'bottom' });
    expect(placeTour({ vw: 320, vh: 568, target: { left: 90, top: 500, width: 140, height: 48 }, cardHeight: 200 })).toEqual({ mode: 'sheet', edge: 'top' });
  });

  const sizes = [
    [640, 480],
    [768, 1024],
    [844, 390],
    [1024, 768],
    [1280, 800],
  ] as const;
  const targets = (vw: number, vh: number) => [
    null,
    { left: 72, top: 12, width: Math.min(560, vw - 150), height: 44 }, // search bar
    { left: vw - 332, top: 72, width: 320, height: 260 }, // quests panel
    { left: vw / 2 - 80, top: vh - 72, width: 160, height: 48 }, // Claim land
  ];
  for (const [vw, vh] of sizes) {
    it(`keeps the card inside ${vw}x${vh} and off its target`, () => {
      for (const target of targets(vw, vh)) {
        for (const cardHeight of [180, 260]) {
          const p = placeTour({ vw, vh, target, cardHeight });
          if (p.mode !== 'float') throw new Error('expected a floating card');
          const h = Math.min(cardHeight, p.maxHeight);
          expect(p.left).toBeGreaterThanOrEqual(12);
          expect(p.left + p.width).toBeLessThanOrEqual(vw - 12);
          expect(p.top).toBeGreaterThanOrEqual(12);
          expect(p.top + h).toBeLessThanOrEqual(vh - 12 + 0.5);
          if (target) {
            const t = { l: target.left - 8, t: target.top - 8, r: target.left + target.width + 8, b: target.top + target.height + 8 };
            const overlap = !(p.left + p.width <= t.l || p.left >= t.r || p.top + h <= t.t || p.top >= t.b);
            expect(overlap, `${vw}x${vh} ${JSON.stringify(target)} ${JSON.stringify(p)}`).toBe(false);
          }
        }
      }
    });
  }
});
