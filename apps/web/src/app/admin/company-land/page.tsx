'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, patch, post } from '@/lib/api';
import { useGame } from '@/components/providers';
import { clsx } from '@/components/ui';

interface Row {
  id: string; company: string; country: string | null; city: string | null; source: string; plotId: string | null; plotUrl: string | null; mapUrl: string | null;
  website: string | null; wikidataUrl: string | null; logoUrl: string | null; logoSource: string | null; logoSourceUrl: string | null; logoHidden: boolean;
  status: string; createdAt: string; lastClaimActivity: string | null; contactUrl: string | null; outreachStatus: string; outreachNotes: string | null; contactedAt: string | null;
}
interface Res { total: number; counts: Record<string, number>; rows: Row[]; page: number; pages: number; logosGloballyDisabled: boolean }

const STATUSES: [string, string, string][] = [
  ['hidden', 'Hidden', ''],
  ['reserved', 'Reserved', 'chip-teal'],
  ['claim_started', 'Claim started', 'chip-gold'],
  ['claimed', 'Claimed', 'chip-violet'],
  ['removal_requested', 'Removal requested', 'chip-coral'],
  ['removed', 'Removed', 'chip-coral'],
];
const OUTREACH: [string, string][] = [['not_contacted', 'Not contacted'], ['contacted', 'Contacted'], ['replied', 'Replied'], ['sold', 'Sold']];
const label = (s: string) => STATUSES.find(([k]) => k === s)?.[1] ?? s;
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '–');

/** H2: every company plot, where it is and its state, with admin-only outreach fields; CSV export. */
export default function CompanyLandRegister() {
  const { toast } = useGame();
  const [f, setF] = useState({ q: '', country: '', status: '', outreach: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [res, setRes] = useState<Res | null>(null);
  const qs = useCallback((extra: Record<string, string> = {}) => new URLSearchParams(Object.entries({ ...f, ...extra }).filter(([, v]) => v)).toString(), [f]);
  const load = useCallback(() => void api<Res>(`/admin/company-land?${qs({ page: String(page) })}`).then(setRes).catch(() => setRes(null)), [qs, page]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const save = async (r: Row, body: Record<string, unknown>) => {
    try {
      await patch(`/admin/company-land/${r.id}`, body);
      toast({ kind: 'success', title: `${r.company}: saved` });
      load();
    } catch (e) {
      toast({ kind: 'error', title: e instanceof Error ? e.message : 'Could not save' });
    }
  };
  const hideLogo = async (r: Row, hidden: boolean) => {
    if (!r.plotId) return;
    await post(`/admin/plots/${r.plotId}/logo`, { hidden });
    load();
  };
  const globalLogos = async () => {
    if (!res) return;
    const next = !res.logosGloballyDisabled;
    if (next && !confirm('Hide every company logo on FlatMeta?')) return;
    await post('/admin/company-logos/global', { disabled: next });
    load();
  };
  const findContacts = async () => {
    const r = await post<{ checked: number; found: number }>('/admin/company-land/find-contacts', { limit: 30 });
    toast({ kind: 'success', title: `Checked ${r.checked} websites, found ${r.found} public contact pages` });
    load();
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Company land</h1>
          <p className="text-sm muted mt-1">Every company plot (curated showcase and company land), for outreach. Outreach fields are admin-only; the public list is /brands. Store only a company’s public contact page, never personal emails or names.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn-primary btn-sm" href={`/api/v1/admin/company-land?${qs({ format: 'csv' })}`} download>Download CSV</a>
          <button type="button" className="btn-ghost btn-sm" onClick={() => void findContacts()}>Find contact pages</button>
          {res && (
            <button type="button" className={clsx('btn-sm', res.logosGloballyDisabled ? 'btn-primary' : 'btn-danger')} onClick={() => void globalLogos()}>
              {res.logosGloballyDisabled ? 'Show company logos again' : 'Kill-switch: hide all logos'}
            </button>
          )}
        </div>
      </header>

      <form className="surface p-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6" role="search" aria-label="Filter the register" onSubmit={(e) => e.preventDefault()}>
        <input className="input" placeholder="Search company" aria-label="Search company" value={f.q} onChange={(e) => { setPage(1); setF({ ...f, q: e.target.value }); }} />
        <input className="input" placeholder="Country (GB)" aria-label="Country" maxLength={2} value={f.country} onChange={(e) => { setPage(1); setF({ ...f, country: e.target.value.toUpperCase() }); }} />
        <select className="input" aria-label="Status" value={f.status} onChange={(e) => { setPage(1); setF({ ...f, status: e.target.value }); }}>
          <option value="">Any status</option>
          {STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select className="input" aria-label="Outreach" value={f.outreach} onChange={(e) => { setPage(1); setF({ ...f, outreach: e.target.value }); }}>
          <option value="">Any outreach</option>
          {OUTREACH.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <input className="input" type="date" aria-label="Created from" value={f.from} onChange={(e) => { setPage(1); setF({ ...f, from: e.target.value }); }} />
        <input className="input" type="date" aria-label="Created to" value={f.to} onChange={(e) => { setPage(1); setF({ ...f, to: e.target.value }); }} />
      </form>

      {!res ? (
        <div className="skeleton h-64" />
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-xs" aria-label="Counts">
            <span className="chip">{res.total} companies</span>
            {STATUSES.map(([k, l, c]) => <span key={k} className={clsx('chip', c)}>{l}: {res.counts[k] ?? 0}</span>)}
          </div>
          <div className="surface overflow-x-auto">
            <table className="w-full text-sm" aria-label="Company land register">
              <thead>
                <tr className="text-left muted text-xs">
                  <th className="p-2">Company</th><th className="p-2">Where</th><th className="p-2">Status</th><th className="p-2">Links</th><th className="p-2">Logo</th><th className="p-2">Dates</th><th className="p-2 min-w-72">Outreach</th>
                </tr>
              </thead>
              <tbody>
                {res.rows.map((r) => (
                  <tr key={r.id} className="border-t border-[var(--line)] align-top">
                    <td className="p-2 font-medium">{r.company}<div className="text-[11px] muted">{r.source}</div></td>
                    <td className="p-2">{r.country ?? '–'}<div className="text-xs muted">{r.city ?? ''}</div></td>
                    <td className="p-2"><span className={clsx('chip text-[11px]', STATUSES.find(([k]) => k === r.status)?.[2])}>{label(r.status)}</span></td>
                    <td className="p-2 text-xs space-y-0.5">
                      {r.plotUrl && <div><a className="underline" href={r.plotUrl} target="_blank" rel="noreferrer">Plot</a> · <a className="underline" href={r.mapUrl!} target="_blank" rel="noreferrer">Map</a></div>}
                      {r.website && <div><a className="underline" href={r.website} target="_blank" rel="noopener noreferrer nofollow">Website</a></div>}
                      {r.wikidataUrl && <div><a className="underline" href={r.wikidataUrl} target="_blank" rel="noopener noreferrer">Wikidata</a></div>}
                    </td>
                    <td className="p-2 text-xs">
                      {r.logoUrl ? (
                        <div className="flex items-center gap-2">
                          <img src={r.logoUrl} alt={`${r.company} logo`} className={clsx('size-8 rounded bg-white p-0.5 object-contain', r.logoHidden && 'opacity-30')} />
                          <div>
                            {r.logoSourceUrl && <a className="underline" href={r.logoSourceUrl} target="_blank" rel="noopener noreferrer nofollow">{r.logoSource}</a>}
                            <div><button type="button" className="underline muted" onClick={() => void hideLogo(r, !r.logoHidden)}>{r.logoHidden ? 'show' : 'hide'}</button></div>
                          </div>
                        </div>
                      ) : <span className="muted">none</span>}
                    </td>
                    <td className="p-2 text-xs whitespace-nowrap">created {day(r.createdAt)}<div className="muted">claim {day(r.lastClaimActivity)}</div></td>
                    <td className="p-2 text-xs"><Outreach row={r} onSave={(b) => void save(r, b)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {res.rows.length === 0 && <p className="p-4 text-sm muted">No companies match.</p>}
          </div>
          {res.pages > 1 && (
            <nav className="flex gap-2 items-center text-sm" aria-label="Pages">
              <button className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span className="muted">Page {res.page} of {res.pages}</span>
              <button className="btn-ghost btn-sm" disabled={page >= res.pages} onClick={() => setPage(page + 1)}>Next</button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function Outreach({ row, onSave }: { row: Row; onSave: (body: Record<string, unknown>) => void }) {
  const [notes, setNotes] = useState(row.outreachNotes ?? '');
  const [contact, setContact] = useState(row.contactUrl ?? '');
  return (
    <div className="space-y-1.5">
      <div className="flex gap-2 items-center">
        <select className="input h-8 py-0 text-xs" aria-label={`Outreach status for ${row.company}`} value={row.outreachStatus} onChange={(e) => onSave({ outreachStatus: e.target.value })}>
          {OUTREACH.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <input className="input h-8 py-0 text-xs w-36" type="date" aria-label={`Contacted on for ${row.company}`} value={row.contactedAt?.slice(0, 10) ?? ''} onChange={(e) => onSave({ contactedAt: e.target.value ? new Date(`${e.target.value}T12:00:00Z`).toISOString() : null })} />
      </div>
      <div className="flex gap-1">
        <input className="input h-8 py-0 text-xs" placeholder="Public contact or press page" aria-label={`Contact page for ${row.company}`} value={contact} onChange={(e) => setContact(e.target.value)} onBlur={() => contact !== (row.contactUrl ?? '') && onSave({ contactUrl: contact || null })} />
        {row.contactUrl && <a className="underline self-center" href={row.contactUrl} target="_blank" rel="noopener noreferrer nofollow">open</a>}
      </div>
      <textarea className="input text-xs" rows={2} placeholder="Notes" aria-label={`Notes for ${row.company}`} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (row.outreachNotes ?? '') && onSave({ outreachNotes: notes || null })} />
    </div>
  );
}
