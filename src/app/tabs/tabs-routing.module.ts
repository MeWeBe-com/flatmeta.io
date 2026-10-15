import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TabsPage } from './tabs.page';

const childRoutes: Routes = [
  {
    path: '',
    loadChildren: () => import('../pages/home/home.module').then(m => m.HomePageModule),
    pathMatch: 'full'
  },
  {
    path: 'home',
    loadChildren: () => import('../pages/home/home.module').then(m => m.HomePageModule)
  },
  {
    path: 'u/:slug',
    loadChildren: () => import('../pages/home/home.module').then(m => m.HomePageModule)
  },
  {
    path: 'uri/:slug',
    loadChildren: () => import('../pages/home/home.module').then(m => m.HomePageModule)
  },
  {
    path: 'p/:pinId',
    loadChildren: () => import('../pages/home/home.module').then(m => m.HomePageModule)
  },
  {
    path: 'at/:coords',
    loadChildren: () => import('../pages/home/home.module').then(m => m.HomePageModule)
  },
  {
    path: 'login',
    loadChildren: () => import('../pages/login/login.module').then(m => m.LoginPageModule)
  },
  {
    path: 'signup',
    loadChildren: () => import('../pages/signup/signup.module').then(m => m.SignupPageModule)
  },
  {
    path: 'myplaces',
    loadChildren: () => import('../pages/myplaces/myplaces.module').then(m => m.MyplacesPageModule)
  },
  {
    path: 'salelist',
    loadChildren: () => import('../pages/salelist/salelist.module').then(m => m.SalelistPageModule)
  },
  {
    path: 'profile',
    loadChildren: () => import('../pages/profile/profile.module').then(m => m.ProfilePageModule)
  },
  {
    path: 'cart',
    loadChildren: () => import('../pages/cart/cart.module').then(m => m.CartPageModule)
  },
  {
    path: 'friendrequest',
    loadChildren: () => import('../pages/friendrequest/friendrequest.module').then(m => m.FriendrequestPageModule)
  },
  {
    path: 'thankyou',
    loadChildren: () => import('../pages/thankyou/thankyou.module').then(m => m.ThankyouPageModule)
  },
  {
    path: 'opensource',
    loadChildren: () => import('../pages/opensource/opensource.module').then(m => m.OpensourcePageModule)
  },
  {
    path: 'recentpurchases',
    loadChildren: () => import('../pages/recentpurchases/recentpurchases.module').then(m => m.RecentpurchasesPageModule)
  },
  {
    path: ':slug',
    loadChildren: () => import('../pages/home/home.module').then(m => m.HomePageModule)
  }
];

const routes: Routes = [
  {
    path: '',
    component: TabsPage,
    children: childRoutes
  },
  {
    path: 'flatmeta',
    component: TabsPage,
    children: childRoutes
  },
  {
    path: 'tabs',
    redirectTo: '',
    pathMatch: 'prefix'
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
})
export class TabsPageRoutingModule { }
