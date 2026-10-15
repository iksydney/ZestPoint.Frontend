import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, firstValueFrom, tap } from 'rxjs';
import {
  AccessMode, ApiEnvelope, AuthSessionDto, BrandingDto, OnboardingProgressDto, PasswordLoginRequest, PinLoginRequest
} from '../models/api.model';
import { FeatureCode } from '../models/rbac.model';
import { toApiError, unwrap } from './api.util';

export const CSRF_HEADERS = { 'X-Requested-With': 'ZestPoint' } as const;

/**
 * Session, RBAC and entitlement state held in signals.
 *
 *  - The ACCESS token lives only in memory (never web storage), so a script injected into the page cannot read it.
 *  - The REFRESH token is an httpOnly cookie the browser sends to /api/v1/auth only; a reload calls restore() to trade it
 *    for a fresh access token.
 *  - Permissions and entitlements are a UX snapshot taken at sign-in/refresh. The API re-validates every request from
 *    live state, so a stale snapshot can only mislead the UI, never grant access.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly _session = signal<AuthSessionDto | null>(null);
  private readonly _token = signal<string | null>(null);
  private readonly _restored = signal(false);
  private restorePromise: Promise<void> | null = null;
  private refreshPromise: Promise<boolean> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  readonly session = this._session.asReadonly();
  readonly restored = this._restored.asReadonly();
  readonly isAuthenticated = computed(() => this._session() !== null);
  readonly token = this._token.asReadonly();
  readonly tenant = computed(() => this._session()?.tenant ?? null);
  readonly tenantId = computed(() => this._session()?.tenant.id ?? null);
  readonly membership = computed(() => this._session()?.membership ?? null);
  readonly branding = computed(() => this._session()?.branding ?? null);
  readonly onboarding = computed(() => this._session()?.onboarding ?? null);
  readonly subscription = computed(() => this._session()?.subscription ?? null);

  /** True while the whole workspace is locked except subscription and payment. */
  readonly locked = computed(() => this._session()?.subscription?.locked ?? false);
  private readonly permissionSet = computed(() => new Set(this._session()?.permissions ?? []));

  // ---- Sign-in / sign-out --------------------------------------------------------------------

  loginWithPassword(request: PasswordLoginRequest): Observable<AuthSessionDto> {
    return this.http.post<ApiEnvelope<AuthSessionDto>>('/api/v1/auth/login', request).pipe(unwrap(), tap((s) => this.adopt(s)));
  }

  loginWithPin(request: PinLoginRequest): Observable<AuthSessionDto> {
    return this.http.post<ApiEnvelope<AuthSessionDto>>('/api/v1/auth/pin-login', request).pipe(unwrap(), tap((s) => this.adopt(s)));
  }

  /** Called after registration, which signs the new owner in. */
  adopt(session: AuthSessionDto): void {
    this._session.set(session);
    this._token.set(session.accessToken);
    this.scheduleRefresh(session.accessTokenExpiresAtUtc);
  }

  async logout(navigate = true): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/v1/auth/logout', null, { headers: new HttpHeaders(CSRF_HEADERS) }));
    } catch {
      /* the local session is cleared regardless */
    }
    this.clear();
    if (navigate) await this.router.navigate(['/login']);
  }

  /** Drops local state without calling the server (the server already considers the session dead). */
  clear(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this._session.set(null);
    this._token.set(null);
  }

  // ---- Restore / refresh ---------------------------------------------------------------------

  /** Resolves once the first restore attempt (cookie -> access token) has finished. Guards await this. */
  ready(): Promise<void> {
    return (this.restorePromise ??= this.restore());
  }

  private async restore(): Promise<void> {
    try {
      await this.refresh();
    } finally {
      this._restored.set(true);
    }
  }

  /** Trades the refresh cookie for a new access token. Concurrent callers share one request. */
  refresh(): Promise<boolean> {
    return (this.refreshPromise ??= (async () => {
      try {
        const session = await firstValueFrom(
          this.http
            .post<ApiEnvelope<AuthSessionDto>>('/api/v1/auth/refresh', null, { headers: new HttpHeaders(CSRF_HEADERS) })
            .pipe(unwrap())
        );
        this.adopt(session);
        return true;
      } catch (err) {
        // No connection is not a sign-out: keep the signed-in session so the POS keeps working offline, and try again shortly.
        if (toApiError(err).status === 0 && this._session()) {
          if (this.refreshTimer) clearTimeout(this.refreshTimer);
          this.refreshTimer = setTimeout(() => void this.refresh(), 30_000);
          return false;
        }
        this.clear();
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })());
  }

  /** Re-reads permissions, entitlements, branding and onboarding without touching the tokens. */
  async reload(): Promise<void> {
    const fresh = await firstValueFrom(this.http.get<ApiEnvelope<AuthSessionDto>>('/api/v1/auth/me').pipe(unwrap()));
    const current = this._session();
    if (current) this._session.set({ ...fresh, accessToken: current.accessToken, accessTokenExpiresAtUtc: current.accessTokenExpiresAtUtc });
  }

  patchBranding(branding: BrandingDto): void {
    const s = this._session();
    if (s) this._session.set({ ...s, branding });
  }

  patchOnboarding(onboarding: OnboardingProgressDto): void {
    const s = this._session();
    if (s) this._session.set({ ...s, onboarding });
  }

  private scheduleRefresh(expiresAtUtc: string): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    const expires = Date.parse(expiresAtUtc);
    if (Number.isNaN(expires)) return;
    const delay = Math.max(15_000, expires - Date.now() - 60_000); // refresh a minute before expiry
    this.refreshTimer = setTimeout(() => void this.refresh(), Math.min(delay, 2 ** 31 - 1));
  }

  // ---- Authorisation snapshot (UX only) -------------------------------------------------------

  hasPermission(code: string): boolean {
    return this.permissionSet().has(code);
  }

  hasAnyPermission(codes: readonly string[]): boolean {
    return codes.some((c) => this.hasPermission(c));
  }

  accessModeFor(feature: FeatureCode): AccessMode {
    return this._session()?.entitlements[feature] ?? 'locked';
  }

  static messageFor(err: unknown): string {
    return toApiError(err).message;
  }
}
