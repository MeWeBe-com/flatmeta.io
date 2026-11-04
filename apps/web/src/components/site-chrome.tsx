'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Award, Code2, CreditCard, LayoutDashboard, LogOut, Map, Moon, Shield, Sun, User, Building2, Menu, X, Download, Settings } from 'lucide-react';
import { APP_ENV, STAGING_DOMAIN } from '@/lib/config';
import { t } from '@/lib/i18n';
import { ErrorBoundary } from './error-boundary';
import { NotificationBell } from './notification-bell';
import { useSession, useTheme } from './providers';
import { Avatar, LevelRing, Logo, clsx } from './ui';

export function StagingBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => setShow(APP_ENV === 'staging' || location.hostname === STAGING_DOMAIN), []);
  if (!show) return null;
  return <div className="fixed bottom-0 inset-x-0 z-[80] text-center text-[11px] font-semibold bg-[var(--color-coral)] text-white py-0.5">STAGING · {STAGING_DOMAIN} · test payments only</div>;
}

let deferredPrompt: (Event & { prompt: () => Promise<void> }) | null = null;
export function useInstallPrompt() {
  const [can, setCan] = useState(false);
  useEffect(() => {
    const on = (e: Event) => {
      e.preventDefault();
      deferredPrompt = e as typeof deferredPrompt;
      setCan(true);
    };
    window.addEventListener('beforeinstallprompt', on);
    return () => window.removeEventListener('beforeinstallprompt', on);
  }, []);
  return { can, install: async () => { await deferredPrompt?.prompt(); setCan(false); } };
}

export function UserMenu({ compact = false }: { compact?: boolean }) {
  const { me, openSignIn, signOut, loading } = useSession();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const { can, install } = useInstallPrompt();
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  if (loading) return <span className="size-10 rounded-full skeleton" />;
  if (!me.user) {
    return (
      <div className="flex items-center gap-1">
        <button className="icon-btn" onClick={toggle} aria-label={t('nav.theme')}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
        <button className="btn-primary" onClick={() => openSignIn()}>{t('nav.signIn')}</button>
      </div>
    );
  }
  const u = me.user;
  const items = [
    { href: '/dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
    { href: '/dashboard/plots', label: t('nav.myPlots'), icon: Map },
    { href: '/dashboard/progress', label: t('nav.progress'), icon: Award },
    { href: '/dashboard/orgs', label: t('nav.organisations'), icon: Building2 },
    { href: '/dashboard/billing', label: t('nav.billing'), icon: CreditCard },
    { href: '/dashboard/developers', label: t('nav.developers'), icon: Code2 },
    { href: '/dashboard/settings', label: 'Settings', icon: Settings },
    { href: `/u/${u.username}`, label: t('nav.profile'), icon: User },
    ...(u.role !== 'user' ? [{ href: '/admin', label: t('nav.admin'), icon: Shield }] : []),
  ];
  return (
    <div className="flex items-center gap-2">
      <ErrorBoundary name="NotificationBell">
        <NotificationBell />
      </ErrorBoundary>
      <div className="relative">
      <button className="flex items-center gap-2 rounded-full pl-1 pr-3 h-11 glass" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
        {me.progress && !compact ? <LevelRing level={me.progress.level} progress={me.progress.progress} size={36} /> : <Avatar name={u.displayName} url={u.avatarUrl} size={34} />}
        <span className="hidden sm:block text-sm font-semibold max-w-28 truncate">{u.displayName}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 card p-2 z-50 animate-pop" role="menu">
          <div className="px-3 py-2 flex items-center gap-3">
            <Avatar name={u.displayName} url={u.avatarUrl} size={40} />
            <div className="min-w-0">
              <div className="font-semibold truncate">{u.displayName}</div>
              <div className="text-xs muted">@{u.username} · {me.progress?.title ?? u.levelTitle}</div>
            </div>
          </div>
          {me.progress && (
            <div className="px-3 pb-2">
              <div className="flex justify-between text-[11px] muted mb-1">
                <span>Level {me.progress.level}</span>
                <span>{me.progress.xp - me.progress.levelXp} / {me.progress.nextLevelXp - me.progress.levelXp} XP</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-[var(--color-teal)] to-[var(--color-violet)]" style={{ width: `${Math.round(me.progress.progress * 100)}%` }} />
              </div>
            </div>
          )}
          <div className="h-px bg-[var(--line)] my-1" />
          {items.map((i) => (
            <Link key={i.href} href={i.href} className="flex items-center gap-3 px-3 h-10 rounded-xl hover:bg-white/5 text-sm" role="menuitem">
              <i.icon size={16} className="muted" /> {i.label}
            </Link>
          ))}
          <div className="h-px bg-[var(--line)] my-1" />
          <button onClick={toggle} className="w-full flex items-center gap-3 px-3 h-10 rounded-xl hover:bg-white/5 text-sm">
            {theme === 'dark' ? <Sun size={16} className="muted" /> : <Moon size={16} className="muted" />} {t('nav.theme')}
          </button>
          {can && (
            <button onClick={() => void install()} className="w-full flex items-center gap-3 px-3 h-10 rounded-xl hover:bg-white/5 text-sm">
              <Download size={16} className="muted" /> {t('nav.install')}
            </button>
          )}
          <button onClick={() => void signOut()} className="w-full flex items-center gap-3 px-3 h-10 rounded-xl hover:bg-white/5 text-sm text-[var(--color-coral)]">
            <LogOut size={16} /> {t('nav.signOut')}
          </button>
        </div>
      )}
      </div>
    </div>
  );
}

const NAV = [
  { href: '/', label: 'nav.map' },
  { href: '/explore', label: 'nav.explore' },
  { href: '/marketplace', label: 'nav.marketplace' },
  { href: '/clans', label: 'nav.clans' },
  { href: '/leaderboards', label: 'nav.leaderboards' },
  { href: '/business', label: 'nav.business' },
  { href: '/pricing', label: 'nav.pricing' },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[color-mix(in_oklab,var(--bg)_82%,transparent)] backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 h-16 flex items-center gap-6">
        <Link href="/" aria-label="FlatMeta home">
          <Logo />
        </Link>
        <nav className="hidden md:flex items-center gap-1 text-sm">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={clsx('px-3 h-9 inline-flex items-center rounded-full transition hover:bg-white/5', pathname === n.href ? 'text-[var(--color-teal)]' : 'muted')}>
              {t(n.label)}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <UserMenu />
          <button className="icon-btn md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu">{open ? <X /> : <Menu />}</button>
        </div>
      </div>
      {open && (
        <nav className="md:hidden px-4 pb-4 grid gap-1">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="px-3 h-11 flex items-center rounded-xl hover:bg-white/5">{t(n.label)}</Link>
          ))}
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--line)] mt-24">
      <div className="mx-auto max-w-7xl px-4 py-10 grid gap-8 md:grid-cols-4 text-sm">
        <div className="md:col-span-2 space-y-3">
          <Logo />
          <p className="muted max-w-sm">{t('app.tagline')}. {t('footer.made')}</p>
          <p className="text-xs muted">A <a className="underline" href="https://mewebe.com">MeWeBe</a> product.</p>
        </div>
        <div className="grid gap-2">
          <Link href="/explore" className="muted hover:text-[var(--text)]">{t('nav.explore')}</Link>
          <Link href="/leaderboards" className="muted hover:text-[var(--text)]">{t('nav.leaderboards')}</Link>
          <Link href="/business" className="muted hover:text-[var(--text)]">{t('nav.business')}</Link>
          <Link href="/pricing" className="muted hover:text-[var(--text)]">{t('nav.pricing')}</Link>
        </div>
        <div className="grid gap-2">
          <Link href="/about" className="muted hover:text-[var(--text)]">{t('footer.about')}</Link>
          <Link href="/dashboard/developers" className="muted hover:text-[var(--text)]">{t('footer.api')}</Link>
          <Link href="/legal/terms" className="muted hover:text-[var(--text)]">{t('footer.terms')}</Link>
          <Link href="/legal/privacy" className="muted hover:text-[var(--text)]">{t('footer.privacy')}</Link>
          <Link href="/legal/refunds" className="muted hover:text-[var(--text)]">{t('footer.refunds')}</Link>
        </div>
      </div>
      <div className="text-center text-xs muted pb-8">© {new Date().getFullYear()} FlatMeta · Map data © OpenStreetMap contributors</div>
    </footer>
  );
}

export function PageShell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <>
      <SiteHeader />
      <main className={clsx('mx-auto px-4 py-8', wide ? 'max-w-7xl' : 'max-w-6xl')}>{children}</main>
      <SiteFooter />
    </>
  );
}


