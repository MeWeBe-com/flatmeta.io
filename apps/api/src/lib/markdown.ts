import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

/** Owner-written Markdown → safe HTML (no scripts, no iframes, links open safely). */
export function renderMarkdown(md: string | null | undefined): string {
  if (!md) return '';
  const html = marked.parse(md, { async: false, gfm: true, breaks: true }) as string;
  return sanitizeHtml(html, {
    allowedTags: ['p', 'br', 'strong', 'em', 'b', 'i', 'u', 's', 'a', 'ul', 'ol', 'li', 'blockquote', 'h2', 'h3', 'h4', 'code', 'pre', 'hr'],
    allowedAttributes: { a: ['href', 'title', 'rel', 'target'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener nofollow ugc', target: '_blank' }),
    },
  });
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&nbsp;': ' ' };

/** Plain text: tags removed, entities decoded (React escapes it again when rendering). */
export function stripText(value: string, max: number): string {
  return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} })
    .replace(/&(amp|lt|gt|quot|#39|#x27|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Only http(s) URLs, normalised; returns null when invalid. */
export function safeUrl(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    const u = new URL(value.trim().match(/^https?:\/\//i) ? value.trim() : `https://${value.trim()}`);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}
