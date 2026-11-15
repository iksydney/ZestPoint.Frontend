import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiEnvelope } from '../models/api.model';
import { RiskAlertDto, RiskAlertState, RiskOutcome, RiskOverviewDto, RiskRuleDto, SaveRiskRuleRequest } from '../models/loss-prevention.model';
import { PagedResult } from '../models/subscription.model';
import { unwrap } from './api.util';

/** Loss prevention. Every call is authorised by the server (right, module and the person's own branches); the screen only shapes what is shown. */
@Injectable({ providedIn: 'root' })
export class LossPreventionApi {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/loss-prevention';

  overview(from: string, to: string, branchId: string): Observable<RiskOverviewDto> {
    let params = new HttpParams();
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);
    if (branchId) params = params.set('branchId', branchId);
    return this.http.get<ApiEnvelope<RiskOverviewDto>>(`${this.base}/overview`, { params }).pipe(unwrap());
  }

  alerts(filter: { state?: RiskAlertState | ''; ruleKey?: string; membershipId?: string; page?: number; pageSize?: number }): Observable<PagedResult<RiskAlertDto>> {
    let params = new HttpParams();
    if (filter.state) params = params.set('state', filter.state);
    if (filter.ruleKey) params = params.set('ruleKey', filter.ruleKey);
    if (filter.membershipId) params = params.set('membershipId', filter.membershipId);
    if (filter.page) params = params.set('page', filter.page);
    if (filter.pageSize) params = params.set('pageSize', filter.pageSize);
    return this.http.get<ApiEnvelope<PagedResult<RiskAlertDto>>>(`${this.base}/alerts`, { params }).pipe(unwrap());
  }

  review(id: string, outcome: RiskOutcome, note: string | null): Observable<RiskAlertDto> {
    return this.http.post<ApiEnvelope<RiskAlertDto>>(`${this.base}/alerts/${id}/review`, { outcome, note }).pipe(unwrap());
  }

  rules(): Observable<RiskRuleDto[]> {
    return this.http.get<ApiEnvelope<RiskRuleDto[]>>(`${this.base}/rules`).pipe(unwrap());
  }

  saveRule(key: string, body: SaveRiskRuleRequest): Observable<RiskRuleDto> {
    return this.http.put<ApiEnvelope<RiskRuleDto>>(`${this.base}/rules/${key}`, body).pipe(unwrap());
  }

  evaluate(): Observable<number> {
    return this.http.post<ApiEnvelope<number>>(`${this.base}/evaluate`, {}).pipe(unwrap());
  }
}
