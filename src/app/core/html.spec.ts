import { escapeHtml, isHttpUrl, safeImageSrc } from './html';

describe('html', () => {
  it('escapes markup and quotes', () => {
    expect(escapeHtml(`<img src=x onerror="alert('1')">`)).toBe('&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;');
    expect(escapeHtml(null)).toBe('');
  });

  it('only lets safe image sources through', () => {
    expect(safeImageSrc('https://a.test/x.png', 'f.svg')).toBe('https://a.test/x.png');
    expect(safeImageSrc('data:image/png;base64,AAAA', 'f.svg')).toBe('data:image/png;base64,AAAA');
    expect(safeImageSrc('assets/icon/a.svg', 'f.svg')).toBe('assets/icon/a.svg');
    expect(safeImageSrc('javascript:alert(1)', 'f.svg')).toBe('f.svg');
    expect(safeImageSrc('data:text/html,<b>', 'f.svg')).toBe('f.svg');
    expect(safeImageSrc('https://a.test/"onerror="x', 'f.svg')).toBe('https://a.test/&quot;onerror=&quot;x');
  });

  it('recognises http(s) links', () => {
    expect(isHttpUrl('https://example.com/a')).toBeTrue();
    expect(isHttpUrl('ftp://example.com')).toBeFalse();
    expect(isHttpUrl('https://a b')).toBeFalse();
  });
});
