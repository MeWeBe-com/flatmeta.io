'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Flag, Gavel, Map, Receipt, ScrollText, Star, Store, Tags, Users } from 'lucide-react';
import { useSession } from '../providers';
import { SiteHeader } from '../site-chrome';
import { Spinner, clsx } from '../ui';

const NAV = [
  { href: '/admin', label: 'Overview', icon: BarChart3 },
  { href: '/admin/showcase', label: 'Showcase', icon: Star },
  { href: '/admin/moderation', label: 'Moderation', icon: Gavel },
  { href: '/admin/claims', label: 'Claims & takedowns', icon: Flag },
  { href: '/admin/plots', label: 'Plots', icon: Map },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/orders', label: 'Orders', icon: Receipt },
  { href: '/admin/marketplace', label: 'Marketplace', icon: Store },
  { href: '/admin/pricing', label: 'Pricing', icon: Tags },
  { href: '/admin/audit', label: 'Audit log', icon: ScrollText },
];

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
            const active = n.href === '/admin' ? pathname === n.href : pathname.startsWith(n.href);
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
          ) : children}
        </main>
      </div>
    </>
  );
}
