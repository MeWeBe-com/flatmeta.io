import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from '../app.js';
import { db, schema } from '../db/client.js';
import { decorateActivity, onlineCount, registerHub } from '../realtime/hub.js';

export default async function liveRoutes(app: App) {
  // The WebSocket (presence, avatars, chat, live activity) lives in the realtime hub.
  registerHub(app);

  app.get('/v1/world/stats', { schema: { tags: ['world'], summary: 'Live world numbers' } }, async () => {
    const P = schema.plots;
    const [[plots], [users], [countries]] = await Promise.all([
      db
        .select({
          active: sql<number>`count(*) filter (where ${P.status} = 'active')::int`,
          showcase: sql<number>`count(*) filter (where ${P.status} = 'showcase' and coalesce((${P.showcase}->>'approved')::boolean,false))::int`,
          cells: sql<number>`coalesce(sum(${P.cellCount}) filter (where ${P.status} = 'active'), 0)::int`,
        })
        .from(P),
      db.select({ n: sql<number>`count(*)::int` }).from(schema.users),
      db.select({ n: sql<number>`count(*) filter (where ${schema.countries.plotCount} > 0 or ${schema.countries.showcaseCount} > 0)::int` }).from(schema.countries),
    ]);
    return { online: await onlineCount(), plots: plots?.active ?? 0, showcase: plots?.showcase ?? 0, cells: plots?.cells ?? 0, explorers: users?.n ?? 0, countries: countries?.n ?? 0 };
  });

  app.get(
    '/v1/world/activity',
    { schema: { tags: ['world'], summary: 'Recent public activity', querystring: z.object({ limit: z.coerce.number().int().min(1).max(50).default(20), country: z.string().length(2).optional() }) } },
    async (req) => {
      const rows = await db
        .select()
        .from(schema.activity)
        .where(req.query.country ? eq(schema.activity.countryCode, req.query.country.toUpperCase()) : undefined)
        .orderBy(desc(schema.activity.createdAt))
        .limit(req.query.limit);
      return { activity: await decorateActivity(rows) };
    },
  );
}
