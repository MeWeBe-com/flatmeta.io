import { HttpError } from './errors.js';
import { key, redis } from './redis.js';
import { dayKey } from '../game/dates.js';

/**
 * A per-user daily cap on top of the per-minute rate limits (G7): plot edits, image uploads… Counts in Redis until
 * the end of the UTC day. Throws 429 with a friendly message once the cap is reached.
 */
export async function dailyCap(userId: string, kind: string, max: number, what: string): Promise<void> {
  const k = key('cap', kind, userId, dayKey());
  const n = await redis.incr(k);
  if (n === 1) await redis.expire(k, 26 * 3600);
  if (n > max) throw new HttpError(429, 'daily_limit', `You've reached today's limit of ${max} ${what}. It resets at midnight UTC.`);
}
