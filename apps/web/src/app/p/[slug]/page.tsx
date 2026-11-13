import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Clock, ExternalLink, Mail, MapPin, Phone, Tag, CalendarCheck } from 'lucide-react';
import { PageShell } from '@/components/site-chrome';
import { PlotActions } from '@/components/plot/plot-actions';
import { Markdown } from '@/components/markdown';
import { LogoAdminToggle } from '@/components/plot/logo-admin';
import { OpenHouses } from '@/components/plot/open-houses';
import { PlotMarket } from '@/components/plot/plot-market';
import { ReportCustomHtml } from '@/components/plot/report-custom-html';
import { sandboxSrc } from '@/lib/sandbox';
import { Guestbook } from '@/components/plot/guestbook';
import { MiniMapLazy } from '@/components/plot/mini-map-lazy';
import { KindChip, PlotCard } from '@/components/ui';
import { OpenNowBadge } from '@/components/plot/open-now';
import { serverApi } from '@/lib/server-api';
import { flag, TIER_COLOR, TIER_LABEL, compact } from '@/lib/format';
import { JsonLd, plotJsonLd, plotMetaDescription, plotTitle, plotUrl, siteTitle } from '@/lib/seo';
import { t } from '@/lib/i18n';
import type { Plot } from '@/lib/types';

type Params = { params: Promise<{ slug: string }> };

async function getPlot(slug: string) {
  return serverApi<{ plot: Plot }>(`/plots/${encodeURIComponent(slug)}`);
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPlot(slug).catch(() => null);
  if (!data) return { title: 'Plot not found' };
  const p = data.plot;
  // S3: a unique 140–160 character description and a ≤ 60 character title for every plot; refreshed on every edit
  // (the page is rendered per request; the share image and the sitemap lastmod follow the same edit, S2).
  const title = plotTitle(p);
  const description = plotMetaDescription(p);
  const updated = p.contentModifiedAt ?? undefined;
  const company = !!p.showcase;
  return {
    title: siteTitle(title),
    description,
    alternates: { canonical: plotUrl(p.slug) },
    openGraph: company
      ? { title, description, url: plotUrl(p.slug), locale: 'en', siteName: 'FlatMeta' }
      : { title, description, url: plotUrl(p.slug), locale: 'en', siteName: 'FlatMeta', type: 'article', modifiedTime: updated, authors: p.owner ? [`${p.owner.displayName}`] : undefined },
    twitter: { card: 'summary_large_image', title, description },
    robots: p.indexable ? undefined : { index: false, follow: true },
    other: {
      ...(p.coverImageUrl ? { 'og:image:alt': p.title } : {}),
      ...(updated ? { 'og:updated_time': updated } : {}),
      // Company land is a place (Next's openGraph.type has no "place"); people's mini-pages are articles (above).
      ...(company ? { 'og:type': 'place', 'place:location:latitude': String(p.center.lat), 'place:location:longitude': String(p.center.lng) } : {}),
    },
  };
}

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export default async function PlotPage({ params }: Params) {
  const { slug } = await params;
  const data = await getPlot(slug);
  if (!data) notFound();
  const p = data.plot;
  const nb = await serverApi<{ neighbours: Plot[]; nearby: Plot[] }>(`/plots/${p.id}/neighbours`).catch(() => null);
  const owner = p.owner;
  const hero = p.coverImageUrl;

  return (
    <PageShell wide>
      <JsonLd data={plotJsonLd(p)} />
      <article className="space-y-8" id="main">
        <nav className="text-xs muted flex flex-wrap items-center gap-x-2" aria-label="Breadcrumb">
          <Link href="/" className="tap hover:text-[var(--text)]">World</Link>
          {p.countryCode && (
            <>
              <span>/</span>
              <Link href={`/c/${p.countryCode.toLowerCase()}`} className="tap hover:text-[var(--text)]">{flag(p.countryCode)} {p.countryName}</Link>
            </>
          )}
          {p.regionSlug && (
            <>
              <span>/</span>
              <Link href={`/r/${p.regionSlug}`} className="tap hover:text-[var(--text)] capitalize">{p.regionSlug.replace(/-/g, ' ')}</Link>
            </>
          )}
        </nav>

        <header className={`relative overflow-hidden rounded-[28px] min-h-[340px] md:min-h-[440px] flex items-end frame-${p.frame}`}>
          {hero && <img src={hero} alt="" fetchPriority="high" decoding="async" width={1600} height={1067} className="absolute inset-0 size-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-[rgb(11_16_32/.96)] via-[rgb(11_16_32/.35)] to-transparent" />
          <div className="relative p-6 md:p-10 w-full">
            <div className="flex flex-wrap gap-2 mb-3">
              <KindChip plot={p} />
              {p.spotlight && <span className="chip chip-gold">Spotlight</span>}
              {p.business?.hours && <OpenNowBadge hours={p.business.hours} timezone={p.business.timezone} />}
              <span className="chip" style={{ color: TIER_COLOR[p.tier] }}>{TIER_LABEL[p.tier]} tier</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-bold text-white drop-shadow-lg max-w-3xl">{p.title}</h1>
            {p.tagline && <p className="text-lg md:text-xl text-white/85 mt-3 max-w-2xl">{p.tagline}</p>}
            <div className="flex flex-wrap items-center gap-3 mt-6">
              {p.cta && (
                <a href={p.cta.url} target="_blank" rel="noopener nofollow" className="btn-primary btn-lg">
                  {p.cta.label} <ExternalLink size={16} />
                </a>
              )}
              {owner && (
                <Link href={owner.type === 'org' ? `/o/${owner.handle}` : `/u/${owner.handle}`} className="text-sm text-white/80 hover:text-white">
                  {t('plot.ownedBy')} <span className="font-semibold">{owner.displayName}</span> {owner.verified && <span className="text-[var(--color-teal)]">✓ verified</span>}
                </Link>
              )}
            </div>
          </div>
        </header>

        {p.showcase && (
          <div className="rounded-2xl p-5 border border-[rgb(255_201_77/.35)] bg-[rgb(255_201_77/.07)] flex flex-col md:flex-row gap-4 md:items-center">
            {p.showcase.logo && (
              // H1: a small official logo to identify the company for claiming: a badge, never the main artwork.
              <img src={p.showcase.logo.url} alt={`${p.showcase.brand} logo`} width={56} height={56} className="size-14 rounded-xl bg-[#f4f5f8] ring-1 ring-black/10 p-1.5 object-contain shrink-0" data-testid="company-logo" />
            )}
            <div className="flex-1">
              <div className="font-semibold text-[var(--color-gold)]">{t('plot.showcaseTitle')}</div>
              <p className="text-sm muted mt-1">{t('plot.showcaseNote', { brand: p.showcase.brand })}</p>
              {/* G12: every reserved company plot says so plainly. */}
              <p className="text-sm font-medium mt-2" data-testid="reserved-label">Reserved for {p.showcase.brand}, not affiliated with FlatMeta.</p>
              {p.showcase.logo && (
                <p className="text-xs muted mt-1" data-testid="logo-note">
                  Logo shown to identify the company for claiming; trademarks belong to their owners.{' '}
                  <a className="underline" href={p.showcase.logo.sourceUrl} rel="noopener nofollow" target="_blank">Logo source</a>
                  {p.showcase.logo.license ? ` (${p.showcase.logo.license}${p.showcase.logo.author ? `, ${p.showcase.logo.author}` : ''})` : ''}.
                </p>
              )}
              <LogoAdminToggle plotId={p.id} hasLogo={!!p.showcase.logo} />
              {p.showcase.sourceUrl && (
                <p className="text-xs muted mt-1">
                  Company facts from <a className="underline" href={p.showcase.sourceUrl} rel="noopener nofollow" target="_blank">Wikidata</a> ({p.showcase.license ?? 'CC0-1.0'}). Artwork is generic, made by FlatMeta.
                </p>
              )}
            </div>
            {/* M5: wraps (and fills the row) on phones; it used to widen the page to 448 px at 375. */}
            <div className="flex flex-wrap gap-2 md:shrink-0">
              <Link href={`/claim/${p.slug}`} className="btn-gold flex-1 sm:flex-none">{t('plot.claimIt')}</Link>
              <Link href={`/claim/${p.slug}?takedown=1`} className="btn-ghost flex-1 sm:flex-none">{t('plot.requestRemoval')}</Link>
            </div>
          </div>
        )}
        {p.dormant && <p className="text-sm muted surface p-4">{t('plot.dormant')}</p>}

        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="space-y-8 min-w-0">
            {p.descriptionMd && (
              <section className="surface p-6">
                <Markdown source={p.descriptionMd} className="prose-plot" />
                {p.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {p.tags.map((tg) => (
                      <Link key={tg} href={`/explore?q=${encodeURIComponent(tg)}`} className="chip tap normal-case tracking-normal text-xs"><Tag size={12} /> {tg}</Link>
                    ))}
                  </div>
                )}
              </section>
            )}

            {p.hasCustomHtml && p.customHtmlUrl && (
              <section className="surface overflow-hidden" aria-label="Custom content from the plot owner">
                {/* Owner HTML is its own document on the separate usercontent origin (never srcdoc): sandboxed, opaque origin,
                    its own CSP, no forms, popups or top navigation. */}
                <iframe title={`Custom content for ${p.title}`} src={sandboxSrc(p.customHtmlUrl)} sandbox="allow-scripts" referrerPolicy="no-referrer" loading="lazy" className="w-full h-[480px] bg-transparent" />
                <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-[var(--line)]">
                  <p className="text-xs muted">Custom content made by the plot owner, not by FlatMeta.</p>
                  <ReportCustomHtml plotId={p.id} />
                </div>
              </section>
            )}

            {p.gallery.length > 0 && (
              <section className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {p.gallery.map((g) => (
                  <img key={g} src={g} alt="" loading="lazy" className="rounded-2xl aspect-[4/3] object-cover w-full" />
                ))}
              </section>
            )}

            {p.business && (
              <section className="surface p-6 grid md:grid-cols-2 gap-6">
                <div className="space-y-2 text-sm">
                  <h2 className="text-lg font-bold mb-2">Visit</h2>
                  {p.business.address && <p className="flex gap-2"><MapPin size={16} className="muted shrink-0 mt-0.5" /> {p.business.address}</p>}
                  {p.business.phone && <p className="flex gap-2"><Phone size={16} className="muted" /> <a href={`tel:${p.business.phone}`} className="underline">{p.business.phone}</a></p>}
                  {p.business.email && <p className="flex gap-2"><Mail size={16} className="muted" /> <a href={`mailto:${p.business.email}`} className="underline">{p.business.email}</a></p>}
                  {p.business.bookingUrl && <a href={p.business.bookingUrl} className="btn-ghost mt-2" target="_blank" rel="noopener nofollow"><CalendarCheck size={16} /> Book</a>}
                  {p.business.offer && <p className="rounded-xl p-3 bg-[rgb(255_201_77/.1)] text-[var(--color-gold)] font-semibold">🎁 {p.business.offer}</p>}
                </div>
                {p.business.hours && (
                  <div className="text-sm">
                    <h2 className="text-lg font-bold mb-2 flex items-center gap-2"><Clock size={16} /> Opening hours</h2>
                    <dl className="grid grid-cols-[60px_1fr] gap-y-1">
                      {DAYS.map((d) => (
                        <div key={d} className="contents">
                          <dt className="capitalize muted">{d}</dt>
                          <dd>{p.business?.hours?.[d]?.length ? p.business.hours[d]!.map(([a, b]) => `${a}–${b}`).join(', ') : 'Closed'}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
              </section>
            )}

            {p.links.length > 0 && (
              <section className="grid sm:grid-cols-2 gap-3">
                {p.links.map((l) => (
                  <a key={l.url} href={l.url} target="_blank" rel="noopener nofollow ugc" className="surface p-4 flex items-center justify-between hover:border-[var(--color-teal)] transition">
                    <span className="font-semibold">{l.label}</span>
                    <ExternalLink size={16} className="muted" />
                  </a>
                ))}
              </section>
            )}

            <Guestbook plotId={p.id} canModerate={!!p.canEdit} open={p.guestbookOpen !== false} />
          </div>

          <aside className="space-y-4">
            <PlotActions plot={p} />
            <OpenHouses plotId={p.id} canEdit={!!p.canEdit} />
            <PlotMarket plot={p} canEdit={!!p.canEdit} />
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="surface py-3"><div className="font-display text-xl font-bold">{compact(p.likesCount)}</div><div className="muted">likes</div></div>
              <div className="surface py-3"><div className="font-display text-xl font-bold">{compact(p.visitsCount)}</div><div className="muted">visits</div></div>
              <div className="surface py-3"><div className="font-display text-xl font-bold">{p.width}×{p.height}</div><div className="muted">cells</div></div>
            </div>
            <MiniMapLazy plot={p} />
            <p className="text-xs muted">
              {t('plot.address')}: <span className="font-mono">{p.threeWords}</span> · {p.center.lat.toFixed(4)}, {p.center.lng.toFixed(4)}
            </p>
          </aside>
        </div>

        {nb && (nb.neighbours.length > 0 || nb.nearby.length > 0) && (
          <section>
            <h2 className="text-2xl font-bold mb-4">{nb.neighbours.length ? t('plot.neighbours') : t('plot.nearby')}</h2>
            <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
              {[...nb.neighbours, ...nb.nearby].slice(0, 8).map((n) => (
                <PlotCard key={n.id} plot={n} compactView />
              ))}
            </div>
          </section>
        )}
      </article>
    </PageShell>
  );
}

