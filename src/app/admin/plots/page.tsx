'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, patch, post } from '@/lib/api';
import { flag } from '@/lib/format';
import type { Plot } from '@/lib/types';
import { useGame } from '@/components/providers';
import { clsx } from '@/components/ui';

export default function AdminPlots() {
  const [plots, setPlots] = useState<Plot[] | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const { toast } = useGame();
  const load = () => {
    const qs = new URLSearchParams({ limit: '100' });
    if (q) qs.set('q', q);
    if (status) qs.set('status', status);
    if (kind) qs.set('kind', kind);
    void api<{ plots: Plot[] }>(`/admin/plots?${qs}`).then((r) => setPlots(r.plots));
  };
  useEffect(load, [status, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const update = async (p: Plot, body: Record<string, unknown>, msg: string) => {
    await patch(`/admin/plots/${p.id}`, body);
    toast({ kind: 'success', title: msg });
    load();
  };
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Plots</h1>
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <input className="input w-64" placeholder="Search title or slug" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-40" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option>{['active', 'pending_payment', 'showcase', 'hidden', 'released'].map((s) => <option key={s}>{s}</option>)}</select>
        <select className="input w-40" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Any kind</option>{['standard', 'homestead', 'showcase', 'landmark'].map((s) => <option key={s}>{s}</option>)}</select>
        <button className="btn-ghost">Search</button>
      </form>
      <div className="surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs muted"><tr><th className="p-3">Plot</th><th>Owner</th><th>Status</th><th>Mod</th><th>Size</th><th>♥</th><th className="text-right p-3">Actions</th></tr></thead>
          <tbody>
            {plots?.map((p) => (
              <tr key={p.id} className="border-t border-[var(--line)]">
                <td className="p-3"><Link href={`/p/${p.slug}`} className="font-semibold hover:underline">{flag(p.countryCode)} {p.title}</Link><div className="text-xs muted">{p.kind}</div></td>
                <td className="text-xs">{p.owner?.displayName ?? '—'}</td>
                <td><span className={clsx('chip', p.status === 'active' ? 'chip-teal' : p.status === 'hidden' ? 'chip-coral' : '')}>{p.status}</span></td>
                <td className="text-xs">{p.moderationStatus}</td>
                <td className="text-xs">{p.width}×{p.height}</td>
                <td className="text-xs">{p.likesCount}</td>
                <td className="p-3 text-right whitespace-nowrap space-x-1">
                  {p.status === 'active' && <button className="btn-ghost btn-sm" onClick={() => void update(p, { status: 'hidden' }, 'Hidden')}>Hide</button>}
                  {p.status === 'hidden' && <button className="btn-ghost btn-sm" onClick={() => void update(p, { status: 'active', moderationStatus: 'ok' }, 'Restored')}>Restore</button>}
                  {p.status === 'active' && <button className="btn-ghost btn-sm" onClick={() => void update(p, { spotlightDays: 7 }, 'Featured for 7 days')}>Feature</button>}
                  {p.status !== 'released' && p.kind !== 'showcase' && <button className="btn-ghost btn-sm" onClick={async () => { if (confirm('Release this plot? Its cells return to the open map.')) { await post(`/admin/plots/${p.id}/release`); load(); } }}>Release</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
