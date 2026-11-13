'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Check, MessageCircle, X } from 'lucide-react';
import { api, del, post, ApiError } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { describeNotification, notificationHref, type AppNotification } from '@/lib/notifications';
import { useGame, useLive, useSession } from './providers';
import { Spinner, clsx } from './ui';

/** Bell with the unread count; opens the latest notifications, marks them read and lets you act on requests. */
export function NotificationBell() {
  const { me, setUnread } = useSession();
  const live = useLive();
  const { toast } = useGame();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<AppNotification[] | null>(null);
  const [handled, setHandled] = useState<Record<string, string>>({});
  const box = useRef<HTMLDivElement>(null);
  const unread = me.unreadNotifications ?? 0;

  const load = useCallback(async () => {
    try {
      const r = await api<{ notifications: AppNotification[] }>('/me/notifications');
      setList(r.notifications);
      if (r.notifications.some((n) => !n.readAt)) {
        await post('/me/notifications/read', {});
        setUnread(() => 0);
      }
    } catch {
      setList((l) => l ?? []);
    }
  }, [setUnread]);

  // Opening the list marks everything read; new ones arriving while it is open are shown and read too.
  useEffect(() => {
    if (open) void load();
  }, [open, load]);
  useEffect(
    () =>
      live.onNotification((n) => {
        if (!open) return;
        setList((l) => [n, ...(l ?? []).filter((x) => x.id !== n.id)]);
        void post('/me/notifications/read', { ids: [n.id] }).then(() => setUnread((u) => Math.max(0, u - 1)));
      }),
    [live, open, setUnread],
  );
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  if (!me.user) return null;

  const answer = async (n: AppNotification, accept: boolean) => {
    const id = String(n.payload.connectionId ?? '');
    try {
      if (accept) await post(`/connections/${id}/accept`);
      else await del(`/connections/${id}`);
      setHandled((h) => ({ ...h, [n.id]: accept ? 'Connected' : 'Declined' }));
      if (accept) toast({ kind: 'success', title: `You and ${describeNotification(n).replace(/ wants to connect$/, '')} are connected` });
    } catch (e) {
      setHandled((h) => ({ ...h, [n.id]: 'No longer pending' }));
      if (!(e instanceof ApiError && e.status === 404)) toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'That did not work' });
    }
  };

  const reply = (username: string) => {
    setOpen(false);
    if (pathname === '/') window.dispatchEvent(new CustomEvent('fm:open-dm', { detail: username }));
    else router.push(`/?dm=${encodeURIComponent(username)}`);
  };

  return (
    <div className="relative" ref={box}>
      <button
        className="icon-btn glass relative"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell size={18} />
        {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--color-coral)] text-xs font-bold grid place-items-center text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-1.5rem))] card p-2 z-50 animate-pop" role="dialog" aria-label="Notifications">
          <div className="flex items-center justify-between px-2 py-1">
            <h2 className="font-semibold text-sm">Notifications</h2>
            <Link href="/dashboard" className="text-xs muted hover:text-[var(--text)]">Dashboard</Link>
          </div>
          <ul className="max-h-[60vh] overflow-y-auto">
            {list === null && <li className="p-4 grid place-items-center"><Spinner /></li>}
            {list?.length === 0 && <li className="p-4 text-sm muted">Nothing yet. Follows, connection requests, messages and clan invites show up here.</li>}
            {list?.map((n) => {
              const href = notificationHref(n);
              const text = describeNotification(n);
              const done = handled[n.id];
              return (
                <li key={n.id} className={clsx('rounded-xl px-2 py-2 text-sm', !n.readAt && 'bg-white/5')}>
                  {href ? <Link href={href} className="hover:underline">{text}</Link> : <span>{text}</span>}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs muted">{timeAgo(n.createdAt)}</span>
                    {n.kind === 'connection_request' && (done ? (
                      <span className="text-xs muted ml-auto">{done}</span>
                    ) : (
                      <span className="ml-auto flex gap-1">
                        <button className="btn-primary btn-sm h-7" onClick={() => void answer(n, true)}><Check size={12} /> Accept</button>
                        <button className="btn-ghost btn-sm h-7" onClick={() => void answer(n, false)} aria-label="Decline"><X size={12} /></button>
                      </span>
                    ))}
                    {n.kind === 'dm' && typeof n.payload.fromUsername === 'string' && (
                      <button className="btn-ghost btn-sm h-7 ml-auto" onClick={() => reply(String(n.payload.fromUsername))}><MessageCircle size={12} /> Reply</button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
