import { describe, expect, it, vi } from 'vitest';
import { scheduleMapStart, wantsMapAtOnce } from '@/lib/lazy-map';

/** QA4: the home map starts after first paint: on interaction, a deep link, or when the page is idle. */
function fakeWindow(search = '', readyState = 'loading') {
  const target = new EventTarget();
  return Object.assign(target, { location: { search }, document: { readyState } }) as unknown as Window;
}

describe('QA4 lazy map start', () => {
  it('deep links start the map at once', () => {
    expect(wantsMapAtOnce('?at=38.7,-9.1,15')).toBe(true);
    expect(wantsMapAtOnce('?plot=flatmeta-hq')).toBe(true);
    expect(wantsMapAtOnce('?claim')).toBe(true);
    expect(wantsMapAtOnce('')).toBe(false);
    const start = vi.fn();
    scheduleMapStart(start, { win: fakeWindow('?claim') });
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('the first interaction starts it, once', () => {
    const win = fakeWindow();
    const start = vi.fn();
    scheduleMapStart(start, { win, idleMs: 60_000 });
    expect(start).not.toHaveBeenCalled();
    win.dispatchEvent(new Event('pointermove'));
    win.dispatchEvent(new Event('keydown'));
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('otherwise it starts once the page has been idle after load; cleanup cancels it', () => {
    vi.useFakeTimers();
    try {
      const win = fakeWindow();
      const start = vi.fn();
      scheduleMapStart(start, { win, idleMs: 4000 });
      vi.advanceTimersByTime(10_000);
      expect(start).not.toHaveBeenCalled(); // not before the load event
      win.dispatchEvent(new Event('load'));
      vi.advanceTimersByTime(3999);
      expect(start).not.toHaveBeenCalled();
      vi.advanceTimersByTime(2);
      expect(start).toHaveBeenCalledTimes(1);

      const win2 = fakeWindow('', 'complete');
      const start2 = vi.fn();
      const cleanup = scheduleMapStart(start2, { win: win2, idleMs: 4000 });
      cleanup();
      vi.advanceTimersByTime(10_000);
      win2.dispatchEvent(new Event('pointerdown'));
      expect(start2).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
