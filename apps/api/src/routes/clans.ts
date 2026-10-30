import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from '../app.js';
import { db, schema } from '../db/client.js';
import { requireUser } from '../lib/auth.js';
import { answerRequest, clanDetail, clanLeaderboard, clanView, createClan, disband, invite, kick, leaveClan, listClans, membershipOf, myInvites, requestToJoin, setRole, transferLeadership, updateClan } from '../services/clans.js';

const emblem = z.object({ icon: z.string().max(20), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) });
const slugParam = z.object({ slug: z.string().max(40) });
const userParam = z.object({ slug: z.string().max(40), username: z.string().max(20) });

export default async function clanRoutes(app: App) {
  const tags = ['clans'];
  const me = async (req: Parameters<typeof requireUser>[0]) => (await db.select().from(schema.users).where(eq(schema.users.id, requireUser(req).id)))[0]!;

  app.get('/v1/clans', { schema: { tags, summary: 'Find clans', querystring: z.object({ q: z.string().max(40).optional(), limit: z.coerce.number().int().min(1).max(50).default(24), offset: z.coerce.number().int().min(0).default(0) }) } }, async (req) => ({
    clans: await listClans({ search: req.query.q, limit: req.query.limit, offset: req.query.offset }),
  }));

  app.get('/v1/clans/leaderboard', { schema: { tags, summary: 'Clans ranked by total member XP' } }, async () => ({ clans: await clanLeaderboard() }));

  app.get('/v1/clans/mine', { schema: { tags, summary: 'My clan (or null) and my pending invites' } }, async (req) => {
    const user = requireUser(req);
    const m = await membershipOf(user.id);
    const clan = m ? (await db.select().from(schema.clans).where(eq(schema.clans.id, m.clanId)))[0] : null;
    return { clan: clan ? await clanView(clan) : null, role: m?.role ?? null, invites: await myInvites(await me(req)) };
  });

  app.get('/v1/clans/:slug', { schema: { tags, summary: 'A clan page', params: slugParam } }, async (req) => clanDetail(req.params.slug, req.user ? await me(req) : null));

  app.post('/v1/clans', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } }, schema: { tags, summary: 'Found a clan', body: z.object({ name: z.string().min(3).max(30), tag: z.string().min(2).max(6), description: z.string().max(280).nullish(), emblem: emblem.optional() }) } }, async (req) => ({
    clan: await clanView(await createClan(await me(req), req.body)),
  }));

  app.patch('/v1/clans/:slug', { schema: { tags, summary: 'Edit description or emblem (officers)', params: slugParam, body: z.object({ description: z.string().max(280).nullable().optional(), emblem: emblem.optional() }) } }, async (req) => ({
    clan: await clanView(await updateClan(await me(req), req.params.slug, req.body)),
  }));

  app.delete('/v1/clans/:slug', { schema: { tags, summary: 'Disband (leader)', params: slugParam } }, async (req) => {
    await disband(await me(req), req.params.slug);
    return { ok: true };
  });

  app.post('/v1/clans/:slug/join', { schema: { tags, summary: 'Ask to join', params: slugParam } }, async (req) => requestToJoin(await me(req), req.params.slug));
  app.post('/v1/clans/:slug/invite', { schema: { tags, summary: 'Invite a player (officers)', params: slugParam, body: z.object({ username: z.string().min(3).max(20) }) } }, async (req) => invite(await me(req), req.params.slug, req.body.username));
  app.post('/v1/clans/leave', { schema: { tags, summary: 'Leave my clan' } }, async (req) => leaveClan(await me(req)));
  app.post('/v1/clan-requests/:id/accept', { schema: { tags, summary: 'Accept an invite (invitee) or join request (officers)', params: z.object({ id: z.uuid() }) } }, async (req) => answerRequest(await me(req), req.params.id, true));
  app.post('/v1/clan-requests/:id/decline', { schema: { tags, summary: 'Decline an invite or join request', params: z.object({ id: z.uuid() }) } }, async (req) => answerRequest(await me(req), req.params.id, false));

  app.put('/v1/clans/:slug/members/:username/role', { schema: { tags, summary: 'Promote or demote (leader)', params: userParam, body: z.object({ role: z.enum(['officer', 'member']) }) } }, async (req) => {
    await setRole(await me(req), req.params.slug, req.params.username, req.body.role);
    return { ok: true };
  });
  app.delete('/v1/clans/:slug/members/:username', { schema: { tags, summary: 'Remove a member ranked below you', params: userParam } }, async (req) => {
    await kick(await me(req), req.params.slug, req.params.username);
    return { ok: true };
  });
  app.post('/v1/clans/:slug/transfer/:username', { schema: { tags, summary: 'Hand leadership to a member', params: userParam } }, async (req) => {
    await transferLeadership(await me(req), req.params.slug, req.params.username);
    return { ok: true };
  });
}
