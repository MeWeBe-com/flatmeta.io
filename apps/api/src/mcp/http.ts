import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { App } from '../app.js';
import { createMcpServer } from './server.js';

/**
 * Stateless Streamable HTTP endpoint: each POST gets a fresh server bound to the caller
 * (anonymous for read-only tools, or the API key's user).
 */
export async function registerMcp(app: App) {
  app.post('/mcp', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } }, schema: { hide: true } }, async (req, reply) => {
    const user = req.user;
    const server = createMcpServer(() => user);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    reply.hijack();
    reply.raw.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req.raw, reply.raw, req.body);
  });
  const notAllowed = async (_req: unknown, reply: { status: (n: number) => { send: (b: unknown) => unknown } }) =>
    reply.status(405).send({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed: this MCP server is stateless, use POST.' }, id: null });
  app.get('/mcp', { schema: { hide: true } }, notAllowed);
  app.delete('/mcp', { schema: { hide: true } }, notAllowed);
}
