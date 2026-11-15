import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiEnvelope } from '../models/api.model';
import { MessageChannel, MessageLogDto, MessageStatus, MessageUsageDto } from '../models/messaging.model';
import { PagedResult } from '../models/subscription.model';
import { unwrap } from './api.util';

/** The Messages screen. Every call is authorised by the server (right and module); the screen only shapes what is shown. */
@Injectable({ providedIn: 'root' })
export class MessagesApi {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/messages';

  list(filter: { channel?: MessageChannel | ''; status?: MessageStatus | ''; page?: number; pageSize?: number }): Observable<PagedResult<MessageLogDto>> {
    let params = new HttpParams();
    if (filter.channel) params = params.set('channel', filter.channel);
    if (filter.status) params = params.set('status', filter.status);
    if (filter.page) params = params.set('page', filter.page);
    if (filter.pageSize) params = params.set('pageSize', filter.pageSize);
    return this.http.get<ApiEnvelope<PagedResult<MessageLogDto>>>(this.base, { params }).pipe(unwrap());
  }

  usage(): Observable<MessageUsageDto> {
    return this.http.get<ApiEnvelope<MessageUsageDto>>(`${this.base}/usage`).pipe(unwrap());
  }

  test(channel: MessageChannel): Observable<MessageLogDto> {
    return this.http.post<ApiEnvelope<MessageLogDto>>(`${this.base}/test`, { channel }).pipe(unwrap());
  }

  retry(id: string): Observable<MessageLogDto> {
    return this.http.post<ApiEnvelope<MessageLogDto>>(`${this.base}/${id}/retry`, {}).pipe(unwrap());
  }
}
