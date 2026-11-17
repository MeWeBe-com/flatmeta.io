import { describe, expect, it } from 'vitest';
import { optedOut } from '@/lib/funnel';

describe('R3f funnel events honour privacy signals', () => {
  it('opts out on Do Not Track or Global Privacy Control', () => {
    expect(optedOut({ doNotTrack: '1' })).toBe(true);
    expect(optedOut({ globalPrivacyControl: true })).toBe(true);
    expect(optedOut({ doNotTrack: null, globalPrivacyControl: false })).toBe(false);
    expect(optedOut({})).toBe(false);
  });
});
