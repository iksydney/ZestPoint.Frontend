import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, firstValueFrom, tap } from 'rxjs';
import { ApiEnvelope } from '../models/api.model';
import {
  BillingEventDto, EntitlementStateDto, FeatureModuleDto, LedgerEntryDto, ModeName, NotificationDto, PagedResult, PlanDto, PlatformOverviewDto,
  PlatformSessionDto, PlatformTenantDetailDto, PlatformTenantListItemDto, SavePlanRequest, SubscriptionDto, SubscriptionStatus
} from '../models/subscription.model';
import { unwrap } from './api.util';

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

/**
 * The platform operator's session. Separate from a company's sign-in: its own token (kept in memory only, so a reload signs the
 * operator out) which the interceptor attaches to /api/v1/platform calls and to nothing else.
 */
@Injectable({ providedIn: 'root' })
export class PlatformAuthService {
  private readonly http = inject(HttpClient);
  private readonly _session = signal<PlatformSessionDto | null>(null);

  readonly session = this._session.asReadonly();
  readonly isSignedIn = computed(() => this._session() !== null);
  readonly token = computed(() => this._session()?.accessToken ?? null);
  readonly permissions = computed(() => new Set(this._session()?.permissions ?? []));

  can(permission: string): boolean {
    return this.permissions().has(permission);
  }

  login(email: string, password: string): Observable<PlatformSessionDto> {
    return this.http.post<ApiEnvelope<PlatformSessionDto>>('/api/v1/platform/auth/login', { email, password }).pipe(unwrap(), tap((s) => this._session.set(s)));
  }

  logout(): void {
    this._session.set(null);
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

  setOverride(tenantId: string, featureKey: string, mode: ModeName, validUntilUtc: string | null, reason: string): Observable<EntitlementStateDto> {
    return this.http.put<ApiEnvelope<EntitlementStateDto>>(`/api/v1/platform/tenants/${tenantId}/overrides`, { featureKey, mode, validUntilUtc, reason }).pipe(unwrap());
  }

  clearOverride(tenantId: string, featureKey: string, reason: string): Observable<EntitlementStateDto> {
    return this.http.delete<ApiEnvelope<EntitlementStateDto>>(`/api/v1/platform/tenants/${tenantId}/overrides/${featureKey}`, { body: { reason } }).pipe(unwrap());
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
