'use client';

import { useEffect, useState } from 'react';

/** Whether the guided tour is open (kept apart from the tour itself, which loads only when it opens). */
export const TOUR_KEY = 'fm-tour-done';

export function useTourState() {
  const [open, setOpen] = useState(false);
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
  return { open, start: () => setOpen(true), close: () => setOpen(false) };
}

