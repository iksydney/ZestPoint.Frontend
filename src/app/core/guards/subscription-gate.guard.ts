import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { RouteAccessData } from '../models/rbac.model';
import { AccessService } from '../services/access.service';
import { AuthService } from '../services/auth.service';

/**
 * Feature gate. Reads `data.feature`:
 *  - 'locked'   → redirect to /upgrade (feature not in the subscription)
 *  - 'readonly' → activate; screens call EntitlementService/`isReadOnly` to disable mutating controls
 *  - 'full'     → activate
 *
 * Below the module, `data.screen` is the menu key of the screen. When the organisation was not given that one screen the same prompt is
 * shown (naming the screen), so a direct URL cannot open what the menu hides. UX only: the server refuses the calls regardless.
 */
export const subscriptionGateGuard: CanActivateFn = async (route) => {
  // Everything is injected BEFORE the first await: inject() only works in the injection context, which an async function loses once it awaits.
  const auth = inject(AuthService);
  const access = inject(AccessService);
  const router = inject(Router);

  await auth.ready();

  const { feature, screen } = route.data as RouteAccessData;
  if (feature === undefined) return true;

  if (auth.accessModeFor(feature) === 'locked') return router.createUrlTree(['/upgrade'], { queryParams: { feature } });
  if (screen !== undefined && !access.screenAllowed(screen)) return router.createUrlTree(['/upgrade'], { queryParams: { feature, screen } });
  return true;
};
