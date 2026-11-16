import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * GL1: switching domain is a .env change. Source code may name the production domain only as a config default
 * (and in comments); every link, address and piece of copy reads it from config (APP_URL, PRODUCTION_DOMAIN, MAIL_FROM,
 * CONTACT_EMAIL, SITE_HOST).
 */
const ROOT = path.resolve(__dirname, '../../../..');
const DIRS = ['apps/web/src', 'apps/api/src', 'packages/shared/src'];
/** Files that hold the config defaults (one place per app). */
const DEFAULTS = new Set(['apps/web/src/lib/config.ts', 'apps/web/src/lib/canonical.ts', 'apps/api/src/config.ts']);
const DOMAINS = /\b(flatmeta\.io|mewebe\.net)\b/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx|mjs|js)$/.test(n) ? [p] : [];
  });
}
const isComment = (line: string) => /^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line);

describe('no hard-coded domain (GL1)', () => {
  it('only the config defaults name the production domain', () => {
    const hits: string[] = [];
    for (const d of DIRS) {
      for (const f of files(path.join(ROOT, d))) {
        const rel = path.relative(ROOT, f);
        if (DEFAULTS.has(rel)) continue;
        readFileSync(f, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            if (DOMAINS.test(line) && !isComment(line)) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
          });
      }
    }
    expect(hits).toEqual([]);
  });
});
