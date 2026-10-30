/**
 * Showcase generator CLI.
 *   npm run showcase -- --countries GB,US --approve
 *   npm run showcase -- --countries all --images openai --regenerate-images
 *   npm run showcase -- --countries IT --source ai --count 12        (needs a text AI key)
 *   npm run showcase -- --countries GB --source ai --names "Arsenal FC,Tate Modern"
 */
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { db, pool, schema } from '../db/client.js';
import { closeRedis } from '../lib/redis.js';
import { curatedCountries, generateShowcase } from './generator.js';

const { values } = parseArgs({
  options: {
    countries: { type: 'string', default: 'all' },
    source: { type: 'string', default: 'curated' },
    count: { type: 'string' },
    names: { type: 'string' },
    images: { type: 'string' },
    approve: { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    'regenerate-images': { type: 'boolean', default: false },
  },
});

const countries = values.countries === 'all' ? await curatedCountries() : values.countries!.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
const source = values.source === 'ai' ? 'ai' : 'curated';
const batchId = randomUUID();
const images = values.images as 'procedural' | 'openai' | 'gemini' | 'external' | undefined;

await db.insert(schema.showcaseBatches).values({ id: batchId, countries, status: 'running', params: { ...values, source } });
console.log(`Showcase batch ${batchId}: ${countries.join(', ')} (source: ${source}, images: ${images ?? 'default'})`);
const t = Date.now();
const stats = await generateShowcase({
  countries,
  source,
  count: values.count ? Number(values.count) : undefined,
  names: values.names?.split(',').map((n) => n.trim()).filter(Boolean),
  images,
  approve: values.approve,
  force: values.force,
  regenerateImages: values['regenerate-images'],
  batchId,
  onProgress: (m) => console.log(m),
});
const { eq } = await import('drizzle-orm');
await db.update(schema.showcaseBatches).set({ status: 'done', stats: { ...stats, plots: stats.plots.length }, finishedAt: new Date() }).where(eq(schema.showcaseBatches.id, batchId));
console.log(`\nDone in ${((Date.now() - t) / 1000).toFixed(1)}s: ${stats.created} created, ${stats.updated} updated, ${stats.skipped} skipped, ${stats.failed} failed.`);
for (const e of stats.errors) console.log(`  ! ${e}`);
await pool.end();
await closeRedis();
