/**
 * Imports images produced by an external pipeline (e.g. Google Flow / Imagen in a browser).
 * Prompts are queued to EXTERNAL_IMAGE_DIR/outbox/prompts.jsonl with an id.
 * Drop the finished image as EXTERNAL_IMAGE_DIR/inbox/<id>.png|jpg|webp and run this
 * (or let the worker run it hourly). Imported files move to inbox/processed/.
 */
import { mkdir, readdir, readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import { db, schema } from '../db/client.js';
import { storeImage } from '../lib/storage.js';

export async function importExternalImages(log: (m: string) => void = console.log): Promise<number> {
  const inbox = path.resolve(config.EXTERNAL_IMAGE_DIR, 'inbox');
  const done = path.join(inbox, 'processed');
  await mkdir(done, { recursive: true });
  const files = (await readdir(inbox)).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
  let imported = 0;
  for (const file of files) {
    const id = file.replace(/\.[^.]+$/, '');
    // Showcase ids look like "showcase-<slug>[-suffix]"; design ids like "<jobId>-<n>"; plain ids are plot ids.
    const showcaseSlug = id.startsWith('showcase-') ? id.slice('showcase-'.length).replace(/-[a-z0-9]{6,9}$/, '') : null;
    let plot = null;
    if (showcaseSlug) [plot] = await db.select().from(schema.plots).where(eq(schema.plots.slug, showcaseSlug));
    else if (/^[0-9a-f-]{36}$/i.test(id)) [plot] = await db.select().from(schema.plots).where(eq(schema.plots.id, id));
    if (!plot) {
      log(`skip ${file}: no matching plot`);
      continue;
    }
    const img = await storeImage(await readFile(path.join(inbox, file)), { source: 'external', folder: 'showcase' });
    await db.update(schema.plots).set({ coverImageUrl: img.url, thumbUrl: img.thumbUrl, updatedAt: new Date() }).where(eq(schema.plots.id, plot.id));
    await rename(path.join(inbox, file), path.join(done, file));
    log(`imported ${file} → ${plot.slug}`);
    imported++;
  }
  return imported;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const n = await importExternalImages();
  console.log(`${n} image(s) imported`);
  const { pool } = await import('../db/client.js');
  const { closeRedis } = await import('../lib/redis.js');
  await pool.end();
  await closeRedis();
}
