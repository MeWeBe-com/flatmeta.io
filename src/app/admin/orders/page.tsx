'use client';

import { useEffect, useState } from 'react';
import { ApiError, api, post } from '@/lib/api';
import { timeAgo, usd } from '@/lib/format';
import type { OrderItem } from '@/lib/types-billing';
import { useGame } from '@/components/providers';
import { clsx } from '@/components/ui';

interface Order { id: string; kind: string; status: string; amountCents: number; items: OrderItem[]; email: string | null; username: string | null; createdAt: string; paidAt: string | null }

export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [status, setStatus] = useState('');
  const { toast } = useGame();
  const load = () => void api<{ orders: Order[] }>(`/admin/orders?limit=100${status ? `&status=${status}` : ''}`).then((r) => setOrders(r.orders));
  useEffect(load, [status]);
  const refund = async (o: Order) => {
    const reason = prompt('Refund reason', 'Customer request');
    if (reason === null) return;
    try {
      await post(`/admin/orders/${o.id}/refund`, { reason });
      toast({ kind: 'success', title: 'Refunded' });
      load();
    } catch (e) {
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Refund failed' });
    }
  };
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-bold">Orders</h1>
        <select className="input w-40 ml-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>{['pending', 'paid', 'expired', 'refunded', 'failed'].map((s) => <option key={s}>{s}</option>)}</select>
      </div>
      <div className="surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs muted"><tr><th className="p-3">Order</th><th>Customer</th><th>Kind</th><th>Status</th><th className="text-right">Amount</th><th className="text-right p-3"></th></tr></thead>
          <tbody>
            {orders?.map((o) => (
              <tr key={o.id} className="border-t border-[var(--line)]">
                <td className="p-3"><div className="font-medium">{o.items[0]?.description ?? o.kind}</div><div className="text-xs muted">#{o.id.slice(0, 8)} · {timeAgo(o.createdAt)}</div></td>
                <td className="text-xs">{o.email ?? '—'}</td>
                <td className="text-xs">{o.kind}</td>
                <td><span className={clsx('chip', o.status === 'paid' ? 'chip-teal' : o.status === 'pending' ? 'chip-gold' : 'chip-coral')}>{o.status}</span></td>
                <td className="text-right font-display font-bold">{usd(o.amountCents)}</td>
                <td className="p-3 text-right">{o.status === 'paid' && <button className="btn-ghost btn-sm" onClick={() => void refund(o)}>Refund</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
