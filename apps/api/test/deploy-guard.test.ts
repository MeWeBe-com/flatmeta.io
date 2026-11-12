import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Automatic deploys: who may deploy what (scripts/deploy-guard.sh) and how deploy.sh applies it. */
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SHA = 'a'.repeat(40);

function guard(env: Record<string, string>) {
  const r = spawnSync('bash', [path.join(REPO, 'scripts/deploy-guard.sh')], { env: { PATH: process.env.PATH!, ...env }, encoding: 'utf8' });
  return { code: r.status, out: r.stdout.trim() };
}

describe('deploy guard', () => {
  const autoOk = { APP_ENV: 'production', ENV_ARG: 'production', AUTO: '1', AUTO_DEPLOY: 'true', IS_TTY: '0', SSH_CONNECTION: '203.0.113.5 50000 198.51.100.7 22', COMMIT: SHA };

  it('allows an automatic production deploy only with --auto, AUTO_DEPLOY=true, a non-interactive SSH session and a full SHA', () => {
    expect(guard(autoOk)).toMatchObject({ code: 10 });
    expect(guard({ ...autoOk, AUTO_DEPLOY: '' }).out).toMatch(/AUTO_DEPLOY=true/);
    expect(guard({ ...autoOk, AUTO_DEPLOY: '' }).code).toBe(1);
    expect(guard({ ...autoOk, AUTO_DEPLOY: 'yes' }).code).toBe(1); // only the exact value "true"
    expect(guard({ ...autoOk, SSH_CONNECTION: '' }).code).toBe(1); // neither the CI key nor cron
    expect(guard({ ...autoOk, SSH_CONNECTION: '', FM_TRIGGER: 'cron' }).code).toBe(10); // scripts/auto-deploy.sh --cron
    expect(guard({ ...autoOk, IS_TTY: '1' }).code).toBe(1); // a person at a terminal uses the manual path
    expect(guard({ ...autoOk, COMMIT: 'abc1234' }).code).toBe(1); // a full SHA only
    expect(guard({ ...autoOk, COMMIT: 'main' }).code).toBe(1);
    expect(guard({ ...autoOk, ENV_ARG: '' }).code).toBe(1); // production must be named
    expect(guard({ ...autoOk, ENV_ARG: 'staging' }).out).toMatch(/not staging/);
  });

  it('never retries a commit that failed before', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'fm-failed-')), 'failed-shas');
    writeFileSync(file, `${'c'.repeat(40)}\n${SHA}\n`);
    const r = guard({ ...autoOk, FAILED_SHAS: file });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/never retried automatically/);
    expect(guard({ ...autoOk, FAILED_SHAS: file, COMMIT: 'b'.repeat(40) }).code).toBe(10); // a newer commit is fine
    expect(guard({ ...autoOk, FAILED_SHAS: file, APP_ENV: 'staging', ENV_ARG: 'staging' }).code).toBe(1); // staging too
  });

  it('manual production deploys need a person at a terminal; staging auto-deploys need AUTO_DEPLOY=true', () => {
    const manual = { APP_ENV: 'production', ENV_ARG: 'production', AUTO: '0', IS_TTY: '1' };
    expect(guard(manual).code).toBe(0);
    expect(guard({ ...manual, IS_TTY: '0' }).code).toBe(1);
    expect(guard({ ...manual, GITHUB_ACTIONS: 'true' }).code).toBe(1);
    expect(guard({ ...manual, SSH_ORIGINAL_COMMAND: 'bash scripts/deploy.sh production' }).code).toBe(1);
    expect(guard({ ...manual, AUTO_DEPLOY: 'true', IS_TTY: '0' }).code).toBe(1); // AUTO_DEPLOY alone doesn't skip the prompt
    expect(guard({ ...manual, FM_TRIGGER: 'cron' }).code).toBe(1); // cron never takes the manual path
    expect(guard({ APP_ENV: 'staging', ENV_ARG: '', AUTO: '0' }).code).toBe(0);
    const stagingCron = { APP_ENV: 'staging', ENV_ARG: 'staging', AUTO: '1', FM_TRIGGER: 'cron', COMMIT: SHA };
    expect(guard(stagingCron).code).toBe(1); // AUTO_DEPLOY is off by default
    expect(guard({ ...stagingCron, AUTO_DEPLOY: 'true' }).code).toBe(10);
  });
});

/** deploy.sh itself in a throwaway checkout: it must stop before touching anything when the guard says no. */
function checkout(envFile: string) {
  const dir = mkdtempSync(path.join(tmpdir(), 'fm-deploy-'));
  mkdirSync(path.join(dir, 'scripts'));
  for (const f of ['deploy.sh', 'deploy-guard.sh', 'deploy-backup.sh', 'deploy-notify.mjs', 'deploy-smoke.mjs', 'print-env.mjs']) copyFileSync(path.join(REPO, 'scripts', f), path.join(dir, 'scripts', f));
  writeFileSync(path.join(dir, '.env'), envFile);
  const bin = path.join(dir, 'bin');
  mkdirSync(bin);
  writeFileSync(path.join(bin, 'pm2'), '#!/bin/sh\nexit 0\n');
  chmodSync(path.join(bin, 'pm2'), 0o755);
  spawnSync('git', ['init', '-q'], { cwd: dir });
  return { dir, PATH: `${bin}:${process.env.PATH}` };
}
function deploy(c: { dir: string; PATH: string }, args: string[], env: Record<string, string> = {}) {
  const r = spawnSync('bash', ['scripts/deploy.sh', ...args], { cwd: c.dir, env: { PATH: c.PATH, HOME: c.dir, NVM_DIR: path.join(c.dir, 'no-nvm'), ...env }, encoding: 'utf8', input: '' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

describe('deploy.sh applies the guard before doing anything', () => {
  const ssh = { SSH_CONNECTION: '203.0.113.5 50000 198.51.100.7 22' };

  it('refuses --auto when the production .env has no AUTO_DEPLOY=true, even if the caller sets it', () => {
    const c = checkout('APP_ENV=production\nDATABASE_URL=postgres://x\n');
    const r = deploy(c, ['production', '--auto', '--commit', SHA], { ...ssh, AUTO_DEPLOY: 'true' });
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/Automatic deploys are off/);
    expect(r.out).not.toMatch(/Deploying FlatMeta/);
  });

  it('takes the commit from the forced command, refuses a failed one, and passes a good one to the deploy', () => {
    const c = checkout('APP_ENV=production\nAUTO_DEPLOY=true\nDATABASE_URL=postgres://x\n');
    const forced = { ...ssh, SSH_ORIGINAL_COMMAND: `cd '/srv/x' && bash scripts/deploy.sh production --auto --commit ${SHA}; rm -rf /` };
    mkdirSync(path.join(c.dir, 'logs'), { recursive: true });
    writeFileSync(path.join(c.dir, 'logs/failed-shas'), `${SHA}\n`);
    let r = deploy(c, ['production', '--auto'], forced);
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/never retried automatically/);
    r = deploy(c, ['production', '--auto'], { ...forced, SSH_ORIGINAL_COMMAND: forced.SSH_ORIGINAL_COMMAND.replace(SHA, 'c'.repeat(40)) });
    expect(r.out).toMatch(/automatic production deploy of ccccccc/);
    expect(r.out).toMatch(/Deploying FlatMeta \(production\)/); // got past the guard (then fails: no origin here)
    expect(r.code).not.toBe(0);
  });

  it('refuses a manual production deploy without a terminal, and the wrong checkout', () => {
    const c = checkout('APP_ENV=production\nAUTO_DEPLOY=true\n');
    expect(deploy(c, ['production']).code).toBe(2);
    expect(deploy(c, ['production', '--yes']).code).toBe(2);
    const r = deploy(c, ['staging']);
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/APP_ENV=production, not staging/);
  });
});

describe('deploy email', () => {
  it('names the commit and the result (dry run prints instead of sending)', () => {
    const c = checkout('APP_ENV=production\nAPP_URL=https://www.flatmeta.io\nADMIN_EMAILS=ops@example.com\n');
    writeFileSync(path.join(c.dir, 'deploy.log'), 'step 1\nstep 2\n✗ Health checks failed\n');
    const r = spawnSync('node', ['scripts/deploy-notify.mjs', '--root', c.dir, '--result', 'rolled_back', '--commit', SHA, '--prev', 'b'.repeat(40), '--log', path.join(c.dir, 'deploy.log'), '--dry-run'], { cwd: c.dir, encoding: 'utf8', env: { PATH: process.env.PATH! } });
    expect(r.stdout).toContain(`[FlatMeta] ✗ Production deploy of aaaaaaa failed: rolled back to bbbbbbb`);
    expect(r.stdout).toContain('To: ops@example.com');
    expect(r.stdout).toContain(`Commit: ${SHA}`);
    expect(r.stdout).toContain('will not be deployed automatically again');
    expect(r.stdout).toContain('✗ Health checks failed');
    const ok = spawnSync('node', ['scripts/deploy-notify.mjs', '--root', c.dir, '--result', 'success', '--commit', SHA, '--dry-run'], { cwd: c.dir, encoding: 'utf8', env: { PATH: process.env.PATH! } });
    expect(ok.stdout).toContain('[FlatMeta] ✓ Production deployed aaaaaaa');
  });
});
