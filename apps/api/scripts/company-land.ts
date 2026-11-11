/**
 * Reserved company land from Wikidata (G12). The worker runs this daily; use the CLI to try a country first.
 *
 *   npm run company-land -- --country CA            # dry run: which companies would get land, and why others not
 *   npm run company-land -- --country CA --take 5 --apply
 *   npm run company-land -- --daily                  # the daily plan now (first countries, then N per day)
 */
import { pool } from '../src/db/client.js';
import { closeRedis } from '../src/lib/redis.js';
import { processCountry, runCompanyLand } from '../src/companies/land.js';

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
try {
  if (args.includes('--daily')) {
    console.log(JSON.stringify(await runCompanyLand({ force: true }), null, 2));
  } else {
    const country = arg('--country')?.toUpperCase();
    if (!country) throw new Error('Pass --country XX (or --daily)');
    const r = await processCountry(country, Number(arg('--take') ?? 10), { dryRun: !args.includes('--apply') });
    console.log(`${args.includes('--apply') ? 'CREATED' : 'Would create'} ${r.created.length} in ${country} (${r.fetched} companies from Wikidata):`);
    for (const n of r.created) console.log(`  + ${n}`);
    for (const s of r.skipped.slice(0, 40)) console.log(`  - ${s.name}: ${s.reason}`);
    if (args.includes('--apply')) console.log(`${r.verified} passed the automatic location check and are visible.`);
  }
} finally {
  await pool.end();
  await closeRedis();
}
