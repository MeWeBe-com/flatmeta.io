/**
 * Where the guided tour's card goes (M1). One rule for every screen:
 *   - narrower than 640 px: a sheet across the bottom of the screen (full width minus 16 px, inside the safe areas),
 *     or across the top when the highlighted control is at the bottom, so the card never covers what it points at;
 *   - wider: a card next to the target (floating-ui style): below it, flipped above when there's no room, shifted to
 *     stay 12 px inside the viewport, sized down to the space available, or beside the target as a last resort.
 * Pure function (unit-tested in test/unit/tour-layout.test.ts); the component re-runs it on resize, orientation
 * change, scroll and when the card's height changes.
 */
export type Box = { left: number; top: number; width: number; height: number };
export type TourPlacement =
  | { mode: 'sheet'; edge: 'top' | 'bottom' }
  | { mode: 'float'; left: number; top: number; width: number; maxHeight: number; side: 'below' | 'above' | 'right' | 'left' | 'center' };

export const SHEET_BELOW = 640;
export const PAD = 12; // distance from the viewport edges
export const GAP = 12; // distance from the target (outside its 8 px outline)
export const CARD_MAX = 360;

export function placeTour({ vw, vh, target, cardHeight }: { vw: number; vh: number; target: Box | null; cardHeight: number }): TourPlacement {
  if (vw < SHEET_BELOW) {
    // The sheet sits at the bottom unless the target is in the bottom part of the screen it would cover.
    if (!target) return { mode: 'sheet', edge: 'bottom' };
    const sheetTop = vh - 8 - Math.min(cardHeight, vh - 16);
    return { mode: 'sheet', edge: target.top + target.height > sheetTop - GAP ? 'top' : 'bottom' };
  }
  const width = Math.min(CARD_MAX, vw - PAD * 2);
  const clampX = (x: number) => Math.min(vw - PAD - width, Math.max(PAD, x));
  const clampY = (y: number, h: number) => Math.min(vh - PAD - h, Math.max(PAD, y));
  if (!target) {
    const h = Math.min(cardHeight, vh - PAD * 2);
    return { mode: 'float', side: 'center', width, maxHeight: vh - PAD * 2, left: Math.round((vw - width) / 2), top: Math.round(Math.max(PAD, (vh - h) / 2)) };
  }
  const outline = 8;
  const t = { left: target.left - outline, top: target.top - outline, right: target.left + target.width + outline, bottom: target.top + target.height + outline };
  const below = vh - PAD - (t.bottom + GAP);
  const above = t.top - GAP - PAD;
  const centredX = clampX(target.left + target.width / 2 - width / 2);
  if (cardHeight <= below) return { mode: 'float', side: 'below', width, maxHeight: below, left: centredX, top: t.bottom + GAP };
  if (cardHeight <= above) return { mode: 'float', side: 'above', width, maxHeight: above, left: centredX, top: t.top - GAP - cardHeight };
  // Not enough room above or below: beside the target if a full-width card fits there.
  const right = vw - PAD - (t.right + GAP);
  const left = t.left - GAP - PAD;
  const fullH = Math.min(cardHeight, vh - PAD * 2);
  const midY = clampY(target.top + target.height / 2 - fullH / 2, fullH);
  if (right >= width) return { mode: 'float', side: 'right', width, maxHeight: vh - PAD * 2, left: t.right + GAP, top: midY };
  if (left >= width) return { mode: 'float', side: 'left', width, maxHeight: vh - PAD * 2, left: t.left - GAP - width, top: midY };
  // Otherwise the larger of above/below, with the card made scrollable to fit (size).
  if (below >= above) return { mode: 'float', side: 'below', width, maxHeight: below, left: centredX, top: t.bottom + GAP };
  return { mode: 'float', side: 'above', width, maxHeight: above, left: centredX, top: Math.max(PAD, t.top - GAP - Math.min(cardHeight, above)) };
}
