import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearNearestCache, nearestPlots } from '../../src/lib/nearest';

/** M2: /plots/nearest is requested once per place, however many parts of the page ask for it. */
describe('nearestPlots', () => {
  beforeEach(() => clearNearestCache());
  const ok = (plots: unknown[]) => vi.fn(async () => new Response(JSON.stringify({ plots }), { status: 200 }));

  it('shares one request between callers asking for the same place (≈1 km) at the same time, and caches it', async () => {
    const f = ok([{ id: 'a', distanceKm: 3 }]);
    const [a, b, c] = await Promise.all([nearestPlots(28.601, 65.301, 6, undefined, f), nearestPlots(28.6049, 65.2951, 6, undefined, f), nearestPlots(28.6, 65.3, 6, undefined, f)]);
    expect(f).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(c).toEqual(a);
    await nearestPlots(28.6, 65.3, 6, undefined, f); // later: from the cache
    expect(f).toHaveBeenCalledTimes(1);
    await nearestPlots(51.5, -0.12, 6, undefined, f); // another place: a new request
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('an aborted caller stops waiting; the others still get the answer', async () => {
    let release!: () => void;
    const f = vi.fn(() => new Promise<Response>((r) => (release = () => r(new Response(JSON.stringify({ plots: [{ id: 'x' }] }))))));
    const ctl = new AbortController();
    const gone = nearestPlots(10, 10, 6, ctl.signal, f as unknown as typeof fetch);
    const kept = nearestPlots(10, 10, 6, undefined, f as unknown as typeof fetch);
    ctl.abort();
    await expect(gone).rejects.toBeDefined();
    release();
    await expect(kept).resolves.toEqual([{ id: 'x' }]);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failure', async () => {
    const f = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(new Response(JSON.stringify({ plots: [] })));
    expect(await nearestPlots(1, 1, 6, undefined, f)).toEqual([]);
    await nearestPlots(1, 1, 6, undefined, f);
    expect(f).toHaveBeenCalledTimes(2);
  });
});
