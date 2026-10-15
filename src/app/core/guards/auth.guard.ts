import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Waits for the session restore (refresh cookie) before deciding, so a page reload does not bounce a signed-in user. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.ready();
  return auth.isAuthenticated() ? true : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Keeps signed-in users out of the sign-in and registration screens. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.ready();
  return auth.isAuthenticated() ? router.createUrlTree(['/app']) : true;
};
