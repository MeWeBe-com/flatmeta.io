'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CreditCard, Sparkles } from 'lucide-react';
import { ApiError, api, post } from '@/lib/api';
import { usd, timeAgo } from '@/lib/format';
import type { OrderItem } from '@/lib/types-billing';
import { useGame, useSession } from '@/components/providers';
import { SectionTitle, Spinner, clsx } from '@/components/ui';
import { SellerBalance } from './seller-balance';

interface Order { id: string; kind: string; status: string; amountCents: number; currency: string; items: OrderItem[]; createdAt: string }
interface Sub { id: string; plan: string; interval: string; status: string; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean }

export default function BillingPage() {
  const { me } = useSession();
  const { toast } = useGame();
  const [data, setData] = useState<{ orders: Order[]; subscriptions: Sub[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { api<{ orders: Order[]; subscriptions: Sub[] }>('/billing/orders').then(setData).catch(() => setData({ orders: [], subscriptions: [] })); }, []);
  const go = async (key: string, fn: () => Promise<{ url?: string; checkoutUrl?: string }>) => {
    setBusy(key);
    try {
      const r = await fn();
      window.location.href = (r.url ?? r.checkoutUrl)!;
    } catch (e) {
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Unavailable' });
      setBusy(null);
    }
  };
  const plus = me.user?.plan === 'plus';
  return (
    <div className="space-y-8">
      <SectionTitle>Billing</SectionTitle>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="surface p-6 space-y-3">
          <div className="text-sm muted">Personal plan</div>
          <div className="text-2xl font-bold">{plus ? 'Plus ✦' : 'Free'}</div>
          <p className="text-sm muted">{plus ? '30 AI designs a month, Plus frames, 10% off land and more.' : 'Upgrade for 30 AI designs a month, exclusive frames and 10% off land.'}</p>
          <div className="flex gap-2">
            {!plus && <button className="btn-primary" disabled={!!busy} onClick={() => void go('plus', () => post('/billing/checkout', { plan: 'plus', interval: 'year' }))}>{busy === 'plus' && <Spinner />} Get Plus · $48/yr</button>}
            <button className="btn-ghost" disabled={!!busy} onClick={() => void go('portal', () => post('/billing/portal', {}))}><CreditCard size={16} /> Manage payment methods</button>
          </div>
        </div>
        <div className="surface p-6 space-y-3">
          <div className="text-sm muted">AI designs</div>
          <div className="text-2xl font-bold">{me.credits?.unlimited ? 'Unlimited' : `${me.credits?.remaining ?? 0} left`}</div>
          <p className="text-sm muted">{me.credits ? `${me.credits.monthly} included each month · ${me.credits.bonus} bonus` : ''}</p>
          <button className="btn-gold" disabled={!!busy} onClick={() => void go('credits', () => post('/billing/credits'))}>{busy === 'credits' ? <Spinner /> : <Sparkles size={16} />} Design Pack · +25 for $5</button>
        </div>
      </div>
      <SellerBalance />
      <p className="text-sm muted">Business and Brand plans are managed per organisation in <Link className="underline" href="/dashboard/orgs">Organisations</Link>.</p>
      {data?.subscriptions.length ? (
        <section>
          <h2 className="font-bold mb-3">Subscriptions</h2>
          <ul className="surface divide-y divide-[var(--line)]">{data.subscriptions.map((s) => (
            <li key={s.id} className="p-4 flex flex-wrap gap-3 text-sm"><span className="font-semibold capitalize">{s.plan}</span><span className="muted">{s.interval}ly</span><span className={clsx('chip', s.status === 'active' ? 'chip-teal' : 'chip-coral')}>{s.status}</span>{s.currentPeriodEnd && <span className="muted ml-auto">{s.cancelAtPeriodEnd ? 'Ends' : 'Renews'} {new Date(s.currentPeriodEnd).toLocaleDateString()}</span>}</li>
          ))}</ul>
        </section>
      ) : null}
      <section>
        <h2 className="font-bold mb-3">Orders</h2>
        {!data ? <div className="skeleton h-24" /> : data.orders.length === 0 ? <p className="text-sm muted">No orders yet.</p> : (
          <ul className="surface divide-y divide-[var(--line)]">
            {data.orders.map((o) => (
              <li key={o.id} className="p-4 flex flex-wrap items-center gap-3 text-sm">
                <span className="font-semibold">{o.items[0]?.description ?? o.kind}</span>
                <span className={clsx('chip', o.status === 'paid' ? 'chip-teal' : o.status === 'pending' ? 'chip-gold' : 'chip-coral')}>{o.status}</span>
                <span className="ml-auto font-display font-bold">{usd(o.amountCents)}</span>
                <span className="text-xs muted w-full md:w-auto">#{o.id.slice(0, 8)} · {timeAgo(o.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
