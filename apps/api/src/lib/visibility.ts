import { sql, type SQL } from 'drizzle-orm';
import { showcaseLocationCheck } from '../config.js';
import { schema } from '../db/client.js';

/**
 * A showcase plot is public once an admin approved it and, in production, once its location was checked
 * (SHOWCASE_REQUIRE_LOCATION_CHECK). One definition for the map, lists, search, counts and sitemaps.
 */
export const publicShowcase = (): SQL =>
  showcaseLocationCheck()
    ? sql`(${schema.plots.status} = 'showcase' and coalesce((${schema.plots.showcase}->>'approved')::boolean, false) and coalesce((${schema.plots.showcase}->>'locationVerified')::boolean, false))`
    : sql`(${schema.plots.status} = 'showcase' and coalesce((${schema.plots.showcase}->>'approved')::boolean, false))`;

/** The same rule as raw SQL for statements that don't go through the query builder (unqualified columns). */
export const publicShowcaseRaw = (): SQL =>
  showcaseLocationCheck()
    ? sql.raw(`(status = 'showcase' and coalesce((showcase->>'approved')::boolean, false) and coalesce((showcase->>'locationVerified')::boolean, false))`)
    : sql.raw(`(status = 'showcase' and coalesce((showcase->>'approved')::boolean, false))`);

/**
 * S2: what search engines may index. One rule for the sitemap, the plot page's robots meta and llms-full.txt:
 * public (active, or an approved showcase whose location is checked where that's required), moderation ok, no open
 * takedown request, and, for people's land, a description (empty mini-pages stay noindex,follow until they have
 * content). Company showcases and landmarks have generated text and are always indexable when public.
 */
export interface IndexablePlot {
  status: string;
  kind: string;
  moderationStatus: string;
  descriptionMd: string | null;
  showcase: { approved?: boolean; locationVerified?: boolean } | null;
}
export function isIndexable(p: IndexablePlot, opts: { takedownOpen?: boolean } = {}): boolean {
  if (opts.takedownOpen || p.moderationStatus !== 'ok') return false;
  const showcaseOk = p.status === 'showcase' && !!p.showcase?.approved && (!showcaseLocationCheck() || !!p.showcase?.locationVerified);
  if (p.status !== 'active' && !showcaseOk) return false;
  if (p.kind === 'showcase' || p.kind === 'landmark') return true;
  return (p.descriptionMd ?? '').trim().length > 0;
}
export const indexablePlot = (): SQL =>
  sql`((${schema.plots.status} = 'active' or ${publicShowcase()}) and ${schema.plots.moderationStatus} = 'ok'
    and not exists (select 1 from takedown_requests t where t.plot_id = ${schema.plots.id} and t.status = 'open')
    and (${schema.plots.kind} in ('showcase', 'landmark') or length(btrim(coalesce(${schema.plots.descriptionMd}, ''))) > 0))`;

/** A plot that was removed for good (released, or taken down / rejected by moderation): its page answers 410 Gone. */
export function isGone(p: { status: string; moderationStatus: string }, opts: { takedownRemoved?: boolean } = {}): boolean {
  return p.status === 'released' || opts.takedownRemoved === true || (p.status === 'hidden' && p.moderationStatus === 'rejected');
}

/** When a plot's indexable content last changed (sitemap lastmod, og:updated_time, JSON-LD dateModified). */
export const contentModifiedAt = (p: { lastEditedAt: Date | null; publishedAt: Date | null; createdAt: Date }) => p.lastEditedAt ?? p.publishedAt ?? p.createdAt;
