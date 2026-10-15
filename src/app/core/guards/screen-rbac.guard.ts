import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { RouteAccessData } from '../models/rbac.model';
import { AuthService } from '../services/auth.service';

/**
 * Screen-level RBAC guard. Reads `data.permission` from the route:
 *   { path: 'pos', data: { permission: 'pos.view' } }
 * An array means "any of". Routes with no `permission` are allowed (auth is handled by authGuard).
 * Denied users are redirected to /forbidden. This is UX only: the API enforces the same rule independently.
 */
export const screenRbacGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.ready(); // guards on one route may run side by side: never judge permissions before the session is restored

  const required = (route.data as RouteAccessData).permission;
  if (required === undefined) return true;

  const codes: readonly string[] = Array.isArray(required) ? required : [required as string];
  return auth.hasAnyPermission(codes) ? true : router.createUrlTree(['/forbidden']);
};

export const screenRbacChildGuard: CanActivateChildFn = (childRoute, state) => screenRbacGuard(childRoute, state);
