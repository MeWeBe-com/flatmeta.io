'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { usd } from '@/lib/format';
import { DailyBars } from '@/components/admin/bar-chart';
import { Stat } from '@/components/ui';

interface Stats {
  users: { total: number; new30: number };
  plots: { active: number; showcase: number; showcasePending: number; cells: number; published: number };
  revenue: { all: number; last30: number; orders30: number; activeSubscriptions: number };
  ai: { jobs30: number };
  queues: { moderation: number; claims: number; takedowns: number };
  series: { signups: { day: string; n: number }[]; revenue: { day: string; cents: number }[] };
  env: { appEnv: string; paymentsMock: boolean };
}

export default function AdminHome() {
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => { api<Stats>('/admin/stats').then(setS).catch(() => undefined); }, []);
  if (!s) return <div className="skeleton h-96" />;
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-bold">Overview</h1>
        <span className="chip">{s.env.appEnv}</span>
        {s.env.paymentsMock && <span className="chip chip-gold">payments: mock</span>}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label={`Users (+${s.users.new30} in 30d)`} value={s.users.total} icon="users" />
        <Stat label={`Active plots (${s.plots.published} published)`} value={s.plots.active} icon="flag" />
        <Stat label={`Showcase (${s.plots.showcasePending} unapproved)`} value={s.plots.showcase} icon="star" />
        <Stat label="Cells owned" value={s.plots.cells} icon="grid" />
        <Stat label={`Revenue 30d (${s.revenue.orders30} orders)`} value={usd(s.revenue.last30)} icon="trending" />
        <Stat label="Revenue all time" value={usd(s.revenue.all)} icon="gem" />
        <Stat label="Active subscriptions" value={s.revenue.activeSubscriptions} icon="calendar" />
        <Stat label="AI jobs 30d" value={s.ai.jobs30} icon="sparkles" />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <DailyBars title="Sign-ups per day" data={s.series.signups.map((d) => ({ day: d.day, value: d.n }))} />
        <DailyBars title="Revenue per day" data={s.series.revenue.map((d) => ({ day: d.day, value: d.cents }))} format={(v) => usd(v)} />
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <Link href="/admin/moderation" className="surface p-5 hover:border-[var(--color-coral)]"><div className="text-3xl font-display font-bold">{s.queues.moderation}</div><div className="text-sm muted">open moderation flags</div></Link>
        <Link href="/admin/claims" className="surface p-5 hover:border-[var(--color-gold)]"><div className="text-3xl font-display font-bold">{s.queues.claims}</div><div className="text-sm muted">claims in progress</div></Link>
        <Link href="/admin/claims" className="surface p-5 hover:border-[var(--color-teal)]"><div className="text-3xl font-display font-bold">{s.queues.takedowns}</div><div className="text-sm muted">open takedown requests</div></Link>
      </div>
    </div>
  );
}
