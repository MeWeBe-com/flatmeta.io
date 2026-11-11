'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Flag, Gavel, Map, Receipt, ScrollText, Star, Store, Tags, Users, MapPin, Code2, LineChart } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useSession } from '../providers';
import { SiteHeader } from '../site-chrome';
import { Spinner, clsx } from '../ui';

const NAV = [
  { href: '/admin', label: 'Overview', icon: BarChart3 },
  { href: '/admin/metrics', label: 'Metrics', icon: LineChart },
  { href: '/admin/showcase', label: 'Showcase', icon: Star },
  { href: '/admin/showcase/locations', label: 'Showcase locations', icon: MapPin },
  { href: '/admin/moderation', label: 'Moderation', icon: Gavel },
  { href: '/admin/custom-html', label: 'Custom HTML', icon: Code2 },
  { href: '/admin/claims', label: 'Claims & takedowns', icon: Flag },
  { href: '/admin/plots', label: 'Plots', icon: Map },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/orders', label: 'Orders', icon: Receipt },
  { href: '/admin/marketplace', label: 'Marketplace', icon: Store },
  { href: '/admin/pricing', label: 'Pricing', icon: Tags },
  { href: '/admin/audit', label: 'Audit log', icon: ScrollText },
];

/** Red banner on every admin page while the Stripe setup is wrong (e.g. a test key on production). */
function PaymentsWarning() {
  const [s, setS] = useState<{ problems: string[]; mode: string; appEnv: string; checkoutBlocked: boolean } | null>(null);
  useEffect(() => {
    api<{ problems: string[]; mode: string; appEnv: string; checkoutBlocked: boolean }>('/admin/payments-status').then(setS).catch(() => undefined);
  }, []);
  if (!s?.problems.length) return null;
  return (
    <div role="alert" className="mb-5 rounded-2xl border border-[var(--color-coral)] bg-[rgb(255_107_107/.12)] p-4 text-sm">
      <div className="font-bold text-[var(--color-coral)]">
        Payments setup needs attention ({s.appEnv}, Stripe {s.mode} mode){s.checkoutBlocked ? ': checkout is blocked' : ''}
      </div>
      <ul className="mt-1 list-disc pl-5 space-y-0.5">{s.problems.map((p) => <li key={p}>{p}</li>)}</ul>
      <p className="mt-2 muted text-xs">See docs/stripe-live.md.</p>
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { me, loading, openSignIn } = useSession();
  const pathname = usePathname();
  const staff = me.user && me.user.role !== 'user';
  return (
    <>
      <SiteHeader />
      <div className="mx-auto max-w-[1400px] px-4 py-6 grid md:grid-cols-[210px_1fr] gap-8">
        <nav className="flex md:flex-col gap-1 overflow-x-auto md:sticky md:top-24 self-start" aria-label="Admin">
          <div className="hidden md:block text-[11px] uppercase tracking-widest muted font-semibold px-3 mb-2">Admin</div>
          {NAV.map((n) => {
            // The longest matching link wins, so /admin/showcase/locations doesn't also light up /admin/showcase.
            const best = NAV.filter((o) => (o.href === '/admin' ? pathname === o.href : pathname.startsWith(o.href))).sort((x, y) => y.href.length - x.href.length)[0];
            const active = best?.href === n.href;
            return (
              <Link key={n.href} href={n.href} className={clsx('flex items-center gap-3 px-3 h-10 rounded-xl text-sm whitespace-nowrap', active ? 'bg-white/8 text-[var(--color-teal)] font-semibold' : 'muted hover:text-[var(--text)] hover:bg-white/5')}>
                <n.icon size={16} /> {n.label}
              </Link>
            );
          })}
        </nav>
        <main id="main" className="min-w-0">
          {loading ? <div className="py-20 text-center"><Spinner /></div> : !me.user ? (
            <div className="surface p-10 text-center"><button className="btn-primary" onClick={() => openSignIn()}>Sign in</button></div>
          ) : !staff ? (
            <div className="surface p-10 text-center">Staff only.</div>
          ) : (
            <>
              <PaymentsWarning />
              {children}
            </>
          )}
        </main>
      </div>
    </>
  );
}
