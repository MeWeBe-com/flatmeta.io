/**
 * The live socket (M9): one per tab, whatever mounts and remounts above it.
 *  - It connects for one identity (guest or a user id) once the session is known; a new identity replaces it.
 *  - A socket that is still connecting is never closed (that is what the browser logs as "WebSocket … failed"):
 *    a release while CONNECTING closes it as soon as it opens.
 *  - Reconnects back off exponentially with ±30 % jitter, capped at 30 s, and wait while the tab is hidden or the
 *    device is offline; coming back (visibilitychange / online) reconnects at once.
 *  - Close codes and reasons are logged in development.
 */
export interface LiveHandlers {
  onOpen: (ws: WebSocket) => void;
  onMessage: (data: string) => void;
  onClose: () => void;
}

export interface LiveEnv {
  WebSocket: typeof WebSocket;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (t: unknown) => void;
  random: () => number;
  hidden: () => boolean;
  online: () => boolean;
  on: (target: 'document' | 'window', ev: string, fn: () => void) => () => void;
  log: (msg: string) => void;
}

export const BASE_DELAY = 1000;
export const MAX_DELAY = 30_000;

/** Delay before reconnect attempt n (0-based): 1 s, 2 s, 4 s … capped at 30 s, each ±30 %. */
export function backoff(attempt: number, random: () => number) {
  const base = Math.min(MAX_DELAY, BASE_DELAY * 2 ** attempt);
  return Math.round(Math.min(MAX_DELAY, base * (0.7 + random() * 0.6)));
}

export class LiveSocket {
  private ws: WebSocket | null = null;
  private identity: string | null = null;
  private handlers: LiveHandlers | null = null;
  private attempt = 0;
  private timer: unknown = null;
  private stopped = true;
  private unlisten: (() => void)[] = [];
  private pendingStop: unknown = null;
  /** How many sockets this tab has created (tests: "exactly one socket"). */
  created = 0;

  constructor(
    private url: string,
    private env: LiveEnv,
  ) {}

  /** Connect as `identity` (reusing the current socket if it is for the same identity and still alive). */
  start(identity: string, handlers: LiveHandlers) {
    this.handlers = handlers;
    // A remount (stop then start in the same tick): keep the socket we have, even if it is still connecting.
    if (this.pendingStop !== null) {
      this.env.clearTimeout(this.pendingStop);
      this.pendingStop = null;
      if (this.identity === identity && !this.stopped) {
        if (this.ws?.readyState === 1) handlers.onOpen(this.ws);
        return;
      }
    }
    if (!this.stopped && this.identity === identity && this.ws && this.ws.readyState <= 1) return;
    this.release();
    this.identity = identity;
    this.stopped = false;
    this.attempt = 0;
    const wake = () => this.wake();
    this.unlisten = [this.env.on('document', 'visibilitychange', wake), this.env.on('window', 'online', wake)];
    this.connect();
  }

  /**
   * Stop: no more reconnects; a socket that is still connecting is closed once it has opened. Deferred by a tick,
   * so an unmount followed at once by a mount (React re-mounting the provider) keeps the same socket.
   */
  stop() {
    if (this.pendingStop !== null) return;
    this.pendingStop = this.env.setTimeout(() => {
      this.pendingStop = null;
      this.stopped = true;
      this.release();
    }, 0);
  }

  send(text: string) {
    if (this.ws?.readyState === 1) this.ws.send(text);
  }

  get socket() {
    return this.ws;
  }

  private release() {
    for (const off of this.unlisten) off();
    this.unlisten = [];
    if (this.timer !== null) this.env.clearTimeout(this.timer);
    this.timer = null;
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
    if (ws.readyState === 0) ws.onopen = () => ws.close(1000, 'replaced');
    else if (ws.readyState === 1) ws.close(1000, 'replaced');
  }

  private wake() {
    if (this.stopped || this.env.hidden() || !this.env.online()) return;
    if (this.ws && this.ws.readyState <= 1) return;
    if (this.timer !== null) this.env.clearTimeout(this.timer);
    this.timer = null;
    this.attempt = 0;
    this.connect();
  }

  private connect() {
    this.timer = null;
    if (this.stopped) return;
    // Hidden tab or offline: wait for visibilitychange / online instead of retrying in the background.
    if (this.env.hidden() || !this.env.online()) return;
    const ws = new this.env.WebSocket(this.url);
    this.created++;
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.handlers?.onOpen(ws);
    };
    ws.onmessage = (ev) => this.handlers?.onMessage(String(ev.data));
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.env.log(`live socket closed: code ${ev.code}${ev.reason ? ` (${ev.reason})` : ''}`);
      this.handlers?.onClose();
      if (this.stopped) return;
      const delay = backoff(this.attempt++, this.env.random);
      this.timer = this.env.setTimeout(() => this.connect(), delay);
    };
  }
}

let shared: LiveSocket | null = null;

/** The tab's live socket (created on first use). */
export function liveSocket(url: string): LiveSocket {
  if (shared) return shared;
  const dev = process.env.NODE_ENV !== 'production';
  shared = new LiveSocket(url, {
    WebSocket,
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (t) => window.clearTimeout(t as number),
    random: Math.random,
    hidden: () => document.visibilityState === 'hidden',
    online: () => navigator.onLine !== false,
    on: (target, ev, fn) => {
      const t = target === 'document' ? document : window;
      t.addEventListener(ev, fn);
      return () => t.removeEventListener(ev, fn);
    },
    log: (msg) => {
      if (dev) console.info(msg);
    },
  });
  return shared;
}
