import { Webhook } from 'standardwebhooks';
import type { App } from '../app.js';
import { config } from '../config.js';
import { suppress } from '../email/index.js';
import { badRequest, notFound } from '../lib/errors.js';

interface ResendEvent {
  type: string;
  created_at?: string;
  data?: { email_id?: string; to?: string[] | string; bounce?: { type?: string; subType?: string; message?: string } };
}

/**
 * Resend webhook (Svix-signed). Bounced and complained addresses are suppressed so we never email them again.
 * Configure in Resend → Webhooks: URL `$API_URL/v1/email/webhooks/resend`, events email.bounced and email.complained,
 * then put the signing secret in RESEND_WEBHOOK_SECRET.
 */
export default async function emailRoutes(app: App) {
  await app.register(async (scope) => {
    // Signatures cover the exact bytes, so keep the raw body.
    scope.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => done(null, body));
    scope.post('/v1/email/webhooks/resend', { config: { rateLimit: { max: 600, timeWindow: '1 minute' } }, schema: { hide: true } }, async (req) => {
      if (!config.RESEND_WEBHOOK_SECRET) throw notFound();
      const h = req.headers;
      const header = (name: string) => String(h[`svix-${name}`] ?? h[`webhook-${name}`] ?? '');
      let event: ResendEvent;
      try {
        event = new Webhook(config.RESEND_WEBHOOK_SECRET).verify(req.body as string, {
          'webhook-id': header('id'),
          'webhook-timestamp': header('timestamp'),
          'webhook-signature': header('signature'),
        }) as ResendEvent;
      } catch {
        throw badRequest('Invalid webhook signature');
      }
      const to = event.data?.to;
      const recipients = (Array.isArray(to) ? to : to ? [to] : []).map((e) => e.toLowerCase());
      if (event.type === 'email.bounced') {
        // Resend reports a bounce once delivery has failed permanently; transient deferrals are email.delivery_delayed.
        const b = event.data?.bounce;
        for (const r of recipients) await suppress(r, 'bounced', [b?.type, b?.subType, b?.message].filter(Boolean).join(' · ') || undefined);
      } else if (event.type === 'email.complained') {
        for (const r of recipients) await suppress(r, 'complained', 'marked as spam');
      }
      req.log.info({ type: event.type, recipients: recipients.length }, 'resend webhook');
      return { ok: true };
    });
  });
}
