import { describe, expect, it } from 'vitest';
import { CUSTOMER_STORIES, publishableStories, type CustomerStory } from '@/data/customer-stories';

const base: CustomerStory = { slug: 'a', company: 'Acme Café', plotSlug: 'acme', person: 'Ana', role: 'Owner', quote: 'Great.', result: '12 bookings', logoUrl: '/l.png', permission: null };

describe('R3d customer stories need written permission', () => {
  it('ships with no stories (nothing invented)', () => {
    expect(publishableStories(CUSTOMER_STORIES)).toEqual([]);
  });
  it('hides stories without a recorded permission, or one that does not cover the quote and the name', () => {
    expect(publishableStories([base])).toEqual([]);
    expect(publishableStories([{ ...base, permission: { grantedBy: '', date: '2026-11-17', covers: ['quote', 'name'] } }])).toEqual([]);
    expect(publishableStories([{ ...base, permission: { grantedBy: 'Ana (email)', date: '17/11/2026', covers: ['quote', 'name'] } }])).toEqual([]);
    expect(publishableStories([{ ...base, permission: { grantedBy: 'Ana (email)', date: '2026-11-17', covers: ['quote'] } }])).toEqual([]);
  });
  it('shows the logo and the result only when the permission covers them', () => {
    const [s] = publishableStories([{ ...base, permission: { grantedBy: 'Ana (email)', date: '2026-11-17', covers: ['quote', 'name'] } }]);
    expect(s).toMatchObject({ quote: 'Great.', logoUrl: undefined, result: undefined });
    const [t] = publishableStories([{ ...base, permission: { grantedBy: 'Ana (email)', date: '2026-11-17', covers: ['quote', 'name', 'logo', 'result'] } }]);
    expect(t).toMatchObject({ logoUrl: '/l.png', result: '12 bookings' });
  });
});
