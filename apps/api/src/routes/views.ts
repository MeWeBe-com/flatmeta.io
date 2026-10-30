import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import type { Organization, Plot, User } from '../db/schema.js';
import { countryName } from '../lib/geo.js';
import { rectBounds, threeWords } from '../lib/grid.js';
import { renderMarkdown } from '../lib/markdown.js';
import { levelTitle } from '../game/levels.js';
import { wrapCustomHtml } from '../lib/html.js';

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
    hasCustomHtml: !!p.customHtml,
    ...(extra.canEdit && p.customHtml ? { customHtml: p.customHtml } : {}),
    ...(extra.withHtml && p.customHtml ? { customHtmlDoc: wrapCustomHtml(p.customHtml) } : {}),
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
      ? { brand: sc.brand, website: sc.website, sector: sc.sector, kind: sc.kind, city: sc.city, useCase: sc.useCase, highlights: sc.highlights, approved: sc.approved }
      : null,
    moderationStatus: p.moderationStatus,
    owner,
    likesCount: p.likesCount,
    visitsCount: p.visitsCount,
    guestbookCount: p.guestbookCount,
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

export async function canEditPlot(user: User | null, plot: Plot): Promise<boolean> {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (plot.kind === 'showcase') return false;
  if (plot.ownerUserId === user.id && !plot.ownerOrgId) return true;
  if (plot.ownerOrgId) return (await orgRole(user.id, plot.ownerOrgId)) !== null;
  return false;
}
