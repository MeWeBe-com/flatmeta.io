import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';

vi.mock('server-only', () => ({}));

/** S1/S5: the insights folder is read for the sitemap and the content rules. */
describe('insights articles', () => {
  it('lists the folder with dates, titles, language, share image and links to FlatMeta pages', async () => {
    const { insightArticles } = await import('../../src/lib/insights');
    const list = await insightArticles(path.resolve(__dirname, '../fixtures/insights'));
    expect(list.map((a) => a.path)).toEqual(['/insights/2026-11-12-local-shops-on-a-world-map.html', '/insights/2026-11-13-newest-virtual-reality-headset-for-libraries-and-schools.html', '/insights/']);
    const good = list[0]!;
    expect(good).toMatchObject({ title: 'Local shops on a shared world map', lang: 'en', ogImage: 'https://www.flatmeta.io/insights/img/local-shops.png', internalLinks: 2 });
    expect(new Date(good.lastmod).getTime()).toBeGreaterThan(0);
    expect(list[1]).toMatchObject({ lang: 'en-GB', ogImage: null, internalLinks: 0 });
  });
  it('is empty without INSIGHTS_DIR or with a missing folder', async () => {
    const { insightArticles } = await import('../../src/lib/insights');
    expect(await insightArticles('')).toEqual([]);
    expect(await insightArticles('/nonexistent/insights')).toEqual([]);
  });
  it('S5: checks each article against the rules (title, description, lang, og:image, links, topic)', async () => {
    const { insightList, articleProblems } = await import('../../src/lib/insights');
    const list = await insightList(path.resolve(__dirname, '../fixtures/insights'));
    // Newest first, without the automation's own index page; the date comes from the file name.
    expect(list.map((a) => [a.date, a.path.slice(10, 30)])).toEqual([['2026-11-13', '2026-11-13-newest-vi'], ['2026-11-12', '2026-11-12-local-sho']]);
    expect(articleProblems(list[1]!)).toEqual([]);
    expect(articleProblems(list[0]!)).toEqual([
      'title is 93 characters (at most 60)',
      'no meta description',
      '<html lang> is "en-GB" (must be "en")',
      'no og:image',
      '0 links to FlatMeta pages (at least 2)',
      'off-topic for FlatMeta ("virtual reality"): hidden from the hub and the sitemap, and the URL answers 410',
    ]);
    expect(articleProblems({ title: 'Brands near their headquarters', description: 'x'.repeat(120), lang: 'en', ogImage: 'http://x/y.png', internalLinks: 1 })).toEqual(['og:image is not an absolute https URL', '1 link to FlatMeta pages (at least 2)']);
  });

  it('QA3: the file name and the first heading count for the topic too; the hub lists only on-topic articles', async () => {
    const { offTopicWord, publishedInsights } = await import('../../src/lib/insights');
    expect(offTopicWord({ path: '/insights/2026-11-17-digital-twin-building-platform.html', title: 'A building platform guide' })).toBe('digital twin');
    expect(offTopicWord({ path: '/insights/2026-11-17-x.html', title: 'Fine', h1: 'Our metaverse plans' })).toBe('metaverse');
    expect(offTopicWord({ path: '/insights/2026-11-17-local-cafes-on-the-map.html', title: 'Local cafés on the map' })).toBeNull();
    const list = await publishedInsights(path.resolve(__dirname, '../fixtures/insights'));
    expect(list.map((a) => a.path)).toEqual(['/insights/2026-11-12-local-shops-on-a-world-map.html']);
  });
});
