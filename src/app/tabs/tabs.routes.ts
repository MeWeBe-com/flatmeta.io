import { Routes, UrlMatchResult, UrlSegment } from '@angular/router';
import { TabsPage } from './tabs.page';
import { authRedirect } from '../core/auth-redirect.guard';

const PAGES = ['login', 'signup', 'terms', 'privacy', 'refunds', 'myplaces', 'salelist', 'profile', 'friendrequest', 'thankyou', 'opensource', 'recentpurchases'];

/**
 * Every map URL is handled by ONE route so the map page (and its Leaflet map)
 * is created once and reused, whatever link people arrive on:
 *   /                     the map
 *   /home                 FlatMeta Home plaza
 *   /u/:slug, /uri/:slug  a custom land URL (flatmeta.io/u/pepsi-land)
 *   /at/:coords           a shared position (lat,lng,zoom)
 *   /p/:pinId             a saved pin on this device
 *   /:slug                short custom land URL
 */
export function mapMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  if (segments.length === 0) return { consumed: [] };
  const [first, second] = segments;
  if (segments.length === 1) {
    if (first.path === 'home') return { consumed: segments, posParams: { slug: new UrlSegment('home', {}) } };
    if (PAGES.includes(first.path)) return null;
    return { consumed: segments, posParams: { slug: first } };
  }
  if (segments.length === 2) {
    if (first.path === 'u' || first.path === 'uri') return { consumed: segments, posParams: { slug: second } };
    if (first.path === 'at') return { consumed: segments, posParams: { coords: second } };
    if (first.path === 'p') return { consumed: segments, posParams: { pinId: second } };
  }
  return null;
}

const page = (path: string, load: () => Promise<any>) => ({ path, loadComponent: load });

export const routes: Routes = [
  {
    path: '',
    component: TabsPage,
    children: [
      { path: 'login', canActivate: [authRedirect], children: [] },
      { path: 'signup', canActivate: [authRedirect], children: [] },
      page('myplaces', () => import('../pages/myplaces/myplaces.page').then((m) => m.MyplacesPage)),
      page('salelist', () => import('../pages/salelist/salelist.page').then((m) => m.SalelistPage)),
      page('profile', () => import('../pages/profile/profile.page').then((m) => m.ProfilePage)),
      page('friendrequest', () => import('../pages/friendrequest/friendrequest.page').then((m) => m.FriendrequestPage)),
      page('thankyou', () => import('../pages/thankyou/thankyou.page').then((m) => m.ThankyouPage)),
      page('opensource', () => import('../pages/opensource/opensource.page').then((m) => m.OpensourcePage)),
      ...(['terms', 'privacy', 'refunds'] as const).map((doc) => ({
        path: doc,
        data: { doc },
        loadComponent: () => import('../pages/legal/legal.page').then((m) => m.LegalPage),
      })),
      page('recentpurchases', () => import('../pages/recentpurchases/recentpurchases.page').then((m) => m.RecentpurchasesPage)),
      { matcher: mapMatcher, loadComponent: () => import('../pages/home/home.page').then((m) => m.HomePage) },
    ],
  },
  // Old links: /tabs/..., /flatmeta/... (PayPal used to return to /flatmeta/thankyou).
  { path: 'tabs', redirectTo: '', pathMatch: 'prefix' },
  { path: 'flatmeta/thankyou', redirectTo: 'thankyou' },
  { path: 'flatmeta', redirectTo: '', pathMatch: 'prefix' },
];

