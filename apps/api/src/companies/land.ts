import { backfillLogos, type LogoRun } from './logos.js';
import { and, desc, eq, sql } from 'drizzle-orm';
import { config, companyLandEnabled } from '../config.js';
import { db, schema } from '../db/client.js';
import type { Plot } from '../db/schema.js';
import { heuristicModeration } from '../ai/moderation.js';
import { nearestCity, resolveCountry } from '../lib/geo.js';
import { logger } from '../lib/logger.js';
import { safeUrl } from '../lib/markdown.js';
import { key, redis } from '../lib/redis.js';
import { slugify } from '../lib/slug.js';
import { registrableDomain } from '../services/showcase-claim.js';
import { recountCountry } from '../services/plots.js';
import { showcaseLocationRows, passedAutomaticCheck } from '../services/showcase-locations.js';
import { upsertShowcase, type GenerateStats, type ShowcaseEntry } from '../showcase/generator.js';
import { fetchCompanies, wikidataUrl, WIKIDATA_LICENSE, type CompanyFact } from './wikidata.js';

/**
 * G12: reserved land for real companies near their public headquarters, so it can later be sold to them.
 * Every plot: generic industry artwork (procedural, no logos or brand imagery), a welcome scene, a showroom layout,
 * "Claim this land", and the label "Reserved for {Company}, not affiliated with FlatMeta". Hidden until the
 * location check passes. Company facts come from Wikidata (CC0); source and licence are stored with each plot.
 */

interface Art {
  sector: string;
  motif: string;
  palette: string[];
  scene: string;
}

const ART: { test: RegExp; art: Art }[] = [
  { test: /bank|financ|insur|invest|capital|payment|asset/i, art: { sector: 'Finance', motif: 'column', palette: ['#0B1020', '#2DE2C4', '#FFC94D', '#1E2A55'], scene: 'a calm marble hall with columns and soft gold light' } },
  { test: /air|aviation|aerospace|airline|airport/i, art: { sector: 'Travel', motif: 'wing', palette: ['#0B1020', '#3FA9F5', '#FFFFFF', '#14305A'], scene: 'a bright terminal with wide windows onto the sky' } },
  { test: /rail|logist|transport|shipping|freight|courier|postal/i, art: { sector: 'Logistics', motif: 'wheel', palette: ['#0B1020', '#FF8A3D', '#2DE2C4', '#2A2340'], scene: 'a busy depot with tracks and parcels in motion' } },
  { test: /auto|vehicle|car |motor|tyre|tire/i, art: { sector: 'Automotive', motif: 'gear', palette: ['#0B1020', '#FF5C5C', '#C9D1EA', '#2B1A2E'], scene: 'a polished showroom floor with a spotlight' } },
  { test: /retail|e-commerce|ecommerce|fashion|apparel|store|supermarket|consumer/i, art: { sector: 'Retail', motif: 'bag', palette: ['#0B1020', '#FF8FB1', '#FFC94D', '#2E1A33'], scene: 'a shop window with neat shelves and warm light' } },
  { test: /food|restaurant|beverage|drink|brew|coffee|fast food|dairy|agri/i, art: { sector: 'Food & drink', motif: 'cup', palette: ['#0B1020', '#FFC94D', '#FF8A3D', '#3A2614'], scene: 'a welcoming café counter with fresh produce' } },
  { test: /software|internet|tech|computer|semiconductor|electronic|telecom|it service|cloud|data/i, art: { sector: 'Technology', motif: 'circuit', palette: ['#0B1020', '#8B7CFF', '#2DE2C4', '#1B1640'], scene: 'a glowing open-plan studio with screens and circuits' } },
  { test: /energy|oil|gas|petrol|mining|utility|electric|power|solar|wind/i, art: { sector: 'Energy', motif: 'bolt', palette: ['#0B1020', '#FFC94D', '#4ADE80', '#18301F'], scene: 'turbines and solar panels under a wide sky' } },
  { test: /media|publish|broadcast|entertain|film|music|news|game/i, art: { sector: 'Media', motif: 'film', palette: ['#0B1020', '#FF5C8A', '#8B7CFF', '#2A1530'], scene: 'a stage with lights and a big screen' } },
  { test: /pharma|health|medic|biotech|hospital/i, art: { sector: 'Health', motif: 'heart', palette: ['#0B1020', '#4ADE80', '#3FA9F5', '#123029'], scene: 'a clean bright lobby with plants' } },
  { test: /construct|real estate|property|cement|steel|engineering|industr|manufactur|chemical/i, art: { sector: 'Industry', motif: 'mountain', palette: ['#0B1020', '#C9D1EA', '#FF8A3D', '#252B3F'], scene: 'a modern campus with cranes on the skyline' } },
];
const DEFAULT_ART: Art = { sector: 'Business', motif: 'globe', palette: ['#0B1020', '#2DE2C4', '#8B7CFF', '#1A2142'], scene: 'a modern plaza with a welcome desk' };

export const artFor = (industry: string | null): Art => ART.find((a) => a.test.test(` ${industry ?? ''} `))?.art ?? DEFAULT_ART;

export const reservedLabel = (company: string) => `Reserved for ${company}, not affiliated with FlatMeta`;

/** The entry for one company: welcome scene, showroom layout, claim call to action. Generic: no brand assets. */
export function entryFor(c: CompanyFact, country: string): ShowcaseEntry {
  const art = artFor(c.industry);
  const slug = slugify(c.name);
  const city = nearestCity(c.lat!, c.lng!, 40)?.city.name ?? c.hqName ?? '';
  const where = city ? ` in ${city}` : '';
  const description = [
    `**${reservedLabel(c.name)}.**`,
    '',
    `Welcome to the land reserved for ${c.name} on FlatMeta, next to its headquarters${where}. Visitors walk past it on the world map every day.`,
    '',
    `It is ready to become ${c.name}'s showroom on the map:`,
    '',
    '- **Welcome hall**: greet the people who walk by, with a message and a cover image',
    '- **Showroom**: products, services and news in a gallery',
    '- **Events corner**: open houses, launches and live chats with visitors',
    '- **Careers & contact**: links that bring visitors to you',
    '',
    `Work at ${c.name}? Claim this land: verify with your company email address or a DNS record, then choose the Brand plan.`,
    '',
    `Company facts (name, website, headquarters) from [Wikidata](${wikidataUrl(c.sourceId)}) (${WIKIDATA_LICENSE}). Artwork is generic and made by FlatMeta.`,
  ].join('\n');
  return {
    brand: c.name,
    slug,
    kind: 'company',
    sector: art.sector,
    city,
    lat: c.lat!,
    lng: c.lng!,
    website: c.website!,
    title: c.name,
    tagline: reservedLabel(c.name),
    description,
    useCase: 'Reserved company land',
    cta: { label: 'Claim this land', url: `${config.APP_URL}/claim/${slug}` },
    highlights: [],
    imagePrompt: `Generic ${art.sector.toLowerCase()} scene for a FlatMeta plot: ${art.scene}. No text, no logos, no brand marks.`,
    palette: art.palette,
    motif: art.motif,
    size: c.popularity >= 40 ? { w: 3, h: 3 } : { w: 2, h: 2 },
    tags: [art.sector.toLowerCase(), 'reserved', country.toLowerCase()],
  };
}

/** Why a company can't get land right now (null: it can). */
async function reasonToSkip(c: CompanyFact, country: string): Promise<string | null> {
  if (!c.website || !safeUrl(c.website)) return 'no website';
  if (c.lat === null || c.lng === null) return 'no headquarters coordinates';
  const actual = resolveCountry(c.lat, c.lng);
  if (actual && actual !== country) return `headquarters in ${actual}`;
  if (heuristicModeration(c.name).flagged) return 'name needs a human check';
  const slug = slugify(c.name);
  if (!slug || slug.length < 2) return 'no usable name';
  const [taken] = await db.select({ id: schema.plots.id }).from(schema.plots).where(eq(schema.plots.slug, slug));
  if (taken) return 'already on FlatMeta';
  const domain = registrableDomain(new URL(c.website).hostname);
  const [sameSite] = await db
    .select({ id: schema.plots.id })
    .from(schema.plots)
    .where(sql`${schema.plots.showcase}->>'website' ilike ${`%${domain}%`}`)
    .limit(1);
  if (sameSite) return 'website already has land';
  return null;
}

export interface CountryRun {
  country: string;
  fetched: number;
  created: string[];
  skipped: { name: string; reason: string }[];
  verified: number;
  logos?: LogoRun;
}

/** Fetches a country's companies (stored with source and licence) and creates up to `take` reserved plots. */
export async function processCountry(country: string, take: number, opts: { fetcher?: typeof fetch; dryRun?: boolean; skipLogos?: boolean } = {}): Promise<CountryRun> {
  const iso = country.toUpperCase();
  const facts = await fetchCompanies(iso, 300, opts.fetcher);
  const run: CountryRun = { country: iso, fetched: facts.length, created: [], skipped: [], verified: 0 };
  for (const f of facts) {
    await db
      .insert(schema.companySources)
      .values({
        source: 'wikidata',
        sourceId: f.sourceId,
        license: WIKIDATA_LICENSE,
        sourceUrl: wikidataUrl(f.sourceId),
        name: f.name,
        website: f.website,
        industry: f.industry,
        hqName: f.hqName,
        queriedCountry: iso,
        countryCode: f.lat !== null && f.lng !== null ? resolveCountry(f.lat, f.lng) : null,
        lat: f.lat,
        lng: f.lng,
        precision: f.precision,
        popularity: f.popularity,
      })
      .onConflictDoUpdate({
        target: [schema.companySources.source, schema.companySources.sourceId],
        set: { popularity: f.popularity, website: f.website, industry: f.industry, fetchedAt: new Date() },
      });
  }
  const queue = await db
    .select()
    .from(schema.companySources)
    .where(and(eq(schema.companySources.queriedCountry, iso), eq(schema.companySources.status, 'new')))
    .orderBy(desc(schema.companySources.popularity))
    .limit(Math.max(take * 4, 40));
  const stats: GenerateStats = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [], plots: [] };
  const createdIds: string[] = [];
  for (const row of queue) {
    if (run.created.length >= take) break;
    const fact: CompanyFact = { sourceId: row.sourceId, name: row.name, website: row.website, industry: row.industry, hqName: row.hqName, lat: row.lat, lng: row.lng, precision: row.precision as CompanyFact['precision'], popularity: row.popularity };
    const why = await reasonToSkip(fact, iso);
    if (why) {
      run.skipped.push({ name: row.name, reason: why });
      if (opts.dryRun) continue;
      // HQ elsewhere: hand it to that country's queue instead of dropping it.
      const elsewhere = why.match(/^headquarters in ([A-Z]{2})$/)?.[1];
      await db
        .update(schema.companySources)
        .set(elsewhere ? { queriedCountry: elsewhere, countryCode: elsewhere } : { status: 'skipped', skipReason: why })
        .where(eq(schema.companySources.id, row.id));
      continue;
    }
    if (opts.dryRun) {
      run.created.push(row.name);
      continue;
    }
    let plot: Plot | null = null;
    try {
      plot = await upsertShowcase(entryFor(fact, iso), iso, { countries: [iso], source: 'curated', approve: true, images: 'procedural', batchId: `wikidata-${new Date().toISOString().slice(0, 10)}` }, stats);
    } catch (err) {
      logger.warn({ err: (err as Error).message, company: row.name }, 'company land: creating the plot failed');
    }
    if (!plot) {
      run.skipped.push({ name: row.name, reason: 'no free land near the headquarters' });
      await db.update(schema.companySources).set({ status: 'skipped', skipReason: 'no free land near the headquarters' }).where(eq(schema.companySources.id, row.id));
      continue;
    }
    await db
      .update(schema.plots)
      .set({
        showcase: sql`coalesce(${schema.plots.showcase}, '{}'::jsonb) || ${JSON.stringify({ source: 'wikidata', sourceId: row.sourceId, license: WIKIDATA_LICENSE, sourceUrl: row.sourceUrl, sourceLat: row.lat, sourceLng: row.lng, precision: row.precision, locationVerified: false })}::jsonb`,
      })
      .where(eq(schema.plots.id, plot.id));
    await db.update(schema.companySources).set({ status: 'created', plotId: plot.id }).where(eq(schema.companySources.id, row.id));
    run.created.push(row.name);
    createdIds.push(plot.id);
  }
  if (!opts.dryRun && createdIds.length) {
    if (config.COMPANY_LAND_AUTO_VERIFY) run.verified = await verifyCreated(createdIds, iso);
    // H1: small official logos for the new plots (Wikidata/Commons, else the official website).
    if (config.COMPANY_LAND_LOGOS && !opts.skipLogos) run.logos = (await backfillLogos({ apply: true, plotIds: createdIds }).catch(() => null)) ?? undefined;
    await recountCountry(iso);
  }
  return run;
}

/** Shows the new plots that pass the automatic location check; the rest wait in Admin → Showcase locations. */
async function verifyCreated(ids: string[], country: string): Promise<number> {
  const rows = (await showcaseLocationRows(country)).filter((r) => ids.includes(r.id) && passedAutomaticCheck(r));
  const patch = { locationVerified: true, locationCheckedAt: new Date().toISOString(), locationNote: 'automatic check passed (company land job)' };
  for (const r of rows) {
    await db
      .update(schema.plots)
      .set({ showcase: sql`coalesce(${schema.plots.showcase}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb` })
      .where(eq(schema.plots.id, r.id));
  }
  return rows.length;
}

const createdIn = async (iso: string) =>
  (
    await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.companySources)
      .where(and(eq(schema.companySources.queriedCountry, iso), eq(schema.companySources.status, 'created')))
  )[0]?.n ?? 0;

const list = (s: string) => s.split(',').map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c));

/**
 * The daily job. First the top COMPANY_LAND_FIRST_PER_COUNTRY companies in each COMPANY_LAND_FIRST_COUNTRIES country;
 * once those are done, COMPANY_LAND_PER_DAY a day, rotating through COMPANY_LAND_COUNTRIES. One run at a time.
 */
export async function runCompanyLand(opts: { fetcher?: typeof fetch; force?: boolean; now?: Date; maxCountries?: number } = {}) {
  if (!opts.force && !companyLandEnabled()) return { skipped: 'disabled (COMPANY_LAND_ENABLED)' };
  const lock = key('job', 'company-land');
  if ((await redis.set(lock, '1', 'EX', 3 * 3600, 'NX')) !== 'OK') return { skipped: 'already running' };
  const runs: CountryRun[] = [];
  const errors: string[] = [];
  try {
    const first = list(config.COMPANY_LAND_FIRST_COUNTRIES);
    let firstPending = false;
    for (const c of first) {
      const need = config.COMPANY_LAND_FIRST_PER_COUNTRY - (await createdIn(c));
      if (need <= 0) continue;
      firstPending = true;
      try {
        runs.push(await processCountry(c, need, { fetcher: opts.fetcher }));
      } catch (err) {
        errors.push(`${c}: ${(err as Error).message}`);
      }
    }
    if (!firstPending && config.COMPANY_LAND_PER_DAY > 0) {
      const all = list(config.COMPANY_LAND_COUNTRIES);
      const day = Math.floor((opts.now ?? new Date()).getTime() / 86400_000);
      let budget = config.COMPANY_LAND_PER_DAY;
      for (let i = 0; i < Math.min(all.length, opts.maxCountries ?? 4) && budget > 0; i++) {
        const c = all[(day + i) % all.length]!;
        try {
          const r = await processCountry(c, budget, { fetcher: opts.fetcher });
          budget -= r.created.length;
          runs.push(r);
        } catch (err) {
          errors.push(`${c}: ${(err as Error).message}`);
        }
      }
    }
  } finally {
    await redis.del(lock);
  }
  const created = runs.reduce((n, r) => n + r.created.length, 0);
  logger.info({ created, countries: runs.map((r) => `${r.country}:${r.created.length}`), errors }, 'company land run');
  return { created, verified: runs.reduce((n, r) => n + r.verified, 0), runs: runs.map((r) => ({ ...r, skipped: r.skipped.slice(0, 20) })), errors };
}
