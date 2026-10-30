/**
 * MCP over stdio for local clients (Claude Desktop/Code):
 *   FLATMETA_API_KEY=fm_live_… npm run mcp:stdio
 * It talks to the database directly, so run it on the server (or with DATABASE_URL/REDIS_URL set).
 * Remote clients should use the HTTP endpoint ($API_URL/mcp) instead.
 */
// stdout carries the protocol: silence logs before anything else loads.
process.env.LOG_LEVEL = 'silent';

const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
const { userFromApiKey } = await import('../lib/auth.js');
const { createMcpServer } = await import('./server.js');

const found = process.env.FLATMETA_API_KEY ? await userFromApiKey(process.env.FLATMETA_API_KEY) : null;
const server = createMcpServer(() => found?.user ?? null);
await server.connect(new StdioServerTransport());
