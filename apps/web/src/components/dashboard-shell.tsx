'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Award, Building2, Code2, CreditCard, LayoutDashboard, Map, Settings } from 'lucide-react';
import { useSession } from './providers';
import { SiteHeader } from './site-chrome';
import { Spinner, clsx } from './ui';

const NAV = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/plots', label: 'My plots', icon: Map },
  { href: '/dashboard/progress', label: 'Quests & badges', icon: Award },
  { href: '/dashboard/orgs', label: 'Organisations', icon: Building2 },
  { href: '/dashboard/billing', label: 'Billing', icon: CreditCard },
  { href: '/dashboard/developers', label: 'Developers', icon: Code2 },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { me, loading, openSignIn } = useSession();
  const pathname = usePathname();
  return (
    <>
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-4 py-6 md:py-10 grid md:grid-cols-[220px_1fr] gap-8">
        <nav className="flex md:flex-col gap-1 overflow-x-auto md:sticky md:top-24 self-start" aria-label="Dashboard">
          {NAV.map((n) => {
            const active = n.href === '/dashboard' ? pathname === n.href : pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={clsx('flex items-center gap-3 px-3 h-10 rounded-xl text-sm whitespace-nowrap transition', active ? 'bg-white/8 text-[var(--color-teal)] font-semibold' : 'muted hover:text-[var(--text)] hover:bg-white/5')}>
                <n.icon size={16} /> {n.label}
              </Link>
            );
          })}
        </nav>
        <main id="main" className="min-w-0">
          {loading ? (
            <div className="py-20 text-center"><Spinner /></div>
          ) : !me.user ? (
            <div className="surface p-10 text-center space-y-4">
              <h1 className="text-2xl font-bold">Sign in to see your dashboard</h1>
              <p className="muted">Your plots, quests, organisations and billing live here.</p>
              <button className="btn-primary" onClick={() => openSignIn()}>Sign in</button>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </>
  );
}
