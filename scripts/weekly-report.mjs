// GL8: the weekly CEO report, written to docs/golive/weekly/<date>.md by .github/workflows/weekly-ceo-report.yml.
//   node scripts/weekly-report.mjs https://www.flatmeta.io [--out docs/golive/weekly]
// Sources, all read-only:
//   - the live site: /api/v1/health (release), /api/v1/world/stats, the sitemaps (URLs offered to search engines);
//   - FM_REPORT_API_KEY (optional, a moderator's API key named "FlatMeta-Reports"): /api/v1/admin/stats for sign-ups,
//     paid orders, revenue and queues. Without it those lines say "not available" (never guessed);
//   - git: commits on this branch in the last 7 days;
//   - GITHUB_TOKEN + GITHUB_REPOSITORY (in Actions): the latest daily QA and SEO runs.
// The report holds numbers only: no emails, names, keys or customer data.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const usd = (cents) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The markdown report from what was collected (pure, so it is unit-tested). */
export function renderReport(d) {
  const na = 'not available';
  const s = d.stats;
  const a = d.admin;
  const lines = [
    `# Weekly report · ${d.date}`,
    '',
    `Site: ${d.base} · live release \`${d.health?.release ?? na}\` · health ${d.health?.ok ? 'OK' : 'DOWN or unknown'}`,
    '',
    '## Numbers',
    '',
    '| Metric | Now |',
    '|---|---|',
    `| Plots (people) | ${s?.plots ?? na} |`,
    `| Company plots shown | ${s?.showcase ?? na} |`,
    `| Explorers (accounts) | ${s?.explorers ?? na} |`,
    `| Countries with plots | ${s?.countries ?? na} |`,
    `| URLs in the sitemaps | ${d.sitemapUrls ?? na} |`,
    `| New accounts, last 30 days | ${a ? a.users.new30 : na} |`,
    `| Published plots | ${a ? a.plots.published : na} |`,
    `| Paid orders, last 30 days | ${a ? a.revenue.orders30 : na} |`,
    `| Revenue, last 30 days | ${a ? usd(a.revenue.last30) : na} |`,
    `| Active subscriptions | ${a ? a.revenue.activeSubscriptions : na} |`,
    `| Open queues (moderation / claims / takedowns) | ${a ? `${a.queues.moderation} / ${a.queues.claims} / ${a.queues.takedowns}` : na} |`,
    '',
  ];
  if (a?.series?.signups?.length) lines.push(`Sign-ups by day (14 days): ${a.series.signups.map((x) => `${x.day.slice(5)} ${x.n}`).join(' · ')}`, '');
  lines.push('## Health of the week', '');
  if (d.runs?.length) for (const r of d.runs) lines.push(`- ${r.name}: last run ${r.conclusion ?? r.status} (${r.date}) ${r.url}`);
  else lines.push('- Daily QA and SEO runs: not available (no GitHub token)');
  lines.push('', `## Shipped (${d.commits.length} commits in 7 days)`, '');
  for (const c of d.commits.slice(0, 30)) lines.push(`- ${c}`);
  if (d.commits.length > 30) lines.push(`- … and ${d.commits.length - 30} more`);
  lines.push(
    '',
    '## For the CEO agent to fill in',
    '',
    '- **Verdict (one line):**',
    '- **Wins:**',
    '- **Risks and blockers (who owns each):**',
    '- **Next week’s 3 priorities:**',
    '- **Submissions made this week (site, date, URL, status):**',
    '',
    `_Generated ${new Date(d.generatedAt).toISOString()} by scripts/weekly-report.mjs. Numbers come from the live site and the admin API only._`,
    '',
  );
  return lines.join('\n');
}

const get = async (url, headers = {}) => {
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'FlatMeta-Report/1.0', ...headers }, signal: AbortSignal.timeout(20_000) });
    return r.ok ? r : null;
  } catch {
    return null;
  }
};

async function main() {
  const base = (process.argv[2] ?? '').replace(/\/$/, '');
  if (!/^https?:\/\//.test(base)) {
    console.error('Usage: node scripts/weekly-report.mjs <https://site> [--out dir]');
    process.exit(2);
  }
  const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'docs/golive/weekly';
  const date = new Date().toISOString().slice(0, 10);
  const health = await (await get(`${base}/api/v1/health`))?.json().catch(() => null);
  const stats = await (await get(`${base}/api/v1/world/stats`))?.json().catch(() => null);
  const key = process.env.FM_REPORT_API_KEY;
  const admin = key ? await (await get(`${base}/api/v1/admin/stats`, { authorization: `Bearer ${key}` }))?.json().catch(() => null) : null;
  let sitemapUrls = 0;
  const index = await (await get(`${base}/sitemap.xml`))?.text();
  for (const loc of [...(index ?? '').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'))) {
    sitemapUrls += ((await (await get(loc))?.text()) ?? '').split('<url>').length - 1;
  }
  let commits = [];
  try {
    commits = execFileSync('git', ['log', '--since=7 days ago', '--no-merges', '--pretty=%h %s'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  } catch {}
  const runs = [];
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_REPOSITORY) {
    for (const wf of ['daily-qa.yml', 'daily-seo.yml']) {
      const r = await get(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/actions/workflows/${wf}/runs?per_page=1`, { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json' });
      const run = (await r?.json().catch(() => null))?.workflow_runs?.[0];
      if (run) runs.push({ name: run.name, status: run.status, conclusion: run.conclusion, date: run.created_at.slice(0, 10), url: run.html_url });
    }
  }
  const md = renderReport({ base, date, health, stats, admin, sitemapUrls: index ? sitemapUrls : null, commits, runs, generatedAt: Date.now() });
  mkdirSync(out, { recursive: true });
  const file = path.join(out, `${date}.md`);
  writeFileSync(file, md);
  console.log(`wrote ${file}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
