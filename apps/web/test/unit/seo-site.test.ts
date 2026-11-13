import { describe, expect, it } from 'vitest';
import { ORG_ID, breadcrumbJsonLd, organizationJsonLd, siteTitle } from '../../src/lib/seo';
import { SITE_URL } from '../../src/lib/config';

/** S4: one FlatMeta per title, one Organization node site-wide, breadcrumbs from FlatMeta to the page. */
describe('site-wide SEO', () => {
  it('titles that name FlatMeta skip the "· FlatMeta" suffix and stay within 60 characters', () => {
    expect(siteTitle('Pricing')).toBe('Pricing');
    expect(siteTitle('About FlatMeta')).toEqual({ absolute: 'About FlatMeta' });
    const long = siteTitle('Companies in Saint Vincent and the Grenadines on FlatMeta · page 12') as { absolute: string };
    expect(long.absolute.length).toBeLessThanOrEqual(60);
  });
  it('the Organization node has an @id, the site URL and a logo', () => {
    const o = organizationJsonLd();
    expect(o['@id']).toBe(ORG_ID);
    expect(ORG_ID).toBe(`${SITE_URL}/#organization`);
    expect(o.url).toBe(SITE_URL);
    expect(o.logo.url).toMatch(/icon-512\.png$/);
  });
  it('breadcrumbs start at FlatMeta and end at the page, numbered from 1', () => {
    const b = breadcrumbJsonLd([{ name: 'Companies', path: '/brands' }, { name: 'France', path: '/brands/fr' }]);
    expect(b.itemListElement.map((i) => [i.position, i.name, i.item])).toEqual([
      [1, 'FlatMeta', SITE_URL],
      [2, 'Companies', `${SITE_URL}/brands`],
      [3, 'France', `${SITE_URL}/brands/fr`],
    ]);
  });
});
