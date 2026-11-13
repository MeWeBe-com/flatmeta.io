import { SITE_URL } from './config';
import type { Plot } from './types';

const DAY_MAP: Record<string, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

export const plotUrl = (slug: string) => `${SITE_URL}/p/${slug}`;
export const plotCoverJpg = (slug: string, w = 1200) => `${SITE_URL}/api/v1/plots/${slug}/cover.jpg?w=${w}`;

const KIND_LABEL: Record<string, string> = { showcase: 'Company', landmark: 'Landmark', homestead: 'Homestead', standard: 'Plot' };
const SHORT_COUNTRY: Record<string, string> = { US: 'USA', GB: 'UK', AE: 'UAE' };

/** Cuts text at a word boundary so it fits `max` characters (no half words, no dangling punctuation). */
export function trimWords(text: string, max: number) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const at = cut.lastIndexOf(' ');
  return (at > max * 0.4 ? cut.slice(0, at) : t.slice(0, max)).replace(/[\s,;:·–-]+$/, '');
}

/** The first sentence of a Markdown description, as plain text. */
function firstSentence(md: string | null | undefined) {
  if (!md) return '';
  const plain = md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const m = /^(.{20,200}?[.!?])(\s|$)/.exec(plain);
  return (m ? m[1] : plain.slice(0, 160)).trim();
}

/** Where a plot is, for titles and descriptions: "San Jose, USA", "Fremont, United States of America" or the country. */
function placeOf(p: Plot, short = false) {
  const city = p.showcase?.city ?? (p.regionSlug ? p.regionSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : null);
  const country = p.countryCode ? (short ? SHORT_COUNTRY[p.countryCode] ?? p.countryName : p.countryName) : null;
  return [city, country].filter(Boolean).join(', ');
}

/**
 * S3: a unique 140–160 character description for every plot page:
 * "{Title} on FlatMeta: {tagline or first sentence}. {Kind} land in {City}, {Country} · {cells} cells{ · owned by @handle}."
 * Trimmed at a word boundary; padded with what you can do there when it would be too short.
 */
export function plotMetaDescription(p: Plot) {
  const name = p.showcase?.brand ?? p.title;
  const lead = (p.tagline ?? firstSentence(p.descriptionMd)).replace(/[.!?\s]+$/, '');
  const where = placeOf(p);
  const kind = KIND_LABEL[p.kind] ?? 'Plot';
  const facts = [`${kind} land${where ? ` in ${where}` : ''}`, `${p.cellCount} cells`, p.owner?.handle ? `owned by @${p.owner.handle}` : ''].filter(Boolean).join(' · ');
  let text = `${name} on FlatMeta${lead ? `: ${lead}` : ''}. ${facts}.`;
  if (text.length < 140) text += ' Visit it on the shared world map, explore the area and say hello.';
  if (text.length < 140) text += ' Claim land next to it.';
  return trimWords(text, 160);
}

/** S3: the page title (≤ 60 characters). "Tesla on FlatMeta · San Jose, USA"; people's plots: "Harbour Bakery · London, UK". */
export function plotTitle(p: Plot) {
  const where = placeOf(p, true);
  const head = p.showcase ? `${p.showcase.brand} on FlatMeta` : p.title;
  const full = where ? `${head} · ${where}` : head;
  if (full.length <= 60) return full;
  const country = p.countryCode ? SHORT_COUNTRY[p.countryCode] ?? p.countryName : null;
  const shorter = country ? `${head} · ${country}` : head;
  return shorter.length <= 60 ? shorter : trimWords(head, 60);
}

/**
 * S4: titles get "· FlatMeta" from the layout template only when they don't already say FlatMeta
 * ("About FlatMeta · FlatMeta" before). Use as `title: siteTitle('…')`.
 */
export function siteTitle(title: string): string | { absolute: string } {
  return /flatmeta/i.test(title) ? { absolute: title } : title;
}

/**
 * S3: JSON-LD for a plot page.
 * - company and showcase plots: Place + Organization (name, official url, sameAs Wikidata, logo, address, geo);
 * - business plots: LocalBusiness; landmarks owned by an organisation: Organization;
 * - people's plots: Place + CreativeWork (the mini-page: author, dateModified);
 * - every plot: BreadcrumbList.
 */
export function plotJsonLd(p: Plot) {
  const geo = { '@type': 'GeoCoordinates', latitude: Number(p.center.lat.toFixed(6)), longitude: Number(p.center.lng.toFixed(6)) };
  const address = p.countryCode ? { '@type': 'PostalAddress', ...(p.showcase?.city ? { addressLocality: p.showcase.city } : {}), addressCountry: p.countryCode } : undefined;
  const base = {
    '@context': 'https://schema.org',
    name: p.title,
    description: plotMetaDescription(p),
    url: plotUrl(p.slug),
    image: p.coverImageUrl ? plotCoverJpg(p.slug) : undefined,
    geo,
    sameAs: p.links.map((l) => l.url).slice(0, 5),
  };
  const out: Record<string, unknown>[] = [];
  if (p.showcase) {
    const org: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': `${plotUrl(p.slug)}#organization`,
      name: p.showcase.brand,
      ...(p.showcase.website ? { url: p.showcase.website } : {}),
      ...(p.showcase.sourceUrl && /wikidata\.org/.test(p.showcase.sourceUrl) ? { sameAs: [p.showcase.sourceUrl] } : {}),
      ...(p.showcase.logo ? { logo: p.showcase.logo.url.startsWith('http') ? p.showcase.logo.url : `${SITE_URL}${p.showcase.logo.url}` } : {}),
      ...(address ? { address } : {}),
    };
    out.push(
      {
        ...base,
        '@type': 'Place',
        name: `${p.showcase.brand} on FlatMeta`,
        ...(address ? { address } : {}),
        // A place on FlatMeta reserved for this organisation (not affiliated, unclaimed): it is *about* the organisation.
        about: { '@id': org['@id'] },
        additionalProperty: { '@type': 'PropertyValue', name: 'status', value: 'Reserved for this organisation, not affiliated with FlatMeta' },
      },
      org,
    );
  } else if (p.business) {
    out.push({
      ...base,
      '@type': 'LocalBusiness',
      telephone: p.business.phone,
      email: p.business.email,
      address: p.business.address ? { '@type': 'PostalAddress', streetAddress: p.business.address, addressCountry: p.countryCode ?? undefined } : address,
      openingHoursSpecification: Object.entries(p.business.hours ?? {}).flatMap(([d, ranges]) =>
        (ranges ?? []).map(([opens, closes]) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: DAY_MAP[d], opens, closes })),
      ),
    });
  } else if (p.kind === 'landmark' && p.owner?.type === 'org') {
    out.push({ ...base, '@type': 'Organization', logo: p.owner.avatarUrl ?? undefined, address });
  } else {
    const place = { ...base, '@type': 'Place', '@id': `${plotUrl(p.slug)}#place`, ...(address ? { address } : {}) };
    out.push(place, {
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      name: p.title,
      url: plotUrl(p.slug),
      about: { '@id': place['@id'] },
      ...(p.owner ? { author: { '@type': p.owner.type === 'org' ? 'Organization' : 'Person', name: p.owner.displayName, url: `${SITE_URL}/${p.owner.type === 'org' ? 'o' : 'u'}/${p.owner.handle}` } } : {}),
      ...(p.contentModifiedAt ? { dateModified: p.contentModifiedAt } : {}),
      inLanguage: 'en',
    });
  }
  out.push({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'FlatMeta', item: SITE_URL },
      ...(p.countryCode ? [{ '@type': 'ListItem', position: 2, name: p.countryName ?? p.countryCode, item: `${SITE_URL}/c/${p.countryCode.toLowerCase()}` }] : []),
      { '@type': 'ListItem', position: p.countryCode ? 3 : 2, name: p.showcase?.brand ?? p.title, item: plotUrl(p.slug) },
    ],
  });
  return out;
}

export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}
