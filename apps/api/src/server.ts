import { buildApp, buildMcpApp } from './app.js';
import { config } from './config.js';
import { pool } from './db/client.js';
import { closeRedis } from './lib/redis.js';

const app = await buildApp();

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`);
  await mcpApp?.close();
  await app.close();
  await pool.end();
  await closeRedis();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
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
