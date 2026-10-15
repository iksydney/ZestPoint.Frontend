import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { APP_NAV, permissionsOf } from '../navigation/app-nav';
import { AuthService } from '../services/auth.service';

/**
 * "/app" has no screen of its own: it sends each person to the first screen their role actually includes (a waiter with no
 * dashboard access lands on the POS, not on a "no access" page). Nobody with no screens at all is sent to /forbidden.
 * It reads the same list as the menu, so the landing page is always one the menu would show.
 */
export const landingGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.ready();
  if (auth.locked()) return router.createUrlTree([auth.hasPermission('subscriptions.view') ? '/app/subscription' : '/restricted']);
  const first = APP_NAV.find((n) => auth.hasAnyPermission(permissionsOf(n)) && (!n.feature || auth.accessModeFor(n.feature) !== 'locked'));
  return router.createUrlTree([first?.route ?? '/forbidden']);
};
