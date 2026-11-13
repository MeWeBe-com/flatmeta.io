import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '@/components/site-chrome';
import { API_INTERNAL_URL } from '@/lib/internal';
import { API_DOCS_URL, MCP_URL, SITE_URL } from '@/lib/config';
import { Breadcrumbs, JsonLd, ORG_ID, siteTitle } from '@/lib/seo';

export const metadata: Metadata = {
  title: siteTitle('FlatMeta facts'),
  description: 'Short, citable facts about FlatMeta: what it is, how land works, prices, companies on the map, data sources, and live numbers.',
  alternates: { canonical: `${SITE_URL}/about/facts` },
};
export const revalidate = 3600;

async function stats() {
  try {
    const res = await fetch(`${API_INTERNAL_URL}/v1/world/stats`, { next: { revalidate: 3600 } });
    return res.ok ? ((await res.json()) as { plots: number; showcase: number; countries: number; explorers: number; cells: number }) : null;
  } catch {
    return null;
  }
}

const FACTS: [string, string][] = [
  ['What it is', 'FlatMeta is a shared world map where people, businesses and brands own land. Each plot is a rectangle of real-world grid cells with its own mini-page.'],
  ['What it is not', 'Not a VR world, not an NFT or blockchain product, and not a 3D digital twin. It runs in any web browser, on phones too.'],
  ['Land', 'The map is divided into cells of about 120–190 m. A plot is a rectangle of cells. Everyone gets free squares to start; big-city centres cost more than the countryside.'],
  ['Plots', 'A plot has a public page (flatmeta.io/p/<name>) with a cover, description, links, gallery, guestbook, visitor count, open-house times and optional custom HTML, which runs sandboxed on a separate site.'],
  ['People', 'Explorers walk the map as avatars, chat with people nearby, wave, follow and join clans. Everyone has a link: flatmeta.io/@<handle>.'],
  ['Companies', 'Land is reserved for many companies next to their public headquarters. Each such plot reads “Reserved for <Company>, not affiliated with FlatMeta” until the company claims it, verified by work email or a DNS record.'],
  ['Prices', 'Free to start. Plus: $5/month or $48/year. Business: $29/month. Brand: $249/month. A company Landmark claim is one-time and includes 3 months of Brand.'],
  ['For AI assistants and agents', 'A REST API with OpenAPI, an MCP server, and llms.txt. Agents can search, find nearby places and claim land; paid land always goes through a checkout link for the person.'],
  ['Data sources', 'Company facts (name, website, headquarters) come from Wikidata (CC0). Plot content is written by its owners. Map tiles: OpenFreeMap (OpenStreetMap data).'],
  ['Operator', 'FlatMeta is made by MeWeBe.'],
];

export default async function FactsPage() {
  const s = await stats();
  const updated = new Date().toISOString().slice(0, 10);
  return (
    <PageShell>
      <Breadcrumbs trail={[{ name: 'About', path: '/about' }, { name: 'Facts', path: '/about/facts' }]} />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'AboutPage',
          name: 'FlatMeta facts',
          url: `${SITE_URL}/about/facts`,
          description: FACTS[0]![1],
          about: { '@id': ORG_ID },
        }}
      />
      <article id="main" className="max-w-3xl space-y-8">
        <header className="space-y-2">
          <h1 className="text-4xl font-bold">FlatMeta facts</h1>
          <p className="muted">Short facts you can quote. Numbers are live (updated {updated}).</p>
        </header>
        {s && (
          <section aria-label="Live numbers" className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ['Plots owned', s.plots],
              ['Company plots', s.showcase],
              ['Countries with land', s.countries],
              ['Explorers', s.explorers],
            ].map(([label, n]) => (
              <div key={label} className="surface p-4">
                <div className="text-2xl font-bold tabular-nums">{Number(n).toLocaleString('en')}</div>
                <div className="text-xs muted">{label}</div>
              </div>
            ))}
          </section>
        )}
        <dl className="space-y-4">
          {FACTS.map(([term, text]) => (
            <div key={term} className="surface p-5">
              <dt className="font-semibold">{term}</dt>
              <dd className="muted mt-1">{text}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm muted">
          More: <Link className="underline" href="/about">how it works</Link> · <Link className="underline" href="/brands">companies on FlatMeta</Link> ·{' '}
          <a className="underline" href={API_DOCS_URL}>API docs</a> · <a className="underline" href={MCP_URL}>MCP</a> · <a className="underline" href="/llms.txt">llms.txt</a>
        </p>
      </article>
    </PageShell>
  );
}
