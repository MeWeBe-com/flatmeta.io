import { z } from 'zod';
import { config } from '../config.js';
import { CITIES } from '../data/cities.js';
import { allCountries } from '../lib/geo.js';
import { logger } from '../lib/logger.js';
import { key, redis } from '../lib/redis.js';
import { generateJson } from './text/index.js';

export const SearchIntent = z.object({
  keywords: z.string().max(100),
  category: z.string().max(40).nullable(),
  place: z.string().max(100).nullable(),
  country: z.string().length(2).nullable(),
  kind: z.enum(['any', 'business', 'showcase', 'people']).default('any'),
  sort: z.enum(['relevance', 'loved', 'new', 'nearest']).default('relevance'),
});
export type SearchIntent = z.infer<typeof SearchIntent>;

const CATEGORY_WORDS: Record<string, string> = {
  coffee: 'food & drink', cafe: 'food & drink', café: 'food & drink', restaurant: 'food & drink', food: 'food & drink', bar: 'food & drink',
  music: 'music', art: 'arts', gallery: 'arts', museum: 'culture', tech: 'technology', shop: 'shopping', store: 'shopping', fashion: 'shopping',
  gym: 'sport', sport: 'sport', football: 'sport', hotel: 'travel', travel: 'travel', school: 'education', university: 'education',
};

export function heuristicIntent(q: string): SearchIntent {
  const text = q.trim();
  const lower = text.toLowerCase();
  let place: string | null = null;
  const m = lower.match(/\b(?:in|near|around|at)\s+([a-zà-ÿ' .-]{2,40})$/i);
  if (m) place = m[1]!.trim();
  const city = CITIES.find((c) => lower.includes(c.name.toLowerCase()));
  if (!place && city) place = city.name;
  const country = allCountries().find((c) => new RegExp(`\\b${c.name.toLowerCase()}\\b`).test(lower));
  const word = Object.keys(CATEGORY_WORDS).find((w) => new RegExp(`\\b${w}`).test(lower));
  const keywords = text
    .replace(m?.[0] ?? '', '')
    .replace(/\b(best|top|find|show me|plots?|places?)\b/gi, '')
    .trim();
  return {
    keywords: keywords || text,
    category: word ? CATEGORY_WORDS[word]! : null,
    place,
    country: country?.code ?? null,
    kind: /\b(business|shop|store|caf[eé]|restaurant)/.test(lower) ? 'business' : /\bshowcase|brand/.test(lower) ? 'showcase' : /\b(people|users?|explorers?)\b/.test(lower) ? 'people' : 'any',
    sort: /\b(loved|popular|best|top)\b/.test(lower) ? 'loved' : /\b(new|latest|recent)\b/.test(lower) ? 'new' : place ? 'nearest' : 'relevance',
  };
}

export async function parseIntent(q: string, useAi: boolean): Promise<{ intent: SearchIntent; provider: string }> {
  if (useAi) {
    const out = await generateJson({
      schema: SearchIntent,
      fast: true,
      maxTokens: 800,
      system:
        'Turn a search query for FlatMeta (a world map of plots owned by people, businesses and brands) into filters. keywords: the core words to match plot titles/descriptions (drop filler like "find", "best"). place: a city/neighbourhood/landmark to centre on, if any. country: ISO-3166 alpha-2 if a country is named or implied. category: a short lowercase category if obvious (e.g. "food & drink", "technology", "sport", "arts", "shopping", "travel", "education", "culture", "music"). kind: business/showcase/people/any. sort: nearest when a place is given, loved for "best/popular", new for "new/latest".',
      prompt: q.slice(0, 300),
    });
    if (out) return { intent: out, provider: 'ai' };
  }
  return { intent: heuristicIntent(q), provider: 'heuristic' };
}

export interface Place {
  name: string;
  label: string;
  lat: number;
  lng: number;
  countryCode: string | null;
  type: string;
  bbox?: [number, number, number, number];
}

/** Geocodes a place name: featured cities and countries first, then the Photon-compatible geocoder (cached). */
export async function geocode(q: string, limit = 5): Promise<Place[]> {
  const term = q.trim().toLowerCase();
  if (term.length < 2) return [];
  const local: Place[] = [
    ...CITIES.filter((c) => c.name.toLowerCase().startsWith(term)).map((c) => ({ name: c.name, label: `${c.name}`, lat: c.lat, lng: c.lng, countryCode: c.country, type: 'city' })),
    ...allCountries()
      .filter((c) => c.name.toLowerCase().startsWith(term))
      .map((c) => ({ name: c.name, label: c.name, lat: c.lat, lng: c.lng, countryCode: c.code, type: 'country', bbox: c.bbox })),
  ];
  if (local.length >= limit || config.NODE_ENV === 'test') return local.slice(0, limit);
  const cacheKey = key('geo', term);
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return [...local, ...(JSON.parse(cached) as Place[])].slice(0, limit);
    const url = `${config.GEOCODER_URL}?q=${encodeURIComponent(q)}&limit=${limit}&lang=en`;
    const res = await fetch(url, { headers: { 'user-agent': config.GEOCODER_USER_AGENT }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return local;
    const data = (await res.json()) as { features?: { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> & { extent?: number[] } }[] };
    const places: Place[] = (data.features ?? []).map((f) => {
      const p = f.properties;
      const label = [p.name, p.city !== p.name ? p.city : undefined, p.state, p.country].filter(Boolean).join(', ');
      return {
        name: p.name ?? label,
        label,
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        countryCode: p.countrycode?.toUpperCase() ?? null,
        type: p.osm_value ?? p.type ?? 'place',
        bbox: p.extent && p.extent.length === 4 ? ([p.extent[0], p.extent[3], p.extent[2], p.extent[1]] as [number, number, number, number]) : undefined,
      };
    });
    await redis.set(cacheKey, JSON.stringify(places), 'EX', 60 * 60 * 24 * 7);
    return [...local, ...places].slice(0, limit);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Geocoder failed');
    return local;
  }
}
