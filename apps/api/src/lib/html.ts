/**
 * Screening for owner-supplied HTML ("custom HTML" on a plot). The page is only ever rendered inside
 * <iframe sandbox="allow-scripts" srcdoc=…> (no same-origin, no top navigation, no forms, no popups),
 * so this is a second line of defence that keeps obviously abusive markup from being stored at all.
 */
export const MAX_CUSTOM_HTML = 50_000;

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
  [/<script\b[^>]*\bsrc\s*=/i, 'loads external scripts'],
  [/\bnavigator\s*\.\s*(sendBeacon|geolocation|clipboard)|\bXMLHttpRequest\b|\bfetch\s*\(|\bWebSocket\b/i, 'makes network or device requests'],
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
  if (html.length > MAX_CUSTOM_HTML) reasons.push(`is larger than ${MAX_CUSTOM_HTML / 1000} KB`);
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
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)], html };
}

/** What owner code may do inside its frame: inline script and style, images and media over https, the embed hosts. */
export const SANDBOX_CONTENT_CSP =
  "default-src 'none'; img-src https: data:; media-src https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src https: data:; frame-src https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://open.spotify.com https://www.google.com; base-uri 'none'; form-action 'none'; connect-src 'none'";

/**
 * Response headers for a served sandbox document. The CSP `sandbox allow-scripts` directive gives the document an
 * opaque origin even when it is opened directly (not in our iframe), so it can never read flatmeta.io cookies or
 * storage, navigate the top window, open popups or submit forms. Only our own pages may frame it.
 */
export function sandboxHeaders(frameAncestors: string[]): Record<string, string> {
  return {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': `sandbox allow-scripts; ${SANDBOX_CONTENT_CSP}; frame-ancestors ${frameAncestors.join(' ')}`,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'cross-origin-opener-policy': 'same-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  };
}

/** The document placed in the sandboxed iframe: a strict CSP on top of the sandbox attribute. */
export function wrapCustomHtml(html: string): string {
  const csp = SANDBOX_CONTENT_CSP;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:system-ui,sans-serif;color:#e6e9f5;background:transparent}</style></head><body>${html}</body></html>`;
}
