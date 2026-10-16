import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, Router, UrlTree } from '@angular/router';
import { SessionService } from '../providers/session.service';

/**
 * Old /login and /signup links: instead of a full page you can't close, show
 * the small sign-in popup over the map (the brief asks for exactly this).
 */
export function authRedirect(route: ActivatedRouteSnapshot): UrlTree {
  const session = inject(SessionService);
  if (session.isGuest) {
    setTimeout(() =>
      session.requestAuth(route.routeConfig?.path === 'signup' ? 'Sign up with just your email.' : '', 'email')
    );
  }
  return inject(Router).parseUrl('/');
}
