// Email now lives in src/email (Resend → SMTP → log, queued through the worker). This file keeps the old helpers.
import { sendEmail, templates } from '../email/index.js';

export { outbox } from '../email/transport.js';

export async function sendCodeEmail(to: string, code: string, purpose: 'login' | 'claim', orgName?: string) {
  await sendEmail(to, purpose === 'login' ? templates.signInCode(code) : templates.claimCode(code, orgName ?? 'your organisation'));
}

export async function sendNoticeEmail(to: string, subject: string, text: string) {
  await sendEmail(to, templates.notice(subject, text));
}
