// Public configuration. Values come from the repo-root .env (loaded and exposed to the browser by next.config.ts);
// nothing here is secret. Every absolute URL is built from APP_URL, never from window.location or a hard-coded host.
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'FlatMeta';
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3200').replace(/\/$/, '');
export const APP_ENV = process.env.NEXT_PUBLIC_APP_ENV ?? 'development';
export const PRODUCTION_DOMAIN = process.env.NEXT_PUBLIC_PRODUCTION_DOMAIN ?? 'flatmeta.io';
export const STAGING_DOMAIN = process.env.NEXT_PUBLIC_STAGING_DOMAIN ?? 'staging.flatmeta.io';
export const API_DOCS_URL = process.env.NEXT_PUBLIC_API_DOCS_URL || `${SITE_URL}/api/docs`;
export const MCP_URL = process.env.NEXT_PUBLIC_MCP_URL || `${SITE_URL}/api/mcp`;
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? '';
export const MAP_TILES_URL = process.env.NEXT_PUBLIC_MAP_TILES_URL || 'https://tiles.openfreemap.org/planet';
export const MAP_GLYPHS_URL = process.env.NEXT_PUBLIC_MAP_GLYPHS_URL || 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
export const MAP_STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || '';
export const MAP_ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || '© OpenStreetMap contributors · OpenFreeMap';
export const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN ?? '';
export const GOOGLE_AUTH = process.env.NEXT_PUBLIC_GOOGLE_AUTH === 'true';
