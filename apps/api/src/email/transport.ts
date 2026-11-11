import nodemailer, { type Transporter } from 'nodemailer';
import { config, emailProvider } from '../config.js';
import { logger } from '../lib/logger.js';
import type { EmailType } from './templates.js';

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  type: EmailType;
  /** Resend de-duplicates sends with the same key for 24 h (safe retries). */
  idempotencyKey?: string;
  /** Extra headers, e.g. List-Unsubscribe for the weekly digest (G11). */
  headers?: Record<string, string>;
}

/** Worth retrying later (rate limit, quota, 5xx, network). `retryAfterMs` comes from the provider when it says. */
export class EmailRetryableError extends Error {
  constructor(message: string, public retryAfterMs?: number) {
    super(message);
  }
}
/** Retrying won't help (bad address, invalid from, bad key): the job is dropped and logged. */
export class EmailPermanentError extends Error {}

/** The part of the Resend SDK we use, so tests can pass a fake. */
export interface ResendLike {
  emails: {
    send(
      payload: { from: string; to: string; subject: string; html: string; text: string; replyTo?: string; tags?: { name: string; value: string }[]; headers?: Record<string, string> },
      options?: { idempotencyKey?: string },
    ): Promise<{ data: { id: string } | null; error: { name: string; message: string; statusCode: number | null } | null; headers?: Record<string, string> | null }>;
  };
}

let resendClient: ResendLike | null = null;
let smtpTransport: Transporter | null = null;

/** Tests inject a fake Resend client here. */
export function setResendClient(client: ResendLike | null) {
  resendClient = client;
}

async function resend(): Promise<ResendLike> {
  if (!resendClient) {
    const { Resend } = await import('resend');
    resendClient = new Resend(config.RESEND_API_KEY) as unknown as ResendLike;
  }
  return resendClient;
}

/** Last messages "sent" with no provider (development, tests, staging without keys). */
export const outbox: { to: string; subject: string; text: string; type: EmailType; headers?: Record<string, string> }[] = [];

/** Tag values may only contain ASCII letters, numbers, underscores and dashes. */
const tag = (v: string) => v.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 256);

const TRANSIENT = new Set(['rate_limit_exceeded', 'daily_quota_exceeded', 'monthly_quota_exceeded', 'concurrent_idempotent_requests', 'application_error', 'internal_server_error']);

async function sendWithResend(msg: OutgoingEmail): Promise<string> {
  const client = await resend();
  let res: Awaited<ReturnType<ResendLike['emails']['send']>>;
  try {
    res = await client.emails.send(
      {
        from: config.MAIL_FROM,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        ...(config.MAIL_REPLY_TO ? { replyTo: config.MAIL_REPLY_TO } : {}),
        ...(msg.headers ? { headers: msg.headers } : {}),
        tags: [
          { name: 'type', value: tag(msg.type) },
          { name: 'env', value: tag(config.APP_ENV) },
        ],
      },
      msg.idempotencyKey ? { idempotencyKey: msg.idempotencyKey } : undefined,
    );
  } catch (err) {
    throw new EmailRetryableError(`Resend request failed: ${(err as Error).message}`); // network
  }
  if (res.error) {
    const { name, statusCode, message } = res.error;
    if (name === 'rate_limit_exceeded' || statusCode === 429) {
      const retryAfter = Number(res.headers?.['retry-after']);
      throw new EmailRetryableError(`Resend rate limit: ${message}`, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000);
    }
    if (name === 'daily_quota_exceeded' || name === 'monthly_quota_exceeded') throw new EmailRetryableError(`Resend quota: ${message}`, 60 * 60_000);
    if (TRANSIENT.has(name) || (statusCode !== null && statusCode >= 500)) throw new EmailRetryableError(`Resend ${name}: ${message}`);
    throw new EmailPermanentError(`Resend ${name}: ${message}`);
  }
  return res.data?.id ?? 'unknown';
}

async function sendWithSmtp(msg: OutgoingEmail): Promise<string> {
  smtpTransport ??= nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
  });
  try {
    const info = await smtpTransport.sendMail({ from: config.MAIL_FROM, replyTo: config.MAIL_REPLY_TO, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html, headers: { 'X-FlatMeta-Type': msg.type, ...msg.headers } });
    return info.messageId;
  } catch (err) {
    const code = (err as { responseCode?: number }).responseCode;
    if (code && code >= 500 && code < 600) throw new EmailPermanentError(`SMTP ${code}: ${(err as Error).message}`);
    throw new EmailRetryableError(`SMTP: ${(err as Error).message}`);
  }
}

function logOnly(msg: OutgoingEmail): string {
  outbox.push({ to: msg.to, subject: msg.subject, text: msg.text, type: msg.type, ...(msg.headers ? { headers: msg.headers } : {}) });
  if (outbox.length > 50) outbox.shift();
  if (config.APP_ENV === 'production') {
    // Never write message bodies (sign-in codes, invite links) to production logs.
    logger.error({ to: msg.to, type: msg.type }, 'Email not sent: no email provider configured (set RESEND_API_KEY)');
  } else if (config.NODE_ENV !== 'test') {
    logger.info({ to: msg.to, type: msg.type }, `\n────── email (not sent: no provider) ──────\nTo: ${msg.to}\nSubject: ${msg.subject}\n\n${msg.text}\n───────────────────────────────────────────`);
  }
  return 'logged';
}

/** Sends one email with the active provider. Throws EmailRetryableError / EmailPermanentError. */
export async function deliver(msg: OutgoingEmail): Promise<{ provider: 'resend' | 'smtp' | 'log'; id: string }> {
  const provider = emailProvider();
  const id = provider === 'resend' ? await sendWithResend(msg) : provider === 'smtp' ? await sendWithSmtp(msg) : logOnly(msg);
  if (provider !== 'log') logger.info({ provider, id, type: msg.type }, 'email sent'); // recipient and content stay out of the log
  return { provider, id };
}
