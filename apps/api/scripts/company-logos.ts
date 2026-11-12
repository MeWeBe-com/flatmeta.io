/**
 * H1: small official logos for company plots: the curated showcase and company land. Dry run by default (finds and
 * checks the logos, stores nothing). Wikidata P154 through Commons first, else the official website's icons.
 *
 *   npm run company-land:logos                     # dry run, every company plot
 *   npm run company-land:logos -- --country GB     # one country
 *   npm run company-land:logos -- --apply          # store them
 *   npm run company-land:logos -- --apply --refresh  # fetch again even where a logo exists
 */
import { pool } from '../src/db/client.js';
import { closeRedis } from '../src/lib/redis.js';
import { backfillLogos } from '../src/companies/logos.js';

const args = process.argv.slice(2);
const i = args.indexOf('--country');
const country = i >= 0 ? args[i + 1]?.toUpperCase() : undefined;
const apply = args.includes('--apply');
try {
  const r = await backfillLogos({ apply, country, refresh: args.includes('--refresh'), onProgress: args.includes('--quiet') ? undefined : (m) => console.log(m) });
  console.log(`\n${apply ? 'STORED' : 'Dry run'}: ${r.checked} company plots checked${r.skipped ? `, ${r.skipped} skipped (logo already set or hidden)` : ''}.`);
  console.log(`  from Wikidata/Commons: ${r.wikidata}`);
  console.log(`  from the official website: ${r.website}`);
  console.log(`  none found: ${r.none}`);
  if (!apply) console.log('\nNothing stored. Re-run with --apply.');
} finally {
  await pool.end();
  await closeRedis();
}
