// `pm2 reload` keeps a running app's original script, args and cwd: changes in ecosystem.config.cjs
// (e.g. `next start -H 127.0.0.1`) would never reach it. This removes any FlatMeta app whose start
// command differs from the ecosystem, so the following `pm2 startOrReload` starts it fresh.
// Other apps on the server are never touched. Prints the names it removed.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const { apps } = require(path.join(__dirname, '..', 'ecosystem.config.cjs'));
const running = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8' }) || '[]');
const asArgs = (a) => (Array.isArray(a) ? a.join(' ') : String(a ?? '')).trim();

for (const want of apps) {
  const have = running.find((p) => p.name === want.name);
  if (!have) continue;
  const env = have.pm2_env ?? {};
  const differs =
    path.resolve(want.cwd ?? '.', want.script) !== path.resolve(env.pm_cwd ?? '.', env.pm_exec_path ?? '') ||
    asArgs(want.args) !== asArgs(env.args) ||
    path.resolve(want.cwd ?? '.') !== path.resolve(env.pm_cwd ?? '.');
  if (differs) {
    execFileSync('pm2', ['delete', want.name], { stdio: 'ignore' });
    console.log(`restarting ${want.name} (start command changed)`);
  }
}
