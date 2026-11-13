import { and, eq, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { plotIndexChangedById } from '../lib/indexing.js';
import { db, schema } from '../db/client.js';
import { logger } from '../lib/logger.js';
import { notify } from '../game/activity.js';
import { BOARDS, rebuild } from '../game/leaderboards.js';
import { expireHolds, recountCountry } from '../services/plots.js';
import { importExternalImages } from '../showcase/import-external.js';

export async function refreshCountryStats() {
  const codes = await db.selectDistinct({ c: schema.plots.countryCode }).from(schema.plots).where(isNotNull(schema.plots.countryCode));
  for (const { c } of codes) await recountCountry(c);
  return codes.length;
}

export async function rebuildLeaderboards() {
  for (const b of BOARDS) if (b === 'xp' || b === 'xp-week' || b === 'plots-loved') await rebuild(b);
  return true;
}

async function checkUrl(url: string): Promise<boolean> {
  try {
    let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(6000), headers: { 'user-agent': 'FlatMeta-LinkCheck/1.0 (+https://flatmeta.io)' } });
    if (res.status === 405 || res.status === 403) res = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(8000) });
    return res.status < 400 || res.status === 403 || res.status === 429;
  } catch {
    return false;
  }
}

/** Weekly link health check (the Million Dollar Homepage link-rot lesson). */
export async function checkLinks(batch = 200) {
  const P = schema.plots;
  const plots = await db
    .select()
    .from(P)
    .where(and(eq(P.status, 'active'), isNotNull(P.publishedAt), or(isNull(P.linksCheckedAt), lt(P.linksCheckedAt, new Date(Date.now() - 7 * 86400_000)))))
    .limit(batch);
  let broken = 0;
  for (const p of plots) {
    const urls = [...new Set([...(p.links ?? []).map((l) => l.url), ...(p.cta?.url ? [p.cta.url] : [])])];
    const bad: string[] = [];
    for (const u of urls) if (!(await checkUrl(u))) bad.push(u);
    const newlyBroken = bad.filter((u) => !(p.brokenLinks ?? []).includes(u));
    await db.update(P).set({ brokenLinks: bad, linksCheckedAt: new Date() }).where(eq(P.id, p.id));
    if (newlyBroken.length && p.ownerUserId) {
      await notify(p.ownerUserId, 'broken_links', { plotId: p.id, plotTitle: p.title, links: newlyBroken });
      broken++;
    }
  }
  return { checked: plots.length, plotsWithNewBrokenLinks: broken };
}

/** Reminds owners about plots that are about to show as dormant (11 months without edits). */
export async function dormantReminders() {
  const P = schema.plots;
  const rows = await db
    .select({ id: P.id, title: P.title, owner: P.ownerUserId })
    .from(P)
    .where(and(eq(P.status, 'active'), lte(P.lastEditedAt, new Date(Date.now() - 335 * 86400_000)), sql`${P.lastEditedAt} > now() - interval '336 days'`));
  for (const r of rows) if (r.owner) await notify(r.owner, 'dormant_soon', { plotId: r.id, plotTitle: r.title });
  return rows.length;
}

/** Ends time-limited plan grants (e.g. 3 months of Brand with a Landmark) without an active subscription. */
export async function endExpiredGrants() {
  const O = schema.organizations;
  const expired = await db.select().from(O).where(and(isNotNull(O.planUntil), lt(O.planUntil, new Date())));
  for (const org of expired) {
    const [sub] = await db
      .select()
      .from(schema.subscriptions)
      .where(and(eq(schema.subscriptions.orgId, org.id), sql`${schema.subscriptions.status} in ('active','trialing','past_due')`));
    await db.update(O).set({ plan: sub?.plan ?? 'free', planUntil: null, updatedAt: new Date() }).where(eq(O.id, org.id));
  }
  return expired.length;
}

export async function cleanup() {
  await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
  await db.delete(schema.loginCodes).where(lt(schema.loginCodes.createdAt, new Date(Date.now() - 2 * 86400_000)));
  await db.delete(schema.activity).where(lt(schema.activity.createdAt, new Date(Date.now() - 180 * 86400_000)));
  return true;
}

/** Pays sellers whose balance passed the minimum (skips quietly when payments aren't configured). */
async function payouts() {
  const { runPayouts } = await import('../services/marketplace.js');
  try {
    return await runPayouts();
  } catch (err) {
    if ((err as { code?: string }).code === 'payments_unavailable') return { skipped: 'payments not configured' };
    throw err;
  }
}

/** Hides showcase plots whose takedown request has been open for 48 hours (fail-safe towards the company). */
export async function takedownSla(now = new Date()) {
  const due = await db
    .select({ id: schema.takedownRequests.id, plotId: schema.takedownRequests.plotId })
    .from(schema.takedownRequests)
    .where(and(eq(schema.takedownRequests.status, 'open'), lt(schema.takedownRequests.createdAt, new Date(now.getTime() - 48 * 3600_000))));
  for (const t of due) {
    await db.update(schema.plots).set({ status: 'hidden', updatedAt: now }).where(and(eq(schema.plots.id, t.plotId), eq(schema.plots.kind, 'showcase')));
    await db.update(schema.takedownRequests).set({ status: 'removed' }).where(eq(schema.takedownRequests.id, t.id));
    await plotIndexChangedById(t.plotId, 'remove');
    await db.insert(schema.auditLog).values({ actorId: null, action: 'takedown.auto_hidden_48h', targetType: 'plot', targetId: t.plotId, meta: { takedownId: t.id } });
  }
  return { hidden: due.length };
}

export const JOBS: Record<string, { every?: number; pattern?: string; run: () => Promise<unknown> }> = {
  'expire-holds': { every: 5 * 60_000, run: expireHolds },
  // G11: weekly owner email, Mondays, hourly batches until everyone due has had theirs.
  'weekly-digest': { pattern: '37 * * * 1', run: async () => (await import('../services/weekly-digest.js')).sendWeeklyDigests() },
  // G12: reserved company land from Wikidata, daily at 04:13 UTC (COMPANY_LAND_ENABLED; auto = staging + production).
  'company-land': { pattern: '13 4 * * *', run: async () => (await import('../companies/land.js')).runCompanyLand() },
  // G12: takedown requests are handled within 48 h; if not, the plot is hidden until someone has.
  // H2: the daily admin digest (new company plots, claims, removal requests) and public contact pages for outreach.
  'company-digest': { pattern: '43 6 * * *', run: async () => (await import('../companies/register.js')).companyDigest() },
  'company-contacts': { pattern: '29 5 * * *', run: async () => (await import('../companies/register.js')).findContactPages(60) },
  'takedown-sla': { every: 60 * 60_000, run: takedownSla },
  'open-houses': { every: 60_000, run: async () => (await import('../services/open-houses.js')).announceOpenHouses() },
  'chat-cleanup': { every: 60 * 60_000, run: async () => (await import('../services/chat.js')).purgeOldNearby() },
  payouts: { every: 15 * 60_000, run: payouts },
  'country-stats': { every: 60 * 60_000, run: refreshCountryStats },
  leaderboards: { every: 60 * 60_000, run: rebuildLeaderboards },
  'external-images': { every: 60 * 60_000, run: () => importExternalImages((m) => logger.info(m)) },
  'link-check': { pattern: '17 3 * * 1', run: checkLinks },
  'dormant-reminders': { pattern: '41 4 * * *', run: dormantReminders },
  'plan-grants': { pattern: '7 2 * * *', run: endExpiredGrants },
  cleanup: { pattern: '23 3 * * *', run: cleanup },
};
