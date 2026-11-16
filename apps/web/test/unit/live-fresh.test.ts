import { describe, expect, it } from 'vitest';
import { FRESH_MS, freshActivity } from '../../src/components/world/live-ticker';

/** GL3d: the Live panel never shows week-old activity as "live". */
describe('fresh activity', () => {
  it('keeps the last 7 days and drops older items', () => {
    const now = Date.parse('2026-11-16T12:00:00Z');
    const at = (msAgo: number) => ({ createdAt: new Date(now - msAgo).toISOString() });
    expect(freshActivity([at(60_000), at(FRESH_MS - 1), at(FRESH_MS + 1), at(12 * 86_400_000)], now)).toHaveLength(2);
    expect(freshActivity([], now)).toEqual([]);
  });
});
