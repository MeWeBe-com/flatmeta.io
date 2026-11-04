import { Redis, type RedisOptions } from 'ioredis';
import { config } from '../config.js';
import { logger } from './logger.js';

/**
 * Redis connections. All are long-lived, created once per process and closed only at shutdown:
 *   redis        commands (rate limits, presence, caches)
 *   publisher()  PUBLISH only (live activity, chat, notifications)
 *   subscriber() SUBSCRIBE only (the live hub); a subscribed connection can't run other commands
 *   bullConnection() one per BullMQ queue/worker (BullMQ needs maxRetriesPerRequest: null)
 * They reconnect forever with a capped backoff, re-subscribe automatically and log every drop and reconnect.
 * Never quit() one of these from request code: a quit client stays closed ("Connection is closed").
 */
let closing = false;

function make(role: string, extra: Partial<RedisOptions> = {}): Redis {
  const client = new Redis(config.REDIS_URL, {
    // Commands wait for a reconnect, but give up after a few attempts instead of hanging a request forever.
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => (closing ? null : Math.min(times * 200, 5000)),
    reconnectOnError: (err) => /READONLY|ETIMEDOUT|ECONNRESET/.test(err.message),
    connectionName: `${config.REDIS_PREFIX}:${role}:${process.pid}`,
    lazyConnect: false,
    ...extra,
  });
  let down = false;
  client.on('error', (err) => {
    // ioredis emits the same error on every retry: log the first one of each outage.
    if (!down) logger.warn({ redis: role, err: err.message }, 'redis: connection error');
    down = true;
  });
  client.on('reconnecting', (ms: number) => logger.info({ redis: role, inMs: ms }, 'redis: reconnecting'));
  client.on('ready', () => {
    if (down) logger.info({ redis: role }, 'redis: reconnected');
    down = false;
  });
  client.on('end', () => {
    if (!closing) logger.error({ redis: role }, 'redis: connection ended and will not reconnect');
  });
  return client;
}

/** Main connection (commands). */
export const redis = make('cmd');

let pub: Redis | null = null;
/** Dedicated publishing connection, so a slow command can't delay live events (and vice versa). */
export function publisher(): Redis {
  pub ??= make('pub');
  return pub;
}

let sub: Redis | null = null;
/** Subscriber connection: subscribe mode only. Waits for reconnects instead of failing (it has no requests). */
export function subscriber(): Redis {
  sub ??= make('sub', { maxRetriesPerRequest: null, autoResubscribe: true });
  return sub;
}

/** BullMQ wants its own connection per queue or worker. */
export const bullConnection = () => make('bull', { maxRetriesPerRequest: null });

export const key = (...parts: (string | number)[]) => [config.REDIS_PREFIX, ...parts].join(':');

/** False once shutdown has begun: late callbacks (socket close handlers, timers) should skip Redis. */
export const redisOpen = () => !closing;

/** Publishes without throwing; returns how many subscribers got it, or -1 if Redis is unavailable. */
export async function publish(channel: string, message: string): Promise<number> {
  if (closing) return -1;
  try {
    return await publisher().publish(channel, message);
  } catch (err) {
    logger.warn({ channel, err: (err as Error).message }, 'redis: publish failed');
    return -1;
  }
}

/** Shutdown only (server, worker, CLI scripts). */
export async function closeRedis() {
  if (closing) return;
  closing = true;
  await Promise.all([redis, pub, sub].filter((c): c is Redis => !!c).map((c) => c.quit().catch(() => c.disconnect())));
}
