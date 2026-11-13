import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';
import { securityHeaders } from './src/lib/csp';
import { apexRedirects, canonicalUrl } from './src/lib/canonical';

// One .env at the repo root configures both apps. Load it before reading any variable.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
loadEnvConfig(root, process.env.NODE_ENV !== 'production');

const env = process.env;
const API = (env.API_INTERNAL_URL || 'http://127.0.0.1:3201').replace(/\/$/, '');

// APP_URL must be the public origin; in production it may not be a local address.
if (env.NODE_ENV === 'production' && /\/\/(localhost|127\.0\.0\.1)/.test(env.APP_URL ?? '')) {
  console.warn('[flatmeta] APP_URL points at localhost in a production build: set it to the public https origin.');
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // scripts/deploy.sh builds into a side directory, then swaps it in.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  images: { unoptimized: true },
  // Browser-visible values derive from the shared root .env (APP_URL etc.), so there is one place to configure them.
  env: {
    NEXT_PUBLIC_APP_NAME: env.APP_NAME ?? 'FlatMeta',
    NEXT_PUBLIC_APP_URL: canonicalUrl(env),
    NEXT_PUBLIC_APP_ENV: env.APP_ENV ?? 'development',
    // S2: lastmod for static pages in the sitemap = when this build was made (deploy.sh may pass BUILD_TIME).
    BUILD_TIME: env.BUILD_TIME || new Date().toISOString(),
    NEXT_PUBLIC_PRODUCTION_DOMAIN: env.PRODUCTION_DOMAIN ?? 'flatmeta.io',
    NEXT_PUBLIC_STAGING_DOMAIN: env.STAGING_DOMAIN ?? 'staging.flatmeta.io',
    // Same rule as the API (apps/api/src/config.ts paidCheckoutFor): auto = off in production, on elsewhere.
    NEXT_PUBLIC_PAID_CHECKOUT:
      env.PAID_CHECKOUT_ENABLED === 'true' || ((env.PAID_CHECKOUT_ENABLED ?? 'auto') === 'auto' && (env.APP_ENV ?? (env.NODE_ENV === 'production' ? 'production' : 'development')) !== 'production') ? 'true' : 'false',
    NEXT_PUBLIC_FREE_LAND_CELLS: env.FREE_LAND_CELLS ?? '100',
    NEXT_PUBLIC_COMPANY_NAME: env.COMPANY_NAME || 'MeWeBe',
    // S4: FlatMeta's own profiles (comma-separated https URLs), the Organization JSON-LD's sameAs.
    NEXT_PUBLIC_SAME_AS: env.SAME_AS ?? '',
    NEXT_PUBLIC_COMPANY_COUNTRY: env.COMPANY_COUNTRY || 'United Kingdom',
    NEXT_PUBLIC_CONTACT_EMAIL: env.CONTACT_EMAIL || 'hello@flatmeta.io',
    // Separate origin for owner custom HTML (G8). Empty in dev/tests: served from /api on the same origin.
    NEXT_PUBLIC_USERCONTENT_URL: env.USERCONTENT_URL ?? '',
  },
  // In production the Hestia nginx proxy routes /api and /media before they reach Next; these rewrites make dev (and a bare `next start`) work the same way.
  // S6: flatmeta.io/<anything> → 301 → www.flatmeta.io/<anything>.
  async redirects() {
    return apexRedirects(env);
  },
  async rewrites() {
    return [
      // Share links: flatmeta.io/@handle and /@handle/plot-slug (Next.js can't name a folder "@…": that's a parallel route).
      { source: '/@:handle', destination: '/h/:handle' },
      { source: '/@:handle/:plot', destination: '/h/:handle/:plot' },
      { source: '/api/:path*', destination: `${API}/:path*` },
      { source: '/media/:path*', destination: `${API}/media/:path*` },
    ];
  },
  async headers() {
    return [
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }, { key: 'Service-Worker-Allowed', value: '/' }] },
      // Frame protection, HSTS (https sites), nosniff, referrer and permissions policies on every response.
      // The nonce-based CSP for pages is set per request in src/proxy.ts.
      { source: '/(.*)', headers: securityHeaders((env.APP_URL ?? '').startsWith('https://')) },
    ];
  },
};

export default nextConfig;
