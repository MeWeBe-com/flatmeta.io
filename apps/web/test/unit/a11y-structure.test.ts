import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/** R3b: every page in the site chrome has the skip link's target (#main), found by Lighthouse on /brands. */
const APP = path.join(__dirname, '../../src/app');
const pages = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? pages(p) : /^page\.tsx$/.test(f) ? [p] : [];
  });

describe('R3b page structure', () => {
  it('every PageShell page has an element with id="main" for the skip link', () => {
    const missing = pages(APP).filter((p) => {
      const s = readFileSync(p, 'utf8');
      return s.includes('<PageShell') && !s.includes('id="main"');
    });
    expect(missing.map((p) => path.relative(APP, p))).toEqual([]);
  });
});
