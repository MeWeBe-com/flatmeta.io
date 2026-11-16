import { emailUser, quietly, templates } from '../email/index.js';
import { and, eq, inArray } from 'drizzle-orm';
import { getDomain } from 'tldts';
import { db, schema } from '../db/client.js';
import type { Order, User } from '../db/schema.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { claimPriceCents } from '../lib/pricing.js';
import { uniqueSlug } from '../lib/slug.js';
import { notify, publishActivity } from '../game/activity.js';
import { unlock } from '../game/engine.js';
import { afterClaim } from './plots.js';
import { createCheckout } from './billing.js';

export const BRAND_GRANT_DAYS = 90;

export const registrableDomain = (hostOrEmail: string) => {
  const host = hostOrEmail.includes('@') ? hostOrEmail.split('@')[1]! : hostOrEmail;
  return getDomain(host) ?? host.toLowerCase();
};

export function emailMatchesWebsite(email: string, website: string): boolean {
  try {
    const site = registrableDomain(new URL(website).hostname);
    return registrableDomain(email) === site;
  } catch {
    return false;
  }
}

async function orgSlugExists(s: string) {
  const [hit] = await db.select({ id: schema.organizations.id }).from(schema.organizations).where(eq(schema.organizations.slug, s));
  return !!hit;
}

/** Finds the user's organisation for this domain, or creates a verified one with them as owner. */
export async function verifiedOrgFor(user: User, orgName: string, website: string): Promise<string> {
  const domain = registrableDomain(new URL(website).hostname);
  const mine = await db
    .select({ id: schema.organizations.id })
    .from(schema.organizations)
    .innerJoin(schema.orgMembers, eq(schema.orgMembers.orgId, schema.organizations.id))
    .where(and(eq(schema.organizations.domain, domain), eq(schema.orgMembers.userId, user.id), inArray(schema.orgMembers.role, ['owner', 'admin'])));
  if (mine[0]) {
    await db.update(schema.organizations).set({ verifiedAt: new Date() }).where(eq(schema.organizations.id, mine[0].id));
    return mine[0].id;
  }
  const slug = await uniqueSlug(orgName, orgSlugExists);
  const [org] = await db
    .insert(schema.organizations)
    .values({ slug, name: orgName, kind: 'brand', website, domain, verifiedAt: new Date() })
    .returning();
  await db.insert(schema.orgMembers).values({ orgId: org!.id, userId: user.id, role: 'owner' });
  return org!.id;
}

export async function landmarkCheckout(user: User, requestId: string) {
  const [req] = await db.select().from(schema.claimRequests).where(eq(schema.claimRequests.id, requestId));
  if (!req) throw notFound('Claim request');
  if (req.userId !== user.id) throw forbidden();
  if (req.status !== 'verified' && req.status !== 'approved') throw badRequest('This claim is not verified yet');
  const [plot] = await db.select().from(schema.plots).where(eq(schema.plots.id, req.plotId));
  if (!plot || plot.kind !== 'showcase' || plot.status !== 'showcase') throw badRequest('This showcase plot is no longer available');
  const orgId = req.orgId ?? (await verifiedOrgFor(user, req.orgName, plot.showcase!.website));
  if (!req.orgId) await db.update(schema.claimRequests).set({ orgId, updatedAt: new Date() }).where(eq(schema.claimRequests.id, req.id));
  return createCheckout({
    user,
    orgId,
    kind: 'landmark',
    plotId: plot.id,
    items: [{ type: 'landmark', description: `Landmark claim: ${plot.showcase!.brand} on FlatMeta (includes 3 months of Brand)`, amountCents: claimPriceCents(), meta: { claimRequestId: req.id } }],
    successPath: `/dashboard/plots/${plot.id}?welcome=landmark`,
    cancelPath: `/claim/${plot.slug}`,
  });
}

/** Called when the Landmark order is paid: the showcase plot becomes the organisation's (with 3 months of Brand). */
export async function completeLandmarkClaim(order: Order) {
  const requestId = order.items[0]?.meta?.claimRequestId as string | undefined;
  if (!order.plotId || !order.orgId) return;
  await transferClaimedPlot({ plotId: order.plotId, orgId: order.orgId, userId: order.userId, requestId, grantBrand: true, key: `landmark-${order.id}` });
}

/**
 * GL3b: a free claim (COMPANY_CLAIM_PRICE_CENTS=0). Once staff are verified the reserved plot becomes their
 * organisation's verified page at once (no plan granted); the editor then offers Business.
 */
export async function completeFreeClaim(user: User, requestId: string) {
  const [req] = await db.select().from(schema.claimRequests).where(eq(schema.claimRequests.id, requestId));
  if (!req) throw notFound('Claim request');
  if (req.userId !== user.id) throw forbidden();
  if (req.status !== 'verified' && req.status !== 'approved') throw badRequest('This claim is not verified yet');
  const [plot] = await db.select().from(schema.plots).where(eq(schema.plots.id, req.plotId));
  if (!plot || plot.kind !== 'showcase' || plot.status !== 'showcase') throw badRequest('This showcase plot is no longer available');
  const orgId = req.orgId ?? (await verifiedOrgFor(user, req.orgName, plot.showcase!.website));
  await transferClaimedPlot({ plotId: plot.id, orgId, userId: user.id, requestId: req.id, grantBrand: false, key: `claim-${req.id}` });
  return { plotId: plot.id, redirect: `/dashboard/plots/${plot.id}?welcome=claimed` };
}

async function transferClaimedPlot(o: { plotId: string; orgId: string; userId: string | null; requestId?: string; grantBrand: boolean; key: string }) {
  const order = { plotId: o.plotId, orgId: o.orgId, userId: o.userId, id: o.key };
  const requestId = o.requestId;
  const [plot] = await db.select().from(schema.plots).where(eq(schema.plots.id, o.plotId));
  if (!plot || plot.kind !== 'showcase') return;
  const [updated] = await db
    .update(schema.plots)
    .set({
      kind: 'landmark',
      status: 'active',
      ownerOrgId: order.orgId,
      ownerUserId: order.userId,
      showcase: null,
      publishedAt: new Date(),
      lastEditedAt: new Date(),
      title: plot.showcase?.brand ?? plot.title,
      updatedAt: new Date(),
    })
    .where(eq(schema.plots.id, plot.id))
    .returning();
  await db
    .update(schema.organizations)
    .set(o.grantBrand ? { plan: 'brand', planUntil: new Date(Date.now() + BRAND_GRANT_DAYS * 86400_000), verifiedAt: new Date(), updatedAt: new Date() } : { verifiedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.organizations.id, order.orgId));
  if (requestId) await db.update(schema.claimRequests).set({ status: 'completed', updatedAt: new Date() }).where(eq(schema.claimRequests.id, requestId));
  if (order.userId) {
    await unlock(order.userId, 'brand-verified');
    await notify(order.userId, 'landmark', { plotId: plot.id, title: updated?.title });
    if (updated) await quietly(emailUser(order.userId, templates.landmarkReady(updated), { idempotencyKey: order.id }));
  }
  if (updated) {
    await afterClaim(updated, order.userId);
    await publishActivity({ kind: 'landmark_verified', actorUserId: order.userId, plotId: updated.id, countryCode: updated.countryCode, lat: updated.centerLat, lng: updated.centerLng, payload: { title: updated.title, slug: updated.slug } });
  }
}
