import { and, desc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { key, redis } from '../lib/redis.js';
import { weekKey } from './dates.js';

export type Board = 'xp' | 'xp-week' | 'xp-country' | 'cells-country' | 'plots-loved';
export const BOARDS: Board[] = ['xp', 'xp-week', 'xp-country', 'cells-country', 'plots-loved'];

const k = {
  xp: () => key('lb', 'xp', 'all'),
  week: (w = weekKey()) => key('lb', 'xp', 'week', w),
  country: (cc: string) => key('lb', 'xp', 'country', cc.toUpperCase()),
  cells: (cc: string) => key('lb', 'cells', 'country', cc.toUpperCase()),
  loved: () => key('lb', 'plots', 'loved'),
};

/** Increments boards that already exist; missing boards are rebuilt from Postgres on first read. */
export async function onXp(userId: string, amount: number, homeCountry: string | null) {
  const keys = [k.xp(), k.week(), ...(homeCountry ? [k.country(homeCountry)] : [])];
  for (const rk of keys) {
    if (await redis.exists(rk)) await redis.zincrby(rk, amount, userId);
  }
}

export async function setUserCells(userId: string, countryCode: string, cells: number) {
  const rk = k.cells(countryCode);
  if (!(await redis.exists(rk))) return;
  if (cells > 0) await redis.zadd(rk, cells, userId);
  else await redis.zrem(rk, userId);
}

export async function setPlotLikes(plotId: string, likes: number) {
  if (await redis.exists(k.loved())) await redis.zadd(k.loved(), likes, plotId);
}

function boardKey(board: Board, country?: string): string {
  switch (board) {
    case 'xp':
      return k.xp();
    case 'xp-week':
      return k.week();
    case 'xp-country':
      return k.country(country ?? 'GB');
    case 'cells-country':
      return k.cells(country ?? 'GB');
    case 'plots-loved':
      return k.loved();
  }
}

export interface LeaderRow {
  rank: number;
  score: number;
  user?: { id: string; username: string; displayName: string; avatarUrl: string | null; level: number; homeCountry: string | null };
  plot?: { id: string; slug: string; title: string; thumbUrl: string | null; countryCode: string | null; kind: string };
}

export async function top(board: Board, opts: { country?: string; limit?: number; me?: string | null } = {}) {
  const limit = Math.min(opts.limit ?? 100, 100);
  const rk = boardKey(board, opts.country);
  if ((await redis.exists(rk)) === 0) await rebuild(board, opts.country);
  const raw = await redis.zrevrange(rk, 0, limit - 1, 'WITHSCORES');
  const entries: { id: string; score: number }[] = [];
  for (let i = 0; i < raw.length; i += 2) entries.push({ id: raw[i]!, score: Number(raw[i + 1]) });
  const ids = entries.map((e) => e.id);
  let rows: LeaderRow[];
  if (board === 'plots-loved') {
    const plots = ids.length
      ? await db
          .select({ id: schema.plots.id, slug: schema.plots.slug, title: schema.plots.title, thumbUrl: schema.plots.thumbUrl, countryCode: schema.plots.countryCode, kind: schema.plots.kind, status: schema.plots.status })
          .from(schema.plots)
          .where(inArray(schema.plots.id, ids))
      : [];
    const byId = new Map(plots.filter((p) => p.status === 'active' || p.status === 'showcase').map((p) => [p.id, p]));
    rows = entries.filter((e) => byId.has(e.id)).map((e, i) => ({ rank: i + 1, score: e.score, plot: byId.get(e.id)! }));
  } else {
    const users = ids.length
      ? await db
          .select({ id: schema.users.id, username: schema.users.username, displayName: schema.users.displayName, avatarUrl: schema.users.avatarUrl, level: schema.users.level, homeCountry: schema.users.homeCountry, bannedAt: schema.users.bannedAt })
          .from(schema.users)
          .where(inArray(schema.users.id, ids))
      : [];
    const byId = new Map(users.filter((u) => !u.bannedAt).map((u) => [u.id, u]));
    rows = entries.filter((e) => byId.has(e.id)).map((e, i) => {
      const { bannedAt: _b, ...user } = byId.get(e.id)!;
      return { rank: i + 1, score: e.score, user };
    });
  }
  let me: { rank: number; score: number } | null = null;
  if (opts.me && board !== 'plots-loved') {
    const r = await redis.zrevrank(rk, opts.me);
    const s = await redis.zscore(rk, opts.me);
    if (r !== null) me = { rank: r + 1, score: Number(s) };
  }
  return { board, country: opts.country ?? null, rows, me };
}

/** Rebuilds a board from Postgres (used when Redis was flushed or on first use). */
export async function rebuild(board: Board, country?: string) {
  const rk = boardKey(board, country);
  let pairs: { id: string; score: number }[] = [];
  if (board === 'xp') {
    pairs = (await db.select({ id: schema.users.id, score: schema.users.xp }).from(schema.users).where(gte(schema.users.xp, 1)).orderBy(desc(schema.users.xp)).limit(5000)).map((r) => ({ id: r.id, score: r.score }));
  } else if (board === 'xp-week') {
    const since = new Date(Date.now() - ((new Date().getUTCDay() + 6) % 7) * 86400000);
    since.setUTCHours(0, 0, 0, 0);
    pairs = (
      await db
        .select({ id: schema.xpEvents.userId, score: sql<number>`sum(${schema.xpEvents.amount})::int` })
        .from(schema.xpEvents)
        .where(gte(schema.xpEvents.createdAt, since))
        .groupBy(schema.xpEvents.userId)
    ).map((r) => ({ id: r.id, score: r.score }));
  } else if (board === 'xp-country' && country) {
    pairs = (
      await db.select({ id: schema.users.id, score: schema.users.xp }).from(schema.users).where(and(eq(schema.users.homeCountry, country.toUpperCase()), gte(schema.users.xp, 1))).limit(5000)
    ).map((r) => ({ id: r.id, score: r.score }));
  } else if (board === 'cells-country' && country) {
    pairs = (
      await db
        .select({ id: schema.plots.ownerUserId, score: sql<number>`sum(${schema.plots.cellCount})::int` })
        .from(schema.plots)
        .where(and(eq(schema.plots.countryCode, country.toUpperCase()), eq(schema.plots.status, 'active'), isNotNull(schema.plots.ownerUserId)))
        .groupBy(schema.plots.ownerUserId)
    ).map((r) => ({ id: r.id!, score: r.score }));
  } else if (board === 'plots-loved') {
    pairs = (
      await db
        .select({ id: schema.plots.id, score: schema.plots.likesCount })
        .from(schema.plots)
        .where(inArray(schema.plots.status, ['active', 'showcase']))
        .orderBy(desc(schema.plots.likesCount))
        .limit(1000)
    ).map((r) => ({ id: r.id, score: r.score }));
  }
  const m = redis.multi().del(rk);
  for (const p of pairs) m.zadd(rk, p.score, p.id);
  // An empty board keeps a marker member so we don't rebuild on every request (it never matches a user).
  if (pairs.length === 0) m.zadd(rk, -1, '__empty__');
  if (board === 'xp-week') m.expire(rk, 60 * 60 * 24 * 21);
  else m.expire(rk, 60 * 60 * 24 * 7);
  await m.exec();
}
