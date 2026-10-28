'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CreditCard, ShieldCheck } from 'lucide-react';
import { ApiError, post } from '@/lib/api';
import { Logo, Spinner } from '@/components/ui';

/** Development-only stand-in for Stripe Checkout (the API refuses it in production). */
function MockCheckout() {
  const params = useSearchParams();
  const session = params.get('session');
  const subscription = params.get('subscription');
  const next = params.get('next') ?? '/dashboard';
  const cancel = params.get('cancel') ?? '/';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      await post('/billing/mock/complete', session ? { session } : { subscription });
      window.location.href = next + (next.includes('?') ? '&' : '?') + 'checkout=success';
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Payment failed');
      setBusy(false);
    }
  };
  const abandon = async () => {
    if (session) await post('/billing/mock/complete', { session, cancel: true }).catch(() => undefined);
    window.location.href = cancel;
  };

  return (
    <div className="min-h-screen grid place-items-center p-4">
      <div className="card p-8 w-full max-w-md space-y-6">
        <Logo />
        <div>
          <span className="chip chip-gold">Test mode</span>
          <h1 className="text-2xl font-bold mt-3">Mock checkout</h1>
          <p className="muted text-sm mt-1">Stripe isn’t configured on this server, so payments are simulated. No card is charged. Set STRIPE_SECRET_KEY on the API to use real Stripe Checkout.</p>
        </div>
        <div className="surface p-4 flex items-center gap-3 text-sm">
          <CreditCard className="text-[var(--color-teal)]" />
          <div>
            <div className="font-semibold">4242 4242 4242 4242</div>
            <div className="muted text-xs">Test card · any future date · any CVC</div>
          </div>
        </div>
        {error && <p className="text-sm text-[var(--color-coral)]">{error}</p>}
        <button className="btn-primary btn-lg w-full" onClick={() => void pay()} disabled={busy}>{busy ? <Spinner /> : <ShieldCheck size={18} />} Pay (test)</button>
        <button className="btn-ghost w-full" onClick={() => void abandon()} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}

export default function MockCheckoutPage() {
  return (
    <Suspense>
      <MockCheckout />
    </Suspense>
  );
}
