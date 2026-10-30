/**
 * Background worker (PM2 app "flatmeta-worker"): scheduled maintenance via BullMQ.
 * Run one instance per environment.
 */
import { createServer } from 'node:http';
import { Queue, Worker } from 'bullmq';
import { config } from './config.js';
import { pool } from './db/client.js';
import { JOBS } from './jobs/maintenance.js';
import { logger } from './lib/logger.js';
import { bullConnection, closeRedis } from './lib/redis.js';

const prefix = `${config.REDIS_PREFIX}:bull`;
const queue = new Queue('maintenance', { connection: bullConnection(), prefix });

for (const [name, job] of Object.entries(JOBS)) {
  await queue.upsertJobScheduler(name, job.every ? { every: job.every } : { pattern: job.pattern! }, {
    name,
    opts: { removeOnComplete: 50, removeOnFail: 100 },
  });
}

const worker = new Worker(
  'maintenance',
  async (job) => {
    const def = JOBS[job.name];
    if (!def) return null;
    const started = Date.now();
    const result = await def.run();
    logger.info({ job: job.name, ms: Date.now() - started, result }, 'job done');
    return result ?? null;
  },
  { connection: bullConnection(), prefix, concurrency: 2 },
);
worker.on('failed', (job, err) => logger.error({ job: job?.name, err }, 'job failed'));

logger.info(`Worker started (${Object.keys(JOBS).length} scheduled jobs, env ${config.APP_ENV})`);

// Tiny health endpoint so deploy scripts and monitors can check the worker (WORKER_HEALTH_PORT).
const health = createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(worker.isRunning() ? 200 : 503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: worker.isRunning(), jobs: Object.keys(JOBS).length, env: config.APP_ENV }));
  } else {
    res.writeHead(404).end();
  }
});
health.listen(config.WORKER_HEALTH_PORT, config.HOST);
process.send?.('ready');

const shutdown = async () => {
  health.close();
  await worker.close();
  await queue.close();
  await pool.end();
  await closeRedis();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
