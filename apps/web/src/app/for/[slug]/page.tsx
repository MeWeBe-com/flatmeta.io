import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Check } from 'lucide-react';
import { PageShell } from '@/components/site-chrome';
import { PaymentTrust, TrustStats } from '@/components/trust';
import { Breadcrumbs, JsonLd, siteTitle } from '@/lib/seo';
import { COMPARE_PAGES, FOR_PAGES, faqJsonLd } from '@/lib/landing';

/** GL7: buyer-intent landing pages: /for/local-businesses, /for/brands, /for/creators. */
export const dynamicParams = false;
export const generateStaticParams = () => FOR_PAGES.map((p) => ({ slug: p.slug }));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = FOR_PAGES.find((p) => p.slug === slug);
  if (!page) return {};
  return { title: siteTitle(page.title), description: page.description, alternates: { canonical: `/for/${page.slug}` }, openGraph: { title: page.title, description: page.description } };
}

export default async function ForPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = FOR_PAGES.find((p) => p.slug === slug);
  if (!page) notFound();
  return (
    <PageShell wide>
      <Breadcrumbs trail={[{ name: page.chip, path: `/for/${page.slug}` }]} />
      <JsonLd data={faqJsonLd(page.faq)} />
      <div id="main" className="space-y-14">
        <section className="text-center max-w-3xl mx-auto pt-6">
          <span className="chip chip-teal">{page.chip}</span>
          <h1 className="text-4xl md:text-5xl font-bold mt-4">{page.h1}</h1>
          <p className="muted text-lg mt-4">{page.intro}</p>
          <div className="flex flex-wrap justify-center gap-3 mt-8">
            <Link href={page.cta.href} className="btn-primary btn-lg">{page.cta.label}</Link>
            <Link href="/pricing" className="btn-ghost btn-lg">See pricing</Link>
          </div>
        </section>
        <TrustStats />
        <section className="grid sm:grid-cols-2 gap-4" aria-label="What you get">
          {page.points.map((pt) => (
            <div key={pt.title} className="surface p-5">
              <h2 className="font-semibold flex items-center gap-2"><Check size={18} className="text-[var(--color-teal)]" aria-hidden="true" />{pt.title}</h2>
              <p className="text-sm muted mt-1">{pt.body}</p>
            </div>
          ))}
        </section>
        <section aria-labelledby="faq" className="space-y-3 max-w-3xl mx-auto">
          <h2 id="faq" className="text-2xl font-bold">Questions</h2>
          {page.faq.map((f) => (
            <div key={f.q} className="surface p-4">
              <h3 className="font-semibold">{f.q}</h3>
              <p className="text-sm muted mt-1">{f.a}</p>
            </div>
          ))}
        </section>
        <section className="text-center space-y-3" aria-label="Compare">
          <p className="muted text-sm">How FlatMeta compares:</p>
          <div className="flex flex-wrap justify-center gap-2">
            {COMPARE_PAGES.map((c) => (
              <Link key={c.slug} href={`/compare/${c.slug}`} className="chip tap">FlatMeta vs {c.other}</Link>
            ))}
          </div>
        </section>
        <PaymentTrust />
      </div>
    </PageShell>
  );
}
