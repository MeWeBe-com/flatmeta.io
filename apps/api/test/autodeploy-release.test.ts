import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * AD2: scripts/autodeploy (install.sh + autodeploy.sh), end to end against a local git origin. Builds, tests, reloads
 * and /readyz are stand-ins (AD_*_CMD and a local readyz server), everything else is the real script: the layout
 * conversion, the release folders, the switch, failed-shas, the switch back, rollback, pause, and the cron gate.
 */
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const GIT = ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'init.defaultBranch=v2', '-c', 'protocol.file.allow=always', '-c', 'safe.directory=*'];
const git = (cwd: string, ...args: string[]) => {
  // In a root container every git call runs as nobody too (git refuses repositories owned by another user).
  const r = process.getuid?.() === 0
    ? spawnSync('setpriv', ['--reuid=65534', '--regid=65534', '--clear-groups', 'git', ...GIT, ...args], { cwd, encoding: 'utf8', env: { ...process.env, HOME: cwd } })
    : spawnSync('git', [...GIT, ...args], { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};
const TOKEN = 'github_pat_SECRET_read_only_123456789';
const AS_ROOT = process.getuid?.() === 0;

let served = 'none';
let servedFile = '';
let server: Server;
let readyzPort = 0;
beforeAll(async () => {
  // The readyz stand-in reports whatever release the fake reload last "started" (the file it wrote).
  server = createServer((_req, res) => {
    if (servedFile && existsSync(servedFile)) served = readFileSync(servedFile, 'utf8').trim();
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true, release: served.slice(0, 12), sameRelease: true }));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  readyzPort = (server.address() as AddressInfo).port;
});
afterAll(() => server.close());

const exe = (file: string, body: string) => {
  writeFileSync(file, body);
  chmodSync(file, 0o755);
};

function setup(envName: 'staging' | 'production' = 'staging') {
  const home = mkdtempSync(path.join(tmpdir(), 'fm-ad-'));
  if (AS_ROOT) spawnSync('chown', ['65534:65534', home]);
  const base = path.join(home, 'web/site/private');
  const bin = path.join(home, 'bin');
  mkdirSync(bin, { recursive: true });
  mkdirSync(base, { recursive: true });
  // Origin: a bare repo with the scripts the release needs, plus stand-in build/test/reload scripts.
  const seed = path.join(home, 'seed');
  mkdirSync(path.join(seed, 'scripts/autodeploy'), { recursive: true });
  for (const f of ['autodeploy.sh', 'git-askpass.sh', 'install.sh']) writeFileSync(path.join(seed, 'scripts/autodeploy', f), readFileSync(path.join(REPO, 'scripts/autodeploy', f)));
  writeFileSync(path.join(seed, 'scripts/print-env.mjs'), readFileSync(path.join(REPO, 'scripts/print-env.mjs')));
  writeFileSync(path.join(seed, 'build.sh'), 'echo "$RELEASE_SHA" > BUILT\n');
  writeFileSync(path.join(seed, 'test.sh'), '[ ! -f FAIL_TESTS ]\n');
  writeFileSync(path.join(seed, '.gitignore'), '.env\nlogs\nBUILT\n.ad-built\n');
  if (AS_ROOT) spawnSync('chown', ['-R', '65534:65534', home]);
  git(seed, 'init', '-q');
  git(seed, 'add', '-A');
  git(seed, 'commit', '-qm', 'first');
  const origin = path.join(home, 'origin.git');
  git(home, 'clone', '-q', '--bare', seed, origin);
  // The old layout: a plain checkout at <base>/flatmeta with its .env inside.
  const app = path.join(base, 'flatmeta');
  git(home, 'clone', '-q', '-b', 'v2', origin, app);
  if (AS_ROOT) spawnSync('chown', ['-R', '65534:65534', home]);
  const media = path.join(base, 'uploads');
  mkdirSync(media);
  writeFileSync(
    path.join(app, '.env'),
    [`APP_ENV=${envName}`, `WEB_PORT=${readyzPort}`, `PORT=1`, `MEDIA_DIR=${media}`, `EXTERNAL_IMAGE_DIR=${path.join(base, 'external')}`, `DEPLOY_REPO_URL=${origin}`, `GITHUB_READ_TOKEN=${TOKEN}`, 'DEPLOY_SMOKE=off', ''].join('\n'),
  );
  exe(path.join(bin, 'pm2'), '#!/bin/sh\nexit 0\n');
  exe(path.join(bin, 'crontab'), `#!/bin/sh\nf="${home}/crontab.txt"\nif [ "$1" = "-l" ]; then [ -f "$f" ] && cat "$f" || exit 1; else cat > "$f"; fi\n`);
  // The fake reload "starts" the live release: what readlink(flatmeta) points at, unless that release has BREAK.
  exe(path.join(home, 'reload.sh'), `#!/bin/sh\nrel="$(basename "$(readlink "${app}")")"\n[ -f "${app}/BREAK" ] && echo broken > "${home}/served" || echo "$rel" > "${home}/served"\n`);
  const env = {
    PATH: `${bin}:${process.env.PATH}`,
    HOME: home,
    NVM_DIR: path.join(home, 'no-nvm'),
    GIT_CONFIG_COUNT: '2',
    GIT_CONFIG_KEY_0: 'protocol.file.allow',
    GIT_CONFIG_VALUE_0: 'always',
    GIT_CONFIG_KEY_1: 'safe.directory',
    GIT_CONFIG_VALUE_1: '*',
    AD_INSTALL_CMD: 'true',
    AD_BUILD_CMD: 'sh build.sh',
    AD_TEST_CMD: 'sh test.sh',
    AD_BACKUP_CMD: 'true',
    AD_MIGRATE_CMD: 'true',
    AD_RELOAD_CMD: `sh ${home}/reload.sh`,
    AD_READYZ_TIMEOUT: '4',
    AD_READYZ_SLEEP: '0.2',
  };
  servedFile = path.join(home, 'served');
  served = 'none';
  // Async: the readyz stand-in lives in this process and must answer while the script runs.
  const run = (cmd: string, args: string[] = []) =>
    new Promise<{ code: number | null; out: string }>((resolve) => {
      // The scripts refuse root: in a root container they run as nobody, on a tree nobody owns.
      if (AS_ROOT) spawnSync('chown', ['-R', '65534:65534', home]);
      const p = AS_ROOT ? spawn('setpriv', ['--reuid=65534', '--regid=65534', '--clear-groups', 'bash', cmd, ...args], { cwd: home, env }) : spawn('bash', [cmd, ...args], { cwd: home, env });
      let out = '';
      p.stdout.on('data', (d) => (out += d));
      p.stderr.on('data', (d) => (out += d));
      p.stdin.end();
      p.on('close', (code) => {
        if (existsSync(servedFile)) served = readFileSync(servedFile, 'utf8').trim();
        resolve({ code, out });
      });
    });
  const push = (msg: string, files: Record<string, string> = {}) => {
    for (const [f, c] of Object.entries(files)) writeFileSync(path.join(seed, f), c);
    if (AS_ROOT) spawnSync('chown', ['-R', '65534:65534', seed]);
    git(seed, 'add', '-A');
    git(seed, 'commit', '-qm', msg);
    git(seed, 'push', '-q', origin, 'HEAD:v2');
    return git(seed, 'rev-parse', 'HEAD');
  };
  const ad = (...args: string[]) => run(path.join(base, 'bin/autodeploy.sh'), args);
  const state = (f: string) => (existsSync(path.join(base, 'shared/state', f)) ? readFileSync(path.join(base, 'shared/state', f), 'utf8').trim() : '');
  return { home, base, app, seed, origin, run, push, ad, state, firstSha: git(app, 'rev-parse', 'HEAD') };
}

describe('autodeploy (release folders)', { timeout: 180_000 }, () => {
  it('install converts the old checkout into the first release, keeps the path, adds cron, never prints the token', async () => {
    const t = setup();
    // The old in-place auto-deploy's cron line, and another job that must be kept.
    writeFileSync(path.join(t.home, 'crontab.txt'), `*/2 * * * * bash ${t.app}/scripts/auto-deploy.sh --cron\n17 3 * * * echo other-job\n`);
    mkdirSync(path.join(t.app, '.deploy'), { recursive: true });
    const r = await t.run(path.join(REPO, 'scripts/autodeploy/install.sh'), ['staging', t.base]);
    expect(r.code, r.out).toBe(0);
    expect(readlinkSync(t.app)).toBe(`releases/${t.firstSha}`);
    const cron = readFileSync(path.join(t.home, 'crontab.txt'), 'utf8');
    expect(cron).not.toContain('scripts/auto-deploy.sh');
    expect(cron).toContain('echo other-job');
    expect(readFileSync(path.join(t.base, 'shared/.env'), 'utf8')).toMatch(/AUTO_DEPLOY=true[\s\S]*DEPLOY_BRANCH=v2/);
    expect(t.state('current')).toBe(t.firstSha);
    expect(readFileSync(path.join(t.home, 'crontab.txt'), 'utf8')).toContain(`*/2 * * * * bash ${t.base}/bin/autodeploy.sh --cron`);
    expect(r.out).not.toContain(TOKEN);
    // Idempotent: a second run changes nothing and still succeeds.
    const again = await t.run(path.join(REPO, 'scripts/autodeploy/install.sh'), ['staging', t.base]);
    expect(again.code, again.out).toBe(0);
    expect(again.out).toMatch(/already a release link/);
  });

  it('cron deploys a new commit in a new folder, switches, and /readyz shows it; a commit whose tests fail never goes live', async () => {
    const t = setup();
    await t.run(path.join(REPO, 'scripts/autodeploy/install.sh'), ['staging', t.base]);
    const good = t.push('a harmless change', { 'VERSION': '1\n' });
    const r = await t.ad('--cron');
    // On failure, show what the runner logged (cron mode prints nothing).
    const logs = () => spawnSync('sh', ['-c', `cat ${t.base}/shared/logs/autodeploy.log; tail -n 30 ${t.base}/shared/logs/runs/*.log`], { encoding: 'utf8' }).stdout;
    expect(r.code, r.out + logs()).toBe(0);
    expect(readlinkSync(t.app)).toBe(`releases/${good}`);
    expect(t.state('current')).toBe(good);
    expect(readFileSync(path.join(t.base, 'releases', good, 'BUILT'), 'utf8').trim()).toBe(good);
    expect(served).toBe(good);

    const bad = t.push('breaks the tests', { FAIL_TESTS: '1' });
    expect((await t.ad('--cron')).code).toBe(1);
    expect(readlinkSync(t.app)).toBe(`releases/${good}`); // the live release was never touched
    expect(t.state('failed-shas')).toContain(bad);
    expect(existsSync(path.join(t.base, 'releases', `${bad}.tmp`))).toBe(false);
    expect(readFileSync(path.join(t.base, 'shared/logs/autodeploy.log'), 'utf8')).toMatch(/failed at tests before the switch/);
    // Cron never retries a failed commit.
    expect((await t.ad('--cron')).code).toBe(0);
    expect(t.state('current')).toBe(good);
    const log = readFileSync(path.join(t.base, 'shared/logs/autodeploy.log'), 'utf8');
    expect(log).not.toContain(TOKEN);
  });

  it('a release that does not come up (readyz) is switched back; rollback, pause and resume work', async () => {
    const t = setup();
    await t.run(path.join(REPO, 'scripts/autodeploy/install.sh'), ['staging', t.base]);
    const one = t.push('one', { VERSION: '1\n' });
    await t.ad('--cron');
    const broken = t.push('does not start', { BREAK: '1' });
    expect((await t.ad('--cron')).code).toBe(1);
    expect(readlinkSync(t.app)).toBe(`releases/${one}`);
    expect(t.state('current')).toBe(one);
    expect(t.state('failed-shas')).toContain(broken);
    expect(readFileSync(path.join(t.base, 'shared/logs/autodeploy.log'), 'utf8')).toMatch(/failed at readyz after the switch; rolled back/);

    git(t.seed, 'rm', '-q', 'BREAK');
    const two = t.push('two (fixes it)', { VERSION: '2\n' });
    await t.ad('--cron');
    expect(t.state('current')).toBe(two);
    // rebuild: the live commit built again in a new folder (after a .env change), swapped in, still live.
    writeFileSync(path.join(t.base, 'releases', two, 'OLD_BUILD_MARK'), '1');
    const rbd = await t.ad('rebuild');
    expect(rbd.code, rbd.out).toBe(0);
    expect(t.state('current')).toBe(two);
    expect(existsSync(path.join(t.base, 'releases', two, 'OLD_BUILD_MARK'))).toBe(false); // a fresh folder
    expect(existsSync(path.join(t.base, 'releases', `${two}.old`))).toBe(false);
    expect(t.state('history')).toMatch(new RegExp(`${two} rebuilt`));
    // One command rolls back to the previous release, without a build.
    const rb = await t.ad('rollback');
    expect(rb.code, rb.out).toBe(0);
    expect(t.state('current')).toBe(one);
    expect(served).toBe(one);

    expect((await t.ad('pause')).code).toBe(0);
    const three = t.push('three', { VERSION: '3\n' });
    await t.ad('--cron');
    expect(t.state('current')).toBe(one); // paused: nothing deployed
    await t.ad('resume');
    await t.ad('--cron');
    expect(t.state('current')).toBe(three);
    expect((await t.ad('status')).out).toMatch(/Live: +[0-9a-f]{40}/);
  });

  it('production waits for its own branch: creating or merging into it is the approval', async () => {
    const t = setup('production');
    const r = await t.run(path.join(REPO, 'scripts/autodeploy/install.sh'), ['production', t.base]);
    expect(r.code, r.out).toBe(0);
    expect(readFileSync(path.join(t.base, 'shared/.env'), 'utf8')).toContain('DEPLOY_BRANCH=production');
    t.push('on v2 only', { VERSION: '9\n' });
    expect((await t.ad('--cron')).code).toBe(0);
    expect(t.state('current')).toBe(t.firstSha); // v2 moved, production did not
    expect(readFileSync(path.join(t.base, 'shared/logs/autodeploy.log'), 'utf8')).toMatch(/waiting: no branch 'production'/);
    const approved = git(t.seed, 'rev-parse', 'HEAD');
    git(t.seed, 'push', '-q', t.origin, 'HEAD:production');
    await t.ad('--cron');
    expect(t.state('current')).toBe(approved);
  });
});
