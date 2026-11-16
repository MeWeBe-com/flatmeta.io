import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { COMPARE_PAGES, FOR_PAGES, LANDING_PATHS, faqJsonLd } from '@/lib/landing';
import { STATIC_PAGES, newest } from '@/lib/sitemaps/feed';
import { llmsTxt } from '@/lib/llms';
import { softwareAppJsonLd } from '@/lib/seo';

describe('GL7 landing and comparison pages', () => {
  it('have unique slugs, sane titles and descriptions, and an FAQ', () => {
    const all = [...FOR_PAGES, ...COMPARE_PAGES];
    expect(new Set(all.map((p) => p.slug)).size).toBe(all.length);
    for (const p of all) {
      // the layout adds " · FlatMeta" to titles that don't name it: keep the result within 60 characters
      const shown = /flatmeta/i.test(p.title) ? p.title : `${p.title} · FlatMeta`;
      expect(shown.length, p.title).toBeLessThanOrEqual(60);
      expect(p.description.length, p.slug).toBeGreaterThan(70);
      expect(p.description.length, p.slug).toBeLessThanOrEqual(220);
      expect(p.faq.length).toBeGreaterThan(0);
    }
    expect(faqJsonLd(FOR_PAGES[0].faq)).toMatchObject({ '@type': 'FAQPage', mainEntity: [{ '@type': 'Question' }, {}, {}] });
  });
  it('comparisons are fair: every row states both sides', () => {
    for (const c of COMPARE_PAGES) for (const r of c.rows) expect(r.flatmeta && r.other, `${c.slug}: ${r.label}`).toBeTruthy();
  });
  it('are in the sitemap and llms.txt', () => {
    for (const path of LANDING_PATHS) expect(STATIC_PAGES).toContain(path);
    const txt = llmsTxt();
    for (const path of LANDING_PATHS) expect(txt).toContain(path);
    expect(txt).not.toMatch(/\$249|\$29\/month/); // prices live on /pricing, never stale copies
  });
});

describe('GL7 sitemap index lastmod and SoftwareApplication', () => {
  it('newest() picks the latest real date and ignores the epoch', () => {
    expect(newest(['2026-01-01T00:00:00.000Z', '2026-11-15T10:00:00Z', null])).toBe('2026-11-15T10:00:00.000Z');
    expect(newest([new Date(0).toISOString(), undefined])).toBeNull();
    expect(newest([])).toBeNull();
  });
  it('lists one offer per plan from the live price list, and none without it', () => {
    const ld = softwareAppJsonLd([{ key: 'free', name: 'Free', month: 0 }, { key: 'plus', name: 'Plus', month: 500 }]);
    expect(ld.offers).toHaveLength(2);
    expect(ld.offers?.[1]).toMatchObject({ price: '5.00', priceCurrency: 'USD', priceSpecification: { unitCode: 'MON' } });
    expect(softwareAppJsonLd()).not.toHaveProperty('offers');
  });
});
