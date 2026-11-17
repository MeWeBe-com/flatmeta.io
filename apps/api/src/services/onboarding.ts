import { and, eq, gte, isNull, lt, notExists, sql } from 'drizzle-orm';
import { config } from '../config.js';
import { db, schema } from '../db/client.js';
import { sendEmail, templates } from '../email/index.js';
import { logger } from '../lib/logger.js';
import { unsubscribeUrl } from './weekly-digest.js';

/**
 * R3e: onboarding and activation emails.
 * - Welcome: once, right after sign-up (email code or Google). One next step: claim the free land.
 * - Activation: one nudge, 1–7 days after sign-up, only to people who have claimed no land, who haven't turned
 *   product emails off (the weekly-email setting, which the one-click unsubscribe turns off), and never twice.
 * Both go through the email queue, which skips suppressed (bounced or complained) addresses.
 */
export async function sendWelcome(user: { id: string; email: string; displayName: string | null }) {
  const name = (user.displayName ?? '').trim() || 'there';
  await sendEmail(user.email, templates.welcome(name, config.FREE_LAND_CELLS), { idempotencyKey: `welcome-${user.id}` }).catch((err) =>
    logger.warn({ err: String(err).slice(0, 200) }, 'welcome email not sent'),
  );
}

export async function sendActivationNudges(opts: { now?: Date; batch?: number } = {}) {
  const now = opts.now ?? new Date();
  const batch = opts.batch ?? 200;
  const U = schema.users;
  const due = await db
    .select({ id: U.id, email: U.email, name: U.displayName })
    .from(U)
    .where(
      and(
        isNull(U.activationEmailAt),
        isNull(U.bannedAt),
        eq(U.weeklyEmail, true),
        lt(U.createdAt, new Date(now.getTime() - 24 * 3600_000)),
        gte(U.createdAt, new Date(now.getTime() - 7 * 86400_000)),
        notExists(db.select({ one: sql`1` }).from(schema.plots).where(eq(schema.plots.ownerUserId, U.id))),
      ),
    )
    .limit(batch);
  let sent = 0;
  for (const u of due) {
    // Mark first: a crash after this never sends the nudge twice.
    const [marked] = await db.update(U).set({ activationEmailAt: now }).where(and(eq(U.id, u.id), isNull(U.activationEmailAt))).returning({ id: U.id });
    if (!marked) continue;
    const res = await sendEmail(u.email, templates.activation((u.name ?? '').trim() || 'there', config.FREE_LAND_CELLS, unsubscribeUrl(u.id)), {
      idempotencyKey: `activation-${u.id}`,
      headers: { 'List-Unsubscribe': `<${unsubscribeUrl(u.id)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    }).catch(() => 'failed' as const);
    if (res !== 'failed' && res !== 'suppressed') sent++;
  }
  return { due: due.length, sent };
}
