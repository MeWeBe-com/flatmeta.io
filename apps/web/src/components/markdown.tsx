import { Fragment, type ReactNode } from 'react';

/**
 * Renders an owner's Markdown description as React elements: no innerHTML, so user text is always escaped by React
 * (security rule: never dangerouslySetInnerHTML with user content outside the sandbox origin). Supports what plot
 * descriptions use: headings, paragraphs with line breaks, bullet and numbered lists, quotes, rules, code, bold,
 * italic, strikethrough, inline code and links (http, https, mailto, tel only; opened with rel="noopener nofollow ugc").
 */
const SAFE_LINK = /^(https?:\/\/|mailto:|tel:)/i;

function inline(text: string, key = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  // Order matters: code first (its content is literal), then links, then emphasis.
  const re = /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|\*([^*\s][^*]*)\*|_([^_\s][^_]*)_|(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g;
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const k = `${key}-${n++}`;
    if (m[1] !== undefined) out.push(<code key={k}>{m[1]}</code>);
    else if (m[2] !== undefined) {
      const href = m[3]!;
      out.push(SAFE_LINK.test(href) ? <a key={k} href={href} target="_blank" rel="noopener nofollow ugc">{inline(m[2], k)}</a> : <Fragment key={k}>{m[2]}</Fragment>);
    } else if (m[4] !== undefined || m[5] !== undefined) out.push(<strong key={k}>{inline(m[4] ?? m[5]!, k)}</strong>);
    else if (m[6] !== undefined) out.push(<s key={k}>{inline(m[6], k)}</s>);
    else if (m[7] !== undefined || m[8] !== undefined) out.push(<em key={k}>{inline(m[7] ?? m[8]!, k)}</em>);
    else if (m[9] !== undefined) out.push(<a key={k} href={m[9]} target="_blank" rel="noopener nofollow ugc">{m[9]}</a>);
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Lines joined with <br>, like the server renderer (GFM with breaks). */
const lines = (text: string, key: string) =>
  text.split('\n').flatMap((l, i, all) => (i < all.length - 1 ? [<Fragment key={`${key}-${i}`}>{inline(l, `${key}-${i}`)}</Fragment>, <br key={`${key}-br${i}`} />] : [<Fragment key={`${key}-${i}`}>{inline(l, `${key}-${i}`)}</Fragment>]));

export function Markdown({ source, className }: { source: string | null | undefined; className?: string }) {
  if (!source?.trim()) return null;
  const blocks: ReactNode[] = [];
  const rows = source.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  let b = 0;
  while (i < rows.length) {
    const line = rows[i]!;
    const key = `b${b++}`;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (/^```/.test(line)) {
      const code: string[] = [];
      i++;
      while (i < rows.length && !/^```/.test(rows[i]!)) code.push(rows[i++]!);
      i++;
      blocks.push(<pre key={key}><code>{code.join('\n')}</code></pre>);
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      // Page headings stay h2–h4: the page title is the only h1.
      const level = Math.min(4, Math.max(2, h[1]!.length + 1));
      const Tag = `h${level}` as 'h2' | 'h3' | 'h4';
      blocks.push(<Tag key={key}>{inline(h[2]!, key)}</Tag>);
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push(<hr key={key} />);
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const q: string[] = [];
      while (i < rows.length && /^>\s?/.test(rows[i]!)) q.push(rows[i++]!.replace(/^>\s?/, ''));
      blocks.push(<blockquote key={key}>{lines(q.join('\n'), key)}</blockquote>);
      continue;
    }
    const ul = /^\s*[-*+]\s+/;
    const ol = /^\s*\d+[.)]\s+/;
    if (ul.test(line) || ol.test(line)) {
      const ordered = ol.test(line);
      const re = ordered ? ol : ul;
      const items: string[] = [];
      while (i < rows.length && re.test(rows[i]!)) items.push(rows[i++]!.replace(re, ''));
      const List = ordered ? 'ol' : 'ul';
      blocks.push(
        <List key={key}>
          {items.map((it, j) => (
            <li key={j}>{inline(it, `${key}-${j}`)}</li>
          ))}
        </List>,
      );
      continue;
    }
    const para: string[] = [rows[i++]!]; // always consume at least one line
    while (i < rows.length && rows[i]!.trim() && !/^(#{1,4}\s|```|>|\s*[-*+]\s+|\s*\d+[.)]\s+|(-{3,}|\*{3,}|_{3,})\s*$)/.test(rows[i]!)) para.push(rows[i++]!);
    blocks.push(<p key={key}>{lines(para.join('\n'), key)}</p>);
  }
  return <div className={className}>{blocks}</div>;
}
