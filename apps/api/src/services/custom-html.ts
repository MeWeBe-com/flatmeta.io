import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { config } from '../config.js';
import { redis, key } from '../lib/redis.js';
import { randomToken } from '../lib/crypto.js';

type Plot = typeof schema.plots.$inferSelect;

/**
 * Custom HTML lifecycle (G8).
 *
 *  save  → automatic scan (lib/html.ts, hard blocks are refused before we get here)
 *        → a new row in custom_html_versions
 *        → first publish on a plot, or anything the scan wants a human to see: status `review`, a moderation flag,
 *          and visitors keep seeing the previous approved version (or nothing)
 *        → otherwise `approved` and live at once
 *  admin → approve / reject a version; kill-switch per plot (plots.custom_html_disabled) and for everyone
 *          (app_settings `customHtml.disabled`)
 *  visitors → 3 open reports pause the plot's custom HTML until a moderator looks at it
 */

const GLOBAL_KEY = 'customHtml.disabled';
let globalCache: { value: boolean; at: number } | null = null;

export async function customHtmlGloballyDisabled(): Promise<boolean> {
  if (globalCache && Date.now() - globalCache.at < 15_000) return globalCache.value;
  const [row] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, GLOBAL_KEY));
  globalCache = { value: row?.value === true, at: Date.now() };
  return globalCache.value;
}

/** Synchronous read for views: the last known value, refreshed in the background when older than 15 s. */
export function customHtmlGloballyDisabledCached(): boolean {
  if (!globalCache || Date.now() - globalCache.at >= 15_000) void customHtmlGloballyDisabled().catch(() => undefined);
  return globalCache?.value ?? false;
}

export async function setCustomHtmlGloballyDisabled(disabled: boolean, by: string) {
  await db
    .insert(schema.appSettings)
    .values({ key: GLOBAL_KEY, value: disabled, updatedBy: by })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value: disabled, updatedBy: by, updatedAt: new Date() } });
  globalCache = { value: disabled, at: Date.now() };
}

/** Whether visitors can see this plot's custom HTML right now. */
export async function customHtmlVisible(plot: Pick<Plot, 'customHtmlLive' | 'customHtmlDisabled' | 'status' | 'moderationStatus'>): Promise<boolean> {
  if (!plot.customHtmlLive || plot.customHtmlDisabled || plot.status !== 'active') return false;
  if (plot.moderationStatus === 'flagged' || plot.moderationStatus === 'rejected') return false;
  return !(await customHtmlGloballyDisabled());
}

export interface SavedHtml {
  version: number;
  status: 'review' | 'live' | 'none';
  notes: string[];
}

/**
 * Records a new version after the plot row was updated with the draft. `notes` are the reasons a human must look at
 * it before it goes live. Admin saves are approved at once.
 */
export async function recordCustomHtmlVersion(plot: Plot, html: string | null, actor: { id: string; role: string }, extraNotes: string[] = []): Promise<SavedHtml> {
  if (!html) {
    await db
      .update(schema.plots)
      .set({ customHtml: null, customHtmlLive: null, customHtmlStatus: 'none' })
      .where(eq(schema.plots.id, plot.id));
    await db
      .update(schema.customHtmlVersions)
      .set({ status: 'superseded' })
      .where(and(eq(schema.customHtmlVersions.plotId, plot.id), eq(schema.customHtmlVersions.status, 'review')));
    return { version: plot.customHtmlVersion, status: 'none', notes: [] };
  }
  const isAdmin = actor.role === 'admin';
  const [approvedBefore] = await db
    .select({ id: schema.customHtmlVersions.id })
    .from(schema.customHtmlVersions)
    .where(and(eq(schema.customHtmlVersions.plotId, plot.id), eq(schema.customHtmlVersions.status, 'approved')))
    .limit(1);
  const notes = [...extraNotes];
  if (!approvedBefore && !isAdmin) notes.unshift('First publish of custom HTML on this plot');
  const needsReview = notes.length > 0 && !isAdmin;

  return db.transaction(async (tx) => {
    const [bumped] = await tx
      .update(schema.plots)
      .set({ customHtmlVersion: sql`${schema.plots.customHtmlVersion} + 1` })
      .where(eq(schema.plots.id, plot.id))
      .returning({ v: schema.plots.customHtmlVersion });
    const version = bumped!.v;
    await tx
      .update(schema.customHtmlVersions)
      .set({ status: 'superseded' })
      .where(and(eq(schema.customHtmlVersions.plotId, plot.id), eq(schema.customHtmlVersions.status, 'review')));
    const [row] = await tx
      .insert(schema.customHtmlVersions)
      .values({
        plotId: plot.id,
        version,
        html,
        bytes: Buffer.byteLength(html, 'utf8'),
        status: needsReview ? 'review' : 'approved',
        notes,
        createdBy: actor.id,
        ...(needsReview ? {} : { reviewedBy: actor.id, reviewedAt: new Date() }),
      })
      .returning();
    if (needsReview) {
      await tx.update(schema.plots).set({ customHtmlStatus: 'review' }).where(eq(schema.plots.id, plot.id));
      await tx.insert(schema.moderationFlags).values({ targetType: 'custom_html', targetId: row!.id, source: 'system', reason: notes.join('; ').slice(0, 500) });
      return { version, status: 'review' as const, notes };
    }
    await tx.update(schema.plots).set({ customHtmlLive: html, customHtmlStatus: 'live' }).where(eq(schema.plots.id, plot.id));
    return { version, status: 'live' as const, notes: [] };
  });
}

export async function listVersions(plotId: string, limit = 20) {
  return db
    .select({
      id: schema.customHtmlVersions.id,
      version: schema.customHtmlVersions.version,
      bytes: schema.customHtmlVersions.bytes,
      status: schema.customHtmlVersions.status,
      notes: schema.customHtmlVersions.notes,
      createdAt: schema.customHtmlVersions.createdAt,
    })
    .from(schema.customHtmlVersions)
    .where(eq(schema.customHtmlVersions.plotId, plotId))
    .orderBy(desc(schema.customHtmlVersions.version))
    .limit(limit);
}

export async function getVersion(plotId: string, version: number) {
  const [row] = await db
    .select()
    .from(schema.customHtmlVersions)
    .where(and(eq(schema.customHtmlVersions.plotId, plotId), eq(schema.customHtmlVersions.version, version)));
  return row ?? null;
}

/** Admin decision on a version waiting for review. */
export async function reviewVersion(versionId: string, decision: 'approve' | 'reject', by: string, note?: string) {
  const [v] = await db.select().from(schema.customHtmlVersions).where(eq(schema.customHtmlVersions.id, versionId));
  if (!v) return null;
  const [plot] = await db.select().from(schema.plots).where(eq(schema.plots.id, v.plotId));
  if (!plot) return null;
  const notes = note ? [...v.notes, note.slice(0, 300)] : v.notes;
  await db
    .update(schema.customHtmlVersions)
    .set({ status: decision === 'approve' ? 'approved' : 'rejected', reviewedBy: by, reviewedAt: new Date(), notes })
    .where(eq(schema.customHtmlVersions.id, v.id));
  // Only the newest version changes what the plot shows; an older approved one never replaces a newer live version.
  if (v.version === plot.customHtmlVersion) {
    if (decision === 'approve') await db.update(schema.plots).set({ customHtmlLive: v.html, customHtmlStatus: 'live' }).where(eq(schema.plots.id, plot.id));
    else await db.update(schema.plots).set({ customHtmlStatus: plot.customHtmlLive ? 'live' : 'rejected' }).where(eq(schema.plots.id, plot.id));
  }
  await db
    .update(schema.moderationFlags)
    .set({ status: decision === 'approve' ? 'dismissed' : 'actioned', resolvedBy: by, resolvedAt: new Date() })
    .where(and(eq(schema.moderationFlags.targetType, 'custom_html'), eq(schema.moderationFlags.targetId, v.id), eq(schema.moderationFlags.status, 'open')));
  return { plotId: plot.id, version: v.version, status: decision === 'approve' ? 'approved' : 'rejected' };
}

/** The review queue: newest version per plot that waits for a human. */
export async function reviewQueue(limit = 50) {
  return db
    .select({
      id: schema.customHtmlVersions.id,
      version: schema.customHtmlVersions.version,
      bytes: schema.customHtmlVersions.bytes,
      notes: schema.customHtmlVersions.notes,
      createdAt: schema.customHtmlVersions.createdAt,
      plotId: schema.plots.id,
      plotSlug: schema.plots.slug,
      plotTitle: schema.plots.title,
      disabled: schema.plots.customHtmlDisabled,
    })
    .from(schema.customHtmlVersions)
    .innerJoin(schema.plots, eq(schema.plots.id, schema.customHtmlVersions.plotId))
    .where(eq(schema.customHtmlVersions.status, 'review'))
    .orderBy(schema.customHtmlVersions.createdAt)
    .limit(limit);
}

export const REPORTS_TO_PAUSE = 3;

/** A visitor report about a plot's custom HTML. Three open reports from different people pause it until reviewed. */
export async function reportCustomHtml(plot: Plot, reason: string, reporterId: string | null): Promise<{ paused: boolean }> {
  await db.insert(schema.moderationFlags).values({ targetType: 'custom_html_plot', targetId: plot.id, source: 'report', reason, reporterId });
  const [n] = await db
    .select({ n: sql<number>`count(distinct coalesce(${schema.moderationFlags.reporterId}::text, ${schema.moderationFlags.id}::text))::int` })
    .from(schema.moderationFlags)
    .where(and(eq(schema.moderationFlags.targetType, 'custom_html_plot'), eq(schema.moderationFlags.targetId, plot.id), eq(schema.moderationFlags.status, 'open')));
  if ((n?.n ?? 0) >= REPORTS_TO_PAUSE && !plot.customHtmlDisabled) {
    await db.update(schema.plots).set({ customHtmlDisabled: true }).where(eq(schema.plots.id, plot.id));
    return { paused: true };
  }
  return { paused: false };
}

export async function setPlotCustomHtmlDisabled(plotId: string, disabled: boolean, by: string) {
  await db.update(schema.plots).set({ customHtmlDisabled: disabled }).where(eq(schema.plots.id, plotId));
  if (!disabled) {
    // Re-enabling means a moderator looked at the reports.
    await db
      .update(schema.moderationFlags)
      .set({ status: 'dismissed', resolvedBy: by, resolvedAt: new Date() })
      .where(and(inArray(schema.moderationFlags.targetType, ['custom_html_plot']), eq(schema.moderationFlags.targetId, plotId), eq(schema.moderationFlags.status, 'open')));
  }
}

// ── Previews: short-lived tokens so drafts render on the usercontent origin without cookies ──

const PREVIEW_TTL = 600;

export async function storePreview(html: string): Promise<{ token: string; url: string }> {
  const token = randomToken(24);
  await redis.set(key('sandbox-preview', token), html, 'EX', PREVIEW_TTL);
  return { token, url: `${sandboxBase()}/v1/sandbox/preview/${token}` };
}

export async function loadPreview(token: string): Promise<string | null> {
  return redis.get(key('sandbox-preview', token));
}

/** Where sandbox documents are served: the usercontent origin when configured, else our own /api (dev, tests). */
export function sandboxBase(): string {
  return config.USERCONTENT_URL ? config.USERCONTENT_URL.replace(/\/+$/, '') : config.API_URL;
}

export function plotSandboxUrl(plotId: string, version: number): string {
  return `${sandboxBase()}/v1/plots/${plotId}/sandbox?v=${version}`;
}
