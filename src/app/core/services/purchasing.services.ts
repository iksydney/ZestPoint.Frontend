import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiEnvelope } from '../models/api.model';
import type { PurchaseOrderStatus } from '../models/ops.model';
import {
  AnalyseDto, AnalyseRequest, BinDto, BinStockRowDto, ClaimSlipDto, DirectReceiveRequest, DiscrepancyRequest, EmailOrderResultDto, GoodsReceiptDto, ItemBinDefaultDto, MoveBetweenBinsRequest,
  PagedResult, PurchaseDocumentType, ReceiveWorkstationRequest, ReceivingManifestDto, ReceivingQueueDto, SaveBinRequest, SaveWorkstationOrderRequest, SupplierStandingDto, WorkstationListItemDto, WorkstationOrderDto
} from '../models/purchasing.model';
import { unwrap } from './api.util';

const q = (filter: object): HttpParams => {
  let params = new HttpParams();
  for (const [k, v] of Object.entries(filter)) if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
  return params;
};

/** Bin locations and stock per bin. */
@Injectable({ providedIn: 'root' })
export class BinApi {
  private readonly http = inject(HttpClient);

  list(filter: { branchId?: string; includeInactive?: boolean }): Observable<BinDto[]> {
    return this.http.get<ApiEnvelope<BinDto[]>>('/api/v1/inventory/bins', { params: q(filter) }).pipe(unwrap());
  }

  save(id: string | null, body: SaveBinRequest): Observable<BinDto> {
    return id
      ? this.http.put<ApiEnvelope<BinDto>>(`/api/v1/inventory/bins/${id}`, body).pipe(unwrap())
      : this.http.post<ApiEnvelope<BinDto>>('/api/v1/inventory/bins', body).pipe(unwrap());
  }

  stock(filter: { branchId: string; binId?: string; itemId?: string; search?: string }): Observable<BinStockRowDto[]> {
    return this.http.get<ApiEnvelope<BinStockRowDto[]>>('/api/v1/inventory/bins/stock', { params: q(filter) }).pipe(unwrap());
  }

  move(body: MoveBetweenBinsRequest): Observable<BinStockRowDto[]> {
    return this.http.post<ApiEnvelope<BinStockRowDto[]>>('/api/v1/inventory/bins/move', body).pipe(unwrap());
  }

  defaults(branchId: string): Observable<ItemBinDefaultDto[]> {
    return this.http.get<ApiEnvelope<ItemBinDefaultDto[]>>('/api/v1/inventory/bins/defaults', { params: q({ branchId }) }).pipe(unwrap());
  }

  setDefault(itemId: string, branchId: string, binId: string | null): Observable<ItemBinDefaultDto> {
    return this.http.put<ApiEnvelope<ItemBinDefaultDto>>(`/api/v1/inventory/bins/defaults/${itemId}`, { branchId, binId }).pipe(unwrap());
  }
}

/** The purchase-order workstation: orders, returns and transfers, from draft to approval. */
@Injectable({ providedIn: 'root' })
export class PurchasingWorkstationApi {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/purchasing';

  standing(supplierId: string): Observable<SupplierStandingDto> {
    return this.http.get<ApiEnvelope<SupplierStandingDto>>(`${this.base}/suppliers/${supplierId}/standing`).pipe(unwrap());
  }

  analyse(body: AnalyseRequest): Observable<AnalyseDto> {
    return this.http.post<ApiEnvelope<AnalyseDto>>(`${this.base}/analysis`, body).pipe(unwrap());
  }

  list(filter: { branchId?: string; status?: PurchaseOrderStatus | ''; type?: PurchaseDocumentType | ''; search?: string; page?: number; pageSize?: number }): Observable<PagedResult<WorkstationListItemDto>> {
    return this.http.get<ApiEnvelope<PagedResult<WorkstationListItemDto>>>(`${this.base}/orders`, { params: q(filter) }).pipe(unwrap());
  }

  get(id: string): Observable<WorkstationOrderDto> {
    return this.http.get<ApiEnvelope<WorkstationOrderDto>>(`${this.base}/orders/${id}`).pipe(unwrap());
  }

  save(id: string | null, body: SaveWorkstationOrderRequest): Observable<WorkstationOrderDto> {
    return id
      ? this.http.put<ApiEnvelope<WorkstationOrderDto>>(`${this.base}/orders/${id}`, body).pipe(unwrap())
      : this.http.post<ApiEnvelope<WorkstationOrderDto>>(`${this.base}/orders`, body).pipe(unwrap());
  }

  post(id: string, overLimitReason: string | null): Observable<WorkstationOrderDto> {
    return this.http.post<ApiEnvelope<WorkstationOrderDto>>(`${this.base}/orders/${id}/post`, { overLimitReason }).pipe(unwrap());
  }

  approve(id: string): Observable<WorkstationOrderDto> {
    return this.http.post<ApiEnvelope<WorkstationOrderDto>>(`${this.base}/orders/${id}/approve`, {}).pipe(unwrap());
  }

  reject(id: string, reason: string): Observable<WorkstationOrderDto> {
    return this.http.post<ApiEnvelope<WorkstationOrderDto>>(`${this.base}/orders/${id}/reject`, { reason }).pipe(unwrap());
  }

  cancel(id: string): Observable<WorkstationOrderDto> {
    return this.http.post<ApiEnvelope<WorkstationOrderDto>>(`${this.base}/orders/${id}/cancel`, {}).pipe(unwrap());
  }

  closeShort(id: string, reason: string): Observable<WorkstationOrderDto> {
    return this.http.post<ApiEnvelope<WorkstationOrderDto>>(`${this.base}/orders/${id}/close-short`, { reason }).pipe(unwrap());
  }

  /** Makes (once) the order's private web link and returns the order with it. */
  shareLink(id: string): Observable<WorkstationOrderDto> {
    return this.http.post<ApiEnvelope<WorkstationOrderDto>>(`${this.base}/orders/${id}/share-link`, {}).pipe(unwrap());
  }

  email(id: string): Observable<EmailOrderResultDto> {
    return this.http.post<ApiEnvelope<EmailOrderResultDto>>(`${this.base}/orders/${id}/email`, {}).pipe(unwrap());
  }
}

/** The dock: verify a delivery, hold lines for the second key, record problems. */
@Injectable({ providedIn: 'root' })
export class ReceivingApi {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/purchasing';

  queue(branchId?: string): Observable<ReceivingQueueDto> {
    return this.http.get<ApiEnvelope<ReceivingQueueDto>>(`${this.base}/receiving`, { params: q({ branchId }) }).pipe(unwrap());
  }

  manifest(orderId: string): Observable<ReceivingManifestDto> {
    return this.http.get<ApiEnvelope<ReceivingManifestDto>>(`${this.base}/orders/${orderId}/receiving`).pipe(unwrap());
  }

  receive(orderId: string, body: ReceiveWorkstationRequest): Observable<GoodsReceiptDto> {
    return this.http.post<ApiEnvelope<GoodsReceiptDto>>(`${this.base}/orders/${orderId}/receive`, body).pipe(unwrap());
  }

  direct(body: DirectReceiveRequest): Observable<GoodsReceiptDto> {
    return this.http.post<ApiEnvelope<GoodsReceiptDto>>(`${this.base}/direct-receipts`, body).pipe(unwrap());
  }

  receipt(id: string): Observable<GoodsReceiptDto> {
    return this.http.get<ApiEnvelope<GoodsReceiptDto>>(`${this.base}/receipts/${id}`).pipe(unwrap());
  }

  secondKey(id: string, confirm: boolean, note: string | null): Observable<GoodsReceiptDto> {
    return this.http.post<ApiEnvelope<GoodsReceiptDto>>(`${this.base}/receipts/${id}/second-key`, { confirm, note }).pipe(unwrap());
  }

  discrepancy(id: string, body: DiscrepancyRequest): Observable<GoodsReceiptDto> {
    return this.http.post<ApiEnvelope<GoodsReceiptDto>>(`${this.base}/receipts/${id}/discrepancies`, body).pipe(unwrap());
  }

  claim(id: string): Observable<ClaimSlipDto> {
    return this.http.post<ApiEnvelope<ClaimSlipDto>>(`${this.base}/receipts/${id}/claim`, {}).pipe(unwrap());
  }

  uploadPhoto(file: File): Observable<{ id: string }> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<ApiEnvelope<{ id: string }>>(`${this.base}/photos`, form).pipe(unwrap());
  }

  photo(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/photos/${id}`, { responseType: 'blob' });
  }
}
