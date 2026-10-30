'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ApiError, api, post } from '@/lib/api';
import { timeAgo, usd } from '@/lib/format';
import type { Listing, PublicUser } from '@/lib/types';
import { useGame } from '@/components/providers';
import { Stat, clsx } from '@/components/ui';

interface Overview { sales: number; active: number; volume: number; platformFeesCents: number; feeBps: number; sellers: { user: PublicUser | null; userId: string; balanceCents: number }[]; recent: Listing[] }

export default function AdminMarketplace() {
  const { toast } = useGame();
  const [d, setD] = useState<Overview | null>(null);
  const load = () => void api<Overview>('/admin/marketplace').then(setD);
  useEffect(load, []);
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast({ kind: 'success', title: ok });
      load();
    } catch (e) {
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Failed' });
    }
  };
  if (!d) return <div className="skeleton h-64" />;
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Marketplace</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Listed now" value={d.active} icon="store" />
        <Stat label="Sold" value={d.sales} icon="gem" />
        <Stat label="Volume" value={usd(d.volume)} icon="trending" />
        <Stat label={`Platform fees (${d.feeBps / 100}%)`} value={usd(d.platformFeesCents)} icon="landmark" />
      </div>

      <section className="space-y-3">
        <h2 className="font-bold">Seller balances</h2>
        <p className="text-sm muted">Balances are paid automatically when a seller has a ready payout account. Record a manual payout here after paying someone outside the platform.</p>
        <div className="surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs muted"><tr><th className="p-3">Seller</th><th className="text-right">Balance</th><th className="p-3 text-right"></th></tr></thead>
            <tbody>
              {d.sellers.length === 0 && <tr><td className="p-4 muted" colSpan={3}>No balances.</td></tr>}
              {d.sellers.map((s) => (
                <tr key={s.userId} className="border-t border-[var(--line)]">
                  <td className="p-3">{s.user ? <Link href={`/u/${s.user.username}`} className="hover:underline">{s.user.displayName} <span className="muted">@{s.user.username}</span></Link> : s.userId}</td>
                  <td className="text-right font-display font-bold">{usd(s.balanceCents)}</td>
                  <td className="p-3 text-right">
                    {s.balanceCents > 0 && (
                      <button className="btn-ghost btn-sm" onClick={() => {
                        const v = prompt(`Amount paid out manually (max ${usd(s.balanceCents)}), in dollars`, (s.balanceCents / 100).toFixed(2));
                        if (!v) return;
                        const cents = Math.round(Number(v) * 100);
                        void act(() => post('/admin/payouts/manual', { userId: s.userId, amountCents: cents, note: 'manual payout' }), 'Payout recorded');
                      }}>Record payout</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-bold">Recent listings</h2>
        <div className="surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs muted"><tr><th className="p-3">Plot</th><th>Status</th><th className="text-right">Price</th><th>Updated</th><th className="p-3 text-right"></th></tr></thead>
            <tbody>
              {d.recent.map((l) => (
                <tr key={l.id} className="border-t border-[var(--line)]">
                  <td className="p-3"><Link href={`/p/${l.plot.slug}`} className="hover:underline">{l.plot.title}</Link></td>
                  <td><span className={clsx('chip', l.status === 'active' ? 'chip-teal' : l.status === 'sold' ? 'chip-gold' : '')}>{l.status}</span></td>
                  <td className="text-right">{usd(l.priceCents)}</td>
                  <td className="muted">{timeAgo(l.soldAt ?? l.createdAt)}</td>
                  <td className="p-3 text-right">{l.status === 'active' && <button className="btn-danger btn-sm" onClick={() => confirm('Void this listing?') && void act(() => post(`/admin/listings/${l.id}/void`), 'Listing voided')}>Void</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
