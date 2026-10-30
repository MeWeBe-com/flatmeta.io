import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from '../app.js';
import { db, schema } from '../db/client.js';
import { flagEmoji } from '../lib/geo.js';
import { key, redis, subscriber } from '../lib/redis.js';
import { LIVE_CHANNEL } from '../game/activity.js';

const PRESENCE = () => key('presence');
const PRESENCE_TTL_MS = 30_000;

export async function onlineCount(): Promise<number> {
  const now = Date.now();
  await redis.zremrangebyscore(PRESENCE(), 0, now - PRESENCE_TTL_MS);
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

export default async function liveRoutes(app: App) {
  const sockets = new Map<string, { ws: WebSocket; userId: string | null }>();

  const sub = subscriber();
  const liveChannel = LIVE_CHANNEL();
  const notifyPattern = key('notify', '*');
  await sub.subscribe(liveChannel);
  await sub.psubscribe(notifyPattern);
  sub.on('message', async (channel, message) => {
    if (channel !== liveChannel) return;
    try {
      const parsed = JSON.parse(message) as { type: string; activity: Activity };
      const [decorated] = await decorateActivity([{ ...parsed.activity, createdAt: new Date(parsed.activity.createdAt) }]);
      const out = JSON.stringify({ type: 'activity', activity: decorated });
      for (const { ws } of sockets.values()) if (ws.readyState === 1) ws.send(out);
    } catch {
      /* ignore malformed */
    }
  });
  sub.on('pmessage', (_pattern, channel, message) => {
    const userId = channel.split(':').pop();
    for (const { ws, userId: uid } of sockets.values()) if (uid && uid === userId && ws.readyState === 1) ws.send(JSON.stringify({ type: 'notification', ...JSON.parse(message) }));
  });

  // Presence heartbeat + broadcast of the online count.
  const timer = setInterval(async () => {
    if (!sockets.size) return;
    const now = Date.now();
    const m = redis.multi();
    for (const id of sockets.keys()) m.zadd(PRESENCE(), now, id);
    await m.exec().catch(() => undefined);
    const online = await onlineCount().catch(() => sockets.size);
    const msg = JSON.stringify({ type: 'presence', online });
    for (const { ws } of sockets.values()) if (ws.readyState === 1) ws.send(msg);
  }, 10_000);
  app.addHook('onClose', async () => {
    clearInterval(timer);
    // Don't await unsubscribe (it can hang in pattern mode); closeRedis() quits the connection.
    sub.removeAllListeners('message');
    sub.removeAllListeners('pmessage');
    for (const { ws } of sockets.values()) ws.terminate();
    sockets.clear();
  });

  app.get('/v1/live', { websocket: true, schema: { hide: true } }, (socket, req) => {
    const id = randomUUID();
    sockets.set(id, { ws: socket, userId: req.user?.id ?? null });
    void redis.zadd(PRESENCE(), Date.now(), id).then(async () => socket.send(JSON.stringify({ type: 'presence', online: await onlineCount() })));
    socket.on('message', (raw: Buffer) => {
      if (raw.length > 2048) return socket.close(1009, 'Message too big');
      try {
        const msg = JSON.parse(raw.toString()) as { type?: string };
        if (msg.type === 'ping') socket.send(JSON.stringify({ type: 'pong' }));
      } catch {
        /* ignore */
      }
    });
    socket.on('close', () => {
      sockets.delete(id);
      void redis.zrem(PRESENCE(), id);
    });
  });

  app.get('/v1/world/stats', { schema: { tags: ['world'], summary: 'Live world numbers' } }, async () => {
    const P = schema.plots;
    const [[plots], [users], [countries]] = await Promise.all([
      db
        .select({
          active: sql<number>`count(*) filter (where ${P.status} = 'active')::int`,
          showcase: sql<number>`count(*) filter (where ${P.status} = 'showcase' and coalesce((${P.showcase}->>'approved')::boolean,false))::int`,
          cells: sql<number>`coalesce(sum(${P.cellCount}) filter (where ${P.status} = 'active'), 0)::int`,
        })
        .from(P),
      db.select({ n: sql<number>`count(*)::int` }).from(schema.users),
      db.select({ n: sql<number>`count(*) filter (where ${schema.countries.plotCount} > 0 or ${schema.countries.showcaseCount} > 0)::int` }).from(schema.countries),
    ]);
    return { online: await onlineCount(), plots: plots?.active ?? 0, showcase: plots?.showcase ?? 0, cells: plots?.cells ?? 0, explorers: users?.n ?? 0, countries: countries?.n ?? 0 };
  });

  app.get(
    '/v1/world/activity',
    { schema: { tags: ['world'], summary: 'Recent public activity', querystring: z.object({ limit: z.coerce.number().int().min(1).max(50).default(20), country: z.string().length(2).optional() }) } },
    async (req) => {
      const rows = await db
        .select()
        .from(schema.activity)
        .where(req.query.country ? eq(schema.activity.countryCode, req.query.country.toUpperCase()) : undefined)
        .orderBy(desc(schema.activity.createdAt))
        .limit(req.query.limit);
      return { activity: await decorateActivity(rows) };
    },
  );
}
