import { describe, expect, it } from 'vitest';
import { BASE_DELAY, LiveSocket, MAX_DELAY, backoff, type LiveEnv } from '../../src/lib/live-socket';

/** M9: one socket per tab, never closed while connecting, jittered backoff capped at 30 s, paused while hidden. */
class FakeWS {
  static all: FakeWS[] = [];
  readyState = 0;
  closed: { code?: number; reason?: string } | null = null;
  onopen: (() => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  constructor(public url: string) {
    FakeWS.all.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  fail(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code, reason: '' });
  }
  close(code?: number, reason?: string) {
    this.closed = { code, reason };
    this.readyState = 3;
  }
  send(t: string) {
    this.sent.push(t);
  }
}

function env(over: Partial<LiveEnv> = {}) {
  const timers: { fn: () => void; ms: number; id: number }[] = [];
  let id = 0;
  const listeners: Record<string, (() => void)[]> = {};
  const state = { hidden: false, online: true, logs: [] as string[] };
  const e: LiveEnv = {
    WebSocket: FakeWS as unknown as typeof WebSocket,
    setTimeout: (fn, ms) => {
      timers.push({ fn, ms, id: ++id });
      return id;
    },
    clearTimeout: (t) => {
      const i = timers.findIndex((x) => x.id === t);
      if (i >= 0) timers.splice(i, 1);
    },
    random: () => 0.5,
    hidden: () => state.hidden,
    online: () => state.online,
    on: (_t, ev, fn) => {
      (listeners[ev] ??= []).push(fn);
      return () => (listeners[ev] = listeners[ev]!.filter((f) => f !== fn));
    },
    log: (m) => state.logs.push(m),
    ...over,
  };
  const runTimers = () => {
    while (timers.length) timers.shift()!.fn();
  };
  const fire = (ev: string) => (listeners[ev] ?? []).forEach((f) => f());
  return { e, timers, runTimers, fire, state };
}
const handlers = () => ({ opened: 0, closed: 0, onOpen() { this.opened++; }, onMessage() {}, onClose() { this.closed++; } });

describe('live socket', () => {
  it('backs off 1 s, 2 s, 4 s … with ±30 % jitter, never above 30 s', () => {
    expect(backoff(0, () => 0.5)).toBe(BASE_DELAY);
    expect(backoff(1, () => 0.5)).toBe(2000);
    expect(backoff(0, () => 0)).toBe(700);
    expect(backoff(0, () => 1)).toBe(1300);
    for (let n = 0; n < 30; n++) expect(backoff(n, Math.random)).toBeLessThanOrEqual(MAX_DELAY);
    expect(backoff(20, () => 0)).toBe(21_000);
  });

  it('keeps one socket across a remount, even while it is still connecting', () => {
    FakeWS.all = [];
    const { e, runTimers } = env();
    const s = new LiveSocket('wss://x/live', e);
    s.start('guest', handlers());
    s.stop(); // React unmounts…
    s.start('guest', handlers()); // …and mounts again in the same tick
    runTimers();
    expect(FakeWS.all).toHaveLength(1);
    expect(FakeWS.all[0]!.closed).toBeNull(); // never closed while connecting
  });

  it('a stop while connecting closes the socket only once it has opened (no "failed" handshake)', () => {
    FakeWS.all = [];
    const { e, runTimers } = env();
    const s = new LiveSocket('wss://x/live', e);
    s.start('guest', handlers());
    s.stop();
    runTimers();
    const ws = FakeWS.all[0]!;
    expect(ws.closed).toBeNull();
    ws.open();
    expect(ws.closed).toEqual({ code: 1000, reason: 'replaced' });
  });

  it('reconnects after a drop with backoff, logs the close code, and resets the backoff once open', () => {
    FakeWS.all = [];
    const { e, timers, runTimers, state } = env();
    const s = new LiveSocket('wss://x/live', e);
    const h = handlers();
    s.start('guest', h);
    FakeWS.all[0]!.fail(1006);
    expect(state.logs).toEqual(['live socket closed: code 1006']);
    expect(timers.map((t) => t.ms)).toEqual([1000]);
    runTimers();
    FakeWS.all[1]!.fail(1011);
    expect(timers.map((t) => t.ms)).toEqual([2000]);
    runTimers();
    FakeWS.all[2]!.open();
    expect(h.opened).toBe(1);
    FakeWS.all[2]!.fail();
    expect(timers.map((t) => t.ms)).toEqual([1000]);
  });

  it('waits while the tab is hidden or offline, and reconnects at once when it comes back', () => {
    FakeWS.all = [];
    const { e, timers, runTimers, fire, state } = env();
    const s = new LiveSocket('wss://x/live', e);
    s.start('guest', handlers());
    state.hidden = true;
    FakeWS.all[0]!.fail();
    runTimers();
    expect(FakeWS.all).toHaveLength(1); // no retries in the background
    expect(timers).toHaveLength(0);
    state.hidden = false;
    fire('visibilitychange');
    expect(FakeWS.all).toHaveLength(2);
    FakeWS.all[1]!.open();
    state.online = false;
    FakeWS.all[1]!.fail();
    runTimers();
    expect(FakeWS.all).toHaveLength(2);
    state.online = true;
    fire('online');
    expect(FakeWS.all).toHaveLength(3);
  });

  it('a new identity (sign in) replaces the socket', () => {
    FakeWS.all = [];
    const { e, runTimers } = env();
    const s = new LiveSocket('wss://x/live', e);
    s.start('guest', handlers());
    FakeWS.all[0]!.open();
    s.stop();
    s.start('user-1', handlers());
    runTimers();
    expect(FakeWS.all).toHaveLength(2);
    expect(FakeWS.all[0]!.closed).toEqual({ code: 1000, reason: 'replaced' });
  });
});
