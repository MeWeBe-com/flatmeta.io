#!/usr/bin/env node
// Prepares one FlatMeta instance (staging or production) in THIS checkout:
//   1. writes .env from .env.example with the instance's ports, Redis DB/prefix, URLs and paths
//      (only if .env doesn't exist yet; otherwise it lists the values that differ and changes nothing),
//   2. creates the media folder,
//   3. renders the two Hestia nginx include files with the right ports and media path into deploy/out/<env>/.
//
//   node scripts/new-instance.mjs production --domain flatmeta.io --home /home/flatmeta [--db postgres://…]
//   node scripts/new-instance.mjs staging    --domain staging.flatmeta.io --home /home/flatmeta
//   node scripts/new-instance.mjs production --nginx-only        # re-render nginx files from the existing .env
//
// Secrets are never invented except SESSION_SECRET (random). Fill RESEND_API_KEY, Stripe and AI keys by hand.
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PRESETS = {
  staging: { web: 3200, api: 3201, worker: 3203, redisDb: 6, prefix: 'fm-staging', db: 'flatmeta_staging' },
  production: { web: 3250, api: 3251, worker: 3253, redisDb: 7, prefix: 'fm-prod', db: 'flatmeta_prod' },
};

const args = process.argv.slice(2);
const env = args[0];
if (!PRESETS[env]) {
  console.error('Usage: node scripts/new-instance.mjs <staging|production> --domain <host> --home </home/USER> [--db <DATABASE_URL>] [--nginx-only]');
  process.exit(1);
}
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i > 0 ? args[i + 1] : undefined;
};
const p = PRESETS[env];
const envFile = join(root, '.env');
const outDir = join(root, 'deploy', 'out', env);

function renderNginx(values) {
  mkdirSync(outDir, { recursive: true });
  const web = values.WEB_PORT ?? String(p.web);
  const api = values.PORT ?? String(p.api);
  const media = resolve(root, 'apps/api', values.MEDIA_DIR ?? './storage/media').replace(/\/+$/, '');
  const main = readFileSync(join(root, 'deploy/hestia/nodejs-app.conf'), 'utf8')
    .replaceAll('127.0.0.1:3201', `127.0.0.1:${api}`)
    .replaceAll('127.0.0.1:3200', `127.0.0.1:${web}`)
    .replaceAll('__MEDIA_DIR__', media)
    .replace(/^#   WEB_PORT=3200 .*$/m, `#   WEB_PORT=${web}   Next.js   (rendered for ${env})`)
    .replace(/^#   PORT=3201 .*$/m, `#   PORT=${api}       API (REST, WebSocket, /mcp, /docs)`);
  const fallback = readFileSync(join(root, 'deploy/hestia/nodejs-app-fallback.conf'), 'utf8').replaceAll('127.0.0.1:3200', `127.0.0.1:${web}`);
  writeFileSync(join(outDir, 'nodejs-app.conf'), main);
  writeFileSync(join(outDir, 'nodejs-app-fallback.conf'), fallback);
  console.log(`nginx include files for ${env} (web :${web}, api :${api}, media ${media}/):\n  ${join(outDir, 'nodejs-app.conf')}\n  ${join(outDir, 'nodejs-app-fallback.conf')}`);
}

if (args.includes('--nginx-only')) {
  if (!existsSync(envFile)) throw new Error('.env not found: run without --nginx-only first');
  renderNginx(parseEnv(readFileSync(envFile, 'utf8')));
  process.exit(0);
}

const domain = opt('domain') ?? (env === 'production' ? 'flatmeta.io' : 'staging.flatmeta.io');
const home = opt('home') ?? process.env.HOME ?? '/home/flatmeta';
// Hestia layout: /home/USER/web/DOMAIN/private is outside the public web root and survives redeploys.
const privateDir = join(home, 'web', domain, 'private');
const wanted = {
  NODE_ENV: 'production',
  APP_ENV: env,
  APP_URL: `https://${domain}`,
  HOST: '127.0.0.1',
  WEB_PORT: String(p.web),
  PORT: String(p.api),
  MCP_PORT: '',
  WORKER_HEALTH_PORT: String(p.worker),
  API_INTERNAL_URL: `http://127.0.0.1:${p.api}`,
  DATABASE_URL: opt('db') ?? `postgres://flatmeta:CHANGE_ME@127.0.0.1:5432/${p.db}`,
  REDIS_URL: `redis://127.0.0.1:6379/${p.redisDb}`,
  REDIS_PREFIX: p.prefix,
  SESSION_SECRET: randomBytes(32).toString('hex'),
  COOKIE_SECURE: 'true',
  TRUST_PROXY: 'true',
  MEDIA_DIR: join(privateDir, 'uploads'),
  MEDIA_PUBLIC_URL: '/media',
  EXTERNAL_IMAGE_DIR: join(privateDir, 'external'),
  NEXT_PUBLIC_WS_URL: '', // same origin: wss://DOMAIN/api/v1/live through nginx
  PAYMENTS_MOCK: 'false',
  DEV_CODE_ECHO: env === 'production' ? 'false' : 'auto',
  PAID_CHECKOUT_ENABLED: 'auto',
  NPM_CONFIG_INCLUDE: 'dev',
  LOG_LEVEL: 'info',
};

if (existsSync(envFile)) {
  const have = parseEnv(readFileSync(envFile, 'utf8'));
  const diff = Object.entries(wanted).filter(([k, v]) => k !== 'SESSION_SECRET' && k !== 'DATABASE_URL' && (have[k] ?? '') !== v);
  console.log(`.env exists: left unchanged.${diff.length ? ' Values that differ from the ' + env + ' preset:' : ' It matches the ' + env + ' preset.'}`);
  for (const [k, v] of diff) console.log(`  ${k}: have "${have[k] ?? ''}", preset "${v}"`);
  renderNginx(have);
} else {
  let text = readFileSync(join(root, '.env.example'), 'utf8');
  for (const [k, v] of Object.entries(wanted)) {
    const line = `${k}=${/[\s#"']/.test(v) ? JSON.stringify(v) : v}`;
    const re = new RegExp(`^${k}=.*$`, 'm');
    text = re.test(text) ? text.replace(re, line) : `${text.trimEnd()}\n${line}\n`;
  }
  writeFileSync(envFile, text, { mode: 0o600 });
  console.log(`wrote ${envFile} for ${env} (${domain}). Now set DATABASE_URL's password, RESEND_API_KEY, MAIL_FROM, SEED_ADMIN_EMAIL.`);
  renderNginx(wanted);
}
for (const dir of [wanted.MEDIA_DIR, wanted.EXTERNAL_IMAGE_DIR]) {
  try {
    mkdirSync(dir, { recursive: true });
    console.log(`media folder ready: ${dir}`);
  } catch (err) {
    console.log(`could not create ${dir} (${err.message}); create it on the server`);
  }
}
