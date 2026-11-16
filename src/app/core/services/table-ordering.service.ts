import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiEnvelope } from '../models/api.model';
import { PlaceTableOrderRequest, PublicTableMenuDto, PublicTableRequestDto, TableQrDto, TableRequestDto } from '../models/table-ordering.model';
import { unwrap } from './api.util';

/** Staff handling what customers send from their tables. Every call is authorised by the server (right, module, the person's branches). */
@Injectable({ providedIn: 'root' })
export class TableOrdersApi {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/orders/table-requests';

  /** What is waiting at a branch now: orders and calls not yet answered and not expired. */
  list(branchId: string): Observable<TableRequestDto[]> {
    return this.http.get<ApiEnvelope<TableRequestDto[]>>(this.base, { params: new HttpParams().set('branchId', branchId) }).pipe(unwrap());
  }

  /** Puts the items on the table's bill as lines to send; `quantities` changes or removes (0) what is accepted, `orderId` picks the bill when the table has several. */
  accept(id: string, body: { quantities?: Record<string, number>; orderId?: string | null }): Observable<TableRequestDto> {
    return this.http.post<ApiEnvelope<TableRequestDto>>(`${this.base}/${id}/accept`, body).pipe(unwrap());
  }

  decline(id: string, reason: string): Observable<TableRequestDto> {
    return this.http.post<ApiEnvelope<TableRequestDto>>(`${this.base}/${id}/decline`, { reason }).pipe(unwrap());
  }

  /** A call for a waiter or for the bill has been seen to. */
  done(id: string): Observable<TableRequestDto> {
    return this.http.post<ApiEnvelope<TableRequestDto>>(`${this.base}/${id}/done`, {}).pipe(unwrap());
  }

  /** The table's secret code, for printing its QR sticker. */
  qr(tableId: string): Observable<TableQrDto> {
    return this.http.get<ApiEnvelope<TableQrDto>>(`/api/v1/tables/${tableId}/qr`).pipe(unwrap());
  }

  newCode(tableId: string): Observable<unknown> {
    return this.http.post<ApiEnvelope<unknown>>(`/api/v1/tables/${tableId}/new-code`, {}).pipe(unwrap());
  }
}

/** What a customer's page asks for, with no sign-in: the table's code is the only way in. */
@Injectable({ providedIn: 'root' })
export class PublicTableApi {
  private readonly http = inject(HttpClient);
  private url(code: string, rest = ''): string { return `/api/v1/public/table/${encodeURIComponent(code)}${rest}`; }

  menu(code: string): Observable<PublicTableMenuDto> {
    return this.http.get<ApiEnvelope<PublicTableMenuDto>>(this.url(code)).pipe(unwrap());
  }

  order(code: string, body: PlaceTableOrderRequest): Observable<PublicTableRequestDto> {
    return this.http.post<ApiEnvelope<PublicTableRequestDto>>(this.url(code, '/orders'), body).pipe(unwrap());
  }

  call(code: string, kind: 'waiter' | 'bill', deviceId: string): Observable<PublicTableRequestDto> {
    return this.http.post<ApiEnvelope<PublicTableRequestDto>>(this.url(code, `/calls/${kind}`), { deviceId }).pipe(unwrap());
  }

  status(code: string, id: string, deviceId: string): Observable<PublicTableRequestDto> {
    return this.http.get<ApiEnvelope<PublicTableRequestDto>>(this.url(code, `/requests/${id}`), { params: new HttpParams().set('deviceId', deviceId) }).pipe(unwrap());
  }

  cancel(code: string, id: string, deviceId: string): Observable<PublicTableRequestDto> {
    return this.http.post<ApiEnvelope<PublicTableRequestDto>>(this.url(code, `/requests/${id}/cancel`), { deviceId }).pipe(unwrap());
  }

  pictureUrl(code: string, productId: string): string { return this.url(code, `/pictures/${productId}`); }
}
