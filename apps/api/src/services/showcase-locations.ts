import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { CITIES } from '../data/cities.js';
import { haversineKm, resolveCountry } from '../lib/geo.js';
import { loadCurated } from '../showcase/generator.js';
import { recountCountry } from './plots.js';

export interface LocationRow {
  id: string;
  slug: string;
  title: string;
  brand: string;
  city: string | null;
  countryCode: string | null;
  lat: number;
  lng: number;
  size: { w: number; h: number };
  approved: boolean;
  locationVerified: boolean;
  locationCheckedAt: string | null;
  locationNote: string | null;
  seed?: { lat: number; lng: number };
  /** Automatic checks that failed: wrong country, far from its city, pushed far from its listed address. */
  flags: string[];
  /** Whether there was anything to check against (a known city or a curated address). */
  checked: boolean;
}

/** Every showcase plot with the automatic coordinate checks applied (shared by the admin page, bulk verify and the CLI). */
export async function showcaseLocationRows(country?: string): Promise<LocationRow[]> {
  const P = schema.plots;
  const where: SQL[] = [eq(P.kind, 'showcase')];
  if (country) where.push(eq(P.countryCode, country.toUpperCase()));
  const rows = await db.select().from(P).where(and(...where)).orderBy(P.countryCode, P.title).limit(5000);
  // Where the curated file says the organisation is (plots can be pushed aside when space is taken).
  const seeds = new Map<string, { lat: number; lng: number }>();
  for (const code of new Set(rows.map((r) => r.countryCode).filter((c): c is string => !!c))) {
    try {
      for (const e of (await loadCurated(code)).entries) seeds.set(`${code}:${e.brand.toLowerCase()}`, { lat: e.lat, lng: e.lng });
    } catch {
      /* no curated file for this country (AI or Wikidata batch) */
    }
  }
  return rows.map((p) => {
    const sc = p.showcase;
    const flags: string[] = [];
    const actual = resolveCountry(p.centerLat, p.centerLng);
    if (actual && p.countryCode && actual !== p.countryCode) flags.push(`map says ${actual}, plot says ${p.countryCode}`);
    const city = sc?.city ? CITIES.find((c) => c.name.toLowerCase() === sc.city.toLowerCase()) : undefined;
    const cityKm = city ? haversineKm(p.centerLat, p.centerLng, city.lat, city.lng) : null;
    if (cityKm !== null && cityKm > 40) flags.push(`${Math.round(cityKm)} km from ${city!.name}`);
    const seed = sc ? seeds.get(`${p.countryCode}:${sc.brand.toLowerCase()}`) : undefined;
    // Sources that carry their own coordinates (e.g. Wikidata) count as the listed address too.
    const listed = seed ?? (typeof sc?.sourceLat === 'number' && typeof sc?.sourceLng === 'number' ? { lat: sc.sourceLat, lng: sc.sourceLng } : undefined);
    const seedKm = listed ? haversineKm(p.centerLat, p.centerLng, listed.lat, listed.lng) : null;
    if (seedKm !== null && seedKm > 1.5) flags.push(`placed ${seedKm.toFixed(1)} km from its listed address`);
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      brand: sc?.brand ?? p.title,
      city: sc?.city ?? null,
      countryCode: p.countryCode,
      lat: p.centerLat,
      lng: p.centerLng,
      size: { w: p.maxGx - p.minGx + 1, h: p.maxGy - p.minGy + 1 },
      approved: !!sc?.approved,
      locationVerified: !!sc?.locationVerified,
      locationCheckedAt: sc?.locationCheckedAt ?? null,
      locationNote: sc?.locationNote ?? null,
      seed: listed,
      flags,
      checked: cityKm !== null || seedKm !== null,
    };
  });
}

/** Unverified plots whose automatic checks ran and all passed: the ones safe to verify in bulk. */
export const passedAutomaticCheck = (r: LocationRow) => !r.locationVerified && r.checked && r.flags.length === 0;

/**
 * Marks every showcase location that passed the automatic check as verified (G3). Dry run unless `apply`.
 * Plots with a failed check, or nothing to check against, are left for a person (Admin → Showcase locations).
 */
export async function verifyPassedLocations(opts: { apply: boolean; by: string; country?: string }) {
  const rows = await showcaseLocationRows(opts.country);
  const pass = rows.filter(passedAutomaticCheck);
  const skipped = rows.filter((r) => !r.locationVerified && !passedAutomaticCheck(r));
  if (opts.apply && pass.length) {
    const patch = { locationVerified: true, locationCheckedAt: new Date().toISOString(), locationNote: `bulk-verified (automatic check passed) by ${opts.by}` };
    const ids = pass.map((r) => r.id);
    for (let i = 0; i < ids.length; i += 500) {
      await db
        .update(schema.plots)
        .set({ showcase: sql`coalesce(${schema.plots.showcase}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`, updatedAt: new Date() })
        .where(and(inArray(schema.plots.id, ids.slice(i, i + 500)), eq(schema.plots.kind, 'showcase')));
    }
    for (const c of new Set(pass.map((r) => r.countryCode))) await recountCountry(c);
  }
  return {
    applied: opts.apply,
    total: rows.length,
    alreadyVerified: rows.filter((r) => r.locationVerified).length,
    verified: pass.length,
    leftForReview: skipped.map((r) => ({ id: r.id, brand: r.brand, countryCode: r.countryCode, reason: r.flags.join('; ') || 'nothing to check against' })),
    sample: pass.slice(0, 20).map((r) => ({ brand: r.brand, city: r.city, countryCode: r.countryCode, lat: Number(r.lat.toFixed(4)), lng: Number(r.lng.toFixed(4)) })),
  };
}
