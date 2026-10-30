import { db, schema } from '../db/client.js';
import { redis, key } from '../lib/redis.js';

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
    await redis.publish(LIVE_CHANNEL(), JSON.stringify({ type: 'activity', activity: row })).catch(() => undefined);
  }
  return row;
}

export async function notify(userId: string, kind: string, payload: Record<string, unknown>) {
  await db.insert(schema.notifications).values({ userId, kind, payload });
  await redis.publish(key('notify', userId), JSON.stringify({ kind, payload })).catch(() => undefined);
}
