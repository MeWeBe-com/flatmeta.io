/**
 * Screening for owner-supplied HTML ("custom HTML" on a plot). The code only ever runs as its own document on the
 * separate usercontent origin, inside <iframe sandbox="allow-scripts"> (no same-origin, no top navigation, no forms,
 * no popups) and with `CSP: sandbox allow-scripts`, so it gets an opaque origin. This scan is a second line of
 * defence that keeps obviously abusive markup from being stored or published at all.
 */
export const MAX_CUSTOM_HTML = 200_000; // bytes (UTF-8)

/** Script libraries owner code may load (the CSP enforces the same list). */
export const SCRIPT_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com'];

/** Hosts owner code may fetch from: empty by default, set USERCONTENT_CONNECT_HOSTS to allow APIs. */
export function connectHosts(): string[] {
  return (process.env.USERCONTENT_CONNECT_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter((h) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h));
}

const EMBED_HOSTS = ['youtube.com', 'www.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com', 'player.vimeo.com', 'open.spotify.com', 'www.google.com', 'maps.google.com'];

const BLOCKED: [RegExp, string][] = [
  [/document\s*\.\s*cookie/i, 'reads cookies'],
  [/\b(window\s*\.\s*)?(top|parent)\s*\.\s*(location|document|postMessage)/i, 'tries to reach the page around it'],
  [/\blocation\s*(\.\s*(href|replace|assign)\s*)?=(?!=)/i, 'redirects the visitor'],
  [/<meta[^>]+http-equiv\s*=\s*["']?refresh/i, 'redirects the visitor'],
  [/\beval\s*\(|new\s+Function\s*\(|setTimeout\s*\(\s*["'`]|setInterval\s*\(\s*["'`]/i, 'runs dynamic code'],
  [/String\s*\.\s*fromCharCode\s*\([^)]{40,}\)|atob\s*\(\s*["'][A-Za-z0-9+/=]{80,}/i, 'contains obfuscated code'],
  [/<form\b[^>]*\baction\s*=\s*["']?https?:/i, 'posts forms to another site'],
  [/<(object|embed|applet|base|link)\b/i, 'uses a blocked tag'],
  [/\bnavigator\s*\.\s*(sendBeacon|geolocation|clipboard|credentials|serviceWorker)/i, 'uses device or credential APIs'],
  [/coinhive|cryptonight|coinimp|crypto-?loot|webminer|webmine\.|minero\.cc|jsecoin|deepminer|stratum\+(tcp|ssl)|\bnew\s+\w*Miner\s*\(|\bminer\s*\.\s*start\s*\(|\bhashes\s*per\s*second/i, 'looks like a crypto miner'],
  [/<input\b[^>]*\btype\s*=\s*["']?password/i, 'asks for passwords'],
  [/<input\b[^>]*\b(name|id|autocomplete)\s*=\s*["']?(cc-?number|card-?number|cvv|cvc|cc-csc|cc-exp|iban|seed-?phrase|mnemonic|private-?key)/i, 'asks for card, bank or wallet details'],
  [/\b(enter|confirm|verify)\s+your\s+(password|seed phrase|recovery phrase|private key|card number)/i, 'asks for credentials'],
  [/\bwindow\s*\.\s*open\s*\(|\bdocument\s*\.\s*write\s*\(/i, 'opens windows or rewrites the page'],
];

export interface HtmlScreen {
  ok: boolean;
  reasons: string[];
  html: string;
}

export function screenCustomHtml(input: string): HtmlScreen {
  const html = input.replaceAll(String.fromCharCode(0), '').trim();
  const reasons: string[] = [];
  if (Buffer.byteLength(html, 'utf8') > MAX_CUSTOM_HTML) reasons.push(`is larger than ${MAX_CUSTOM_HTML / 1000} KB`);
  for (const [re, why] of BLOCKED) if (re.test(html)) reasons.push(why);
  for (const m of html.matchAll(/<iframe\b[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)/gi)) {
    let host = '';
    try {
      host = new URL(m[1]!, 'https://x.invalid').hostname;
    } catch {
      /* invalid URL: rejected below */
    }
    if (!EMBED_HOSTS.includes(host)) reasons.push(`embeds ${host || 'an unknown site'} (allowed: YouTube, Vimeo, Spotify, Google Maps)`);
  }
  for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)/gi)) {
    let url: URL | null = null;
    try {
      url = new URL(m[1]!, 'https://x.invalid');
    } catch {
      /* invalid URL: rejected below */
    }
    if (!url || url.protocol !== 'https:' || !SCRIPT_HOSTS.includes(url.hostname)) reasons.push(`loads a script from ${url?.hostname && url.hostname !== 'x.invalid' ? url.hostname : 'an unknown site'} (allowed: ${SCRIPT_HOSTS.join(', ')})`);
  }
  const connect = connectHosts();
  for (const m of html.matchAll(/(?:fetch\s*\(|new\s+(?:WebSocket|EventSource)\s*\(|\.open\s*\(\s*["'][A-Z]+["']\s*,)\s*["'`]((?:https?|wss?):\/\/[^"'`\s/]+)/gi)) {
    let host = '';
    try {
      host = new URL(m[1]!).hostname;
    } catch {
      /* ignore */
    }
    if (!connect.includes(host)) reasons.push(`connects to ${host || 'an unknown site'}, which is not on the allowlist`);
  }
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)], html };
}

/**
 * What owner code may do inside its frame: inline script and style, the allowlisted script libraries, images and
 * media over https, the embed hosts, and network requests only to the configured allowlist (none by default).
 */
export function sandboxContentCsp(): string {
  const connect = connectHosts();
  return [
    "default-src 'none'",
    'img-src https: data: blob:',
    'media-src https: blob:',
    "style-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://fonts.googleapis.com",
    `script-src 'unsafe-inline' ${SCRIPT_HOSTS.map((h) => `https://${h}`).join(' ')}`,
    'font-src https: data:',
    'frame-src https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://open.spotify.com https://www.google.com',
    `connect-src ${connect.length ? connect.map((h) => `https://${h} wss://${h}`).join(' ') : "'none'"}`,
    "base-uri 'none'",
    "form-action 'none'",
    "worker-src 'none'",
    "manifest-src 'none'",
  ].join('; ');
}

/**
 * Response headers for a served sandbox document. The CSP `sandbox allow-scripts` directive gives the document an
 * opaque origin even when it is opened directly (not in our iframe), so it can never read flatmeta.io cookies or
 * storage, navigate the top window, open popups or submit forms. Only our own pages may frame it.
 */
export function sandboxHeaders(frameAncestors: string[]): Record<string, string> {
  return {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': `sandbox allow-scripts; ${sandboxContentCsp()}; frame-ancestors ${frameAncestors.join(' ')}`,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'cross-origin',
    'x-robots-tag': 'noindex, nofollow',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  };
}

/** The document placed in the sandboxed iframe: a strict CSP on top of the sandbox attribute. */
export function wrapCustomHtml(html: string): string {
  const csp = sandboxContentCsp();
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui,sans-serif;color:#e6e9f5;background:transparent}</style></head><body>${html}</body></html>`;
}
