/**
 * GL5: is the sending domain ready, and can this server send? Reads DNS over HTTPS (Cloudflare's resolver), so it
 * works where plain DNS is blocked. Never prints keys.
 *   npm run email:check -w flatmeta-api                      # check DNS for the MAIL_FROM domain
 *   npm run email:check -w flatmeta-api -- --domain flatmeta.io
 *   npm run email:check -w flatmeta-api -- --send you@example.com   # also send one test email with the current settings
 * Checks: inbound MX (Cloudflare Email Routing), SPF, DKIM (Resend's "resend._domainkey"), the Resend bounce
 * subdomain ("send."), and DMARC. Each line says what to add when it is missing (docs/golive/MANUAL-STEPS.md → Email).
 */
import { config, emailProvider } from '../src/config.js';

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const fromDomain = (config.MAIL_FROM.match(/@([^>\s]+)/)?.[1] ?? config.PRODUCTION_DOMAIN).toLowerCase();
const domain = (opt('--domain') ?? fromDomain).toLowerCase();

async function doh(name: string, type: 'TXT' | 'MX' | 'CNAME'): Promise<string[]> {
  const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(10_000) });
  const body = (await res.json()) as { Answer?: { data: string }[] };
  return (body.Answer ?? []).map((a) => a.data.replace(/^"|"$/g, '').replace(/" "/g, ''));
}
const line = (ok: boolean, what: string, detail: string) => console.log(`${ok ? '✓' : '✗'} ${what}${detail ? `: ${detail}` : ''}`);

console.log(`Sender: ${config.MAIL_FROM}${config.MAIL_REPLY_TO ? ` · replies to ${config.MAIL_REPLY_TO}` : ''} · provider: ${emailProvider()}`);
console.log(`Checking ${domain}${domain !== config.PRODUCTION_DOMAIN ? ` (the production domain is ${config.PRODUCTION_DOMAIN})` : ''}\n`);

const mx = await doh(domain, 'MX');
line(mx.some((m) => /mx\.cloudflare\.net\.?$/.test(m)), 'Inbound MX (Cloudflare Email Routing)', mx.join(', ') || 'none: turn on Email Routing for the domain in Cloudflare (it adds the MX and SPF records)');
const txt = await doh(domain, 'TXT');
const spf = txt.find((t) => t.startsWith('v=spf1'));
line(!!spf, 'SPF on the domain', spf ?? 'none: Email Routing adds "v=spf1 include:_spf.mx.cloudflare.net ~all"');
const dkim = await doh(`resend._domainkey.${domain}`, 'TXT');
line(dkim.some((d) => d.includes('p=')), 'DKIM for sending (Resend)', dkim.length ? 'present' : 'none: add the resend._domainkey TXT record Resend shows for the domain');
const sendMx = await doh(`send.${domain}`, 'MX');
const sendSpf = (await doh(`send.${domain}`, 'TXT')).find((t) => t.startsWith('v=spf1'));
line(sendMx.length > 0 && !!sendSpf, 'Bounce domain send.' + domain + ' (Resend)', sendMx.length ? `${sendMx.join(', ')} · ${sendSpf ?? 'no SPF'}` : 'none: add the "send" MX and TXT records Resend shows');
const dmarc = (await doh(`_dmarc.${domain}`, 'TXT')).find((t) => t.startsWith('v=DMARC1'));
line(!!dmarc, 'DMARC', dmarc ?? 'none: add _dmarc TXT "v=DMARC1; p=none; rua=mailto:dmarc@' + domain + '" (then p=quarantine after 2 clean weeks)');
if (fromDomain !== config.PRODUCTION_DOMAIN) console.log(`\nNote: mail still goes out from ${fromDomain}. Switch MAIL_FROM to noreply@${config.PRODUCTION_DOMAIN} once every line above is ✓ for ${config.PRODUCTION_DOMAIN}.`);

const to = opt('--send');
if (to) {
  const { deliver } = await import('../src/email/transport.js');
  const r = await deliver({ to, subject: `${config.APP_NAME} email check`, text: `This is a test from ${config.APP_URL} (${config.APP_ENV}). Sender: ${config.MAIL_FROM}.`, html: `<p>This is a test from ${config.APP_URL} (${config.APP_ENV}).</p><p>Sender: ${config.MAIL_FROM}.</p>`, type: 'notice' });
  console.log(`\nSent a test email to ${to} with ${r.provider} (id ${r.id}). Check the inbox and the spam folder.`);
}
process.exit(0);
