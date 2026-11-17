import Link from 'next/link';
import { Award, Quote } from 'lucide-react';
import { CUSTOMER_STORIES, publishableStories } from '@/data/customer-stories';

/**
 * R3d: social proof that is real.
 * - The founding-customer block counts real places taken (verified company claims + active Business/Brand
 *   subscriptions, from the API) and states what founders get. A discount appears only when LAUNCH_OFFER (the
 *   Stripe promotion code the owner created) is set.
 * - Customer stories render only entries with written permission recorded in src/data/customer-stories.ts. With
 *   none, nothing is shown: no placeholder logos, no invented quotes.
 */
export interface Founding { total: number; taken: number; left: number }

export function FoundingOffer({ founding, launchOffer }: { founding?: Founding | null; launchOffer?: string | null }) {
  if (!founding || founding.left <= 0) return null;
  return (
    <section aria-labelledby="founding-h" className="surface p-6 md:p-8 border-[var(--color-gold)]/40 space-y-4" data-testid="founding-offer">
      <div className="flex flex-wrap items-center gap-3">
        <Award size={22} className="text-[var(--color-gold)]" aria-hidden="true" />
        <h2 id="founding-h" className="text-2xl font-bold">Become a founding customer</h2>
        <span className="chip chip-gold" data-testid="founding-left">
          {founding.left} of {founding.total} places left
        </span>
      </div>
      <p className="muted">The first {founding.total} businesses and companies on FlatMeta are our founding customers. A place is taken when a company verifies its page or a business starts a Business or Brand plan.</p>
      <ul className="grid sm:grid-cols-2 gap-2 text-sm">
        {launchOffer && <li className="font-semibold text-[var(--color-gold)]">{launchOffer}</li>}
        <li>Your story featured on our blog and social channels, if you want it (you approve every word).</li>
        <li>A direct line to the team: replies within one working day.</li>
        <li>A say in what we build next: founders get the roadmap first.</li>
        <li>Cancel any time. Land you claim stays yours.</li>
      </ul>
      <div className="flex flex-wrap gap-3">
        <Link href="/brands" className="btn-primary">Claim your company’s page</Link>
        <Link href="/?claim" className="btn-ghost">Claim a spot for your business</Link>
      </div>
    </section>
  );
}

export function CustomerStories() {
  const stories = publishableStories(CUSTOMER_STORIES);
  if (!stories.length) return null;
  return (
    <section aria-labelledby="stories-h" className="space-y-4" data-testid="customer-stories">
      <h2 id="stories-h" className="text-2xl md:text-3xl font-bold">Customers on FlatMeta</h2>
      <div className="grid md:grid-cols-2 gap-4">
        {stories.map((s) => (
          <figure key={s.slug} className="surface p-5 space-y-3">
            <Quote size={18} className="text-[var(--color-teal)]" aria-hidden="true" />
            <blockquote className="text-lg">{s.quote}</blockquote>
            <figcaption className="text-sm muted">
              {s.person}, {s.role} at{' '}
              <Link className="underline" href={`/p/${s.plotSlug}`}>
                {s.company}
              </Link>
              {s.result && <span className="block mt-1">{s.result}</span>}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
