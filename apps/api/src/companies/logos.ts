import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { config } from '../config.js';
import { db, schema } from '../db/client.js';
import type { Plot } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import { putFile } from '../lib/storage.js';
import { registrableDomain } from '../services/showcase-claim.js';
import { BlockedUrlError, onDomain, safeFetch } from './safe-fetch.js';

/**
 * H1: a small official logo on each company plot, to identify the company for claiming. Never the main artwork.
 * Order: Wikidata P154 (through the Commons API: file page, licence, author), else the official website named in
 * Wikidata P856 / the curated file (apple-touch-icon, then <link rel="icon">, then /favicon.ico). Nothing else:
 * no search engines, no logo sites. Stored as a PNG of at most 128×128 in the media dir.
 */
export const LOGO_MAX_BYTES = 1_000_000;
export const LOGO_SIZE = 128;
const WIKIMEDIA = new Set(['www.wikidata.org', 'commons.wikimedia.org', 'upload.wikimedia.org', 'thumb.wikimedia.org']);
const allowWikimedia = (h: string) => WIKIMEDIA.has(h);

export interface FoundLogo {
  png: Buffer;
  source: 'wikidata' | 'website';
  sourceUrl: string;
  license: string | null;
  author: string | null;
}

// ── Image checks ──

type Kind = 'png' | 'jpeg' | 'gif' | 'webp' | 'svg' | 'ico';
export function sniff(b: Buffer): Kind | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 6 && /^GIF8[79]a$/.test(b.subarray(0, 6).toString('latin1'))) return 'gif';
  if (b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (b.length >= 4 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return 'ico';
  const head = b.subarray(0, 1024).toString('utf8').replace(/^\uFEFF/, '').trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)) return 'svg';
  return null;
}

/** The content-type the server sent must agree with what the bytes are. */
export function typeAgrees(contentType: string, kind: Kind): boolean {
  const ct = contentType.split(';')[0]!.trim();
  if (kind === 'svg') return ct === 'image/svg+xml';
  if (kind === 'ico') return ['image/x-icon', 'image/vnd.microsoft.icon', 'image/ico', 'image/icon', 'application/octet-stream'].includes(ct);
  return ct === `image/${kind}` || (kind === 'jpeg' && ct === 'image/jpg') || (ct === 'application/octet-stream' && kind === 'png');
}

/**
 * Makes an SVG safe to rasterise, or refuses it: no DOCTYPE/entities (XXE, billion laughs), no scripts, event
 * handlers, foreignObject or <use>/<image> of anything but local fragments and data: images, no external CSS.
 */
export function sanitizeSvg(raw: string): string | null {
  if (raw.length > LOGO_MAX_BYTES) return null;
  if (/<!DOCTYPE|<!ENTITY/i.test(raw)) return null;
  let s = raw.replace(/<\?xml[^>]*\?>/i, '');
  s = s.replace(/<script[\s\S]*?<\/script\s*>/gi, '').replace(/<script[^>]*\/>/gi, '');
  s = s.replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, '');
  s = s.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // Any reference that isn't a local #fragment or an inline raster image goes.
  s = s.replace(/\s(xlink:href|href)\s*=\s*("([^"]*)"|'([^']*)')/gi, (m, _a, _q, d1, d2) => {
    const v = String(d1 ?? d2 ?? '').trim();
    return v.startsWith('#') || /^data:image\/(png|jpeg|gif|webp);base64,/i.test(v) ? m : '';
  });
  s = s.replace(/@import[^;]*;?/gi, '').replace(/url\(\s*(['"]?)(?!#)[^)]*\1\s*\)/gi, 'none');
  if (/<script|javascript:|<foreignObject|<iframe|<embed|<object/i.test(s)) return null;
  if (!/<svg[\s>]/i.test(s)) return null;
  return s;
}

/** The largest PNG-encoded image inside an .ico (BMP-only icons are skipped: too small to be useful). */
export function pngFromIco(b: Buffer): Buffer | null {
  if (b.length < 6) return null;
  const count = b.readUInt16LE(4);
  let best: Buffer | null = null;
  let bestSize = 0;
  for (let i = 0; i < Math.min(count, 64); i++) {
    const o = 6 + i * 16;
    if (o + 16 > b.length) break;
    const w = b[o] || 256;
    const len = b.readUInt32LE(o + 8);
    const off = b.readUInt32LE(o + 12);
    if (off + len > b.length || len < 8) continue;
    const img = b.subarray(off, off + len);
    if (sniff(img) === 'png' && w > bestSize) {
      best = Buffer.from(img);
      bestSize = w;
    }
  }
  return best;
}

/**
 * Checks and converts a downloaded file into the stored logo: PNG, at most 128 px on its long side. Empty margins
 * (transparent, or a flat background colour) are trimmed first, so the mark itself fills the badge (M7).
 */
export async function normalizeLogo(body: Buffer, contentType: string): Promise<Buffer> {
  if (body.length > LOGO_MAX_BYTES) throw new BlockedUrlError('larger than 1 MB');
  const kind = sniff(body);
  if (!kind) throw new BlockedUrlError('not an image');
  if (!typeAgrees(contentType, kind)) throw new BlockedUrlError(`content-type ${contentType || 'missing'} does not match ${kind}`);
  let input: Buffer = body;
  if (kind === 'svg') {
    const clean = sanitizeSvg(body.toString('utf8'));
    if (!clean) throw new BlockedUrlError('unsafe SVG');
    input = Buffer.from(clean);
  } else if (kind === 'ico') {
    const png = pngFromIco(body);
    if (!png) throw new BlockedUrlError('icon has no PNG image');
    input = png;
  }
  const img = sharp(input, { density: kind === 'svg' ? 144 : undefined, limitInputPixels: 4096 * 4096, failOn: 'error' });
  const meta = await img.metadata();
  if (!meta.width || !meta.height) throw new BlockedUrlError('no size');
  if (Math.max(meta.width, meta.height) < 32 && kind !== 'svg') throw new BlockedUrlError('too small');
  const flat = await img.png().toBuffer();
  // trim() throws on an image that is all one colour; such a file keeps its size (and fails the fill check later).
  const trimmed = await sharp(flat).trim({ threshold: 12 }).png().toBuffer().catch(() => flat);
  // Kept at its own aspect ratio (no square padding): the page's badge fits it with object-fit: contain.
  return sharp(trimmed).resize(LOGO_SIZE, LOGO_SIZE, { fit: 'inside', withoutEnlargement: kind !== 'svg' }).png({ compressionLevel: 9 }).toBuffer();
}

/**
 * M7: the share of the square badge the visible pixels of a stored logo cover (their bounding box over the square that
 * contains the image). A square mark is ~1; a 5:1 wordmark is ~0.2, too thin to read at badge size, so pages show the
 * company's initials instead.
 */
export async function logoFill(png: Buffer): Promise<number> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3]! > 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return 0;
  const side = Math.max(info.width, info.height);
  return Math.round((((x1 - x0 + 1) * (y1 - y0 + 1)) / (side * side)) * 100) / 100;
}

// ── 1. Wikidata P154 through the Commons API ──

// Wikimedia asks API clients to go gently: one request at a time, a short gap, and back off on 429/5xx.
let wmQueue: Promise<unknown> = Promise.resolve();
let wmGapMs = 120;
/** Tests set the gap to 0. */
export const setWikimediaGap = (ms: number) => (wmGapMs = ms);
function wikimedia(url: string, maxBytes: number, accept: string) {
  const run = wmQueue.then(async () => {
    for (let attempt = 0; ; attempt++) {
      if (wmGapMs) await new Promise((r) => setTimeout(r, wmGapMs));
      const r = await safeFetch(url, { allow: allowWikimedia, maxBytes, accept, timeoutMs: 15_000 });
      if ((r.status === 429 || r.status >= 500) && attempt < 3) {
        await new Promise((res) => setTimeout(res, (attempt + 1) * 2000));
        continue;
      }
      return r;
    }
  });
  wmQueue = run.catch(() => undefined);
  return run;
}
const json = async (url: string) => {
  const r = await wikimedia(url, 2_000_000, 'application/json');
  if (r.status !== 200) throw new Error(`${new URL(url).hostname} ${r.status}`);
  return JSON.parse(r.body.toString('utf8')) as Record<string, unknown>;
};
const stripHtml = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

type Claims = Record<string, { mainsnak?: { datavalue?: { value?: unknown } } }[]>;
async function entityClaims(qids: string[]): Promise<Record<string, Claims>> {
  const d = await json(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids=${qids.join('|')}`);
  const out: Record<string, Claims> = {};
  for (const [id, e] of Object.entries((d.entities ?? {}) as Record<string, { claims?: Claims }>)) out[id] = e.claims ?? {};
  return out;
}
const firstString = (c: Claims, p: string) => {
  const v = c[p]?.[0]?.mainsnak?.datavalue?.value;
  return typeof v === 'string' ? v : null;
};

/** Wikidata item for a curated company: search by name, keep only an item whose official website is the same domain. */
export async function resolveQid(name: string, website: string): Promise<string | null> {
  const domain = registrableDomain(new URL(website).hostname);
  const d = await json(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=7&search=${encodeURIComponent(name)}`);
  const ids = ((d.search ?? []) as { id: string }[]).map((x) => x.id).filter((x) => /^Q\d+$/.test(x));
  if (!ids.length) return null;
  const claims = await entityClaims(ids);
  for (const id of ids) {
    const sites = (claims[id]?.P856 ?? []).map((s) => s.mainsnak?.datavalue?.value).filter((v): v is string => typeof v === 'string');
    if (sites.some((s) => { try { return registrableDomain(new URL(s).hostname) === domain; } catch { return false; } })) return id;
  }
  return null;
}

export async function wikidataLogo(qid: string): Promise<FoundLogo | null> {
  const file = firstString((await entityClaims([qid]))[qid] ?? {}, 'P154');
  if (!file) return null;
  const d = await json(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|mime|size|extmetadata&iiurlwidth=256&titles=${encodeURIComponent(`File:${file}`)}`);
  const page = Object.values(((d.query as { pages?: Record<string, unknown> })?.pages ?? {}) as Record<string, { imageinfo?: Record<string, unknown>[] }>)[0];
  const info = page?.imageinfo?.[0] as { thumburl?: string; url?: string; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> } | undefined;
  if (!info) return null;
  // Commons renders SVGs to PNG itself (thumburl): we download that raster, never the original SVG.
  const img = await wikimedia(info.thumburl ?? info.url!, LOGO_MAX_BYTES, 'image/*');
  if (img.status !== 200) return null;
  const meta = info.extmetadata ?? {};
  return {
    png: await normalizeLogo(img.body, img.contentType),
    source: 'wikidata',
    sourceUrl: info.descriptionurl ?? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}`,
    license: stripHtml(meta.LicenseShortName?.value ?? meta.License?.value ?? '') || null,
    author: stripHtml(meta.Artist?.value ?? '').slice(0, 300) || null,
  };
}

// ── 2. The official website ──

/** Icon links in a page, best first: apple-touch-icon, then SVG icons, then the largest PNG icon, then other icons. */
export function iconCandidates(html: string, base: string): string[] {
  const links = [...html.slice(0, 300_000).matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(2).find((x) => x !== undefined) ?? '';
  const scored: { href: string; score: number }[] = [];
  for (const tag of links) {
    const rel = attr(tag, 'rel').toLowerCase();
    const href = attr(tag, 'href');
    if (!href || href.startsWith('data:')) continue;
    const type = attr(tag, 'type').toLowerCase();
    const size = Number(attr(tag, 'sizes').match(/(\d+)x\d+/)?.[1] ?? 0);
    let score = -1;
    if (/apple-touch-icon/.test(rel)) score = 3000 + size;
    else if (/(^|\s)icon(\s|$)/.test(rel) || rel === 'shortcut icon') score = type.includes('svg') || /\.svg(\?|$)/i.test(href) ? 2500 : type.includes('png') || /\.png(\?|$)/i.test(href) ? 2000 + size : 1000 + size;
    if (score < 0) continue;
    try {
      scored.push({ href: new URL(href, base).toString(), score });
    } catch {
      /* bad href */
    }
  }
  return [...new Set(scored.sort((a, b) => b.score - a.score).map((s) => s.href))];
}

export async function websiteLogo(website: string): Promise<FoundLogo | null> {
  const home = new URL(website);
  const allow = onDomain(registrableDomain(home.hostname));
  const tried = new Set<string>();
  const attempt = async (url: string): Promise<FoundLogo | null> => {
    if (tried.has(url)) return null;
    tried.add(url);
    try {
      const r = await safeFetch(url, { allow, maxBytes: LOGO_MAX_BYTES, accept: 'image/*' });
      if (r.status !== 200) return null;
      return { png: await normalizeLogo(r.body, r.contentType), source: 'website', sourceUrl: r.url, license: null, author: null };
    } catch (err) {
      logger.debug({ url, err: (err as Error).message }, 'logo candidate refused');
      return null;
    }
  };
  let base = home.toString();
  let candidates: string[] = [];
  try {
    const page = await safeFetch(home.toString(), { allow, maxBytes: LOGO_MAX_BYTES, accept: 'text/html' });
    base = page.url;
    if (page.status === 200 && page.contentType.includes('html')) candidates = iconCandidates(page.body.toString('utf8'), page.url);
  } catch {
    /* no page: still try /favicon.ico */
  }
  for (const c of candidates.slice(0, 6)) {
    const hit = await attempt(c);
    if (hit) return hit;
  }
  return attempt(new URL('/favicon.ico', base).toString());
}

export async function findLogo(c: { qid?: string | null; name: string; website: string | null }): Promise<{ logo: FoundLogo | null; qid: string | null; reason?: string }> {
  if (!c.website) return { logo: null, qid: c.qid ?? null, reason: 'no official website' };
  let qid = c.qid && /^Q\d+$/.test(c.qid) ? c.qid : null;
  try {
    qid ??= await resolveQid(c.name, c.website);
    if (qid) {
      const wd = await wikidataLogo(qid);
      if (wd) return { logo: wd, qid };
    }
  } catch (err) {
    logger.debug({ company: c.name, err: (err as Error).message }, 'wikidata logo lookup failed');
  }
  const site = await websiteLogo(c.website).catch(() => null);
  return site ? { logo: site, qid } : { logo: null, qid, reason: 'no usable logo on Wikidata or the official website' };
}

// ── Showing, hiding and the switches ──

const GLOBAL_KEY = 'companyLogos.disabled';
let globalCache: { value: boolean; at: number } | null = null;
export async function logosGloballyDisabled(): Promise<boolean> {
  if (!config.COMPANY_LAND_LOGOS) return true;
  if (globalCache && Date.now() - globalCache.at < 15_000) return globalCache.value;
  const [row] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, GLOBAL_KEY));
  globalCache = { value: row?.value === true, at: Date.now() };
  return globalCache.value;
}
/** Synchronous read for views (refreshed in the background). */
export function logosGloballyDisabledCached(): boolean {
  if (!config.COMPANY_LAND_LOGOS) return true;
  if (!globalCache || Date.now() - globalCache.at >= 15_000) void logosGloballyDisabled().catch(() => undefined);
  return globalCache?.value ?? false;
}
export async function setLogosGloballyDisabled(disabled: boolean, by: string) {
  await db
    .insert(schema.appSettings)
    .values({ key: GLOBAL_KEY, value: disabled, updatedBy: by })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value: disabled, updatedBy: by, updatedAt: new Date() } });
  globalCache = { value: disabled, at: Date.now() };
}

/** The logo a page may show for this plot, or null (kill-switch, per-plot hide, takedown, or none). */
export function visibleLogo(p: Pick<Plot, 'showcase'>): { url: string; source: string; sourceUrl: string; license: string | null; author: string | null; fill?: number } | null {
  const l = p.showcase?.logo;
  if (!l?.url || p.showcase?.logoHidden || logosGloballyDisabledCached()) return null;
  return l;
}

export async function setPlotLogoHidden(plotId: string, hidden: boolean, reason: string) {
  await db
    .update(schema.plots)
    .set({ showcase: sql`coalesce(${schema.plots.showcase}, '{}'::jsonb) || ${JSON.stringify({ logoHidden: hidden, logoHiddenReason: hidden ? reason : null })}::jsonb` })
    .where(eq(schema.plots.id, plotId));
  await db.update(schema.companySources).set({ logoHidden: hidden }).where(eq(schema.companySources.plotId, plotId));
}

/** The company_sources row for a showcase plot: Wikidata plots have one; curated plots get one (source "curated"). */
export async function sourceRowFor(plot: Plot) {
  const [row] = await db.select().from(schema.companySources).where(eq(schema.companySources.plotId, plot.id));
  if (row) return row;
  const sc = plot.showcase!;
  const [created] = await db
    .insert(schema.companySources)
    .values({
      source: 'curated',
      sourceId: plot.slug,
      license: 'curated',
      sourceUrl: sc.website,
      name: sc.brand,
      website: sc.website,
      industry: sc.sector,
      hqName: sc.city,
      queriedCountry: plot.countryCode ?? 'XX',
      countryCode: plot.countryCode,
      lat: plot.centerLat,
      lng: plot.centerLng,
      status: 'created',
      plotId: plot.id,
    })
    .onConflictDoUpdate({ target: [schema.companySources.source, schema.companySources.sourceId], set: { plotId: plot.id } })
    .returning();
  return created!;
}

export interface LogoRun {
  checked: number;
  wikidata: number;
  website: number;
  none: number;
  skipped: number;
  missing: { company: string; reason: string }[];
}

/**
 * Finds and stores logos for showcase plots (backfill and the daily job). Dry run unless `apply`. Plots that already
 * have a logo, or whose logo was hidden by a person or a takedown, are left alone unless `refresh`.
 */
export async function backfillLogos(opts: { apply: boolean; country?: string; plotIds?: string[]; refresh?: boolean; concurrency?: number; onProgress?: (msg: string) => void }): Promise<LogoRun> {
  const P = schema.plots;
  const where = [eq(P.kind, 'showcase')];
  if (opts.country) where.push(eq(P.countryCode, opts.country.toUpperCase()));
  if (opts.plotIds) where.push(inArray(P.id, opts.plotIds.length ? opts.plotIds : ['00000000-0000-0000-0000-000000000000']));
  const plots = await db.select().from(P).where(and(...where)).orderBy(P.countryCode, P.title).limit(5000);
  const run: LogoRun = { checked: 0, wikidata: 0, website: 0, none: 0, skipped: 0, missing: [] };
  const queue = [...plots];
  const worker = async () => {
    for (let plot = queue.shift(); plot; plot = queue.shift()) {
      if (!plot.showcase) continue;
      if (!opts.refresh && (plot.showcase.logo || plot.showcase.logoHidden)) {
        run.skipped++;
        continue;
      }
      run.checked++;
      const src = opts.apply ? await sourceRowFor(plot) : null;
      const qid = plot.showcase.sourceId && /^Q\d+$/.test(plot.showcase.sourceId) ? plot.showcase.sourceId : null;
      const { logo, qid: found, reason } = await findLogo({ qid, name: plot.showcase.brand, website: plot.showcase.website });
      if (!logo) {
        run.none++;
        run.missing.push({ company: plot.showcase.brand, reason: reason ?? 'none' });
        opts.onProgress?.(`  – ${plot.showcase.brand}: ${reason}`);
        continue;
      }
      run[logo.source]++;
      opts.onProgress?.(`  ✓ ${plot.showcase.brand}: ${logo.source} ${logo.sourceUrl}`);
      if (!opts.apply) continue;
      const url = await putFile(`logos/${plot.slug}-${Date.now().toString(36)}.png`, logo.png, 'image/png');
      const entry = { url, source: logo.source, sourceUrl: logo.sourceUrl, license: logo.license, author: logo.author, fill: await logoFill(logo.png) };
      await db
        .update(P)
        .set({ showcase: sql`coalesce(${P.showcase}, '{}'::jsonb) || ${JSON.stringify({ logo: entry, ...(found && !plot.showcase.sourceId ? { wikidataId: found } : {}) })}::jsonb` })
        .where(eq(P.id, plot.id));
      await db
        .update(schema.companySources)
        .set({ logoUrl: url, logoSource: logo.source, logoSourceUrl: logo.sourceUrl, logoLicense: logo.license, logoAuthor: logo.author, logoFetchedAt: new Date() })
        .where(eq(schema.companySources.id, src!.id));
    }
  };
  await Promise.all(Array.from({ length: opts.concurrency ?? 4 }, worker));
  return run;
}

/** Company plots without a logo row yet (for reporting). */
export async function plotsWithoutLogo() {
  return db.select({ id: schema.companySources.id }).from(schema.companySources).where(and(eq(schema.companySources.status, 'created'), isNull(schema.companySources.logoUrl)));
}
