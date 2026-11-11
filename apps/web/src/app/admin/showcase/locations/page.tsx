'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, MapPin, Move, TriangleAlert } from 'lucide-react';
import { api, post, ApiError } from '@/lib/api';
import { useGame } from '@/components/providers';
import { Spinner, clsx } from '@/components/ui';

interface Row {
  id: string;
  slug: string;
  brand: string;
  city: string | null;
  countryCode: string | null;
  lat: number;
  lng: number;
  size: { w: number; h: number };
  approved: boolean;
  locationVerified: boolean;
  locationNote: string | null;
  seed?: { lat: number; lng: number };
  flags: string[];
}
interface Resp { plots: Row[]; total: number; verified: number; suspect: number; publicRequiresCheck: boolean }
type Status = 'all' | 'unverified' | 'verified' | 'suspect';

const COUNTRIES = ['AE', 'AU', 'BR', 'DE', 'ES', 'FR', 'GB', 'IN', 'JP', 'US'];

/** Check every showcase plot sits on the right spot; bulk-verify, or nudge one to the correct coordinates. */
export default function ShowcaseLocationsPage() {
  const { toast } = useGame();
  const [country, setCountry] = useState('');
  const [status, setStatus] = useState<Status>('unverified');
  const [data, setData] = useState<Resp | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    const q = new URLSearchParams({ status, ...(country ? { country } : {}) });
    api<Resp>(`/admin/showcase/locations?${q}`)
      .then((r) => {
        setData(r);
        setSel(new Set());
      })
      .catch(() => setData({ plots: [], total: 0, verified: 0, suspect: 0, publicRequiresCheck: false }));
  }, [status, country]);
  useEffect(() => {
    load();
  }, [load]);

  const all = data?.plots ?? [];
  const allSelected = all.length > 0 && all.every((r) => sel.has(r.id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const bulk = async (verified: boolean) => {
    setBusy('bulk');
    try {
      await post('/admin/showcase/locations', { ids: [...sel], verified });
      toast({ kind: 'success', title: `${sel.size} plot${sel.size === 1 ? '' : 's'} ${verified ? 'checked' : 'unchecked'}` });
      load();
    } catch (e) {
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Could not update' });
    } finally {
      setBusy(null);
    }
  };

  // Verify every unchecked location whose automatic checks all passed (dry run first, then confirm).
  const verifyPassed = async () => {
    setBusy('passed');
    try {
      const dry = await post<{ verified: number; leftForReview: unknown[] }>('/admin/showcase/locations/verify-passed', { apply: false, ...(country ? { country } : {}) });
      if (!dry.verified) {
        toast({ kind: 'info', title: 'Nothing to verify: no unchecked location passed every automatic check.' });
        return;
      }
      if (!confirm(`Verify ${dry.verified} location${dry.verified === 1 ? '' : 's'} that passed every automatic check${country ? ` in ${country}` : ''}? ${dry.leftForReview.length} stay for manual review. In production, verified plots appear on the public map.`)) return;
      const done = await post<{ verified: number }>('/admin/showcase/locations/verify-passed', { apply: true, ...(country ? { country } : {}) });
      toast({ kind: 'success', title: `${done.verified} locations verified` });
      load();
    } catch (e) {
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Could not verify' });
    } finally {
      setBusy(null);
    }
  };

  const move = async (r: Row, lat: number, lng: number) => {
    setBusy(r.id);
    try {
      await post(`/admin/showcase/${r.id}/move`, { lat, lng });
      toast({ kind: 'success', title: `${r.brand} moved and checked` });
      load();
    } catch (e) {
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Could not move' });
    } finally {
      setBusy(null);
    }
  };
  const parse = (v: string) => {
    const m = v.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
  };

  const counts = useMemo(() => data && { total: data.total, verified: data.verified, suspect: data.suspect }, [data]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-60">
          <h1 className="text-2xl font-bold flex items-center gap-2"><MapPin size={20} /> Showcase locations</h1>
          <p className="text-sm muted">Open each spot on the map, then mark it checked, or paste the right coordinates (lat, lng) and move it.</p>
        </div>
        <Link href="/admin/showcase" className="btn-ghost btn-sm">← Showcase</Link>
      </div>

      {data?.publicRequiresCheck && (
        <p className="text-sm rounded-xl px-3 py-2 bg-[rgb(255_201_77/.1)] text-[var(--color-gold)]">
          Production: showcase plots stay hidden from the public map, lists, search and sitemaps until their location is checked here.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {(['unverified', 'suspect', 'verified', 'all'] as Status[]).map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={clsx('px-3 h-8 rounded-full capitalize', status === s ? 'bg-[var(--color-teal)] text-[#0b1020] font-semibold' : 'surface')}>{s}</button>
        ))}
        <select className="input h-9 w-auto" value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Country">
          <option value="">All countries</option>
          {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {counts && <span className="muted ml-auto">{counts.verified}/{counts.total} checked · {counts.suspect} suspect</span>}
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn-primary btn-sm" disabled={!sel.size || !!busy} onClick={() => void bulk(true)}>{busy === 'bulk' ? <Spinner /> : <CheckCircle2 size={14} />} Mark {sel.size || ''} checked</button>
        <button className="btn-ghost btn-sm" disabled={!sel.size || !!busy} onClick={() => void bulk(false)}>Mark unchecked</button>
        <button className="btn-ghost btn-sm ml-auto" disabled={!!busy} onClick={() => void verifyPassed()}>{busy === 'passed' ? <Spinner /> : <CheckCircle2 size={14} />} Verify all that passed the automatic check</button>
      </div>

      {data === null ? (
        <div className="skeleton h-40" />
      ) : all.length === 0 ? (
        <p className="muted text-sm">Nothing here.</p>
      ) : (
        <div className="surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs muted">
              <tr>
                <th className="p-3"><input type="checkbox" aria-label="Select all" checked={allSelected} onChange={() => setSel(allSelected ? new Set() : new Set(all.map((r) => r.id)))} /></th>
                <th className="p-3">Plot</th>
                <th className="p-3">Where</th>
                <th className="p-3">Checks</th>
                <th className="p-3 min-w-72">Nudge to (lat, lng)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {all.map((r) => {
                const value = edit[r.id] ?? `${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}`;
                const target = parse(value);
                return (
                  <tr key={r.id} className={clsx(r.flags.length > 0 && 'bg-[rgb(255_107_107/.05)]')}>
                    <td className="p-3 align-top"><input type="checkbox" aria-label={`Select ${r.brand}`} checked={sel.has(r.id)} onChange={() => toggle(r.id)} /></td>
                    <td className="p-3 align-top">
                      <div className="font-semibold">{r.brand}</div>
                      <div className="text-xs muted">{r.city ?? '–'} · {r.countryCode} · {r.size.w}×{r.size.h}{!r.approved && ' · not approved'}</div>
                    </td>
                    <td className="p-3 align-top whitespace-nowrap">
                      <a className="inline-flex items-center gap-1 underline" href={`/?at=${r.lat},${r.lng},17`} target="_blank" rel="noreferrer">Map <ExternalLink size={12} /></a>
                      <a className="ml-3 inline-flex items-center gap-1 underline muted" href={`https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lng}#map=18/${r.lat}/${r.lng}`} target="_blank" rel="noreferrer">OSM <ExternalLink size={12} /></a>
                      <div className="text-[11px] muted mt-1">{r.lat.toFixed(4)}, {r.lng.toFixed(4)}</div>
                    </td>
                    <td className="p-3 align-top">
                      {r.locationVerified ? <span className="chip chip-teal">checked</span> : <span className="chip">unchecked</span>}
                      {r.flags.map((f) => <div key={f} className="text-xs text-[var(--color-coral)] mt-1 flex gap-1"><TriangleAlert size={12} className="mt-0.5 shrink-0" /> {f}</div>)}
                      {r.locationNote && <div className="text-[11px] muted mt-1">{r.locationNote}</div>}
                    </td>
                    <td className="p-3 align-top">
                      <div className="flex gap-2">
                        <input className="input h-9 flex-1 font-mono text-xs" value={value} onChange={(e) => setEdit((x) => ({ ...x, [r.id]: e.target.value }))} aria-label={`New coordinates for ${r.brand}`} />
                        <button className="btn-ghost btn-sm" disabled={!target || busy === r.id} onClick={() => target && void move(r, target.lat, target.lng)}>{busy === r.id ? <Spinner /> : <Move size={14} />} Move</button>
                      </div>
                      {r.seed && r.flags.some((f) => f.startsWith('placed')) && (
                        <button className="text-xs underline muted mt-1" onClick={() => void move(r, r.seed!.lat, r.seed!.lng)}>Move back to the listed address ({r.seed.lat}, {r.seed.lng})</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
