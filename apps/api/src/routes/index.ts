import type { App } from '../app.js';
import adminRoutes from './admin.js';
import aiRoutes from './ai.js';
import authRoutes from './auth.js';
import billingRoutes from './billing.js';
import liveRoutes from './live.js';
import meRoutes from './me.js';
import orgRoutes from './orgs.js';
import plotRoutes from './plots.js';
import regionRoutes, { sitemapRoutes } from './regions.js';
import searchRoutes from './search.js';
import showcaseRoutes from './showcase.js';
import socialRoutes from './social.js';

export async function registerRoutes(app: App) {
  for (const r of [authRoutes, meRoutes, plotRoutes, regionRoutes, sitemapRoutes, socialRoutes, searchRoutes, orgRoutes, billingRoutes, aiRoutes, showcaseRoutes, adminRoutes, liveRoutes]) {
    await r(app);
  }
}
