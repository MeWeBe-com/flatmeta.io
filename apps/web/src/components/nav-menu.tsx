'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { LayoutDashboard, LogIn, LogOut, Menu, Moon, PlayCircle, Sun, X } from 'lucide-react';
import { t } from '@/lib/i18n';
import { useSession, useTheme } from './providers';
import { clsx } from './ui';

/** The site's sections, in the order of the mobile menu (M3). */
export const NAV_LINKS = [
  { href: '/explore', label: 'nav.explore' },
  { href: '/brands', label: 'nav.companies' },
  { href: '/marketplace', label: 'nav.marketplace' },
  { href: '/clans', label: 'nav.clans' },
  { href: '/leaderboards', label: 'nav.leaderboards' },
  { href: '/business', label: 'nav.business' },
  { href: '/pricing', label: 'nav.pricing' },
  { href: '/about', label: 'nav.about' },
] as const;

/**
 * The one mobile menu (M3), on every page and on the map: Sign in (or Dashboard + Sign out), the sections, the theme
 * and "Replay tour". A 44 px button with aria-expanded / aria-controls; the panel traps focus, Esc closes it and
 * focus returns to the button.
 */
export function NavMenu({ onReplayTour, className = '', align = 'left' }: { onReplayTour?: () => void; className?: string; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { me, openSignIn, signOut } = useSession();
  const { theme, toggle } = useTheme();
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('a, button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        button.current?.focus();
      } else if (e.key === 'Tab' && panel.current) {
        const items = [...panel.current.querySelectorAll<HTMLElement>('a, button')];
        const first = items[0];
        const last = items[items.length - 1];
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    const away = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', away);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', away);
    };
  }, [open]);

  const close = () => setOpen(false);
  const item = 'flex items-center gap-3 px-3 min-h-11 rounded-xl hover:bg-white/5 text-sm w-full text-left';
  return (
    <div className={clsx('relative', className)}>
      <button
        ref={button}
        type="button"
        className="glass rounded-full size-11 grid place-items-center"
        aria-label={t('nav.menu')}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>
      {open && (
        <div
          ref={panel}
          id={id}
          role="dialog"
          aria-label={t('nav.menu')}
          // Fixed to the screen (not to the button), so it can never run off the edge: full width on phones, a
          // 18 rem panel on the button's side from 640 px.
          className={clsx(
            'fixed z-[var(--z-popover)] left-2 right-2 top-[calc(env(safe-area-inset-top)+64px)] sm:w-72 surface p-2 shadow-2xl max-h-[calc(100dvh-80px)] overflow-y-auto overscroll-contain animate-pop',
            align === 'right' ? 'sm:left-auto sm:right-4' : 'sm:right-auto sm:left-3',
          )}
        >
          <nav aria-label={t('nav.menu')} className="grid gap-0.5">
            {me.user ? (
              <>
                <Link href="/dashboard" className={item} onClick={close}>
                  <LayoutDashboard size={16} className="muted" /> {t('nav.dashboard')}
                </Link>
                <button type="button" className={item} onClick={() => { close(); void signOut(); }}>
                  <LogOut size={16} className="muted" /> {t('nav.signOut')}
                </button>
              </>
            ) : (
              <button type="button" className={clsx(item, 'font-semibold text-[var(--color-teal)]')} onClick={() => { close(); openSignIn(); }}>
                <LogIn size={16} /> {t('nav.signIn')}
              </button>
            )}
            <div className="h-px bg-[var(--line)] my-1" />
            {NAV_LINKS.map((n) => (
              <Link key={n.href} href={n.href} className={clsx(item, pathname === n.href && 'text-[var(--color-teal)]')} onClick={close}>
                {t(n.label)}
              </Link>
            ))}
            <div className="h-px bg-[var(--line)] my-1" />
            <button type="button" className={item} onClick={toggle}>
              {theme === 'dark' ? <Sun size={16} className="muted" /> : <Moon size={16} className="muted" />} {t('nav.theme')}
            </button>
            {onReplayTour ? (
              <button type="button" className={item} onClick={() => { close(); onReplayTour(); }}>
                <PlayCircle size={16} className="muted" /> {t('tour.replay')}
              </button>
            ) : (
              <Link href="/?tour=1" className={item} onClick={close}>
                <PlayCircle size={16} className="muted" /> {t('tour.replay')}
              </Link>
            )}
          </nav>
        </div>
      )}
    </div>
  );
}
