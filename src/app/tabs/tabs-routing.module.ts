import { NgModule } from '@angular/core';
import { RouterModule, Routes, UrlMatchResult, UrlSegment } from '@angular/router';
import { TabsPage } from './tabs.page';
import { authRedirect } from '../core/auth-redirect.guard';

const PAGES = ['login', 'signup', 'myplaces', 'salelist', 'profile', 'friendrequest', 'thankyou', 'opensource', 'recentpurchases'];

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

const page = (path: string, load: () => Promise<any>) => ({ path, loadChildren: load });

const routes: Routes = [
  {
    path: '',
    component: TabsPage,
    children: [
      { path: 'login', canActivate: [authRedirect], children: [] },
      { path: 'signup', canActivate: [authRedirect], children: [] },
      page('myplaces', () => import('../pages/myplaces/myplaces.module').then((m) => m.MyplacesPageModule)),
      page('salelist', () => import('../pages/salelist/salelist.module').then((m) => m.SalelistPageModule)),
      page('profile', () => import('../pages/profile/profile.module').then((m) => m.ProfilePageModule)),
      page('friendrequest', () => import('../pages/friendrequest/friendrequest.module').then((m) => m.FriendrequestPageModule)),
      page('thankyou', () => import('../pages/thankyou/thankyou.module').then((m) => m.ThankyouPageModule)),
      page('opensource', () => import('../pages/opensource/opensource.module').then((m) => m.OpensourcePageModule)),
      page('recentpurchases', () => import('../pages/recentpurchases/recentpurchases.module').then((m) => m.RecentpurchasesPageModule)),
      { matcher: mapMatcher, loadChildren: () => import('../pages/home/home.module').then((m) => m.HomePageModule) },
    ],
  },
  // Old links: /tabs/..., /flatmeta/... (PayPal used to return to /flatmeta/thankyou).
  { path: 'tabs', redirectTo: '', pathMatch: 'prefix' },
  { path: 'flatmeta/thankyou', redirectTo: 'thankyou' },
  { path: 'flatmeta', redirectTo: '', pathMatch: 'prefix' },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
})
export class TabsPageRoutingModule {}
