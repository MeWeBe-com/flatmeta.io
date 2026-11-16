import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS script (scripts/weekly-report.mjs), tested for its pure renderer
import { renderReport, usd } from '../../../../scripts/weekly-report.mjs';

const base = { base: 'https://x.test', date: '2026-11-16', commits: ['abc1234 feat(GL7): pages'], runs: [], generatedAt: 0 };

describe('GL8 weekly CEO report', () => {
  it('says "not available" instead of guessing when a source is missing', () => {
    const md = renderReport({ ...base, health: null, stats: null, admin: null, sitemapUrls: null });
    expect(md).toContain('health DOWN or unknown');
    expect(md).toContain('| Revenue, last 30 days | not available |');
    expect(md).toContain('| Plots (people) | not available |');
    expect(md).toContain('Daily QA and SEO runs: not available');
    expect(md).toContain('- abc1234 feat(GL7): pages');
  });
  it('fills in real numbers and the run links', () => {
    const md = renderReport({
      ...base,
      health: { ok: true, release: 'abc1234' },
      stats: { plots: 12, showcase: 369, explorers: 40, countries: 9 },
      admin: { users: { new30: 7 }, plots: { published: 10 }, revenue: { orders30: 2, last30: 9900, activeSubscriptions: 1 }, queues: { moderation: 0, claims: 1, takedowns: 0 }, series: { signups: [{ day: '2026-11-15', n: 3 }] } },
      sitemapUrls: 500,
      runs: [{ name: 'Daily QA (live)', conclusion: 'success', date: '2026-11-16', url: 'https://github.test/run/1' }],
    });
    expect(md).toContain('live release `abc1234` · health OK');
    expect(md).toContain('| Revenue, last 30 days | $99.00 |');
    expect(md).toContain('| Open queues (moderation / claims / takedowns) | 0 / 1 / 0 |');
    expect(md).toContain('Sign-ups by day (14 days): 11-15 3');
    expect(md).toContain('- Daily QA (live): last run success (2026-11-16) https://github.test/run/1');
    expect(usd(123456)).toBe('$1,234.56');
  });
});
