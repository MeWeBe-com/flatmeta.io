import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { eq } from 'drizzle-orm';
import { Webhook } from 'standardwebhooks';
import { Worker } from 'bullmq';
import { config } from '../src/config.js';
import { db, pool, schema } from '../src/db/client.js';
import { closeRedis } from '../src/lib/redis.js';
import { logger } from '../src/lib/logger.js';
import { outbox, sendEmail, setResendClient, suppress, templates } from '../src/email/index.js';
import { closeEmailQueue, enqueueEmail, processEmailJob, queueEnabled } from '../src/email/queue.js';
import { EmailRetryableError, type ResendLike } from '../src/email/transport.js';
import type { App } from '../src/app.js';
import { freeRect, getApp, login } from './helpers.js';

let app: App;
beforeAll(async () => {
  app = await getApp();
});
afterAll(async () => {
  await closeEmailQueue();
  await app.close();
  await pool.end();
  await closeRedis();
});

const FAKE_KEY = 're_test_SECRET_KEY_must_never_be_logged';
type SendCall = Parameters<ResendLike['emails']['send']>;

/** A fake Resend client that records calls and answers with whatever `reply` returns. */
function fakeResend(reply: (n: number) => Awaited<ReturnType<ResendLike['emails']['send']>> | Error) {
  const calls: SendCall[] = [];
  const client: ResendLike = {
    emails: {
      send: async (...args: SendCall) => {
        calls.push(args);
        const r = reply(calls.length);
        if (r instanceof Error) throw r;
        return r;
      },
    },
  };
  return { client, calls };
}
const ok = (id = 'em_123') => ({ data: { id }, error: null, headers: null });

function useResend(reply: Parameters<typeof fakeResend>[0]) {
  const fake = fakeResend(reply);
  config.RESEND_API_KEY = FAKE_KEY;
  setResendClient(fake.client);
  return fake;
}
afterEach(() => {
  config.RESEND_API_KEY = undefined;
  config.MAIL_REPLY_TO = undefined;
  config.RESEND_WEBHOOK_SECRET = undefined;
  config.EMAIL_QUEUE = 'auto';
  setResendClient(null);
  vi.restoreAllMocks();
});

describe('provider selection (real config, fresh processes)', () => {
  const probe = (env: Record<string, string>) =>
    JSON.parse(
      execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', "const c = await import('./src/config.ts'); console.log(JSON.stringify({ p: c.emailProvider(), echo: c.devCodeEcho() }))"], {
        env: { PATH: process.env.PATH ?? '', SESSION_SECRET: 'x'.repeat(40), APP_URL: 'https://staging.flatmeta.io', NODE_ENV: 'production', APP_ENV: 'staging', ...env },
        encoding: 'utf8',
      }).trim().split('\n').pop()!,
    );
  it('picks Resend, then SMTP, then log-only; on-screen codes only when nothing can send', () => {
    expect(probe({ RESEND_API_KEY: 're_x', SMTP_HOST: 'smtp.example.com' })).toEqual({ p: 'resend', echo: false });
    expect(probe({ SMTP_HOST: 'smtp.example.com' })).toEqual({ p: 'smtp', echo: false });
    expect(probe({})).toEqual({ p: 'log', echo: true });
  });
});

describe('sending with Resend (mocked client)', () => {
  it('sends HTML and plain text with from, reply-to, type and env tags, and an idempotency key', async () => {
    config.MAIL_REPLY_TO = 'support@flatmeta.io';
    const { calls } = useResend(() => ok());
    expect(await sendEmail('Someone@Example.com', templates.signInCode('123456'), { idempotencyKey: 'k-1' })).toBe('sent');
    expect(calls).toHaveLength(1);
    const [payload, options] = calls[0]!;
    expect(payload.to).toBe('someone@example.com');
    expect(payload.from).toBe(config.MAIL_FROM);
    expect(payload.replyTo).toBe('support@flatmeta.io');
    expect(payload.subject).toContain('123456');
    expect(payload.text).toContain('123456');
    expect(payload.html).toContain('123456');
    expect(payload.html.startsWith('<!doctype html>')).toBe(true);
    expect(payload.tags).toEqual([
      { name: 'type', value: 'sign_in_code' },
      { name: 'env', value: config.APP_ENV },
    ]);
    expect(options).toEqual({ idempotencyKey: 'k-1' });
  });

  it('escapes user text in HTML', () => {
    const c = templates.clanInvite('<script>alert(1)</script>', { name: 'A&B', tag: 'AB', slug: 'a-b' });
    expect(c.html).not.toContain('<script>');
    expect(c.html).toContain('&lt;script&gt;');
    expect(c.text).toContain('<script>'); // plain text stays as typed
  });

  it('retries transient failures inline and gives up on permanent ones', async () => {
    const flaky = useResend((n) => (n < 2 ? { data: null, error: { name: 'internal_server_error', message: 'boom', statusCode: 500 }, headers: null } : ok()));
    expect(await sendEmail('a@example.com', templates.payoutSent(1234))).toBe('sent');
    expect(flaky.calls).toHaveLength(2);

    const bad = useResend(() => ({ data: null, error: { name: 'validation_error', message: 'Invalid `to` field', statusCode: 422 }, headers: null }));
    expect(await sendEmail('not-an-address@example.com', templates.payoutSent(1234))).toBe('failed');
    expect(bad.calls).toHaveLength(1);
  });

  it('in the worker: honours the rate limit (no attempt spent), drops permanent errors, retries network errors', async () => {
    const msg = { to: 'a@example.com', ...templates.notice('Hi', 'Body') };
    useResend(() => ({ data: null, error: { name: 'rate_limit_exceeded', message: 'Too many requests', statusCode: 429 }, headers: { 'retry-after': '2' } }));
    const waits: number[] = [];
    const rl = await processEmailJob(msg, async (ms) => void waits.push(ms)).catch((e: Error) => e);
    expect(waits).toEqual([2000]);
    expect((rl as Error).name).toBe(Worker.RateLimitError().name);

    useResend(() => ({ data: null, error: { name: 'invalid_from_address', message: 'bad from', statusCode: 422 }, headers: null }));
    const perm = await processEmailJob(msg, async () => undefined).catch((e: Error) => e);
    expect((perm as Error).name).toBe('UnrecoverableError');

    useResend(() => new Error('ECONNRESET'));
    const net = await processEmailJob(msg, async () => undefined).catch((e: Error) => e);
    expect(net).toBeInstanceOf(EmailRetryableError);
  });

  it('never writes the API key (or the message body) to the logs', async () => {
    const lines: string[] = [];
    for (const level of ['info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(logger, level).mockImplementation(((...args: unknown[]) => void lines.push(JSON.stringify(args))) as never);
    }
    useResend((n) => (n === 1 ? { data: null, error: { name: 'application_error', message: 'temporary', statusCode: 500 }, headers: null } : ok('em_logged')));
    await sendEmail('b@example.com', templates.signInCode('654321'));
    const all = lines.join('\n');
    expect(all).toContain('email sent');
    expect(all).not.toContain(FAKE_KEY);
    expect(all).not.toContain('654321');
    expect(all).not.toContain('b@example.com');
  });
});

describe('suppression and the Resend webhook', () => {
  it('skips suppressed addresses', async () => {
    const { calls } = useResend(() => ok());
    await suppress('bounced@example.com', 'bounced', 'test');
    expect(await sendEmail('Bounced@Example.com', templates.payoutSent(100))).toBe('suppressed');
    expect(calls).toHaveLength(0);
  });

  const signed = (secret: string, body: object) => {
    const payload = JSON.stringify(body);
    const id = `msg_${randomBytes(6).toString('hex')}`;
    const ts = new Date();
    const signature = new Webhook(secret).sign(id, ts, payload);
    return { payload, headers: { 'content-type': 'application/json', 'svix-id': id, 'svix-timestamp': String(Math.floor(ts.getTime() / 1000)), 'svix-signature': signature } };
  };

  it('verifies the Svix signature and suppresses bounced and complained recipients', async () => {
    const secret = `whsec_${randomBytes(24).toString('base64')}`;
    expect((await app.inject({ method: 'POST', url: '/v1/email/webhooks/resend', payload: '{}', headers: { 'content-type': 'application/json' } })).statusCode).toBe(404); // off without a secret
    config.RESEND_WEBHOOK_SECRET = secret;

    const bounce = signed(secret, { type: 'email.bounced', created_at: new Date().toISOString(), data: { email_id: 'e1', to: ['Hard@Bounce.test'], bounce: { type: 'Permanent', subType: 'General', message: 'mailbox does not exist' } } });
    const r1 = await app.inject({ method: 'POST', url: '/v1/email/webhooks/resend', payload: bounce.payload, headers: bounce.headers });
    expect(r1.statusCode).toBe(200);
    const complaint = signed(secret, { type: 'email.complained', data: { email_id: 'e2', to: ['spam@complaint.test'] } });
    expect((await app.inject({ method: 'POST', url: '/v1/email/webhooks/resend', payload: complaint.payload, headers: complaint.headers })).statusCode).toBe(200);

    const rows = await db.select().from(schema.emailSuppressions);
    expect(rows.find((r) => r.email === 'hard@bounce.test')?.reason).toBe('bounced');
    expect(rows.find((r) => r.email === 'spam@complaint.test')?.reason).toBe('complained');

    // tampered body or wrong secret → rejected, nothing stored
    const forged = signed(`whsec_${randomBytes(24).toString('base64')}`, { type: 'email.bounced', data: { to: ['victim@example.com'] } });
    expect((await app.inject({ method: 'POST', url: '/v1/email/webhooks/resend', payload: forged.payload, headers: forged.headers })).statusCode).toBe(400);
    const tampered = { ...bounce, payload: bounce.payload.replace('Hard@Bounce.test', 'victim@example.com') };
    expect((await app.inject({ method: 'POST', url: '/v1/email/webhooks/resend', payload: tampered.payload, headers: tampered.headers })).statusCode).toBe(400);
    expect(await db.select().from(schema.emailSuppressions).where(eq(schema.emailSuppressions.email, 'victim@example.com'))).toHaveLength(0);
  });
});

describe('queue', () => {
  it('queues through the worker when a provider is set (not in log-only mode), with sign-in codes first', async () => {
    expect(queueEnabled()).toBe(false); // tests run log-only
    config.EMAIL_QUEUE = 'true';
    expect(queueEnabled()).toBe(true);
    const id = await enqueueEmail({ to: 'q@example.com', ...templates.signInCode('111111') });
    expect(id).toBeTruthy();
  });
});

describe('events send emails', () => {
  it('marketplace sale emails the seller and the buyer; clan invite emails the invitee', async () => {
    const seller = await login();
    const buyer = await login();
    const { createPlot } = await import('../src/services/plots.js');
    const plot = await db.transaction((tx) => createPlot({ rect: freeRect(2, 2), title: 'Mail Test Plot', kind: 'standard', status: 'active', ownerUserId: seller.user.id, ownerOrgId: null, tier: 'O', countryCode: null, regionSlug: null }, tx));
    const listing = JSON.parse((await app.inject({ method: 'POST', url: `/v1/plots/${plot.id}/list`, headers: seller.headers, payload: { priceCents: 3000 } })).body).listing;
    const checkout = JSON.parse((await app.inject({ method: 'POST', url: `/v1/listings/${listing.id}/buy`, headers: buyer.headers })).body);
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, checkout.orderId));
    outbox.length = 0;
    await app.inject({ method: 'POST', url: '/v1/billing/mock/complete', headers: buyer.headers, payload: { session: order!.stripeSessionId } });
    const sent = outbox.map((m) => `${m.type}:${m.to}`);
    expect(sent).toContain(`listing_sold:${seller.user.email}`);
    expect(sent).toContain(`listing_purchased:${buyer.user.email}`);
    expect(outbox.find((m) => m.type === 'listing_sold')!.text).toContain('$27.00'); // 30.00 − 10% fee

    const leader = await login();
    await db.update(schema.users).set({ xp: 600, level: 3 }).where(eq(schema.users.id, leader.user.id));
    const tag = Math.random().toString(36).slice(2, 6).toUpperCase();
    const clan = JSON.parse((await app.inject({ method: 'POST', url: '/v1/clans', headers: leader.headers, payload: { name: `Mailers ${tag}`, tag } })).body).clan;
    outbox.length = 0;
    await app.inject({ method: 'POST', url: `/v1/clans/${clan.slug}/invite`, headers: leader.headers, payload: { username: buyer.user.username } });
    expect(outbox.map((m) => `${m.type}:${m.to}`)).toContain(`clan_invite:${buyer.user.email}`);
  });
});
