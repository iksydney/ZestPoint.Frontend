import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AccessService } from '../services/access.service';
import { AuthService } from '../services/auth.service';
import { PlatformAuthService } from '../services/subscription.services';

/** Endpoints that never carry (or need) a bearer token, and whose 401 must not trigger a refresh. */
const ANONYMOUS = ['/api/v1/auth/login', '/api/v1/auth/pin-login', '/api/v1/auth/refresh', '/api/v1/registration', '/api/v1/public/'];

const isApi = (url: string) => url.startsWith('/api/');
const isAnonymous = (url: string) => ANONYMOUS.some((p) => url.startsWith(p));

/**
 * Attaches the in-memory access token to API calls. On a 401 it makes ONE attempt to refresh the session (the httpOnly
 * cookie) and replays the request; if that fails the session is cleared and the user is sent to sign in.
 */
export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // The platform operator has a session of their own: their token goes to /api/v1/platform and nowhere else, and a company's token never does.
  if (req.url.startsWith('/api/v1/platform')) {
    if (req.url.startsWith('/api/v1/platform/auth/')) return next(req);
    const platform = inject(PlatformAuthService);
    const withPlatformToken = (request: HttpRequest<unknown>) => {
      const token = platform.token();
      return token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;
    };
    return next(withPlatformToken(req)).pipe(
      catchError((err: unknown) => {
        if (!(err instanceof HttpErrorResponse) || err.status !== 401) return throwError(() => err);
        // The access token ran out (or the operator was switched off): ONE attempt to restore it from the cookie and replay, else back to sign-in.
        return from(platform.refresh()).pipe(
          switchMap((ok) => {
            if (ok) return next(withPlatformToken(req));
            platform.clear();
            void router.navigate(['/platform/login']);
            return throwError(() => err);
          })
        );
      })
    );
  }

  if (!isApi(req.url) || isAnonymous(req.url)) return next(req);

  const access = inject(AccessService);
  const withToken = (request: HttpRequest<unknown>, token: string | null) =>
    token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;

  return next(withToken(req, auth.token())).pipe(
    catchError((err: unknown) => {
      // The server refused because the organisation was not given this (code `not_entitled`): the access snapshot is stale, so re-read it
      // and the menu and buttons correct themselves. The error still reaches the screen, which shows the server's plain message.
      if (err instanceof HttpErrorResponse && err.status === 403 && (err.error as { code?: string } | null)?.code === 'not_entitled') access.noteRefusal();
      if (!(err instanceof HttpErrorResponse) || err.status !== 401) return throwError(() => err);

      return from(auth.refresh()).pipe(
        switchMap((ok) => {
          if (ok) return next(withToken(req, auth.token()));
          auth.clear();
          void router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
          return throwError(() => err);
        })
      );
    })
  );
};
