// Lighthouse mobile budget (M2): LCP < 2.5 s, TBT < 300 ms and CLS < 0.1 on the home page and a plot page.
//   node scripts/lighthouse-budget.mjs http://localhost:8080 [--out dir]
// Needs Chrome (CHROME_PATH) and the lighthouse CLI (npx downloads it in CI). Mobile preset with applied ("devtools")
// throttling: the slow-4G network and the 4x slower CPU are really applied, rather than estimated from a fast run,
// which on a local server swung LCP by +/-0.5 s between identical runs. Each page runs 3 times; the median counts.
//
// CI machines have no GPU, so Chrome draws WebGL in software: compiling MapLibre's shaders alone costs seconds of
// main thread there, which no phone spends. The budget therefore runs with WebGL switched off: it measures all of the
// app's own work (HTML, hydration, data, the map page's controls) and the no-WebGL fallback; the map's drawing is
// covered by test/e2e/home-start.spec.ts ("the idle map stops redrawing"). Both numbers go in the report.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const base = (process.argv[2] ?? 'http://localhost:8080').replace(/\/$/, '');
const outIdx = process.argv.indexOf('--out');
const out = outIdx > 0 ? process.argv[outIdx + 1] : 'lighthouse-results';
mkdirSync(out, { recursive: true });
const BUDGET = { lcp: 2500, tbt: 300, cls: 0.1 };
const pages = (process.env.LH_PAGES ?? '/,/p/tesla').split(',');
const flags = ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-webgl', '--disable-3d-apis'];
const RUNS = Number(process.env.LH_RUNS ?? 3);
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
let failed = 0;
for (const p of pages) {
  const runs = [];
  for (let r = 1; r <= RUNS; r++) {
    const file = path.join(out, `${p === '/' ? 'home' : p.replace(/\W+/g, '-').replace(/^-|-$/g, '')}-${r}.json`);
    const args = [...(process.env.LIGHTHOUSE_BIN ? [] : ['-y', 'lighthouse@12.8.2']), base + p, '--quiet', '--only-categories=performance', '--throttling-method=devtools', `--chrome-flags=${flags.join(' ')}`, '--output=json', `--output-path=${file}`];
    // Lighthouse itself sometimes fails to record a trace (NO_NAVSTART) on a busy machine: one more try for that run.
    // A page that answers an error status fails both tries, so a real problem still fails the budget.
    for (let attempt = 1; ; attempt++) {
      try {
        execFileSync(process.env.LIGHTHOUSE_BIN ?? 'npx', args, { stdio: 'inherit' });
        break;
      } catch (err) {
        if (attempt >= 2) throw err;
        console.log(`  Lighthouse run ${r} of ${p} failed; trying it once more`);
      }
    }
    runs.push(JSON.parse(readFileSync(file, 'utf8')).audits);
  }
  const lcp = Math.round(median(runs.map((a) => a['largest-contentful-paint'].numericValue)));
  const tbt = Math.round(median(runs.map((a) => a['total-blocking-time'].numericValue)));
  const cls = Math.round(median(runs.map((a) => a['cumulative-layout-shift'].numericValue)) * 1000) / 1000;
  const a = runs[0];
  const ok = lcp < BUDGET.lcp && tbt < BUDGET.tbt && cls < BUDGET.cls;
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${p} (median of ${RUNS}): LCP ${lcp} ms (< ${BUDGET.lcp}), TBT ${tbt} ms (< ${BUDGET.tbt}), CLS ${cls} (< ${BUDGET.cls}), FCP ${Math.round(a['first-contentful-paint'].numericValue)} ms`);
}
process.exitCode = failed ? 1 : 0;
