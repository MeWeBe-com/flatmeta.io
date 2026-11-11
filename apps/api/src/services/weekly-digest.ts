import { and, eq, gte, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { config } from '../config.js';
import { db, schema } from '../db/client.js';
import { hashToken, safeEqual } from '../lib/crypto.js';
import { uniqueVisitors } from '../lib/visitors.js';
import { sendEmail } from '../email/index.js';
import type { EmailContent } from '../email/templates.js';

/**
 * Weekly owner email (G11): visitors, likes and guestbook signatures per plot over the last week, with a nudge to
 * share. Mondays, through the email queue (Resend), with a one-click unsubscribe (link and List-Unsubscribe header).
 */
export const unsubscribeToken = (userId: string) => hashToken(`weekly-email:${userId}`).slice(0, 32);
export const verifyUnsubscribe = (userId: string, token: string) => safeEqual(unsubscribeToken(userId), token);
export const unsubscribeUrl = (userId: string) => `${config.API_URL}/v1/email/unsubscribe?u=${userId}&t=${unsubscribeToken(userId)}`;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

interface PlotWeek { title: string; slug: string; visitors: number; likes: number; signatures: number }

export function digestEmail(name: string, handle: string, plots: PlotWeek[], unsub: string): EmailContent {
  const total = plots.reduce((n, p) => n + p.visitors, 0);
  const subject = total > 0 ? `${total} ${total === 1 ? 'person' : 'people'} visited your land this week` : `Your week on ${config.APP_NAME}`;
  const share = `${config.APP_URL}/@${handle}`;
  const lines = plots.map((p) => `• ${p.title}: ${p.visitors} visitor${p.visitors === 1 ? '' : 's'}, ${p.likes} like${p.likes === 1 ? '' : 's'}, ${p.signatures} guestbook signature${p.signatures === 1 ? '' : 's'}`);
  const text = [`Hi ${name},`, '', 'Here is your week on FlatMeta:', '', ...lines, '', `Share your land to get more visitors: ${share}`, `Edit your plots: ${config.APP_URL}/dashboard`, '', `Unsubscribe from this weekly email: ${unsub}`].join('\n');
  const rows = plots
    .map((p) => `<tr><td style="padding:8px 0;border-bottom:1px solid #26305A"><a href="${esc(`${config.APP_URL}/p/${p.slug}`)}" style="color:#FFFFFF;font-weight:600;text-decoration:none">${esc(p.title)}</a><div style="font-size:13px;color:#C9D1EA">${p.visitors} visitors · ${p.likes} likes · ${p.signatures} signatures</div></td></tr>`)
    .join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;background:#0B1020;font-family:Inter,Segoe UI,Arial,sans-serif;color:#E8ECF8"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#141B33;border-radius:20px;padding:32px">
<tr><td style="font-size:20px;font-weight:700;color:#2DE2C4">◆ ${esc(config.APP_NAME)}</td></tr>
<tr><td style="padding-top:16px;font-size:18px;font-weight:600;color:#FFFFFF">Hi ${esc(name)}, here is your week</td></tr>
<tr><td style="padding-top:12px"><table role="presentation" width="100%">${rows}</table></td></tr>
<tr><td style="padding-top:22px"><a href="${esc(share)}" style="display:inline-block;background:#2DE2C4;color:#0B1020;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:999px">Share my land</a></td></tr>
<tr><td style="padding-top:20px;font-size:12px;color:#7C86A8">You get this because you own land on ${esc(config.APP_NAME)}. <a href="${esc(unsub)}" style="color:#7C86A8">Unsubscribe</a></td></tr>
</table></td></tr></table></body></html>`;
  return { type: 'weekly_digest', subject, text, html };
}

/** Sends this week's digests (worker job). Each owner at most once every 6 days; batches of `batch`. */
export async function sendWeeklyDigests(opts: { batch?: number; now?: Date; userIds?: string[] } = {}) {
  const { batch = 300, now = new Date() } = opts;
  const since = new Date(now.getTime() - 6 * 86400_000);
  const weekAgo = new Date(now.getTime() - 7 * 86400_000);
  const owners = await db
    .selectDistinct({ id: schema.users.id, email: schema.users.email, name: schema.users.displayName, handle: schema.users.username })
    .from(schema.users)
    .innerJoin(schema.plots, eq(schema.plots.ownerUserId, schema.users.id))
    .where(
      and(
        eq(schema.users.weeklyEmail, true),
        isNull(schema.users.bannedAt),
        or(isNull(schema.users.weeklyEmailSentAt), lt(schema.users.weeklyEmailSentAt, since)),
        eq(schema.plots.status, 'active'),
        isNotNull(schema.plots.publishedAt),
        opts.userIds ? inArray(schema.users.id, opts.userIds) : undefined,
      ),
    )
    .limit(batch);
  let sent = 0;
  for (const o of owners) {
    // Claim the send first so two workers never email twice.
    const [claimed] = await db
      .update(schema.users)
      .set({ weeklyEmailSentAt: now })
      .where(and(eq(schema.users.id, o.id), or(isNull(schema.users.weeklyEmailSentAt), lt(schema.users.weeklyEmailSentAt, since))))
      .returning({ id: schema.users.id });
    if (!claimed) continue;
    const plots = await db
      .select({ id: schema.plots.id, title: schema.plots.title, slug: schema.plots.slug, likes: schema.plots.likesCount })
      .from(schema.plots)
      .where(and(eq(schema.plots.ownerUserId, o.id), eq(schema.plots.status, 'active'), isNotNull(schema.plots.publishedAt)))
      .limit(10);
    if (!plots.length) continue;
    const sigs = await db
      .select({ plotId: schema.guestbookEntries.plotId, n: sql<number>`count(*)::int` })
      .from(schema.guestbookEntries)
      .where(and(inArray(schema.guestbookEntries.plotId, plots.map((p) => p.id)), gte(schema.guestbookEntries.createdAt, weekAgo), isNull(schema.guestbookEntries.deletedAt)))
      .groupBy(schema.guestbookEntries.plotId);
    const sigMap = new Map(sigs.map((s) => [s.plotId, s.n]));
    const week: PlotWeek[] = [];
    for (const p of plots) week.push({ title: p.title, slug: p.slug, visitors: (await uniqueVisitors(p.id).catch(() => ({ week: 0 }))).week, likes: p.likes, signatures: sigMap.get(p.id) ?? 0 });
    const unsub = unsubscribeUrl(o.id);
    await sendEmail(o.email, digestEmail(o.name, o.handle, week, unsub), {
      idempotencyKey: `weekly:${o.id}:${now.toISOString().slice(0, 10)}`,
      headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    });
    sent++;
  }
  return { owners: owners.length, sent };
}

export async function unsubscribeWeekly(userId: string) {
  await db.update(schema.users).set({ weeklyEmail: false }).where(eq(schema.users.id, userId));
}
