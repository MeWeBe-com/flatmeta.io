import { afterEach, describe, expect, it, vi } from 'vitest';

describe('robots.txt (G15b)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });
  it('production: one group for every crawler (AI search crawlers named), private areas once, one sitemap, no Host', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.flatmeta.io');
    const robots = (await import('@/app/robots')).default();
    const rules = Array.isArray(robots.rules) ? robots.rules : [robots.rules];
    expect(rules).toHaveLength(1);
    const g = rules[0]!;
    expect(g.userAgent).toEqual(expect.arrayContaining(['*', 'GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'OAI-SearchBot']));
    expect(g.allow).toEqual(expect.arrayContaining(['/', '/llms.txt']));
    expect(g.disallow).toEqual(expect.arrayContaining(['/dashboard', '/admin', '/api/']));
    expect(robots.sitemap).toBe('https://www.flatmeta.io/sitemap.xml');
    expect(robots.host).toBeUndefined();
  });
  it('staging and development stay out of every index', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'staging');
    const robots = (await import('@/app/robots')).default();
    expect(robots.rules).toEqual({ userAgent: '*', disallow: '/' });
  });
});
