'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CreditCard, ShieldCheck } from 'lucide-react';
import { ApiError, api, post } from '@/lib/api';
import { usd } from '@/lib/format';
import { useSession } from '@/components/providers';
import { Spinner } from '@/components/ui';

interface OrderView {
  order: { id: string; kind: string; status: string; amountCents: number; currency: string; items: { description: string; amountCents: number; quantity: number }[]; cancelPath: string | null };
  providers: { stripe: boolean; paypal: boolean };
}

/**
 * GL4: the order summary and the two ways to pay. Both are hosted by the payment provider (we never see card or PayPal
 * details); the amount is fixed on the server from the order, whatever the browser sends.
 */
export function PayChooser({ orderId }: { orderId: string }) {
  const { me, loading, openSignIn } = useSession();
  const [data, setData] = useState<OrderView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'stripe' | 'paypal' | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!me.user) return void openSignIn('Sign in to finish paying.');
    api<OrderView>(`/orders/${orderId}`)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load the order'));
  }, [orderId, loading, me.user, openSignIn]);

  const pay = async (provider: 'stripe' | 'paypal') => {
    setBusy(provider);
    setError(null);
    try {
      const r = await post<{ url: string }>(`/orders/${orderId}/pay`, { provider });
      window.location.href = r.url;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Payment is not available right now');
      setBusy(null);
    }
  };

  if (error && !data) return <div className="surface p-6 mt-10">{error}</div>;
  if (!data) return <div className="skeleton h-72 mt-10" />;
  const o = data.order;
  if (o.status === 'paid') {
    return (
      <div className="surface p-6 mt-10 space-y-3">
        <h1 className="text-2xl font-bold">Already paid</h1>
        <p className="muted">This order is paid. Thank you!</p>
        <Link className="btn-primary" href="/dashboard/billing">Go to billing</Link>
      </div>
    );
  }
  return (
    <div className="surface p-6 md:p-8 mt-10 space-y-6" data-testid="pay-chooser">
      <div>
        <h1 className="text-2xl font-bold">Choose how to pay</h1>
        <p className="muted text-sm mt-1">Order {o.id.slice(0, 8)}</p>
      </div>
      <ul className="space-y-2 text-sm">
        {o.items.map((i) => (
          <li key={i.description} className="flex justify-between gap-3">
            <span>{i.description}{i.quantity > 1 ? ` × ${i.quantity}` : ''}</span>
            <span className="font-semibold">{usd(i.amountCents * i.quantity)}</span>
          </li>
        ))}
        <li className="flex justify-between gap-3 border-t border-[var(--line)] pt-2 font-bold">
          <span>Total</span>
          <span>{usd(o.amountCents)}</span>
        </li>
      </ul>
      {o.status !== 'pending' ? (
        <p className="text-sm text-[var(--color-coral)]">This order can no longer be paid ({o.status}). Start again from the page you came from.</p>
      ) : (
        <div className="grid gap-3">
          {data.providers.stripe && (
            <button className="btn-primary btn-lg" disabled={!!busy} onClick={() => void pay('stripe')}>
              {busy === 'stripe' ? <Spinner /> : <CreditCard size={18} />} Pay by card
            </button>
          )}
          {data.providers.paypal && (
            <button className="btn-ghost btn-lg" disabled={!!busy} onClick={() => void pay('paypal')}>
              {busy === 'paypal' && <Spinner />} Pay with PayPal
            </button>
          )}
        </div>
      )}
      {error && <p className="text-sm text-[var(--color-coral)]">{error}</p>}
      <p className="text-xs muted flex items-center gap-2">
        <ShieldCheck size={14} className="text-[var(--color-teal)]" /> Card payments by Stripe, PayPal by PayPal: we never see your card or PayPal details.
      </p>
      {o.cancelPath && <Link className="text-sm underline muted" href={o.cancelPath}>Cancel and go back</Link>}
    </div>
  );
}
