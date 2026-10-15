import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { RouteAccessData } from '../models/rbac.model';
import { AuthService } from '../services/auth.service';

/**
 * Feature gate. Reads `data.feature`:
 *  - 'locked'   → redirect to /upgrade (feature not in the subscription)
 *  - 'readonly' → activate; screens call EntitlementService/`isReadOnly` to disable mutating controls
 *  - 'full'     → activate
 */
export const subscriptionGateGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.ready();

  const feature = (route.data as RouteAccessData).feature;
  if (feature === undefined) return true;

  return auth.accessModeFor(feature) === 'locked'
    ? router.createUrlTree(['/upgrade'], { queryParams: { feature } })
    : true;
};
