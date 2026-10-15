import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PlatformAuthService } from '../services/subscription.services';

/** Platform pages need an operator session. The session lives in memory only, so a reload returns to the sign-in. */
export const platformGuard: CanActivateFn = () => {
  const platform = inject(PlatformAuthService);
  return platform.isSignedIn() ? true : inject(Router).createUrlTree(['/platform/login']);
};

/**
 * A platform screen that needs a specific operator permission (route data: platformPermission). Operators without it are sent to the
 * overview instead of a page that would only show errors. The API refuses the calls regardless.
 */
export const platformPermissionGuard: CanActivateFn = (route) => {
  const platform = inject(PlatformAuthService);
  const router = inject(Router);
  if (!platform.isSignedIn()) return router.createUrlTree(['/platform/login']);
  const needed = route.data['platformPermission'] as string | undefined;
  return !needed || platform.can(needed) ? true : router.createUrlTree(['/platform/overview']);
};
