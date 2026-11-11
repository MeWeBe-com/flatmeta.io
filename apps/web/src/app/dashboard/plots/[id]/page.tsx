'use client';

import { ComingSoon } from '@/components/coming-soon';
import { PAID_CHECKOUT } from '@/lib/config';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Eye, ImagePlus, Lightbulb, Megaphone, Rocket, Save, Sparkles, Store, Wand2, Link2, Palette, PartyPopper, Plus, Trash2, Zap } from 'lucide-react';
import { ApiError, api, patch, post, upload } from '@/lib/api';
import { usd } from '@/lib/format';
import type { BusinessInfo, GameResult, Link as PlotLink, Plot, Progress } from '@/lib/types';
import { useGame, useSession } from '@/components/providers';
import { Spinner, clsx } from '@/components/ui';
import { SharePanel, plotShareUrl } from '@/components/share-panel';
import { VisitorStats } from '@/components/plot/visitor-stats';
import { sandboxSrc } from '@/lib/sandbox';
import { ScheduleOpenHouse } from '@/components/plot/open-houses';
import { InviteLink } from '@/components/invite-card';

type Tab = 'design' | 'content' | 'links' | 'look' | 'business' | 'boost';
interface Variation { title: string; tagline: string; descriptionMd: string; category: string; tags: string[]; theme: { primary: string; accent: string }; image?: { url: string; thumbUrl: string; pending: boolean } }
interface Job { id: string; status: string; output: { variations: Variation[]; provider: string; game?: GameResult } | null; error: string | null }

const TABS: { key: Tab; label: string; icon: typeof Sparkles }[] = [
  { key: 'design', label: 'AI Designer', icon: Sparkles },
  { key: 'content', label: 'Content', icon: Wand2 },
  { key: 'links', label: 'Links', icon: Link2 },
  { key: 'look', label: 'Look', icon: Palette },
  { key: 'business', label: 'Business', icon: Store },
  { key: 'boost', label: 'Boost', icon: Megaphone },
];
const STYLES = ['surprise me', 'cosy isometric diorama', 'vivid neon night', 'watercolour storybook', 'retro pixel art', 'minimal pastel', 'epic fantasy'];
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

function Editor() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const { handleGame, toast, confetti } = useGame();
  const { me, refresh } = useSession();
  const [plot, setPlot] = useState<Plot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>((params.get('designer') ? 'design' : (params.get('tab') as Tab)) || 'design');
  const [draft, setDraft] = useState({ title: '', tagline: '', descriptionMd: '', category: '', tags: '', customHtml: '' });
  const [links, setLinks] = useState<PlotLink[]>([]);
  const [cta, setCta] = useState<PlotLink>({ label: '', url: '' });
  const [theme, setTheme] = useState({ primary: '#2DE2C4', accent: '#FFC94D' });
  const [business, setBusiness] = useState<BusinessInfo>({});
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const welcome = params.get('welcome');

  const hydrate = (p: Plot) => {
    setPlot(p);
    setDraft({ title: p.title, tagline: p.tagline ?? '', descriptionMd: p.descriptionMd ?? '', category: p.category ?? '', tags: p.tags.join(', '), customHtml: p.customHtml ?? '' });
    setLinks(p.links);
    setCta(p.cta ?? { label: '', url: '' });
    setTheme(p.theme ?? { primary: '#2DE2C4', accent: '#FFC94D' });
    setBusiness(p.business ?? {});
  };
  useEffect(() => {
    api<{ plot: Plot }>(`/plots/${id}`).then((r) => hydrate(r.plot)).catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load plot'));
    api<Progress>('/me/progress').then(setProgress).catch(() => undefined);
    if (params.get('checkout') === 'success' || welcome) confetti();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) return <div className="surface p-8 text-[var(--color-coral)]">{error}</div>;
  if (!plot) return <div className="skeleton h-96" />;
  if (!plot.canEdit) return <div className="surface p-8">You can’t edit this plot. <Link className="underline" href={`/p/${plot.slug}`}>View it</Link>.</div>;

  const save = async (fields: Record<string, unknown>, msg = 'Saved') => {
    setSaving(true);
    try {
      const r = await patch<{ plot: Plot; game: GameResult | null; customHtml?: { status: string; version: number } | null }>(`/plots/${plot.id}`, fields);
      hydrate(r.plot);
      handleGame(r.game);
      if (r.customHtml?.status === 'review') toast({ kind: 'info', title: 'Saved. Your custom HTML goes live after a quick review (first publish only).' });
      else toast({ kind: 'success', title: msg });
    } catch (e) {
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Could not save' });
    } finally {
      setSaving(false);
    }
  };
  const publish = async () => {
    setSaving(true);
    try {
      const r = await post<{ plot: Plot; game: GameResult | null }>(`/plots/${plot.id}/publish`);
      hydrate(r.plot);
      handleGame(r.game);
      confetti();
      toast({ kind: 'success', title: 'Your plot is live!' });
    } catch (e) {
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Could not publish' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {(welcome || params.get('checkout') === 'success') && (
        <div className="rounded-2xl p-5 bg-gradient-to-r from-[rgb(45_226_196/.15)] to-[rgb(139_124_255/.15)] border border-[rgb(45_226_196/.3)] flex items-center gap-4 animate-rise">
          <PartyPopper className="text-[var(--color-gold)] shrink-0" />
          <div>
            <div className="font-bold">{welcome === 'landmark' ? 'Your Landmark is verified and yours!' : 'Welcome to your new plot!'}</div>
            <div className="text-sm muted">Let the AI Designer dress it up, then publish it to the world.</div>
          </div>
        </div>
      )}
      {welcome && welcome !== 'landmark' && (
        // G11: the moment people are proudest of their land is the best moment to share it.
        <div className="surface p-5 space-y-3" role="region" aria-label="Share your new land">
          <div className="font-semibold">Tell your friends where you live on the map</div>
          <p className="text-sm muted">Your link opens your land. Friends who join with your invite link and claim land get bonus squares, and so do you.</p>
          <SharePanel url={plotShareUrl(plot)} text={`My land on FlatMeta: ${plot.title}`} plotId={plot.id} />
          <InviteLink />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold truncate">{plot.title}</h1>
          <p className="text-xs muted">
            {plot.width}×{plot.height} cells · {plot.countryName ?? 'Ocean'} · {plot.published ? <span className="text-[var(--color-teal)]">Published</span> : <span className="text-[var(--color-gold)]">Draft</span>}
            {plot.status === 'pending_payment' && <span className="text-[var(--color-coral)]"> · awaiting payment</span>}
            {plot.moderationStatus !== 'ok' && <span className="text-[var(--color-coral)]"> · {plot.moderationStatus === 'pending' ? 'in review' : 'held by moderation'}</span>}
          </p>
          <VisitorStats plotId={plot.id} />
        </div>
        <Link href={`/p/${plot.slug}`} className="btn-ghost"><Eye size={16} /> View</Link>
        {plot.published ? (
          <a className="btn-ghost" href={`/?visit=${plot.slug}`}>Visit</a>
        ) : (
          <button className="btn-gold" onClick={() => void publish()} disabled={saving || plot.status !== 'active'}><Rocket size={16} /> Publish</button>
        )}
      </div>

      {plot.published && (
        <div className="surface p-4 max-w-xl">
          <div className="text-xs muted mb-2">Share your plot the link opens it, and <a className="underline" href={`/?visit=${plot.slug}`}>Visit</a> brings people right next to it on the map.</div>
          <SharePanel url={plotShareUrl(plot)} text={`${plot.title} on FlatMeta`} plotId={plot.id} />
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto p-1 surface rounded-full w-fit max-w-full">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={clsx('px-4 h-9 rounded-full text-sm whitespace-nowrap inline-flex items-center gap-2', tab === t.key ? 'bg-[var(--color-teal)] text-[#04141a] font-semibold' : 'muted hover:text-[var(--text)]')}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      <div className="grid xl:grid-cols-[1fr_380px] gap-6 items-start">
        <div className="surface p-5 md:p-6">
          {tab === 'design' && <Designer plot={plot} onApplied={(p) => { hydrate(p); void refresh(); }} credits={progress?.credits.remaining ?? me.credits?.remaining ?? 0} unlimited={!!progress?.credits.unlimited} />}

          {tab === 'content' && (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save({ title: draft.title, tagline: draft.tagline || null, descriptionMd: draft.descriptionMd || null, category: draft.category || null, tags: draft.tags.split(',').map((t) => t.trim()).filter(Boolean), customHtml: draft.customHtml.trim() || null }); }}>
              <div><label className="label">Title</label><input className="input" maxLength={80} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
              <div><label className="label">Tagline</label><input className="input" maxLength={140} value={draft.tagline} onChange={(e) => setDraft({ ...draft, tagline: e.target.value })} placeholder="One line that makes people stop" /></div>
              <div><label className="label">Description (Markdown)</label><textarea className="input font-mono text-[13px]" rows={10} maxLength={5000} value={draft.descriptionMd} onChange={(e) => setDraft({ ...draft, descriptionMd: e.target.value })} /></div>
              <div className="grid md:grid-cols-2 gap-3">
                <div><label className="label">Category</label><input className="input" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} placeholder="e.g. food & drink" /></div>
                <div><label className="label">Tags (comma separated)</label><input className="input" value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} /></div>
              </div>
              <details className="surface p-4" open={!!draft.customHtml}>
                <summary className="cursor-pointer font-semibold">Custom HTML <span className="chip chip-violet ml-2">Plus</span></summary>
                <p className="text-sm muted mt-2">Add your own HTML, CSS and JavaScript. It runs in a sandbox on a separate site (usercontent), never on FlatMeta itself: no cookies, logins, forms, popups or redirects; up to 200 KB. Scripts may load from cdnjs, jsDelivr and unpkg; embeds from YouTube, Vimeo, Spotify and Google Maps. Your first publish is checked by a person, then changes go live at once.</p>
                <CustomHtmlStatus plot={plot} onRestored={hydrate} />
                <textarea className="input font-mono text-[13px] mt-3" rows={9} maxLength={200000} value={draft.customHtml} onChange={(e) => setDraft({ ...draft, customHtml: e.target.value })} placeholder={'<h2>Welcome!</h2>\n<p>Opening hours, a playlist, a tiny game…</p>'} aria-label="Custom HTML" />
                {draft.customHtml && <CustomHtmlPreview html={draft.customHtml} />}
                {me.user?.plan === 'free' && !me.orgs?.some((o) => o.plan !== 'free') && <p className="text-xs mt-2 text-[var(--color-gold)]">Custom HTML needs <a className="underline" href="/pricing">Plus or a business plan</a>.</p>}
              </details>
              <button className="btn-primary" disabled={saving}>{saving ? <Spinner /> : <Save size={16} />} Save</button>
              <Ideas plotId={plot.id} />
            </form>
          )}

          {tab === 'links' && (
            <div className="space-y-5">
              <div>
                <label className="label">Call to action (big button)</label>
                <div className="grid md:grid-cols-[180px_1fr] gap-2">
                  <input className="input" placeholder="Label" value={cta.label} onChange={(e) => setCta({ ...cta, label: e.target.value })} />
                  <input className="input" placeholder="https://…" value={cta.url} onChange={(e) => setCta({ ...cta, url: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="label">Links (up to 5)</label>
                <div className="space-y-2">
                  {links.map((l, i) => (
                    <div key={i} className="grid grid-cols-[150px_1fr_auto] gap-2">
                      <input className="input" value={l.label} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                      <input className="input" value={l.url} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
                      <button className="icon-btn" onClick={() => setLinks(links.filter((_, j) => j !== i))} aria-label="Remove link"><Trash2 size={16} /></button>
                    </div>
                  ))}
                  {links.length < 5 && <button className="btn-ghost btn-sm" onClick={() => setLinks([...links, { label: '', url: '' }])}><Plus size={14} /> Add link</button>}
                </div>
                {plot.brokenLinks.length > 0 && <p className="text-xs text-[var(--color-coral)] mt-2">Broken: {plot.brokenLinks.join(', ')}</p>}
              </div>
              <button className="btn-primary" disabled={saving} onClick={() => void save({ links: links.filter((l) => l.label && l.url), cta: cta.label && cta.url ? cta : null })}>{saving ? <Spinner /> : <Save size={16} />} Save links</button>
            </div>
          )}

          {tab === 'look' && <Look plot={plot} theme={theme} setTheme={setTheme} progress={progress} onSave={save} onPlot={hydrate} saving={saving} />}

          {tab === 'business' && (
            plot.owner?.type === 'org' && ['business', 'brand', 'enterprise'].includes(plot.owner.plan ?? '') ? (
              <div className="space-y-4">
                <div className="grid md:grid-cols-2 gap-3">
                  <div><label className="label">Phone</label><input className="input" value={business.phone ?? ''} onChange={(e) => setBusiness({ ...business, phone: e.target.value })} /></div>
                  <div><label className="label">Email</label><input className="input" value={business.email ?? ''} onChange={(e) => setBusiness({ ...business, email: e.target.value })} /></div>
                </div>
                <div><label className="label">Address</label><input className="input" value={business.address ?? ''} onChange={(e) => setBusiness({ ...business, address: e.target.value })} /></div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div><label className="label">Booking link</label><input className="input" value={business.bookingUrl ?? ''} onChange={(e) => setBusiness({ ...business, bookingUrl: e.target.value })} /></div>
                  <div><label className="label">Time zone</label><input className="input" value={business.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone} onChange={(e) => setBusiness({ ...business, timezone: e.target.value })} /></div>
                </div>
                <div><label className="label">Featured offer</label><input className="input" maxLength={140} value={business.offer ?? ''} onChange={(e) => setBusiness({ ...business, offer: e.target.value })} placeholder="e.g. Free cookie with any coffee this week" /></div>
                <div>
                  <label className="label">Opening hours</label>
                  <div className="grid gap-2">
                    {DAYS.map((d) => {
                      const r = business.hours?.[d]?.[0];
                      return (
                        <div key={d} className="grid grid-cols-[50px_1fr_1fr_auto] gap-2 items-center text-sm">
                          <span className="capitalize muted">{d}</span>
                          <input type="time" className="input h-9" value={r?.[0] ?? ''} onChange={(e) => setBusiness({ ...business, hours: { ...business.hours, [d]: [[e.target.value, r?.[1] ?? '17:00']] } })} />
                          <input type="time" className="input h-9" value={r?.[1] ?? ''} onChange={(e) => setBusiness({ ...business, hours: { ...business.hours, [d]: [[r?.[0] ?? '09:00', e.target.value]] } })} />
                          <button className="text-xs muted underline" onClick={() => { const h = { ...business.hours }; delete h[d]; setBusiness({ ...business, hours: h }); }}>closed</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <button className="btn-primary" disabled={saving} onClick={() => void save({ business: Object.fromEntries(Object.entries(business).filter(([, v]) => v !== '' && v !== undefined)) })}>{saving ? <Spinner /> : <Save size={16} />} Save business details</button>
              </div>
            ) : (
              <div className="text-center py-8 space-y-3">
                <Store className="mx-auto text-[var(--color-teal)]" size={36} />
                <h2 className="text-xl font-bold">Turn this plot into a business page</h2>
                <p className="muted text-sm max-w-md mx-auto">Opening hours with a live “Open now” badge, offers, booking links, a verified badge and LocalBusiness rich results. Business plots belong to an organisation on the Business or Brand plan.</p>
                <Link href="/dashboard/orgs?create=1&plan=business" className="btn-primary">Set up a business</Link>
              </div>
            )
          )}

          {tab === 'boost' && (
            <div className="grid md:grid-cols-2 gap-4">
              {[
                { kind: 'spotlight', title: 'Spotlight', price: 900, body: 'Featured first in your city and country, with a golden glow on the map, for 7 days.', icon: Megaphone },
                { kind: 'beacon', title: 'Beacon', price: 300, body: 'A pulsing beacon visible from the globe view for 24 hours. Great before an event.', icon: Zap },
              ].map((b) => (
                <div key={b.kind} className="surface p-5 space-y-3">
                  <b.icon className="text-[var(--color-gold)]" />
                  <h3 className="text-lg font-bold">{b.title} <span className="muted font-normal text-sm">· {usd(b.price)}</span></h3>
                  <p className="text-sm muted">{b.body}</p>
                  {(b.kind === 'spotlight' ? plot.spotlight : plot.beacon) && <p className="text-xs text-[var(--color-teal)]">Active until {new Date((b.kind === 'spotlight' ? plot.spotlightUntil : plot.beaconUntil) as string).toLocaleString()}</p>}
                  {!PAID_CHECKOUT ? <ComingSoon compact text={`${b.title} is coming soon.`} /> : <button className="btn-gold w-full" disabled={plot.status !== 'active'} onClick={async () => {
                    try {
                      const r = await post<{ checkoutUrl: string }>(`/plots/${plot.id}/upgrade`, { kind: b.kind });
                      window.location.href = r.checkoutUrl;
                    } catch (e) { toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Unavailable' }); }
                  }}>Buy {b.title}</button>}
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="xl:sticky xl:top-24 space-y-3">
          <div className="text-xs uppercase tracking-wider muted font-semibold">Live preview</div>
          <div className={clsx('surface overflow-hidden', `frame-${plot.frame}`)}>
            <div className="relative aspect-[3/2] bg-[var(--color-night-3)]">
              {plot.coverImageUrl && <img src={plot.coverImageUrl} alt="" className="size-full object-cover" />}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
              <div className="absolute bottom-3 left-4 right-4">
                <div className="text-xl font-bold text-white">{draft.title || plot.title}</div>
                <div className="text-sm text-white/80 line-clamp-2">{draft.tagline}</div>
              </div>
            </div>
            <div className="p-4 text-sm muted line-clamp-6 whitespace-pre-wrap">{draft.descriptionMd}</div>
            <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${theme.primary}, ${theme.accent})` }} />
          </div>
          <div className="surface p-4 space-y-2">
            <div className="text-xs uppercase tracking-wider muted font-semibold">Open houses</div>
            <p className="text-xs muted">Pick a time you’ll be at your plot. Visitors can ask for a reminder, and your followers are told when it starts.</p>
            <ScheduleOpenHouse plotId={plot.id} published={!!plot.publishedAt && plot.status === 'active'} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function Designer({ plot, onApplied, credits, unlimited }: { plot: Plot; onApplied: (p: Plot) => void; credits: number; unlimited: boolean }) {
  const [brief, setBrief] = useState(plot.tagline ?? '');
  const [name, setName] = useState(plot.title);
  const [style, setStyle] = useState(STYLES[0]!);
  const [website, setWebsite] = useState(plot.cta?.url ?? '');
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState<number | null>(null);
  const { handleGame, toast } = useGame();
  const poll = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (poll.current) clearTimeout(poll.current); }, []);

  const run = async () => {
    setBusy(true);
    setJob(null);
    try {
      const r = await post<{ jobId: string }>('/ai/design', { plotId: plot.id, brief, name, style, website: website || undefined });
      const tick = async () => {
        const j = (await api<{ job: Job }>(`/ai/jobs/${r.jobId}`)).job;
        setJob(j);
        if (j.status === 'running') poll.current = setTimeout(() => void tick(), 1200);
        else {
          setBusy(false);
          if (j.output?.game) handleGame(j.output.game);
        }
      };
      void tick();
    } catch (e) {
      setBusy(false);
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'The designer is busy' });
    }
  };
  const apply = async (i: number) => {
    if (!job) return;
    setApplying(i);
    try {
      const r = await post<{ plot: Plot; game: GameResult }>(`/ai/jobs/${job.id}/apply`, { index: i });
      onApplied(r.plot);
      handleGame(r.game);
      toast({ kind: 'success', title: 'Design applied' });
    } finally {
      setApplying(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="size-11 rounded-2xl grid place-items-center bg-[rgb(139_124_255/.15)] text-[var(--color-violet)]"><Sparkles /></span>
        <div>
          <h2 className="text-xl font-bold">AI Plot Designer</h2>
          <p className="text-sm muted">Describe your place in a sentence. You’ll get 3 designs with original artwork and copy. {unlimited ? 'Unlimited designs (admin).' : `${credits} design${credits === 1 ? '' : 's'} left this month.`}</p>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <div><label className="label">Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label">Style</label><select className="input" value={style} onChange={(e) => setStyle(e.target.value)}>{STYLES.map((s) => <option key={s}>{s}</option>)}</select></div>
      </div>
      <div><label className="label">What is this place?</label><textarea className="input" rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="e.g. A tiny vinyl bar where neighbours swap records on Sundays" /></div>
      <div><label className="label">Website (optional, used for the button)</label><input className="input" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" /></div>
      {credits <= 0 && !unlimited ? (
        <div className="rounded-xl p-3 bg-[rgb(255_201_77/.1)] text-sm flex items-center gap-3">
          <span className="flex-1">You’re out of AI designs this month.{!PAID_CHECKOUT && ' More arrive at the start of next month; Design Packs are coming soon.'}</span>
          {PAID_CHECKOUT && <button className="btn-gold btn-sm" onClick={async () => { const r = await post<{ checkoutUrl: string }>('/billing/credits'); window.location.href = r.checkoutUrl; }}>Get 25 more · $5</button>}
          {PAID_CHECKOUT && <Link href="/pricing" className="btn-ghost btn-sm">Go Plus</Link>}
        </div>
      ) : (
        <button className="btn-primary btn-lg" disabled={busy || brief.trim().length < 3} onClick={() => void run()}>{busy ? <Spinner /> : <Wand2 size={18} />} {busy ? 'Designing…' : 'Generate 3 designs'}</button>
      )}
      {busy && !job?.output && <div className="grid md:grid-cols-3 gap-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton aspect-[3/4]" />)}</div>}
      {job?.status === 'failed' && <p className="text-sm text-[var(--color-coral)]">{job.error}</p>}
      {job?.output && (
        <div className="grid md:grid-cols-3 gap-3">
          {job.output.variations.map((v, i) => (
            <div key={i} className="surface overflow-hidden flex flex-col animate-rise" style={{ animationDelay: `${i * 80}ms` }}>
              {v.image && <img src={v.image.thumbUrl} alt="" className="aspect-square object-cover" />}
              <div className="p-3 flex-1 flex flex-col gap-1">
                <div className="font-semibold leading-snug">{v.title}</div>
                <div className="text-xs muted line-clamp-3">{v.tagline}</div>
                <div className="flex gap-1 mt-1"><span className="size-4 rounded-full" style={{ background: v.theme.primary }} /><span className="size-4 rounded-full" style={{ background: v.theme.accent }} /></div>
                <button className="btn-gold btn-sm mt-auto" disabled={applying !== null} onClick={() => void apply(i)}>{applying === i ? <Spinner /> : null} Use this design</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {job?.output && <p className="text-[11px] muted">Made with {job.output.provider === 'ai' ? 'AI' : 'FlatMeta templates'}. Artwork is original and generated; check copy before publishing.</p>}
    </div>
  );
}

function Look({ plot, theme, setTheme, progress, onSave, onPlot, saving }: { plot: Plot; theme: { primary: string; accent: string }; setTheme: (t: { primary: string; accent: string }) => void; progress: Progress | null; onSave: (f: Record<string, unknown>, msg?: string) => Promise<void>; onPlot: (p: Plot) => void; saving: boolean }) {
  const [uploading, setUploading] = useState<string | null>(null);
  const { toast } = useGame();
  const up = async (file: File, use: 'cover' | 'gallery') => {
    setUploading(use);
    try {
      const r = await upload<{ plot: Plot }>(`/plots/${plot.id}/media?use=${use}`, file);
      onPlot(r.plot);
      toast({ kind: 'success', title: use === 'cover' ? 'Cover updated' : 'Added to gallery' });
    } catch (e) {
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Upload failed' });
    } finally {
      setUploading(null);
    }
  };
  return (
    <div className="space-y-6">
      <div>
        <label className="label">Cover image (shown on the map across your plot)</label>
        <label className="surface flex items-center gap-4 p-4 cursor-pointer hover:border-[var(--color-teal)]">
          {plot.coverImageUrl && <img src={plot.thumbUrl ?? plot.coverImageUrl} alt="" className="size-16 rounded-xl object-cover" />}
          <span className="flex items-center gap-2 text-sm">{uploading === 'cover' ? <Spinner /> : <ImagePlus size={18} />} Upload a JPG, PNG, WebP or GIF (max 8 MB)</span>
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && void up(e.target.files[0], 'cover')} />
        </label>
      </div>
      <div>
        <label className="label">Gallery ({plot.gallery.length}/6)</label>
        <div className="flex flex-wrap gap-2">
          {plot.gallery.map((g, i) => (
            <span key={g} className="relative">
              <img src={g} alt="" className="size-20 rounded-xl object-cover" />
              <button type="button" className="absolute -top-1.5 -right-1.5 size-6 rounded-full bg-[var(--color-night,#0b1020)] border border-[var(--line)] grid place-items-center text-xs" aria-label={`Remove gallery image ${i + 1}`} onClick={() => void onSave({ galleryRemove: g }, 'Image removed')}>×</button>
            </span>
          ))}
          {plot.gallery.length < 6 && (
            <label className="size-20 rounded-xl surface grid place-items-center cursor-pointer hover:border-[var(--color-teal)]">
              {uploading === 'gallery' ? <Spinner /> : <Plus />}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && void up(e.target.files[0], 'gallery')} />
            </label>
          )}
          {plot.gallery.length > 0 && <button className="text-xs muted underline self-end" onClick={() => void onSave({ galleryMediaIds: [] }, 'Gallery cleared')}>Clear gallery</button>}
        </div>
      </div>
      <div>
        <label className="label">Colours</label>
        <div className="flex gap-4 items-center">
          <label className="flex items-center gap-2 text-sm"><input type="color" value={theme.primary} onChange={(e) => setTheme({ ...theme, primary: e.target.value.toUpperCase() })} className="size-10 rounded-lg bg-transparent" /> Primary</label>
          <label className="flex items-center gap-2 text-sm"><input type="color" value={theme.accent} onChange={(e) => setTheme({ ...theme, accent: e.target.value.toUpperCase() })} className="size-10 rounded-lg bg-transparent" /> Accent</label>
          <button className="btn-ghost btn-sm" disabled={saving} onClick={() => void onSave({ theme })}>Save colours</button>
        </div>
      </div>
      <div>
        <label className="label">Frame (unlock more by levelling up)</label>
        <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
          {(progress?.frames ?? []).map((f) => (
            <button key={f.key} disabled={!f.unlocked || saving} onClick={() => void onSave({ frame: f.key }, `Frame: ${f.name}`)} className={clsx('surface p-3 text-xs text-center transition', plot.frame === f.key && 'border-[var(--color-teal)]', !f.unlocked && 'opacity-40')}>
              <span className={clsx('block mx-auto size-10 rounded-lg bg-[var(--color-night-3)] mb-2', `frame-${f.key}`)} />
              {f.name}
              <span className="block muted">{f.unlocked ? '' : f.plan ? 'Plus' : `Lv ${f.level}`}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Ideas({ plotId }: { plotId: string }) {
  const [ideas, setIdeas] = useState<{ title: string; description: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="pt-4 border-t border-[var(--line)]">
      <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={async () => { setBusy(true); try { setIdeas((await post<{ ideas: { title: string; description: string }[] }>('/ai/ideas', { plotId })).ideas); } finally { setBusy(false); } }}>
        {busy ? <Spinner /> : <Lightbulb size={14} />} Give me ideas
      </button>
      {ideas && (
        <ul className="mt-3 grid md:grid-cols-2 gap-2">
          {ideas.map((i) => <li key={i.title} className="surface p-3 text-sm"><b>{i.title}</b><p className="muted text-xs mt-1">{i.description}</p></li>)}
        </ul>
      )}
    </div>
  );
}

export default function PlotEditorPage() {
  return (
    <Suspense>
      <Editor />
    </Suspense>
  );
}

/**
 * Previews unsaved custom HTML (G8): the API screens it and stores it under a short-lived token, and the frame loads it
 * from the usercontent origin. Never srcdoc, never our own origin, no cookies needed.
 */
function CustomHtmlPreview({ html }: { html: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      post<{ ok: boolean; reasons: string[]; url: string }>('/sandbox/preview', { html })
        .then((r) => {
          if (!live) return;
          setSrc(sandboxSrc(r.url));
          setReasons(r.reasons);
        })
        .catch(() => undefined);
    }, 500);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [html]);
  return (
    <>
      {reasons.length > 0 && <p role="alert" className="text-xs mt-2 text-[var(--color-coral)]">Can’t be published: {reasons.join(', ')}.</p>}
      <iframe title="Preview" src={src ?? 'about:blank'} sandbox="allow-scripts" referrerPolicy="no-referrer" className="w-full h-56 rounded-xl mt-3 border border-[var(--line)] bg-[#0b1020]" />
    </>
  );
}

const HTML_STATUS: Record<string, { label: string; cls: string }> = {
  review: { label: 'Waiting for review', cls: 'chip-gold' },
  live: { label: 'Live', cls: 'chip-teal' },
  rejected: { label: 'Not approved', cls: 'chip-coral' },
};

/** Where the custom HTML stands, and the saved versions with Restore (G8). */
function CustomHtmlStatus({ plot, onRestored }: { plot: Plot; onRestored: (p: Plot) => void }) {
  const { toast } = useGame();
  const [versions, setVersions] = useState<{ version: number; bytes: number; status: string; createdAt: string; notes: string[] }[] | null>(null);
  const status = plot.customHtmlStatus ?? 'none';
  if (status === 'none' && !plot.customHtmlVersion) return null;
  const s = HTML_STATUS[status];
  const load = () => api<{ versions: NonNullable<typeof versions> }>(`/plots/${plot.id}/custom-html/versions`).then((r) => setVersions(r.versions)).catch(() => setVersions([]));
  const restore = async (v: number) => {
    try {
      const r = await post<{ plot: Plot; customHtml: { status: string; version: number } | null }>(`/plots/${plot.id}/custom-html/versions/${v}/restore`);
      onRestored(r.plot);
      toast({ kind: 'success', title: r.customHtml?.status === 'review' ? `Version ${v} restored, waiting for review` : `Version ${v} restored` });
      void load();
    } catch (e) {
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Could not restore' });
    }
  };
  return (
    <div className="mt-3 text-sm" aria-label="Custom HTML status">
      <div className="flex flex-wrap items-center gap-2">
        {s && <span className={clsx('chip', s.cls)}>{s.label}</span>}
        {plot.customHtmlDisabled && <span className="chip chip-coral">Switched off by a moderator</span>}
        <span className="muted text-xs">Version {plot.customHtmlVersion}</span>
        <button type="button" className="text-xs underline muted" onClick={() => void load()}>Versions</button>
      </div>
      {versions && (
        <ul className="mt-2 space-y-1 max-h-40 overflow-auto">
          {versions.length === 0 && <li className="muted text-xs">No saved versions yet.</li>}
          {versions.map((v) => (
            <li key={v.version} className="flex items-center gap-2 text-xs">
              <span className="font-mono">v{v.version}</span>
              <span className="muted">{new Date(v.createdAt).toLocaleString()} · {(v.bytes / 1000).toFixed(1)} KB · {v.status}</span>
              {v.version !== plot.customHtmlVersion && <button type="button" className="underline ml-auto" onClick={() => void restore(v.version)}>Restore</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
