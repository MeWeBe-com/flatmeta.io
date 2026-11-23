/**
 * Domain proof for the Official MCP Registry (HTTP method): the public half of the Ed25519 key MeWeBe holds for
 * publishing io.flatmeta/*. Public key only; the private key is kept off this server and never committed.
 */
export const dynamic = 'force-static';

const PROOF = 'v=MCPv1; k=ed25519; p=Jp6aezm3TF4TZW1SucOT6NEPVlxbLE1Fg3mv5aUTB0c=';

export function GET() {
  return new Response(`${PROOF}\n`, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}
