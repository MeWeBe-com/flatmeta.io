import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageShell } from '@/components/site-chrome';
import { Breadcrumbs, JsonLd, siteTitle } from '@/lib/seo';
import { COMPARE_PAGES, FOR_PAGES, faqJsonLd } from '@/lib/landing';

/** GL7: fair "FlatMeta vs X" pages: /compare/google-business-profile, /compare/linktree, /compare/earth2. */
export const dynamicParams = false;
export const generateStaticParams = () => COMPARE_PAGES.map((c) => ({ slug: c.slug }));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const c = COMPARE_PAGES.find((x) => x.slug === slug);
  if (!c) return {};
  return { title: siteTitle(c.title), description: c.description, alternates: { canonical: `/compare/${c.slug}` }, openGraph: { title: c.title, description: c.description } };
}

export default async function ComparePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = COMPARE_PAGES.find((x) => x.slug === slug);
  if (!c) notFound();
  return (
    <PageShell>
      <Breadcrumbs trail={[{ name: `FlatMeta vs ${c.other}`, path: `/compare/${c.slug}` }]} />
      <JsonLd data={faqJsonLd(c.faq)} />
      <article id="main" className="space-y-10 max-w-3xl mx-auto">
        <header className="pt-6 space-y-4">
          <span className="chip chip-teal">Comparison</span>
          <h1 className="text-3xl md:text-5xl font-bold">{c.title}</h1>
          <p className="muted text-lg">{c.summary}</p>
        </header>
        <div className="surface overflow-x-auto">
          <table className="w-full text-sm" data-testid="compare-table">
            <caption className="sr-only">FlatMeta compared with {c.other}</caption>
            <thead>
              <tr className="text-left border-b border-[var(--line)]">
                <th scope="col" className="p-3 w-1/4"><span className="sr-only">Feature</span></th>
                <th scope="col" className="p-3">FlatMeta</th>
                <th scope="col" className="p-3">{c.other}</th>
              </tr>
            </thead>
            <tbody>
              {c.rows.map((r) => (
                <tr key={r.label} className="border-b border-[var(--line)] last:border-0 align-top">
                  <th scope="row" className="p-3 text-left font-semibold">{r.label}</th>
                  <td className="p-3">{r.flatmeta}</td>
                  <td className="p-3 muted">{r.other}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <section className="surface p-5">
          <h2 className="font-bold text-xl">Our honest take</h2>
          <p className="mt-2">{c.verdict}</p>
          <p className="text-xs muted mt-3">{c.other} details are from its public website, checked in November 2026. Features and prices change; check their site for the latest. {c.other} is a trademark of its owner; FlatMeta is not affiliated with it.</p>
        </section>
        <section aria-labelledby="faq" className="space-y-3">
          <h2 id="faq" className="text-2xl font-bold">Questions</h2>
          {c.faq.map((f) => (
            <div key={f.q} className="surface p-4">
              <h3 className="font-semibold">{f.q}</h3>
              <p className="text-sm muted mt-1">{f.a}</p>
            </div>
          ))}
        </section>
        <div className="flex flex-wrap gap-3">
          <Link href="/?claim" className="btn-primary">Claim free land</Link>
          {FOR_PAGES.slice(0, 2).map((p) => (
            <Link key={p.slug} href={`/for/${p.slug}`} className="btn-ghost">{p.chip}</Link>
          ))}
        </div>
      </article>
    </PageShell>
  );
}
