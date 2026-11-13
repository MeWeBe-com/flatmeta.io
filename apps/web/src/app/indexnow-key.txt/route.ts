/** S2: the IndexNow key file (the API sends keyLocation = this URL). The key lives in the server's .env only. */
export function GET() {
  const key = process.env.INDEXNOW_KEY ?? '';
  if (!/^[A-Za-z0-9-]{8,128}$/.test(key)) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  return new Response(key, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=86400' } });
}
