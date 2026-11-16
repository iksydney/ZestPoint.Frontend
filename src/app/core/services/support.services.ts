import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiEnvelope } from '../models/api.model';
import {
  AssignTicketRequestDto, CreateOperatorRequest, CreateTicketRequest, CrmListItemDto, CrmNoteKind, CrmProfileDto, CrmStage, PagedResult, PlatformOperatorDto, PlatformTicketReplyRequest,
  PlatformUserAction, PlatformUserActionResultDto, PlatformUserListItemDto, MembershipStatus, ResponseReportDto, SaveCrmProfileRequest, SupportPromiseDto, SupportSummaryDto, TicketDetailDto, TicketListItemDto, TicketPriority,
  TicketReplyRequest, TicketStatus, UpdateOperatorRequest
} from '../models/support.model';
import { unwrap } from './api.util';

const q = (filter: object): HttpParams => {
  let params = new HttpParams();
  for (const [k, v] of Object.entries(filter)) if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
  return params;
};

/** A company's own support tickets (tenant-scoped; internal notes never arrive here). */
@Injectable({ providedIn: 'root' })
export class SupportApi {
  private readonly http = inject(HttpClient);

  list(filter: { status?: TicketStatus | ''; page?: number; pageSize?: number } = {}): Observable<PagedResult<TicketListItemDto>> {
    return this.http.get<ApiEnvelope<PagedResult<TicketListItemDto>>>('/api/v1/support/tickets', { params: q(filter) }).pipe(unwrap());
  }

  get(id: string): Observable<TicketDetailDto> {
    return this.http.get<ApiEnvelope<TicketDetailDto>>(`/api/v1/support/tickets/${id}`).pipe(unwrap());
  }

  create(body: CreateTicketRequest): Observable<TicketDetailDto> {
    return this.http.post<ApiEnvelope<TicketDetailDto>>('/api/v1/support/tickets', body).pipe(unwrap());
  }

  reply(id: string, body: TicketReplyRequest): Observable<TicketDetailDto> {
    return this.http.post<ApiEnvelope<TicketDetailDto>>(`/api/v1/support/tickets/${id}/replies`, body).pipe(unwrap());
  }

  close(id: string): Observable<TicketDetailDto> {
    return this.http.post<ApiEnvelope<TicketDetailDto>>(`/api/v1/support/tickets/${id}/close`, {}).pipe(unwrap());
  }

  /** What the company's plan promises about support, and its named contact when the plan has one. */
  promise(): Observable<SupportPromiseDto> {
    return this.http.get<ApiEnvelope<SupportPromiseDto>>('/api/v1/support/promise').pipe(unwrap());
  }
}

/** The operator side: tickets, customer records, people across companies and the operators themselves. */
@Injectable({ providedIn: 'root' })
export class PlatformSupportApi {
  private readonly http = inject(HttpClient);

  summary(): Observable<SupportSummaryDto> {
    return this.http.get<ApiEnvelope<SupportSummaryDto>>('/api/v1/platform/support/summary').pipe(unwrap());
  }

  /** How many first replies were on time, late or still late, for each plan and operator, in a month (yyyy-MM; the current month when blank). */
  responseReport(month?: string): Observable<ResponseReportDto> {
    return this.http.get<ApiEnvelope<ResponseReportDto>>('/api/v1/platform/support/response-report', { params: q({ month }) }).pipe(unwrap());
  }

  assignees(): Observable<PlatformOperatorDto[]> {
    return this.http.get<ApiEnvelope<PlatformOperatorDto[]>>('/api/v1/platform/support/assignees').pipe(unwrap());
  }

  tickets(filter: { search?: string; status?: TicketStatus | ''; priority?: TicketPriority | ''; assignee?: string; tenantId?: string; oldestFirst?: boolean; page?: number; pageSize?: number }): Observable<PagedResult<TicketListItemDto>> {
    return this.http.get<ApiEnvelope<PagedResult<TicketListItemDto>>>('/api/v1/platform/support/tickets', { params: q(filter) }).pipe(unwrap());
  }

  ticket(id: string): Observable<TicketDetailDto> {
    return this.http.get<ApiEnvelope<TicketDetailDto>>(`/api/v1/platform/support/tickets/${id}`).pipe(unwrap());
  }

  reply(id: string, body: PlatformTicketReplyRequest): Observable<TicketDetailDto> {
    return this.http.post<ApiEnvelope<TicketDetailDto>>(`/api/v1/platform/support/tickets/${id}/replies`, body).pipe(unwrap());
  }

  assign(id: string, body: AssignTicketRequestDto): Observable<TicketDetailDto> {
    return this.http.post<ApiEnvelope<TicketDetailDto>>(`/api/v1/platform/support/tickets/${id}/assign`, body).pipe(unwrap());
  }

  setStatus(id: string, status: TicketStatus, note: string | null): Observable<TicketDetailDto> {
    return this.http.post<ApiEnvelope<TicketDetailDto>>(`/api/v1/platform/support/tickets/${id}/status`, { status, note }).pipe(unwrap());
  }

  setPriority(id: string, priority: TicketPriority): Observable<TicketDetailDto> {
    return this.http.post<ApiEnvelope<TicketDetailDto>>(`/api/v1/platform/support/tickets/${id}/priority`, { priority }).pipe(unwrap());
  }

  // ---- CRM ----
  customers(filter: { search?: string; stage?: CrmStage | ''; ownerAdminId?: string; followUpDue?: boolean; page?: number; pageSize?: number }): Observable<PagedResult<CrmListItemDto>> {
    return this.http.get<ApiEnvelope<PagedResult<CrmListItemDto>>>('/api/v1/platform/crm/companies', { params: q(filter) }).pipe(unwrap());
  }

  customer(tenantId: string): Observable<CrmProfileDto> {
    return this.http.get<ApiEnvelope<CrmProfileDto>>(`/api/v1/platform/crm/companies/${tenantId}`).pipe(unwrap());
  }

  saveCustomer(tenantId: string, body: SaveCrmProfileRequest): Observable<CrmProfileDto> {
    return this.http.put<ApiEnvelope<CrmProfileDto>>(`/api/v1/platform/crm/companies/${tenantId}`, body).pipe(unwrap());
  }

  addNote(tenantId: string, kind: CrmNoteKind, body: string): Observable<CrmProfileDto> {
    return this.http.post<ApiEnvelope<CrmProfileDto>>(`/api/v1/platform/crm/companies/${tenantId}/notes`, { kind, body }).pipe(unwrap());
  }

  // ---- People across companies ----
  users(filter: { search?: string; tenantId?: string; status?: MembershipStatus | ''; page?: number; pageSize?: number }): Observable<PagedResult<PlatformUserListItemDto>> {
    return this.http.get<ApiEnvelope<PagedResult<PlatformUserListItemDto>>>('/api/v1/platform/users', { params: q(filter) }).pipe(unwrap());
  }

  userAction(membershipId: string, action: PlatformUserAction, reason: string): Observable<PlatformUserActionResultDto> {
    return this.http.post<ApiEnvelope<PlatformUserActionResultDto>>(`/api/v1/platform/users/${membershipId}/${action}`, { reason }).pipe(unwrap());
  }

  // ---- Operators ----
  operators(): Observable<PlatformOperatorDto[]> {
    return this.http.get<ApiEnvelope<PlatformOperatorDto[]>>('/api/v1/platform/operators').pipe(unwrap());
  }

  createOperator(body: CreateOperatorRequest): Observable<PlatformOperatorDto> {
    return this.http.post<ApiEnvelope<PlatformOperatorDto>>('/api/v1/platform/operators', body).pipe(unwrap());
  }

  updateOperator(id: string, body: UpdateOperatorRequest): Observable<PlatformOperatorDto> {
    return this.http.put<ApiEnvelope<PlatformOperatorDto>>(`/api/v1/platform/operators/${id}`, body).pipe(unwrap());
  }
}
