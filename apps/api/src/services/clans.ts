import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { emailUser, quietly, templates } from '../email/index.js';
import type { Clan, User } from '../db/schema.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { stripText } from '../lib/markdown.js';
import { slugify, uniqueSlug } from '../lib/slug.js';
import { notify, publishActivity } from '../game/activity.js';
import { recordAction, unlock } from '../game/engine.js';

export const MAX_CLAN_MEMBERS = 50;
const MIN_LEVEL_TO_FOUND = 2;
const EMBLEM_ICONS = ['shield', 'castle', 'flame', 'star', 'globe', 'rocket', 'crown', 'compass', 'gem', 'sun'];

export interface ClanInput {
  name: string;
  tag: string;
  description?: string | null;
  emblem?: { icon: string; color: string };
}

const rank = { leader: 3, officer: 2, member: 1 } as const;
type Role = keyof typeof rank;

export async function membershipOf(userId: string) {
  const [m] = await db.select().from(schema.clanMembers).where(eq(schema.clanMembers.userId, userId));
  return m ?? null;
}

async function clanBySlug(slug: string): Promise<Clan> {
  const [c] = await db.select().from(schema.clans).where(eq(schema.clans.slug, slug));
  if (!c) throw notFound('Clan');
  return c;
}

async function roleIn(clanId: string, userId: string): Promise<Role | null> {
  const [m] = await db.select().from(schema.clanMembers).where(and(eq(schema.clanMembers.clanId, clanId), eq(schema.clanMembers.userId, userId)));
  return (m?.role as Role | undefined) ?? null;
}

const needRole = (have: Role | null, min: Role) => {
  if (!have || rank[have] < rank[min]) throw forbidden(min === 'leader' ? 'Only the clan leader can do that.' : 'Only clan officers and the leader can do that.');
};

async function recount(clanId: string) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.clanMembers).where(eq(schema.clanMembers.clanId, clanId));
  await db.update(schema.clans).set({ memberCount: r?.n ?? 0 }).where(eq(schema.clans.id, clanId));
  return r?.n ?? 0;
}

export async function createClan(me: User, input: ClanInput): Promise<Clan> {
  if (me.level < MIN_LEVEL_TO_FOUND) throw forbidden(`Reach level ${MIN_LEVEL_TO_FOUND} to found a clan. Claim land, take the tour or finish a quest to level up.`);
  if (await membershipOf(me.id)) throw conflict('You are already in a clan. Leave it first.');
  const name = stripText(input.name, 30).trim();
  const tag = input.tag.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (name.length < 3) throw badRequest('Clan names need at least 3 characters.');
  if (tag.length < 2 || tag.length > 4) throw badRequest('Tags are 2 to 4 letters or digits.');
  const [dupe] = await db.select({ id: schema.clans.id }).from(schema.clans).where(sql`lower(${schema.clans.name}) = lower(${name}) or upper(${schema.clans.tag}) = ${tag}`);
  if (dupe) throw conflict('That clan name or tag is taken.');
  const icon = input.emblem && EMBLEM_ICONS.includes(input.emblem.icon) ? input.emblem.icon : 'shield';
  const color = input.emblem && /^#[0-9a-fA-F]{6}$/.test(input.emblem.color) ? input.emblem.color : '#2DE2C4';
  const slug = await uniqueSlug(slugify(name, 30) || 'clan', async (s) => !!(await db.select({ id: schema.clans.id }).from(schema.clans).where(eq(schema.clans.slug, s)))[0]);
  const clan = await db.transaction(async (tx) => {
    const [c] = await tx
      .insert(schema.clans)
      .values({ slug, name, tag, description: input.description ? stripText(input.description, 280) : null, emblem: { icon, color }, leaderUserId: me.id, memberCount: 1 })
      .returning();
    await tx.insert(schema.clanMembers).values({ clanId: c!.id, userId: me.id, role: 'leader' });
    return c!;
  });
  await recordAction(me.id, 'create_clan', { ref: clan.id });
  await unlock(me.id, 'clan-founder');
  await publishActivity({ kind: 'clan_created', actorUserId: me.id, payload: { clan: clan.name, slug: clan.slug, tag: clan.tag } });
  return clan;
}

async function addMember(clan: Clan, userId: string) {
  if (await membershipOf(userId)) throw conflict('That player is already in a clan.');
  if (clan.memberCount >= MAX_CLAN_MEMBERS) throw conflict(`This clan is full (${MAX_CLAN_MEMBERS} members).`);
  await db.insert(schema.clanMembers).values({ clanId: clan.id, userId, role: 'member' });
  const n = await recount(clan.id);
  await recordAction(userId, 'join_clan', { ref: clan.id });
  await unlock(userId, 'clan-member');
  if (n >= 10 && clan.leaderUserId) await unlock(clan.leaderUserId, 'ten-strong');
  const [u] = await db.select({ username: schema.users.username, displayName: schema.users.displayName }).from(schema.users).where(eq(schema.users.id, userId));
  await publishActivity({ kind: 'clan_joined', actorUserId: userId, payload: { clan: clan.name, slug: clan.slug, tag: clan.tag } });
  if (clan.leaderUserId && clan.leaderUserId !== userId) await notify(clan.leaderUserId, 'clan_member', { clan: clan.name, slug: clan.slug, who: u?.displayName });
}

/** A player asks to join. The leader or an officer decides. */
export async function requestToJoin(me: User, slug: string) {
  const clan = await clanBySlug(slug);
  if (await membershipOf(me.id)) throw conflict('You are already in a clan. Leave it first.');
  if (clan.memberCount >= MAX_CLAN_MEMBERS) throw conflict('This clan is full.');
  const [open] = await db.select().from(schema.clanRequests).where(and(eq(schema.clanRequests.clanId, clan.id), eq(schema.clanRequests.userId, me.id), eq(schema.clanRequests.status, 'pending')));
  if (open) throw conflict(open.kind === 'invite' ? 'You already have an invite from this clan: accept it.' : 'Your request is already waiting.');
  const [row] = await db.insert(schema.clanRequests).values({ clanId: clan.id, userId: me.id, kind: 'join_request' }).returning();
  const staff = await db.select({ userId: schema.clanMembers.userId }).from(schema.clanMembers).where(and(eq(schema.clanMembers.clanId, clan.id), inArray(schema.clanMembers.role, ['leader', 'officer'])));
  for (const s of staff) await notify(s.userId, 'clan_request', { clan: clan.name, slug: clan.slug, requestId: row!.id, from: me.displayName });
  return { id: row!.id, status: 'pending' as const };
}

export async function invite(me: User, slug: string, username: string) {
  const clan = await clanBySlug(slug);
  needRole(await roleIn(clan.id, me.id), 'officer');
  const [target] = await db.select().from(schema.users).where(eq(schema.users.username, username));
  if (!target || target.bannedAt) throw notFound('Player');
  if (await membershipOf(target.id)) throw conflict('That player is already in a clan.');
  const [open] = await db.select().from(schema.clanRequests).where(and(eq(schema.clanRequests.clanId, clan.id), eq(schema.clanRequests.userId, target.id), eq(schema.clanRequests.status, 'pending')));
  if (open?.kind === 'join_request') {
    await addMember(clan, target.id);
    await db.update(schema.clanRequests).set({ status: 'accepted' }).where(eq(schema.clanRequests.id, open.id));
    return { status: 'joined' as const };
  }
  if (open) throw conflict('Invite already sent.');
  const [row] = await db.insert(schema.clanRequests).values({ clanId: clan.id, userId: target.id, kind: 'invite' }).returning();
  await notify(target.id, 'clan_invite', { clan: clan.name, slug: clan.slug, requestId: row!.id, by: me.displayName });
  await quietly(emailUser(target.id, templates.clanInvite(me.displayName, clan), { idempotencyKey: `clan-invite-${row!.id}` }));
  return { status: 'invited' as const };
}

/** Accept or decline a request: invites are answered by the invited player, join requests by clan staff. */
export async function answerRequest(me: User, requestId: string, accept: boolean) {
  const [r] = await db.select().from(schema.clanRequests).where(and(eq(schema.clanRequests.id, requestId), eq(schema.clanRequests.status, 'pending')));
  if (!r) throw notFound('Request');
  const clan = (await db.select().from(schema.clans).where(eq(schema.clans.id, r.clanId)))[0];
  if (!clan) throw notFound('Clan');
  if (r.kind === 'invite') {
    if (r.userId !== me.id) throw forbidden();
  } else {
    needRole(await roleIn(clan.id, me.id), 'officer');
  }
  if (accept) await addMember(clan, r.userId);
  await db.update(schema.clanRequests).set({ status: accept ? 'accepted' : 'declined' }).where(eq(schema.clanRequests.id, r.id));
  if (r.kind === 'join_request') await notify(r.userId, accept ? 'clan_accepted' : 'clan_declined', { clan: clan.name, slug: clan.slug });
  return { status: accept ? ('accepted' as const) : ('declined' as const) };
}

export async function leaveClan(me: User) {
  const m = await membershipOf(me.id);
  if (!m) throw badRequest('You are not in a clan.');
  const clan = (await db.select().from(schema.clans).where(eq(schema.clans.id, m.clanId)))[0]!;
  await db.delete(schema.clanMembers).where(eq(schema.clanMembers.userId, me.id));
  const left = await recount(clan.id);
  if (left === 0) {
    await db.delete(schema.clans).where(eq(schema.clans.id, clan.id)); // nobody left: disband
    return { disbanded: true };
  }
  if (m.role === 'leader') {
    // The longest-serving officer (else member) takes over.
    const [next] = await db
      .select()
      .from(schema.clanMembers)
      .where(eq(schema.clanMembers.clanId, clan.id))
      .orderBy(sql`case ${schema.clanMembers.role} when 'officer' then 0 else 1 end`, asc(schema.clanMembers.joinedAt))
      .limit(1);
    await db.update(schema.clanMembers).set({ role: 'leader' }).where(and(eq(schema.clanMembers.clanId, clan.id), eq(schema.clanMembers.userId, next!.userId)));
    await db.update(schema.clans).set({ leaderUserId: next!.userId }).where(eq(schema.clans.id, clan.id));
    await notify(next!.userId, 'clan_leader', { clan: clan.name, slug: clan.slug });
  }
  return { disbanded: false };
}

export async function setRole(me: User, slug: string, username: string, role: 'officer' | 'member') {
  const clan = await clanBySlug(slug);
  needRole(await roleIn(clan.id, me.id), 'leader');
  const [target] = await db.select().from(schema.users).where(eq(schema.users.username, username));
  if (!target) throw notFound('Player');
  if (target.id === me.id) throw badRequest('You are the leader.');
  const res = await db.update(schema.clanMembers).set({ role }).where(and(eq(schema.clanMembers.clanId, clan.id), eq(schema.clanMembers.userId, target.id))).returning();
  if (!res.length) throw notFound('Member');
}

export async function kick(me: User, slug: string, username: string) {
  const clan = await clanBySlug(slug);
  const mine = await roleIn(clan.id, me.id);
  needRole(mine, 'officer');
  const [target] = await db.select().from(schema.users).where(eq(schema.users.username, username));
  if (!target) throw notFound('Player');
  const theirs = await roleIn(clan.id, target.id);
  if (!theirs) throw notFound('Member');
  if (rank[theirs] >= rank[mine!]) throw forbidden('You can only remove members ranked below you.');
  await db.delete(schema.clanMembers).where(and(eq(schema.clanMembers.clanId, clan.id), eq(schema.clanMembers.userId, target.id)));
  await recount(clan.id);
  await notify(target.id, 'clan_removed', { clan: clan.name });
}

export async function transferLeadership(me: User, slug: string, username: string) {
  const clan = await clanBySlug(slug);
  needRole(await roleIn(clan.id, me.id), 'leader');
  const [target] = await db.select().from(schema.users).where(eq(schema.users.username, username));
  if (!target || !(await roleIn(clan.id, target.id))) throw notFound('Member');
  await db.transaction(async (tx) => {
    await tx.update(schema.clanMembers).set({ role: 'officer' }).where(and(eq(schema.clanMembers.clanId, clan.id), eq(schema.clanMembers.userId, me.id)));
    await tx.update(schema.clanMembers).set({ role: 'leader' }).where(and(eq(schema.clanMembers.clanId, clan.id), eq(schema.clanMembers.userId, target.id)));
    await tx.update(schema.clans).set({ leaderUserId: target.id }).where(eq(schema.clans.id, clan.id));
  });
  await notify(target.id, 'clan_leader', { clan: clan.name, slug: clan.slug });
}

export async function updateClan(me: User, slug: string, patch: { description?: string | null; emblem?: { icon: string; color: string } }) {
  const clan = await clanBySlug(slug);
  needRole(await roleIn(clan.id, me.id), 'officer');
  const set: Partial<typeof schema.clans.$inferInsert> = {};
  if (patch.description !== undefined) set.description = patch.description ? stripText(patch.description, 280) : null;
  if (patch.emblem) {
    if (!EMBLEM_ICONS.includes(patch.emblem.icon) || !/^#[0-9a-fA-F]{6}$/.test(patch.emblem.color)) throw badRequest('Pick an emblem from the list.');
    set.emblem = patch.emblem;
  }
  if (!Object.keys(set).length) return clan;
  const [c] = await db.update(schema.clans).set(set).where(eq(schema.clans.id, clan.id)).returning();
  return c!;
}

export async function disband(me: User, slug: string) {
  const clan = await clanBySlug(slug);
  needRole(await roleIn(clan.id, me.id), 'leader');
  await db.delete(schema.clans).where(eq(schema.clans.id, clan.id));
}

// ─── Views and leaderboards ──────────────────────────────────────────────────

const clanStats = sql`
  select m.clan_id as clan_id,
         coalesce(sum(u.xp), 0)::int as xp,
         coalesce((select sum(p.cell_count) from plots p where p.status = 'active' and p.owner_user_id = any(array_agg(m.user_id)) and p.owner_org_id is null), 0)::int as cells
  from clan_members m join users u on u.id = m.user_id
  group by m.clan_id`;

export async function clanView(c: Clan) {
  const stats = (await db.execute(sql`select xp, cells from (${clanStats}) s where clan_id = ${c.id}`)).rows[0] as { xp: number; cells: number } | undefined;
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    tag: c.tag,
    description: c.description,
    emblem: c.emblem,
    memberCount: c.memberCount,
    maxMembers: MAX_CLAN_MEMBERS,
    xp: stats?.xp ?? 0,
    cells: stats?.cells ?? 0,
    createdAt: c.createdAt,
  };
}

export async function clanDetail(slug: string, viewer: User | null) {
  const clan = await clanBySlug(slug);
  const members = await db
    .select({ role: schema.clanMembers.role, joinedAt: schema.clanMembers.joinedAt, id: schema.users.id, username: schema.users.username, displayName: schema.users.displayName, avatar: schema.users.avatar, avatarUrl: schema.users.avatarUrl, level: schema.users.level, xp: schema.users.xp })
    .from(schema.clanMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.clanMembers.userId))
    .where(eq(schema.clanMembers.clanId, clan.id))
    .orderBy(sql`case ${schema.clanMembers.role} when 'leader' then 0 when 'officer' then 1 else 2 end`, desc(schema.users.xp));
  const myRole = viewer ? members.find((m) => m.id === viewer.id)?.role ?? null : null;
  const pending = viewer && !myRole ? (await db.select().from(schema.clanRequests).where(and(eq(schema.clanRequests.clanId, clan.id), eq(schema.clanRequests.userId, viewer.id), eq(schema.clanRequests.status, 'pending'))))[0] : null;
  const requests =
    myRole === 'leader' || myRole === 'officer'
      ? await db
          .select({ id: schema.clanRequests.id, createdAt: schema.clanRequests.createdAt, kind: schema.clanRequests.kind, username: schema.users.username, displayName: schema.users.displayName, level: schema.users.level })
          .from(schema.clanRequests)
          .innerJoin(schema.users, eq(schema.users.id, schema.clanRequests.userId))
          .where(and(eq(schema.clanRequests.clanId, clan.id), eq(schema.clanRequests.status, 'pending'), eq(schema.clanRequests.kind, 'join_request')))
      : [];
  return { clan: await clanView(clan), members, myRole, myPending: pending ? { id: pending.id, kind: pending.kind } : null, requests };
}

export async function clanLeaderboard(limit = 50) {
  const rows = (await db.execute(sql`
    select c.id, c.slug, c.name, c.tag, c.emblem, c.member_count as "memberCount", s.xp, s.cells
    from clans c join (${clanStats}) s on s.clan_id = c.id
    order by s.xp desc, c.member_count desc
    limit ${limit}`)).rows as { id: string; slug: string; name: string; tag: string; emblem: unknown; memberCount: number; xp: number; cells: number }[];
  return rows.map((r, i) => ({ rank: i + 1, ...r }));
}

export async function listClans(q: { search?: string; limit: number; offset: number }) {
  const rows = await db
    .select()
    .from(schema.clans)
    .where(q.search ? sql`${schema.clans.name} ilike ${'%' + q.search.replace(/[%_]/g, '') + '%'} or ${schema.clans.tag} ilike ${q.search.replace(/[%_]/g, '') + '%'}` : undefined)
    .orderBy(desc(schema.clans.memberCount), asc(schema.clans.name))
    .limit(q.limit)
    .offset(q.offset);
  return Promise.all(rows.map(clanView));
}

export async function myInvites(me: User) {
  return db
    .select({ id: schema.clanRequests.id, createdAt: schema.clanRequests.createdAt, clanSlug: schema.clans.slug, clanName: schema.clans.name, clanTag: schema.clans.tag })
    .from(schema.clanRequests)
    .innerJoin(schema.clans, eq(schema.clans.id, schema.clanRequests.clanId))
    .where(and(eq(schema.clanRequests.userId, me.id), eq(schema.clanRequests.kind, 'invite'), eq(schema.clanRequests.status, 'pending')));
}
