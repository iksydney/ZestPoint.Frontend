import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SCREEN_PERMISSIONS } from '../models/rbac.model';
import { AuthService } from '../services/auth.service';

/**
 * Sends a company administrator who has not published a theme yet to the onboarding wizard, so first sign-in always lands
 * on setup. Staff without company-settings access are never redirected. The backend does not depend on this redirect.
 */
export const onboardingGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.ready();

  const progress = auth.onboarding();
  const brandingDone = progress?.steps.find((s) => s.step === 'Branding')?.completed ?? true;
  const canSetUp = auth.hasPermission(SCREEN_PERMISSIONS.SETTINGS_COMPANY_MANAGE);

  return !brandingDone && canSetUp ? router.createUrlTree(['/onboarding']) : true;
};
