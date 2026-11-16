import { buildApp, buildMcpApp } from './app.js';
import { config } from './config.js';
import { pool } from './db/client.js';
import { closeRedis } from './lib/redis.js';
import { reportError } from './lib/error-report.js';

const app = await buildApp();

let stopping = false;
const shutdown = async (signal: string) => {
  if (stopping) return; // PM2 can send SIGINT and SIGTERM
  stopping = true;
  app.log.info(`${signal} received, shutting down`);
  // Order matters: stop taking requests and close sockets first, let their close handlers run, then close
  // the database and Redis. Closing Redis earlier makes late work fail with "Connection is closed".
  await mcpApp?.close();
  await app.close();
  await new Promise((r) => setTimeout(r, 250));
  await pool.end();
  await closeRedis();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
// GL6: crashes and stray promise rejections reach the error webhook too (then the process manager restarts us).
process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  app.log.error({ err }, 'Unhandled rejection');
  void reportError({ source: 'api', where: 'process', name: 'UnhandledRejection', message: err.message });
});
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: config.HOST, port: config.PORT });

// Optional: also serve /mcp alone on MCP_PORT (for a separate proxy location or firewall rule).
let mcpApp: Awaited<ReturnType<typeof buildMcpApp>> | undefined;
if (config.MCP_PORT) {
  mcpApp = await buildMcpApp();
  await mcpApp.listen({ host: config.HOST, port: config.MCP_PORT });
}
// PM2 wait_ready support for zero-downtime reloads.
process.send?.('ready');
