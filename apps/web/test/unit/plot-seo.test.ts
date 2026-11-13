import { describe, expect, it } from 'vitest';
import { plotJsonLd, plotMetaDescription, plotTitle, siteTitle, trimWords } from '../../src/lib/seo';
import { wordCount } from '../../src/components/plot/seo-preview';
import type { Plot } from '../../src/lib/types';

/** S3: plot pages' title, description and structured data. */
const base = {
  id: 'p1',
  slug: 'tesla',
  kind: 'showcase',
  status: 'showcase',
  title: 'Tesla',
  tagline: 'Electrons on the move, from the factory floor to the open road.',
  descriptionMd: null,
  cellCount: 12,
  center: { lat: 37.4949, lng: -121.9447 },
  countryCode: 'US',
  countryName: 'United States of America',
  regionSlug: null,
  coverImageUrl: '/media/a.webp',
  links: [],
  business: null,
  owner: null,
  contentModifiedAt: '2026-11-12T10:00:00.000Z',
  showcase: { brand: 'Tesla', website: 'https://www.tesla.com', city: 'Fremont', sourceUrl: 'https://www.wikidata.org/wiki/Q478214', logo: { url: '/media/logos/tesla.png' } },
} as unknown as Plot;
const user = {
  ...base,
  slug: 'harbour-bakery',
  kind: 'standard',
  status: 'active',
  title: 'Harbour Bakery',
  tagline: null,
  descriptionMd: '## Fresh bread\n\nWe bake **sourdough** every morning by the harbour. Come early.',
  showcase: null,
  countryCode: 'GB',
  countryName: 'United Kingdom',
  regionSlug: 'brighton',
  owner: { type: 'user', handle: 'maya', displayName: 'Maya', verified: false },
} as unknown as Plot;

describe('plot meta description', () => {
  it('follows the template, is 140–160 characters, unique, and ends on a whole word', () => {
    const d = plotMetaDescription(base);
    expect(d.length).toBeGreaterThanOrEqual(140);
    expect(d.length).toBeLessThanOrEqual(160);
    expect(d).toMatch(/^Tesla on FlatMeta: Electrons on the move, from the factory floor to the open road\. Company land in Fremont, United States of America · 12 cells\./);
    const u = plotMetaDescription(user);
    expect(u).toMatch(/^Harbour Bakery on FlatMeta: Fresh bread We bake sourdough every morning by the harbour\. Plot land in Brighton, United Kingdom · 12 cells · owned by @maya\./);
    expect(u.length).toBeLessThanOrEqual(160);
    expect(u).not.toBe(d);
    expect(trimWords('one two three four five', 12)).toBe('one two');
  });
});

describe('titles', () => {
  it('stay under 60 characters and say FlatMeta once', () => {
    expect(plotTitle(base)).toBe('Tesla on FlatMeta · Fremont, USA');
    expect(siteTitle(plotTitle(base))).toEqual({ absolute: 'Tesla on FlatMeta · Fremont, USA' });
    expect(plotTitle(user)).toBe('Harbour Bakery · Brighton, UK');
    expect(siteTitle(plotTitle(user))).toBe('Harbour Bakery · Brighton, UK'); // the layout adds "· FlatMeta"
    expect(siteTitle('About FlatMeta')).toEqual({ absolute: 'About FlatMeta' });
    const long = { ...base, showcase: { ...base.showcase!, brand: 'The Very Long Name Of A Multinational Holding Company Group' } } as Plot;
    expect(plotTitle(long).length).toBeLessThanOrEqual(60);
  });
});

describe('JSON-LD', () => {
  const byType = (items: Record<string, unknown>[], t: string) => items.find((x) => x['@type'] === t)!;
  it('company land: Place + Organization (official site, Wikidata, logo, address, geo) + BreadcrumbList', () => {
    const ld = plotJsonLd(base);
    for (const x of ld) expect(x['@context']).toBe('https://schema.org');
    const org = byType(ld, 'Organization');
    expect(org).toMatchObject({ name: 'Tesla', url: 'https://www.tesla.com', sameAs: ['https://www.wikidata.org/wiki/Q478214'], address: { addressLocality: 'Fremont', addressCountry: 'US' } });
    expect(String(org.logo)).toMatch(/^https?:\/\/.+\/media\/logos\/tesla\.png$/);
    const place = byType(ld, 'Place');
    expect(place).toMatchObject({ name: 'Tesla on FlatMeta', geo: { '@type': 'GeoCoordinates', latitude: 37.4949, longitude: -121.9447 }, about: { '@id': org['@id'] } });
    expect(byType(ld, 'BreadcrumbList')).toBeDefined();
  });
  it("people's land: Place + CreativeWork with its author and dateModified", () => {
    const ld = plotJsonLd(user);
    expect(byType(ld, 'Place')).toMatchObject({ name: 'Harbour Bakery', geo: { '@type': 'GeoCoordinates' } });
    expect(byType(ld, 'CreativeWork')).toMatchObject({ author: { '@type': 'Person', name: 'Maya' }, dateModified: '2026-11-12T10:00:00.000Z' });
    expect(byType(ld, 'BreadcrumbList')).toBeDefined();
  });
  it('the editor counts words for the SEO-ready badge', () => {
    expect(wordCount('## Fresh bread\n\nWe bake **sourdough**, every [morning](https://x.y).')).toBe(7);
  });
});
