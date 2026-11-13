import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageShell } from '@/components/site-chrome';
import { INSIGHTS_PER_PAGE, insightList } from '@/lib/insights';
import { Breadcrumbs } from '@/lib/seo';

/**
 * S5: the /insights hub, served by the app (the articles themselves stay static files the insights automation writes
 * under /insights/). Every article, newest first, 20 a page with plain ?page= links, each page its own canonical URL.
 * /insights/ (the automation's old index) redirects here: Next does it for the app, nginx before it reaches the files.
 */
type Props = { searchParams: Promise<{ page?: string }> };
const pageOf = (p?: string) => Math.max(1, Math.min(1000, Math.floor(Number(p)) || 1));
const href = (n: number) => (n > 1 ? `/insights?page=${n}` : '/insights');
const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const page = pageOf((await searchParams).page);
  const any = (await insightList()).length > 0;
  return {
    title: page > 1 ? `Insights · page ${page}` : 'Insights',
    description: 'Articles about finding places on a map, small-business visibility, link-in-bio pages, brands near their headquarters and AI agents that recommend places.',
    alternates: { canonical: href(page) },
    // Nothing to index on a server without the articles folder (development, CI without fixtures).
    ...(any ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function InsightsPage({ searchParams }: Props) {
  const page = pageOf((await searchParams).page);
  const all = await insightList();
  const pages = Math.max(1, Math.ceil(all.length / INSIGHTS_PER_PAGE));
  if (page > pages) notFound();
  const list = all.slice((page - 1) * INSIGHTS_PER_PAGE, page * INSIGHTS_PER_PAGE);
  return (
    <PageShell>
      <Breadcrumbs trail={[{ name: 'Insights', path: '/insights' }, ...(page > 1 ? [{ name: `Page ${page}`, path: href(page) }] : [])]} />
      <div id="main" className="space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl md:text-4xl font-bold">Insights</h1>
          <p className="muted max-w-2xl">
            Notes on local discovery, small-business visibility, creator pages and brands on the map, and how AI agents find places. See the <Link className="underline" href="/explore">plots people made</Link> or <Link className="underline" href="/business">FlatMeta for business</Link>.
          </p>
        </header>
        {list.length === 0 ? (
          <p className="surface p-6 muted">No articles yet.</p>
        ) : (
          <ol className="space-y-3" data-testid="insights-list">
            {list.map((a) => (
              <li key={a.path}>
                {/* A plain link: the article is a static page, not a route of this app. */}
                <a href={a.path} className="surface p-4 block hover:border-[var(--color-teal)]">
                  <span className="block text-xs muted">{fmt(a.date)}</span>
                  <span className="block font-semibold mt-1">{a.title ?? a.path.replace('/insights/', '')}</span>
                  {a.description && <span className="block text-sm muted mt-1 line-clamp-2">{a.description}</span>}
                </a>
              </li>
            ))}
          </ol>
        )}
        {pages > 1 && (
          <nav className="flex items-center gap-3" aria-label="Pages">
            {page > 1 && <Link className="btn-ghost" rel="prev" href={href(page - 1)}>Previous</Link>}
            <span className="text-sm muted">Page {page} of {pages}</span>
            {page < pages && <Link className="btn-ghost" rel="next" href={href(page + 1)}>Next</Link>}
          </nav>
        )}
      </div>
    </PageShell>
  );
}
