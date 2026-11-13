import { describe, expect, it } from 'vitest';
import { insidePadded, keyboardInset, revealPadding } from '../../src/lib/viewport';

/** M8: the claim sheet stays above the keyboard and the selection stays above the sheet. */
describe('viewport maths', () => {
  it('keyboard inset: the part of the layout viewport under the visual one', () => {
    expect(keyboardInset(667, { height: 667, offsetTop: 0 })).toBe(0);
    expect(keyboardInset(667, { height: 351, offsetTop: 0 })).toBe(316); // iPhone SE keyboard
    expect(keyboardInset(667, { height: 351, offsetTop: 40 })).toBe(276); // page scrolled up by the browser
    expect(keyboardInset(667, null)).toBe(0);
    expect(keyboardInset(667, { height: 700, offsetTop: 0 })).toBe(0);
  });

  it('reveal padding: below the header, above the sheet, with room left for the map', () => {
    expect(revealPadding({ width: 375, height: 667 }, 64, 400)).toEqual({ top: 80, right: 32, bottom: 283, left: 32 });
    // No sheet: a margin at the bottom only.
    expect(revealPadding({ width: 375, height: 667 }, 64, null).bottom).toBe(16);
    // A sheet taller than the screen allows: the padding shrinks so 96 px of map stay.
    const p = revealPadding({ width: 320, height: 568 }, 64, 100);
    expect(568 - p.top - p.bottom).toBe(96);
  });

  it('inside the padded area or not', () => {
    const view = { width: 375, height: 667 };
    const pad = { top: 80, right: 32, bottom: 283, left: 32 };
    expect(insidePadded([{ x: 100, y: 100 }, { x: 200, y: 300 }], view, pad)).toBe(true);
    expect(insidePadded([{ x: 100, y: 100 }, { x: 200, y: 500 }], view, pad)).toBe(false); // under the sheet
    expect(insidePadded([{ x: 10, y: 100 }, { x: 200, y: 300 }], view, pad)).toBe(false);
  });
});
