import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, pool, schema } from '../src/db/client.js';
import { closeRedis } from '../src/lib/redis.js';
import { outbox } from '../src/lib/mail.js';
import { setHop, type Hop } from '../src/companies/safe-fetch.js';
import { companyDigest, findContactPage, registerCsv, type RegisterRow } from '../src/companies/register.js';
import type { App } from '../src/app.js';
import { freeRect, getApp, login } from './helpers.js';

let app: App;
beforeAll(async () => {
  app = await getApp();
});
afterAll(async () => {
  setHop(null);
  await app.close();
  await pool.end();
  await closeRedis();
});
const json = (res: { body: string }) => JSON.parse(res.body);

async function companyPlot(name: string, website: string) {
  const owner = await login();
  const plot = json(await app.inject({ method: 'POST', url: '/v1/plots/claim', headers: owner.headers, payload: { rect: freeRect() } })).plot;
  const slug = `${name.toLowerCase().replace(/\W+/g, '-')}-${Math.random().toString(36).slice(2, 6)}`;
  await db
    .update(schema.plots)
    .set({ kind: 'showcase', status: 'showcase', ownerUserId: null, slug, title: name, countryCode: 'GB', showcase: { brand: name, website, sector: 'Retail', kind: 'company', city: 'London', useCase: 'x', highlights: [], imagePrompt: 'x', palette: ['#000000', '#111111', '#222222'], motif: 'star', approved: true } })
    .where(eq(schema.plots.id, plot.id));
  return { id: plot.id as string, slug };
}
const register = async (headers: Record<string, string>, qs = '') => app.inject({ url: `/v1/admin/company-land${qs}`, headers });

describe('company land register (H2)', () => {
  it('is admins-only, lists every company plot with links and derives the status', async () => {
    const tag = `Regco${Math.random().toString(36).slice(2, 7)}`;
    const p = await companyPlot(`${tag} Ltd`, 'https://www.regco.example');
    const user = await login();
    const admin = await login(undefined, 'admin');
    expect((await register(user.headers)).statusCode).toBe(403);
    expect((await register({})).statusCode).toBe(401);
    const row = () => register(admin.headers, `?q=${tag}`).then((r) => json(r).rows[0] as RegisterRow);
    let r = await row();
    expect(r).toMatchObject({ company: `${tag} Ltd`, country: 'GB', city: 'London', status: 'reserved', website: 'https://www.regco.example', outreachStatus: 'not_contacted', source: 'curated' });
    expect(r.plotUrl).toMatch(new RegExp(`/p/${p.slug}$`));
    expect(r.mapUrl).toMatch(new RegExp(`/\\?visit=${p.slug}$`));
    // A claim starts → claim_started; a removal request → removal_requested; a completed claim → claimed.
    await db.insert(schema.claimRequests).values({ plotId: p.id, userId: user.user.id, email: 'jo@regco.example', orgName: tag, status: 'pending_email' });
    expect((r = await row()).status).toBe('claim_started');
    expect(r.lastClaimActivity).toBeTruthy();
    await app.inject({ method: 'POST', url: `/v1/showcase/${p.slug}/takedown`, payload: { name: 'Legal', email: 'legal@regco.example', message: 'Please remove it.' } });
    expect((await row()).status).toBe('removal_requested');
    await db.update(schema.plots).set({ kind: 'landmark', status: 'active' }).where(eq(schema.plots.id, p.id));
    expect((await row()).status).toBe('claimed');
    // Filters
    expect(json(await register(admin.headers, `?q=${tag}&status=reserved`)).rows).toHaveLength(0);
    expect(json(await register(admin.headers, `?q=${tag}&country=FR`)).rows).toHaveLength(0);
    const today = new Date().toISOString().slice(0, 10);
    expect(json(await register(admin.headers, `?q=${tag}&from=${today}&to=${today}`)).rows).toHaveLength(1);
    expect((await register(admin.headers, '?status=nope')).statusCode).toBe(400);
  });

  it('exports CSV (filtered), safe for spreadsheets', async () => {
    const tag = `Csvco${Math.random().toString(36).slice(2, 7)}`;
    await companyPlot(`${tag}`, 'https://csvco.example');
    const admin = await login(undefined, 'admin');
    const res = await register(admin.headers, `?q=${tag}&format=csv`);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="flatmeta-company-land-/);
    const lines = res.body.trim().split('\r\n');
    expect(lines[0]).toBe('Company,Country,HQ city,Status,Plot,Map,Official website,Wikidata,Logo source,Logo source URL,Public contact page,Outreach status,Contacted at,Outreach notes,Created,Last claim activity,Source');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(`${tag},GB,London,reserved,`);
    const csv = registerCsv([{ company: '=HYPERLINK("https://evil")', outreachNotes: 'said "yes", call back\nnext week' } as unknown as RegisterRow]);
    expect(csv).toContain(`"'=HYPERLINK(""https://evil"")"`);
    expect(csv).toContain('"said ""yes"", call back\nnext week"');
  });

  it('outreach fields: admin-only; the contact page must be on the official domain (no emails, no people)', async () => {
    const tag = `Outco${Math.random().toString(36).slice(2, 7)}`;
    await companyPlot(tag, 'https://www.outco.example');
    const admin = await login(undefined, 'admin');
    const user = await login();
    const r = json(await register(admin.headers, `?q=${tag}`)).rows[0] as RegisterRow;
    const patch = (headers: Record<string, string>, body: object) => app.inject({ method: 'PATCH', url: `/v1/admin/company-land/${r.id}`, headers, payload: body });
    expect((await patch(user.headers, { outreachStatus: 'contacted' })).statusCode).toBe(403);
    const ok = json(await patch(admin.headers, { outreachStatus: 'contacted', outreachNotes: 'Sent the press team the plot link.' }));
    expect(ok.outreachStatus).toBe('contacted');
    expect(ok.contactedAt).toBeTruthy();
    expect((await patch(admin.headers, { contactUrl: 'mailto:jane.doe@outco.example' })).statusCode).toBe(400);
    expect((await patch(admin.headers, { contactUrl: 'https://linkedin.com/in/jane-doe' })).statusCode).toBe(400);
    expect(json(await patch(admin.headers, { contactUrl: 'https://press.outco.example/contact' })).contactUrl).toBe('https://press.outco.example/contact');
    expect((await patch(admin.headers, { outreachStatus: 'bought-lunch' })).statusCode).toBe(400);
  });

  it('finds the public contact page only on the official domain, and only when it answers 200', async () => {
    const hop = (routes: Record<string, { status: number; location?: string; type?: string }>): Hop => async (url) => {
      const r = routes[url.toString()] ?? { status: 404 };
      return { status: r.status, location: r.location, contentType: r.type ?? 'text/html; charset=utf-8', body: Buffer.from('<html></html>') };
    };
    setHop(hop({ 'https://www.findco.example/contact': { status: 404 }, 'https://www.findco.example/contact-us': { status: 200 } }));
    expect(await findContactPage('https://www.findco.example')).toBe('https://www.findco.example/contact-us');
    // A redirect off the official domain is not followed, and a non-page answer is not stored.
    setHop(hop({ 'https://www.findco.example/contact': { status: 302, location: 'https://forms.thirdparty.example/findco' }, 'https://www.findco.example/press': { status: 200, type: 'application/pdf' } }));
    expect(await findContactPage('https://www.findco.example')).toBeNull();
    setHop(hop({ 'https://www.findco.example/media': { status: 301, location: 'https://news.findco.example/' }, 'https://news.findco.example/': { status: 200 } }));
    expect(await findContactPage('https://www.findco.example')).toBe('https://news.findco.example/');
    setHop(null);
  });

  it('daily digest: new company plots, claims and removal requests from yesterday, to admins', async () => {
    const tag = `Digco${Math.random().toString(36).slice(2, 7)}`;
    const p = await companyPlot(tag, 'https://digco.example');
    await app.inject({ method: 'POST', url: `/v1/showcase/${p.slug}/takedown`, payload: { name: 'Legal', email: 'legal@digco.example', message: 'Please remove it.' } });
    const before = outbox.length;
    const tomorrow = new Date(Date.now() + 86400_000);
    const res = await companyDigest(tomorrow);
    expect(res.added).toBeGreaterThanOrEqual(1);
    expect(res.removals).toBeGreaterThanOrEqual(1);
    const mail = outbox.slice(before).find((m) => m.type === 'admin_company_digest');
    expect(mail?.text).toContain(tag);
    expect(mail?.text).toContain(`/p/${p.slug}`);
  });
});
