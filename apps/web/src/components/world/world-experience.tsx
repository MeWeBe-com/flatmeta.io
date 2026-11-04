'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Compass, LocateFixed, Minus, Plus, Search, Sparkles, Users, Flag, X, HelpCircle } from 'lucide-react';
import type { Rect } from '@/lib/grid';
import { rectCenter } from '@/lib/grid';
import { guessStart } from '@/lib/locate';
import { compact } from '@/lib/format';
import { t } from '@/lib/i18n';
import type { Activity, Peer, Plot, WorldPlot } from '@/lib/types';
import { WorldMap, type SelectionState, type WorldMapHandle } from '../map/world-map';
import { useLive, useSession, useTheme } from '../providers';
import { UserMenu } from '../site-chrome';
import { Logo, clsx } from '../ui';
import { ChatPanel } from './chat-panel';
import { ErrorBoundary } from '../error-boundary';
import { ClaimPanel } from './claim-panel';
import { LEVEL_ZOOM, LevelSwitch, type Level } from './level-switch';
import { PeerCard } from './peer-card';
import { LiveTicker } from './live-ticker';
import { PlotSheet } from './plot-sheet';
import { QuestTracker } from './quest-tracker';
import { SearchPalette } from './search-palette';
import { Tour, useTourState } from './tour';

export function WorldExperience({ stats }: { stats: { plots: number; showcase: number; countries: number; explorers: number } | null }) {
  const map = useRef<WorldMapHandle>(null);
  const params = useSearchParams();
  const router = useRouter();
  const { theme } = useTheme();
  const { me } = useSession();
  const live = useLive();
  const { online } = live;
  const tour = useTourState();
  const [claimMode, setClaimMode] = useState(false);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [selState, setSelState] = useState<SelectionState>('idle');
  const [openPlot, setOpenPlot] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [zoom, setZoom] = useState(() => {
    const at = params.get('at')?.split(',').map(Number);
    return at && at.length >= 2 && at.every(Number.isFinite) ? (at[2] ?? 15) : 1.6;
  });
  const [mobilePanel, setMobilePanel] = useState(false);
  const [peer, setPeer] = useState<Peer | null>(null);
  const [chatWith, setChatWith] = useState<string | null>(() => params.get('dm'));
  // "Reply" on a message notification opens that private chat.
  useEffect(() => {
    const open = (e: Event) => setChatWith((e as CustomEvent<string>).detail);
    window.addEventListener('fm:open-dm', open);
    return () => window.removeEventListener('fm:open-dm', open);
  }, []);
  const center = useRef({ lng: 8, lat: 28 });
  const viewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [initialView] = useState(() => {
    const at = params.get('at')?.split(',').map(Number);
    if (at && at.length >= 2 && at.every(Number.isFinite)) return { lat: at[0]!, lng: at[1]!, zoom: at[2] ?? 15 };
    return undefined;
  });

  // Other explorers in view are drawn by the map layer; chat becomes speech bubbles over their heads.
  useEffect(() => live.onPeers((list) => map.current?.setPeers(list)), [live]);
  useEffect(
    () =>
      live.onChat((m) => {
        if (!m.room.startsWith('nearby:') && !m.room.startsWith('clan:')) return;
        map.current?.bubble(m.senderId && m.senderId === me.user?.id ? 'me' : m.senderId, m.body);
      }),
    [live, me.user?.id],
  );
  const identity = useMemo(() => ({ look: me.user?.avatar ?? live.you?.avatar ?? null, name: me.user?.displayName ?? live.you?.name ?? 'You' }), [me.user?.avatar, me.user?.displayName, live.you?.avatar, live.you?.name]);

  const pickLevel = (l: Level) => {
    const mine = map.current?.myPosition();
    const at = l === 'world' ? center.current : (mine ?? center.current);
    map.current?.flyTo(at.lng, at.lat, LEVEL_ZOOM[l]);
  };

  // First visit: fly from the globe to the visitor's region (no permission prompt).
  useEffect(() => {
    if (initialView || params.get('plot') || params.get('claim')) return;
    const start = guessStart();
    if (start) setTimeout(() => map.current?.flyTo(start.lng, start.lat, Math.min(start.zoom, 5)), 900);
  }, [initialView, params]);

  // Deep links: ?plot=slug, ?claim=minGx,minGy,maxGx,maxGy
  useEffect(() => {
    const slug = params.get('plot');
    if (slug) {
      fetch(`/api/v1/plots/${slug}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { plot: Plot } | null) => {
          if (!d) return;
          setOpenPlot(d.plot.id);
          setTimeout(() => map.current?.fitBounds(d.plot.bounds, 16), 400);
        })
        .catch(() => undefined);
    }
    const claim = params.get('claim')?.split(',').map(Number);
    if (claim && claim.length === 4 && claim.every(Number.isFinite)) {
      const rect = { minGx: claim[0]!, minGy: claim[1]!, maxGx: claim[2]!, maxGy: claim[3]! };
      const c = rectCenter(rect);
      setClaimMode(true);
      setSelection(rect);
      setTimeout(() => map.current?.flyTo(c.lng, c.lat, 16), 400);
    }
  }, [params]);

  // Keyboard: / or ⌘K search, c claim, Esc close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || e.key === '/') {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === 'c') setClaimMode((c) => !c);
      else if (e.key === 'Escape') {
        setOpenPlot(null);
        setClaimMode(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const startClaim = () => {
    setOpenPlot(null);
    setClaimMode(true);
    setSelection(null);
    if (zoom < 13.5) {
      const z = map.current?.getZoom() ?? 2;
      if (z >= 8) map.current?.zoomBy(15 - z);
    }
  };
  const onPlotClick = useCallback((p: WorldPlot) => {
    setOpenPlot(p.id);
    if ((map.current?.getZoom() ?? 0) < 11) map.current?.fitBounds(p.bounds, 15);
  }, []);
  const onActivity = (a: Activity) => {
    if (a.lat !== null && a.lng !== null) map.current?.flyTo(a.lng, a.lat, 15.5);
    if (a.plotId) setOpenPlot(a.plotId);
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-[var(--bg)]">
      <WorldMap
        ref={map}
        theme={theme}
        claimMode={claimMode}
        selection={selection}
        selectionState={selState}
        maxSide={me.orgs?.some((o) => o.plan === 'business' || o.plan === 'brand') ? 20 : 10}
        focusPlotId={openPlot}
        initialView={initialView}
        onSelect={setSelection}
        onPlotClick={onPlotClick}
        identity={identity}
        onAvatarMove={live.sendMove}
        onPeerClick={(p) => setPeer(p)}
        onViewChange={(v) => {
          setZoom(v.zoom);
          center.current = { lng: v.lng, lat: v.lat };
          if (viewTimer.current) clearTimeout(viewTimer.current);
          viewTimer.current = setTimeout(() => live.sendView(v.bounds), 300);
        }}
      />

      {/* Top bar */}
      <header className="absolute top-0 inset-x-0 z-40 p-3 flex items-center gap-2 pointer-events-none">
        <Link href="/explore" className="pointer-events-auto glass rounded-full h-11 px-3 flex items-center" aria-label="Explore FlatMeta">
          <Logo size={26} withText={false} />
          <span className="hidden sm:inline font-display font-bold ml-2">FlatMeta</span>
        </Link>
        <button data-tour="search" onClick={() => setSearchOpen(true)} className="pointer-events-auto glass rounded-full h-11 flex-1 max-w-xl flex items-center gap-2 px-4 text-left text-sm muted hover:text-[var(--text)]">
          <Search size={16} />
          <span className="truncate">{t('hud.search')}</span>
          <span className="ml-auto chip chip-violet h-6"><Sparkles size={11} /> AI</span>
          <kbd className="hidden md:inline text-[10px] border border-[var(--line-strong)] rounded px-1.5 py-0.5">⌘K</kbd>
        </button>
        <nav className="hidden lg:flex pointer-events-auto glass rounded-full h-11 items-center px-2 text-sm">
          <Link href="/explore" className="px-3 h-9 rounded-full inline-flex items-center hover:bg-white/5">{t('nav.explore')}</Link>
          <Link href="/leaderboards" className="px-3 h-9 rounded-full inline-flex items-center hover:bg-white/5">{t('nav.leaderboards')}</Link>
          <Link href="/business" className="px-3 h-9 rounded-full inline-flex items-center hover:bg-white/5">{t('nav.business')}</Link>
        </nav>
        <div className="ml-auto pointer-events-auto">
          <UserMenu />
        </div>
      </header>

      {/* Right rail: quests + live */}
      {!openPlot && !claimMode && (
        <div className="absolute z-20 right-3 top-[72px] w-80 space-y-3 hidden md:block">
          <QuestTracker />
          <LiveTicker onSelect={onActivity} />
        </div>
      )}
      {!openPlot && !claimMode && (
        <button
          className={clsx('absolute z-20 right-3 bottom-24 md:hidden glass rounded-full size-11 grid place-items-center', mobilePanel && 'text-[var(--color-teal)]')}
          onClick={() => setMobilePanel((p) => !p)}
          aria-label="Quests and live activity"
          aria-expanded={mobilePanel}
        >
          {mobilePanel ? <X size={18} /> : <Flag size={18} />}
        </button>
      )}
      {mobilePanel && !openPlot && !claimMode && (
        <div className="md:hidden absolute z-20 inset-x-3 top-[72px] bottom-40 space-y-3 overflow-y-auto animate-rise">
          <QuestTracker />
          <LiveTicker onSelect={(a) => { setMobilePanel(false); onActivity(a); }} />
        </div>
      )}

      {/* Left controls */}
      <div className="absolute z-20 left-3 bottom-24 md:bottom-6 flex flex-col gap-2">
        <div className="glass rounded-2xl flex flex-col">
          <button className="icon-btn" onClick={() => map.current?.zoomBy(1)} aria-label={t('hud.zoomIn')}><Plus size={18} /></button>
          <button className="icon-btn" onClick={() => map.current?.zoomBy(-1)} aria-label={t('hud.zoomOut')}><Minus size={18} /></button>
        </div>
        <button
          className="glass rounded-2xl icon-btn"
          aria-label={t('hud.locate')}
          onClick={() =>
            navigator.geolocation?.getCurrentPosition(
              (p) => map.current?.flyTo(p.coords.longitude, p.coords.latitude, 15),
              () => {
                const g = guessStart();
                if (g) map.current?.flyTo(g.lng, g.lat, g.zoom);
              },
              { timeout: 6000 },
            )
          }
        >
          <LocateFixed size={18} />
        </button>
        <button className="glass rounded-2xl icon-btn" onClick={tour.start} aria-label="How FlatMeta works"><HelpCircle size={18} /></button>
      </div>

      {/* The three levels */}
      {!claimMode && (
        <div className="absolute z-20 left-1/2 -translate-x-1/2 bottom-[84px] sm:bottom-auto sm:top-[108px]">
          <LevelSwitch zoom={zoom} onPick={pickLevel} />
        </div>
      )}

      {peer && !claimMode && !openPlot && (
        <ErrorBoundary name="PeerCard">
        <PeerCard
          peer={peer}
          onClose={() => setPeer(null)}
          onChat={(u) => {
            setPeer(null);
            setChatWith(u);
          }}
        />
        </ErrorBoundary>
      )}
      {!claimMode && (
        <ErrorBoundary
          name="ChatPanel"
          fallback={<p role="alert" className="absolute z-20 right-3 bottom-[152px] md:bottom-6 glass rounded-2xl px-3 py-2 text-xs">Chat is unavailable. <button className="underline" onClick={() => location.reload()}>Reload</button></p>}
        >
          <ChatPanel position={() => map.current?.myPosition() ?? { ...center.current }} openWith={chatWith} onOpenedWith={() => setChatWith(null)} />
        </ErrorBoundary>
      )}

      {/* Bottom stats pill */}
      <div className="absolute z-10 left-1/2 -translate-x-1/2 top-[70px] hidden sm:flex glass rounded-full h-8 px-3 items-center gap-3 text-xs pointer-events-none">
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-[var(--color-coral)] animate-pulse" /> {t('hud.online', { count: compact(Math.max(online, 1)) })}</span>
        {stats && <span className="muted">{compact(stats.plots + stats.showcase)} plots · {stats.countries} countries</span>}
      </div>

      {/* Primary action */}
      {!claimMode && !openPlot && (
        <div className="absolute z-20 bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2">
          <button data-tour="claim" className="btn-primary btn-lg shadow-2xl animate-pulse-ring" onClick={startClaim}>
            <Compass size={18} /> {t('hud.claimLand')}
          </button>
        </div>
      )}

      {claimMode && (
        <ClaimPanel
          selection={selection}
          zoom={zoom}
          initialTitle={params.get('title') ?? undefined}
          onClose={() => {
            setClaimMode(false);
            setSelection(null);
          }}
          onState={setSelState}
          onClaimed={() => {
            setClaimMode(false);
            setSelection(null);
            map.current?.reload();
          }}
          onPick={(s) => {
            setSelection(s.rect);
            map.current?.flyTo(s.center.lng, s.center.lat, 16);
          }}
          onZoomIn={() => {
            const c = selection ? rectCenter(selection) : null;
            if (c) map.current?.flyTo(c.lng, c.lat, 15.5);
            else map.current?.zoomBy(15.2 - (map.current?.getZoom() ?? 15));
          }}
        />
      )}

      {openPlot && (
        <PlotSheet
          plotId={openPlot}
          onClose={() => {
            setOpenPlot(null);
            if (params.get('plot')) router.replace('/', { scroll: false });
          }}
          onFocus={(p) => map.current?.fitBounds(p.bounds, 17)}
        />
      )}

      <SearchPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onFlyTo={(lng, lat, z) => map.current?.flyTo(lng, lat, z)}
        onPlot={(p) => {
          setOpenPlot(p.id);
          map.current?.fitBounds(p.bounds, 16);
        }}
      />
      <Tour open={tour.open} onClose={tour.close} />

      {!me.user && !claimMode && !openPlot && (
        <div className="absolute z-20 left-3 top-[72px] md:w-80 right-3 md:right-auto glass rounded-2xl p-4 animate-rise hidden sm:block">
          <div className="flex items-start gap-2">
            <div>
              <h1 className="font-display font-bold text-lg leading-tight">{t('app.tagline')}</h1>
              <p className="text-sm muted mt-1">Explore glowing plots around the globe, then claim your own. Your first plot is free.</p>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button className="btn-primary btn-sm" onClick={startClaim}><Compass size={14} /> Claim free land</button>
            <Link href="/explore" className="btn-ghost btn-sm"><Users size={14} /> Explore</Link>
          </div>
        </div>
      )}
    </div>
  );
}
