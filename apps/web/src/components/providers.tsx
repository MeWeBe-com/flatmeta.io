'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, post } from '@/lib/api';
import { WS_URL } from '@/lib/config';
import type { Activity, GameResult, MeResponse } from '@/lib/types';
import { t } from '@/lib/i18n';

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

// ─── Live world (WebSocket) ─────────────────────────────────────────────────

interface LiveCtx {
  online: number;
  activity: Activity[];
  connected: boolean;
  subscribe: (fn: (a: Activity) => void) => () => void;
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
  const { me } = useSession();
  const userId = me.user?.id;

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
      ws.onopen = () => {
        setConnected(true);
        retry = 1000;
        ping = setInterval(() => ws?.readyState === 1 && ws.send('{"type":"ping"}'), 25_000);
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as { type: string; online?: number; activity?: Activity };
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
      ws?.close();
    };
    // Reconnect when the user signs in/out so notifications reach the right socket.
  }, [userId]);

  const value = useMemo<LiveCtx>(
    () => ({
      online,
      activity,
      connected,
      subscribe: (fn) => {
        listeners.current.add(fn);
        return () => listeners.current.delete(fn);
      },
    }),
    [online, activity, connected],
  );
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
