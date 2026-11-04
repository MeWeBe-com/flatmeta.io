import { and, count, desc, eq, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from '../app.js';
import { db, schema } from '../db/client.js';
import { requireUser } from '../lib/auth.js';
import { badRequest, notFound } from '../lib/errors.js';
import { ACHIEVEMENTS } from '../game/achievements.js';
import { notify } from '../game/activity.js';
import { recordAction } from '../game/engine.js';
import { BOARDS, top } from '../game/leaderboards.js';
import { QUESTS } from '../game/quests.js';
import { ownersFor, plotView, publicOrg, publicUser } from './views.js';

export default async function socialRoutes(app: App) {
  app.get('/v1/users/:username', { schema: { tags: ['social'], summary: 'Public profile', params: z.object({ username: z.string().max(40) }) } }, async (req) => {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.username, req.params.username));
    if (!user || user.bannedAt) throw notFound('User');
    const P = schema.plots;
    const plots = await db.select().from(P).where(and(eq(P.ownerUserId, user.id), eq(P.status, 'active'), isNotNull(P.publishedAt))).orderBy(desc(P.likesCount)).limit(24);
    const owners = await ownersFor(plots);
    const achievements = await db.select().from(schema.userAchievements).where(eq(schema.userAchievements.userId, user.id)).orderBy(desc(schema.userAchievements.unlockedAt));
    const [followers] = await db.select({ n: count() }).from(schema.follows).where(eq(schema.follows.followeeId, user.id));
    const [following] = await db.select({ n: count() }).from(schema.follows).where(eq(schema.follows.followerId, user.id));
    const followedByMe = req.user
      ? (await db.select().from(schema.follows).where(and(eq(schema.follows.followerId, req.user.id), eq(schema.follows.followeeId, user.id)))).length > 0
      : false;
    const orgs = await db
      .select({ org: schema.organizations })
      .from(schema.orgMembers)
      .innerJoin(schema.organizations, eq(schema.orgMembers.orgId, schema.organizations.id))
      .where(eq(schema.orgMembers.userId, user.id));
    const defs = new Map(ACHIEVEMENTS.map((a) => [a.key, a]));
    return {
      user: publicUser(user),
      plots: plots.map((p) => plotView(p, owners.get(p.id) ?? null)),
      achievements: achievements.filter((a) => defs.has(a.key)).map((a) => ({ ...defs.get(a.key)!, unlockedAt: a.unlockedAt })),
      followers: followers?.n ?? 0,
      following: following?.n ?? 0,
      followedByMe,
      orgs: orgs.map((o) => publicOrg(o.org)),
    };
  });

  app.post('/v1/users/:username/follow', { schema: { tags: ['social'], summary: 'Follow an explorer', params: z.object({ username: z.string().max(40) }) } }, async (req) => {
    const me = requireUser(req);
    const [target] = await db.select().from(schema.users).where(eq(schema.users.username, req.params.username));
    if (!target) throw notFound('User');
    if (target.id === me.id) throw badRequest("You can't follow yourself");
    const inserted = await db.insert(schema.follows).values({ followerId: me.id, followeeId: target.id }).onConflictDoNothing().returning();
    if (!inserted.length) return { following: true, game: null };
    await notify(target.id, 'follow', { from: me.displayName, fromUsername: me.username }, { collapseBy: 'fromUsername' });
    return { following: true, game: await recordAction(me.id, 'follow', { ref: target.id }) };
  });

  app.delete('/v1/users/:username/follow', { schema: { tags: ['social'], summary: 'Unfollow', params: z.object({ username: z.string().max(40) }) } }, async (req) => {
    const me = requireUser(req);
    const [target] = await db.select().from(schema.users).where(eq(schema.users.username, req.params.username));
    if (!target) throw notFound('User');
    await db.delete(schema.follows).where(and(eq(schema.follows.followerId, me.id), eq(schema.follows.followeeId, target.id)));
    return { following: false };
  });

  app.get(
    '/v1/leaderboards/:board',
    {
      schema: {
        tags: ['social'],
        summary: 'Leaderboards: xp, xp-week, xp-country, cells-country, plots-loved',
        params: z.object({ board: z.enum(BOARDS as [string, ...string[]]) }),
        querystring: z.object({ country: z.string().length(2).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }),
      },
    },
    async (req) => {
      const board = req.params.board as (typeof BOARDS)[number];
      if ((board === 'xp-country' || board === 'cells-country') && !req.query.country) throw badRequest('Pick a country');
      return top(board, { country: req.query.country?.toUpperCase(), limit: req.query.limit, me: req.user?.id ?? null });
    },
  );

  app.get('/v1/game/catalogue', { schema: { tags: ['social'], summary: 'All achievements and quests' } }, async () => ({
    achievements: ACHIEVEMENTS.map(({ key, name, description, icon, rarity, xp }) => ({ key, name, description, icon, rarity, xp })),
    quests: QUESTS.map(({ key, period, title, description, target, xp, credits, icon }) => ({ key, period, title, description, target, xp, credits: credits ?? 0, icon })),
  }));

}
