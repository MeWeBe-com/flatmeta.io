import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { db, pool, schema } from '../src/db/client.js';
import { closeRedis, redis } from '../src/lib/redis.js';
import type { App } from '../src/app.js';
import { getApp, login } from './helpers.js';

let app: App;
let base = '';
beforeAll(async () => {
  app = await getApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  base = `ws://127.0.0.1:${(app.server.address() as { port: number }).port}/v1/live`;
});
afterAll(async () => {
  await app.close();
  await pool.end();
  await closeRedis();
});
const json = (res: { body: string }) => JSON.parse(res.body);

type Msg = { type: string; [k: string]: unknown };
async function client(cookie?: string) {
  const ws = new WebSocket(base, { headers: cookie ? { cookie } : {} });
  const inbox: Msg[] = [];
  ws.on('message', (d) => inbox.push(JSON.parse(d.toString())));
  await new Promise((r) => ws.once('open', r));
  const waitFor = async (pred: (m: Msg) => boolean, ms = 6000): Promise<Msg> => {
    const t0 = Date.now();
    for (;;) {
      const hit = inbox.find(pred);
      if (hit) return hit;
      if (Date.now() - t0 > ms) throw new Error(`timeout waiting for message; got ${inbox.map((m) => m.type).join(',')}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  const send = (m: object) => ws.send(JSON.stringify(m));
  return { ws, inbox, waitFor, send, close: () => ws.close() };
}

// Distinct Atlantic spots per test so parallel files can't see each other's avatars.
const A = { lat: -40.0, lng: -30.0 };

describe('presence and avatars', () => {
  it('shows other explorers inside my viewport, with guests anonymous', async () => {
    const alice = await login();
    await db.update(schema.users).set({ avatar: { face: '🦊', color: '#ff8800' }, displayName: 'Alice Fox' }).where((await import('drizzle-orm')).eq(schema.users.id, alice.user.id));
    const a = await client(alice.cookie);
    const guest = await client();
    const welcome = await a.waitFor((m) => m.type === 'welcome');
    expect((welcome.you as { guest: boolean }).guest).toBe(false);
    expect(((await guest.waitFor((m) => m.type === 'welcome')).you as { name: string }).name).toMatch(/^Guest \d{4}$/);

    a.send({ type: 'move', lat: A.lat, lng: A.lng });
    guest.send({ type: 'move', lat: A.lat + 0.01, lng: A.lng + 0.01 });
    guest.send({ type: 'view', bbox: [A.lng - 0.2, A.lat - 0.2, A.lng + 0.2, A.lat + 0.2] });
    const msg = await guest.waitFor((m) => m.type === 'avatars' && (m.avatars as unknown[]).length > 0);
    const seen = (msg.avatars as { name: string; avatar: { face: string } }[]).find((x) => x.name === 'Alice Fox');
    expect(seen?.avatar.face).toBe('🦊');

    // a World-level viewport gets no avatars, just counts
    guest.send({ type: 'view', bbox: [-170, -80, 170, 80] });
    a.close();
    guest.close();
  });
});

describe('connections and chat', () => {
  it('lets only connected players talk privately, with block and moderation', async () => {
    const alice = await login();
    const bob = await login();
    const cara = await login();

    // no connection yet: no DM
    const denied = await app.inject({ method: 'POST', url: `/v1/chat/dm/${bob.user.username}`, headers: alice.headers, payload: { body: 'hi' } });
    expect(denied.statusCode).toBe(403);

    const req = json(await app.inject({ method: 'POST', url: '/v1/connections', headers: alice.headers, payload: { username: bob.user.username } }));
    expect(req.status).toBe('pending');
    const incoming = json(await app.inject({ url: '/v1/connections', headers: bob.headers })).incoming;
    expect(incoming).toHaveLength(1);
    await app.inject({ method: 'POST', url: `/v1/connections/${incoming[0].connectionId}/accept`, headers: bob.headers });
    expect(json(await app.inject({ url: `/v1/users/${bob.user.username}/relation`, headers: alice.headers })).status).toBe('accepted');

    // live DM over WebSockets; cara (not connected) must not receive it
    const a = await client(alice.cookie);
    const b = await client(bob.cookie);
    const c = await client(cara.cookie);
    await Promise.all([a, b, c].map((x) => x.waitFor((m) => m.type === 'welcome')));
    a.send({ type: 'chat', scope: 'dm', to: bob.user.username, body: 'Hello Bob, nice plot!' });
    const got = await b.waitFor((m) => m.type === 'chat');
    expect((got.message as { body: string }).body).toBe('Hello Bob, nice plot!');
    await a.waitFor((m) => m.type === 'chat'); // sender sees their own message too
    await new Promise((r) => setTimeout(r, 300));
    expect(c.inbox.some((m) => m.type === 'chat')).toBe(false);

    const hist = json(await app.inject({ url: `/v1/chat/dm/${alice.user.username}`, headers: bob.headers }));
    expect(hist.messages.map((m: { body: string }) => m.body)).toContain('Hello Bob, nice plot!');

    // moderation: blocklisted text is refused and never delivered
    a.send({ type: 'chat', scope: 'dm', to: bob.user.username, body: 'double your bitcoin now' });
    const err = await a.waitFor((m) => m.type === 'error');
    expect(String(err.message)).toMatch(/can.t be sent/);

    // blocking ends the chat
    await app.inject({ method: 'POST', url: `/v1/users/${alice.user.username}/block`, headers: bob.headers });
    const afterBlock = await app.inject({ method: 'POST', url: `/v1/chat/dm/${bob.user.username}`, headers: alice.headers, payload: { body: 'still there?' } });
    expect(afterBlock.statusCode).toBe(403);
    a.close(); b.close(); c.close();
  });

  it('delivers nearby chat only to people within 2 km, and guests can read but not write', async () => {
    const alice = await login();
    const near = await client();
    const far = await client();
    const a = await client(alice.cookie);
    await Promise.all([near, far, a].map((x) => x.waitFor((m) => m.type === 'welcome')));
    const spot = { lat: -41.0, lng: -31.0 };
    a.send({ type: 'move', lat: spot.lat, lng: spot.lng });
    near.send({ type: 'move', lat: spot.lat + 0.005, lng: spot.lng }); // ~0.5 km
    far.send({ type: 'move', lat: spot.lat + 0.5, lng: spot.lng }); // ~55 km
    await new Promise((r) => setTimeout(r, 400));
    a.send({ type: 'chat', scope: 'nearby', body: 'Anyone around?' });
    const hit = await near.waitFor((m) => m.type === 'chat');
    expect((hit.message as { body: string }).body).toBe('Anyone around?');
    await new Promise((r) => setTimeout(r, 300));
    expect(far.inbox.some((m) => m.type === 'chat')).toBe(false);

    near.send({ type: 'chat', scope: 'nearby', body: 'hello from a guest' });
    const e = await near.waitFor((m) => m.type === 'error');
    expect(e.code).toBe('sign_in');

    const hist = json(await app.inject({ url: `/v1/chat/nearby?lat=${spot.lat}&lng=${spot.lng}` }));
    expect(hist.messages.some((m: { body: string }) => m.body === 'Anyone around?')).toBe(true);
    a.close(); near.close(); far.close();
  });

  it('rate limits chat to 5 messages per 10 seconds', async () => {
    const alice = await login();
    const bob = await login();
    await app.inject({ method: 'POST', url: '/v1/connections', headers: alice.headers, payload: { username: bob.user.username } });
    const inc = json(await app.inject({ url: '/v1/connections', headers: bob.headers })).incoming[0];
    await app.inject({ method: 'POST', url: `/v1/connections/${inc.connectionId}/accept`, headers: bob.headers });
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) codes.push((await app.inject({ method: 'POST', url: `/v1/chat/dm/${bob.user.username}`, headers: alice.headers, payload: { body: `msg ${i}` } })).statusCode);
    expect(codes.slice(0, 5).every((c) => c === 200)).toBe(true);
    expect(codes.slice(5).every((c) => c === 400)).toBe(true);
  });
});

describe('notifications fan-out', () => {
  it('pushes follow, connection request, accept and DM notifications live and stores them', async () => {
    const ana = await login();
    const ben = await login();
    const a = await client(ana.cookie);
    const b = await client(ben.cookie);
    await Promise.all([a, b].map((x) => x.waitFor((m) => m.type === 'welcome')));
    // The per-user channel is subscribed on connect.
    const h = json(await app.inject({ url: '/v1/live/health' }));
    expect(h.ok).toBe(true);
    expect(h.userChannels).toBeGreaterThanOrEqual(2);
    expect(h.notifyChannelPattern).toMatch(/:notify:<userId>$/);

    const kinds = (x: { inbox: Msg[] }) => x.inbox.filter((m) => m.type === 'notification').map((m) => (m.notification as { kind: string }).kind);
    await app.inject({ method: 'POST', url: `/v1/users/${ben.user.username}/follow`, headers: ana.headers });
    const f = await b.waitFor((m) => m.type === 'notification' && (m.notification as { kind: string }).kind === 'follow');
    expect((f.notification as { id: string; payload: { fromUsername: string } }).payload.fromUsername).toBe(ana.user.username);
    expect((f.notification as { id: string }).id).toBeTruthy();

    await app.inject({ method: 'POST', url: '/v1/connections', headers: ana.headers, payload: { username: ben.user.username } });
    const r = await b.waitFor((m) => m.type === 'notification' && (m.notification as { kind: string }).kind === 'connection_request');
    const connectionId = (r.notification as { payload: { connectionId: string } }).payload.connectionId;
    await app.inject({ method: 'POST', url: `/v1/connections/${connectionId}/accept`, headers: ben.headers });
    await a.waitFor((m) => m.type === 'notification' && (m.notification as { kind: string }).kind === 'connection_accepted');

    // Two DMs from the same sender collapse into one unread notification with a count.
    a.send({ type: 'chat', scope: 'dm', to: ben.user.username, body: 'first' });
    await b.waitFor((m) => m.type === 'chat' && (m.message as { body: string }).body === 'first');
    a.send({ type: 'chat', scope: 'dm', to: ben.user.username, body: 'second' });
    const chat = await b.waitFor((m) => m.type === 'chat' && (m.message as { body: string }).body === 'second');
    expect((chat.message as { senderUsername: string; toUsername: string }).senderUsername).toBe(ana.user.username);
    expect((chat.message as { toUsername: string }).toUsername).toBe(ben.user.username);
    await b.waitFor(() => kinds(b).filter((k) => k === 'dm').length === 2);

    const list = json(await app.inject({ url: '/v1/me/notifications', headers: ben.headers })).notifications as { kind: string; payload: { count?: number } }[];
    expect(list.map((n) => n.kind)).toEqual(expect.arrayContaining(['follow', 'connection_request', 'dm']));
    expect(list.filter((n) => n.kind === 'dm')).toHaveLength(1);
    expect(list.find((n) => n.kind === 'dm')!.payload.count).toBe(2);
    expect(json(await app.inject({ url: '/v1/me', headers: ben.headers })).unreadNotifications).toBe(3);

    // Closing the sockets releases the user channels.
    a.close();
    b.close();
    await new Promise((res) => setTimeout(res, 300));
    expect(json(await app.inject({ url: '/v1/live/health' })).userChannels).toBe(h.userChannels - 2);
  });
});

describe('redis reconnects', () => {
  it('keeps delivering notifications after the publisher and subscriber connections drop', async () => {
    const ana = await login();
    const ben = await login();
    const b = await client(ben.cookie);
    await b.waitFor((m) => m.type === 'welcome');
    // Wait until Ben's user channel is subscribed.
    for (let i = 0; i < 40 && json(await app.inject({ url: '/v1/live/health' })).userChannels < 1; i++) await new Promise((r) => setTimeout(r, 50));
    await app.inject({ method: 'POST', url: `/v1/users/${ben.user.username}/follow`, headers: ana.headers }); // opens the publisher

    // Kill this process's pub and sub connections server-side, like a Redis restart or an idle timeout would.
    const list = String(await redis.client('LIST'));
    const ids = list
      .split('\n')
      .filter((l) => new RegExp(`name=\\S+:(pub|sub):${process.pid}(\\s|$)`).test(l))
      .map((l) => /\bid=(\d+)/.exec(l)![1]!);
    expect(ids.length).toBe(2);
    for (const id of ids) await redis.client('KILL', 'ID', id);

    // The hub comes back by itself (reconnect + automatic re-subscribe) …
    let h = { ok: false };
    for (let i = 0; i < 60 && !h.ok; i++) {
      await new Promise((r) => setTimeout(r, 100));
      h = json(await app.inject({ url: '/v1/live/health' }));
    }
    expect(h.ok).toBe(true);
    // … and a notification published after the drop still reaches Ben's open socket.
    await app.inject({ method: 'POST', url: '/v1/connections', headers: ana.headers, payload: { username: ben.user.username } });
    await b.waitFor((m) => m.type === 'notification' && (m.notification as { kind: string }).kind === 'connection_request', 8000);
    b.close();
  });
});
