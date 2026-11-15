import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiEnvelope } from '../models/api.model';
import { PriceChangeDto, PriceListAssignmentRequest, PriceListDto, PriceMatrixDto, SavePriceListRequest, SetPricesRequest, SetPricesResultDto } from '../models/prices.model';
import { unwrap } from './api.util';

/** Prices and Menus (head office). Every call is authorised by the server (rights, module, branch); the screen only shapes what is shown. */
@Injectable({ providedIn: 'root' })
export class PricesApi {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/prices';

  matrix(filter: { search?: string; page?: number; pageSize?: number }): Observable<PriceMatrixDto> {
    let params = new HttpParams();
    if (filter.search) params = params.set('search', filter.search);
    if (filter.page) params = params.set('page', filter.page);
    if (filter.pageSize) params = params.set('pageSize', filter.pageSize);
    return this.http.get<ApiEnvelope<PriceMatrixDto>>(`${this.base}/matrix`, { params }).pipe(unwrap());
  }

  set(body: SetPricesRequest): Observable<SetPricesResultDto> {
    return this.http.post<ApiEnvelope<SetPricesResultDto>>(`${this.base}/set`, body).pipe(unwrap());
  }

  availability(branchId: string, productIds: string[], available: boolean, reason: string | null): Observable<number> {
    return this.http.post<ApiEnvelope<number>>(`${this.base}/availability`, { branchId, productIds, available, reason }).pipe(unwrap());
  }

  pending(): Observable<PriceChangeDto[]> {
    return this.http.get<ApiEnvelope<PriceChangeDto[]>>(`${this.base}/pending`).pipe(unwrap());
  }

  history(productId: string): Observable<PriceChangeDto[]> {
    return this.http.get<ApiEnvelope<PriceChangeDto[]>>(`${this.base}/history`, { params: new HttpParams().set('productId', productId) }).pipe(unwrap());
  }

  cancel(id: string): Observable<boolean> {
    return this.http.post<ApiEnvelope<boolean>>(`${this.base}/${id}/cancel`, {}).pipe(unwrap());
  }

  lists(): Observable<PriceListDto[]> {
    return this.http.get<ApiEnvelope<PriceListDto[]>>(`${this.base}/lists`).pipe(unwrap());
  }

  saveList(id: string | null, body: SavePriceListRequest): Observable<PriceListDto> {
    return id
      ? this.http.put<ApiEnvelope<PriceListDto>>(`${this.base}/lists/${id}`, body).pipe(unwrap())
      : this.http.post<ApiEnvelope<PriceListDto>>(`${this.base}/lists`, body).pipe(unwrap());
  }

  setListBranches(id: string, branches: PriceListAssignmentRequest[]): Observable<PriceListDto> {
    return this.http.put<ApiEnvelope<PriceListDto>>(`${this.base}/lists/${id}/branches`, { branches }).pipe(unwrap());
  }
}
