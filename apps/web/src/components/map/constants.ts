/** Map constants the page shell needs without loading MapLibre (M2: the map's code loads after first paint). */
export const AVATAR_MIN_ZOOM = 6.5;

/** WebGL is needed for the map; without it the page doesn't download MapLibre at all. */
export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
