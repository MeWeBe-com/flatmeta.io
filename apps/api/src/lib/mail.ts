import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { logger } from './logger.js';

const transport = config.SMTP_HOST
  ? nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
    })
  : null;

/** Last messages sent in dev/test (no SMTP) — handy for tests and the dev console. */
export const outbox: { to: string; subject: string; text: string }[] = [];

export async function sendMail(to: string, subject: string, text: string, html?: string): Promise<void> {
  if (!transport) {
    outbox.push({ to, subject, text });
    if (outbox.length > 50) outbox.shift();
    if (config.NODE_ENV !== 'test') logger.info({ to, subject }, `\n────── email (dev) ──────\nTo: ${to}\nSubject: ${subject}\n\n${text}\n─────────────────────────`);
    return;
  }
  await transport.sendMail({ from: config.MAIL_FROM, to, subject, text, html });
}

const wrap = (title: string, body: string) => `<!doctype html><html><body style="margin:0;background:#0B1020;font-family:Inter,Segoe UI,Arial,sans-serif;color:#E8ECF8">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table width="480" cellpadding="0" cellspacing="0" style="background:#141B33;border-radius:20px;padding:32px">
<tr><td style="font-size:20px;font-weight:700;color:#2DE2C4">◆ FlatMeta</td></tr>
<tr><td style="padding-top:16px;font-size:18px;font-weight:600">${title}</td></tr>
<tr><td style="padding-top:12px;font-size:15px;line-height:1.6;color:#C9D1EA">${body}</td></tr>
</table><p style="font-size:12px;color:#7C86A8">FlatMeta · the world map you can own a piece of</p></td></tr></table></body></html>`;

export async function sendCodeEmail(to: string, code: string, purpose: 'login' | 'claim', extra?: string) {
  const title = purpose === 'login' ? 'Your FlatMeta sign-in code' : 'Verify your organisation on FlatMeta';
  const intro = purpose === 'login' ? 'Use this code to sign in:' : `Use this code to verify that you work at ${extra ?? 'your organisation'}:`;
  await sendMail(
    to,
    `${code} is your FlatMeta code`,
    `${intro}\n\n${code}\n\nIt expires in 15 minutes. If you didn't ask for it, you can ignore this email.`,
    wrap(title, `${intro}<div style="font-size:34px;letter-spacing:8px;font-weight:700;color:#FFC94D;padding:16px 0">${code}</div>It expires in 15 minutes. If you didn't ask for it, you can ignore this email.`),
  );
}

export async function sendNoticeEmail(to: string, subject: string, text: string) {
  await sendMail(to, subject, text, wrap(subject, text.replace(/\n/g, '<br>')));
}
