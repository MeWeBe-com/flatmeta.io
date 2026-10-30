import { and, count, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { randomToken } from '../lib/crypto.js';
import { ACHIEVEMENTS, achievementByKey, type AchievementDef, type Stat } from './achievements.js';
import { type Action, XP_TABLE } from './actions.js';
import { publishActivity, notify } from './activity.js';
import { dayKey } from './dates.js';
import { onXp } from './leaderboards.js';
import { levelForXp, levelTitle } from './levels.js';
import { currentQuests, questByKey } from './quests.js';

export interface GameResult {
  xp: number;
  level: number;
  levelUp: { level: number; title: string } | null;
  achievements: { key: string; name: string; rarity: string; icon: string; xp: number }[];
  questsCompleted: { id: string; key: string; title: string }[];
}

const empty = (level = 1): GameResult => ({ xp: 0, level, levelUp: null, achievements: [], questsCompleted: [] });

export function mergeResults(...results: (GameResult | null | undefined)[]): GameResult {
  const out = empty();
  for (const r of results) {
    if (!r) continue;
    out.xp += r.xp;
    out.level = Math.max(out.level, r.level);
    if (r.levelUp && (!out.levelUp || r.levelUp.level > out.levelUp.level)) out.levelUp = r.levelUp;
    out.achievements.push(...r.achievements);
    out.questsCompleted.push(...r.questsCompleted);
  }
  return out;
}

/**
 * Adds XP once per (user, kind, ref, day). Returns how much was added and any level-up.
 * `dailyCap` limits how many awards of this kind a user can get per day.
 */
export async function awardXp(
  userId: string,
  kind: string,
  amount: number,
  opts: { ref?: string; dailyCap?: number; countryCode?: string | null } = {},
): Promise<{ added: number; level: number; levelUp: GameResult['levelUp'] }> {
  const day = dayKey();
  if (amount <= 0) return { added: 0, level: 0, levelUp: null };
  if (opts.dailyCap) {
    const [row] = await db
      .select({ n: count() })
      .from(schema.xpEvents)
      .where(and(eq(schema.xpEvents.userId, userId), eq(schema.xpEvents.kind, kind), eq(schema.xpEvents.day, day)));
    if ((row?.n ?? 0) >= opts.dailyCap) return { added: 0, level: 0, levelUp: null };
  }
  const inserted = await db
    .insert(schema.xpEvents)
    .values({ userId, kind, amount, ref: opts.ref ?? randomToken(8), day, countryCode: opts.countryCode ?? null })
    .onConflictDoNothing()
    .returning({ id: schema.xpEvents.id });
  if (inserted.length === 0) return { added: 0, level: 0, levelUp: null };

  const [before] = await db.select({ level: schema.users.level, home: schema.users.homeCountry }).from(schema.users).where(eq(schema.users.id, userId));
  const [after] = await db
    .update(schema.users)
    .set({ xp: sql`${schema.users.xp} + ${amount}`, updatedAt: sql`now()` })
    .where(eq(schema.users.id, userId))
    .returning({ xp: schema.users.xp });
  const newLevel = levelForXp(after?.xp ?? 0);
  let levelUp: GameResult['levelUp'] = null;
  if (before && newLevel !== before.level) {
    await db.update(schema.users).set({ level: newLevel }).where(eq(schema.users.id, userId));
    if (newLevel > before.level) {
      levelUp = { level: newLevel, title: levelTitle(newLevel) };
      await notify(userId, 'level_up', levelUp);
    }
  }
  await onXp(userId, amount, before?.home ?? null).catch(() => undefined);
  return { added: amount, level: newLevel, levelUp };
}

/** Creates the user's quest rows for the current day/week (idempotent). */
export async function ensureQuests(userId: string) {
  const rows = currentQuests(userId).map(({ def, periodKey }) => ({ userId, questKey: def.key, periodKey, target: def.target }));
  await db.insert(schema.userQuests).values(rows).onConflictDoNothing();
}

async function progressQuests(userId: string, action: Action, by: number): Promise<GameResult['questsCompleted']> {
  const current = currentQuests(userId).filter((q) => q.def.action === action);
  if (current.length === 0) return [];
  await ensureQuests(userId);
  const completed: GameResult['questsCompleted'] = [];
  for (const { def, periodKey } of current) {
    const updated = await db
      .update(schema.userQuests)
      .set({
        progress: sql`least(${schema.userQuests.target}, ${schema.userQuests.progress} + ${by})`,
        completedAt: sql`case when ${schema.userQuests.progress} + ${by} >= ${schema.userQuests.target} then now() else null end`,
      })
      .where(
        and(
          eq(schema.userQuests.userId, userId),
          eq(schema.userQuests.questKey, def.key),
          eq(schema.userQuests.periodKey, periodKey),
          isNull(schema.userQuests.completedAt),
        ),
      )
      .returning({ id: schema.userQuests.id, completedAt: schema.userQuests.completedAt });
    const row = updated[0];
    if (row?.completedAt) {
      completed.push({ id: row.id, key: def.key, title: def.title });
      await notify(userId, 'quest_completed', { questId: row.id, key: def.key, title: def.title });
    }
  }
  // Completing daily quests feeds the weekly "Quest master" quest.
  const dailyDone = completed.filter((c) => questByKey.get(c.key)?.period === 'daily').length;
  if (dailyDone > 0) completed.push(...(await progressQuests(userId, 'quest_complete', dailyDone)));
  return completed;
}

/** Claims a completed quest's reward (XP + optional AI credits). */
export async function claimQuest(userId: string, questId: string): Promise<GameResult | null> {
  const [q] = await db
    .update(schema.userQuests)
    .set({ claimedAt: sql`now()` })
    .where(and(eq(schema.userQuests.id, questId), eq(schema.userQuests.userId, userId), isNotNull(schema.userQuests.completedAt), isNull(schema.userQuests.claimedAt)))
    .returning();
  if (!q) return null;
  const def = questByKey.get(q.questKey);
  if (!def) return null;
  if (def.credits) {
    await db.update(schema.users).set({ aiCreditsBonus: sql`${schema.users.aiCreditsBonus} + ${def.credits}` }).where(eq(schema.users.id, userId));
  }
  const xp = await awardXp(userId, 'quest', def.xp, { ref: q.id });
  const ach = await checkAchievements(userId, 'quest_complete');
  return mergeResults({ xp: xp.added, level: xp.level, levelUp: xp.levelUp, achievements: [], questsCompleted: [] }, ach);
}

// ─── Achievements ────────────────────────────────────────────────────────────

async function stat(userId: string, s: Stat): Promise<number> {
  const n = async (q: Promise<{ n: number | string | null }[]>) => Number((await q)[0]?.n ?? 0);
  const P = schema.plots;
  switch (s) {
    case 'plots_owned':
      return n(db.select({ n: count() }).from(P).where(and(eq(P.ownerUserId, userId), eq(P.status, 'active'))));
    case 'cells_owned':
      return n(db.select({ n: sql<number>`coalesce(sum(${P.cellCount}),0)` }).from(P).where(and(eq(P.ownerUserId, userId), eq(P.status, 'active'))));
    case 'published':
      return n(db.select({ n: count() }).from(P).where(and(eq(P.ownerUserId, userId), isNotNull(P.publishedAt))));
    case 'likes_received':
      return n(db.select({ n: sql<number>`coalesce(sum(${P.likesCount}),0)` }).from(P).where(eq(P.ownerUserId, userId)));
    case 'guestbook_received':
      return n(db.select({ n: sql<number>`coalesce(sum(${P.guestbookCount}),0)` }).from(P).where(eq(P.ownerUserId, userId)));
    case 'designs':
      return n(db.select({ n: count() }).from(schema.aiJobs).where(and(eq(schema.aiJobs.userId, userId), eq(schema.aiJobs.kind, 'design'), eq(schema.aiJobs.status, 'done'))));
    case 'countries_visited':
      return n(db.select({ n: count() }).from(schema.userCountryVisits).where(eq(schema.userCountryVisits.userId, userId)));
    case 'waves_sent':
      return n(db.select({ n: count() }).from(schema.waves).where(eq(schema.waves.fromUserId, userId)));
    case 'following':
      return n(db.select({ n: count() }).from(schema.follows).where(eq(schema.follows.followerId, userId)));
    case 'likes_given':
      return n(db.select({ n: count() }).from(schema.plotLikes).where(eq(schema.plotLikes.userId, userId)));
    case 'guestbook_posts':
      return n(db.select({ n: count() }).from(schema.guestbookEntries).where(and(eq(schema.guestbookEntries.userId, userId), isNull(schema.guestbookEntries.deletedAt))));
    case 'plots_visited':
    case 'shares': {
      const kind = s === 'plots_visited' ? 'visit_plot' : 'share';
      return n(db.select({ n: count() }).from(schema.xpEvents).where(and(eq(schema.xpEvents.userId, userId), eq(schema.xpEvents.kind, kind))));
    }
    case 'quests_completed':
      return n(db.select({ n: count() }).from(schema.userQuests).where(and(eq(schema.userQuests.userId, userId), isNotNull(schema.userQuests.completedAt))));
    case 'level':
      return n(db.select({ n: schema.users.level }).from(schema.users).where(eq(schema.users.id, userId)));
    case 'streak':
      return n(db.select({ n: schema.users.streak }).from(schema.users).where(eq(schema.users.id, userId)));
  }
}

/** Unlocks an achievement once; returns it when newly unlocked. */
export async function unlock(userId: string, key: string): Promise<GameResult | null> {
  const def = achievementByKey.get(key);
  if (!def) return null;
  const inserted = await db.insert(schema.userAchievements).values({ userId, key }).onConflictDoNothing().returning();
  if (inserted.length === 0) return null;
  const xp = await awardXp(userId, 'achievement', def.xp, { ref: key });
  await notify(userId, 'achievement', { key, name: def.name, rarity: def.rarity });
  if (def.rarity === 'epic' || def.rarity === 'legendary') {
    await publishActivity({ kind: 'achievement', actorUserId: userId, payload: { key, name: def.name, rarity: def.rarity } });
  }
  const self = { key, name: def.name, rarity: def.rarity, icon: def.icon, xp: def.xp };
  const levelAch = xp.levelUp ? await checkLevelAchievements(userId) : null;
  return mergeResults({ xp: xp.added, level: xp.level, levelUp: xp.levelUp, achievements: [self], questsCompleted: [] }, levelAch);
}

async function evaluate(userId: string, candidates: AchievementDef[]): Promise<GameResult> {
  if (candidates.length === 0) return empty();
  const have = new Set(
    (
      await db
        .select({ key: schema.userAchievements.key })
        .from(schema.userAchievements)
        .where(and(eq(schema.userAchievements.userId, userId), inArray(schema.userAchievements.key, candidates.map((c) => c.key))))
    ).map((r) => r.key),
  );
  const cache = new Map<Stat, number>();
  const results: GameResult[] = [];
  for (const a of candidates) {
    if (have.has(a.key) || !a.stat || a.threshold === undefined) continue;
    if (!cache.has(a.stat)) cache.set(a.stat, await stat(userId, a.stat));
    if ((cache.get(a.stat) ?? 0) >= a.threshold) {
      const r = await unlock(userId, a.key);
      if (r) results.push(r);
    }
  }
  return mergeResults(...results);
}

export const checkAchievements = (userId: string, action: Action) =>
  evaluate(
    userId,
    ACHIEVEMENTS.filter((a) => a.triggers?.includes(action)),
  );

const checkLevelAchievements = (userId: string) => evaluate(userId, ACHIEVEMENTS.filter((a) => a.stat === 'level'));

// ─── The one entry point routes use ──────────────────────────────────────────

/**
 * Records a game action: XP (with caps and idempotency), quest progress and achievements.
 * `ref` makes the XP idempotent per day (e.g. liking the same plot twice gives XP once).
 */
export async function recordAction(
  userId: string,
  action: Action,
  opts: { ref?: string; amount?: number; countryCode?: string | null; by?: number; noXp?: boolean } = {},
): Promise<GameResult> {
  const rule = XP_TABLE[action];
  const amount = opts.amount ?? rule?.xp ?? 0;
  let xpRes = { added: 0, level: 0, levelUp: null as GameResult['levelUp'] };
  if (!opts.noXp && amount > 0) {
    xpRes = await awardXp(userId, action, amount, { ref: opts.ref, dailyCap: rule?.dailyCap, countryCode: opts.countryCode });
  }
  const questsCompleted = await progressQuests(userId, action, opts.by ?? 1);
  const ach = await checkAchievements(userId, action);
  const lvl = xpRes.levelUp ? await checkLevelAchievements(userId) : null;
  const night = new Date().getUTCHours() < 4 ? await unlock(userId, 'night-owl') : null;
  const [u] = await db.select({ level: schema.users.level }).from(schema.users).where(eq(schema.users.id, userId));
  const merged = mergeResults({ xp: xpRes.added, level: u?.level ?? 1, levelUp: xpRes.levelUp, achievements: [], questsCompleted }, ach, lvl, night);
  merged.level = u?.level ?? merged.level;
  return merged;
}
