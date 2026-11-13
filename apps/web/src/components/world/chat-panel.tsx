'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, MessageCircle, Send, Shield, UserPlus, Users, X } from 'lucide-react';
import { api, del, post, ApiError } from '@/lib/api';
import type { ChatMsg, Connections } from '@/lib/types';
import { FaceBadge } from '../face-badge';
import { useGame, useLive, useSession } from '../providers';
import { clsx } from '../ui';

type Tab = 'nearby' | 'clan' | 'friends';
const MAX_KEPT = 120;

/** Nearby, clan and private chat plus connections, in one collapsible panel. */
export function ChatPanel({ position, openWith, onOpenedWith }: { position: () => { lat: number; lng: number } | null; openWith: string | null; onOpenedWith: () => void }) {
  const live = useLive();
  const { me, openSignIn } = useSession();
  const { toast } = useGame();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('nearby');
  const [dm, setDm] = useState<string | null>(null); // username of the open private chat
  const [threads, setThreads] = useState<Record<string, ChatMsg[]>>({});
  const [unread, setUnread] = useState(0);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [conns, setConns] = useState<Connections | null>(null);
  const [addName, setAddName] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const meId = me.user?.id ?? null;
  const idToName = useMemo(() => new Map((conns?.friends ?? []).map((f) => [f.user.id, f.user.username])), [conns]);

  const keyFor = useCallback(
    (m: ChatMsg) => {
      if (m.room.startsWith('nearby:')) return 'nearby';
      if (m.room.startsWith('clan:')) return 'clan';
      // Private threads are keyed by the other player's @username, which the server sends with each message.
      const other = m.senderId === meId ? m.toUsername : m.senderUsername;
      if (other) return `dm:${other}`;
      const otherId = m.room.split(':').slice(1).find((id) => id !== meId);
      return otherId ? `dm:${idToName.get(otherId) ?? otherId}` : 'nearby';
    },
    [meId, idToName],
  );

  const refreshConns = useCallback(() => {
    if (!me.user) return;
    api<Connections>('/connections').then(setConns).catch(() => undefined);
  }, [me.user]);

  const add = useCallback((key: string, msgs: ChatMsg[], replace = false) => {
    setThreads((t) => {
      const have = replace ? [] : (t[key] ?? []);
      const ids = new Set(have.map((m) => m.id));
      return { ...t, [key]: [...have, ...msgs.filter((m) => !ids.has(m.id))].slice(-MAX_KEPT) };
    });
  }, []);

  // Live messages
  useEffect(
    () =>
      live.onChat((m) => {
        const key = keyFor(m);
        add(key, [m]);
        if (m.senderId !== meId && !(open && ((tab === 'nearby' && key === 'nearby') || (tab === 'clan' && key === 'clan') || (tab === 'friends' && key === `dm:${dm}`)))) setUnread((n) => n + 1);
      }),
    [live, keyFor, add, meId, open, tab, dm],
  );
  useEffect(
    () =>
      live.onChatError((message, code) => {
        if (code === 'sign_in') openSignIn('Sign in to chat. Reading is free.');
        else setErr(message);
      }),
    [live, openSignIn],
  );
  // Connection requests and accepts arrive as notifications: keep the friends list current.
  useEffect(
    () =>
      live.onNotification((n) => {
        if (n.kind === 'connection_request' || n.kind === 'connection_accepted') refreshConns();
      }),
    [live, refreshConns],
  );

  // Notifications about connections arrive on the socket too: refresh the list when the panel is open.
  useEffect(() => {
    if (open && me.user) refreshConns();
  }, [open, me.user, refreshConns]);

  // History when a thread is opened
  useEffect(() => {
    if (!open) return;
    if (tab === 'nearby') {
      const pos = position();
      if (pos) api<{ messages: ChatMsg[] }>(`/chat/nearby?lat=${pos.lat}&lng=${pos.lng}`).then((r) => add('nearby', r.messages)).catch(() => undefined);
    } else if (tab === 'clan' && me.user) {
      api<{ messages: ChatMsg[] }>('/chat/clan').then((r) => add('clan', r.messages)).catch(() => undefined);
    } else if (tab === 'friends' && dm) {
      api<{ messages: ChatMsg[] }>(`/chat/dm/${dm}`).then((r) => add(`dm:${dm}`, r.messages)).catch(() => undefined);
    }
  }, [open, tab, dm, me.user, position, add]);

  // Open a private chat from outside (the peer card)
  useEffect(() => {
    if (!openWith) return;
    setOpen(true);
    setTab('friends');
    setDm(openWith);
    onOpenedWith();
  }, [openWith, onOpenedWith]);

  const key = tab === 'friends' ? (dm ? `dm:${dm}` : '') : tab;
  const msgs = threads[key] ?? [];
  // Braces matter: scroll methods return a Promise in current Chromium, and an effect must not return one.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [msgs.length, open, key]);
  useEffect(() => {
    if (open) setUnread(0);
  }, [open, tab, dm]);

  const send = () => {
    const body = text.trim();
    if (!body) return;
    if (!me.user) return openSignIn('Sign in to chat. Guests can read nearby chat; sending messages, following and connecting need an account.');
    setErr(null);
    if (tab === 'friends' && dm) live.sendChat('dm', body, dm);
    else if (tab === 'clan') live.sendChat('clan', body);
    else live.sendChat('nearby', body);
    setText('');
  };

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast({ kind: 'success', title: ok });
      refreshConns();
    } catch (e) {
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'That did not work' });
    }
  };

  if (!open) {
    return (
      <div className="absolute z-20 right-3 bottom-[152px] md:bottom-6">
        <button className="glass rounded-2xl icon-btn relative" onClick={() => setOpen(true)} aria-label={`Chat${unread ? `, ${unread} unread` : ''}`}>
          <MessageCircle size={18} />
          {unread > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--color-coral)] text-xs font-bold grid place-items-center text-white">{unread > 9 ? '9+' : unread}</span>}
        </button>
      </div>
    );
  }

  const canType = tab !== 'friends' || !!dm;
  const hint = tab === 'nearby' ? 'Say hi to people within 2 km' : tab === 'clan' ? 'Message your clan' : dm ? `Message @${dm}` : '';

  return (
    <section className="absolute z-30 left-3 bottom-24 md:bottom-6 w-[min(22rem,calc(100vw-1.5rem))] h-[min(26rem,60vh)] glass rounded-2xl flex flex-col overflow-hidden animate-rise" aria-label="Chat">
      <header className="flex items-center gap-1 p-2 border-b border-[var(--line)]">
        {(['nearby', 'clan', 'friends'] as Tab[]).map((t2) => (
          <button key={t2} onClick={() => { setTab(t2); if (t2 !== 'friends') setDm(null); }} className={clsx('px-3 h-8 rounded-full text-xs font-semibold capitalize inline-flex items-center gap-1', tab === t2 ? 'bg-[var(--color-teal)] text-[#0b1020]' : 'hover:bg-white/10')}>
            {t2 === 'nearby' ? 'Nearby' : t2 === 'clan' ? 'Clan' : <><Users size={12} /> Friends{(conns?.incoming.length ?? 0) > 0 && <span className="size-2 rounded-full bg-[var(--color-coral)]" />}</>}
          </button>
        ))}
        <button className="icon-btn ml-auto" onClick={() => setOpen(false)} aria-label="Close chat"><X size={16} /></button>
      </header>

      {tab === 'friends' && !dm ? (
        <div className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
          {!me.user ? (
            <div className="space-y-2">
              <p className="muted">You are exploring as a guest. Sign in (it takes one email code) to pick a @username, connect with other explorers and chat privately.</p>
              <button className="btn-primary btn-sm" onClick={() => openSignIn('Sign in to connect with other explorers and chat privately.')}>Sign in</button>
            </div>
          ) : (
            <>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const u = addName.trim().replace(/^@/, '');
                  if (u) void act(() => post('/connections', { username: u }), 'Request sent').then(() => setAddName(''));
                }}
              >
                <input className="input h-9 flex-1" placeholder="Add by @username" value={addName} onChange={(e) => setAddName(e.target.value)} aria-label="Username to connect with" />
                <button className="btn-primary btn-sm" aria-label="Send request"><UserPlus size={14} /></button>
              </form>
              {conns?.incoming.map((r) => (
                <div key={r.connectionId} className="surface p-2 flex items-center gap-2">
                  <FaceBadge look={r.user.avatar} size={30} />
                  <div className="min-w-0 flex-1"><div className="font-medium truncate">{r.user.displayName}</div><div className="text-xs muted">wants to connect</div></div>
                  <button className="icon-btn" aria-label="Accept" onClick={() => void act(() => post(`/connections/${r.connectionId}/accept`), 'Connected')}><Check size={16} /></button>
                  <button className="icon-btn" aria-label="Decline" onClick={() => void act(() => del(`/connections/${r.connectionId}`))}><X size={16} /></button>
                </div>
              ))}
              {conns?.friends.map((f) => (
                <div key={f.connectionId} className="flex items-center gap-2">
                  <button className="flex flex-1 items-center gap-2 text-left rounded-xl p-2 hover:bg-white/5 min-w-0" onClick={() => setDm(f.user.username)}>
                    <FaceBadge look={f.user.avatar} size={30} />
                    <span className="min-w-0"><span className="block font-medium truncate">{f.user.displayName}</span><span className="block text-xs muted">@{f.user.username} · level {f.user.level}</span></span>
                  </button>
                  <button className="icon-btn" aria-label={`Remove ${f.user.displayName}`} onClick={() => void act(() => del(`/connections/${f.connectionId}`), 'Removed')}><X size={14} /></button>
                </div>
              ))}
              {conns && conns.friends.length === 0 && conns.incoming.length === 0 && <p className="muted">No connections yet. Tap an explorer on the map and press Connect, or add someone by username.</p>}
              {conns?.outgoing.length ? <p className="text-xs muted">Waiting for: {conns.outgoing.map((o) => `@${o.user.username}`).join(', ')}</p> : null}
            </>
          )}
        </div>
      ) : (
        <>
          {tab === 'friends' && dm && (
            <button className="text-xs px-3 py-2 text-left muted hover:text-[var(--text)]" onClick={() => setDm(null)}>← All friends · <span className="text-[var(--text)] font-semibold">@{dm}</span></button>
          )}
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 text-sm" aria-live="polite">
            {tab === 'clan' && !me.user && <p className="muted">Sign in and join a clan to chat with your team.</p>}
            {tab === 'clan' && me.user && !live.you?.clanId && <p className="muted">You are not in a clan yet. <a className="underline" href="/clans">Find or found one</a>.</p>}
            {msgs.length === 0 && (tab !== 'clan' || live.you?.clanId) && <p className="muted text-xs">{tab === 'nearby' ? 'Quiet around here. Walk to a busier spot or say hello.' : 'No messages yet.'}</p>}
            {msgs.map((m) => (
              <div key={m.id} className={clsx('flex gap-2', m.senderId === meId && 'flex-row-reverse')}>
                <FaceBadge look={m.avatar} size={26} />
                <div className={clsx('rounded-2xl px-3 py-1.5 max-w-[78%] break-words', m.senderId === meId ? 'bg-[var(--color-teal)] text-[#0b1020]' : 'bg-white/10')}>
                  {m.senderId !== meId && <div className="text-xs font-semibold opacity-70">{m.senderName}</div>}
                  {m.body}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
          {!me.user && (
            <p className="px-3 py-2 text-xs border-t border-[var(--line)] flex items-center gap-2">
              <span className="muted flex-1">Guests can read. Sign in to chat, follow and connect.</span>
              <button className="btn-primary btn-sm h-7" onClick={() => openSignIn('Sign in to chat. Guests can read nearby chat; sending messages, following and connecting need an account.')}>Sign in</button>
            </p>
          )}
          {err && <p role="alert" className="px-3 text-xs text-[var(--color-coral)]">{err}</p>}
          {canType && (
            <form
              className="p-2 border-t border-[var(--line)] flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <input className="input h-10 flex-1" value={text} onChange={(e) => setText(e.target.value)} maxLength={280} placeholder={me.user ? hint : 'Sign in to chat'} aria-label="Message" />
              <button className="btn-primary btn-sm" aria-label="Send"><Send size={14} /></button>
            </form>
          )}
          <p className="px-3 pb-2 text-xs muted flex items-center gap-1"><Shield size={10} /> Be kind. Messages are moderated and rate-limited.</p>
        </>
      )}
    </section>
  );
}
