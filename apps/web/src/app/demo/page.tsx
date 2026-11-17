import type { Metadata } from 'next';
import Link from 'next/link';
import { Bot, CalendarCheck, Eye, Heart, MapPinned, MessageSquare, Sparkles, Tag } from 'lucide-react';
import { PageShell } from '@/components/site-chrome';
import { OpenNowBadge } from '@/components/plot/open-now';
import { FunnelBeacon } from '@/components/funnel-beacon';
import { Breadcrumbs, siteTitle } from '@/lib/seo';
import { SAMPLE, sampleStructuredData } from '@/lib/demo';

/**
 * R3c: the 30-second demo. A first-time visitor sees, on one screen, what a business gets: the page itself, how it
 * shows on the map, and what an AI assistant reads. The business is a clearly labelled SAMPLE (fictional, never in
 * the sitemap's plot lists, never emitted as real structured data): its JSON-LD is shown as text, not as a script.
 */
export const metadata: Metadata = {
  title: siteTitle('See FlatMeta in 30 seconds: a sample business page'),
  description: 'A sample business page on FlatMeta: hours with an Open now marker, an offer, booking links, a guestbook, its spot on the map, and the structured data AI assistants read.',
  alternates: { canonical: '/demo' },
};

const STEPS = [
  { icon: MapPinned, title: '1. A spot on the real map', body: 'The page sits on the squares around the real address and glows on the map, from the globe down to the street.' },
  { icon: Sparkles, title: '2. A page you design in minutes', body: 'Cover, story, hours, an offer and links. The AI Designer drafts it from one sentence.' },
  { icon: Bot, title: '3. Read by people and AI', body: 'Every page is schema.org data in our sitemaps and our MCP server, so assistants can recommend it.' },
];

export default function DemoPage() {
  const s = SAMPLE;
  return (
    <PageShell wide>
      <Breadcrumbs trail={[{ name: 'Demo', path: '/demo' }]} />
      <FunnelBeacon event="demo_view" />
      <div id="main" className="space-y-12">
        <header className="text-center max-w-3xl mx-auto pt-4 space-y-4">
          <span className="chip chip-teal">30-second demo</span>
          <h1 className="text-4xl md:text-5xl font-bold">This is what a business gets on FlatMeta</h1>
          <p className="muted text-lg">Below is a <strong>sample</strong> page for a made-up café, built with the same parts as every real page. Yours takes a few minutes, and your first land is free.</p>
        </header>

        <section aria-labelledby="sample-h" className="grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-6 items-start" data-testid="demo-sample">
          <article className="surface overflow-hidden">
            <div className="relative aspect-[16/7] bg-gradient-to-br from-[#2de2c4]/40 via-[#7a5cff]/30 to-[#ff6b6b]/30 grid place-items-center">
              <span className="absolute left-3 top-3 chip chip-gold">Sample page</span>
              <span className="font-display text-3xl md:text-5xl font-bold drop-shadow">{s.name}</span>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="sample-h" className="text-2xl font-bold mr-2">{s.name}</h2>
                <span className="chip">Verified business (sample)</span>
                <OpenNowBadge hours={s.hours} timezone={s.timezone} />
              </div>
              <p className="muted">{s.tagline}</p>
              <div className="surface p-4 flex items-start gap-3 border-[var(--color-gold)]/40">
                <Tag size={18} className="text-[var(--color-gold)] mt-0.5" aria-hidden="true" />
                <div>
                  <div className="font-semibold">{s.offer.title}</div>
                  <div className="text-sm muted">{s.offer.body}</div>
                </div>
              </div>
              <dl className="grid sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="font-semibold">Hours</dt>
                  <dd className="muted">{s.hoursText}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Address</dt>
                  <dd className="muted">{s.address}</dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-2">
                <span className="btn-primary btn-sm pointer-events-none" aria-disabled="true"><CalendarCheck size={14} /> Book a table</span>
                <span className="btn-ghost btn-sm pointer-events-none" aria-disabled="true">Menu</span>
                <span className="btn-ghost btn-sm pointer-events-none" aria-disabled="true">Directions</span>
              </div>
              <div className="flex gap-4 text-sm muted border-t border-[var(--line)] pt-3">
                <span className="inline-flex items-center gap-1"><Eye size={14} aria-hidden="true" /> visits this week</span>
                <span className="inline-flex items-center gap-1"><Heart size={14} aria-hidden="true" /> likes</span>
                <span className="inline-flex items-center gap-1"><MessageSquare size={14} aria-hidden="true" /> guestbook</span>
              </div>
              <p className="text-xs muted">The owner sees visits, likes and guestbook notes in the dashboard. A sample has no visitors, so we show no numbers.</p>
            </div>
          </article>

          <aside className="space-y-4">
            <div className="surface p-5 space-y-3">
              <h2 className="font-bold text-lg flex items-center gap-2"><Bot size={18} className="text-[var(--color-teal)]" aria-hidden="true" /> What an AI assistant reads</h2>
              <p className="text-sm muted">The same page, as structured data. Search engines and AI agents read this from every real page, and from our MCP server.</p>
              <pre className="text-xs overflow-x-auto rounded-xl bg-black/30 p-3 max-h-72" data-testid="demo-jsonld"><code>{JSON.stringify(sampleStructuredData(), null, 2)}</code></pre>
            </div>
            <div className="surface p-5 space-y-2">
              <h2 className="font-bold text-lg">Ask FlatMeta, the way an agent does</h2>
              <p className="text-sm muted">A real request to our public API, with real places:</p>
              <a className="underline text-sm break-all" href="/api/v1/ask?q=cafes%20in%20Lisbon" rel="nofollow">/api/v1/ask?q=cafes in Lisbon</a>
            </div>
          </aside>
        </section>

        <section aria-labelledby="how-h" className="space-y-4">
          <h2 id="how-h" className="text-2xl md:text-3xl font-bold">How it works</h2>
          <ol className="grid md:grid-cols-3 gap-4">
            {STEPS.map((x) => (
              <li key={x.title} className="surface p-5">
                <x.icon size={20} className="text-[var(--color-teal)]" aria-hidden="true" />
                <h3 className="font-semibold mt-2">{x.title}</h3>
                <p className="text-sm muted mt-1">{x.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="surface p-6 md:p-8 text-center space-y-4" aria-labelledby="cta-h">
          <h2 id="cta-h" className="text-2xl md:text-3xl font-bold">Make yours now</h2>
          <p className="muted max-w-xl mx-auto">Pick your spot on the map and publish a page in a few minutes. No card needed for your first land.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/?claim" className="btn-primary btn-lg">Claim your free plot</Link>
            <Link href="/brands" className="btn-ghost btn-lg">Is my company already on the map?</Link>
            <Link href="/pricing" className="btn-ghost btn-lg">Pricing</Link>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
