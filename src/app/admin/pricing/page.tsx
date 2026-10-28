'use client';

import { useEffect, useState } from 'react';
import { ApiError, api, put } from '@/lib/api';
import { TIER_COLOR } from '@/lib/format';
import { useGame } from '@/components/providers';

interface Tier { tier: string; label: string; priceCents: number; description: string }

export default function AdminPricing() {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const { toast } = useGame();
  useEffect(() => { void api<{ tiers: Tier[] }>('/admin/pricing').then((r) => setTiers(r.tiers)); }, []);
  const save = async () => {
    try {
      const r = await put<{ tiers: Tier[] }>('/admin/pricing', { tiers: tiers.map((t) => ({ tier: t.tier, priceCents: t.priceCents, label: t.label, description: t.description })) });
      setTiers(r.tiers);
      toast({ kind: 'success', title: 'Prices updated' });
    } catch (e) {
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Save failed' });
    }
  };
  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-3xl font-bold">Land pricing</h1>
      <p className="text-sm muted">Price per cell by zone tier. Changes apply to new quotes immediately. Subscription prices are managed as Stripe Prices (see .env).</p>
      <div className="space-y-2">
        {tiers.map((t, i) => (
          <div key={t.tier} className="surface p-4 grid grid-cols-[48px_1fr_1fr_140px] gap-3 items-center">
            <span className="size-10 rounded-xl grid place-items-center font-display font-bold" style={{ background: `${TIER_COLOR[t.tier]}22`, color: TIER_COLOR[t.tier] }}>{t.tier}</span>
            <input className="input" value={t.label} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            <input className="input" value={t.description} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
            <div className="relative"><span className="absolute left-3 top-3 muted text-sm">$</span><input className="input pl-6" type="number" step="0.5" min="0.5" value={t.priceCents / 100} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, priceCents: Math.round(Number(e.target.value) * 100) } : x)))} /></div>
          </div>
        ))}
      </div>
      <button className="btn-primary" onClick={() => void save()}>Save prices</button>
    </div>
  );
}
