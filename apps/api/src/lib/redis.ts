import { Redis } from 'ioredis';
import { config } from '../config.js';

const opts = { maxRetriesPerRequest: null as null, lazyConnect: false, keyPrefix: undefined };

/** Main connection (commands). */
export const redis = new Redis(config.REDIS_URL, opts);
/** Separate connection for subscribers (a subscribed connection can't run other commands). */
let sub: Redis | null = null;
export function subscriber(): Redis {
  if (!sub) sub = new Redis(config.REDIS_URL, opts);
  return sub;
}
/** BullMQ wants its own connection options. */
export const bullConnection = () => new Redis(config.REDIS_URL, opts);

export const key = (...parts: (string | number)[]) => [config.REDIS_PREFIX, ...parts].join(':');

export async function closeRedis() {
  await redis.quit().catch(() => undefined);
  if (sub) await sub.quit().catch(() => undefined);
}
