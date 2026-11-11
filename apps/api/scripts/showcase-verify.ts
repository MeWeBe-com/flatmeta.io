/**
 * Verifies every showcase location that passed the automatic coordinate check (G3), so those plots can appear on
 * the public map. Dry run unless --apply. Plots with a failed check, or nothing to check against, are listed for a
 * person to review in Admin → Showcase locations.
 *
 *   npm run showcase:verify                 # dry run: counts, a sample and the plots left for review
 *   npm run showcase:verify -- --apply      # mark them verified
 *   npm run showcase:verify -- --apply --country GB
 */
import { pool } from '../src/db/client.js';
import { closeRedis } from '../src/lib/redis.js';
import { verifyPassedLocations } from '../src/services/showcase-locations.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const ci = args.indexOf('--country');
const country = ci >= 0 ? args[ci + 1]?.toUpperCase() : undefined;

try {
  const r = await verifyPassedLocations({ apply, by: 'cli', country });
  console.log(`${apply ? 'APPLIED' : 'Dry run'}: ${r.total} showcase plots, ${r.alreadyVerified} already verified, ${r.verified} ${apply ? 'verified now' : 'would be verified'}, ${r.leftForReview.length} left for review.`);
  if (r.sample.length) {
    console.log('\nSample of plots that pass (spot-check a few on the map):');
    for (const s of r.sample) console.log(`  ${s.countryCode} ${s.brand} · ${s.city ?? ''} · https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lng}#map=17/${s.lat}/${s.lng}`);
  }
  if (r.leftForReview.length) {
    console.log('\nLeft for review in Admin → Showcase locations:');
    for (const x of r.leftForReview.slice(0, 50)) console.log(`  ${x.countryCode} ${x.brand}: ${x.reason}`);
  }
  if (!apply) console.log('\nNothing changed. Re-run with --apply after a spot check.');
} finally {
  await pool.end();
  await closeRedis();
}
