'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Compass, LocateFixed, MapPin, Minus, Plus, Search, Sparkles, Users, Flag, X } from 'lucide-react';
import type { Rect } from '@/lib/grid';
import { rectCenter } from '@/lib/grid';
import { geoConsent, geoPermission, pickSpawn, precisePosition, readDevicePos, setGeoConsent, SPAWN_ZOOM, wantsPrecise, type ServerStart, type Spawn } from '@/lib/spawn';
import { compact } from '@/lib/format';
import { t } from '@/lib/i18n';
import type { Activity, Peer, Plot, WorldPlot } from '@/lib/types';
import dynamic from 'next/dynamic';
import type { SelectionState, WorldMapHandle } from '../map/world-map';
import { HomeFirstPaint } from './home-first-paint';
import { nearestPlots } from '@/lib/nearest';
import { useGame, useLive, useSession, useTheme } from '../providers';
import { UserMenu } from '../site-chrome';
import { Logo, Spinner, clsx } from '../ui';
import { ChatPanel } from './chat-panel';
import { Joystick, WalkControls, useTouch } from './walk-controls';
import { EMOTE_ICONS } from '@/lib/emotes';
import { AVATAR_MIN_ZOOM, webglAvailable } from '../map/constants';
import { NoWebglNotice } from '../map/no-webgl';
import { NearbyCard } from './nearby-card';
import { HappeningNow } from './happening-now';
import { ErrorBoundary } from '../error-boundary';
import { LEVEL_ZOOM, LevelSwitch, type Level } from './level-switch';
import { LiveTicker } from './live-ticker';
import { QuestTracker } from './quest-tracker';
import { useTourState } from './tour-state';
import { HelpMenu } from './help-menu';
import { NavMenu } from '../nav-menu';
import { MapAttribution } from '../map/attribution';

// M2: panels that start closed load when they open, so a phone's first screen hydrates with less JavaScript.
const ClaimPanel = dynamic(() => import('./claim-panel').then((m) => m.ClaimPanel), { ssr: false });
const PeerCard = dynamic(() => import('./peer-card').then((m) => m.PeerCard), { ssr: false });
const PlotSheet = dynamic(() => import('./plot-sheet').then((m) => m.PlotSheet), { ssr: false });
const SearchPalette = dynamic(() => import('./search-palette').then((m) => m.SearchPalette), { ssr: false });
const Tour = dynamic(() => import('./tour').then((m) => m.Tour), { ssr: false });

// M2: MapLibre (≈ 230 kB of JS plus its worker) loads after the first paint, not before the page can show anything.
const WorldMap = dynamic(() => import('../map/world-map').then((m) => m.WorldMap), { ssr: false, loading: () => null });

/** Distance in km between two points (great circle). */
function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/**
 * If no plot is within the first view around `at`, fly to the nearest group of plots (the closest plot and its
 * neighbours within 50 km) at City zoom. Uses the same /plots/nearest data as the "Nearby" card.
 */
async function showNearestContent(
  at: { lat: number; lng: number; zoom: number },
  cam: (fn: (m: WorldMapHandle) => void) => void,
): Promise<{ place: string; km: number } | null> {
  const plots = await nearestPlots(at.lat, at.lng, 6);
  const first = plots[0];
  if (!first) return null;
  // Half the shorter side of the screen, in km, at the start zoom.
  const kmPerPx = (156.543 * Math.cos((at.lat * Math.PI) / 180)) / 2 ** at.zoom;
  if (first.distanceKm <= (kmPerPx * Math.min(innerWidth, innerHeight)) / 2) return null;
  const group = plots.filter((p) => km(p.center, first.center) <= 50);
  if (group.length > 1) {
    const b = { west: Math.min(...group.map((p) => p.bounds.west)), south: Math.min(...group.map((p) => p.bounds.south)), east: Math.max(...group.map((p) => p.bounds.east)), north: Math.max(...group.map((p) => p.bounds.north)) };
    cam((m) => m.fitBounds(b, LEVEL_ZOOM.city + 1.5));
  } else cam((m) => m.flyTo(first.center.lng, first.center.lat, LEVEL_ZOOM.city));
  const place = first.showcase?.city ?? first.countryName ?? first.title;
  return { place, km: first.distanceKm };
}

export function WorldExperience({ stats }: { stats: { plots: number; showcase: number; countries: number; explorers: number } | null }) {
  const map = useRef<WorldMapHandle>(null);
  // Camera calls made before the (lazily loaded) map is ready wait here and run in order once it is.
  const [mapReady, setMapReady] = useState(false);
  // Decided in the browser before the map's code is requested: without WebGL it isn't downloaded at all.
  const [webgl, setWebgl] = useState<boolean | null>(null);
  useEffect(() => setWebgl(webglAvailable()), []);
  const pending = useRef<((m: WorldMapHandle) => void)[] | null>([]);
  const whenMap = useCallback((fn: (m: WorldMapHandle) => void) => {
    if (pending.current === null && map.current) fn(map.current);
    else (pending.current ??= []).push(fn);
  }, []);
  const onMapReady = useCallback(() => {
    const queue = pending.current ?? [];
    pending.current = null;
    setMapReady(true);
    if (map.current) for (const fn of queue) fn(map.current);
  }, []);
  const params = useSearchParams();
  const router = useRouter();
  const { theme } = useTheme();
  const { me } = useSession();
  const live = useLive();
  const { online } = live;
  const tour = useTourState();
  const touch = useTouch();
  const [claimMode, setClaimMode] = useState(false);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [selState, setSelState] = useState<SelectionState>('idle');
  const [openPlot, setOpenPlot] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [zoom, setZoom] = useState(() => {
    const at = params.get('at')?.split(',').map(Number);
    return at && at.length >= 2 && at.every(Number.isFinite) ? (at[2] ?? 15) : 1.6;
  });
  // Walk mode on a touch screen: avatars are drawn (City level and up) and the joystick is shown.
  const walking = touch && !claimMode && zoom >= AVATAR_MIN_ZOOM;
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
  // Emotes from players nearby (and my own echo) show over the avatars.
  useEffect(() => live.onEmote((e) => map.current?.emote(e.id, EMOTE_ICONS[e.emote])), [live]);
  const identity = useMemo(() => ({ look: me.user?.avatar ?? live.you?.avatar ?? null, name: me.user?.displayName ?? live.you?.name ?? 'You' }), [me.user?.avatar, me.user?.displayName, live.you?.avatar, live.you?.name]);

  const pickLevel = (l: Level) => {
    const mine = map.current?.myPosition();
    const at = l === 'world' ? center.current : (mine ?? center.current);
    map.current?.flyTo(at.lng, at.lat, LEVEL_ZOOM[l]);
  };

  // ── Where I start (see lib/spawn.ts): saved spot → this device → approximate (Cloudflare) → country → Home plaza.
  // Precise geolocation is offered after a friendly prompt and glides me there when it arrives.
  const { toast } = useGame();
  const [spawn, setSpawn] = useState<Spawn | null>(null);
  const [askGeo, setAskGeo] = useState(false);
  const [locating, setLocating] = useState(false);
  const spawnStarted = useRef(false);
  const preciseMoved = useRef(false);
  // "Nearest land: <place>, <distance>" after the camera moved from an empty start to the nearest plots (M2).
  const [nearestNote, setNearestNote] = useState<{ place: string; km: number } | null>(null); // the player's own location took the camera: nothing else moves it

  const goPrecise = useCallback(
    async (fromButton: boolean) => {
      setAskGeo(false);
      setLocating(true);
      preciseMoved.current = true;
      try {
        const p = await precisePosition();
        setGeoConsent('granted');
        whenMap((m) => {
          m.glideMeTo(p.lng, p.lat);
          m.flyTo(p.lng, p.lat, Math.max(m.getZoom(), SPAWN_ZOOM.precise));
        });
        setSpawn({ source: 'precise', lat: p.lat, lng: p.lng, zoom: SPAWN_ZOOM.precise, approximate: false });
      } catch (err) {
        if ((err as { code?: number }).code === 1) setGeoConsent('declined');
        if (fromButton) toast({ kind: 'info', title: (err as { code?: number }).code === 1 ? 'Location is blocked for this site. You can allow it in your browser settings.' : 'Couldn’t get your exact location. You’re at an approximate spot.' });
        // Without a precise fix, the Locate button brings me back to my start point.
        if (fromButton)
          whenMap((m) => {
            const mine = m.myPosition();
            if (mine) m.flyTo(mine.lng, mine.lat, Math.max(m.getZoom(), SPAWN_ZOOM.ip));
          });
      } finally {
        setLocating(false);
      }
    },
    [toast, whenMap],
  );

  useEffect(() => {
    if (spawnStarted.current) return;
    spawnStarted.current = true;
    // A "Visit" link (?visit=plot-slug, G5): fly to the plot and start me right next to it (just south of its edge).
    const visit = params.get('visit');
    if (visit && /^[a-z0-9-]{1,80}$/.test(visit)) {
      void fetch(`/api/v1/plots/${visit}`)
        .then((r) => (r.ok ? (r.json() as Promise<{ plot: Plot }>) : null))
        .then((d) => {
          if (!d) return;
          const b = d.plot.bounds;
          const beside = { lat: b.south - (b.north - b.south) * 0.35, lng: (b.west + b.east) / 2 };
          whenMap((m) => m.startMeAt(beside.lng, beside.lat));
          whenMap((m) => m.fitBounds(b, 17));
          setOpenPlot(d.plot.id);
          setSpawn({ source: 'link', lat: beside.lat, lng: beside.lng, zoom: 17, approximate: false });
        })
        .catch(() => undefined);
      return;
    }
    // An explicit ?at= link is a place to be: start me there and don't move me away.
    if (initialView) {
      whenMap((m) => m.startMeAt(initialView.lng, initialView.lat));
      setSpawn({ source: 'link', lat: initialView.lat, lng: initialView.lng, zoom: initialView.zoom, approximate: false });
      return;
    }
    const deepLink = !!(params.get('plot') || params.get('claim'));
    const device = readDevicePos();
    let cancelled = false;
    void (async () => {
      const ask = () =>
        fetch('/api/v1/me/approx-location', { credentials: 'include' })
          .then((r) => (r.ok ? (r.json() as Promise<ServerStart>) : null))
          .catch(() => null);
      // One retry: a hiccup (or a rate limit) must not drop a returning player to the Home plaza.
      const server = (await ask()) ?? (await new Promise<void>((r) => setTimeout(r, 1200)).then(ask));
      if (cancelled) return;
      const s = pickSpawn({ server, device });
      // A deep link (?at=, ?plot=, ?claim=) decides the camera; I still start at my own spot, not the link's.
      whenMap((m) => m.startMeAt(s.lng, s.lat));
      const free = !deepLink && !params.get('dm');
      // The first view is placed at once: a flight from the globe would draw hundreds of frames while the page loads.
      if (free) whenMap((m) => m.jumpTo(s.lng, s.lat, s.zoom));
      setSpawn(s);
      if (!wantsPrecise(s)) return;
      const consent = geoConsent();
      const perm = await geoPermission();
      if (cancelled) return;
      const autoPrecise = perm !== 'denied' && (consent === 'granted' || perm === 'granted');
      // A new visitor somewhere without plots would look at an empty map: show the nearest group of plots (M2),
      // unless their precise location is about to move the camera (or does so while this runs).
      if (free && !autoPrecise && (s.source === 'ip' || s.source === 'country')) {
        void showNearestContent(s, (fn) => !cancelled && !preciseMoved.current && whenMap(fn)).then((n) => !cancelled && n && setNearestNote(n));
      }
      if (perm === 'denied') return;
      if (autoPrecise) void goPrecise(false);
      else if (consent !== 'declined') setAskGeo(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [initialView, params, goPrecise, whenMap]);

  // Deep links: ?plot=slug, ?claim=minGx,minGy,maxGx,maxGy
  useEffect(() => {
    const slug = params.get('plot');
    if (slug) {
      fetch(`/api/v1/plots/${slug}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { plot: Plot } | null) => {
          if (!d) return;
          setOpenPlot(d.plot.id);
          setTimeout(() => whenMap((m) => m.fitBounds(d.plot.bounds, 16)), 400);
        })
        .catch(() => undefined);
    }
    const claim = params.get('claim')?.split(',').map(Number);
    if (claim && claim.length === 4 && claim.every(Number.isFinite)) {
      const rect = { minGx: claim[0]!, minGy: claim[1]!, maxGx: claim[2]!, maxGy: claim[3]! };
      const c = rectCenter(rect);
      setClaimMode(true);
      setSelection(rect);
      setTimeout(() => whenMap((m) => m.flyTo(c.lng, c.lat, 16)), 400);
    }
  }, [params, whenMap]);

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
      {/* Until the map has drawn, the server-rendered first screen stays behind the controls (M2). */}
      {!mapReady && <HomeFirstPaint stats={stats} behind />}
      {webgl === false && <NoWebglNotice />}
      {webgl && (
      <WorldMap
        ref={map}
        onReady={onMapReady}
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
      )}

      {/* Top bar */}
      <header className="absolute top-0 inset-x-0 z-40 p-3 flex items-center gap-2 pointer-events-none">
        {/* M3: the site menu (Sign in, every section, Replay tour) on phones and tablets, next to the logo. */}
        <NavMenu className="pointer-events-auto lg:hidden shrink-0" onReplayTour={tour.start} />
        <Link href="/" className="pointer-events-auto glass rounded-full h-11 min-w-11 px-2.5 flex items-center shrink-0" aria-label="FlatMeta home">
          <Logo size={26} withText={false} />
          <span className="hidden sm:inline font-display font-bold ml-2">FlatMeta</span>
        </Link>
        <button data-tour="search" onClick={() => setSearchOpen(true)} className="pointer-events-auto glass rounded-full h-11 flex-1 min-w-0 max-w-xl flex items-center gap-2 px-3 sm:px-4 text-left text-sm muted hover:text-[var(--text)]">
          <Search size={16} className="shrink-0" />
          <span className="truncate min-w-0">{t('hud.search')}</span>
          <span className="ml-auto shrink-0 chip chip-violet h-6"><Sparkles size={11} /> AI</span>
          <kbd className="hidden md:inline text-xs border border-[var(--line-strong)] rounded px-1.5 py-0.5">⌘K</kbd>
        </button>
        <nav className="hidden lg:flex pointer-events-auto glass rounded-full h-11 items-center px-2 text-sm">
          <Link href="/explore" className="tap px-3 rounded-full hover:bg-white/5">{t('nav.explore')}</Link>
          <Link href="/leaderboards" className="tap px-3 rounded-full hover:bg-white/5">{t('nav.leaderboards')}</Link>
          <Link href="/business" className="tap px-3 rounded-full hover:bg-white/5">{t('nav.business')}</Link>
        </nav>
        <div className="ml-auto pointer-events-auto">
          <UserMenu />
        </div>
      </header>

      {/* Right rail: quests + live */}
      {!openPlot && !claimMode && (
        <div className="absolute z-20 right-3 top-[72px] w-80 space-y-3 hidden md:block max-h-[calc(100dvh-200px)] overflow-y-auto overscroll-contain rounded-2xl">
          <QuestTracker />
          <LiveTicker onSelect={onActivity} />
        </div>
      )}
      {mobilePanel && !openPlot && !claimMode && (
        <div className="md:hidden absolute z-20 inset-x-3 top-[72px] bottom-40 space-y-3 overflow-y-auto animate-rise">
          <QuestTracker />
          <LiveTicker onSelect={(a) => { setMobilePanel(false); onActivity(a); }} />
        </div>
      )}

      {/* Start where you are? (asked once, in the app, before the browser's own prompt) */}
      {askGeo && !claimMode && (
        <div className="absolute z-30 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 top-[64px] sm:top-[156px] sm:w-[22rem] glass rounded-2xl p-3 animate-pop" role="dialog" aria-label="Start where you are?">
          <div className="flex items-start gap-3">
            <span className="size-9 shrink-0 rounded-xl grid place-items-center bg-[rgb(45_226_196/.12)] text-[var(--color-teal)]"><MapPin size={18} /></span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">Start where you are?</div>
              <p className="text-xs muted mt-0.5">We’ll move your avatar to your exact spot. Your location stays on your device{me.user ? ' and your last map position is saved to your account' : ''}.</p>
              <div className="flex gap-2 mt-2">
                <button className="btn-primary btn-sm" onClick={() => void goPrecise(true)}>Use my location</button>
                <button className="btn-ghost btn-sm" onClick={() => { setGeoConsent('declined'); setAskGeo(false); }}>Not now</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Status chips under the search bar, stacked so they never overlap. */}
      {!askGeo && !claimMode && (spawn?.approximate || nearestNote) && (
        <div className="absolute z-20 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 top-[64px] sm:top-[156px] flex flex-col items-start sm:items-center gap-2 pointer-events-none">
          {spawn?.approximate && (
            <button className="pointer-events-auto glass rounded-full min-h-11 px-3 text-xs inline-flex items-center gap-1.5 max-w-full" onClick={() => void goPrecise(true)}>
              <MapPin size={12} className="shrink-0" /> <span className="truncate">{spawn.source === 'home' ? 'Starting at FlatMeta Home' : `Approximate location${spawn.city ? ` · ${spawn.city}` : ''}`}</span>
              <span className="underline shrink-0">Use precise</span>
            </button>
          )}
          {nearestNote && (
            <p role="status" className="pointer-events-auto glass rounded-full min-h-11 pl-3 pr-1 text-xs inline-flex items-center gap-1.5 max-w-full" data-testid="nearest-land">
              <MapPin size={12} className="shrink-0 text-[var(--color-teal)]" />
              <span className="truncate">Nearest land: {nearestNote.place}, {nearestNote.km < 10 ? nearestNote.km.toFixed(1) : Math.round(nearestNote.km).toLocaleString('en')} km</span>
              <button type="button" className="icon-btn size-9 shrink-0" aria-label="Dismiss" onClick={() => setNearestNote(null)}><X size={14} /></button>
            </p>
          )}
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

      {/* M4: one bottom control bar. Everything in it is in normal flow, inside the safe areas, so no control can
          cover another at any screen size: on phones the left and right columns sit above a centre row (levels, then
          Claim land); on wide or short (landscape) screens the three share one row. */}
      <div
        className="absolute z-20 inset-x-0 bottom-0 px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pl-[calc(env(safe-area-inset-left)+12px)] pr-[calc(env(safe-area-inset-right)+12px)] pointer-events-none flex flex-col gap-2 sm:flex-row sm:items-end [@media(max-height:500px)]:flex-row [@media(max-height:500px)]:items-end"
        data-testid="map-controls"
      >
        <div className="flex items-end justify-between gap-2 sm:contents [@media(max-height:500px)]:contents">
          {/* Left: zoom (hidden in walk mode on touch screens: pinch zooms), locate, help, the joystick in walk mode. */}
          <div className="pointer-events-auto flex flex-col items-start gap-2 sm:order-1 [@media(max-height:500px)]:order-1">
            <div className={clsx('glass rounded-2xl flex flex-col', walking && 'hidden')}>
              <button className="icon-btn" onClick={() => map.current?.zoomBy(1)} aria-label={t('hud.zoomIn')}><Plus size={18} /></button>
              <button className="icon-btn" onClick={() => map.current?.zoomBy(-1)} aria-label={t('hud.zoomOut')}><Minus size={18} /></button>
            </div>
            <button className="glass rounded-2xl icon-btn" aria-label={t('hud.locate')} onClick={() => void goPrecise(true)} disabled={locating}>
              {locating ? <Spinner /> : <LocateFixed size={18} />}
            </button>
            <HelpMenu onReplayTour={tour.start} />
            {walking && <Joystick onStick={(x, y) => map.current?.setJoystick(x, y)} />}
          </div>
          {/* Right: emotes (walk mode), quests (phones), chat, map attribution. */}
          <div className="pointer-events-auto flex flex-col items-end gap-2 sm:order-3 [@media(max-height:500px)]:order-3">
            <WalkControls visible={!claimMode && zoom >= AVATAR_MIN_ZOOM} onEmote={(e) => live.sendEmote(e)} />
            {!openPlot && !claimMode && (
              <button
                data-tour="quests"
                className={clsx('md:hidden glass rounded-full size-11 grid place-items-center', mobilePanel && 'text-[var(--color-teal)]')}
                onClick={() => setMobilePanel((p) => !p)}
                aria-label="Quests and live activity"
                aria-expanded={mobilePanel}
              >
                {mobilePanel ? <X size={18} /> : <Flag size={18} />}
              </button>
            )}
            {!claimMode && (
              <ErrorBoundary
                name="ChatPanel"
                fallback={<p role="alert" className="glass rounded-2xl px-3 py-2 text-xs">Chat is unavailable. <button className="underline min-h-11" onClick={() => location.reload()}>Reload</button></p>}
              >
                <ChatPanel inline position={() => map.current?.myPosition() ?? { ...center.current }} openWith={chatWith} onOpenedWith={() => setChatWith(null)} />
              </ErrorBoundary>
            )}
            <MapAttribution />
          </div>
        </div>
        {/* Centre: the three levels, then the primary action. */}
        {!claimMode && (
          <div className="pointer-events-auto flex flex-col items-center gap-2 sm:order-2 sm:flex-1 [@media(max-height:500px)]:order-2 [@media(max-height:500px)]:flex-1">
            <LevelSwitch zoom={zoom} onPick={pickLevel} />
            {!openPlot && (
              <button data-tour="claim" className="btn-primary btn-lg shadow-2xl animate-pulse-ring" onClick={startClaim}>
                <Compass size={18} /> {t('hud.claimLand')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bottom stats pill */}
      <div className="absolute z-10 left-1/2 -translate-x-1/2 top-[70px] hidden sm:flex glass rounded-full h-8 px-3 items-center gap-3 text-xs pointer-events-none">
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-[var(--color-coral)] animate-pulse" /> {t('hud.online', { count: compact(Math.max(online, 1)) })}</span>
        {stats && <span className="muted">{compact(stats.plots + stats.showcase)} plots · {stats.countries} countries</span>}
      </div>


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

      {searchOpen && (
      <SearchPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onFlyTo={(lng, lat, z) => map.current?.flyTo(lng, lat, z)}
        onPlot={(p) => {
          setOpenPlot(p.id);
          map.current?.fitBounds(p.bounds, 16);
        }}
      />
      )}
      {tour.open && <Tour open onClose={tour.close} />}

      {/* Left column (desktop): the welcome card for guests, then the nearest places to see (G3). */}
      {/* Capped in height so it never covers the map controls in the bottom-left corner. */}
      {!claimMode && !openPlot && (
        <div className="absolute z-20 left-3 top-[72px] w-80 hidden sm:flex flex-col gap-2 max-h-[calc(100dvh-380px)] overflow-y-auto overscroll-contain rounded-2xl [&>*]:shrink-0">
      {!me.user && (
        <div className="glass rounded-2xl p-4 animate-rise">
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
          <HappeningNow
            onOpen={(id, at) => {
              setOpenPlot(id);
              map.current?.flyTo(at.lng, at.lat, 17);
            }}
          />
          <NearbyCard
            at={spawn && spawn.source !== 'link' ? { lat: spawn.lat, lng: spawn.lng } : null}
            onOpen={(p) => {
              setOpenPlot(p.id);
              map.current?.fitBounds(p.bounds, 16);
            }}
          />
        </div>
      )}
    </div>
  );
}
