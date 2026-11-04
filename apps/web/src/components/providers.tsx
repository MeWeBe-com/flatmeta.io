'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, post } from '@/lib/api';
import { WS_URL } from '@/lib/config';
import type { Activity, ChatMsg, GameResult, MeResponse, Peer, You } from '@/lib/types';
import { t } from '@/lib/i18n';
import { QUIET_KINDS, describeNotification, type AppNotification } from '@/lib/notifications';

// ─── Session ────────────────────────────────────────────────────────────────

interface SessionCtx {
  me: MeResponse;
  loading: boolean;
  refresh: () => Promise<void>;
  signInOpen: boolean;
  openSignIn: (reason?: string, onSuccess?: () => void) => void;
  closeSignIn: () => void;
  signInReason: string | null;
  onSignedIn: () => void;
  signOut: () => Promise<void>;
  /** Update the unread notification count without refetching /me (live events, mark-as-read). */
  setUnread: (fn: (n: number) => number) => void;
}
const Session = createContext<SessionCtx | null>(null);
export const useSession = () => {
  const ctx = useContext(Session);
  if (!ctx) throw new Error('useSession outside provider');
  return ctx;
};

function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse>({ user: null });
  const [loading, setLoading] = useState(true);
  const [signInOpen, setSignInOpen] = useState(false);
  const [signInReason, setReason] = useState<string | null>(null);
  const after = useRef<(() => void) | null>(null);

  const refresh = useCallback(async () => {
    try {
      setMe(await api<MeResponse>('/me'));
    } catch {
      setMe({ user: null });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<SessionCtx>(
    () => ({
      me,
      loading,
      refresh,
      signInOpen,
      signInReason,
      openSignIn: (reason, onSuccess) => {
        setReason(reason ?? null);
        after.current = onSuccess ?? null;
        setSignInOpen(true);
      },
      closeSignIn: () => setSignInOpen(false),
      onSignedIn: () => {
        setSignInOpen(false);
        void refresh().then(() => {
          after.current?.();
          after.current = null;
        });
      },
      signOut: async () => {
        await post('/auth/logout');
        setMe({ user: null });
      },
      setUnread: (fn) => setMe((m) => (m.user ? { ...m, unreadNotifications: Math.max(0, fn(m.unreadNotifications ?? 0)) } : m)),
    }),
    [me, loading, refresh, signInOpen, signInReason],
  );
  return <Session.Provider value={value}>{children}</Session.Provider>;
}

// ─── Game feedback (XP toasts, achievements, level-ups, confetti) ──────────

export interface Toast {
  id: number;
  kind: 'xp' | 'achievement' | 'quest' | 'info' | 'error' | 'success';
  title: string;
  body?: string;
  rarity?: string;
  icon?: string;
}

interface GameCtx {
  toasts: Toast[];
  toast: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
  handleGame: (g: GameResult | null | undefined) => void;
  levelUp: GameResult['levelUp'];
  clearLevelUp: () => void;
  confetti: () => void;
  progressVersion: number;
}
const Game = createContext<GameCtx | null>(null);
export const useGame = () => {
  const ctx = useContext(Game);
  if (!ctx) throw new Error('useGame outside provider');
  return ctx;
};

const CONFETTI_COLORS = ['#2DE2C4', '#FFC94D', '#8B7CFF', '#FF6B6B', '#3FA9F5'];

function GameProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [levelUp, setLevelUp] = useState<GameResult['levelUp']>(null);
  const [progressVersion, setProgressVersion] = useState(0);
  const seq = useRef(0);
  const { refresh } = useSession();

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (x: Omit<Toast, 'id'>) => {
      const id = ++seq.current;
      setToasts((ts) => [...ts.slice(-4), { ...x, id }]);
      setTimeout(() => dismiss(id), x.kind === 'achievement' ? 6000 : 3800);
    },
    [dismiss],
  );

  const confetti = useCallback(() => {
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (let i = 0; i < 70; i++) {
      const el = document.createElement('div');
      el.className = 'confetti-piece';
      el.style.left = `${Math.random() * 100}vw`;
      el.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length]!;
      el.style.animationDuration = `${1.6 + Math.random() * 1.6}s`;
      el.style.animationDelay = `${Math.random() * 0.4}s`;
      el.style.borderRadius = i % 3 === 0 ? '50%' : '2px';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 3800);
    }
  }, []);

  const handleGame = useCallback(
    (g: GameResult | null | undefined) => {
      if (!g) return;
      if (g.xp > 0) toast({ kind: 'xp', title: t('game.xp', { xp: g.xp }) });
      for (const a of g.achievements) toast({ kind: 'achievement', title: a.name, body: t('game.achievement'), rarity: a.rarity, icon: a.icon });
      for (const q of g.questsCompleted) toast({ kind: 'quest', title: t('game.questDone', { title: q.title }) });
      if (g.levelUp) {
        setLevelUp(g.levelUp);
        confetti();
      } else if (g.achievements.some((a) => a.rarity === 'epic' || a.rarity === 'legendary')) confetti();
      if (g.xp > 0 || g.achievements.length || g.questsCompleted.length) {
        setProgressVersion((v) => v + 1);
        void refresh();
      }
    },
    [toast, confetti, refresh],
  );

  const value = useMemo(
    () => ({ toasts, toast, dismiss, handleGame, levelUp, clearLevelUp: () => setLevelUp(null), confetti, progressVersion }),
    [toasts, toast, dismiss, handleGame, levelUp, confetti, progressVersion],
  );
  return <Game.Provider value={value}>{children}</Game.Provider>;
}

/**
 * Run an action once the visitor has signed in. Pass `arm` as the sign-in dialog's callback; `go` turns true for
 * one render after the session is updated, so the action (run from an effect in the component) sees the new
 * signed-in state. Calling a closure from before sign-in would still think nobody is signed in.
 *
 *   const [arm, go] = useAfterSignIn();
 *   useEffect(() => { if (go) void doIt(); }, [go]);
 */
export function useAfterSignIn() {
  const { me } = useSession();
  const [armed, setArmed] = useState(false);
  const go = armed && !!me.user;
  useEffect(() => {
    if (go) setArmed(false);
  }, [go]);
  return [useCallback(() => setArmed(true), []), go] as const;
}

// ─── Live world (WebSocket) ─────────────────────────────────────────────────

interface LiveCtx {
  online: number;
  activity: Activity[];
  connected: boolean;
  subscribe: (fn: (a: Activity) => void) => () => void;
  /** Who I am on the live socket (guests get an anonymous name and avatar). */
  you: You | null;
  /** Explorers inside my current viewport (City and Land levels). */
  peers: Peer[];
  /** Tell the server where my avatar is, and what part of the map I'm looking at. */
  sendMove: (lat: number, lng: number) => void;
  sendView: (b: { west: number; south: number; east: number; north: number } | null) => void;
  sendChat: (scope: 'nearby' | 'dm' | 'clan', body: string, to?: string) => void;
  /** Subscribe to chat messages and server errors. */
  onChat: (fn: (m: ChatMsg) => void) => () => void;
  onChatError: (fn: (message: string, code: string) => void) => () => void;
  /** Subscribe to peer snapshots without re-rendering (used by the map layer). */
  onPeers: (fn: (p: Peer[]) => void) => () => void;
  /** Subscribe to my notifications as they arrive (follows, requests, DMs, clan invites…). */
  onNotification: (fn: (n: AppNotification) => void) => () => void;
}
const Live = createContext<LiveCtx | null>(null);
export const useLive = () => {
  const ctx = useContext(Live);
  if (!ctx) throw new Error('useLive outside provider');
  return ctx;
};

function LiveProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(0);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [connected, setConnected] = useState(false);
  const listeners = useRef(new Set<(a: Activity) => void>());
  const chatListeners = useRef(new Set<(m: ChatMsg) => void>());
  const errorListeners = useRef(new Set<(message: string, code: string) => void>());
  const peerListeners = useRef(new Set<(p: Peer[]) => void>());
  const notifyListeners = useRef(new Set<(n: AppNotification) => void>());
  const wsRef = useRef<WebSocket | null>(null);
  const lastView = useRef<string | null>(null);
  const lastMove = useRef<string | null>(null);
  const [you, setYou] = useState<You | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const { me, setUnread } = useSession();
  const { toast } = useGame();
  const userId = me.user?.id;
  // The socket handler is created once per connection: read the latest callbacks through a ref.
  const onNote = useRef<(n: AppNotification) => void>(() => undefined);
  useEffect(() => {
    onNote.current = (n) => {
      // A DM collapsed into an unread entry (count > 1) is not a new unread row.
      setUnread((u) => u + (n.kind === 'dm' && typeof n.payload.count === 'number' && n.payload.count > 1 ? 0 : 1));
      if (!QUIET_KINDS.has(n.kind)) toast({ kind: 'info', title: describeNotification(n) });
      for (const fn of notifyListeners.current) fn(n);
    };
  }, [setUnread, toast]);

  useEffect(() => {
    api<{ activity: Activity[] }>('/world/activity?limit=20')
      .then((r) => setActivity(r.activity))
      .catch(() => undefined);
    api<{ online: number }>('/world/stats')
      .then((r) => setOnline(r.online))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let stop = false;
    let retry = 1000;
    let ping: ReturnType<typeof setInterval> | null = null;
    const url = WS_URL || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/v1/live`;
    const connect = () => {
      if (stop) return;
      ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => {
        setConnected(true);
        retry = 1000;
        // Re-announce where I am and what I'm looking at after every (re)connect.
        if (lastMove.current) ws?.send(lastMove.current);
        if (lastView.current) ws?.send(lastView.current);
        ping = setInterval(() => ws?.readyState === 1 && ws.send('{"type":"ping"}'), 25_000);
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as { type: string; online?: number; activity?: Activity; you?: You; avatars?: Peer[]; message?: ChatMsg & { code?: string }; code?: string; notification?: AppNotification };
          if ((msg.type === 'welcome' || msg.type === 'you') && msg.you) setYou(msg.you);
          if (msg.type === 'notification' && msg.notification) onNote.current(msg.notification);
          if (msg.type === 'avatars' && msg.avatars) {
            setPeers(msg.avatars);
            for (const fn of peerListeners.current) fn(msg.avatars);
          }
          if (msg.type === 'chat' && msg.message) for (const fn of chatListeners.current) fn(msg.message);
          if (msg.type === 'error') for (const fn of errorListeners.current) fn(String((msg as unknown as { message?: string }).message ?? 'Something went wrong'), msg.code ?? 'error');
          if (msg.type === 'presence' && typeof msg.online === 'number') setOnline(msg.online);
          if (msg.type === 'activity' && msg.activity) {
            setActivity((list) => [msg.activity!, ...list.filter((a) => a.id !== msg.activity!.id)].slice(0, 30));
            for (const fn of listeners.current) fn(msg.activity);
          }
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (ping) clearInterval(ping);
        if (!stop) setTimeout(connect, (retry = Math.min(retry * 2, 30_000)));
      };
    };
    connect();
    return () => {
      stop = true;
      if (ping) clearInterval(ping);
      wsRef.current = null;
      ws?.close();
    };
    // Reconnect when the user signs in/out so notifications reach the right socket.
  }, [userId]);

  const value = useMemo<LiveCtx>(() => {
    const sendRaw = (text: string) => {
      const ws = wsRef.current;
      if (ws?.readyState === 1) ws.send(text);
    };
    const add = <T,>(set: Set<T>, fn: T) => {
      set.add(fn);
      return () => {
        set.delete(fn);
      };
    };
    return {
      online,
      activity,
      connected,
      you,
      peers,
      subscribe: (fn) => add(listeners.current, fn),
      onChat: (fn) => add(chatListeners.current, fn),
      onChatError: (fn) => add(errorListeners.current, fn),
      onPeers: (fn) => add(peerListeners.current, fn),
      onNotification: (fn) => add(notifyListeners.current, fn),
      sendMove: (lat, lng) => {
        lastMove.current = JSON.stringify({ type: 'move', lat, lng });
        sendRaw(lastMove.current);
      },
      sendView: (b) => {
        lastView.current = JSON.stringify({ type: 'view', bbox: b ? [b.west, b.south, b.east, b.north] : null });
        sendRaw(lastView.current);
      },
      sendChat: (scope, body, to) => sendRaw(JSON.stringify({ type: 'chat', scope, body, ...(to ? { to } : {}) })),
    };
  }, [online, activity, connected, you, peers]);
  return <Live.Provider value={value}>{children}</Live.Provider>;
}

// ─── Theme ──────────────────────────────────────────────────────────────────

interface ThemeCtx {
  theme: 'dark' | 'light';
  toggle: () => void;
}
const Theme = createContext<ThemeCtx>({ theme: 'dark', toggle: () => undefined });
export const useTheme = () => useContext(Theme);

function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  useEffect(() => {
    try {
      const saved = localStorage.getItem('fm-theme');
      if (saved === 'light' || saved === 'dark') setTheme(saved);
    } catch {
      /* private mode */
    }
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('fm-theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  const value = useMemo(() => ({ theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) }), [theme]);
  return <Theme.Provider value={value}>{children}</Theme.Provider>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <SessionProvider>
        <GameProvider>
          <LiveProvider>{children}</LiveProvider>
        </GameProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
