/**
 * QA4: when the home page starts the WebGL map. Creating it (shader compilation, style, tiles) blocks the main thread
 * for seconds on a mid-range phone, so the page first shows the server-rendered hero (it is the LCP) and starts the
 * map only when one of these happens:
 * - a deep link (?at=, ?plot=, ?claim, ?visit=) names a place: start at once;
 * - the visitor does anything (pointer, key, wheel, touch, scroll): start then;
 * - otherwise, the page has been idle for `idleMs` after the load event.
 * Returns a cleanup function. `start` is called at most once.
 */
export const MAP_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

export function wantsMapAtOnce(search: string): boolean {
  const p = new URLSearchParams(search);
  return ['at', 'plot', 'claim', 'visit'].some((k) => p.has(k));
}

export function scheduleMapStart(start: () => void, opts: { win?: Window; idleMs?: number } = {}): () => void {
  const win = opts.win ?? window;
  const idleMs = opts.idleMs ?? 4000;
  let done = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const go = () => {
    if (done) return;
    done = true;
    cleanup();
    start();
  };
  const onLoad = () => {
    timer = setTimeout(() => {
      const ric = (win as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (ric) ric.call(win, go, { timeout: 2000 });
      else go();
    }, idleMs);
  };
  function cleanup() {
    for (const e of MAP_EVENTS) win.removeEventListener(e, go);
    win.removeEventListener('load', onLoad);
    if (timer) clearTimeout(timer);
  }
  if (wantsMapAtOnce(win.location.search)) {
    go();
    return cleanup;
  }
  for (const e of MAP_EVENTS) win.addEventListener(e, go, { passive: true, once: true });
  if (win.document.readyState === 'complete') onLoad();
  else win.addEventListener('load', onLoad, { once: true });
  return cleanup;
}
