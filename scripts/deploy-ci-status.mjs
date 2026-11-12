// Did CI pass for a commit? Asks GitHub for the commit's check runs and commit statuses and prints one line:
//   success | pending <why> | failed <why>
//   node scripts/deploy-ci-status.mjs <owner/repo> <sha>
// Public repo: no token needed (60 requests/hour per IP). Private repo: GITHUB_READ_TOKEN (fine-grained, read-only
// "Commit statuses" + "Checks" on this one repository). The token is only sent to the GitHub API and never printed.
// Checks whose name matches DEPLOY_CI_IGNORE (default: our own deploy and smoke jobs, which run after the deploy)
// are not waited for. Always exits 0 unless the arguments are wrong (exit 2).
import { pathToFileURL } from 'node:url';

export function classify(checkRuns, statuses, ignore = /^(deploy|smoke)/i) {
  const runs = checkRuns.filter((r) => !ignore.test(r.name ?? ''));
  const sts = statuses.filter((s) => !ignore.test(s.context ?? ''));
  if (runs.length + sts.length === 0) return 'pending no CI results yet';
  const running = runs.filter((r) => r.status !== 'completed').map((r) => r.name);
  const bad = runs.filter((r) => r.status === 'completed' && !['success', 'skipped', 'neutral'].includes(r.conclusion)).map((r) => `${r.name}: ${r.conclusion}`);
  for (const s of sts) {
    if (s.state === 'failure' || s.state === 'error') bad.push(`${s.context}: ${s.state}`);
    else if (s.state === 'pending') running.push(s.context);
  }
  if (bad.length) return `failed ${bad.join(', ')}`;
  if (running.length) return `pending ${running.join(', ')}`;
  return 'success';
}

async function main() {
  const [repo, sha] = process.argv.slice(2);
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? '') || !/^[0-9a-f]{40}$/.test(sha ?? '')) {
    console.error('usage: node scripts/deploy-ci-status.mjs <owner/repo> <40-hex sha>');
    process.exit(2);
  }
  const api = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/, '');
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'flatmeta-auto-deploy', 'x-github-api-version': '2022-11-28' };
  if (process.env.GITHUB_READ_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_READ_TOKEN}`;
  const get = async (path) => {
    const res = await fetch(`${api}/repos/${repo}/commits/${sha}/${path}`, { headers, signal: AbortSignal.timeout(15_000) });
    if (res.status === 403 || res.status === 429) throw new Error(`GitHub API rate limit (${res.status})`);
    if (res.status === 404) throw new Error('GitHub API 404 (private repo without GITHUB_READ_TOKEN, or an unknown commit)');
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    return res.json();
  };
  try {
    const ignore = new RegExp(process.env.DEPLOY_CI_IGNORE || '^(deploy|smoke)', 'i');
    const runs = await get('check-runs?per_page=100');
    const status = await get('status');
    console.log(classify(runs.check_runs ?? [], status.statuses ?? [], ignore));
  } catch (err) {
    console.log(`pending ${err.name === 'TimeoutError' ? 'GitHub API timed out' : err.message}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
