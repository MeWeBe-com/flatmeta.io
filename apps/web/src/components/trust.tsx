import Link from 'next/link';
import { BadgeCheck, CreditCard, Mail, MapPinned, ShieldCheck, Sparkles } from 'lucide-react';
import { CONTACT_EMAIL, FREE_LAND_CELLS, PAID_CHECKOUT } from '@/lib/config';
import { JsonLd } from '@/lib/seo';
import { EmailText } from '@/components/email-text';
import { serverApi } from '@/lib/server-api';

/**
 * GL3c: the trust block for /pricing and /business. Real numbers from the live API (never invented), how it works in
 * three steps, the questions buyers ask before paying (also as FAQPage JSON-LD), and how payment, cancelling and
 * support work. Everything states the site's real policy (legal/refunds) and current settings.
 */
interface Stats { plots: number; showcase: number; countries: number }

export async function TrustStats() {
  const s = await serverApi<Stats>('/world/stats', { auth: false, revalidate: 300 }).catch(() => null);
  if (!s) return null;
  const items = [
    { n: s.showcase, label: 'company pages reserved next to real headquarters' },
    { n: s.plots, label: s.plots === 1 ? 'plot made by people' : 'plots made by people' },
    { n: s.countries, label: 'countries on the map' },
  ].filter((i) => i.n > 0);
  return (
    <section aria-label="FlatMeta in numbers" className="grid sm:grid-cols-3 gap-3" data-testid="trust-stats">
      {items.map((i) => (
        <div key={i.label} className="surface p-5 text-center">
          <div className="font-display text-3xl font-bold">{i.n.toLocaleString('en')}</div>
          <div className="text-sm muted mt-1">{i.label}</div>
        </div>
      ))}
    </section>
  );
}

export function HowItWorks({ audience }: { audience: 'business' | 'everyone' }) {
  const steps =
    audience === 'business'
      ? [
          { icon: MapPinned, title: 'Find or claim your spot', body: 'Your company may already have land reserved next to its headquarters. Otherwise claim the cells where your customers are.' },
          { icon: BadgeCheck, title: 'Verify and make it yours', body: 'Verify with a work email or a DNS record. Add your logo, hours, offers and links; the AI Designer can draft it for you.' },
          { icon: Sparkles, title: 'Get found', body: 'Your page is structured data (schema.org) in our sitemaps and readable by AI agents over our MCP server, and it glows on the map.' },
        ]
      : [
          { icon: MapPinned, title: 'Claim land', body: `Everyone gets their first ${FREE_LAND_CELLS} squares free. Pick a spot on the real-world map.` },
          { icon: Sparkles, title: 'Make it yours', body: 'Add a cover, text, links and a gallery, or let the AI Designer make a first version.' },
          { icon: BadgeCheck, title: 'Share it', body: 'Your plot has its own page and link. Upgrade only if you want more land, reach or business tools.' },
        ];
  return (
    <section aria-labelledby="how-it-works" className="space-y-4">
      <h2 id="how-it-works" className="text-2xl md:text-3xl font-bold">How it works</h2>
      <ol className="grid md:grid-cols-3 gap-4">
        {steps.map((s, i) => (
          <li key={s.title} className="surface p-5">
            <div className="flex items-center gap-3">
              <span className="size-9 rounded-full grid place-items-center bg-[rgb(45_226_196/.12)] text-[var(--color-teal)] font-bold">{i + 1}</span>
              <s.icon size={18} className="text-[var(--color-teal)]" />
            </div>
            <h3 className="font-semibold mt-3">{s.title}</h3>
            <p className="text-sm muted mt-1">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The questions and answers, built from the real settings (payments live or not, claim price). */
export function faqItems(o: { claimFree: boolean }): { q: string; a: string }[] {
  return [
    {
      q: 'Is FlatMeta crypto, NFTs or a virtual real-estate investment?',
      a: 'No. There are no tokens and no blockchain. A plot is a licence to show your content on a part of our map. It has no cash value and is not an investment.',
    },
    {
      q: 'What does a business get?',
      a: 'A verified page on the world map at your real location: logo, cover, description, hours, offers, contact and booking links, an "Open now" marker and visit analytics. Every page is structured data in our sitemaps and readable by AI assistants through our MCP server.',
    },
    {
      q: 'Our company already has a plot. What does that mean?',
      a: o.claimFree
        ? 'We reserved land next to many companies’ public headquarters, clearly labelled as not affiliated. Verified staff can claim it free with a work email or a DNS record, or ask us to remove it: we handle removal requests within 48 hours.'
        : 'We reserved land next to many companies’ public headquarters, clearly labelled as not affiliated. Verified staff can claim it with a work email or a DNS record, or ask us to remove it: we handle removal requests within 48 hours.',
    },
    {
      q: 'Can I cancel?',
      a: 'Yes, any time from Dashboard → Billing (the customer portal). You keep the plan until the end of the period you paid for. Land you bought stays yours.',
    },
    {
      q: 'Can I get a refund?',
      a: 'Land can be refunded within 14 days of purchase, and automatically if it was taken while you paid. Subscriptions are not refunded for part periods unless the law requires it. Our Payments & Refunds page has the full details.',
    },
    {
      q: 'How do I pay, and is it secure?',
      a: PAID_CHECKOUT
        ? 'Card payments go through Stripe’s hosted checkout: we never see or store your card number. Invoices and receipts are in your billing portal.'
        : 'Paid plans aren’t open yet. Everything free (land, your page, editing, chat and clans) works today.',
    },
  ];
}

export function Faq({ claimFree }: { claimFree: boolean }) {
  const items = faqItems({ claimFree });
  return (
    <section aria-labelledby="faq" className="space-y-4" data-testid="faq">
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items.map((i) => ({ '@type': 'Question', name: i.q, acceptedAnswer: { '@type': 'Answer', text: i.a } })) }} />
      <h2 id="faq" className="text-2xl md:text-3xl font-bold">Questions</h2>
      <div className="grid md:grid-cols-2 gap-3">
        {items.map((i) => (
          <details key={i.q} className="surface p-4 group">
            <summary className="font-semibold cursor-pointer list-none flex justify-between gap-3 tap">
              {i.q}
              <span className="muted group-open:rotate-45 transition" aria-hidden="true">+</span>
            </summary>
            <p className="text-sm muted mt-2">{i.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function PaymentTrust() {
  return (
    <section aria-label="Payments and support" className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm muted" data-testid="payment-trust">
      {PAID_CHECKOUT && (
        <span className="inline-flex items-center gap-2">
          <CreditCard size={16} className="text-[var(--color-teal)]" /> Secure checkout by Stripe
        </span>
      )}
      <span className="inline-flex items-center gap-2">
        <ShieldCheck size={16} className="text-[var(--color-teal)]" /> Cancel any time ·{' '}
        <Link className="underline" href="/legal/refunds" data-inline-link>
          refunds
        </Link>
      </span>
      <span className="inline-flex items-center gap-2">
        <Mail size={16} className="text-[var(--color-teal)]" /> Questions?{' '}
        <EmailText text={CONTACT_EMAIL} link />
      </span>
    </section>
  );
}
