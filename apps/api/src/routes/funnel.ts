import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from '../app.js';
import { db } from '../db/client.js';
import { requireStaff } from '../lib/auth.js';
import { FUNNEL_EVENTS, countFunnelEvent, funnelEventTotal, isBot, visitorHash } from '../lib/visitors.js';

/**
 * R3f: the funnel, privacy-friendly. Browsers send three events (a visit once per session, opening the demo, starting a
 * claim); each is counted as unique people per day from a salted hash that changes daily (no cookie, no IP or user
 * agent stored, nothing per page). Do Not Track and Global Privacy Control are honoured: those requests count nothing.
 * Sign-ups, first value and paid come from the database. GET /v1/admin/funnel puts them side by side.
 */
const rows = <T>(r: unknown) => ((r as { rows?: T[] }).rows ?? (r as T[]));

export default async function funnelRoutes(app: App) {
  app.post(
    '/v1/events',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { hide: true, body: z.object({ name: z.enum(FUNNEL_EVENTS) }) } },
    async (req, reply) => {
      const optedOut = req.headers.dnt === '1' || req.headers['sec-gpc'] === '1';
      if (!optedOut && !isBot(req.headers['user-agent'] as string | undefined)) await countFunnelEvent(req.body.name, await visitorHash(req)).catch(() => undefined);
      return reply.code(204).send();
    },
  );

  app.get(
    '/v1/admin/funnel',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { tags: ['admin'], summary: 'Funnel: visit > sign-up > first value > paid', querystring: z.object({ days: z.coerce.number().int().min(1).max(90).default(30) }) } },
    async (req) => {
      requireStaff(req);
      const days = req.query.days;
      const since = new Date(Date.now() - (days - 1) * 86400_000);
      since.setUTCHours(0, 0, 0, 0);
      const dayList = Array.from({ length: days }, (_, i) => new Date(since.getTime() + i * 86400_000).toISOString().slice(0, 10));
      const [visits, demo, claimStart, counts] = await Promise.all([
        funnelEventTotal('visit', dayList),
        funnelEventTotal('demo_view', dayList),
        funnelEventTotal('claim_start', dayList),
        db.execute(sql`select
          (select count(*)::int from users where created_at >= ${since}) as signups,
          -- First value: the first land someone claimed, or a company page they verified, in the period.
          (select count(*)::int from (
             select who, min(at) as first_at from (
               select owner_user_id::text as who, created_at as at from plots
                 where owner_user_id is not null and kind in ('standard', 'homestead', 'landmark') and status in ('active', 'pending_payment')
               union all select user_id::text, updated_at from claim_requests where status = 'completed' and user_id is not null
             ) v group by 1) f where first_at >= ${since}) as first_value,
          (select count(*)::int from (
             select coalesce(user_id::text, org_id::text) as who, min(at) as first_at from (
               select user_id, org_id, paid_at as at from orders where status = 'paid' and paid_at is not null
               union all select user_id, org_id, created_at from subscriptions
             ) x group by 1) p where first_at >= ${since}) as paid`),
      ]);
      const c = rows<{ signups: number; first_value: number; paid: number }>(counts)[0] ?? { signups: 0, first_value: 0, paid: 0 };
      const steps = [
        { key: 'visit', label: 'Visitors', n: visits.total, source: 'unique people per day, cookie-free' },
        { key: 'signup', label: 'Sign-ups', n: c.signups, source: 'new accounts' },
        { key: 'first_value', label: 'First value', n: c.first_value, source: 'first land claimed or company page verified' },
        { key: 'paid', label: 'Paid', n: c.paid, source: 'first payment or subscription' },
      ].map((s, i, all) => ({ ...s, rate: i === 0 || !all[i - 1]!.n ? null : Math.round((s.n / all[i - 1]!.n) * 1000) / 10 }));
      return {
        days,
        since: since.toISOString(),
        steps,
        side: { demoViews: demo.total, claimStarts: claimStart.total },
        series: dayList.map((d) => ({ day: d, visits: visits.byDay[d] ?? 0, demoViews: demo.byDay[d] ?? 0, claimStarts: claimStart.byDay[d] ?? 0 })),
        note: 'Visitors are counted per day (a person on two days counts twice); Do Not Track and Global Privacy Control requests are not counted. The other steps come from the database.',
      };
    },
  );
}
