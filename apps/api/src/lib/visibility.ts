import { sql, type SQL } from 'drizzle-orm';
import { showcaseLocationCheck } from '../config.js';
import { schema } from '../db/client.js';

/**
 * A showcase plot is public once an admin approved it and, in production, once its location was checked
 * (SHOWCASE_REQUIRE_LOCATION_CHECK). One definition for the map, lists, search, counts and sitemaps.
 */
export const publicShowcase = (): SQL =>
  showcaseLocationCheck()
    ? sql`(${schema.plots.status} = 'showcase' and coalesce((${schema.plots.showcase}->>'approved')::boolean, false) and coalesce((${schema.plots.showcase}->>'locationVerified')::boolean, false))`
    : sql`(${schema.plots.status} = 'showcase' and coalesce((${schema.plots.showcase}->>'approved')::boolean, false))`;

/** The same rule as raw SQL for statements that don't go through the query builder (unqualified columns). */
export const publicShowcaseRaw = (): SQL =>
  showcaseLocationCheck()
    ? sql.raw(`(status = 'showcase' and coalesce((showcase->>'approved')::boolean, false) and coalesce((showcase->>'locationVerified')::boolean, false))`)
    : sql.raw(`(status = 'showcase' and coalesce((showcase->>'approved')::boolean, false))`);
