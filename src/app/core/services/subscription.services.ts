import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, firstValueFrom, tap } from 'rxjs';
import {
  AccessCatalogDto, AccessGrantResultDto, AccessTreeDto, BulkAccessRequest, BulkAccessResultDto, ExpiringGrantDto, SetAccessRuleRequest
} from '../models/access.model';
import { ApiEnvelope } from '../models/api.model';
import {
  BillingEventDto, EntitlementStateDto, FeatureModuleDto, ItemDefault, LedgerEntryDto, ModeName, NotificationDto, PagedResult, PlanDto, PlatformOverviewDto,
  PlatformSessionDto, PlatformTenantDetailDto, PlatformTenantListItemDto, SavePlanRequest, SubscriptionDto, SubscriptionStatus
} from '../models/subscription.model';
import { toApiError, unwrap } from './api.util';
import { CSRF_HEADERS } from './auth.service';

const q = (filter: object): HttpParams => {
  let params = new HttpParams();
  for (const [k, v] of Object.entries(filter)) if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
  return params;
};

@Injectable({ providedIn: 'root' })
export class SubscriptionApi {
  private readonly http = inject(HttpClient);

  get(): Observable<SubscriptionDto> {
    return this.http.get<ApiEnvelope<SubscriptionDto>>('/api/v1/subscriptions').pipe(unwrap());
  }

  state(): Observable<EntitlementStateDto> {
    return this.http.get<ApiEnvelope<EntitlementStateDto>>('/api/v1/entitlements').pipe(unwrap());
  }

  plans(): Observable<PlanDto[]> {
    return this.http.get<ApiEnvelope<PlanDto[]>>('/api/v1/subscriptions/plans').pipe(unwrap());
  }

  modules(): Observable<FeatureModuleDto[]> {
    return this.http.get<ApiEnvelope<FeatureModuleDto[]>>('/api/v1/subscriptions/modules').pipe(unwrap());
  }

  billing(page = 1, pageSize = 25): Observable<PagedResult<BillingEventDto>> {
    return this.http.get<ApiEnvelope<PagedResult<BillingEventDto>>>('/api/v1/subscriptions/billing', { params: q({ page, pageSize }) }).pipe(unwrap());
  }

  ledger(page = 1, pageSize = 25): Observable<PagedResult<LedgerEntryDto>> {
    return this.http.get<ApiEnvelope<PagedResult<LedgerEntryDto>>>('/api/v1/subscriptions/ledger', { params: q({ page, pageSize }) }).pipe(unwrap());
  }

  changePlan(planCode: string): Observable<SubscriptionDto> {
    return this.http.post<ApiEnvelope<SubscriptionDto>>('/api/v1/subscriptions/change-plan', { planCode, idempotencyKey: `plan-${crypto.randomUUID()}` }).pipe(unwrap());
  }

  cancel(): Observable<SubscriptionDto> {
    return this.http.post<ApiEnvelope<SubscriptionDto>>('/api/v1/subscriptions/cancel', null).pipe(unwrap());
  }

  resume(): Observable<SubscriptionDto> {
    return this.http.post<ApiEnvelope<SubscriptionDto>>('/api/v1/subscriptions/resume', null).pipe(unwrap());
  }

  setPaymentMethod(token: string): Observable<SubscriptionDto> {
    return this.http.put<ApiEnvelope<SubscriptionDto>>('/api/v1/subscriptions/payment-method', { token }).pipe(unwrap());
  }

  payNow(): Observable<SubscriptionDto> {
    return this.http.post<ApiEnvelope<SubscriptionDto>>('/api/v1/subscriptions/pay', { idempotencyKey: `pay-${crypto.randomUUID()}` }).pipe(unwrap());
  }

  notifications(unreadOnly = false): Observable<NotificationDto[]> {
    return this.http.get<ApiEnvelope<NotificationDto[]>>('/api/v1/notifications', { params: q({ unreadOnly }) }).pipe(unwrap());
  }

  markRead(id: string): Observable<boolean> {
    return this.http.post<ApiEnvelope<boolean>>(`/api/v1/notifications/${id}/read`, null).pipe(unwrap());
  }

  markAllRead(): Observable<boolean> {
    return this.http.post<ApiEnvelope<boolean>>('/api/v1/notifications/read-all', null).pipe(unwrap());
  }
}

/** Tells the other tabs of this browser that the operator signed out, so none of them keeps working on a session that has just been ended. */
const SIGN_OUT_CHANNEL = 'zp-platform-signout';

/**
 * The platform operator's session. Separate from a company's sign-in: its own token which the interceptor attaches to /api/v1/platform
 * calls and to nothing else.
 *
 *  - The ACCESS token lives only in memory (never web storage).
 *  - The REFRESH token is an httpOnly cookie (`zp_prt`) the browser sends to /api/v1/platform/auth only, so a reload, a new tab or a
 *    browser restart calls restore() to trade it for a fresh access token, and the operator is not asked to sign in again.
 *  - Permissions are a UX snapshot taken at sign-in and at each refresh. The API checks every request from live state.
 */
@Injectable({ providedIn: 'root' })
export class PlatformAuthService {
  private readonly http = inject(HttpClient);
  private readonly _session = signal<PlatformSessionDto | null>(null);
  private restorePromise: Promise<void> | null = null;
  private refreshPromise: Promise<boolean> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private channel: BroadcastChannel | null = null;

  readonly session = this._session.asReadonly();
  readonly isSignedIn = computed(() => this._session() !== null);
  readonly token = computed(() => this._session()?.accessToken ?? null);
  readonly permissions = computed(() => new Set(this._session()?.permissions ?? []));

  constructor() {
    try {
      this.channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(SIGN_OUT_CHANNEL);
      // Another tab signed out: drop this tab's token too (the server already ended the session) and go to the sign-in.
      if (this.channel) this.channel.onmessage = () => { this.clear(); this.onRemoteSignOut?.(); };
    } catch {
      this.channel = null; // cross-tab sign-out is a convenience; the cookie is already gone, so a reload signs out regardless
    }
  }

  /** Set by the shell so a sign-out in another tab also moves this tab to the sign-in screen. */
  onRemoteSignOut: (() => void) | null = null;

  can(permission: string): boolean {
    return this.permissions().has(permission);
  }

  login(email: string, password: string): Observable<PlatformSessionDto> {
    return this.http.post<ApiEnvelope<PlatformSessionDto>>('/api/v1/platform/auth/login', { email, password }).pipe(unwrap(), tap((s) => this.adopt(s)));
  }

  /** Ends this operator's sign-in on this browser: the server revokes the session and removes the cookie, and every open tab is signed out. */
  async logout(): Promise<void> {
    const token = this.token();
    try {
      await firstValueFrom(this.http.post('/api/v1/platform/auth/logout', null, {
        headers: new HttpHeaders(token ? { ...CSRF_HEADERS, Authorization: `Bearer ${token}` } : { ...CSRF_HEADERS })
      }));
    } catch {
      /* the local session is cleared regardless; an unreachable server cannot be asked to forget it */
    }
    this.clear();
    try { this.channel?.postMessage('signed-out'); } catch { /* ignore */ }
  }

  /** Drops local state without calling the server (the server already considers the session dead). */
  clear(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this._session.set(null);
  }

  private adopt(session: PlatformSessionDto): void {
    this._session.set(session);
    this.scheduleRefresh(session.accessTokenExpiresAtUtc);
  }

  /** Resolves once the first restore attempt (cookie -> access token) has finished. The platform guards await this. */
  ready(): Promise<void> {
    return (this.restorePromise ??= this.restore());
  }

  private async restore(): Promise<void> {
    await this.refresh();
  }

  /** Trades the refresh cookie for a new access token. Concurrent callers share one request. */
  refresh(): Promise<boolean> {
    return (this.refreshPromise ??= (async () => {
      try {
        const session = await firstValueFrom(
          this.http.post<ApiEnvelope<PlatformSessionDto>>('/api/v1/platform/auth/refresh', null, { headers: new HttpHeaders(CSRF_HEADERS) }).pipe(unwrap())
        );
        this.adopt(session);
        return true;
      } catch (err) {
        // No connection is not a sign-out: keep what we have and try again shortly.
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

  private scheduleRefresh(expiresAtUtc: string): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    const expires = Date.parse(expiresAtUtc);
    if (Number.isNaN(expires)) return;
    const delay = Math.max(15_000, expires - Date.now() - 60_000); // a minute before the access token runs out
    this.refreshTimer = setTimeout(() => void this.refresh(), Math.min(delay, 2 ** 31 - 1));
  }
}

@Injectable({ providedIn: 'root' })
export class PlatformApi {
  private readonly http = inject(HttpClient);

  overview(): Observable<PlatformOverviewDto> {
    return this.http.get<ApiEnvelope<PlatformOverviewDto>>('/api/v1/platform/overview').pipe(unwrap());
  }

  tenants(filter: { search?: string; status?: SubscriptionStatus | ''; plan?: string; page?: number; pageSize?: number }): Observable<PagedResult<PlatformTenantListItemDto>> {
    return this.http.get<ApiEnvelope<PagedResult<PlatformTenantListItemDto>>>('/api/v1/platform/tenants', { params: q(filter) }).pipe(unwrap());
  }

  tenant(id: string): Observable<PlatformTenantDetailDto> {
    return this.http.get<ApiEnvelope<PlatformTenantDetailDto>>(`/api/v1/platform/tenants/${id}`).pipe(unwrap());
  }

  plans(): Observable<PlanDto[]> {
    return this.http.get<ApiEnvelope<PlanDto[]>>('/api/v1/platform/plans').pipe(unwrap());
  }

  savePlan(id: string | null, body: SavePlanRequest): Observable<PlanDto> {
    return id
      ? this.http.put<ApiEnvelope<PlanDto>>(`/api/v1/platform/plans/${id}`, body).pipe(unwrap())
      : this.http.post<ApiEnvelope<PlanDto>>('/api/v1/platform/plans', body).pipe(unwrap());
  }

  setPlan(tenantId: string, planCode: string, reason: string): Observable<SubscriptionDto> {
    return this.http.post<ApiEnvelope<SubscriptionDto>>(`/api/v1/platform/tenants/${tenantId}/plan`, { planCode, reason }).pipe(unwrap());
  }

  extend(tenantId: string, days: number, reason: string): Observable<SubscriptionDto> {
    return this.http.post<ApiEnvelope<SubscriptionDto>>(`/api/v1/platform/tenants/${tenantId}/extend`, { days, reason }).pipe(unwrap());
  }

  reconcile(tenantId: string, reason: string): Observable<SubscriptionDto> {
    return this.http.post<ApiEnvelope<SubscriptionDto>>(`/api/v1/platform/tenants/${tenantId}/reconcile`, { reason }).pipe(unwrap());
  }

  restrict(tenantId: string, reason: string): Observable<SubscriptionDto> {
    return this.http.post<ApiEnvelope<SubscriptionDto>>(`/api/v1/platform/tenants/${tenantId}/restrict`, { reason }).pipe(unwrap());
  }

  setOverride(tenantId: string, featureKey: string, mode: ModeName, validUntilUtc: string | null, reason: string, itemDefault: ItemDefault = 'All'): Observable<EntitlementStateDto> {
    return this.http.put<ApiEnvelope<EntitlementStateDto>>(`/api/v1/platform/tenants/${tenantId}/overrides`, { featureKey, mode, itemDefault, validUntilUtc, reason }).pipe(unwrap());
  }

  clearOverride(tenantId: string, featureKey: string, reason: string): Observable<EntitlementStateDto> {
    return this.http.delete<ApiEnvelope<EntitlementStateDto>>(`/api/v1/platform/tenants/${tenantId}/overrides/${featureKey}`, { body: { reason } }).pipe(unwrap());
  }

  // ---- Access below the plan: modules, screens, actions, one-click grants, bulk --------------------------------

  accessCatalog(): Observable<AccessCatalogDto> {
    return this.http.get<ApiEnvelope<AccessCatalogDto>>('/api/v1/platform/access/catalog').pipe(unwrap());
  }

  accessTree(tenantId: string, branchId: string | null = null): Observable<AccessTreeDto> {
    return this.http.get<ApiEnvelope<AccessTreeDto>>(`/api/v1/platform/tenants/${tenantId}/access`, { params: q({ branchId }) }).pipe(unwrap());
  }

  setAccessRule(tenantId: string, body: SetAccessRuleRequest): Observable<AccessTreeDto> {
    return this.http.put<ApiEnvelope<AccessTreeDto>>(`/api/v1/platform/tenants/${tenantId}/access/rules`, body).pipe(unwrap());
  }

  revokeAccessRule(tenantId: string, ruleId: string, reason: string): Observable<AccessTreeDto> {
    return this.http.delete<ApiEnvelope<AccessTreeDto>>(`/api/v1/platform/tenants/${tenantId}/access/rules/${ruleId}`, { body: { reason } }).pipe(unwrap());
  }

  grantModule(tenantId: string, moduleKey: string, validUntilUtc: string | null, reason: string): Observable<AccessGrantResultDto> {
    return this.http.post<ApiEnvelope<AccessGrantResultDto>>(`/api/v1/platform/tenants/${tenantId}/access/grant-module`, { moduleKey, validUntilUtc, reason }).pipe(unwrap());
  }

  revertModule(tenantId: string, moduleKey: string, reason: string): Observable<AccessGrantResultDto> {
    return this.http.post<ApiEnvelope<AccessGrantResultDto>>(`/api/v1/platform/tenants/${tenantId}/access/revert-module`, { moduleKey, reason }).pipe(unwrap());
  }

  grantApplication(tenantId: string, validUntilUtc: string, reason: string): Observable<AccessGrantResultDto> {
    return this.http.post<ApiEnvelope<AccessGrantResultDto>>(`/api/v1/platform/tenants/${tenantId}/access/grant-application`, { validUntilUtc, reason }).pipe(unwrap());
  }

  revertApplication(tenantId: string, reason: string): Observable<AccessGrantResultDto> {
    return this.http.post<ApiEnvelope<AccessGrantResultDto>>(`/api/v1/platform/tenants/${tenantId}/access/revert-application`, { reason }).pipe(unwrap());
  }

  bulkAccess(body: BulkAccessRequest): Observable<BulkAccessResultDto> {
    return this.http.post<ApiEnvelope<BulkAccessResultDto>>('/api/v1/platform/access/bulk', body).pipe(unwrap());
  }

  expiringGrants(days = 7): Observable<ExpiringGrantDto[]> {
    return this.http.get<ApiEnvelope<ExpiringGrantDto[]>>('/api/v1/platform/access/expiring', { params: q({ days }) }).pipe(unwrap());
  }
}

/** The company's own subscription state (banner, locked, per-module access), kept fresh after any billing action. */
@Injectable({ providedIn: 'root' })
export class SubscriptionStateService {
  private readonly api = inject(SubscriptionApi);
  private readonly _unread = signal(0);
  readonly unread = this._unread.asReadonly();

  async refreshUnread(): Promise<void> {
    try {
      this._unread.set((await firstValueFrom(this.api.notifications(true))).length);
    } catch { /* the badge is a convenience */ }
  }
}
