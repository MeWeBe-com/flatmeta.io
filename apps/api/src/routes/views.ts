import { forbidden } from '../lib/errors.js';
import { sectorLabel } from '../lib/sector.js';
import { contentModifiedAt, isIndexable } from '../lib/visibility.js';
import { visibleLogo } from '../companies/logos.js';
import { customHtmlGloballyDisabledCached, plotSandboxUrl } from '../services/custom-html.js';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import type { Organization, Plot, User } from '../db/schema.js';
import { countryName } from '../lib/geo.js';
import { rectBounds, threeWords } from '../lib/grid.js';
import { renderMarkdown } from '../lib/markdown.js';
import { levelTitle } from '../game/levels.js';

export interface OwnerView {
  type: 'user' | 'org';
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  level?: number;
  verified?: boolean;
  plan?: string;
}

export const publicUser = (u: Pick<User, 'id' | 'username' | 'displayName' | 'avatarUrl' | 'avatar' | 'level' | 'homeCountry' | 'bio' | 'xp' | 'plan' | 'createdAt'>) => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName,
  avatarUrl: u.avatarUrl,
  avatar: u.avatar ?? null,
  bio: u.bio,
  level: u.level,
  levelTitle: levelTitle(u.level),
  xp: u.xp,
  homeCountry: u.homeCountry,
  plan: u.plan,
  createdAt: u.createdAt,
});

export const privateUser = (u: User) => ({
  ...publicUser(u),
  email: u.email,
  role: u.role,
  streak: u.streak,
  lastCheckin: u.lastCheckin,
  homesteadUsed: u.homesteadUsed,
  hasPassword: !!u.passwordHash,
  weeklyEmail: u.weeklyEmail,
  bonusCells: u.bonusCells,
});

export const publicOrg = (o: Organization) => ({
  id: o.id,
  slug: o.slug,
  name: o.name,
  kind: o.kind,
  website: o.website,
  description: o.description,
  logoUrl: o.logoUrl,
  plan: o.plan,
  verified: !!o.verifiedAt,
  createdAt: o.createdAt,
});

const DORMANT_MS = 365 * 86400_000;

export function plotView(p: Plot, owner: OwnerView | null, extra: { likedByMe?: boolean; canEdit?: boolean; withHtml?: boolean } = {}) {
  const rect = { minGx: p.minGx, minGy: p.minGy, maxGx: p.maxGx, maxGy: p.maxGy };
  const now = Date.now();
  const sc = p.showcase;
  const liveHtml = !!p.customHtmlLive && !p.customHtmlDisabled && !customHtmlGloballyDisabledCached();
  return {
    id: p.id,
    slug: p.slug,
    kind: p.kind,
    status: p.status,
    rect,
    width: p.maxGx - p.minGx + 1,
    height: p.maxGy - p.minGy + 1,
    cellCount: p.cellCount,
    center: { lat: p.centerLat, lng: p.centerLng },
    bounds: rectBounds(rect),
    countryCode: p.countryCode,
    countryName: p.countryCode ? countryName(p.countryCode) : null,
    regionSlug: p.regionSlug,
    tier: p.tier,
    title: p.title,
    tagline: p.tagline,
    descriptionMd: p.descriptionMd,
    descriptionHtml: renderMarkdown(p.descriptionMd),
    hasCustomHtml: liveHtml,
    ...(liveHtml ? { customHtmlUrl: plotSandboxUrl(p.id, p.customHtmlVersion) } : {}),
    ...(extra.canEdit
      ? { customHtml: p.customHtml ?? null, customHtmlStatus: p.customHtmlStatus, customHtmlVersion: p.customHtmlVersion, customHtmlDisabled: p.customHtmlDisabled || customHtmlGloballyDisabledCached() }
      : {}),
    coverImageUrl: p.coverImageUrl,
    thumbUrl: p.thumbUrl,
    gallery: p.gallery,
    links: p.links,
    cta: p.cta,
    category: p.category,
    tags: p.tags,
    theme: p.theme,
    frame: p.frame,
    business: p.business,
    showcase: sc
      ? { brand: sc.brand, website: sc.website, sector: sectorLabel(sc.sector), kind: sc.kind, city: sc.city, useCase: sc.useCase, highlights: sc.highlights, approved: sc.approved, source: sc.source ?? null, sourceUrl: sc.sourceUrl ?? null, license: sc.license ?? null, logo: visibleLogo(p) }
      : null,
    moderationStatus: p.moderationStatus,
    // S2: may search engines index this page (the one rule in lib/visibility.ts), and when its content last changed.
    indexable: isIndexable(p),
    contentModifiedAt: contentModifiedAt(p).toISOString(),
    owner,
    likesCount: p.likesCount,
    visitsCount: p.visitsCount,
    guestbookCount: p.guestbookCount,
    guestbookOpen: p.guestbookOpen && p.status === 'active' && p.kind !== 'showcase' && !!(p.ownerUserId || p.ownerOrgId),
    spotlight: !!p.spotlightUntil && p.spotlightUntil.getTime() > now,
    beacon: !!p.beaconUntil && p.beaconUntil.getTime() > now,
    spotlightUntil: p.spotlightUntil,
    beaconUntil: p.beaconUntil,
    dormant: p.kind !== 'showcase' && !!p.lastEditedAt && now - p.lastEditedAt.getTime() > DORMANT_MS,
    brokenLinks: p.brokenLinks,
    threeWords: threeWords(p.minGx, p.minGy),
    published: !!p.publishedAt,
    publishedAt: p.publishedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    likedByMe: extra.likedByMe ?? false,
    canEdit: extra.canEdit ?? false,
  };
}
export type PlotView = ReturnType<typeof plotView>;

/** Loads owner views for many plots in two queries. */
export async function ownersFor(plots: Plot[]): Promise<Map<string, OwnerView | null>> {
  const userIds = [...new Set(plots.map((p) => p.ownerUserId).filter((x): x is string => !!x))];
  const orgIds = [...new Set(plots.map((p) => p.ownerOrgId).filter((x): x is string => !!x))];
  const users = userIds.length ? await db.select().from(schema.users).where(inArray(schema.users.id, userIds)) : [];
  const orgs = orgIds.length ? await db.select().from(schema.organizations).where(inArray(schema.organizations.id, orgIds)) : [];
  const um = new Map(users.map((u) => [u.id, u]));
  const om = new Map(orgs.map((o) => [o.id, o]));
  const out = new Map<string, OwnerView | null>();
  for (const p of plots) {
    if (p.ownerOrgId && om.has(p.ownerOrgId)) {
      const o = om.get(p.ownerOrgId)!;
      out.set(p.id, { type: 'org', id: o.id, handle: o.slug, displayName: o.name, avatarUrl: o.logoUrl, verified: !!o.verifiedAt, plan: o.plan });
    } else if (p.ownerUserId && um.has(p.ownerUserId)) {
      const u = um.get(p.ownerUserId)!;
      out.set(p.id, { type: 'user', id: u.id, handle: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl, level: u.level, plan: u.plan });
    } else out.set(p.id, null);
  }
  return out;
}

export async function orgRole(userId: string, orgId: string): Promise<string | null> {
  const [m] = await db
    .select({ role: schema.orgMembers.role })
    .from(schema.orgMembers)
    .where(and(eq(schema.orgMembers.orgId, orgId), eq(schema.orgMembers.userId, userId)));
  return m?.role ?? null;
}

/** Organisation roles that may edit the organisation's land: each is an explicit invite by its owner or admin. */
export const ORG_EDIT_ROLES = ['owner', 'admin', 'editor'];

/**
 * Who may change a plot's content (H3), and why not. Admins: any plot. Reserved, showcase, company and unclaimed
 * land: admins only, until a verified claim completes. Unpaid or released land: nobody but admins. Otherwise the
 * current owner, or a member of the owning organisation with an edit role. Nobody else, ever.
 */
export async function editRefusal(user: User | null, plot: Plot): Promise<string | null> {
  if (!user) return 'Sign in to edit your land.';
  if (user.role === 'admin') return null;
  if (plot.kind === 'showcase' || plot.status === 'showcase') {
    const brand = plot.showcase?.brand ?? plot.title;
    return `This land is reserved for ${brand}. Only FlatMeta admins can change it until the company completes its claim.`;
  }
  if (!plot.ownerUserId && !plot.ownerOrgId) return 'This land has no owner yet. Claim it to add content.';
  if (plot.status === 'pending_payment') return 'Finish paying for this land before adding content to it.';
  if (plot.status === 'released') return 'This land is no longer yours.';
  if (plot.ownerOrgId) {
    const role = await orgRole(user.id, plot.ownerOrgId);
    return role && ORG_EDIT_ROLES.includes(role) ? null : 'Only the owner of this land (or people its organisation invited as editors) can change it.';
  }
  return plot.ownerUserId === user.id ? null : 'Only the owner of this land can change it.';
}

export async function canEditPlot(user: User | null, plot: Plot): Promise<boolean> {
  return (await editRefusal(user, plot)) === null;
}

/** Throws 403 with a clear reason unless `user` may change this plot's content. */
export async function assertCanEditPlot(user: User | null, plot: Plot): Promise<void> {
  const why = await editRefusal(user, plot);
  if (why) throw forbidden(why);
}
