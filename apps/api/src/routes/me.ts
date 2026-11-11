import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from '../app.js';
import { db, schema } from '../db/client.js';
import { newApiKey, requireUser } from '../lib/auth.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { stripText } from '../lib/markdown.js';
import { storeImage } from '../lib/storage.js';
import { aiCreditsStatus } from '../lib/users.js';
import { resolveStart } from '../lib/start-location.js';
import { handleBlocked, resolveHandle } from '../services/handles.js';
import { ACHIEVEMENTS } from '../game/achievements.js';
import { addDays, dayKey } from '../game/dates.js';
import { claimQuest, ensureQuests, recordAction } from '../game/engine.js';
import { FRAMES, levelProgress } from '../game/levels.js';
import { currentQuests } from '../game/quests.js';
import { checkContent } from '../services/moderation.js';
import { ownersFor, plotView, privateUser, publicOrg } from './views.js';

export async function progressFor(userId: string) {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user) throw notFound('User');
  await ensureQuests(userId);
  const active = currentQuests(userId);
  const rows = await db
    .select()
    .from(schema.userQuests)
    .where(and(eq(schema.userQuests.userId, userId), inArray(schema.userQuests.periodKey, [...new Set(active.map((a) => a.periodKey))])));
  const byKey = new Map(rows.map((r) => [`${r.questKey}|${r.periodKey}`, r]));
  const quests = active
    .map(({ def, periodKey }) => {
      const r = byKey.get(`${def.key}|${periodKey}`);
      return {
        id: r?.id ?? null,
        key: def.key,
        period: def.period,
        periodKey,
        title: def.title,
        description: def.description,
        icon: def.icon,
        order: def.order ?? 0,
        progress: r?.progress ?? 0,
        target: def.target,
        xp: def.xp,
        credits: def.credits ?? 0,
        completed: !!r?.completedAt,
        claimed: !!r?.claimedAt,
      };
    })
    // Hide finished onboarding quests once claimed, so the tracker stays short.
    .filter((q) => !(q.period === 'onboarding' && q.claimed));
  const unlocked = await db.select().from(schema.userAchievements).where(eq(schema.userAchievements.userId, userId));
  const unlockedMap = new Map(unlocked.map((u) => [u.key, u.unlockedAt]));
  const recentXp = await db.select().from(schema.xpEvents).where(eq(schema.xpEvents.userId, userId)).orderBy(desc(schema.xpEvents.createdAt)).limit(20);
  return {
    ...levelProgress(user.xp),
    streak: user.streak,
    checkedInToday: user.lastCheckin === dayKey(),
    quests,
    achievements: ACHIEVEMENTS.map((a) => ({
      key: a.key,
      name: a.name,
      description: a.description,
      icon: a.icon,
      rarity: a.rarity,
      xp: a.xp,
      unlocked: unlockedMap.has(a.key),
      unlockedAt: unlockedMap.get(a.key) ?? null,
    })),
    recentXp: recentXp.map((x) => ({ kind: x.kind, amount: x.amount, createdAt: x.createdAt })),
    credits: await aiCreditsStatus(user),
    frames: FRAMES.map((f) => ({ ...f, unlocked: user.role === 'admin' || (user.level >= f.level && (!f.plan || user.plan !== 'free')) })),
  };
}

export default async function meRoutes(app: App) {
  app.get('/v1/me', { schema: { tags: ['me'], summary: 'The signed-in user (or null)' } }, async (req) => {
    if (!req.user) return { user: null };
    const user = req.user;
    const orgs = await db
      .select({ org: schema.organizations, role: schema.orgMembers.role })
      .from(schema.orgMembers)
      .innerJoin(schema.organizations, eq(schema.orgMembers.orgId, schema.organizations.id))
      .where(eq(schema.orgMembers.userId, user.id));
    const [unread] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.notifications)
      .where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)));
    return {
      user: privateUser(user),
      progress: levelProgress(user.xp),
      credits: await aiCreditsStatus(user),
      orgs: orgs.map((o) => ({ ...publicOrg(o.org), role: o.role })),
      unreadNotifications: unread?.n ?? 0,
    };
  });

  app.patch(
    '/v1/me',
    {
      schema: {
        tags: ['me'],
        summary: 'Update my profile',
        body: z.object({
          displayName: z.string().min(2).max(40).optional(),
          username: z.string().regex(/^[a-zA-Z0-9_]{3,20}$/).optional(),
          bio: z.string().max(280).nullable().optional(),
          homeCountry: z.string().length(2).nullable().optional(),
          avatar: z
            .object({ face: z.string().min(1).max(8), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), accessory: z.string().max(8).optional(), style: z.enum(['classic', 'bubble', 'pixel', 'neon', 'ghost']).optional() })
            .nullable()
            .optional(),
        }),
      },
    },
    async (req) => {
      const user = requireUser(req);
      const set: Partial<typeof schema.users.$inferInsert> = { updatedAt: new Date() };
      if (req.body.displayName) set.displayName = stripText(req.body.displayName, 40);
      if (req.body.bio !== undefined) set.bio = req.body.bio ? stripText(req.body.bio, 280) : null;
      if (req.body.avatar !== undefined) set.avatar = req.body.avatar;
      if (req.body.homeCountry !== undefined) set.homeCountry = req.body.homeCountry?.toUpperCase() ?? null;
      if (req.body.username && req.body.username.toLowerCase() !== user.username.toLowerCase()) {
        // Your username is your public handle (flatmeta.io/@handle): reserved and look-alike names are refused.
        const blocked = await handleBlocked(req.body.username, { exceptUserId: user.id });
        if (blocked) throw conflict(blocked);
        set.username = req.body.username;
      }
      const text = [set.displayName, set.username, set.bio].filter(Boolean).join('\n');
      if (text) {
        const mod = await checkContent('user', user.id, text);
        if (mod.status === 'flagged') throw badRequest('Please choose a different name or bio.');
      }
      const [updated] = await db.update(schema.users).set(set).where(eq(schema.users.id, user.id)).returning();
      return { user: privateUser(updated!) };
    },
  );

  app.post('/v1/me/avatar', { schema: { tags: ['me'], summary: 'Upload an avatar (multipart "file")' } }, async (req) => {
    const user = requireUser(req);
    const file = await req.file();
    if (!file) throw badRequest('Attach an image in the "file" field');
    const img = await storeImage(await file.toBuffer(), { ownerUserId: user.id, source: 'upload', folder: 'avatars' });
    const [updated] = await db.update(schema.users).set({ avatarUrl: img.thumbUrl }).where(eq(schema.users.id, user.id)).returning();
    return { user: privateUser(updated!) };
  });

  app.get('/v1/me/plots', { schema: { tags: ['me'], summary: 'Plots I own (personally or through my organisations)' } }, async (req) => {
    const user = requireUser(req);
    const orgIds = (await db.select({ id: schema.orgMembers.orgId }).from(schema.orgMembers).where(eq(schema.orgMembers.userId, user.id))).map((r) => r.id);
    const P = schema.plots;
    const rows = await db
      .select()
      .from(P)
      .where(and(or(eq(P.ownerUserId, user.id), orgIds.length ? inArray(P.ownerOrgId, orgIds) : sql`false`), inArray(P.status, ['active', 'pending_payment', 'hidden'])))
      .orderBy(desc(P.createdAt));
    const owners = await ownersFor(rows);
    return { plots: rows.map((p) => plotView(p, owners.get(p.id) ?? null, { canEdit: true })) };
  });

  app.get('/v1/me/progress', { schema: { tags: ['me'], summary: 'XP, level, quests and achievements' } }, async (req) => progressFor(requireUser(req).id));

  app.post('/v1/me/checkin', { schema: { tags: ['me'], summary: 'Daily check-in (grows your streak)' } }, async (req) => {
    const user = requireUser(req);
    const today = dayKey();
    if (user.lastCheckin === today) return { checkedIn: false, streak: user.streak, game: null };
    const streak = user.lastCheckin === addDays(today, -1) ? user.streak + 1 : 1;
    const [marked] = await db
      .update(schema.users)
      .set({ lastCheckin: today, streak })
      .where(and(eq(schema.users.id, user.id), or(isNull(schema.users.lastCheckin), sql`${schema.users.lastCheckin} <> ${today}`)))
      .returning({ id: schema.users.id });
    if (!marked) return { checkedIn: false, streak: user.streak, game: null };
    const game = await recordAction(user.id, 'checkin', { ref: today, amount: 10 * Math.min(streak, 7) });
    return { checkedIn: true, streak, game };
  });

  app.post('/v1/me/quests/:id/claim', { schema: { tags: ['me'], summary: 'Claim a completed quest reward', params: z.object({ id: z.uuid() }) } }, async (req) => {
    const user = requireUser(req);
    const game = await claimQuest(user.id, req.params.id);
    if (!game) throw badRequest('This quest is not ready to claim');
    return { game };
  });

  app.post('/v1/me/tour', { schema: { tags: ['me'], summary: 'Mark the guided tour as done' } }, async (req) => {
    const user = requireUser(req);
    return { game: await recordAction(user.id, 'take_tour', { ref: 'tour' }) };
  });

  app.post(
    '/v1/me/share',
    { schema: { tags: ['me'], summary: 'Record a share (XP + quests)', body: z.object({ plotId: z.uuid().optional(), target: z.string().max(40).optional(), channel: z.string().max(20).optional() }) } },
    async (req) => {
      const user = requireUser(req);
      const ref = `${req.body.plotId ?? req.body.target ?? 'site'}:${req.body.channel ?? 'link'}`;
      return { game: await recordAction(user.id, 'share', { ref }) };
    },
  );

  // Where to start the map: saved spot (signed in), else Cloudflare's approximate location, else the country
  // centre, else the Home plaza. Nothing is stored and the request isn't logged (no IP, no coordinates in logs).
  app.get(
    '/v1/me/approx-location',
    { logLevel: 'warn', schema: { tags: ['me'], summary: 'Start position for the map (saved, approximate from the network, or a safe default)' } },
    async (req, reply) => {
      reply.header('cache-control', 'private, no-store');
      let saved: { lat: number | null; lng: number | null } | null = null;
      if (req.user) {
        const [u] = await db.select({ lat: schema.users.lastLat, lng: schema.users.lastLng }).from(schema.users).where(eq(schema.users.id, req.user.id));
        saved = u ?? null;
      }
      return resolveStart({
        saved,
        headers: req.headers,
        countryCentre: async (code) => {
          const [c] = await db.select({ lat: schema.countries.lat, lng: schema.countries.lng }).from(schema.countries).where(eq(schema.countries.code, code));
          return c ?? null;
        },
      });
    },
  );

  // ── Handles: flatmeta.io/@handle (G5) ──
  app.get(
    '/v1/handles/:handle',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } }, schema: { tags: ['me'], summary: 'Who a @handle is and their public plots', params: z.object({ handle: z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/) }) } },
    async (req) => {
      const target = await resolveHandle(req.params.handle);
      if (!target) throw notFound('Handle');
      return target;
    },
  );

  app.get(
    '/v1/handles/:handle/available',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { tags: ['me'], summary: 'Can I take this handle?', params: z.object({ handle: z.string().min(1).max(40) }) } },
    async (req) => {
      const user = requireUser(req);
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(req.params.handle)) return { available: false, reason: '3 to 20 letters, numbers or underscores.' };
      const reason = await handleBlocked(req.params.handle, { exceptUserId: user.id });
      return { available: !reason, reason };
    },
  );

  app.get('/v1/me/notifications', { schema: { tags: ['me'], summary: 'My notifications' } }, async (req) => {
    const user = requireUser(req);
    const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, user.id)).orderBy(desc(schema.notifications.createdAt)).limit(50);
    return { notifications: rows };
  });

  app.post('/v1/me/notifications/read', { schema: { tags: ['me'], summary: 'Mark notifications read', body: z.object({ ids: z.array(z.uuid()).optional() }) } }, async (req) => {
    const user = requireUser(req);
    const N = schema.notifications;
    await db
      .update(N)
      .set({ readAt: new Date() })
      .where(and(eq(N.userId, user.id), isNull(N.readAt), ...(req.body.ids?.length ? [inArray(N.id, req.body.ids)] : [])));
    return { ok: true };
  });

  // ── API keys ──
  app.get('/v1/me/api-keys', { schema: { tags: ['me'], summary: 'My API keys' } }, async (req) => {
    const user = requireUser(req);
    const keys = await db
      .select({ id: schema.apiKeys.id, name: schema.apiKeys.name, prefix: schema.apiKeys.prefix, scopes: schema.apiKeys.scopes, orgId: schema.apiKeys.orgId, lastUsedAt: schema.apiKeys.lastUsedAt, createdAt: schema.apiKeys.createdAt })
      .from(schema.apiKeys)
      .where(and(eq(schema.apiKeys.userId, user.id), isNull(schema.apiKeys.revokedAt)))
      .orderBy(desc(schema.apiKeys.createdAt));
    return { keys };
  });

  app.post(
    '/v1/me/api-keys',
    {
      schema: {
        tags: ['me'],
        summary: 'Create an API key (shown once)',
        body: z.object({ name: z.string().min(1).max(60), scopes: z.array(z.enum(['plots:read', 'plots:write', '*'])).default(['plots:read', 'plots:write']), orgId: z.uuid().optional() }),
      },
    },
    async (req) => {
      const user = requireUser(req);
      if (req.authKind === 'apikey') throw badRequest('Create keys from the dashboard, not with another key');
      const k = newApiKey();
      const [row] = await db
        .insert(schema.apiKeys)
        .values({ userId: user.id, orgId: req.body.orgId ?? null, name: stripText(req.body.name, 60), prefix: k.prefix, keyHash: k.hash, scopes: req.body.scopes })
        .returning();
      return { key: { id: row!.id, name: row!.name, prefix: row!.prefix, scopes: row!.scopes, createdAt: row!.createdAt }, secret: k.raw };
    },
  );

  app.delete('/v1/me/api-keys/:id', { schema: { tags: ['me'], summary: 'Revoke an API key', params: z.object({ id: z.uuid() }) } }, async (req) => {
    const user = requireUser(req);
    await db.update(schema.apiKeys).set({ revokedAt: new Date() }).where(and(eq(schema.apiKeys.id, req.params.id), eq(schema.apiKeys.userId, user.id)));
    return { ok: true };
  });

}
