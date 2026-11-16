/**
 * Email addresses in pages, safe from Cloudflare Email Obfuscation (Scrape Shield). Cloudflare rewrites any address it
 * finds in the HTML into a "[email protected]" span plus a decoding script, so the HTML no longer matches what React
 * renders and hydration fails (React error #418 on /pricing, /business and /for/*, found in GL3z). Cloudflare skips
 * whatever sits between <!--email_off--> and <!--/email_off-->, and React does not compare dangerouslySetInnerHTML
 * content during hydration, so the address reaches the page as written on both sides.
 */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** The HTML for text that may contain addresses: each address wrapped in email_off markers (exported for tests). */
export function emailOffHtml(text: string, link = false): string {
  return esc(text).replace(EMAIL, (m) => `<!--email_off-->${link ? `<a class="underline" data-inline-link href="mailto:${m}">${m}</a>` : m}<!--/email_off-->`);
}

/** Text that may contain email addresses (legal copy, FAQs). Set `link` to turn each address into a mailto link. */
export function EmailText({ text, link = false, className }: { text: string; link?: boolean; className?: string }) {
  return <span className={className} dangerouslySetInnerHTML={{ __html: emailOffHtml(text, link) }} />;
}
