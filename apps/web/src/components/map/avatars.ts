import { Marker, type Map as MLMap } from 'maplibre-gl';
import type { AvatarLook, Peer } from '@/lib/types';

/** Avatars are shown from the City level up (zoom 6.5), so the World level stays a clean globe. */
export const AVATAR_MIN_ZOOM = 6.5;
const POS_KEY = 'fm-pos';
const WALK_VIEWS_PER_SECOND = 0.22; // crossing the screen takes about 4.5 s at any zoom

interface Entry {
  marker: Marker;
  el: HTMLElement;
  bubble: HTMLElement;
  cur: [number, number];
  target: [number, number];
  peer?: Peer;
  bubbleTimer?: ReturnType<typeof setTimeout>;
}

function buildEl(look: AvatarLook | null, name: string, me: boolean): { el: HTMLElement; bubble: HTMLElement } {
  const el = document.createElement('div');
  el.className = `fm-avatar${me ? ' fm-avatar-me' : ''}`;
  el.style.setProperty('--av', look?.color ?? '#8B7CFF');
  const bubble = document.createElement('div');
  bubble.className = 'fm-bubble';
  bubble.setAttribute('role', 'status');
  const face = document.createElement('div');
  face.className = 'fm-face';
  face.textContent = look?.face ?? '🙂';
  if (look?.accessory) {
    const acc = document.createElement('span');
    acc.className = 'fm-acc';
    acc.textContent = look.accessory;
    face.appendChild(acc);
  }
  const label = document.createElement('div');
  label.className = 'fm-name';
  label.textContent = me ? 'You' : name;
  el.append(bubble, face, label);
  return { el, bubble };
}

/** Draws other explorers and my own avatar on the map, moves them smoothly, and lets me walk. */
export class AvatarLayer {
  private peers = new Map<string, Entry>();
  private me: Entry | null = null;
  private look: AvatarLook | null = null;
  private name = 'You';
  private raf = 0;
  private last = 0;
  private walkTarget: [number, number] | null = null;
  private lastEmit = 0;
  private visible = false;
  private reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private keys = new Set<string>();

  constructor(
    private map: MLMap,
    private cb: { onMove: (lat: number, lng: number) => void; onPeerClick: (peer: Peer, el: HTMLElement) => void },
  ) {
    this.raf = requestAnimationFrame(this.tick);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.clearKeys);
  }

  /** The signed-in (or guest) identity drawn for me. */
  setIdentity(look: AvatarLook | null, name: string) {
    this.look = look;
    this.name = name;
    if (this.me) {
      const lngLat = this.me.marker.getLngLat();
      this.removeMe();
      this.placeMe([lngLat.lng, lngLat.lat], false);
    }
  }

  /** Called on every view change: shows or hides avatars by level and puts me on the map the first time. */
  update(zoom: number) {
    const visible = zoom >= AVATAR_MIN_ZOOM;
    if (visible === this.visible) return;
    this.visible = visible;
    for (const e of this.peers.values()) e.el.style.display = visible ? '' : 'none';
    if (this.me) this.me.el.style.display = visible ? '' : 'none';
    if (visible && !this.me) {
      let start: [number, number] | null = null;
      try {
        const saved = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null') as [number, number] | null;
        const b = this.map.getBounds();
        if (saved && saved[0] >= b.getWest() && saved[0] <= b.getEast() && saved[1] >= b.getSouth() && saved[1] <= b.getNorth()) start = saved;
      } catch {
        /* storage unavailable */
      }
      const c = this.map.getCenter();
      this.placeMe(start ?? [c.lng, c.lat], true);
    }
  }

  setPeers(list: Peer[]) {
    const seen = new Set<string>();
    for (const p of list) {
      seen.add(p.id);
      const existing = this.peers.get(p.id);
      if (existing) {
        existing.target = [p.lng, p.lat];
        existing.peer = p;
        continue;
      }
      const { el, bubble } = buildEl(p.avatar, p.name, false);
      el.style.display = this.visible ? '' : 'none';
      el.title = p.name;
      el.setAttribute('role', 'button');
      el.tabIndex = 0;
      el.setAttribute('aria-label', `${p.name}, level ${p.level}`);
      const open = (ev: Event) => {
        ev.stopPropagation();
        const cur = this.peers.get(p.id)?.peer ?? p;
        this.cb.onPeerClick(cur, el);
      };
      el.addEventListener('click', open);
      el.addEventListener('keydown', (ev) => (ev.key === 'Enter' || ev.key === ' ') && open(ev));
      const marker = new Marker({ element: el, anchor: 'bottom' }).setLngLat([p.lng, p.lat]).addTo(this.map);
      this.peers.set(p.id, { marker, el, bubble, cur: [p.lng, p.lat], target: [p.lng, p.lat], peer: p });
    }
    for (const [id, e] of this.peers) {
      if (!seen.has(id)) {
        e.marker.remove();
        if (e.bubbleTimer) clearTimeout(e.bubbleTimer);
        this.peers.delete(id);
      }
    }
  }

  /** Shows a speech bubble over me (key "me") or over the peer with this user id. */
  bubble(userId: string | null, text: string) {
    let entry: Entry | undefined;
    if (userId === null || userId === 'me') entry = this.me ?? undefined;
    else entry = [...this.peers.values()].find((e) => e.peer?.userId === userId);
    if (!entry) return;
    entry.bubble.textContent = text.length > 90 ? `${text.slice(0, 88)}…` : text;
    entry.el.classList.add('fm-talking');
    if (entry.bubbleTimer) clearTimeout(entry.bubbleTimer);
    entry.bubbleTimer = setTimeout(() => entry.el.classList.remove('fm-talking'), 6500);
  }

  position(): { lat: number; lng: number } | null {
    if (!this.me) return null;
    const p = this.me.marker.getLngLat();
    return { lat: p.lat, lng: p.lng };
  }

  /** Walk to a point at a steady pace (tap/click on the ground). */
  walkTo(lng: number, lat: number) {
    if (!this.visible) return;
    if (!this.me) this.placeMe([lng, lat], true);
    this.walkTarget = [lng, lat];
    this.me?.el.classList.add('fm-walking');
  }

  /** Jump (teleport) to a point, e.g. after "fly to my plot". */
  teleport(lng: number, lat: number) {
    this.walkTarget = null;
    if (!this.me) return this.placeMe([lng, lat], true);
    this.me.cur = [lng, lat];
    this.me.target = [lng, lat];
    this.me.marker.setLngLat([lng, lat]);
    this.emit(true);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.clearKeys);
    for (const e of this.peers.values()) e.marker.remove();
    this.peers.clear();
    this.removeMe();
  }

  // ── internals ──

  private placeMe(pos: [number, number], announce: boolean) {
    const { el, bubble } = buildEl(this.look, this.name, true);
    el.style.display = this.visible ? '' : 'none';
    const marker = new Marker({ element: el, anchor: 'bottom' }).setLngLat(pos).addTo(this.map);
    this.me = { marker, el, bubble, cur: pos, target: pos };
    if (announce) this.emit(true);
  }

  private removeMe() {
    if (!this.me) return;
    this.me.marker.remove();
    if (this.me.bubbleTimer) clearTimeout(this.me.bubbleTimer);
    this.me = null;
  }

  private emit(force = false) {
    const now = performance.now();
    if (!this.me || (!force && now - this.lastEmit < 250)) return;
    this.lastEmit = now;
    const [lng, lat] = this.me.cur;
    this.cb.onMove(lat, lng);
    try {
      localStorage.setItem(POS_KEY, JSON.stringify([lng, lat]));
    } catch {
      /* ignore */
    }
  }

  private tick = (t: number) => {
    const dt = Math.min(0.1, this.last ? (t - this.last) / 1000 : 0.016);
    this.last = t;
    // Other explorers glide towards their latest position.
    const k = this.reduceMotion ? 1 : 1 - Math.pow(0.001, dt);
    for (const e of this.peers.values()) {
      if (e.cur[0] === e.target[0] && e.cur[1] === e.target[1]) continue;
      e.cur = [e.cur[0] + (e.target[0] - e.cur[0]) * k, e.cur[1] + (e.target[1] - e.cur[1]) * k];
      if (Math.abs(e.cur[0] - e.target[0]) < 1e-7 && Math.abs(e.cur[1] - e.target[1]) < 1e-7) e.cur = e.target;
      e.marker.setLngLat(e.cur);
    }
    if (this.me && this.visible) this.stepMe(dt);
    this.raf = requestAnimationFrame(this.tick);
  };

  /** Moves my avatar: along a tap target, or with the arrow keys. */
  private stepMe(dt: number) {
    const me = this.me!;
    const b = this.map.getBounds();
    const viewW = b.getEast() - b.getWest();
    const viewH = b.getNorth() - b.getSouth();
    const speed = viewW * WALK_VIEWS_PER_SECOND; // degrees of longitude per second
    let moved = false;
    const dx = (this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('ArrowLeft') ? 1 : 0);
    const dy = (this.keys.has('ArrowUp') ? 1 : 0) - (this.keys.has('ArrowDown') ? 1 : 0);
    if (dx || dy) {
      this.walkTarget = null;
      const len = Math.hypot(dx, dy);
      me.cur = [me.cur[0] + (dx / len) * speed * dt, Math.max(-84, Math.min(84, me.cur[1] + (dy / len) * speed * dt * (viewH / viewW)))];
      moved = true;
    } else if (this.walkTarget) {
      const [tx, ty] = this.walkTarget;
      const vx = tx - me.cur[0];
      const vy = (ty - me.cur[1]) * (viewW / viewH); // compare in screen-ish units
      const dist = Math.hypot(vx, vy);
      const step = speed * dt;
      if (dist <= step || this.reduceMotion) {
        me.cur = [tx, ty];
        this.walkTarget = null;
        me.el.classList.remove('fm-walking');
        this.emit(true);
      } else {
        me.cur = [me.cur[0] + (vx / dist) * step, me.cur[1] + ((vy / dist) * step) * (viewH / viewW)];
      }
      moved = true;
    }
    if (moved) {
      me.marker.setLngLat(me.cur);
      this.emit();
      // Keep the camera with me when I near the edge of the screen.
      const px = this.map.project(me.cur);
      const { clientWidth: w, clientHeight: h } = this.map.getCanvas();
      if (px.x < w * 0.12 || px.x > w * 0.88 || px.y < h * 0.15 || px.y > h * 0.8) this.map.easeTo({ center: me.cur, duration: 600, essential: true });
    }
    if (!moved && me.el.classList.contains('fm-walking')) me.el.classList.remove('fm-walking');
    if (dx || dy) me.el.classList.add('fm-walking');
  }

  private typing = () => {
    const el = document.activeElement as HTMLElement | null;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  };
  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.visible || this.typing() || !e.key.startsWith('Arrow') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.querySelector('[role="dialog"]')) return;
    e.preventDefault();
    this.keys.add(e.key);
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key);
  };
  private clearKeys = () => this.keys.clear();
}
