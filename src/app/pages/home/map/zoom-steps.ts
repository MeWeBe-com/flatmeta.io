import * as Leaflet from 'leaflet';

/**
 * The brief allows exactly three zoom levels, whatever the input: mouse wheel,
 * trackpad, the +/- buttons or a phone pinch. Native Leaflet wheel/pinch zoom
 * is turned off and every gesture becomes one step up or down.
 */
export function attachZoomSteps(map: Leaflet.Map, step: (direction: 1 | -1) => void): () => void {
  const container = map.getContainer();
  let lastEvent = 0;
  let lastStep = 0;
  let accum = 0;

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const now = Date.now();
    // Trackpads send many small deltas: add them up and take one step per gesture.
    if (now - lastEvent > 250) accum = 0;
    lastEvent = now;
    accum += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    if (Math.abs(accum) < 40 || now - lastStep < 500) return;
    lastStep = now;
    const dir = accum < 0 ? 1 : -1;
    accum = 0;
    step(dir);
  };

  let startDist = 0;
  let lastDist = 0;
  const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      startDist = lastDist = dist(e.touches);
    }
  };
  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 2 && startDist) {
      lastDist = dist(e.touches);
      e.preventDefault();
    }
  };
  const onTouchEnd = (e: TouchEvent) => {
    if (!startDist || e.touches.length >= 2) return;
    const ratio = lastDist / startDist;
    startDist = 0;
    if (ratio > 1.25) step(1);
    else if (ratio < 0.8) step(-1);
  };

  container.addEventListener('wheel', onWheel, { passive: false });
  container.addEventListener('touchstart', onTouchStart, { passive: true });
  container.addEventListener('touchmove', onTouchMove, { passive: false });
  container.addEventListener('touchend', onTouchEnd, { passive: true });
  container.addEventListener('touchcancel', onTouchEnd, { passive: true });

  return () => {
    container.removeEventListener('wheel', onWheel);
    container.removeEventListener('touchstart', onTouchStart);
    container.removeEventListener('touchmove', onTouchMove);
    container.removeEventListener('touchend', onTouchEnd);
    container.removeEventListener('touchcancel', onTouchEnd);
  };
}
