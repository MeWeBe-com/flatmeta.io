import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { buildApp, type App } from '../src/app.js';
import { db, schema } from '../src/db/client.js';
import { hashToken, randomToken } from '../src/lib/crypto.js';
import { findOrCreateUser } from '../src/lib/users.js';

let app: App | null = null;
export async function getApp(): Promise<App> {
  if (!app) {
    app = await buildApp();
    await app.ready();
  }
  return app;
}

/** Creates (or reuses) a user and a session; returns the cookie header to send. */
export async function login(email = `u-${randomUUID().slice(0, 8)}@test.dev`, role = 'user') {
  const { user } = await findOrCreateUser(email);
  if (role !== 'user') await db.update(schema.users).set({ role }).where(eq(schema.users.id, user.id));
  const token = randomToken();
  await db.insert(schema.sessions).values({ userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 86400_000) });
  return { user, cookie: `fm_session=${token}`, headers: { cookie: `fm_session=${token}` } };
}

/** A random free rectangle in the mid-Atlantic (tier O), unique across test files. */
export function freeRect(w = 2, h = 2) {
  const minGx = 76000 + Math.floor(Math.random() * 800) * 10; // ≈ 49°W–36°W
  const minGy = 90000 + Math.floor(Math.random() * 800) * 10;
  return { minGx, minGy, maxGx: minGx + w - 1, maxGy: minGy + h - 1 };
}
