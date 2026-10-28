'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, post } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { useGame } from '@/components/providers';
import { clsx } from '@/components/ui';

interface Claim { id: string; plotSlug: string; plotTitle: string; website: string; email: string; orgName: string; status: string; note: string | null; createdAt: string }
interface Takedown { id: string; plotSlug: string; plotTitle: string; name: string; email: string; organisation: string | null; message: string; status: string; createdAt: string }

export default function ClaimsPage() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [takedowns, setTakedowns] = useState<Takedown[]>([]);
  const { toast } = useGame();
  const load = () => {
    void api<{ claims: Claim[] }>('/admin/claims').then((r) => setClaims(r.claims));
    void api<{ takedowns: Takedown[] }>('/admin/takedowns').then((r) => setTakedowns(r.takedowns));
  };
  useEffect(load, []);
  const claimAct = async (c: Claim, action: 'approve' | 'reject') => {
    const note = action === 'reject' ? prompt('Reason (sent to the requester)') ?? undefined : undefined;
    await post(`/admin/claims/${c.id}`, { action, note });
    toast({ kind: 'success', title: `Claim ${action}d` });
    load();
  };
  const tdAct = async (t: Takedown, action: 'remove' | 'reject') => {
    await post(`/admin/takedowns/${t.id}`, { action });
    toast({ kind: 'success', title: action === 'remove' ? 'Plot removed' : 'Request rejected' });
    load();
  };
  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h1 className="text-3xl font-bold">Showcase claims</h1>
        <p className="text-sm muted">Claims from a matching work-email domain verify automatically. Others wait here for manual review.</p>
        <ul className="surface divide-y divide-[var(--line)]">
          {claims.length === 0 && <li className="p-4 text-sm muted">No claims yet.</li>}
          {claims.map((c) => (
            <li key={c.id} className="p-4 flex flex-col md:flex-row gap-3 md:items-center text-sm">
              <div className="flex-1">
                <Link href={`/p/${c.plotSlug}`} className="font-semibold underline">{c.plotTitle}</Link> · {c.orgName}
                <div className="muted text-xs">{c.email} · site {c.website} · {timeAgo(c.createdAt)}</div>
                {c.note && <div className="text-xs mt-1">“{c.note}”</div>}
              </div>
              <span className={clsx('chip', c.status === 'completed' ? 'chip-teal' : c.status === 'manual_review' ? 'chip-gold' : c.status === 'rejected' ? 'chip-coral' : '')}>{c.status.replace('_', ' ')}</span>
              {c.status === 'manual_review' && (
                <div className="flex gap-2"><button className="btn-primary btn-sm" onClick={() => void claimAct(c, 'approve')}>Approve</button><button className="btn-ghost btn-sm" onClick={() => void claimAct(c, 'reject')}>Reject</button></div>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl font-bold">Takedown requests</h2>
        <ul className="surface divide-y divide-[var(--line)]">
          {takedowns.length === 0 && <li className="p-4 text-sm muted">No requests.</li>}
          {takedowns.map((t) => (
            <li key={t.id} className="p-4 flex flex-col md:flex-row gap-3 md:items-center text-sm">
              <div className="flex-1">
                <Link href={`/p/${t.plotSlug}`} className="font-semibold underline">{t.plotTitle}</Link>
                <div className="muted text-xs">{t.name} · {t.email}{t.organisation && ` · ${t.organisation}`} · {timeAgo(t.createdAt)}</div>
                <div className="text-xs mt-1">“{t.message}”</div>
              </div>
              <span className={clsx('chip', t.status === 'open' ? 'chip-gold' : t.status === 'removed' ? 'chip-coral' : '')}>{t.status}</span>
              {t.status === 'open' && <div className="flex gap-2"><button className="btn-danger btn-sm" onClick={() => void tdAct(t, 'remove')}>Remove plot</button><button className="btn-ghost btn-sm" onClick={() => void tdAct(t, 'reject')}>Keep</button></div>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
