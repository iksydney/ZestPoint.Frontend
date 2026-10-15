import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

/**
 * Points relative `/api/...` calls at the configured API origin (src/environments/environment.ts, generated from .env.*).
 * Must be registered AFTER jwtInterceptor, which matches on the relative `/api/` prefix. Cookies (refresh token) are sent cross-origin.
 */
export const apiBaseUrlInterceptor: HttpInterceptorFn = (req, next) => {
  if (!environment.apiBaseUrl || !req.url.startsWith('/api/')) return next(req);
  return next(req.clone({ url: environment.apiBaseUrl + req.url.substring('/api'.length), withCredentials: true }));
};
