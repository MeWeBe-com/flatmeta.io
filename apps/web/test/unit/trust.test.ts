import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

/** GL3c: the FAQ states the real policy and the current claim price. */
describe('trust FAQ', () => {
  it('answers the buyer questions, and says the company claim is free only when it is', async () => {
    const { faqItems } = await import('../../src/components/trust');
    const free = faqItems({ claimFree: true });
    expect(free.map((i) => i.q)).toEqual([
      'Is FlatMeta crypto, NFTs or a virtual real-estate investment?',
      'What does a business get?',
      'Our company already has a plot. What does that mean?',
      'Can I cancel?',
      'Can I get a refund?',
      'How do I pay, and is it secure?',
    ]);
    expect(free[2]!.a).toMatch(/claim it free/);
    expect(faqItems({ claimFree: false })[2]!.a).not.toMatch(/free/);
    // The refund answer matches the Payments & Refunds page (14 days for land; no part-period subscription refunds).
    expect(free[4]!.a).toMatch(/14 days/);
    expect(free[0]!.a).toMatch(/No\. There are no tokens/);
  });
});
