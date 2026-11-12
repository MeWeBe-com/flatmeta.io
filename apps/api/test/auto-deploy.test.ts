import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * scripts/auto-deploy.sh (the cron job): the guards that decide whether a tick deploys. Each test gets a real git
 * origin and checkout in a temp dir with a fake deploy.sh (records its arguments), fake curl (health), fake pg_dump
 * and fake smoke test, plus a local stand-in for the GitHub API.
 */
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const GIT = ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'init.defaultBranch=v2'];
const git = (cwd: string, ...args: string[]) => spawnSync('git', [...GIT, ...args], { cwd, encoding: 'utf8' }).stdout.trim();

// The fake GitHub API answers with whatever the test put in `ci` for that commit.
const ci: Record<string, { runs: object[]; statuses?: object[] }> = {};
let api = '';
let server: Server;
beforeAll(async () => {
  server = createServer((req, res) => {
    const m = /\/repos\/o\/r\/commits\/([0-9a-f]{40})\/(check-runs|status)/.exec(req.url ?? '');
    const c = m?.[1] ? ci[m[1]] : undefined;
    res.setHeader('content-type', 'application/json');
    if (!c) return res.end(JSON.stringify(m?.[2] === 'status' ? { statuses: [] } : { total_count: 0, check_runs: [] }));
    res.end(JSON.stringify(m![2] === 'status' ? { statuses: c.statuses ?? [] } : { total_count: c.runs.length, check_runs: c.runs }));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const exe = (file: string, body: string) => {
  writeFileSync(file, body);
  chmodSync(file, 0o755);
};

function setup(env: Record<string, string>) {
  const root = mkdtempSync(path.join(tmpdir(), 'fm-auto-'));
  const seed = path.join(root, 'seed');
  mkdirSync(path.join(seed, 'scripts'), { recursive: true });
  for (const f of ['auto-deploy.sh', 'print-env.mjs', 'deploy-ci-status.mjs', 'deploy-backup.sh']) copyFileSync(path.join(REPO, 'scripts', f), path.join(seed, 'scripts', f));
  // Fake deploy: records how it was called; succeeds unless FAKE_DEPLOY_RC says otherwise.
  exe(
    path.join(seed, 'scripts/deploy.sh'),
    `#!/usr/bin/env bash
c=""; prev=""; for a in "$@"; do [ "$prev" = "--commit" ] && c="$a"; prev="$a"; done
echo "$* trigger=\${FM_TRIGGER:-} lock=\${FM_LOCK_HELD:-}" >> deploy-calls
rc="\${FAKE_DEPLOY_RC:-0}"; [ "$rc" = 0 ] && echo "$c" > logs/current
exit "$rc"
`,
  );
  writeFileSync(path.join(seed, 'scripts/deploy-smoke.mjs'), 'process.exit(Number(process.env.FAKE_SMOKE ?? 0));\n');
  writeFileSync(path.join(seed, '.gitignore'), '.env\nlogs/\n.deploy/\ndeploy-calls\n');
  git(seed, 'init', '-q');
  git(seed, 'add', '-A');
  git(seed, 'commit', '-qm', 'first');
  spawnSync('git', ['clone', '-q', '--bare', seed, path.join(root, 'origin.git')]);
  git(seed, 'remote', 'add', 'origin', path.join(root, 'origin.git'));
  const app = path.join(root, 'app');
  spawnSync('git', ['clone', '-q', path.join(root, 'origin.git'), app]);
  const live = git(app, 'rev-parse', 'HEAD');
  const state = path.join(root, 'state');
  writeFileSync(
    path.join(app, '.env'),
    Object.entries({ APP_ENV: 'staging', AUTO_DEPLOY: 'true', REQUIRE_CI: 'true', DEPLOY_BRANCH: 'v2', DEPLOY_REPO: 'o/r', DEPLOY_STATE_DIR: state, DATABASE_URL: 'postgres://u@h/db', APP_URL: 'https://staging.example.com', HEALTH_URLS: 'http://127.0.0.1:9/v1/me', ...env })
      .map(([k, v]) => `${k}='${v}'`)
      .join('\n'),
  );
  const bin = path.join(root, 'bin');
  mkdirSync(bin);
  exe(path.join(bin, 'curl'), '#!/bin/sh\nprintf application/json\nexit "${FAKE_HEALTH:-0}"\n');
  exe(path.join(bin, 'pg_dump'), '#!/bin/sh\nwhile [ $# -gt 0 ]; do [ "$1" = "--file" ] && echo dump > "$2"; shift; done\nexit "${FAKE_PGDUMP:-0}"\n');
  /** Push a new commit to origin: the branch moved. */
  const push = (msg: string) => {
    writeFileSync(path.join(seed, `${msg}.txt`), msg);
    git(seed, 'add', '-A');
    git(seed, 'commit', '-qm', msg);
    git(seed, 'push', '-q', 'origin', 'v2');
    return git(seed, 'rev-parse', 'HEAD');
  };
  const run = (args: string[] = ['--cron'], extra: Record<string, string> = {}) =>
    new Promise<{ code: number | null; out: string }>((resolve) => {
      const p = spawn('bash', ['scripts/auto-deploy.sh', ...args], {
        cwd: app,
        env: { PATH: `${bin}:${process.env.PATH}`, HOME: root, NVM_DIR: path.join(root, 'no-nvm'), GITHUB_API_URL: api, ...extra },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let out = '';
      p.stdout.on('data', (d) => (out += d));
      p.stderr.on('data', (d) => (out += d));
      p.on('close', (code) => resolve({ code, out }));
    });
  const calls = () => (existsSync(path.join(app, 'deploy-calls')) ? readFileSync(path.join(app, 'deploy-calls'), 'utf8').trim().split('\n') : []);
  const log = () => (existsSync(path.join(app, 'logs/deploy.log')) ? readFileSync(path.join(app, 'logs/deploy.log'), 'utf8') : '');
  return { root, app, state, live, push, run, calls, log };
}

const passed = { runs: [{ name: 'test', status: 'completed', conclusion: 'success' }] };

describe('auto-deploy.sh --cron', () => {
  it('does nothing with AUTO_DEPLOY=false (but keeps the daily backup), and nothing when the branch has not moved', async () => {
    const t = setup({ AUTO_DEPLOY: 'false' });
    const tip = t.push('second');
    ci[tip] = passed;
    const r = await t.run();
    expect(r).toEqual({ code: 0, out: '' });
    expect(t.calls()).toEqual([]);
    expect(readdirSync(path.join(t.root, 'backups/flatmeta-staging')).some((f) => f.endsWith('-daily.dump'))).toBe(true);

    const u = setup({});
    expect(await u.run()).toEqual({ code: 0, out: '' }); // tip == live
    expect(u.calls()).toEqual([]);
  });

  it('deploys a moved branch once CI passed, holding the lock, and records the staging verdict', async () => {
    const t = setup({});
    const tip = t.push('second');
    ci[tip] = passed;
    const r = await t.run();
    expect(r.code).toBe(0);
    expect(r.out).toContain(`deployed ${tip.slice(0, 7)}`);
    expect(t.calls()).toEqual([`staging --auto --commit ${tip} v2 trigger=cron lock=1`]);
    const marker = readFileSync(path.join(t.state, `staging-ok-${tip}`), 'utf8');
    expect(marker).toMatch(/smoke=pass/);
    expect(marker).toMatch(/healthy=1/);
    expect(existsSync(path.join(t.state, `ci-success-${tip}`))).toBe(true);
    expect(await t.run()).toEqual({ code: 0, out: '' }); // now live: silent
    expect(t.calls()).toHaveLength(1);
  });

  it('waits while CI is pending (logging it once), and marks a commit failed when CI fails', async () => {
    const t = setup({});
    const tip = t.push('second');
    ci[tip] = { runs: [{ name: 'test', status: 'in_progress', conclusion: null }, { name: 'deploy', status: 'queued', conclusion: null }] };
    expect((await t.run()).out).toBe('');
    expect((await t.run()).out).toBe('');
    expect(t.calls()).toEqual([]);
    expect(t.log().match(/Waiting for CI/g)).toHaveLength(1);

    ci[tip] = { runs: [{ name: 'test', status: 'completed', conclusion: 'failure' }] };
    await t.run();
    expect(t.calls()).toEqual([]);
    expect(readFileSync(path.join(t.app, 'logs/failed-shas'), 'utf8')).toContain(tip);
    expect(t.log()).toMatch(/CI failed/);
    ci[tip] = passed; // even a later green re-run is not deployed automatically
    await t.run();
    expect(t.calls()).toEqual([]);
    expect(t.log()).toMatch(/Skipping .*failed-shas/);
  });

  it('ignores our own deploy and smoke jobs, and a failed commit status counts', async () => {
    const t = setup({});
    const tip = t.push('second');
    ci[tip] = { runs: [...passed.runs, { name: 'deploy', status: 'in_progress', conclusion: null }, { name: 'smoke-staging', status: 'queued', conclusion: null }] };
    await t.run();
    expect(t.calls()).toHaveLength(1);

    const u = setup({});
    const tip2 = u.push('third');
    ci[tip2] = { ...passed, statuses: [{ context: 'external/lint', state: 'failure' }] };
    await u.run();
    expect(u.calls()).toEqual([]);
    expect(readFileSync(path.join(u.app, 'logs/failed-shas'), 'utf8')).toContain(tip2);
  });

  it('never retries a commit in logs/failed-shas automatically; by hand it deploys the tip anyway', async () => {
    const t = setup({});
    const tip = t.push('second');
    ci[tip] = passed;
    mkdirSync(path.join(t.app, 'logs'), { recursive: true });
    writeFileSync(path.join(t.app, 'logs/failed-shas'), `${tip}\n`);
    await t.run();
    await t.run();
    expect(t.calls()).toEqual([]);
    expect(t.log().match(/Skipping/g)).toHaveLength(1);
    const r = await t.run([]);
    expect(r.code).toBe(0);
    expect(t.calls()).toEqual([`staging --commit ${tip} v2 trigger= lock=1`]); // manual: no --auto
  });

  it('a tick that finds a deploy running exits quietly', async () => {
    const t = setup({});
    const tip = t.push('second');
    ci[tip] = passed;
    mkdirSync(path.join(t.app, '.deploy'), { recursive: true });
    const holder = spawn('flock', [path.join(t.app, '.deploy/lock'), 'sleep', '3']);
    await new Promise((r) => setTimeout(r, 300));
    expect(await t.run()).toEqual({ code: 0, out: '' });
    expect(t.calls()).toEqual([]);
    const manual = await t.run([]);
    expect(manual.code).toBe(2);
    expect(manual.out).toMatch(/Another deploy is running/);
    holder.kill();
  });

  it('a failed deploy marks staging failed for production', async () => {
    const t = setup({});
    const tip = t.push('second');
    ci[tip] = passed;
    const r = await t.run(['--cron'], { FAKE_DEPLOY_RC: '1' });
    expect(r.out).toMatch(/failed and was rolled back/);
    expect(existsSync(path.join(t.state, `staging-failed-${tip}`))).toBe(true);
  });

  it('staging verifies a release it did not deploy itself (e.g. by CI) before production may take it', async () => {
    const t = setup({});
    await t.run(['--cron'], { FAKE_SMOKE: '1' });
    expect(existsSync(path.join(t.state, `staging-failed-${t.live}`))).toBe(true);
    const u = setup({});
    await u.run();
    expect(readFileSync(path.join(u.state, `staging-ok-${u.live}`), 'utf8')).toMatch(/smoke=pass/);
    await u.run(['--cron'], { FAKE_HEALTH: '7' }); // unhealthy: the 10-minute clock stops
    expect(readFileSync(path.join(u.state, `staging-ok-${u.live}`), 'utf8')).toMatch(/healthy=0/);
  });

  it('a release rolled back by hand on staging is never taken by production', async () => {
    const t = setup({});
    const a = t.live;
    const b = t.push('second');
    mkdirSync(path.join(t.app, 'logs'), { recursive: true });
    writeFileSync(path.join(t.app, 'logs/releases'), `${a}\n${b}\n`);
    writeFileSync(path.join(t.app, 'logs/current'), `${b}\n`);
    mkdirSync(t.state, { recursive: true });
    writeFileSync(path.join(t.state, `staging-ok-${b}`), `sha=${b}\nsmoke=pass\n`);
    await t.run(['rollback']);
    expect(t.calls()).toEqual([`staging --rollback --commit ${a} v2 trigger= lock=1`]);
    expect(existsSync(path.join(t.state, `staging-failed-${b}`))).toBe(true);
    expect(existsSync(path.join(t.state, `staging-ok-${b}`))).toBe(false);
  });
});

describe('production waits for staging', () => {
  const prod = { APP_ENV: 'production', REQUIRE_CI: 'false', HEALTH_URLS: 'http://127.0.0.1:9/v1/me' };
  const marker = (t: ReturnType<typeof setup>, sha: string, liveAgo: number, extra = '') => {
    mkdirSync(t.state, { recursive: true });
    const now = Math.floor(Date.now() / 1000);
    writeFileSync(path.join(t.state, `staging-ok-${sha}`), `sha=${sha}\nsmoke=pass\nlive_since=${now - liveAgo}\nlast_check=${now}\nhealthy=1\n${extra}`);
  };

  it('deploys only a commit that has been live and healthy on staging for 10 minutes with a passing smoke test', async () => {
    const t = setup(prod);
    const tip = t.push('second');
    await t.run();
    expect(t.calls()).toEqual([]); // no staging verdict yet
    expect(t.log()).toMatch(/no staging verdict yet/);

    marker(t, tip, 120);
    await t.run();
    expect(t.calls()).toEqual([]); // only 2 minutes on staging
    expect(t.log()).toMatch(/after 600 s healthy there/);

    writeFileSync(path.join(t.state, `staging-failed-${tip}`), 'x');
    marker(t, tip, 700);
    await t.run();
    expect(t.calls()).toEqual([]); // staging failed it
    const { rmSync } = await import('node:fs');
    rmSync(path.join(t.state, `staging-failed-${tip}`));

    writeFileSync(path.join(t.state, `staging-ok-${tip}`), readFileSync(path.join(t.state, `staging-ok-${tip}`), 'utf8').replace('smoke=pass', 'smoke=skipped'));
    await t.run();
    expect(t.calls()).toEqual([]); // healthy, but no smoke test

    marker(t, tip, 700);
    const r = await t.run();
    expect(r.out).toContain(`production: deployed ${tip.slice(0, 7)}`);
    expect(t.calls()).toEqual([`production --auto --commit ${tip} v2 trigger=cron lock=1`]);
  });

  it('a staging marker that staging stopped refreshing does not count', async () => {
    const t = setup(prod);
    const tip = t.push('second');
    mkdirSync(t.state, { recursive: true });
    const now = Math.floor(Date.now() / 1000);
    writeFileSync(path.join(t.state, `staging-ok-${tip}`), `sha=${tip}\nsmoke=pass\nlive_since=${now - 3600}\nlast_check=${now - 400}\nhealthy=1\n`);
    await t.run();
    expect(t.calls()).toEqual([]);
    expect(t.log()).toMatch(/is its cron running/);
  });

  it('rollback goes back to the previous kept release and passes --rollback', async () => {
    const t = setup(prod);
    const a = t.live;
    const b = t.push('second');
    mkdirSync(path.join(t.app, 'logs'), { recursive: true });
    writeFileSync(path.join(t.app, 'logs/releases'), `${a}\n${b}\n`);
    writeFileSync(path.join(t.app, 'logs/current'), `${b}\n`);
    await t.run(['rollback']);
    expect(t.calls()).toEqual([`production --rollback --commit ${a} v2 trigger= lock=1`]);
  });
});

describe('CI status classification', () => {
  it('treats running checks as pending, any failure as failed, and skips our own deploy jobs', async () => {
    const mod = (await import(path.join(REPO, 'scripts/deploy-ci-status.mjs'))) as { classify: (runs: object[], statuses: object[]) => string };
    const ok = { name: 'test', status: 'completed', conclusion: 'success' };
    expect(mod.classify([], [])).toMatch(/^pending/);
    expect(mod.classify([ok], [])).toBe('success');
    expect(mod.classify([ok, { name: 'lint', status: 'completed', conclusion: 'skipped' }], [])).toBe('success');
    expect(mod.classify([{ ...ok, status: 'in_progress', conclusion: null }], [])).toMatch(/^pending test/);
    expect(mod.classify([{ ...ok, conclusion: 'cancelled' }], [])).toMatch(/^failed test: cancelled/);
    expect(mod.classify([ok, { name: 'deploy-production', status: 'completed', conclusion: 'failure' }], [{ context: 'deploy/production', state: 'failure' }])).toBe('success');
    expect(mod.classify([ok], [{ context: 'ci/x', state: 'pending' }])).toMatch(/^pending ci\/x/);
    expect(mod.classify([ok], [{ context: 'ci/x', state: 'error' }])).toMatch(/^failed/);
  });
});
