import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

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
    NEXT_PUBLIC_APP_URL: env.APP_URL ?? 'http://localhost:3200',
    NEXT_PUBLIC_APP_ENV: env.APP_ENV ?? 'development',
    NEXT_PUBLIC_PRODUCTION_DOMAIN: env.PRODUCTION_DOMAIN ?? 'flatmeta.io',
    NEXT_PUBLIC_STAGING_DOMAIN: env.STAGING_DOMAIN ?? 'staging.flatmeta.io',
  },
  // In production the Hestia nginx proxy routes /api and /media before they reach Next; these rewrites make dev (and a bare `next start`) work the same way.
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API}/:path*` },
      { source: '/media/:path*', destination: `${API}/media/:path*` },
    ];
  },
  async headers() {
    return [
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }, { key: 'Service-Worker-Allowed', value: '/' }] },
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
