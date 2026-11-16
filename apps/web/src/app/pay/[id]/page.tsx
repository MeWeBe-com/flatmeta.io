import type { Metadata } from 'next';
import { PageShell } from '@/components/site-chrome';
import { PayChooser } from './pay-chooser';

// GL4: choose how to pay a one-time order: card (Stripe Checkout) or PayPal. Private: never indexed (S6 rules too).
export const metadata: Metadata = { title: 'Pay', robots: { index: false, follow: false } };

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PageShell>
      <div id="main" className="max-w-lg mx-auto">
        <PayChooser orderId={id} />
      </div>
    </PageShell>
  );
}
