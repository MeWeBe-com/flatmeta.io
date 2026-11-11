import { createHash, randomBytes } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { addDays, dayKey } from '../game/dates.js';
import { key, redis } from './redis.js';

/**
 * Privacy-friendly unique visitors (G6), the way cookie-free analytics do it: a visitor is a SHA-256 of
 * (a random salt that changes every day + the account, or IP + browser). No IP or user agent is ever stored,
 * and once a day's salt is gone (2 days), that day's hashes can't be linked to anyone or to the next day.
 */
async function saltFor(day: string): Promise<string> {
  const k = key('uv', 'salt', day);
  const fresh = randomBytes(32).toString('hex');
  await redis.set(k, fresh, 'EX', 2 * 86400, 'NX');
  return (await redis.get(k)) ?? fresh;
}

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|headless|lighthouse|monitor/i;
export const isBot = (ua: string | undefined) => !ua || BOT.test(ua);

export async function visitorHash(req: FastifyRequest, day = dayKey()): Promise<string> {
  const who = req.user?.id ? `u:${req.user.id}` : `a:${req.ip}|${String(req.headers['user-agent'] ?? '').slice(0, 200)}`;
  return createHash('sha256').update(`${await saltFor(day)}|${who}`).digest('hex').slice(0, 32);
}

/** Monday-based week key, e.g. 2026-W46 style but as the Monday's date (simple, sortable). */
export const weekKey = (day = dayKey()) => {
  const d = new Date(`${day}T00:00:00Z`);
  const monday = addDays(day, -((d.getUTCDay() + 6) % 7));
  return monday;
};

/** Counts a unique visit (HyperLogLog per plot per day and per week). Returns whether it was new today. */
export async function countUniqueVisit(plotId: string, hash: string): Promise<boolean> {
  const day = dayKey();
  const m = redis.multi();
  m.pfadd(key('uv', 'd', plotId, day), hash);
  m.expire(key('uv', 'd', plotId, day), 3 * 86400);
  m.pfadd(key('uv', 'w', plotId, weekKey(day)), hash);
  m.expire(key('uv', 'w', plotId, weekKey(day)), 15 * 86400);
  const res = await m.exec();
  return Number(res?.[0]?.[1] ?? 0) === 1;
}

export async function uniqueVisitors(plotId: string): Promise<{ today: number; week: number }> {
  const day = dayKey();
  const [today, week] = await Promise.all([redis.pfcount(key('uv', 'd', plotId, day)), redis.pfcount(key('uv', 'w', plotId, weekKey(day)))]);
  return { today, week };
}
