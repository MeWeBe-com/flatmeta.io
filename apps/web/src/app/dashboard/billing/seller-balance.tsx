'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Landmark } from 'lucide-react';
import { ApiError, api, post } from '@/lib/api';
import { timeAgo, usd } from '@/lib/format';
import type { Listing } from '@/lib/types';
import { useGame } from '@/components/providers';
import { Spinner } from '@/components/ui';

interface Balance { balanceCents: number; minPayoutCents: number; payoutsEnabled: boolean; connected: boolean; entries: { id: number; kind: string; amountCents: number; createdAt: string }[] }
const KIND: Record<string, string> = { seller_credit: 'Sale', payout: 'Payout', refund: 'Refund' };

/** Marketplace earnings, payout setup, and my listings and purchases. */
export function SellerBalance() {
  const { toast } = useGame();
  const [bal, setBal] = useState<Balance | null>(null);
  const [sales, setSales] = useState<Listing[]>([]);
  const [bought, setBought] = useState<Listing[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Balance>('/me/balance').then(setBal).catch(() => undefined);
    api<{ listings: Listing[] }>('/me/sales').then((r) => setSales(r.listings)).catch(() => undefined);
    api<{ listings: Listing[] }>('/me/purchases').then((r) => setBought(r.listings)).catch(() => undefined);
  }, []);
  useEffect(() => {
    load();
    // Returning from payout onboarding: re-check the account.
    if (new URLSearchParams(location.search).has('connect')) void post('/payouts/refresh').then(load).catch(() => undefined);
  }, [load]);

  const connect = async () => {
    setBusy(true);
    try {
      window.location.assign((await post<{ url: string }>('/payouts/connect')).url);
    } catch (e) {
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Payouts are not available yet' });
      setBusy(false);
    }
  };

  if (!bal) return null;
  const active = sales.filter((l) => l.status === 'active');
  const sold = sales.filter((l) => l.status === 'sold');
  return (
    <div className="surface p-6 space-y-5">
      <div className="flex flex-wrap items-center gap-4 justify-between">
        <div>
          <div className="text-sm muted">Marketplace balance</div>
          <div className="text-3xl font-display font-bold">{usd(bal.balanceCents)}</div>
          <p className="text-xs muted mt-1">Paid out automatically once it reaches {usd(bal.minPayoutCents)} and your payout account is ready.</p>
        </div>
        {bal.payoutsEnabled ? (
          <span className="chip chip-teal"><Landmark size={12} /> Payouts ready</span>
        ) : (
          <button className="btn-primary" disabled={busy} onClick={() => void connect()}>{busy ? <Spinner /> : <Landmark size={16} />} {bal.connected ? 'Finish payout setup' : 'Set up payouts'}</button>
        )}
      </div>
      {(active.length > 0 || sold.length > 0 || bought.length > 0) && (
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          <Group title={`For sale (${active.length})`} items={active} empty="Nothing listed." />
          <Group title={`Sold (${sold.length})`} items={sold} empty="No sales yet." />
          <Group title={`Bought (${bought.length})`} items={bought} empty="No purchases yet." />
        </div>
      )}
      {bal.entries.length > 0 && (
        <div>
          <div className="text-sm muted mb-2">Recent activity</div>
          <ul className="divide-y divide-[var(--line)] text-sm">
            {bal.entries.slice(0, 8).map((e) => (
              <li key={e.id} className="py-2 flex justify-between"><span>{KIND[e.kind] ?? e.kind} <span className="muted">· {timeAgo(e.createdAt)}</span></span><span className={e.amountCents < 0 ? 'muted' : 'text-[var(--color-teal)] font-semibold'}>{e.amountCents < 0 ? '−' : '+'}{usd(Math.abs(e.amountCents))}</span></li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs muted">Sell a plot from its page: open it and press “Sell this plot”. <Link href="/marketplace" className="underline">Browse the marketplace</Link>.</p>
    </div>
  );
}

function Group({ title, items, empty }: { title: string; items: Listing[]; empty: string }) {
  return (
    <div>
      <div className="font-semibold mb-1">{title}</div>
      {items.length === 0 ? <p className="muted text-xs">{empty}</p> : (
        <ul className="space-y-1">
          {items.slice(0, 5).map((l) => (
            <li key={l.id}><Link href={`/p/${l.plot.slug}`} className="hover:underline">{l.plot.title}</Link> <span className="muted">{usd(l.priceCents)}</span></li>
          ))}
        </ul>
      )}
    </div>
  );
}
