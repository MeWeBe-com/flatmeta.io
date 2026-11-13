import type { Plot } from './types';

export type NearPlot = Plot & { distanceKm: number };

/**
 * The nearest plots to a point (M2), shared by the "Nearby" card and the first-visit camera. One request per
 * position bucket (about 1 km) and limit: callers that ask for the same place at the same time share the request,
 * and later callers get the cached answer for 5 minutes. It used to be fetched on every re-render (8+ times a load).
 */
const TTL = 5 * 60_000;
const cache = new Map<string, { at: number; promise: Promise<NearPlot[]> }>();

export const nearestKey = (lat: number, lng: number, limit: number) => `${lat.toFixed(2)},${lng.toFixed(2)},${limit}`;

export function nearestPlots(lat: number, lng: number, limit = 6, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<NearPlot[]> {
  const key = nearestKey(lat, lng, limit);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return withAbort(hit.promise, signal);
  const promise = fetcher(`/api/v1/plots/nearest?lat=${lat.toFixed(2)}&lng=${lng.toFixed(2)}&limit=${limit}`)
    .then((r) => (r.ok ? (r.json() as Promise<{ plots: NearPlot[] }>) : { plots: [] }))
    .then((r) => r.plots)
    .catch(() => {
      cache.delete(key); // a failure isn't cached
      return [] as NearPlot[];
    });
  cache.set(key, { at: Date.now(), promise });
  if (cache.size > 50) cache.delete(cache.keys().next().value!);
  return withAbort(promise, signal);
}

/** The shared request keeps going for the other callers; only this caller stops waiting. */
function withAbort<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return p;
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    p.then(resolve, reject);
  });
}

export function clearNearestCache() {
  cache.clear();
}
