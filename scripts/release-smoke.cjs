// Release smoke test (G-final): public checks against a live site, no account needed.
//   node scripts/release-smoke.cjs https://www.flatmeta.io    (needs Chromium: npx playwright install chromium)
const { chromium } = require('playwright');
const base = process.argv[2];
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' · ' + detail : ''}`); };
const j = async (path) => (await fetch(base + path)).json();

(async () => {
  if (!/^https?:\/\//.test(base || '')) {
    console.error('Usage: node scripts/release-smoke.cjs <https://site>');
    process.exit(2);
  }
  // 1. Security headers on a page
  const home = await fetch(base + '/');
  const csp = home.headers.get('content-security-policy') || '';
  ok('CSP with nonce + strict-dynamic', /'nonce-[^']+'/.test(csp) && csp.includes("'strict-dynamic'"), csp.slice(0, 80));
  ok("frame-ancestors 'none' / X-Frame-Options DENY", csp.includes("frame-ancestors 'none'") && home.headers.get('x-frame-options') === 'DENY');
  ok('HSTS', /max-age=\d+/.test(home.headers.get('strict-transport-security') || ''), home.headers.get('strict-transport-security') || 'missing');
  ok('nosniff + Referrer-Policy', home.headers.get('x-content-type-options') === 'nosniff' && !!home.headers.get('referrer-policy'));

  // 2. /@handle and a share link
  const feed = await j('/api/v1/sitemap');
  const user = feed.users?.[0];
  if (user) {
    const r = await fetch(`${base}/@${user.username}`, { redirect: 'manual' });
    ok('/@handle redirects to the owner’s plot', [301, 302, 307, 308].includes(r.status) && /\/p\//.test(r.headers.get('location') || ''), `/@${user.username} → ${r.headers.get('location')}`);
  } else ok('/@handle', false, 'no owners with active land in the sitemap feed');
  const plot = feed.plots?.[0];
  if (plot) {
    const html = await (await fetch(`${base}/p/${plot.slug}`)).text();
    ok('share link: plot page with og:image + canonical', /property="og:image"/.test(html) && /rel="canonical"/.test(html), `/p/${plot.slug}`);
  }

  // 3. Reserved company plot and its claim page
  const brands = await j('/api/v1/brands');
  const b = brands.brands?.[0];
  if (b) {
    const page = await (await fetch(`${base}/p/${b.slug}`)).text();
    ok('reserved company plot shows the label', page.includes(`Reserved for ${b.title.replace(/&/g, '&amp;')}, not affiliated with FlatMeta`) || page.includes('not affiliated with FlatMeta'), `/p/${b.slug}`);
    const claim = await fetch(`${base}/claim/${b.slug}`);
    const ch = await claim.text();
    ok('claim page (email + DNS options)', claim.status === 200 && ch.includes('Verify my email') && ch.includes('Verify with a DNS record'), `/claim/${b.slug}`);
  } else ok('reserved company plot', false, 'no public company plots yet');
  ok('/brands directory', (await fetch(base + '/brands')).status === 200, `${brands.countries?.length ?? 0} countries`);

  // 4. Custom HTML sandbox: drafts need a session; unknown preview tokens 404
  const prev = await fetch(base + '/api/v1/sandbox/preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ html: '<b>x</b>' }) });
  ok('sandbox preview needs sign-in', prev.status === 401);
  ok('unknown preview token is 404', (await fetch(base + '/api/v1/sandbox/preview/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).status === 404);

  // 4b. AI-native and citable facts (G14, G15)
  const llms = await fetch(base + '/llms.txt');
  const lt = await llms.text();
  ok('llms.txt describes FlatMeta accurately', llms.status === 200 && lt.startsWith('# FlatMeta') && lt.includes('shared world map') && !/digital twin/i.test(lt), lt.split('\n')[0]);
  ok('/about/facts', (await fetch(base + '/about/facts')).status === 200);
  const homeHtml = await (await fetch(base + '/')).text();
  ok('WebSite + SearchAction JSON-LD on the home page', homeHtml.includes('"SearchAction"') && homeHtml.includes('search_term_string'));
  const ask = await fetch(base + '/api/v1/ask?q=' + encodeURIComponent('banks in Abu Dhabi'));
  const aj = ask.ok ? await ask.json() : null;
  ok('Ask FlatMeta answers', !!aj?.answer, aj ? `${aj.provider}: ${aj.answer.slice(0, 90)}` : String(ask.status));

  // 5. Walk mode with two guests: both on the map, one walks (WASD), emotes reach the other, chat asks to sign in
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const mk = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await ctx.addInitScript(() => { localStorage.setItem('fm-tour-done', '1'); localStorage.setItem('fm-geo', 'declined'); });
    const p = await ctx.newPage();
    await p.goto(`${base}/?at=-46.5,-28.5,15`);
    await p.locator('.fm-avatar-me').waitFor({ timeout: 45000 });
    return { ctx, p };
  };
  try {
    const a = await mk();
    const b2 = await mk();
    const seen = await b2.p.locator('.fm-avatar').count().then(async (n) => { for (let i = 0; i < 20 && n < 2; i++) { await b2.p.waitForTimeout(1000); n = await b2.p.locator('.fm-avatar').count(); } return n; });
    ok('two players see each other (live presence)', seen >= 2, `${seen} avatars on B's map`);
    const before = Number(await a.p.locator('.fm-avatar-me').getAttribute('data-lng'));
    await a.p.locator('body').focus();
    await a.p.keyboard.down('d'); await a.p.waitForTimeout(900); await a.p.keyboard.up('d');
    await a.p.waitForTimeout(400);
    const after = Number(await a.p.locator('.fm-avatar-me').getAttribute('data-lng'));
    ok('WASD walks the avatar', after > before, `${before.toFixed(5)} → ${after.toFixed(5)}`);
    await a.p.getByRole('button', { name: 'Emotes', exact: true }).click();
    await a.p.getByRole('toolbar', { name: 'Emotes' }).getByRole('button', { name: 'Wave' }).click();
    const emote = await b2.p.locator('.fm-emoting .fm-emote').first().textContent({ timeout: 10000 }).catch(() => null);
    ok('emote reaches the other player', emote === '👋', String(emote));
    await a.p.getByRole('button', { name: /^Chat/ }).click();
    const prompt = await a.p.getByText(/Sign in to chat/).first().isVisible().catch(() => false);
    ok('chat is for signed-in players (guest sees the sign-in prompt)', prompt);
    await a.ctx.close(); await b2.ctx.close();
  } catch (e) {
    ok('walk mode with two guests', false, e.message.split('\n')[0]);
  }
  await browser.close();
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  require('fs').writeFileSync(process.env.OUT || '/dev/null', JSON.stringify(results, null, 1));
  process.exitCode = failed ? 1 : 0; // CI gates production on this
})();
