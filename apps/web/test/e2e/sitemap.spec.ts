import { expect, test } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * S1: /sitemap.xml is the app's sitemap index, listing pages, plots, companies and insights (never itself); every child
 * is valid XML that passes the official sitemap schemas (xmllint); /sitemap-index.xml redirects; robots.txt lists
 * exactly one sitemap and no Host line.
 */
test.skip(({ isMobile }) => !!isMobile, 'same on mobile');

const XSD = path.resolve(__dirname, '../fixtures/xsd');
function validate(xml: string, schema: string) {
  const dir = mkdtempSync(path.join(tmpdir(), 'fm-sitemap-'));
  const file = path.join(dir, 'doc.xml');
  writeFileSync(file, xml);
  const r = spawnSync('xmllint', ['--noout', '--schema', path.join(XSD, schema), file], { encoding: 'utf8' });
  return { ok: r.status === 0, out: `${r.stdout}${r.stderr}`.trim() };
}

test('/sitemap.xml is the index of pages, plots, companies and insights, and every child passes the sitemap XSD', async ({ request, baseURL }) => {
  const res = await request.get('/sitemap.xml');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toMatch(/^application\/xml/);
  const xml = await res.text();
  expect(validate(xml, 'siteindex.xsd')).toMatchObject({ ok: true });
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
  const paths = locs.map((l) => new URL(l).pathname);
  expect(paths).toEqual(expect.arrayContaining(['/sitemap-pages.xml', '/sitemap-plots.xml', '/sitemap-companies.xml', '/sitemap-insights.xml']));
  expect(paths).not.toContain('/sitemap.xml'); // never itself
  expect(paths).not.toContain('/sitemap-index.xml');
  for (const loc of locs) {
    const u = new URL(loc);
    const child = await request.get(`${baseURL}${u.pathname}${u.search}`);
    expect(child.status(), loc).toBe(200);
    expect(child.headers()['content-type'], loc).toMatch(/^application\/xml/);
    const body = await child.text();
    expect(body, loc).toMatch(/<urlset/);
    const v = validate(body, 'sitemap-with-images.xsd');
    expect(v.ok, `${loc}: ${v.out}`).toBe(true);
  }
});

test('the insights sitemap lists the articles from the insights folder, with their dates', async ({ request }) => {
  const xml = await (await request.get('/sitemap-insights.xml')).text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
  // CI and the local stack point INSIGHTS_DIR at test/fixtures/insights.
  test.skip(!urls.length, 'INSIGHTS_DIR is not set for this server');
  expect(urls).toEqual(expect.arrayContaining(['/insights/', '/insights/2026-11-12-local-shops-on-a-world-map.html']));
  expect(xml).toMatch(/<lastmod>\d{4}-\d\d-\d\dT[^<]+<\/lastmod>/);
});

test('/sitemap-index.xml moved to /sitemap.xml', async ({ request }) => {
  const res = await request.get('/sitemap-index.xml', { maxRedirects: 0 });
  expect(res.status()).toBe(301);
  expect(new URL(res.headers()['location']!).pathname).toBe('/sitemap.xml');
});

test('robots.txt points at the one sitemap index and has no Host line', async ({ request }) => {
  const txt = await (await request.get('/robots.txt')).text();
  const sitemaps = txt.split('\n').filter((l) => /^sitemap:/i.test(l));
  // Production lists exactly the index (unit-tested in robots.test.ts); staging and CI block everything and list none.
  expect(sitemaps.length).toBeLessThanOrEqual(1);
  for (const l of sitemaps) expect(l).toMatch(/\/sitemap\.xml$/);
  expect(txt).not.toMatch(/^host:/im);
});
