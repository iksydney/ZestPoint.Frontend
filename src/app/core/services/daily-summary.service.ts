import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiEnvelope } from '../models/api.model';
import { DailySummaryDto, DailySummaryHeadDto, DailySummarySettingsDto, SaveSummaryRecipientRequest, SummaryRecipientDto } from '../models/daily-summary.model';
import { MessageLogDto } from '../models/messaging.model';
import { unwrap } from './api.util';

/** The daily summary. Every call is authorised by the server (right, module and the person's own branches); the screens only shape what is shown. */
@Injectable({ providedIn: 'root' })
export class DailySummaryApi {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/daily-summary';
  private readonly setup = '/api/v1/daily-summary-setup';

  list(branchId: string | null, days = 30): Observable<DailySummaryHeadDto[]> {
    let params = new HttpParams().set('days', days);
    if (branchId) params = params.set('branchId', branchId);
    return this.http.get<ApiEnvelope<DailySummaryHeadDto[]>>(this.base, { params }).pipe(unwrap());
  }

  get(date: string, branchId: string | null): Observable<DailySummaryDto> {
    const params = branchId ? new HttpParams().set('branchId', branchId) : undefined;
    return this.http.get<ApiEnvelope<DailySummaryDto>>(`${this.base}/${date}`, { params }).pipe(unwrap());
  }

  sendToMe(date: string): Observable<MessageLogDto[]> {
    return this.http.post<ApiEnvelope<MessageLogDto[]>>(`${this.base}/${date}/send-to-me`, {}).pipe(unwrap());
  }

  settings(): Observable<DailySummarySettingsDto> {
    return this.http.get<ApiEnvelope<DailySummarySettingsDto>>(this.setup).pipe(unwrap());
  }

  saveSettings(enabled: boolean, sendAtMinute: number): Observable<DailySummarySettingsDto> {
    return this.http.put<ApiEnvelope<DailySummarySettingsDto>>(this.setup, { enabled, sendAtMinute }).pipe(unwrap());
  }

  saveRecipient(id: string | null, body: SaveSummaryRecipientRequest): Observable<SummaryRecipientDto> {
    return id
      ? this.http.put<ApiEnvelope<SummaryRecipientDto>>(`${this.setup}/recipients/${id}`, body).pipe(unwrap())
      : this.http.post<ApiEnvelope<SummaryRecipientDto>>(`${this.setup}/recipients`, body).pipe(unwrap());
  }

  removeRecipient(id: string): Observable<boolean> {
    return this.http.delete<ApiEnvelope<boolean>>(`${this.setup}/recipients/${id}`).pipe(unwrap());
  }

  build(date: string): Observable<DailySummaryDto> {
    return this.http.post<ApiEnvelope<DailySummaryDto>>(`${this.setup}/build/${date}`, {}).pipe(unwrap());
  }
}
