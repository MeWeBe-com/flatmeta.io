'use client';
import { useEffect, useState } from 'react';

/**
 * M8: what the on-screen keyboard covers. Phones (iOS Safari, Chrome's default "resizes-visual") keep the layout
 * viewport when the keyboard opens and shrink only the visual viewport, so anything pinned to the bottom of the layout
 * viewport (the claim sheet) ends up under the keyboard. The inset is the part of the layout viewport below the
 * visual one.
 */
export function keyboardInset(innerHeight: number, vv: { height: number; offsetTop: number } | null | undefined): number {
  if (!vv) return 0;
  return Math.max(0, Math.round(innerHeight - (vv.height + vv.offsetTop)));
}

/** The keyboard inset and the visible height, kept up to date from `visualViewport` (0 / innerHeight without it). */
export function useVisualViewport() {
  const [state, setState] = useState({ inset: 0, height: 0 });
  useEffect(() => {
    const vv = window.visualViewport;
    const update = () => setState({ inset: keyboardInset(window.innerHeight, vv), height: Math.round(vv?.height ?? window.innerHeight) });
    update();
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  return state;
}

export interface Pad { top: number; right: number; bottom: number; left: number }

/**
 * M8: the padding that keeps a selection in the part of the map nobody covers: below the header, above the claim
 * sheet (its top edge, measured), with a margin. If the sheet leaves too little room, the padding shrinks so at least
 * `minRoom` px of map stay (MapLibre refuses a fit whose padding is larger than the map).
 */
export function revealPadding(view: { width: number; height: number }, header: number, sheetTop: number | null, margin = 16, minRoom = 96): Pad {
  const top = header + margin;
  let bottom = (sheetTop == null ? 0 : Math.max(0, view.height - sheetTop)) + margin;
  if (view.height - top - bottom < minRoom) bottom = Math.max(margin, view.height - top - minRoom);
  const side = Math.min(32, Math.max(8, (view.width - minRoom) / 2));
  return { top, right: side, bottom, left: side };
}

/** True when every corner (screen px) is inside the view minus the padding. */
export function insidePadded(corners: { x: number; y: number }[], view: { width: number; height: number }, pad: Pad) {
  return corners.every((c) => c.x >= pad.left - 1 && c.x <= view.width - pad.right + 1 && c.y >= pad.top - 1 && c.y <= view.height - pad.bottom + 1);
}
