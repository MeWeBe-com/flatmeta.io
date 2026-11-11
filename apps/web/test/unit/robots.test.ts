import { afterEach, describe, expect, it, vi } from 'vitest';

describe('robots.txt (G15b)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });
  it('production: welcomes AI search crawlers on public pages and keeps private areas out', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.flatmeta.io');
    const robots = (await import('@/app/robots')).default();
    const rules = Array.isArray(robots.rules) ? robots.rules : [robots.rules];
    const ai = rules.find((r) => Array.isArray(r.userAgent) && r.userAgent.includes('GPTBot'))!;
    expect(ai.userAgent).toEqual(expect.arrayContaining(['ClaudeBot', 'PerplexityBot', 'Google-Extended', 'OAI-SearchBot']));
    expect(ai.allow).toEqual(expect.arrayContaining(['/', '/llms.txt', '/about/facts']));
    expect(ai.disallow).toEqual(expect.arrayContaining(['/dashboard', '/admin', '/api/']));
    expect(robots.sitemap).toContain('https://www.flatmeta.io/sitemap-index.xml');
  });
  it('staging and development stay out of every index', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'staging');
    const robots = (await import('@/app/robots')).default();
    expect(robots.rules).toEqual({ userAgent: '*', disallow: '/' });
  });
});
