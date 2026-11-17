import type { BusinessInfo } from '@/lib/types';

/**
 * R3c: the sample business on /demo. Fictional and labelled "sample" everywhere it appears; it is not a plot, so it is
 * never in the map, the sitemaps' plot lists, search or the API.
 */
export const SAMPLE = {
  name: 'Corner Café (sample)',
  tagline: 'Neighbourhood coffee, pastries baked at dawn and a sunny terrace. A made-up café, to show what a page looks like.',
  address: 'Rua de Exemplo 1, Lisbon (fictional)',
  timezone: 'Europe/Lisbon',
  hours: {
    mon: [['08:00', '18:00']],
    tue: [['08:00', '18:00']],
    wed: [['08:00', '18:00']],
    thu: [['08:00', '18:00']],
    fri: [['08:00', '22:00']],
    sat: [['09:00', '22:00']],
    sun: [['09:00', '16:00']],
  } as NonNullable<BusinessInfo['hours']>,
  hoursText: 'Mon–Thu 8:00–18:00 · Fri 8:00–22:00 · Sat 9:00–22:00 · Sun 9:00–16:00',
  offer: { title: 'Free pastel de nata with any coffee', body: 'Show this page at the counter. A sample offer: owners change theirs any time.' },
};

const DAYS: Record<string, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

/** The LocalBusiness data a real page would carry, shown on /demo as text (never as a JSON-LD script). */
export function sampleStructuredData() {
  return {
    '@context': 'https://schema.org',
    '@type': 'CafeOrCoffeeShop',
    name: SAMPLE.name,
    description: SAMPLE.tagline,
    address: { '@type': 'PostalAddress', streetAddress: 'Rua de Exemplo 1', addressLocality: 'Lisbon', addressCountry: 'PT' },
    openingHoursSpecification: Object.entries(SAMPLE.hours).flatMap(([d, ranges]) => (ranges ?? []).map(([opens, closes]) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: DAYS[d], opens, closes }))),
    makesOffer: { '@type': 'Offer', name: SAMPLE.offer.title },
  };
}
