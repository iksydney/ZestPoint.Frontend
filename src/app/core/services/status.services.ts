import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiEnvelope } from '../models/api.model';
import { IncidentUpdateRequest, OpenIncidentRequest, PublicStatusDto, StatusIncidentDto, StatusSummaryDto } from '../models/status.model';
import { unwrap } from './api.util';

/** The public status page's data. Anonymous: it carries nothing about any company. */
@Injectable({ providedIn: 'root' })
export class StatusApi {
  private readonly http = inject(HttpClient);

  status(): Observable<PublicStatusDto> {
    return this.http.get<ApiEnvelope<PublicStatusDto>>('/api/v1/public/status').pipe(unwrap());
  }

  /** Light: is an incident open. The banner inside the application asks this. */
  summary(): Observable<StatusSummaryDto> {
    return this.http.get<ApiEnvelope<StatusSummaryDto>>('/api/v1/public/status/summary').pipe(unwrap());
  }
}

/** The operator console's side: what the checks say, and posting, updating and resolving incidents. */
@Injectable({ providedIn: 'root' })
export class PlatformStatusApi {
  private readonly http = inject(HttpClient);

  overview(): Observable<PublicStatusDto> {
    return this.http.get<ApiEnvelope<PublicStatusDto>>('/api/v1/platform/status').pipe(unwrap());
  }

  incidents(): Observable<StatusIncidentDto[]> {
    return this.http.get<ApiEnvelope<StatusIncidentDto[]>>('/api/v1/platform/status/incidents').pipe(unwrap());
  }

  open(body: OpenIncidentRequest): Observable<StatusIncidentDto> {
    return this.http.post<ApiEnvelope<StatusIncidentDto>>('/api/v1/platform/status/incidents', body).pipe(unwrap());
  }

  update(id: string, body: IncidentUpdateRequest): Observable<StatusIncidentDto> {
    return this.http.post<ApiEnvelope<StatusIncidentDto>>(`/api/v1/platform/status/incidents/${id}/updates`, body).pipe(unwrap());
  }
}
