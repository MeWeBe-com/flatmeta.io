import { MCP_URL, SITE_URL } from '@/lib/config';

/**
 * Official MCP Registry server card (schema 2025-12-11). The registry and Glama read it to list the MCP server that
 * already runs at /api/mcp. The name is reverse-DNS for flatmeta.io and is proven by /.well-known/mcp-registry-auth.
 * Keep `description` at 100 characters or fewer (registry limit). Bump `version` when the tool list changes.
 */
export const revalidate = 3600;

export function GET() {
  const card = {
    $schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
    name: 'io.flatmeta/map',
    title: 'FlatMeta',
    description: 'Search, check availability and claim 2D world-map grid plots and mini-pages on FlatMeta.',
    version: '2.0.0',
    websiteUrl: SITE_URL,
    remotes: [{ type: 'streamable-http', url: MCP_URL }],
  };
  return new Response(JSON.stringify(card, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=3600', 'access-control-allow-origin': '*' },
  });
}
