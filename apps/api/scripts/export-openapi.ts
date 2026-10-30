/** Writes the OpenAPI document to openapi.json (for SDK generation and docs hosting). */
import { writeFileSync } from 'node:fs';
import { buildApp } from '../src/app.js';
import { pool } from '../src/db/client.js';
import { closeRedis } from '../src/lib/redis.js';

const app = await buildApp();
await app.ready();
writeFileSync('openapi.json', JSON.stringify(app.swagger(), null, 2));
console.log('Wrote openapi.json');
await app.close();
await pool.end();
await closeRedis();
