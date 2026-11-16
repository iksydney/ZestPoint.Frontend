import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiEnvelope, AuthSessionDto } from '../models/api.model';
import {
  AuditLogDto, BranchDto, CreateStaffRequest, InviteInfoDto, PagedResult, PermissionDto, RoleDto, SaveBranchRequest,
  SaveRoleRequest, SessionDto, StaffCreatedDto, StaffDetailDto, StaffListItemDto, UpdateStaffRequest
} from '../models/staff.model';
import { unwrap } from './api.util';

export interface StaffFilter {
  search?: string;
  status?: string;
  roleId?: string;
  branchId?: string;
  page?: number;
  pageSize?: number;
}

const toParams = (filter: object): HttpParams => {
  let params = new HttpParams();
  for (const [k, v] of Object.entries(filter)) if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
  return params;
};

@Injectable({ providedIn: 'root' })
export class StaffApiService {
  private readonly http = inject(HttpClient);

  list(filter: StaffFilter): Observable<PagedResult<StaffListItemDto>> {
    return this.http.get<ApiEnvelope<PagedResult<StaffListItemDto>>>('/api/v1/staff', { params: toParams(filter) }).pipe(unwrap());
  }

  get(id: string): Observable<StaffDetailDto> {
    return this.http.get<ApiEnvelope<StaffDetailDto>>(`/api/v1/staff/${id}`).pipe(unwrap());
  }

  create(request: CreateStaffRequest): Observable<StaffCreatedDto> {
    return this.http.post<ApiEnvelope<StaffCreatedDto>>('/api/v1/staff', request).pipe(unwrap());
  }

  update(id: string, request: UpdateStaffRequest): Observable<StaffDetailDto> {
    return this.http.put<ApiEnvelope<StaffDetailDto>>(`/api/v1/staff/${id}`, request).pipe(unwrap());
  }

  deactivate(id: string): Observable<StaffDetailDto> {
    return this.http.post<ApiEnvelope<StaffDetailDto>>(`/api/v1/staff/${id}/deactivate`, null).pipe(unwrap());
  }

  reactivate(id: string): Observable<StaffDetailDto> {
    return this.http.post<ApiEnvelope<StaffDetailDto>>(`/api/v1/staff/${id}/reactivate`, null).pipe(unwrap());
  }

  setPin(id: string, pin: string): Observable<StaffDetailDto> {
    return this.http.put<ApiEnvelope<StaffDetailDto>>(`/api/v1/staff/${id}/pin`, { pin }).pipe(unwrap());
  }

  setRfid(id: string, cardUid: string): Observable<StaffDetailDto> {
    return this.http.put<ApiEnvelope<StaffDetailDto>>(`/api/v1/staff/${id}/rfid`, { cardUid }).pipe(unwrap());
  }

  removeCredential(id: string, type: 'pin' | 'rfid'): Observable<StaffDetailDto> {
    return this.http.delete<ApiEnvelope<StaffDetailDto>>(`/api/v1/staff/${id}/credentials/${type}`).pipe(unwrap());
  }

  resendInvite(id: string): Observable<StaffCreatedDto> {
    return this.http.post<ApiEnvelope<StaffCreatedDto>>(`/api/v1/staff/${id}/invite`, null).pipe(unwrap());
  }

  sessions(id: string): Observable<SessionDto[]> {
    return this.http.get<ApiEnvelope<SessionDto[]>>(`/api/v1/staff/${id}/sessions`).pipe(unwrap());
  }

  revokeSessions(id: string): Observable<number> {
    return this.http.post<ApiEnvelope<number>>(`/api/v1/staff/${id}/sessions/revoke`, null).pipe(unwrap());
  }

  /** Signs out one session of a person: one phone, or one browser. */
  revokeSession(id: string, sessionId: string): Observable<boolean> {
    return this.http.post<ApiEnvelope<boolean>>(`/api/v1/staff/${id}/sessions/${sessionId}/revoke`, null).pipe(unwrap());
  }

  // Invitation acceptance is anonymous.
  invite(venue: string, token: string): Observable<InviteInfoDto> {
    return this.http.get<ApiEnvelope<InviteInfoDto>>('/api/v1/auth/invite', { params: toParams({ venue, token }) }).pipe(unwrap());
  }

  acceptInvite(body: { tenantSlug: string; token: string; password: string | null; pin: string | null; currentPin?: string | null }): Observable<AuthSessionDto> {
    return this.http.post<ApiEnvelope<AuthSessionDto>>('/api/v1/auth/accept-invite', body).pipe(unwrap());
  }
}

@Injectable({ providedIn: 'root' })
export class RolesApiService {
  private readonly http = inject(HttpClient);

  permissions(): Observable<PermissionDto[]> {
    return this.http.get<ApiEnvelope<PermissionDto[]>>('/api/v1/permissions').pipe(unwrap());
  }

  list(): Observable<RoleDto[]> {
    return this.http.get<ApiEnvelope<RoleDto[]>>('/api/v1/roles').pipe(unwrap());
  }

  create(request: SaveRoleRequest): Observable<RoleDto> {
    return this.http.post<ApiEnvelope<RoleDto>>('/api/v1/roles', request).pipe(unwrap());
  }

  update(id: string, request: SaveRoleRequest): Observable<RoleDto> {
    return this.http.put<ApiEnvelope<RoleDto>>(`/api/v1/roles/${id}`, request).pipe(unwrap());
  }

  duplicate(id: string): Observable<RoleDto> {
    return this.http.post<ApiEnvelope<RoleDto>>(`/api/v1/roles/${id}/duplicate`, null).pipe(unwrap());
  }

  delete(id: string): Observable<boolean> {
    return this.http.delete<ApiEnvelope<boolean>>(`/api/v1/roles/${id}`).pipe(unwrap());
  }
}

@Injectable({ providedIn: 'root' })
export class BranchesApiService {
  private readonly http = inject(HttpClient);

  list(): Observable<BranchDto[]> {
    return this.http.get<ApiEnvelope<BranchDto[]>>('/api/v1/branches').pipe(unwrap());
  }

  create(request: SaveBranchRequest): Observable<BranchDto> {
    return this.http.post<ApiEnvelope<BranchDto>>('/api/v1/branches', request).pipe(unwrap());
  }

  update(id: string, request: SaveBranchRequest): Observable<BranchDto> {
    return this.http.put<ApiEnvelope<BranchDto>>(`/api/v1/branches/${id}`, request).pipe(unwrap());
  }
}

@Injectable({ providedIn: 'root' })
export class AuditApiService {
  private readonly http = inject(HttpClient);

  list(filter: { action?: string; actor?: string; from?: string; to?: string; search?: string; entityType?: string; page?: number; pageSize?: number }): Observable<PagedResult<AuditLogDto>> {
    return this.http.get<ApiEnvelope<PagedResult<AuditLogDto>>>('/api/v1/audit', { params: toParams(filter) }).pipe(unwrap());
  }
}
