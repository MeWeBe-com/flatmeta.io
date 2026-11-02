import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from '../app.js';
import { config, devCodeEcho } from '../config.js';
import { db, schema } from '../db/client.js';
import { requireUser } from '../lib/auth.js';
import { hashToken, randomToken } from '../lib/crypto.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { sendNoticeEmail } from '../lib/mail.js';
import { safeUrl, stripText } from '../lib/markdown.js';
import { uniqueSlug } from '../lib/slug.js';
import { ownersFor, orgRole, plotView, publicOrg } from './views.js';

async function slugExists(s: string) {
  const [hit] = await db.select({ id: schema.organizations.id }).from(schema.organizations).where(eq(schema.organizations.slug, s));
  return !!hit;
}

async function requireOrgRole(userId: string, orgId: string, roles: string[]) {
  const role = await orgRole(userId, orgId);
  if (!role || !roles.includes(role)) throw forbidden('You need a higher role in this organisation');
  return role;
}

export default async function orgRoutes(app: App) {
  app.post(
    '/v1/orgs',
    {
      schema: {
        tags: ['orgs'],
        summary: 'Create an organisation (you become its owner)',
        body: z.object({ name: z.string().min(2).max(100), kind: z.enum(['business', 'brand', 'nonprofit', 'other']).default('business'), website: z.string().max(200).optional(), description: z.string().max(1000).optional() }),
      },
    },
    async (req) => {
      const user = requireUser(req);
      const website = safeUrl(req.body.website);
      const slug = await uniqueSlug(req.body.name, slugExists);
      const [org] = await db
        .insert(schema.organizations)
        .values({ slug, name: stripText(req.body.name, 100), kind: req.body.kind, website, domain: website ? new URL(website).hostname.replace(/^www\./, '') : null, description: req.body.description ? stripText(req.body.description, 1000) : null })
        .returning();
      await db.insert(schema.orgMembers).values({ orgId: org!.id, userId: user.id, role: 'owner' });
      return { org: { ...publicOrg(org!), role: 'owner' } };
    },
  );

  app.get('/v1/orgs/:slug', { schema: { tags: ['orgs'], summary: 'Organisation profile', params: z.object({ slug: z.string().max(80) }) } }, async (req) => {
    const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.slug, req.params.slug));
    if (!org) throw notFound('Organisation');
    const P = schema.plots;
    const plots = await db.select().from(P).where(and(eq(P.ownerOrgId, org.id), eq(P.status, 'active'))).orderBy(desc(P.likesCount)).limit(50);
    const owners = await ownersFor(plots);
    const myRole = req.user ? await orgRole(req.user.id, org.id) : null;
    return { org: publicOrg(org), plots: plots.map((p) => plotView(p, owners.get(p.id) ?? null)), myRole };
  });

  app.patch(
    '/v1/orgs/:id',
    { schema: { tags: ['orgs'], summary: 'Update an organisation', params: z.object({ id: z.uuid() }), body: z.object({ name: z.string().min(2).max(100).optional(), website: z.string().max(200).nullable().optional(), description: z.string().max(1000).nullable().optional() }) } },
    async (req) => {
      const user = requireUser(req);
      await requireOrgRole(user.id, req.params.id, ['owner', 'admin']);
      const set: Partial<typeof schema.organizations.$inferInsert> = { updatedAt: new Date() };
      if (req.body.name) set.name = stripText(req.body.name, 100);
      if (req.body.description !== undefined) set.description = req.body.description ? stripText(req.body.description, 1000) : null;
      if (req.body.website !== undefined) {
        const w = safeUrl(req.body.website);
        set.website = w;
        set.domain = w ? new URL(w).hostname.replace(/^www\./, '') : null;
        set.verifiedAt = null; // changing the website needs re-verification
      }
      const [org] = await db.update(schema.organizations).set(set).where(eq(schema.organizations.id, req.params.id)).returning();
      return { org: publicOrg(org!) };
    },
  );

  app.get('/v1/orgs/:id/members', { schema: { tags: ['orgs'], summary: 'Members and pending invites', params: z.object({ id: z.uuid() }) } }, async (req) => {
    const user = requireUser(req);
    await requireOrgRole(user.id, req.params.id, ['owner', 'admin', 'editor']);
    const members = await db
      .select({ role: schema.orgMembers.role, joinedAt: schema.orgMembers.createdAt, id: schema.users.id, username: schema.users.username, displayName: schema.users.displayName, avatarUrl: schema.users.avatarUrl, email: schema.users.email })
      .from(schema.orgMembers)
      .innerJoin(schema.users, eq(schema.orgMembers.userId, schema.users.id))
      .where(eq(schema.orgMembers.orgId, req.params.id));
    const invites = await db
      .select({ id: schema.orgInvites.id, email: schema.orgInvites.email, role: schema.orgInvites.role, expiresAt: schema.orgInvites.expiresAt })
      .from(schema.orgInvites)
      .where(and(eq(schema.orgInvites.orgId, req.params.id), isNull(schema.orgInvites.acceptedAt), gt(schema.orgInvites.expiresAt, new Date())));
    return { members, invites };
  });

  app.post(
    '/v1/orgs/:id/invites',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } }, schema: { tags: ['orgs'], summary: 'Invite a member by email', params: z.object({ id: z.uuid() }), body: z.object({ email: z.email().max(200), role: z.enum(['admin', 'editor']).default('editor') }) } },
    async (req) => {
      const user = requireUser(req);
      await requireOrgRole(user.id, req.params.id, ['owner', 'admin']);
      const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, req.params.id));
      const token = randomToken(24);
      await db.insert(schema.orgInvites).values({ orgId: req.params.id, email: req.body.email.toLowerCase(), role: req.body.role, tokenHash: hashToken(token), invitedBy: user.id, expiresAt: new Date(Date.now() + 14 * 86400_000) });
      const link = `${config.APP_URL}/dashboard/orgs?invite=${token}`;
      await sendNoticeEmail(req.body.email, `Join ${org?.name} on FlatMeta`, `${user.displayName} invited you to help manage ${org?.name} on FlatMeta.\n\nAccept the invite: ${link}\n\nThe link works for 14 days.`);
      return { ok: true, ...(devCodeEcho() ? { devLink: link } : {}) };
    },
  );

  app.post('/v1/orgs/invites/accept', { schema: { tags: ['orgs'], summary: 'Accept an invite', body: z.object({ token: z.string().min(10).max(100) }) } }, async (req) => {
    const user = requireUser(req);
    const [invite] = await db
      .select()
      .from(schema.orgInvites)
      .where(and(eq(schema.orgInvites.tokenHash, hashToken(req.body.token)), isNull(schema.orgInvites.acceptedAt), gt(schema.orgInvites.expiresAt, new Date())));
    if (!invite) throw badRequest('This invite is invalid or has expired');
    await db.insert(schema.orgMembers).values({ orgId: invite.orgId, userId: user.id, role: invite.role }).onConflictDoNothing();
    await db.update(schema.orgInvites).set({ acceptedAt: new Date() }).where(eq(schema.orgInvites.id, invite.id));
    const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, invite.orgId));
    return { org: publicOrg(org!) };
  });

  app.delete('/v1/orgs/:id/members/:userId', { schema: { tags: ['orgs'], summary: 'Remove a member', params: z.object({ id: z.uuid(), userId: z.uuid() }) } }, async (req) => {
    const user = requireUser(req);
    const self = req.params.userId === user.id;
    if (!self) await requireOrgRole(user.id, req.params.id, ['owner', 'admin']);
    const targetRole = await orgRole(req.params.userId, req.params.id);
    if (targetRole === 'owner') throw badRequest('The owner cannot be removed');
    await db.delete(schema.orgMembers).where(and(eq(schema.orgMembers.orgId, req.params.id), eq(schema.orgMembers.userId, req.params.userId)));
    return { ok: true };
  });
}
