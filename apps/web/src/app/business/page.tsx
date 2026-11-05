import type { Metadata } from 'next';
import Link from 'next/link';
import { BadgeCheck, Bot, Clock, LineChart, MapPinned, Megaphone, Sparkles, Users } from 'lucide-react';
import { PageShell } from '@/components/site-chrome';
import { PlotGrid } from '@/components/ui';
import { serverApi } from '@/lib/server-api';
import type { Plot } from '@/lib/types';

export const metadata: Metadata = {
  alternates: { canonical: '/business' },
  title: 'FlatMeta for business and brands',
  description: 'Be the place people and AI agents find on the map. A beautiful, verified business plot with offers, hours and leads, and showcase landmarks for brands.',
};

const FEATURES = [
  { icon: MapPinned, title: 'Your spot on the living map', body: 'A glowing plot on the exact block where your customers are, visible from the globe down to the street.' },
  { icon: Sparkles, title: 'Designed by AI in a minute', body: 'Describe your place; the AI Designer writes the copy and paints original artwork. Three options, one click.' },
  { icon: Bot, title: 'Readable by AI agents', body: 'Every plot is clean, structured data (schema.org LocalBusiness) and available over our MCP server, so assistants can recommend you.' },
  { icon: Clock, title: 'Hours, offers and "Open now"', body: 'Opening hours, a live open/closed badge, booking links and a featured offer that changes when you want.' },
  { icon: BadgeCheck, title: 'Verified badge', body: 'A verified business or brand badge on your plot, your organisation page and everywhere you appear.' },
  { icon: Megaphone, title: 'Spotlight and Beacons', body: 'Glow brighter on the map and appear first in your city and country when it matters most.' },
  { icon: LineChart, title: 'Visits and likes', body: 'See how many explorers visit, like and sign your guestbook. Campaign analytics are coming next.' },
  { icon: Users, title: 'Team seats', body: 'Invite your team to edit plots for your organisation, with roles for owners, admins and editors.' },
];

export default async function BusinessPage() {
  const showcase = await serverApi<{ plots: Plot[] }>('/plots?kind=showcase&sort=loved&limit=8', { auth: false, revalidate: 300 }).catch(() => null);
  return (
    <PageShell wide>
      <div id="main" className="space-y-20">
        <section className="text-center max-w-3xl mx-auto pt-6">
          <span className="chip chip-teal">For local businesses &amp; brands</span>
          <h1 className="text-4xl md:text-6xl font-bold mt-4">Be the place people <span className="text-gradient">and AI</span> find on the map</h1>
          <p className="muted text-lg mt-4">More people ask AI assistants for local recommendations every month. FlatMeta gives your business a beautiful, verified home on a playful world map, built as structured data that search engines and AI agents read.</p>
          <div className="flex flex-wrap justify-center gap-3 mt-8">
            <Link href="/pricing" className="btn-primary btn-lg">See Business plans</Link>
            <Link href="/?claim" className="btn-ghost btn-lg">Claim your spot</Link>
          </div>
        </section>
        <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="surface p-6">
              <span className="size-11 rounded-2xl grid place-items-center bg-[rgb(45_226_196/.1)] text-[var(--color-teal)]"><f.icon size={20} /></span>
              <h3 className="font-semibold mt-4">{f.title}</h3>
              <p className="text-sm muted mt-1">{f.body}</p>
            </div>
          ))}
        </section>
        <section className="space-y-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold">Brands: your landmark is waiting</h2>
            <p className="muted mt-2">We’ve built sample showcase plots for well-known organisations to show what’s possible. They’re clearly labelled as unclaimed and not affiliated. If one is yours, verify with your work email and make it official, or ask us to remove it.</p>
          </div>
          {showcase && <PlotGrid plots={showcase.plots} />}
          <div className="surface p-6 flex flex-col md:flex-row gap-4 md:items-center">
            <div className="flex-1">
              <h3 className="text-xl font-bold">Claim a landmark</h3>
              <p className="muted text-sm mt-1">Find your organisation on the map, press “Claim it”, verify with an email at your company’s domain, and the plot becomes yours, with 3 months of the Brand plan included.</p>
            </div>
            <Link href="/explore?tab=showcase" className="btn-gold btn-lg">Find your landmark</Link>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
