import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { isReservedSlug } from '../lib/slug.js';
import { visiblePlot } from '../routes/plots.js';

/** Handles are compared without case, punctuation or spaces: "Apple Inc." and "apple_inc" are the same name. */
export const normalizeHandle = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
const SYSTEM = ['admin', 'administrator', 'root', 'support', 'help', 'flatmeta', 'flatmetaio', 'official', 'staff', 'moderator', 'mod', 'api', 'www', 'mail', 'billing', 'security', 'abuse', 'legal', 'press', 'brands', 'brand', 'business', 'team', 'about', 'p', 'u', 'o', 'c', 'r', 'h'];

/**
 * Why a handle can't be taken, or null. Reserved: system names, organisation slugs, and the names of companies
 * that have land reserved for them (showcase plots), so a company's @name stays theirs to claim.
 */
export async function handleBlocked(handle: string, opts: { exceptUserId?: string } = {}): Promise<string | null> {
  const n = normalizeHandle(handle);
  if (!n || SYSTEM.includes(n) || isReservedSlug(n)) return 'That name is reserved.';
  const [org] = await db.select({ id: schema.organizations.id }).from(schema.organizations).where(sql`regexp_replace(lower(${schema.organizations.slug}), '[^a-z0-9]', '', 'g') = ${n}`).limit(1);
  if (org) return 'That name belongs to an organisation on FlatMeta.';
  const [brand] = await db
    .select({ id: schema.plots.id })
    .from(schema.plots)
    .where(
      and(
        eq(schema.plots.kind, 'showcase'),
        sql`(regexp_replace(lower(${schema.plots.showcase}->>'brand'), '[^a-z0-9]', '', 'g') = ${n} or regexp_replace(lower(${schema.plots.slug}), '[^a-z0-9]', '', 'g') = ${n})`,
      ),
    )
    .limit(1);
  if (brand) return 'That name is reserved for a company with land on FlatMeta. Companies can claim it by verifying their domain.';
  const [user] = await db.select({ id: schema.users.id }).from(schema.users).where(sql`regexp_replace(lower(${schema.users.username}), '[^a-z0-9]', '', 'g') = ${n}`).limit(1);
  if (user && user.id !== opts.exceptUserId) return 'That handle is taken.';
  return null;
}

export interface HandleTarget {
  type: 'user' | 'org';
  handle: string;
  displayName: string;
  /** Public plots, the primary one first (most loved, then most visited, then the oldest). */
  plots: { slug: string; title: string }[];
}

/** What flatmeta.io/@handle points at: a person (by username) or an organisation (by slug), and their public plots. */
export async function resolveHandle(handle: string): Promise<HandleTarget | null> {
  const P = schema.plots;
  const order = [desc(P.likesCount), desc(P.visitsCount), asc(P.createdAt)];
  const [u] = await db.select().from(schema.users).where(eq(schema.users.username, handle));
  if (u && !u.bannedAt) {
    const plots = await db.select({ slug: P.slug, title: P.title }).from(P).where(and(eq(P.ownerUserId, u.id), sql`${P.ownerOrgId} is null`, visiblePlot())).orderBy(...order).limit(50);
    return { type: 'user', handle: u.username, displayName: u.displayName, plots };
  }
  const [o] = await db.select().from(schema.organizations).where(eq(schema.organizations.slug, handle.toLowerCase()));
  if (o) {
    const plots = await db.select({ slug: P.slug, title: P.title }).from(P).where(and(eq(P.ownerOrgId, o.id), visiblePlot())).orderBy(...order).limit(50);
    return { type: 'org', handle: o.slug, displayName: o.name, plots };
  }
  return null;
}
