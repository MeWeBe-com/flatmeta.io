import { eq, inArray } from 'drizzle-orm';
import { config } from '../config.js';
import { db, schema } from '../db/client.js';
import { logger } from '../lib/logger.js';
import { enqueueEmail, queueEnabled } from './queue.js';
import type { EmailContent } from './templates.js';
import { deliver, EmailPermanentError, EmailRetryableError, type OutgoingEmail } from './transport.js';

export { templates, type EmailContent, type EmailType } from './templates.js';
export { outbox, setResendClient } from './transport.js';

export type SendResult = 'queued' | 'sent' | 'suppressed' | 'failed';

export async function isSuppressed(email: string): Promise<boolean> {
  const [row] = await db.select({ email: schema.emailSuppressions.email }).from(schema.emailSuppressions).where(eq(schema.emailSuppressions.email, email));
  return !!row;
}

export async function suppress(email: string, reason: 'bounced' | 'complained' | 'manual', detail?: string) {
  await db
    .insert(schema.emailSuppressions)
    .values({ email: email.trim().toLowerCase(), reason, detail: detail?.slice(0, 500) ?? null })
    .onConflictDoUpdate({ target: schema.emailSuppressions.email, set: { reason, detail: detail?.slice(0, 500) ?? null } });
}

/**
 * The single way to send email. Skips suppressed addresses, then queues (worker: retries, rate limits) or,
 * in log-only mode or if Redis is unreachable, sends inline with a few quick retries.
 */
export async function sendEmail(to: string, content: EmailContent, opts: { idempotencyKey?: string } = {}): Promise<SendResult> {
  const address = to.trim().toLowerCase();
  if (await isSuppressed(address)) {
    logger.info({ type: content.type }, 'email skipped: address is suppressed (bounce or complaint)');
    return 'suppressed';
  }
  const msg: OutgoingEmail = { to: address, subject: content.subject, text: content.text, html: content.html, type: content.type, idempotencyKey: opts.idempotencyKey };
  if (queueEnabled()) {
    try {
      await enqueueEmail(msg);
      return 'queued';
    } catch (err) {
      logger.warn({ type: content.type, err: (err as Error).message }, 'email queue unavailable, sending inline');
    }
  }
  for (let attempt = 1; ; attempt++) {
    try {
      await deliver(msg);
      return 'sent';
    } catch (err) {
      const retry = err instanceof EmailRetryableError && attempt < 3;
      if (!retry) {
        logger.error({ type: content.type, err: (err as Error).message, permanent: err instanceof EmailPermanentError }, 'email failed');
        return 'failed';
      }
      await new Promise((r) => setTimeout(r, Math.min((err as EmailRetryableError).retryAfterMs ?? 500 * attempt, 5000)));
    }
  }
}

/** Emails a user by id (skips banned and missing users). */
export async function emailUser(userId: string, content: EmailContent, opts: { idempotencyKey?: string } = {}): Promise<SendResult | null> {
  const [u] = await db.select({ email: schema.users.email, bannedAt: schema.users.bannedAt }).from(schema.users).where(eq(schema.users.id, userId));
  if (!u || u.bannedAt) return null;
  return sendEmail(u.email, content, opts);
}

/** Admin notifications: every admin in the database plus ADMIN_EMAILS. */
export async function emailAdmins(content: EmailContent): Promise<number> {
  const admins = await db.select({ email: schema.users.email }).from(schema.users).where(inArray(schema.users.role, ['admin']));
  const extra = config.ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  const all = [...new Set([...admins.map((a) => a.email.toLowerCase()), ...extra])];
  for (const to of all) await sendEmail(to, content);
  return all.length;
}

/** For side-effect emails inside other flows: a failure is logged and never breaks the caller. */
export async function quietly(p: Promise<unknown>): Promise<void> {
  try {
    await p;
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'email side effect failed');
  }
}
