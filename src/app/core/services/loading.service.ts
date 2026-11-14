import { HttpInterceptorFn } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';

/**
 * Calls the application makes by itself in the background (listening for bar orders, renewing the session, syncing the till, noting a
 * tour as seen). They never show the loading mark: nobody asked for them and they would make it flicker all day.
 */
const QUIET = ['/api/v1/auth/refresh', '/api/v1/bar-orders', '/api/v1/orders/bar-requests', '/api/v1/sync', '/api/v1/me/tours', '/api/v1/settings/operations', '/hubs/'];

/** How long something must take before the mark shows, so quick calls do not flash it. */
const SHOW_AFTER_MS = 350;

/**
 * Knows when the application is waiting for the server or for a screen to load, for the loading mark that carries the company's logo
 * (or its initials). The mark never blocks the screen: the person can keep working.
 */
@Injectable({ providedIn: 'root' })
export class LoadingService {
  private readonly pending = signal(0);
  private readonly shown = signal(false);
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly busy = computed(() => this.shown());

  begin(): void {
    this.pending.update((n) => n + 1);
    if (!this.shown() && this.timer === null) this.timer = setTimeout(() => { this.timer = null; if (this.pending() > 0) this.shown.set(true); }, SHOW_AFTER_MS);
  }

  end(): void {
    this.pending.update((n) => Math.max(0, n - 1));
    if (this.pending() > 0) return;
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    this.shown.set(false);
  }
}

export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.includes('/api/') || QUIET.some((q) => req.url.includes(q))) return next(req);
  const loading = inject(LoadingService);
  loading.begin();
  return next(req).pipe(finalize(() => loading.end()));
};
