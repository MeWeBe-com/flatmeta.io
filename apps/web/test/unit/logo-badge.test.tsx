import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LogoBadge, initials } from '@/components/logo-badge';

/** M7: logo badges contain the logo on a neutral surface; too-thin marks (and no logo) show the initials. */
describe('logo badge', () => {
  it('shows the logo, contained and padded, when it fills enough of the badge (or the fill is unknown)', () => {
    for (const fill of [1, 0.5, 0.3, null, undefined]) {
      const out = renderToStaticMarkup(<LogoBadge name="Acme Widgets" url="/media/logos/a.png" fill={fill} size={32} />);
      expect(out).toContain('src="/media/logos/a.png"');
      expect(out).toContain('object-contain');
      expect(out).toContain('padding:4px');
      expect(out).toContain('bg-[#f4f5f8]');
    }
  });
  it('shows initials for a thin wordmark and when there is no logo', () => {
    for (const url of ['/media/logos/a.png', null]) {
      const out = renderToStaticMarkup(<LogoBadge name="Acme Widgets" url={url} fill={0.18} size={32} />);
      expect(out).not.toContain('<img');
      expect(out).toContain('>AW<');
      expect(out).toContain('font-size:12px'); // never under 12 px
    }
  });
  it('initials: first letters of two words, or the first two letters of one', () => {
    expect(initials('Acme Widgets')).toBe('AW');
    expect(initials('Tesla')).toBe('TE');
    expect(initials('Marks & Spencer')).toBe('MS');
    expect(initials('Coca-Cola')).toBe('CC');
    expect(initials('3M')).toBe('3M');
  });
});
