import { SITE_URL } from './config';
import type { Plot } from './types';

const DAY_MAP: Record<string, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

export const plotUrl = (slug: string) => `${SITE_URL}/p/${slug}`;
export const plotCoverJpg = (slug: string, w = 1200) => `${SITE_URL}/api/v1/plots/${slug}/cover.jpg?w=${w}`;

/** JSON-LD for a plot page: LocalBusiness for business plots, Organization for landmarks, Place otherwise. */
export function plotJsonLd(p: Plot) {
  const base = {
    '@context': 'https://schema.org',
    name: p.title,
    description: p.tagline ?? undefined,
    url: plotUrl(p.slug),
    image: p.coverImageUrl ? plotCoverJpg(p.slug) : undefined,
    geo: { '@type': 'GeoCoordinates', latitude: Number(p.center.lat.toFixed(6)), longitude: Number(p.center.lng.toFixed(6)) },
    sameAs: p.links.map((l) => l.url).slice(0, 5),
  };
  let main: Record<string, unknown>;
  if (p.business) {
    main = {
      ...base,
      '@type': 'LocalBusiness',
      telephone: p.business.phone,
      email: p.business.email,
      address: p.business.address ? { '@type': 'PostalAddress', streetAddress: p.business.address, addressCountry: p.countryCode ?? undefined } : undefined,
      openingHoursSpecification: Object.entries(p.business.hours ?? {}).flatMap(([d, ranges]) =>
        (ranges ?? []).map(([opens, closes]) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: DAY_MAP[d], opens, closes })),
      ),
    };
  } else if (p.kind === 'landmark' && p.owner?.type === 'org') {
    main = { ...base, '@type': 'Organization', logo: p.owner.avatarUrl ?? undefined };
  } else {
    main = { ...base, '@type': 'Place', ...(p.showcase ? { additionalProperty: { '@type': 'PropertyValue', name: 'status', value: 'Sample showcase, not affiliated' } } : {}) };
  }
  const crumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'FlatMeta', item: SITE_URL },
      ...(p.countryCode ? [{ '@type': 'ListItem', position: 2, name: p.countryName ?? p.countryCode, item: `${SITE_URL}/c/${p.countryCode.toLowerCase()}` }] : []),
      { '@type': 'ListItem', position: p.countryCode ? 3 : 2, name: p.title, item: plotUrl(p.slug) },
    ],
  };
  return [main, crumbs];
}

export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}
