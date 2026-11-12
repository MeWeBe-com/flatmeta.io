import { and, desc, eq, gte, ilike, inArray, isNull, lt, sql, type SQL } from 'drizzle-orm';
import { config, showcaseLocationCheck } from '../config.js';
import { db, schema } from '../db/client.js';
import { emailAdmins, templates } from '../email/index.js';
import { registrableDomain } from '../services/showcase-claim.js';
import { visibleLogo, sourceRowFor } from './logos.js';
import { onDomain, safeFetch } from './safe-fetch.js';

/**
 * H2: the company land register: every company plot (curated showcase and company land), where it is, its status and
 * the admin-only outreach fields, for selling the land to its company later. Public data stays on /brands.
 */
export const REGISTER_STATUSES = ['hidden', 'reserved', 'claim_started', 'claimed', 'removal_requested', 'removed'] as const;
export type RegisterStatus = (typeof REGISTER_STATUSES)[number];
export const OUTREACH = ['not_contacted', 'contacted', 'replied', 'sold'] as const;

/** Public site links: the canonical www host in production (https://www.flatmeta.io), else APP_URL. */
export function siteUrl(): string {
  const u = new URL(config.APP_URL);
  if (config.APP_ENV === 'production' && u.hostname === config.PRODUCTION_DOMAIN) u.hostname = `www.${config.PRODUCTION_DOMAIN}`;
  return u.toString().replace(/\/$/, '');
}

export interface RegisterRow {
  id: string;
  company: string;
  country: string | null;
  city: string | null;
  source: string;
  plotId: string | null;
  plotUrl: string | null;
  mapUrl: string | null;
  website: string | null;
  wikidataUrl: string | null;
  logoUrl: string | null;
  logoSource: string | null;
  logoSourceUrl: string | null;
  logoHidden: boolean;
  status: RegisterStatus;
  createdAt: string;
  lastClaimActivity: string | null;
  contactUrl: string | null;
  outreachStatus: string;
  outreachNotes: string | null;
  contactedAt: string | null;
}

/** Every showcase plot gets its register row (curated ones have none until now). */
export async function ensureRegisterRows() {
  const missing = await db
    .select()
    .from(schema.plots)
    .where(and(eq(schema.plots.kind, 'showcase'), sql`not exists (select 1 from company_sources c where c.plot_id = ${schema.plots.id})`))
    .limit(5000);
  for (const p of missing) if (p.showcase) await sourceRowFor(p);
  return missing.length;
}

export interface RegisterFilter {
  country?: string;
  status?: RegisterStatus;
  from?: Date;
  to?: Date;
  q?: string;
  outreach?: string;
}

export async function registerRows(f: RegisterFilter = {}): Promise<RegisterRow[]> {
  await ensureRegisterRows();
  const C = schema.companySources;
  const where: SQL[] = [eq(C.status, 'created')];
  if (f.country) where.push(sql`coalesce(${C.countryCode}, ${C.queriedCountry}) = ${f.country.toUpperCase()}`);
  if (f.from) where.push(gte(C.createdAt, f.from));
  if (f.to) where.push(lt(C.createdAt, f.to));
  if (f.q) where.push(ilike(C.name, `%${f.q.replace(/[%_\\]/g, '')}%`));
  if (f.outreach) where.push(eq(C.outreachStatus, f.outreach));
  const rows = await db
    .select({ c: C, p: schema.plots })
    .from(C)
    .leftJoin(schema.plots, eq(schema.plots.id, C.plotId))
    .where(and(...where))
    .orderBy(desc(C.createdAt))
    .limit(20000);
  const plotIds = rows.map((r) => r.p?.id).filter((x): x is string => !!x);
  const claims = plotIds.length
    ? await db
        .select({ plotId: schema.claimRequests.plotId, open: sql<number>`count(*) filter (where ${schema.claimRequests.status} not in ('rejected','completed'))::int`, done: sql<number>`count(*) filter (where ${schema.claimRequests.status} = 'completed')::int`, last: sql<string>`max(${schema.claimRequests.updatedAt})` })
        .from(schema.claimRequests)
        .where(inArray(schema.claimRequests.plotId, plotIds))
        .groupBy(schema.claimRequests.plotId)
    : [];
  const takedowns = plotIds.length
    ? await db
        .select({ plotId: schema.takedownRequests.plotId, open: sql<number>`count(*) filter (where ${schema.takedownRequests.status} = 'open')::int`, removed: sql<number>`count(*) filter (where ${schema.takedownRequests.status} = 'removed')::int` })
        .from(schema.takedownRequests)
        .where(inArray(schema.takedownRequests.plotId, plotIds))
        .groupBy(schema.takedownRequests.plotId)
    : [];
  const cm = new Map(claims.map((c) => [c.plotId, c]));
  const tm = new Map(takedowns.map((t) => [t.plotId, t]));
  const site = siteUrl();
  const out = rows.map(({ c, p }) => {
    const cl = p ? cm.get(p.id) : undefined;
    const td = p ? tm.get(p.id) : undefined;
    const sc = p?.showcase;
    const isPublic = !!p && p.status === 'showcase' && !!sc?.approved && (!showcaseLocationCheck() || !!sc?.locationVerified);
    let status: RegisterStatus;
    if (!p || td?.removed || (p.status === 'hidden' && p.kind === 'showcase' && td)) status = 'removed';
    else if (p.kind === 'landmark' || (cl?.done ?? 0) > 0) status = 'claimed';
    else if ((td?.open ?? 0) > 0) status = 'removal_requested';
    else if ((cl?.open ?? 0) > 0) status = 'claim_started';
    else status = isPublic ? 'reserved' : 'hidden';
    const qid = c.source === 'wikidata' ? c.sourceId : (sc?.wikidataId ?? null);
    return {
      id: c.id,
      company: c.name,
      country: c.countryCode ?? c.queriedCountry,
      city: sc?.city ?? c.hqName,
      source: c.source,
      plotId: p?.id ?? null,
      plotUrl: p ? `${site}/p/${p.slug}` : null,
      mapUrl: p ? `${site}/?visit=${encodeURIComponent(p.slug)}` : null,
      website: c.website,
      wikidataUrl: qid ? `https://www.wikidata.org/wiki/${qid}` : null,
      logoUrl: c.logoUrl,
      logoSource: c.logoSource,
      logoSourceUrl: c.logoSourceUrl,
      logoHidden: !!p && !!sc && !visibleLogo(p) && !!c.logoUrl,
      status,
      createdAt: (p?.createdAt ?? c.createdAt).toISOString(),
      lastClaimActivity: cl?.last ? new Date(cl.last).toISOString() : null,
      contactUrl: c.contactUrl,
      outreachStatus: c.outreachStatus,
      outreachNotes: c.outreachNotes,
      contactedAt: c.contactedAt?.toISOString() ?? null,
    } satisfies RegisterRow;
  });
  return f.status ? out.filter((r) => r.status === f.status) : out;
}

const COLUMNS: [keyof RegisterRow, string][] = [
  ['company', 'Company'],
  ['country', 'Country'],
  ['city', 'HQ city'],
  ['status', 'Status'],
  ['plotUrl', 'Plot'],
  ['mapUrl', 'Map'],
  ['website', 'Official website'],
  ['wikidataUrl', 'Wikidata'],
  ['logoSource', 'Logo source'],
  ['logoSourceUrl', 'Logo source URL'],
  ['contactUrl', 'Public contact page'],
  ['outreachStatus', 'Outreach status'],
  ['contactedAt', 'Contacted at'],
  ['outreachNotes', 'Outreach notes'],
  ['createdAt', 'Created'],
  ['lastClaimActivity', 'Last claim activity'],
  ['source', 'Source'],
];

/** CSV (RFC 4180), with formula-injection protection for spreadsheet apps. */
export function registerCsv(rows: RegisterRow[]): string {
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [COLUMNS.map(([, h]) => cell(h)).join(','), ...rows.map((r) => COLUMNS.map(([k]) => cell(r[k])).join(','))].join('\r\n') + '\r\n';
}

// ── Public contact or press page, on the official domain only ──

export const CONTACT_PATHS = ['/contact', '/contact-us', '/press', '/media'];

/** The first of /contact, /contact-us, /press, /media that answers 200 with a page, on the official domain. */
export async function findContactPage(website: string): Promise<string | null> {
  let home: URL;
  try {
    home = new URL(website);
  } catch {
    return null;
  }
  const allow = onDomain(registrableDomain(home.hostname));
  for (const path of CONTACT_PATHS) {
    try {
      const r = await safeFetch(new URL(path, home).toString(), { allow, maxBytes: 600_000, timeoutMs: 8000, accept: 'text/html' });
      if (r.status === 200 && r.contentType.includes('text/html')) return r.url;
    } catch {
      /* refused, too big, off-domain redirect or timeout: try the next path */
    }
  }
  return null;
}

/** Looks up contact pages for rows not checked yet (daily job and the admin button). */
export async function findContactPages(limit = 40) {
  const C = schema.companySources;
  const rows = await db.select().from(C).where(and(eq(C.status, 'created'), isNull(C.contactCheckedAt))).limit(limit);
  let found = 0;
  for (const r of rows) {
    const url = r.website ? await findContactPage(r.website) : null;
    if (url) found++;
    await db.update(C).set({ contactUrl: url ?? r.contactUrl, contactCheckedAt: new Date() }).where(eq(C.id, r.id));
  }
  return { checked: rows.length, found };
}

// ── Daily admin digest ──

export async function companyDigest(now = new Date()) {
  const end = new Date(now);
  end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end.getTime() - 86400_000);
  const site = siteUrl();
  const added = await db
    .select({ name: sql<string>`${schema.plots.showcase}->>'brand'`, cc: schema.plots.countryCode, slug: schema.plots.slug })
    .from(schema.plots)
    .where(and(eq(schema.plots.kind, 'showcase'), gte(schema.plots.createdAt, start), lt(schema.plots.createdAt, end)))
    .orderBy(schema.plots.countryCode);
  const claims = await db
    .select({ org: schema.claimRequests.orgName, status: schema.claimRequests.status, slug: schema.plots.slug })
    .from(schema.claimRequests)
    .innerJoin(schema.plots, eq(schema.plots.id, schema.claimRequests.plotId))
    .where(and(gte(schema.claimRequests.updatedAt, start), lt(schema.claimRequests.updatedAt, end)));
  const removals = await db
    .select({ org: schema.takedownRequests.organisation, slug: schema.plots.slug, title: schema.plots.title })
    .from(schema.takedownRequests)
    .innerJoin(schema.plots, eq(schema.plots.id, schema.takedownRequests.plotId))
    .where(and(gte(schema.takedownRequests.createdAt, start), lt(schema.takedownRequests.createdAt, end)));
  const lines = {
    added: added.map((a) => `${a.name} (${a.cc ?? '?'}): ${site}/p/${a.slug}`),
    claims: claims.map((c) => `${c.org} (${c.status}): ${site}/p/${c.slug}`),
    removals: removals.map((r) => `${r.title}${r.org ? ` (${r.org})` : ''}: ${site}/p/${r.slug}`),
  };
  if (!lines.added.length && !lines.claims.length && !lines.removals.length) return { sent: 0, ...counts(lines) };
  const sent = await emailAdmins(templates.adminCompanyDigest(start.toISOString().slice(0, 10), lines));
  return { sent, ...counts(lines) };
}
const counts = (l: { added: string[]; claims: string[]; removals: string[] }) => ({ added: l.added.length, claims: l.claims.length, removals: l.removals.length });

