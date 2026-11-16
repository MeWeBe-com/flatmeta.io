'use client';

import { useEffect, useState } from 'react';

/** Whether the guided tour is open (kept apart from the tour itself, which loads only when it opens). */
export const TOUR_KEY = 'fm-tour-done';

export function useTourState() {
  const [open, setOpen] = useState(false);
  // GL3d: whether this visitor has seen (or skipped) the tour: the location prompt waits until then, so a first visit
  // gets one thing at a time instead of the tour, the prompt and the panels at once.
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(TOUR_KEY)) setSeen(true);
    } catch {
      setSeen(true);
    }
  }, []);
  useEffect(() => {
    // "Replay tour" in the menu of any other page links to /?tour=1.
    if (new URLSearchParams(location.search).get('tour') === '1') {
      setOpen(true);
      history.replaceState(null, '', location.pathname);
      return;
    }
    try {
      if (!localStorage.getItem(TOUR_KEY)) {
        const id = setTimeout(() => setOpen(true), 1600);
        return () => clearTimeout(id);
      }
    } catch {
      /* ignore */
    }
  }, []);
  return {
    open,
    seen,
    start: () => setOpen(true),
    close: () => {
      setOpen(false);
      setSeen(true);
    },
  };
}

