import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * scripts/server/go-live-production.sh: the one copy-paste go-live script for cp2. Each test builds a fake Hestia
 * layout (/home/<user>/web/<domain>/{private/flatmeta,public_html}) with a fake auto-deploy.sh, pm2, crontab and
 * nginx renderer, then runs the real script. It runs under `script` so the deploy step sees a terminal.
 */
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SHA = 'f600f7449d5153162b885c910a60d2b0069f01a2';
// Values that must never appear in the output.
const SECRETS = {
  SESSION_SECRET: 'sess_9f8e7d6c5b4a39281706f5e4d3c2b1a0ffeeddcc',
  RESEND_API_KEY: 're_SECRETresendKEY123456',
  STRIPE_SECRET_KEY: 'sk_live_SECRETstripeKEY123456',
  STRIPE_PUBLISHABLE_KEY: 'pk_live_PUBLISHABLEkey123456',
  STRIPE_WEBHOOK_SECRET: 'whsec_SECRETwebhook123456',
  DATABASE_URL: 'postgres://flatmeta_prod:DBPASSWORD123@127.0.0.1:5432/flatmeta_prod',
};
// The script refuses root. When the tests run as root (a container), they run it as nobody instead.
const AS_ROOT = process.getuid?.() === 0;
const asUser = (cmd: string): [string, string[]] => (AS_ROOT ? ['setpriv', ['--reuid=65534', '--regid=65534', '--clear-groups', 'script', '-qec', cmd, '/dev/null']] : ['script', ['-qec', cmd, '/dev/null']]);
const exe = (file: string, body: string) => {
  writeFileSync(file, body);
  chmodSync(file, 0o755);
};

function setup(env: Record<string, string | undefined> = {}) {
  const home = mkdtempSync(path.join(tmpdir(), 'fm-golive-'));
  const site = path.join(home, 'web/flatmeta.io');
  const root = path.join(site, 'private/flatmeta');
  const bin = path.join(home, 'bin');
  for (const d of [path.join(root, 'scripts/server'), path.join(root, '.git'), path.join(root, 'logs'), path.join(site, 'public_html/insights'), path.join(home, 'web/staging.flatmeta.io/private/flatmeta/scripts'), bin]) mkdirSync(d, { recursive: true });
  for (const f of ['go-live-production.sh', 'go-live-production-root.sh', 'lib.sh']) copyFileSync(path.join(REPO, 'scripts/server', f), path.join(root, 'scripts/server', f));
  copyFileSync(path.join(REPO, 'scripts/print-env.mjs'), path.join(root, 'scripts/print-env.mjs'));
  writeFileSync(path.join(root, 'scripts/deploy.sh'), '# placeholder\n');
  writeFileSync(path.join(home, 'web/staging.flatmeta.io/private/flatmeta/scripts/auto-deploy.sh'), '# staging\n');
  // Fake deploy: records the call and the .env it saw; marks the commit live.
  exe(path.join(root, 'scripts/auto-deploy.sh'), `#!/usr/bin/env bash\necho "$*" >> deploy-calls\n[ "\${FAKE_DEPLOY_RC:-0}" = 0 ] || exit 1\necho "$2" > logs/current\n`);
  writeFileSync(
    path.join(root, 'scripts/new-instance.mjs'),
    `import { mkdirSync, writeFileSync } from 'node:fs';\nmkdirSync('deploy/out/production', { recursive: true });\nwriteFileSync('deploy/out/production/nodejs-app.conf', 'if ($host = flatmeta.io) { return 301 https://www.flatmeta.io$request_uri; }\\nlocation = /llms.txt { }\\n');\n`,
  );
  exe(path.join(bin, 'pm2'), '#!/usr/bin/env bash\nexit 0\n');
  exe(path.join(bin, 'crontab'), `#!/usr/bin/env bash\nf="${home}/crontab.txt"\nif [ "$1" = "-l" ]; then [ -f "$f" ] && cat "$f" || exit 1; else cat > "$f"; fi\n`);
  writeFileSync(path.join(site, 'public_html/llms.txt'), '# FlatMeta (flatmeta.io)\n> Interactive 3D Virtual Land, Spatial Web & Digital Twin Marketplace\n');
  writeFileSync(path.join(site, 'public_html/insights/a.html'), 'article');
  const base: Record<string, string | undefined> = {
    APP_ENV: 'production',
    PRODUCTION_DOMAIN: 'flatmeta.io',
    APP_URL: 'https://flatmeta.io',
    REDIS_URL: 'redis://127.0.0.1:6379/7',
    REDIS_PREFIX: 'fm-prod',
    WEB_PORT: '3250',
    PORT: '3251',
    AUTO_DEPLOY: 'false',
    PAID_CHECKOUT_ENABLED: 'auto',
    ...SECRETS,
    ...env,
  };
  writeFileSync(path.join(root, '.env'), Object.entries(base).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
  if (AS_ROOT) spawnSync('chown', ['-R', '65534:65534', home]);
  const run = (...args: string[]) => {
    const cmd = ['bash', path.join(root, 'scripts/server/go-live-production.sh'), ...args, '--no-smoke'].map((a) => `'${a}'`).join(' ');
    const [c, a] = asUser(cmd);
    const r = spawnSync(c, a, { cwd: home, encoding: 'utf8', input: '', env: { PATH: `${bin}:${process.env.PATH}`, HOME: home, NVM_DIR: path.join(home, 'no-nvm'), TERM: 'dumb' } });
    return { code: r.status, out: r.stdout + r.stderr };
  };
  const dotenv = () => readFileSync(path.join(root, '.env'), 'utf8');
  return { home, site, root, run, dotenv };
}

const noSecrets = (out: string) => {
  for (const v of Object.values(SECRETS)) expect(out).not.toContain(v);
  expect(out).not.toContain('DBPASSWORD123');
};

describe('go-live-production.sh', () => {
  it('--dry-run checks everything and changes nothing', () => {
    const t = setup();
    const before = t.dotenv();
    const r = t.run('--dry-run');
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('DRY RUN');
    expect(r.out).toMatch(/would: set AUTO_DEPLOY=true/);
    expect(r.out).toMatch(/would: set APP_URL=https:\/\/www\.flatmeta\.io/);
    expect(r.out).toMatch(/would: bash scripts\/auto-deploy\.sh --sha f600f74/);
    expect(r.out).toMatch(/would: move .*public_html\/llms\.txt/);
    expect(t.dotenv()).toBe(before);
    expect(existsSync(path.join(t.root, 'deploy-calls'))).toBe(false);
    expect(existsSync(path.join(t.site, 'public_html/llms.txt'))).toBe(true);
    noSecrets(r.out);
  });

  it('stops with a clear message when a key is missing, naming it but printing no values', () => {
    const t = setup({ STRIPE_WEBHOOK_SECRET: undefined, RESEND_API_KEY: undefined });
    const r = t.run();
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/FAIL.*STRIPE_WEBHOOK_SECRET is missing/);
    expect(r.out).toMatch(/FAIL.*email: neither RESEND_API_KEY nor SMTP_HOST/);
    expect(r.out).toMatch(/Nothing was changed/);
    expect(existsSync(path.join(t.root, 'deploy-calls'))).toBe(false);
    noSecrets(r.out);
  });

  it('refuses a test Stripe key on production, and --no-payments skips Stripe', () => {
    const t = setup({ STRIPE_SECRET_KEY: 'sk_test_abcdef123456' });
    const r = t.run();
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/STRIPE_SECRET_KEY is missing or not a live key/);
    expect(r.out).not.toContain('sk_test_abcdef123456');
    const t2 = setup({ STRIPE_SECRET_KEY: undefined, STRIPE_PUBLISHABLE_KEY: undefined, STRIPE_WEBHOOK_SECRET: undefined });
    const r2 = t2.run('--no-payments');
    expect(r2.code, r2.out).toBe(0);
    expect(t2.dotenv()).toMatch(/^PAID_CHECKOUT_ENABLED=auto$/m);
  });

  it('applies the settings, deploys, moves stale files, adds cron; a second run changes nothing', () => {
    const t = setup();
    const r = t.run();
    expect(r.code, r.out).toBe(0);
    const env = t.dotenv();
    for (const line of ['AUTO_DEPLOY=true', 'DEPLOY_BRANCH=v2', 'REQUIRE_CI=true', 'APP_URL=https://www.flatmeta.io', 'PAID_CHECKOUT_ENABLED=true', 'HEALTH_URLS="http://127.0.0.1:3250/ http://127.0.0.1:3251/v1/me"']) expect(env).toContain(line);
    expect(env.match(/^AUTO_DEPLOY=/gm)).toHaveLength(1);
    // Secrets are copied byte for byte.
    for (const [k, v] of Object.entries(SECRETS)) expect(env).toContain(`${k}=${v}`);
    expect(readFileSync(path.join(t.root, 'deploy-calls'), 'utf8').trim()).toBe(`--sha ${SHA}`);
    expect(existsSync(path.join(t.site, 'public_html/llms.txt'))).toBe(false);
    expect(existsSync(path.join(t.site, 'public_html/insights/a.html'))).toBe(true);
    const cron = readFileSync(path.join(t.home, 'crontab.txt'), 'utf8');
    expect(cron).toContain(`*/2 * * * * bash ${t.root}/scripts/auto-deploy.sh --cron`);
    expect(cron).toContain('staging.flatmeta.io/private/flatmeta/scripts/auto-deploy.sh --cron');
    noSecrets(r.out);

    const again = t.run();
    expect(again.code, again.out).toBe(0);
    expect(again.out).toMatch(/already live and \.env did not change/);
    expect(again.out).not.toMatch(/OK +set /);
    expect(t.dotenv()).toBe(env);
    expect(readFileSync(path.join(t.root, 'deploy-calls'), 'utf8').trim().split('\n')).toHaveLength(1);
    expect(readFileSync(path.join(t.home, 'crontab.txt'), 'utf8')).toBe(cron);
  });

  it('a failed deploy stops the script and says where the reason is', () => {
    const t = setup();
    const cmd = `FAKE_DEPLOY_RC=1 bash '${path.join(t.root, 'scripts/server/go-live-production.sh')}' --no-smoke`;
    const [c, a] = asUser(cmd);
    const r = spawnSync(c, a, { cwd: t.home, encoding: 'utf8', env: { PATH: `${path.join(t.home, 'bin')}:${process.env.PATH}`, HOME: t.home, TERM: 'dumb' } });
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/The deploy failed and was rolled back.*logs\/deploy\.log/);
  });

  it('refuses to run as root', () => {
    if (process.getuid?.() !== 0) return; // the check is only reachable as root
    const t = setup();
    const r = spawnSync('bash', [path.join(t.root, 'scripts/server/go-live-production.sh'), '--dry-run'], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/Do not run this as root/);
  });

  it('the root script refuses to run as the app user', () => {
    const t = setup();
    const [c, a] = asUser(`bash '${path.join(t.root, 'scripts/server/go-live-production-root.sh')}' --dry-run`);
    if (!AS_ROOT && process.getuid?.() === 0) return;
    const r = spawnSync(c, a, { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: t.home, TERM: 'dumb' } });
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/run it as root/);
  });
});
