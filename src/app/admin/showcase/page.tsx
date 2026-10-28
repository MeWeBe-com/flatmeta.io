'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Download, RefreshCw, Sparkles, XCircle, Pencil } from 'lucide-react';
import { ApiError, api, patch, post } from '@/lib/api';
import { flag, timeAgo } from '@/lib/format';
import type { Plot } from '@/lib/types';
import { useGame } from '@/components/providers';
import { Modal, Spinner, clsx } from '@/components/ui';

type SPlot = Plot & { showcaseFull: { brand: string; website: string; sector: string; useCase: string; highlights: string[]; imagePrompt: string; approved: boolean; batchId?: string } | null };
interface Batch { id: string; countries: string[]; status: string; stats: Record<string, unknown>; createdAt: string }

export default function ShowcaseAdmin() {
  const { toast } = useGame();
  const [plots, setPlots] = useState<SPlot[]>([]);
  const [total, setTotal] = useState(0);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [curated, setCurated] = useState<string[]>([]);
  const [country, setCountry] = useState('');
  const [approved, setApproved] = useState('');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [gen, setGen] = useState({ countries: '', source: 'curated', count: 14, images: '', approve: false, names: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<SPlot | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ limit: '200' });
    if (country) qs.set('country', country);
    if (approved) qs.set('approved', approved);
    if (q) qs.set('q', q);
    try {
      const r = await api<{ plots: SPlot[]; total: number; batches: Batch[]; curatedCountries: string[] }>(`/admin/showcase?${qs}`);
      setPlots(r.plots);
      setTotal(r.total);
      setBatches(r.batches);
      setCurated(r.curatedCountries);
    } finally {
      setLoading(false);
    }
  }, [country, approved, q]);
  useEffect(() => { void load(); }, [load]);

  const generate = async () => {
    setBusy('gen');
    try {
      const countries = gen.countries.split(',').map((c) => c.trim().toUpperCase()).filter((c) => c.length === 2);
      await post('/admin/showcase/generate', {
        countries,
        source: gen.source,
        count: gen.count,
        approve: gen.approve,
        ...(gen.images ? { images: gen.images } : {}),
        ...(gen.names.trim() ? { names: gen.names.split(',').map((n) => n.trim()).filter(Boolean) } : {}),
      });
      toast({ kind: 'success', title: `Generating showcase for ${countries.join(', ')}…` });
      setTimeout(() => void load(), 4000);
    } catch (e) {
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Could not start' });
    } finally {
      setBusy(null);
    }
  };
  const bulk = async (value: boolean) => {
    await post('/admin/showcase/approve', { ids: [...selected], approved: value });
    toast({ kind: 'success', title: `${selected.size} plots ${value ? 'approved' : 'unpublished'}` });
    setSelected(new Set());
    void load();
  };
  const regen = async (p: SPlot, provider?: string) => {
    setBusy(p.id);
    try {
      const r = await post<{ pending: boolean; provider: string }>(`/admin/showcase/${p.id}/regenerate-image`, provider ? { provider } : {});
      toast({ kind: 'success', title: r.pending ? 'Prompt queued for the external pipeline (placeholder shown)' : `New image (${r.provider})` });
      void load();
    } catch (e) {
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Failed' });
    } finally {
      setBusy(null);
    }
  };
  const exportJson = async () => {
    if (!country) return toast({ kind: 'info', title: 'Pick a country to export' });
    const data = await api(`/admin/showcase/export?country=${country}`);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${country}.json`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Showcase manager</h1>
        <p className="muted text-sm mt-1">Sample plots for well-known organisations. Brand name only, original art, always labelled “Showcase · Unclaimed”. {total} plots.</p>
      </div>

      <section className="surface p-5 space-y-3">
        <h2 className="font-bold flex items-center gap-2"><Sparkles size={16} className="text-[var(--color-violet)]" /> Generate</h2>
        <div className="grid md:grid-cols-6 gap-2">
          <input className="input md:col-span-2" placeholder={`Countries, e.g. ${curated.slice(0, 3).join(',') || 'GB,FR'}`} value={gen.countries} onChange={(e) => setGen({ ...gen, countries: e.target.value })} />
          <select className="input" value={gen.source} onChange={(e) => setGen({ ...gen, source: e.target.value })}><option value="curated">Curated JSON</option><option value="ai">AI-generated list</option></select>
          <input className="input" type="number" min={1} max={30} value={gen.count} onChange={(e) => setGen({ ...gen, count: Number(e.target.value) })} aria-label="Count" />
          <select className="input" value={gen.images} onChange={(e) => setGen({ ...gen, images: e.target.value })}><option value="">Images: server default</option><option value="procedural">Procedural (free)</option><option value="openai">OpenAI Images</option><option value="gemini">Google Imagen</option><option value="external">External pipeline (Flow)</option></select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={gen.approve} onChange={(e) => setGen({ ...gen, approve: e.target.checked })} /> Approve</label>
        </div>
        {gen.source === 'ai' && <input className="input" placeholder="Optional: specific organisations, comma separated" value={gen.names} onChange={(e) => setGen({ ...gen, names: e.target.value })} />}
        <div className="flex flex-wrap gap-2 items-center">
          <button className="btn-primary" disabled={busy === 'gen' || !gen.countries} onClick={() => void generate()}>{busy === 'gen' && <Spinner />} Generate</button>
          <span className="text-xs muted">Curated countries: {curated.join(', ')}</span>
        </div>
        {batches.length > 0 && (
          <ul className="text-xs muted space-y-1">
            {batches.slice(0, 4).map((b) => (
              <li key={b.id}>
                <span className={clsx('chip mr-2', b.status === 'done' ? 'chip-teal' : b.status === 'failed' ? 'chip-coral' : 'chip-gold')}>{b.status}</span>
                {b.countries.join(', ')} · {timeAgo(b.createdAt)} · {String(b.stats.created ?? 0)} created, {String(b.stats.updated ?? 0)} updated, {String(b.stats.failed ?? 0)} failed
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-2 items-center">
        <select className="input w-44" value={country} onChange={(e) => setCountry(e.target.value)}><option value="">All countries</option>{curated.map((c) => <option key={c} value={c}>{flag(c)} {c}</option>)}</select>
        <select className="input w-40" value={approved} onChange={(e) => setApproved(e.target.value)}><option value="">Any status</option><option value="true">Approved</option><option value="false">Not approved</option></select>
        <input className="input w-56" placeholder="Search brand" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-ghost btn-sm" onClick={() => void exportJson()}><Download size={14} /> Export JSON</button>
        {selected.size > 0 && (
          <div className="flex gap-2 ml-auto">
            <span className="text-sm muted self-center">{selected.size} selected</span>
            <button className="btn-primary btn-sm" onClick={() => void bulk(true)}><CheckCircle2 size={14} /> Approve</button>
            <button className="btn-ghost btn-sm" onClick={() => void bulk(false)}><XCircle size={14} /> Unpublish</button>
          </div>
        )}
        <button className="btn-ghost btn-sm" onClick={() => setSelected(selected.size === plots.length ? new Set() : new Set(plots.map((p) => p.id)))}>{selected.size === plots.length && plots.length ? 'Clear' : 'Select all'}</button>
      </div>

      {loading ? <div className="skeleton h-80" /> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {plots.map((p) => (
            <div key={p.id} className={clsx('surface overflow-hidden', selected.has(p.id) && 'border-[var(--color-teal)]')}>
              <div className="relative aspect-[3/2]">
                {p.thumbUrl && <img src={p.coverImageUrl ?? p.thumbUrl} alt="" className="size-full object-cover" />}
                <label className="absolute left-2 top-2 glass rounded-lg p-1.5">
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => { const s = new Set(selected); if (s.has(p.id)) s.delete(p.id); else s.add(p.id); setSelected(s); }} aria-label={`Select ${p.title}`} />
                </label>
                <span className={clsx('chip absolute right-2 top-2', p.showcaseFull?.approved ? 'chip-teal' : 'chip-gold')}>{p.showcaseFull?.approved ? 'live' : 'pending'}</span>
              </div>
              <div className="p-3 space-y-1">
                <div className="font-semibold text-sm truncate">{flag(p.countryCode)} {p.title}</div>
                <div className="text-xs muted line-clamp-2">{p.tagline}</div>
                <div className="flex gap-1 pt-2">
                  <button className="btn-ghost btn-sm flex-1" onClick={() => setEditing(p)}><Pencil size={12} /> Edit</button>
                  <button className="btn-ghost btn-sm" disabled={busy === p.id} onClick={() => void regen(p)} title="Regenerate image">{busy === p.id ? <Spinner /> : <RefreshCw size={12} />}</button>
                  <Link className="btn-ghost btn-sm" href={`/p/${p.slug}`} target="_blank">View</Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <EditShowcase plot={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} onRegen={(provider) => editing && void regen(editing, provider)} />
    </div>
  );
}

function EditShowcase({ plot, onClose, onSaved, onRegen }: { plot: SPlot | null; onClose: () => void; onSaved: () => void; onRegen: (provider?: string) => void }) {
  const [f, setF] = useState({ title: '', tagline: '', descriptionMd: '', website: '', imagePrompt: '', approved: false });
  const [busy, setBusy] = useState(false);
  const { toast } = useGame();
  useEffect(() => {
    if (plot) setF({ title: plot.title, tagline: plot.tagline ?? '', descriptionMd: plot.descriptionMd ?? '', website: plot.showcaseFull?.website ?? '', imagePrompt: plot.showcaseFull?.imagePrompt ?? '', approved: !!plot.showcaseFull?.approved });
  }, [plot]);
  if (!plot) return null;
  const save = async () => {
    setBusy(true);
    try {
      await patch(`/admin/showcase/${plot.id}`, { title: f.title, tagline: f.tagline, descriptionMd: f.descriptionMd, showcase: { website: f.website, imagePrompt: f.imagePrompt, approved: f.approved } });
      toast({ kind: 'success', title: 'Saved' });
      onSaved();
    } catch (e) {
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Save failed' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={!!plot} onClose={onClose} title={`Edit ${plot.title}`} wide>
      <div className="space-y-3">
        <div><label className="label">Title (brand name)</label><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div><label className="label">Tagline</label><input className="input" value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} /></div>
        <div><label className="label">Description</label><textarea className="input" rows={6} value={f.descriptionMd} onChange={(e) => setF({ ...f, descriptionMd: e.target.value })} /></div>
        <div><label className="label">Official website</label><input className="input" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} /></div>
        <div><label className="label">Image prompt (no logos, no text)</label><textarea className="input" rows={3} value={f.imagePrompt} onChange={(e) => setF({ ...f, imagePrompt: e.target.value })} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.approved} onChange={(e) => setF({ ...f, approved: e.target.checked })} /> Approved (visible on the map)</label>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={busy} onClick={() => void save()}>{busy && <Spinner />} Save</button>
          <button className="btn-ghost" onClick={() => onRegen('procedural')}>New procedural art</button>
          <button className="btn-ghost" onClick={() => onRegen('openai')}>OpenAI image</button>
          <button className="btn-ghost" onClick={() => onRegen('gemini')}>Imagen</button>
          <button className="btn-ghost" onClick={() => onRegen('external')}>Queue for Flow</button>
        </div>
      </div>
    </Modal>
  );
}
