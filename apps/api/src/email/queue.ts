import { Queue, UnrecoverableError, Worker } from 'bullmq';
import { config, emailProvider } from '../config.js';
import { logger } from '../lib/logger.js';
import { bullConnection } from '../lib/redis.js';
import type { EmailType } from './templates.js';
import { deliver, EmailPermanentError, EmailRetryableError, type OutgoingEmail } from './transport.js';

export const EMAIL_QUEUE = 'email';
const prefix = () => `${config.REDIS_PREFIX}:bull`;

/** Lower number = sent first. Sign-in codes jump the queue. */
const PRIORITY: Partial<Record<EmailType, number>> = { sign_in_code: 1, claim_code: 1, org_invite: 3, clan_invite: 3 };

/** Emails go through the worker when a real provider is set (retries, rate limits); log-only mode sends inline. */
export function queueEnabled(): boolean {
  if (config.EMAIL_QUEUE === 'true') return true;
  if (config.EMAIL_QUEUE === 'false') return false;
  return emailProvider() !== 'log' && config.NODE_ENV !== 'test';
}

let queue: Queue | null = null;
export async function enqueueEmail(msg: OutgoingEmail): Promise<string> {
  queue ??= new Queue(EMAIL_QUEUE, { connection: bullConnection(), prefix: prefix() });
  const job = await queue.add(msg.type, msg, {
    priority: PRIORITY[msg.type] ?? 5,
    attempts: 8,
    backoff: { type: 'exponential', delay: 10_000 }, // 10 s, 20 s, 40 s … about 21 minutes in total
    removeOnComplete: 500,
    removeOnFail: 1000,
    ...(msg.idempotencyKey ? { jobId: `email:${msg.idempotencyKey}` } : {}),
  });
  return job.id ?? 'queued';
}

/** Processes one queued email. Exported for tests. */
export async function processEmailJob(data: OutgoingEmail, onRateLimit: (ms: number) => Promise<void>) {
  try {
    return await deliver(data);
  } catch (err) {
    if (err instanceof EmailPermanentError) {
      logger.error({ type: data.type, err: err.message }, 'email dropped (permanent error)');
      throw new UnrecoverableError(err.message);
    }
    if (err instanceof EmailRetryableError && err.retryAfterMs) {
      await onRateLimit(err.retryAfterMs);
      throw Worker.RateLimitError(); // back on the queue without spending an attempt
    }
    throw err; // retried with exponential backoff
  }
}

/** The email worker, run inside the worker process. */
export function createEmailWorker(): Worker {
  const worker: Worker = new Worker(EMAIL_QUEUE, (job) => processEmailJob(job.data as OutgoingEmail, (ms) => worker.rateLimit(ms)), {
    connection: bullConnection(),
    prefix: prefix(),
    concurrency: 2,
    limiter: { max: config.EMAIL_RATE_PER_SECOND, duration: 1000 },
  });
  worker.on('failed', (job, err) => logger.warn({ type: job?.name, attempts: job?.attemptsMade, err: err.message }, 'email attempt failed'));
  return worker;
}

export async function closeEmailQueue() {
  await queue?.close();
  queue = null;
}
