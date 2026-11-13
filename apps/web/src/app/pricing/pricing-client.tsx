'use client';

import Link from 'next/link';
import { ComingSoon } from '@/components/coming-soon';
import { FREE_LAND_CELLS, PAID_CHECKOUT } from '@/lib/config';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { ApiError, post } from '@/lib/api';
import { usd, TIER_COLOR } from '@/lib/format';
import { useGame, useSession } from '@/components/providers';
import { Spinner, clsx } from '@/components/ui';

export interface Plans {
  mock: boolean;
  plans: { key: string; name: string; month: number; year: number; features: string[]; for: string; org?: boolean }[];
  tiers: { tier: string; label: string; priceCents: number; description: string }[];
  upgrades: { key: string; label: string; priceCents: number }[];
  landmarkPriceCents: number;
}

export function PricingClient({ data }: { data: Plans }) {
  const [yearly, setYearly] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const { me, openSignIn } = useSession();
  const { toast } = useGame();
  const router = useRouter();

  const subscribe = async (plan: string, org?: boolean) => {
    if (!me.user) return openSignIn(`Sign in to start ${plan}.`);
    if (org) {
      const target = me.orgs?.find((o) => o.role === 'owner' || o.role === 'admin');
      if (!target) return router.push(`/dashboard/orgs?create=1&plan=${plan}`);
      return go(plan, target.id);
    }
    return go(plan);
  };
  const go = async (plan: string, orgId?: string) => {
    setBusy(plan);
    try {
      const r = await post<{ url: string }>('/billing/checkout', { plan, interval: yearly ? 'year' : 'month', orgId });
      window.location.assign(r.url);
    } catch (e) {
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Checkout unavailable' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-16">
      <div className="flex justify-center">
        <div className="surface rounded-full p-1 flex text-sm">
          <button className={clsx('tap justify-center px-5 h-9 rounded-full', !yearly && 'bg-white/10 font-semibold')} aria-pressed={!yearly} onClick={() => setYearly(false)}>Monthly</button>
          <button className={clsx('tap justify-center px-5 h-9 rounded-full', yearly && 'bg-white/10 font-semibold')} aria-pressed={yearly} onClick={() => setYearly(true)}>Yearly <span className="text-[var(--color-teal)] ml-1">· 2 months free</span></button>
        </div>
      </div>
      {/* minmax(0, 1fr): a long button label wraps inside its card instead of widening the page (M11). */}
      <div className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-2 xl:grid-cols-4 gap-4">
        {data.plans.map((p) => {
          const price = yearly ? p.year / 12 : p.month;
          const highlight = p.key === 'business';
          return (
            <div key={p.key} className={clsx('surface p-6 flex flex-col relative', highlight && 'border-[var(--color-teal)] shadow-[var(--shadow-teal)]')}>
              {highlight && <span className="chip chip-teal absolute -top-3 left-6 bg-[var(--color-night)]">Most popular</span>}
              <div className="text-sm muted">{p.for}</div>
              <h3 className="text-2xl font-bold mt-1">{p.name}</h3>
              <div className="mt-4 flex items-end gap-1">
                {/* M11: the Free plan's heading already says "Free": its price reads "$0 forever", not "Free" again. */}
                <span className="font-display text-4xl font-bold" data-testid="plan-price">{usd(p.month === 0 ? 0 : Math.round(price))}</span>
                <span className="muted mb-1">{p.month === 0 ? 'forever' : '/mo'}</span>
              </div>
              {p.month > 0 && yearly && <div className="text-xs muted">billed {usd(p.year)} yearly</div>}
              <ul className="mt-6 space-y-2 text-sm flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2"><Check size={16} className="text-[var(--color-teal)] shrink-0 mt-0.5" /> {f}</li>
                ))}
              </ul>
              {p.key === 'free' ? (
                <Link href="/?claim" className="btn-ghost mt-6">Claim your first plot</Link>
              ) : !PAID_CHECKOUT ? (
                <ComingSoon compact className="mt-6" text={`${p.name} is coming soon.`} />
              ) : (
                <button className={clsx('mt-6 whitespace-normal text-center h-auto min-h-11 py-2', highlight ? 'btn-primary' : 'btn-ghost')} disabled={busy === p.key} onClick={() => void subscribe(p.key, p.org)}>
                  {busy === p.key && <Spinner />} {p.org ? `Get ${p.name} for my organisation` : `Get ${p.name}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {data.mock && PAID_CHECKOUT && <p className="text-center text-xs text-[var(--color-gold)]">Payments are in test mode on this server. No real charges are made.</p>}
      {!PAID_CHECKOUT && (
        <div className="flex justify-center">
          <ComingSoon text={`Plans, paid land and boosts are coming soon. Right now everyone can claim up to ${FREE_LAND_CELLS} squares of land for free, and editing, chat and clans are all open.`} />
        </div>
      )}

      <section className="grid lg:grid-cols-2 gap-8 items-start">
        <div>
          <h2 className="text-3xl font-bold">Land, by the cell</h2>
          <p className="muted mt-2">{PAID_CHECKOUT ? 'Buy once, keep it as long as FlatMeta runs. No rent. Prices depend on where on the map you build. Your first plot (up to 2×2 outside city centres) is free.' : `Planned prices once payments open. For now your first ${FREE_LAND_CELLS} squares are free, anywhere on the map.`}</p>
          <div className="mt-6 space-y-2">
            {data.tiers.map((t) => (
              <div key={t.tier} className="surface p-4 flex items-center gap-4">
                <span className="size-10 rounded-xl grid place-items-center font-display font-bold" style={{ background: `${TIER_COLOR[t.tier]}22`, color: TIER_COLOR[t.tier] }}>{t.tier}</span>
                <div className="flex-1">
                  <div className="font-semibold">{t.label}</div>
                  <div className="text-xs muted">{t.description}</div>
                </div>
                <div className="font-display font-bold">{usd(t.priceCents)}<span className="text-xs muted font-sans">/cell</span></div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-3xl font-bold">Boosts</h2>
          <p className="muted mt-2">Stand out when it matters. Cosmetic and reach only: XP and ranks can never be bought.</p>
          <div className="mt-6 space-y-2">
            {data.upgrades.map((u) => (
              <div key={u.key} className="surface p-4 flex items-center justify-between">
                <span className="font-semibold">{u.label}</span>
                <span className="font-display font-bold">{usd(u.priceCents)}</span>
              </div>
            ))}
            <div className="surface p-4 flex items-center justify-between border-[rgb(255_201_77/.4)]">
              <span><span className="font-semibold">Landmark claim</span><span className="block text-xs muted">For verified organisations claiming their showcase plot. Includes 3 months of Brand.</span></span>
              <span className="font-display font-bold text-[var(--color-gold)]">{usd(data.landmarkPriceCents)}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
