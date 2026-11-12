import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PlatformAuthService } from '../services/subscription.services';

/**
 * Platform pages need an operator session. On a reload or in a new tab the access token is gone (it lives in memory), so the guard first waits
 * for the one attempt to restore it from the httpOnly cookie; only when that fails is the operator sent to the sign-in.
 */
export const platformGuard: CanActivateFn = async () => {
  const platform = inject(PlatformAuthService);
  const router = inject(Router); // inject() only works before the first await
  await platform.ready();
  return platform.isSignedIn() ? true : router.createUrlTree(['/platform/login']);
};

/**
 * A platform screen that needs a specific operator permission (route data: platformPermission). Operators without it are sent to the
 * overview instead of a page that would only show errors. The API refuses the calls regardless.
 */
export const platformPermissionGuard: CanActivateFn = async (route) => {
  const platform = inject(PlatformAuthService);
  const router = inject(Router);
  await platform.ready();
  if (!platform.isSignedIn()) return router.createUrlTree(['/platform/login']);
  const needed = route.data['platformPermission'] as string | undefined;
  return !needed || platform.can(needed) ? true : router.createUrlTree(['/platform/overview']);
};
