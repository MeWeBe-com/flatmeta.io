// Emails the admins after a production deploy (success, rollback or abort). No dependencies of its own, so it
// still works after a rollback to an older release: Resend over HTTPS when RESEND_API_KEY is set, else SMTP through
// the repo's nodemailer, else it only prints. Recipients: ADMIN_EMAILS plus every admin in the database.
//   node deploy-notify.mjs --root <checkout> --result success|rolled_back|aborted --commit <sha> [--prev <sha>]
//                          [--message <text>] [--log <file>] [--dry-run]
// Never prints secrets: the log tail is the deploy's own output.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

const args = process.argv.slice(2);
const arg = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const root = arg('root') ?? process.cwd();
const result = arg('result') ?? 'unknown';
const commit = arg('commit') ?? '';
const prev = arg('prev') ?? '';
const message = arg('message') ?? '';
const logFile = arg('log');
const dry = args.includes('--dry-run');

const env = existsSync(join(root, '.env')) ? parseEnv(readFileSync(join(root, '.env'), 'utf8')) : {};
const get = (k) => process.env[k] ?? env[k] ?? '';
const site = get('APP_URL') || 'FlatMeta';
const short = (s) => (s ? s.slice(0, 7) : '–');
const repoUrl = get('DEPLOY_REPO_URL') || 'https://github.com/MeWeBe-com/flatmeta.io';

const TITLES = {
  success: `✓ Production deployed ${short(commit)}`,
  rolled_back: `✗ Production deploy of ${short(commit)} failed: rolled back to ${short(prev)}`,
  aborted: `✗ Production deploy of ${short(commit)} aborted before any change`,
};
export function buildEmail() {
  const subject = `[FlatMeta] ${TITLES[result] ?? `Production deploy: ${result}`}`;
  const tail = logFile && existsSync(logFile) ? readFileSync(logFile, 'utf8').split('\n').slice(-40).join('\n') : '';
  const text = [
    TITLES[result] ?? result,
    '',
    `Site: ${site}`,
    `Commit: ${commit} (${repoUrl}/commit/${commit})`,
    prev ? `Previous release: ${prev}` : '',
    `Result: ${result}`,
    message ? `\n${message}` : '',
    result === 'rolled_back' ? '\nThis commit is recorded as failed and will not be deployed automatically again. The database backup taken before the migrations is in ~/backups (see the log).' : '',
    tail ? `\nLast lines of the deploy log:\n${tail}` : '',
  ]
    .filter((l) => l !== '')
    .join('\n');
  return { subject, text };
}

async function recipients() {
  const list = new Set(get('ADMIN_EMAILS').split(',').map((s) => s.trim().toLowerCase()).filter((s) => /^[^@\s]+@[^@\s]+$/.test(s)));
  if (get('DATABASE_URL')) {
    try {
      const pg = createRequire(join(root, 'package.json'))('pg');
      const client = new pg.Client({ connectionString: get('DATABASE_URL') });
      await client.connect();
      const r = await client.query("select email from users where role = 'admin' and banned_at is null");
      for (const row of r.rows) list.add(String(row.email).toLowerCase());
      await client.end();
    } catch (err) {
      console.error(`deploy-notify: could not read admins from the database (${err.message})`);
    }
  }
  return [...list];
}

async function main() {
  const { subject, text } = buildEmail();
  const to = await recipients();
  if (dry || !to.length) {
    console.log(`deploy-notify${dry ? ' (dry run)' : ': no admin addresses'}: ${subject}\nTo: ${to.join(', ') || '–'}\n\n${text}`);
    return;
  }
  const from = get('MAIL_FROM') || 'FlatMeta <hello@flatmeta.io>';
  if (get('RESEND_API_KEY')) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${get('RESEND_API_KEY')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to, subject, text, tags: [{ name: 'type', value: 'deploy' }] }),
    });
    console.log(`deploy-notify: Resend ${res.status} (${to.length} admin${to.length === 1 ? '' : 's'})`);
    return;
  }
  if (get('SMTP_HOST')) {
    const nodemailer = createRequire(join(root, 'package.json'))('nodemailer');
    const t = nodemailer.createTransport({ host: get('SMTP_HOST'), port: Number(get('SMTP_PORT') || 587), secure: get('SMTP_SECURE') === 'true', auth: get('SMTP_USER') ? { user: get('SMTP_USER'), pass: get('SMTP_PASS') } : undefined });
    await t.sendMail({ from, to, subject, text });
    console.log(`deploy-notify: sent by SMTP (${to.length} admins)`);
    return;
  }
  console.log(`deploy-notify: no email provider configured; would send:\n${subject}\n\n${text}`);
}

main().catch((err) => {
  console.error(`deploy-notify failed: ${err.message}`);
  process.exit(0); // a failed email never fails the deploy
});
