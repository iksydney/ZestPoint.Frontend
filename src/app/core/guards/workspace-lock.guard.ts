import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { SCREEN_PERMISSIONS } from '../models/rbac.model';
import { AuthService } from '../services/auth.service';

/**
 * While a company is restricted under the lock-everything policy, the only screens that work are the subscription and payment ones.
 * Anyone else is sent there (administrators) or to a plain explanation (everyone else). The API enforces the same lock on every
 * request; this only spares people a wall of failed calls.
 */
export const workspaceLockGuard: CanActivateChildFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.ready();
  if (!auth.locked()) return true;
  if (state.url.startsWith('/app/subscription')) return auth.hasPermission(SCREEN_PERMISSIONS.SUBSCRIPTIONS_VIEW) ? true : router.createUrlTree(['/restricted']);
  // A locked company must still be able to ask ZestPoint for help.
  if (state.url.startsWith('/app/support') && auth.hasPermission(SCREEN_PERMISSIONS.SUPPORT_VIEW)) return true;
  return router.createUrlTree([auth.hasPermission(SCREEN_PERMISSIONS.SUBSCRIPTIONS_VIEW) ? '/app/subscription' : '/restricted']);
};
