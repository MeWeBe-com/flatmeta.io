import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Redis } from 'ioredis';

/** Fresh schema for every test run. */
export default async function setup() {
  const url = process.env.DATABASE_URL_TEST ?? 'postgres://flatmeta:flatmeta@localhost:5432/flatmeta_test';
  const pool = new pg.Pool({ connectionString: url });
  await pool.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;');
  await migrate(drizzle(pool), { migrationsFolder: './db/migrations' });
  await pool.query(`insert into pricing_tiers (tier, label, price_cents, description, sort) values
    ('S','Icon',2500,'',0),('A','Prime',900,'',1),('B','City',400,'',2),('C','Land',200,'',3),('O','Ocean',100,'',4)`);
  await pool.query(`insert into countries (code, name, lat, lng) values ('GB','United Kingdom',54,-2),('FR','France',46,2),('US','United States',39,-98)`);
  await pool.query(`insert into regions (slug, name, country_code, lat, lng, tier, population) values ('london','London','GB',51.5074,-0.1278,'S',14800000)`);
  await pool.end();
  const redis = new Redis(process.env.REDIS_URL_TEST ?? 'redis://localhost:6379/15');
  await redis.flushdb();
  await redis.quit();
}
