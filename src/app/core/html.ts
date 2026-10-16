/**
 * Helpers for building HTML strings that end up in Leaflet divIcons, popups and
 * other innerHTML sinks. Anything that came from another user (names, titles,
 * image URLs, WebSocket payloads) must go through these before interpolation.
 */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"'`]/g, (ch) => HTML_ESCAPES[ch]);
}

const SAFE_DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp|svg\+xml)[;,]/i;

/**
 * Returns `src` only if it is an http(s) URL, a raster/SVG data URI or a
 * relative asset path; otherwise the fallback. The result is attribute-escaped.
 */
export function safeImageSrc(src: unknown, fallback: string): string {
  const raw = String(src ?? '').trim();
  let ok = false;
  if (raw) {
    if (SAFE_DATA_IMAGE.test(raw)) {
      ok = true;
    } else if (/^https?:\/\//i.test(raw)) {
      ok = true;
    } else if (/^(assets\/|\/assets\/)/.test(raw)) {
      ok = true;
    }
  }
  return escapeHtml(ok ? raw : fallback);
}

/** Only allows absolute http(s) URLs, used for embeds and external links. */
export function isHttpUrl(value: unknown): boolean {
  return /^https?:\/\/[^\s]+$/i.test(String(value ?? '').trim());
}
