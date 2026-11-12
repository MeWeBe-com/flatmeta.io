// Quick HTTP smoke test after a deploy (no browser needed): the pages and files the site must always answer, through
// nginx at the public URL. Exit 0 when every check passes, 1 otherwise.
//   node scripts/deploy-smoke.mjs https://staging.flatmeta.io
// For the full browser smoke test (walk mode, chat, sandbox) set DEPLOY_SMOKE=browser: it runs release-smoke.cjs.
const base = (process.argv[2] ?? '').replace(/\/+$/, '');
if (!/^https?:\/\/[^/]+$/.test(base)) {
  console.error('usage: node scripts/deploy-smoke.mjs <https://site>');
  process.exit(2);
}

const checks = [
  ['home page', '/', (r, body) => r.status === 200 && /text\/html/.test(r.headers.get('content-type') ?? '') && Boolean(r.headers.get('content-security-policy')) && body.includes('<html')],
  ['robots.txt from the app', '/robots.txt', (r, body) => r.status === 200 && /text\/plain/.test(r.headers.get('content-type') ?? '') && /user-agent:/i.test(body)],
  ['llms.txt from the app', '/llms.txt', (r, body) => r.status === 200 && /text\/plain/.test(r.headers.get('content-type') ?? '') && /FlatMeta/i.test(body)],
  ['sitemap index', '/sitemap-index.xml', (r, body) => r.status === 200 && body.includes('<sitemapindex')],
  ['API health', '/api/healthz', (r, body) => r.status === 200 && /"ok":true/.test(body)],
  ['API /v1/me (JSON for guests)', '/api/v1/me', (r) => r.status === 200 && /application\/json/.test(r.headers.get('content-type') ?? '')],
  ['brands page', '/brands', (r) => r.status === 200],
];

let failed = 0;
for (const [name, path, ok] of checks) {
  try {
    const r = await fetch(base + path, { redirect: 'follow', signal: AbortSignal.timeout(20_000), headers: { 'user-agent': 'FlatMeta-deploy-smoke' } });
    const body = await r.text();
    const pass = ok(r, body);
    if (!pass) failed++;
    console.log(`${pass ? '✓' : '✗'} ${name} (${path}: ${r.status})`);
  } catch (err) {
    failed++;
    console.log(`✗ ${name} (${path}: ${err.name === 'TimeoutError' ? 'timed out' : err.message})`);
  }
}
console.log(failed ? `✗ smoke test: ${failed} of ${checks.length} checks failed` : `✓ smoke test: ${checks.length} checks passed`);
process.exitCode = failed ? 1 : 0;
