import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import { eq, inArray } from 'drizzle-orm';
import type { App } from '../app.js';
import { db, schema } from '../db/client.js';
import { flagEmoji, haversineKm } from '../lib/geo.js';
import { key, redis, subscriber } from '../lib/redis.js';
import { LIVE_CHANNEL } from '../game/activity.js';
import { CHAT_CHANNEL, NEARBY_RADIUS_KM, clanRoom, dmRoom, nearbyRoom, sendMessage, type ChatOut } from '../services/chat.js';

/**
 * Real-time hub: online count, live activity, notifications, avatars on the map and chat.
 *
 * Presence lives in Redis so several API processes can share it:
 *   fm:presence          zset  connId → last heartbeat (online count)
 *   fm:presence:geo      geo   connId → position
 *   fm:presence:c:<id>   hash  name, avatar, userId, level, lat, lng   (40 s TTL, refreshed by heartbeat)
 * Each process owns only its own sockets and polls Redis once a second for avatars in each viewport.
 */
const PRESENCE = () => key('presence');
const GEO = () => key('presence', 'geo');
const CONN = (id: string) => key('presence', 'c', id);
const PRESENCE_TTL_MS = 30_000;
const AVATAR_CAP = 200;
const MAX_VIEW_KM = 600; // wider than this is the World level: no avatars, just the count

export async function onlineCount(): Promise<number> {
  const cutoff = Date.now() - PRESENCE_TTL_MS;
  const stale = await redis.zrangebyscore(PRESENCE(), 0, cutoff);
  if (stale.length) {
    await redis.zrem(PRESENCE(), ...stale);
    await redis.zrem(GEO(), ...stale);
  }
  return redis.zcard(PRESENCE());
}

type Activity = typeof schema.activity.$inferSelect;

/** Adds actor names and flags so the ticker can render without extra calls. */
export async function decorateActivity(rows: Activity[]) {
  const ids = [...new Set(rows.map((r) => r.actorUserId).filter((x): x is string => !!x))];
  const users = ids.length ? await db.select({ id: schema.users.id, username: schema.users.username, displayName: schema.users.displayName, avatarUrl: schema.users.avatarUrl, level: schema.users.level }).from(schema.users).where(inArray(schema.users.id, ids)) : [];
  const map = new Map(users.map((u) => [u.id, u]));
  return rows.map((r) => ({ ...r, actor: r.actorUserId ? (map.get(r.actorUserId) ?? null) : null, flag: r.countryCode ? flagEmoji(r.countryCode) : null }));
}

interface Conn {
  id: string;
  ws: WebSocket;
  userId: string | null;
  name: string;
  avatar: { face: string; color: string; accessory?: string } | null;
  level: number;
  clanId: string | null;
  lat: number | null;
  lng: number | null;
  view: { lat: number; lng: number; wKm: number; hKm: number } | null;
  lastMove: number;
  lastSent: string;
}

const GUEST_FACES = ['🙂', '😎', '🤠', '🧑‍🚀', '🦊', '🐼', '🐙', '🦉'];
const GUEST_COLORS = ['#2DE2C4', '#8B7CFF', '#FFC94D', '#FF8FB1', '#3FA9F5', '#4ADE80'];

const num = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);

export function registerHub(app: App) {
  const conns = new Map<string, Conn>();
  const send = (c: Conn, payload: unknown) => {
    if (c.ws.readyState === 1) c.ws.send(JSON.stringify(payload));
  };

  const sub = subscriber();
  const liveChannel = LIVE_CHANNEL();
  const chatChannel = CHAT_CHANNEL();
  const notifyPattern = key('notify', '*');
  void sub.subscribe(liveChannel, chatChannel);
  void sub.psubscribe(notifyPattern);

  sub.on('message', async (channel, message) => {
    try {
      if (channel === liveChannel) {
        const parsed = JSON.parse(message) as { type: string; activity: Activity };
        const [decorated] = await decorateActivity([{ ...parsed.activity, createdAt: new Date(parsed.activity.createdAt) }]);
        const out = JSON.stringify({ type: 'activity', activity: decorated });
        for (const c of conns.values()) if (c.ws.readyState === 1) c.ws.send(out);
      } else if (channel === chatChannel) {
        deliverChat(JSON.parse(message) as ChatOut);
      }
    } catch {
      /* ignore malformed */
    }
  });
  sub.on('pmessage', (_pattern, channel, message) => {
    const userId = channel.split(':').pop();
    for (const c of conns.values()) if (c.userId && c.userId === userId) send(c, { type: 'notification', ...JSON.parse(message) });
  });

  /** Routes one stored message to the local sockets that should see it. */
  function deliverChat(m: ChatOut) {
    const payload = { type: 'chat', message: { id: m.id, room: m.room, senderId: m.senderId, senderName: m.senderName, avatar: m.avatar, body: m.body, createdAt: m.createdAt } };
    for (const c of conns.values()) {
      let ok = false;
      if (m.room.startsWith('dm:')) ok = !!c.userId && m.room.split(':').slice(1).includes(c.userId);
      else if (m.room.startsWith('clan:')) ok = !!c.clanId && clanRoom(c.clanId) === m.room;
      else if (m.room.startsWith('nearby:')) {
        if (c.lat !== null && c.lng !== null) ok = m.lat !== undefined && m.lng !== undefined ? haversineKm(c.lat, c.lng, m.lat, m.lng) <= NEARBY_RADIUS_KM : nearbyRoom(c.lat, c.lng) === m.room;
      }
      if (ok) send(c, payload);
    }
  }

  async function setPosition(c: Conn, lat: number, lng: number) {
    c.lat = lat;
    c.lng = lng;
    const m = redis.multi();
    m.geoadd(GEO(), lng, lat, c.id);
    m.hset(CONN(c.id), { n: c.name, a: JSON.stringify(c.avatar), u: c.userId ?? '', l: String(c.level), lat: String(lat), lng: String(lng) });
    m.expire(CONN(c.id), 40);
    m.zadd(PRESENCE(), Date.now(), c.id);
    await m.exec().catch(() => undefined);
  }

  async function avatarsFor(c: Conn) {
    const v = c.view;
    if (!v || v.wKm > MAX_VIEW_KM || v.hKm > MAX_VIEW_KM) return [];
    const found = (await redis.geosearch(GEO(), 'FROMLONLAT', v.lng, v.lat, 'BYBOX', Math.max(v.wKm, 0.1), Math.max(v.hKm, 0.1), 'km', 'ASC', 'COUNT', AVATAR_CAP + 1)) as string[];
    const ids = found.filter((id) => id !== c.id).slice(0, AVATAR_CAP);
    if (!ids.length) return [];
    const pipe = redis.pipeline();
    for (const id of ids) pipe.hgetall(CONN(id));
    const rows = (await pipe.exec()) ?? [];
    const out: { id: string; name: string; avatar: unknown; userId: string | null; level: number; lat: number; lng: number }[] = [];
    rows.forEach(([, h], i) => {
      const r = h as Record<string, string> | null;
      if (!r?.n) return;
      out.push({ id: ids[i]!, name: r.n, avatar: r.a ? JSON.parse(r.a) : null, userId: r.u || null, level: Number(r.l) || 1, lat: Number(r.lat), lng: Number(r.lng) });
    });
    return out;
  }

  // 1 Hz: avatars in each viewport. 10 s: heartbeat and the online count.
  let ticks = 0;
  const timer = setInterval(async () => {
    if (!conns.size) return;
    ticks++;
    try {
      if (ticks % 10 === 0) {
        const now = Date.now();
        const m = redis.multi();
        for (const c of conns.values()) {
          m.zadd(PRESENCE(), now, c.id);
          m.expire(CONN(c.id), 40);
        }
        await m.exec();
        const online = await onlineCount();
        for (const c of conns.values()) send(c, { type: 'presence', online });
      }
      for (const c of conns.values()) {
        if (!c.view) continue;
        const avatars = await avatarsFor(c);
        const body = JSON.stringify(avatars);
        if (body !== c.lastSent) {
          c.lastSent = body;
          send(c, { type: 'avatars', avatars });
        }
      }
    } catch {
      /* Redis hiccup: try again next tick */
    }
  }, 1000);

  app.addHook('onClose', async () => {
    clearInterval(timer);
    // Don't await unsubscribe (it can hang in pattern mode); closeRedis() quits the connection.
    sub.removeAllListeners('message');
    sub.removeAllListeners('pmessage');
    for (const c of conns.values()) c.ws.terminate();
    conns.clear();
  });

  app.get('/v1/live', { websocket: true, schema: { hide: true } }, (socket, req) => {
    const id = randomUUID();
    const n = 1000 + Math.floor(Math.random() * 9000);
    const conn: Conn = {
      id,
      ws: socket,
      userId: req.user?.id ?? null,
      name: `Guest ${n}`,
      avatar: { face: GUEST_FACES[n % GUEST_FACES.length]!, color: GUEST_COLORS[n % GUEST_COLORS.length]! },
      level: 1,
      clanId: null,
      lat: null,
      lng: null,
      view: null,
      lastMove: 0,
      lastSent: '',
    };
    conns.set(id, conn);

    void (async () => {
      if (conn.userId) {
        const [u] = await db.select().from(schema.users).where(eq(schema.users.id, conn.userId));
        if (u) {
          conn.name = u.displayName;
          conn.level = u.level;
          conn.avatar = u.avatar ?? conn.avatar;
          const [m] = await db.select({ clanId: schema.clanMembers.clanId }).from(schema.clanMembers).where(eq(schema.clanMembers.userId, u.id));
          conn.clanId = m?.clanId ?? null;
        }
      }
      await redis.zadd(PRESENCE(), Date.now(), id);
      send(conn, { type: 'welcome', you: { id, name: conn.name, avatar: conn.avatar, userId: conn.userId, guest: !conn.userId, clanId: conn.clanId } });
      send(conn, { type: 'presence', online: await onlineCount() });
    })();

    socket.on('message', (raw: Buffer) => {
      if (raw.length > 2048) return socket.close(1009, 'Message too big');
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch {
        return;
      }
      switch (msg.type) {
        case 'ping':
          send(conn, { type: 'pong' });
          break;
        case 'move': {
          const lat = num(msg.lat, -85, 85);
          const lng = num(msg.lng, -180, 180);
          const now = Date.now();
          if (lat === null || lng === null || now - conn.lastMove < 200) break;
          conn.lastMove = now;
          void setPosition(conn, lat, lng);
          break;
        }
        case 'view': {
          const b = msg.bbox as unknown;
          if (!Array.isArray(b) || b.length !== 4) {
            conn.view = null;
            break;
          }
          const [w, s, e, nn] = b.map((x) => (typeof x === 'number' ? x : NaN)) as [number, number, number, number];
          if ([w, s, e, nn].some((x) => !Number.isFinite(x)) || s < -90 || nn > 90 || nn < s) break;
          const lat = (s + nn) / 2;
          const lng = e >= w ? (w + e) / 2 : ((w + e + 360) / 2 + 180) % 360 - 180;
          conn.view = { lat, lng, wKm: haversineKm(lat, w, lat, e >= w ? e : e + 360), hKm: haversineKm(s, lng, nn, lng) };
          break;
        }
        case 'chat': {
          void (async () => {
            try {
              if (!conn.userId) return send(conn, { type: 'error', code: 'sign_in', message: 'Sign in to chat. Reading is free.' });
              const [me] = await db.select().from(schema.users).where(eq(schema.users.id, conn.userId));
              if (!me) return;
              const body = typeof msg.body === 'string' ? msg.body : '';
              let room: string;
              if (msg.scope === 'dm' && typeof msg.to === 'string') {
                const [other] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.username, msg.to));
                if (!other) return send(conn, { type: 'error', code: 'not_found', message: 'Player not found.' });
                room = dmRoom(me.id, other.id);
              } else if (msg.scope === 'clan' && conn.clanId) {
                room = clanRoom(conn.clanId);
              } else {
                if (conn.lat === null || conn.lng === null) return send(conn, { type: 'error', code: 'no_position', message: 'Move on the map first so we know who is nearby.' });
                room = nearbyRoom(conn.lat, conn.lng);
              }
              await sendMessage(me, { room, body, lat: conn.lat ?? undefined, lng: conn.lng ?? undefined });
            } catch (err) {
              send(conn, { type: 'error', code: 'chat', message: (err as Error).message });
            }
          })();
          break;
        }
      }
    });
    socket.on('close', () => {
      conns.delete(id);
      void redis.multi().zrem(PRESENCE(), id).zrem(GEO(), id).del(CONN(id)).exec();
    });
  });
}
