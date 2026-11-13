'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Globe2, MapPin, Search, Sparkles, User, X, Store } from 'lucide-react';
import { api } from '@/lib/api';
import { flag } from '@/lib/format';
import { t } from '@/lib/i18n';
import type { Org, Plot, PublicUser, Region } from '@/lib/types';
import { Spinner, clsx } from '../ui';

interface Place { name: string; label: string; lat: number; lng: number; countryCode: string | null; type: string; bbox?: [number, number, number, number] }
interface Results {
  intent: { keywords: string; place: string | null; category: string | null; country: string | null; provider: string } | null;
  plots: Plot[];
  users: PublicUser[];
  orgs: Org[];
  countries: { code: string; name: string; flag: string; lat: number; lng: number }[];
  regions: Region[];
  places: Place[];
}

export function SearchPalette({ open, onClose, onFlyTo, onPlot }: { open: boolean; onClose: () => void; onFlyTo: (lng: number, lat: number, zoom: number) => void; onPlot: (p: Plot) => void }) {
  const [q, setQ] = useState('');
  const [ai, setAi] = useState(false);
  const [res, setRes] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  // G14: "Ask FlatMeta": questions get a short answer grounded in our own results (plain search summary without AI).
  const [answer, setAnswer] = useState<{ answer: string; provider: string; plots: Plot[] } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setRes(null);
      setAnswer(null);
      return;
    }
    const looksLikeQuestion = q.trim().split(/\s+/).length >= 3 || q.trim().endsWith('?');
    const useAi = ai || looksLikeQuestion;
    const tm = setTimeout(async () => {
      setLoading(true);
      try {
        const [r, a] = await Promise.all([
          api<Results>(`/search?q=${encodeURIComponent(q.trim())}&ai=${useAi ? 1 : 0}`),
          looksLikeQuestion ? api<{ answer: string; provider: string; plots: Plot[] }>(`/ask?q=${encodeURIComponent(q.trim())}`).catch(() => null) : Promise.resolve(null),
        ]);
        setRes(r);
        setAnswer(a);
      } catch {
        setRes(null);
      } finally {
        setLoading(false);
      }
    }, useAi ? 450 : 220);
    return () => clearTimeout(tm);
  }, [q, ai, open]);

  if (!open) return null;
  const pick = (fn: () => void) => {
    fn();
    onClose();
  };
  const empty = res && !res.plots.length && !res.places.length && !res.countries.length && !res.regions.length && !res.users.length && !res.orgs.length;

  return (
    <div className="fixed inset-0 z-[55] flex items-start justify-center p-3 pt-[10vh]" role="dialog" aria-modal="true" aria-label="Search">
      <button className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-label="Close search" tabIndex={-1} />
      <div className="relative w-full max-w-2xl card overflow-hidden animate-pop">
        <div className="flex items-center gap-3 px-4 h-14 border-b border-[var(--line)]">
          {loading ? <Spinner className="text-[var(--color-teal)]" /> : <Search size={18} className="muted" />}
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onClose()}
            className="flex-1 bg-transparent outline-none text-base"
            placeholder={ai ? t('hud.searchAi') : 'Search, or ask FlatMeta a question'}
            aria-label="Search"
          />
          <button onClick={() => setAi((a) => !a)} className={clsx('chip h-7', ai ? 'chip-violet' : '')} title="AI search understands natural language">
            <Sparkles size={12} /> AI
          </button>
          <button className="icon-btn size-8" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {answer && (
            <section aria-label="Ask FlatMeta answer" className="m-1 mb-3 rounded-2xl p-3 border border-[rgb(139_124_255/.35)] bg-[rgb(139_124_255/.08)]">
              <div className="text-xs uppercase tracking-wider font-semibold text-[var(--color-violet)] flex items-center gap-1.5">
                <Sparkles size={12} /> Ask FlatMeta {answer.provider === 'ai' ? '' : '· search summary'}
              </div>
              <p className="text-sm mt-1.5">{answer.answer}</p>
              {answer.plots.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {answer.plots.slice(0, 4).map((p) => (
                    <button key={p.id} type="button" className="chip normal-case tracking-normal" onClick={() => pick(() => onPlot(p))}>
                      <MapPin size={11} /> {p.title}
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
          {res?.intent && (
            <div className="px-3 py-2 text-xs muted flex flex-wrap gap-1.5 items-center">
              <Sparkles size={12} className="text-[var(--color-violet)]" /> Understood as:
              {res.intent.keywords && <span className="chip">{res.intent.keywords}</span>}
              {res.intent.category && <span className="chip chip-teal">{res.intent.category}</span>}
              {res.intent.place && <span className="chip chip-violet">📍 {res.intent.place}</span>}
              {res.intent.country && <span className="chip">{flag(res.intent.country)} {res.intent.country}</span>}
            </div>
          )}
          {!res && !loading && (
            <div className="p-6 text-sm muted grid gap-2">
              <p>Try: <button className="underline" onClick={() => setQ('Tokyo')}>Tokyo</button> · <button className="underline" onClick={() => setQ('museum')}>museum</button> · <button className="underline" onClick={() => { setAi(true); setQ('surf schools in Rio'); }}>surf schools in Rio</button></p>
            </div>
          )}
          {empty && <p className="p-6 text-sm muted">Nothing found. Try a city, a brand or a plain question with AI on.</p>}
          {res && res.plots.length > 0 && <Group label="Plots">{res.plots.map((p) => (
            <Row key={p.id} onClick={() => pick(() => onPlot(p))} icon={p.thumbUrl ? <img src={p.thumbUrl} alt="" className="size-9 rounded-lg object-cover" /> : <MapPin size={16} />} title={p.title} sub={`${p.kind === 'showcase' ? 'Showcase · ' : ''}${p.countryName ?? 'Ocean'}${p.tagline ? ' · ' + p.tagline : ''}`} />
          ))}</Group>}
          {res && res.places.length > 0 && <Group label="Places">{res.places.map((p, i) => (
            <Row key={i} onClick={() => pick(() => onFlyTo(p.lng, p.lat, p.type === 'country' ? 5 : p.type === 'city' ? 11 : 14))} icon={<MapPin size={16} />} title={p.name} sub={p.label} />
          ))}</Group>}
          {res && res.regions.length > 0 && <Group label="Cities">{res.regions.map((r) => (
            <Row key={r.slug} onClick={() => pick(() => router.push(`/r/${r.slug}`))} icon={<Building2 size={16} />} title={r.name} sub={`${flag(r.countryCode)} City page`} />
          ))}</Group>}
          {res && res.countries.length > 0 && <Group label="Countries">{res.countries.map((c) => (
            <Row key={c.code} onClick={() => pick(() => router.push(`/c/${c.code.toLowerCase()}`))} icon={<span className="text-lg">{c.flag}</span>} title={c.name} sub="Country page" />
          ))}</Group>}
          {res && res.orgs.length > 0 && <Group label="Organisations">{res.orgs.map((o) => (
            <Row key={o.id} onClick={() => pick(() => router.push(`/o/${o.slug}`))} icon={<Store size={16} />} title={o.name} sub={o.verified ? 'Verified' : o.kind} />
          ))}</Group>}
          {res && res.users.length > 0 && <Group label="Explorers">{res.users.map((u) => (
            <Row key={u.id} onClick={() => pick(() => router.push(`/u/${u.username}`))} icon={<User size={16} />} title={u.displayName} sub={`@${u.username} · level ${u.level}`} />
          ))}</Group>}
        </div>
        <div className="px-4 h-9 border-t border-[var(--line)] text-xs muted flex items-center gap-3">
          <Globe2 size={12} /> Search covers plots, brands, places, cities and explorers <span className="ml-auto kbd-only" data-testid="esc-hint">Esc to close</span>
        </div>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <div className="px-3 pt-2 pb-1 text-xs uppercase tracking-wider font-semibold muted">{label}</div>
      {children}
    </div>
  );
}
function Row({ icon, title, sub, onClick }: { icon: React.ReactNode; title: string; sub?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 text-left">
      <span className="size-9 shrink-0 rounded-lg grid place-items-center bg-white/5">{icon}</span>
      <span className="min-w-0">
        <span className="block font-medium truncate">{title}</span>
        {sub && <span className="block text-xs muted truncate">{sub}</span>}
      </span>
    </button>
  );
}
