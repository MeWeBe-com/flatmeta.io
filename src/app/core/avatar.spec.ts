import { avatarDataUrl, createRandomAvatarConfig, detectSmileyExpression, sanitizeAvatarConfig } from './avatar';

describe('avatar', () => {
  it('drops unknown values from configs received from other people', () => {
    const clean = sanitizeAvatarConfig({ ...createRandomAvatarConfig(), topType: '"><script>', circleBg: 'red;x', customImage: 'javascript:1' })!;
    expect(clean.topType).not.toContain('<');
    expect(clean.circleBg).toMatch(/^#[0-9a-f]{3,8}$/i);
    expect(clean.customImage).toBeUndefined();
    expect(sanitizeAvatarConfig('nope')).toBeNull();
  });

  it('renders an SVG data URL, or the uploaded photo', () => {
    const cfg = createRandomAvatarConfig();
    expect(avatarDataUrl(cfg).startsWith('data:image/svg+xml')).toBeTrue();
    expect(avatarDataUrl({ ...cfg, customImage: 'https://api.test/u.png' })).toBe('https://api.test/u.png');
  });

  it('maps smileys to expressions', () => {
    expect(detectSmileyExpression('hi :D')).toBe('Twinkle');
    expect(detectSmileyExpression('hi :)')).toBe('Smile');
    expect(detectSmileyExpression('hello')).toBeUndefined();
  });
});
