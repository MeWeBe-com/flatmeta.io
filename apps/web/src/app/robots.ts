import type { MetadataRoute } from 'next';
import { APP_ENV, SITE_URL } from '@/lib/config';

const PRIVATE = ['/dashboard', '/admin', '/checkout', '/login', '/claim/', '/api/'];
// Plot share images are served by the API; let crawlers (and image search) fetch them.
const PUBLIC_API = ['/api/v1/plots/*/cover.jpg'];
const AI_CRAWLERS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'Amazonbot', 'meta-externalagent', 'Bytespider', 'CCBot'];

export default function robots(): MetadataRoute.Robots {
  // Keep staging and dev out of search engines entirely.
  if (APP_ENV !== 'production') return { rules: { userAgent: '*', disallow: '/' } };
  return {
    // One group (S1): every crawler, with the AI search and assistant crawlers named so they know they are welcome
    // (G15b), and the private areas listed once.
    rules: [{ userAgent: ['*', ...AI_CRAWLERS], allow: ['/', '/llms.txt', '/llms-full.txt', ...PUBLIC_API], disallow: PRIVATE }],
    // Exactly one sitemap: the index, which lists pages, plots, companies and insights. No Host: line (not a standard).
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
