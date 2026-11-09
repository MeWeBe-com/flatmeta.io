import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { key, publish } from '../lib/redis.js';
import { logger } from '../lib/logger.js';

export const LIVE_CHANNEL = () => key('live');

export interface ActivityInput {
  kind: string;
  actorUserId?: string | null;
  plotId?: string | null;
  countryCode?: string | null;
  lat?: number | null;
  lng?: number | null;
  payload?: Record<string, unknown>;
}

/** Records a public activity event and pushes it to live subscribers. */
export async function publishActivity(input: ActivityInput) {
  const [row] = await db
    .insert(schema.activity)
    .values({
      kind: input.kind,
      actorUserId: input.actorUserId ?? null,
      plotId: input.plotId ?? null,
      countryCode: input.countryCode ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      payload: input.payload ?? {},
    })
    .returning();
  if (row) {
    await publish(LIVE_CHANNEL(), JSON.stringify({ type: 'activity', activity: row }));
  }
  return row;
}

/** The per-user pub/sub channel. The API's live hub subscribes to it for every signed-in socket. */
export const NOTIFY_CHANNEL = (userId: string) => key('notify', userId);

/**
 * Stores a notification and pushes it to the user's open sockets (from the API or the worker: both publish to
 * the same Redis channel, built with REDIS_PREFIX). `collapseBy` names a payload field: while an unread
 * notification of the same kind has the same value there, it is updated (count + 1) instead of adding a row,
 * so ten messages from one friend make one entry.
 */
export async function notify(userId: string, kind: string, payload: Record<string, unknown>, opts: { collapseBy?: string } = {}) {
  const N = schema.notifications;
  let row: typeof N.$inferSelect | undefined;
  const by = opts.collapseBy;
  if (by && payload[by] !== undefined) {
    const value = String(payload[by]);
    // Two messages at once must not both miss the unread entry and insert twice: lock this (user, kind, value).
    row = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`notify:${userId}:${kind}:${value}`}))`);
      const [prev] = await tx
        .select()
        .from(N)
        .where(and(eq(N.userId, userId), eq(N.kind, kind), isNull(N.readAt), sql`${N.payload}->>${by} = ${value}`))
        .limit(1);
      if (prev) {
        const count = (typeof prev.payload.count === 'number' ? prev.payload.count : 1) + 1;
        return (await tx.update(N).set({ payload: { ...payload, count }, createdAt: new Date() }).where(eq(N.id, prev.id)).returning())[0];
      }
      return (await tx.insert(N).values({ userId, kind, payload }).returning())[0];
    });
  }
  if (!row) [row] = await db.insert(N).values({ userId, kind, payload }).returning();
  await publishToUser(userId, { id: row?.id, kind, payload: row?.payload ?? payload, createdAt: row?.createdAt ?? new Date() });
}

/** Pushes an event to one user's sockets without storing a notification (e.g. "your clan changed"). */
export async function signal(userId: string, kind: string, payload: Record<string, unknown> = {}) {
  await publishToUser(userId, { kind, payload, signal: true });
}

async function publishToUser(userId: string, event: Record<string, unknown>) {
  const channel = NOTIFY_CHANNEL(userId);
  const receivers = await publish(channel, JSON.stringify(event));
  // receivers = API processes subscribed to this user (0: no open socket right now; -1: Redis unavailable).
  logger.debug({ channel, kind: event.kind, receivers }, 'live: published notification');
}
