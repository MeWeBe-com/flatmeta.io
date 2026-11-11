import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Markdown } from '@/components/markdown';

const html = (md: string) => renderToStaticMarkup(<Markdown source={md} />);

describe('plot descriptions are rendered without innerHTML (security rule)', () => {
  it('escapes HTML and script in owner text', () => {
    const out = html('Hello <script>alert(1)</script> <img src=x onerror=alert(1)>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;script&gt;');
  });
  it('only links http, https, mailto and tel, with safe rel', () => {
    expect(html('[bad](javascript:alert(1))')).not.toContain('<a');
    expect(html('[bad](data:text/html,x)')).not.toContain('<a');
    const ok = html('[site](https://example.com) and https://flatmeta.io/p/x');
    expect(ok).toContain('<a href="https://example.com" target="_blank" rel="noopener nofollow ugc">site</a>');
    expect(ok).toContain('href="https://flatmeta.io/p/x"');
  });
  it('renders the Markdown that descriptions use', () => {
    const out = html('# Title\n\nSome **bold** and *it* text\nnext line\n\n- one\n- two\n\n1. first\n\n> quote\n\n---\n\n`code`');
    expect(out).toContain('<h2>Title</h2>'); // the page title is the only h1
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<em>it</em>');
    expect(out).toContain('text<br/>next line');
    expect(out).toContain('<ul><li>one</li><li>two</li></ul>');
    expect(out).toContain('<ol><li>first</li></ol>');
    expect(out).toContain('<blockquote>quote</blockquote>');
    expect(out).toContain('<hr/>');
    expect(out).toContain('<code>code</code>');
  });
  it('never loops on odd input', () => {
    expect(html('##### five hashes\n#nospace\n\n\n')).toContain('five hashes');
    expect(html('')).toBe('');
  });
});
