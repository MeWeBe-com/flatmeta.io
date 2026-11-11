import { config } from '../config.js';

/**
 * Companies with a public headquarters, from Wikidata (CC0 1.0: free to reuse, no attribution required; we keep the
 * source and licence anyway). Only facts are used: name, website, industry, HQ and its coordinates. Never logos or
 * other brand imagery (Wikidata P154 logos are often trademarks and not CC0), never descriptions.
 */
export interface CompanyFact {
  sourceId: string; // Q-id
  name: string;
  website: string | null;
  industry: string | null;
  hqName: string | null;
  lat: number | null;
  lng: number | null;
  precision: 'address' | 'city' | null;
  popularity: number; // sitelinks: how many Wikipedias have an article
}

export const WIKIDATA_LICENSE = 'CC0-1.0';
export const wikidataUrl = (qid: string) => `https://www.wikidata.org/wiki/${qid}`;

/** Public companies of a country, most notable first. Narrow on purpose: the public endpoint times out at 60 s. */
export function companyQuery(iso2: string, limit = 300, minSitelinks = 10): string {
  if (!/^[A-Z]{2}$/.test(iso2)) throw new Error('bad country code');
  return `SELECT ?item ?name ?website ?hqName ?hqCoord ?addrCoord ?industryName ?sitelinks WHERE {
  ?country wdt:P297 "${iso2}" .
  ?item wdt:P17 ?country ; wdt:P31 wd:Q891723 ; wikibase:sitelinks ?sitelinks .
  FILTER (?sitelinks >= ${minSitelinks})
  ?item wdt:P856 ?website ; rdfs:label ?name . FILTER (lang(?name) = "en")
  ?item p:P159 ?hqStmt . ?hqStmt ps:P159 ?hq .
  OPTIONAL { ?hqStmt pq:P625 ?addrCoord }
  OPTIONAL { ?hq wdt:P625 ?hqCoord }
  OPTIONAL { ?hq rdfs:label ?hqName . FILTER (lang(?hqName) = "en") }
  OPTIONAL { ?item wdt:P452 ?industry . ?industry rdfs:label ?industryName . FILTER (lang(?industryName) = "en") }
  FILTER NOT EXISTS { ?item wdt:P576 [] }
} ORDER BY DESC(?sitelinks) LIMIT ${limit}`;
}

type Binding = Record<string, { value: string } | undefined>;

const point = (wkt?: string): [number, number] | null => {
  const m = wkt?.match(/^Point\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)$/i);
  if (!m) return null;
  const lng = Number(m[1]);
  const lat = Number(m[2]);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 85 && Math.abs(lng) <= 180 ? [lat, lng] : null;
};

/** Collapses the SPARQL rows (one per website/industry/HQ combination) into one fact per company. */
export function parseCompanies(json: { results: { bindings: Binding[] } }): CompanyFact[] {
  const out = new Map<string, CompanyFact>();
  for (const b of json.results.bindings) {
    const qid = b.item?.value.split('/').pop();
    const name = b.name?.value?.trim();
    if (!qid || !/^Q\d+$/.test(qid) || !name) continue;
    const addr = point(b.addrCoord?.value);
    const city = point(b.hqCoord?.value);
    const prev = out.get(qid);
    const fact: CompanyFact = prev ?? {
      sourceId: qid,
      name,
      website: null,
      industry: null,
      hqName: null,
      lat: null,
      lng: null,
      precision: null,
      popularity: Number(b.sitelinks?.value ?? 0) || 0,
    };
    if (!fact.website && b.website?.value && /^https?:\/\//.test(b.website.value)) fact.website = b.website.value;
    if (!fact.industry && b.industryName?.value) fact.industry = b.industryName.value;
    // Prefer the most precise point: an address-level qualifier beats the HQ city's centre.
    if (addr && fact.precision !== 'address') {
      [fact.lat, fact.lng] = addr;
      fact.precision = 'address';
      fact.hqName = b.hqName?.value ?? fact.hqName;
    } else if (city && fact.precision === null) {
      [fact.lat, fact.lng] = city;
      fact.precision = 'city';
      fact.hqName = b.hqName?.value ?? fact.hqName;
    }
    if (!fact.hqName && b.hqName?.value) fact.hqName = b.hqName.value;
    out.set(qid, fact);
  }
  return [...out.values()].sort((a, b) => b.popularity - a.popularity);
}

/** Runs the query. A descriptive User-Agent is required by Wikidata's policy (no personal contact details). */
export async function fetchCompanies(iso2: string, limit = 300, fetcher: typeof fetch = fetch): Promise<CompanyFact[]> {
  // The public endpoint gives up after 60 s on big countries: if it does, ask again for the more notable ones only.
  let last = '';
  for (const minSitelinks of [10, 25]) {
    const url = `${config.WIKIDATA_SPARQL_URL}?query=${encodeURIComponent(companyQuery(iso2, limit, minSitelinks))}`;
    const res = await fetcher(url, {
      headers: { accept: 'application/sparql-results+json', 'user-agent': `FlatMetaBot/1.0 (+${config.APP_URL}/about/facts)` },
      signal: AbortSignal.timeout(90_000),
    }).catch((err: Error) => ({ ok: false, status: err.name, json: async () => null }) as unknown as Response);
    if (res.ok) return parseCompanies((await res.json()) as { results: { bindings: Binding[] } });
    last = String(res.status);
    if (res.status === 400 || res.status === 403) break; // a bad query or a block won't get better by asking again
  }
  throw new Error(`Wikidata ${last}`);
}
