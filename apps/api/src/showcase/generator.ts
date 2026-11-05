import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db/client.js';
import type { Plot, ShowcaseInfo } from '../db/schema.js';
import { generateImage } from '../ai/image/index.js';
import { MOTIFS } from '../ai/image/procedural.js';
import { generateJson } from '../ai/text/index.js';
import { config } from '../config.js';
import { countryName, nearestCity, resolveCountry } from '../lib/geo.js';
import { cellsOf, rectAround, rectCenter, type Rect } from '../lib/grid.js';
import { logger } from '../lib/logger.js';
import { safeUrl } from '../lib/markdown.js';
import { tierOfRect } from '../lib/pricing.js';
import { slugify } from '../lib/slug.js';
import { createPlot, overlapping, recountCountry } from '../services/plots.js';

export const ShowcaseEntry = z.object({
  brand: z.string().min(2).max(100),
  slug: z.string().min(2).max(80),
  kind: z.string().default('company'),
  sector: z.string().max(40),
  city: z.string().max(80),
  lat: z.number().min(-85).max(85),
  lng: z.number().min(-180).max(180),
  website: z.string().max(300),
  title: z.string().max(120),
  tagline: z.string().max(160),
  description: z.string().max(2000),
  useCase: z.string().max(80),
  cta: z.object({ label: z.string().max(40), url: z.string().max(300) }).nullable().optional(),
  highlights: z.array(z.string().max(120)).max(5).default([]),
  imagePrompt: z.string().max(800),
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(3).max(5),
  motif: z.string(),
  size: z.object({ w: z.number().int().min(1).max(8), h: z.number().int().min(1).max(8) }),
  tags: z.array(z.string().max(30)).max(8).default([]),
});
export type ShowcaseEntry = z.infer<typeof ShowcaseEntry>;

export const ShowcaseFile = z.object({ country: z.object({ iso2: z.string().length(2), name: z.string() }), entries: z.array(ShowcaseEntry) });

export const SEED_DIR = path.resolve(process.cwd(), 'seed/showcase');

export async function curatedCountries(): Promise<string[]> {
  return (await readdir(SEED_DIR)).filter((f) => /^[A-Z]{2}\.json$/.test(f)).map((f) => f.slice(0, 2)).sort();
}

export async function loadCurated(code: string): Promise<{ country: string; entries: ShowcaseEntry[] }> {
  const raw = JSON.parse(await readFile(path.join(SEED_DIR, `${code.toUpperCase()}.json`), 'utf8'));
  const parsed = ShowcaseFile.parse(raw);
  return { country: parsed.country.iso2.toUpperCase(), entries: parsed.entries };
}

/** Asks the configured text model for notable organisations in a country (same schema as the curated files). */
export async function aiEntries(code: string, count: number, names?: string[]): Promise<ShowcaseEntry[]> {
  const out = await generateJson({
    schema: z.object({ entries: z.array(ShowcaseEntry).min(1).max(30) }),
    maxTokens: 16000,
    system: `You create SAMPLE showcase content for FlatMeta, a world map where organisations can claim plots. Each entry shows how a well-known organisation COULD use a plot. Rules: use the organisation's real name and official homepage only; coordinates of its real HQ/flagship/venue (4 decimals, accurate); original tagline (never the real slogan); description 70–120 words in second person, illustrative, no claims of partnership, no prices, no invented facts; imagePrompt for an ORIGINAL illustration (no logos, no text, no trademarks, no brand trade dress); palette of 3 hex colours that evoke the sector/city without copying brand colours; motif from: ${MOTIFS.join(', ')}; size w 2–5, h 2–4. Avoid tobacco, weapons, gambling, adult, political parties.`,
    prompt: names?.length
      ? `Country: ${countryName(code)} (${code}). Create entries for: ${names.join(', ')}.`
      : `Country: ${countryName(code)} (${code}). Create ${count} entries: a varied mix of ~60% well-known companies and ~40% organisations (museums, universities, sports clubs, landmarks, NGOs), spread across at least 3 cities.`,
  });
  if (!out) throw new Error('No AI text provider is configured; use the curated source or set ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY.');
  return out.entries;
}

/** Finds a free w×h rectangle as close as possible to the entry's coordinates (square spiral). */
export async function placeEntry(lat: number, lng: number, w: number, h: number, exceptPlotId?: string): Promise<Rect | null> {
  const base = rectAround(lng, lat, w, h);
  const tryRect = async (dx: number, dy: number) => {
    const r = { minGx: base.minGx + dx, minGy: base.minGy + dy, maxGx: base.maxGx + dx, maxGy: base.maxGy + dy };
    const hits = await overlapping(r, exceptPlotId);
    return hits.length === 0 ? r : null;
  };
  const first = await tryRect(0, 0);
  if (first) return first;
  for (let ring = 1; ring <= 30; ring++) {
    const step = Math.max(1, Math.min(w, h));
    for (let dx = -ring; dx <= ring; dx += 1) {
      for (const dy of [-ring, ring]) {
        const r = await tryRect(dx * step, dy * step);
        if (r) return r;
      }
    }
    for (let dy = -ring + 1; dy <= ring - 1; dy += 1) {
      for (const dx of [-ring, ring]) {
        const r = await tryRect(dx * step, dy * step);
        if (r) return r;
      }
    }
  }
  return null;
}

function descriptionFor(e: ShowcaseEntry): string {
  const bullets = e.highlights.length ? `\n\n${e.highlights.map((h) => `- ${h}`).join('\n')}` : '';
  return `${e.description.trim()}${bullets}`;
}

export interface GenerateOptions {
  countries: string[];
  source: 'curated' | 'ai';
  count?: number;
  names?: string[];
  images?: typeof config.AI_IMAGE_PROVIDER;
  approve?: boolean;
  force?: boolean;
  regenerateImages?: boolean;
  batchId?: string;
  onProgress?: (msg: string) => void;
}

export interface GenerateStats {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
  plots: string[];
}

export async function upsertShowcase(e: ShowcaseEntry, country: string, opts: GenerateOptions, stats: GenerateStats): Promise<Plot | null> {
  const slug = slugify(e.slug || e.brand);
  const [existing] = await db.select().from(schema.plots).where(eq(schema.plots.slug, slug));
  if (existing && existing.kind !== 'showcase') {
    stats.skipped++;
    return null; // the slug belongs to a real (claimed) plot
  }
  const website = safeUrl(e.website) ?? 'https://example.com';
  const showcase: ShowcaseInfo = {
    brand: e.brand,
    website,
    sector: e.sector,
    kind: e.kind,
    city: e.city,
    useCase: e.useCase,
    highlights: e.highlights,
    imagePrompt: e.imagePrompt,
    palette: e.palette,
    motif: (MOTIFS as readonly string[]).includes(e.motif) ? e.motif : 'star',
    batchId: opts.batchId,
    approved: existing?.showcase?.approved ?? !!opts.approve,
  };
  if (opts.approve) showcase.approved = true;
  const content = {
    title: e.brand,
    tagline: e.tagline,
    descriptionMd: descriptionFor(e),
    links: [{ label: 'Official website', url: website }],
    cta: { label: e.cta?.label || 'Visit the website', url: safeUrl(e.cta?.url) ?? website },
    category: e.sector,
    tags: e.tags.map((t) => t.toLowerCase()).slice(0, 8),
    theme: { primary: e.palette[1]!, accent: e.palette[2]! },
    frame: 'gold',
    showcase,
  };

  let plot: Plot;
  if (existing) {
    if (!opts.force && !opts.regenerateImages) {
      if (opts.approve && !existing.showcase?.approved) {
        await db.update(schema.plots).set({ showcase: { ...existing.showcase!, approved: true } }).where(eq(schema.plots.id, existing.id));
        stats.updated++;
      } else stats.skipped++;
      return existing;
    }
    [plot] = (await db
      .update(schema.plots)
      .set(opts.force ? { ...content, updatedAt: new Date() } : { showcase: { ...existing.showcase!, approved: showcase.approved }, updatedAt: new Date() })
      .where(eq(schema.plots.id, existing.id))
      .returning()) as [Plot];
    stats.updated++;
  } else {
    const rect = await placeEntry(e.lat, e.lng, e.size.w, e.size.h);
    if (!rect) {
      stats.failed++;
      stats.errors.push(`${e.brand}: no free space near ${e.lat},${e.lng}`);
      return null;
    }
    plot = await createPlot({
      rect,
      title: e.brand,
      slugBase: slug,
      kind: 'showcase',
      status: 'showcase',
      tier: tierOfRect(rect),
      countryCode: country,
      regionSlug: nearestCity(e.lat, e.lng, 40)?.city.slug ?? null,
      extra: { ...content, publishedAt: new Date() },
    });
    stats.created++;
  }

  if (!plot.coverImageUrl || opts.regenerateImages) {
    const img = await generateImage({ id: `showcase-${plot.slug}`, prompt: e.imagePrompt, palette: e.palette, motif: showcase.motif, folder: 'showcase', provider: opts.images });
    [plot] = (await db.update(schema.plots).set({ coverImageUrl: img.url, thumbUrl: img.thumbUrl }).where(eq(schema.plots.id, plot.id)).returning()) as [Plot];
  }
  stats.plots.push(plot.slug);
  return plot;
}

export async function generateShowcase(opts: GenerateOptions): Promise<GenerateStats> {
  const stats: GenerateStats = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [], plots: [] };
  for (const raw of opts.countries) {
    const code = raw.toUpperCase();
    let entries: ShowcaseEntry[];
    try {
      entries = opts.source === 'ai' ? await aiEntries(code, opts.count ?? 12, opts.names) : (await loadCurated(code)).entries;
    } catch (err) {
      stats.failed++;
      stats.errors.push(`${code}: ${(err as Error).message}`);
      continue;
    }
    if (opts.count) entries = entries.slice(0, opts.count);
    opts.onProgress?.(`${code}: ${entries.length} entries`);
    for (const e of entries) {
      try {
        await upsertShowcase(e, code, opts, stats);
        opts.onProgress?.(`  ✓ ${e.brand}`);
      } catch (err) {
        stats.failed++;
        stats.errors.push(`${e.brand}: ${(err as Error).message}`);
        logger.warn({ err, brand: e.brand }, 'Showcase entry failed');
      }
    }
    await recountCountry(code);
  }
  return stats;
}

/** Re-renders one showcase plot's image with the given provider. */
export async function regenerateShowcaseImage(plotId: string, provider?: typeof config.AI_IMAGE_PROVIDER, prompt?: string) {
  const [plot] = await db.select().from(schema.plots).where(eq(schema.plots.id, plotId));
  if (!plot?.showcase) throw new Error('Not a showcase plot');
  const sc = plot.showcase;
  const img = await generateImage({
    id: `showcase-${plot.slug}-${Date.now().toString(36)}`,
    prompt: prompt ?? sc.imagePrompt,
    palette: sc.palette,
    motif: sc.motif,
    folder: 'showcase',
    provider,
  });
  const [updated] = await db
    .update(schema.plots)
    .set({ coverImageUrl: img.url, thumbUrl: img.thumbUrl, showcase: { ...sc, imagePrompt: prompt ?? sc.imagePrompt }, updatedAt: sql`now()` })
    .where(eq(schema.plots.id, plot.id))
    .returning();
  return { plot: updated!, pending: !!img.pending, provider: img.provider };
}

/**
 * Moves a showcase plot so it sits on (or as near as possible to) a new point, keeping its size. Used by
 * Admin → Showcase → Locations to nudge plots that landed a few blocks off. Marks the location as checked.
 */
export async function moveShowcasePlot(plotId: string, lat: number, lng: number, checkedBy: string): Promise<Plot> {
  const [plot] = await db.select().from(schema.plots).where(eq(schema.plots.id, plotId));
  if (!plot || plot.kind !== 'showcase') throw new Error('Showcase plot not found');
  const w = plot.maxGx - plot.minGx + 1;
  const h = plot.maxGy - plot.minGy + 1;
  const rect = await placeEntry(lat, lng, w, h, plot.id);
  if (!rect) throw new Error('No free space near that point');
  const center = rectCenter(rect);
  const near = nearestCity(center.lat, center.lng, 60);
  const moved = await db.transaction(async (t) => {
    await t.delete(schema.plotCells).where(eq(schema.plotCells.plotId, plot.id));
    const [row] = await t
      .update(schema.plots)
      .set({
        ...rect,
        centerLat: center.lat,
        centerLng: center.lng,
        tier: tierOfRect(rect),
        countryCode: resolveCountry(center.lat, center.lng) ?? plot.countryCode,
        regionSlug: near?.city.slug ?? plot.regionSlug,
        showcase: { ...plot.showcase!, locationVerified: true, locationCheckedAt: new Date().toISOString(), locationNote: `moved by ${checkedBy}` },
        updatedAt: new Date(),
      })
      .where(eq(schema.plots.id, plot.id))
      .returning();
    const cells = [...cellsOf(rect)].map((c) => ({ ...c, plotId: plot.id }));
    for (let i = 0; i < cells.length; i += 500) await t.insert(schema.plotCells).values(cells.slice(i, i + 500));
    return row!;
  });
  await recountCountry(plot.countryCode);
  if (moved.countryCode !== plot.countryCode) await recountCountry(moved.countryCode);
  return moved;
}
