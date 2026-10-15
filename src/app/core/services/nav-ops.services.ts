import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiEnvelope } from '../models/api.model';
import {
  AdjustmentDto, AdjustmentReasonDto, AdjustmentStatus, BulkChangeResultDto, BulkStockChangeRequest, CashMovementRequest, CloseShiftRequest, CreateAdjustmentRequest,
  CreateStockTakeRequest, ItemAliasDto, LabelRequest, LabelSheetDto, OpenShiftRequest, RecordCountsRequest, RecordSupplierPaymentRequest, RegisterSerialsRequest,
  ReportDto, ReportQuery, ReviewShiftRequest, SaveAdjustmentReasonRequest, SaveItemAliasRequest, SaveStockGroupRequest, SerialStatusRequest, ShiftDto, ShiftStatus,
  StockGroupDto, StockTakeDto, StockTakeStatus, SupplierBalanceDto, SupplierPaymentDto
} from '../models/nav-ops.model';
import { PagedResult } from '../models/ops.model';
import { unwrap } from './api.util';

const q = (filter: object): HttpParams => {
  let params = new HttpParams();
  for (const [k, v] of Object.entries(filter)) if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
  return params;
};

/** Start / End of Day. Every call is authorised by the server (permission, branch, module); the UI only shapes what is shown. */
@Injectable({ providedIn: 'root' })
export class ShiftApi {
  private readonly http = inject(HttpClient);

  current(): Observable<ShiftDto | null> {
    return this.http.get<ApiEnvelope<ShiftDto | null>>('/api/v1/pos/shifts/current').pipe(unwrap());
  }

  list(filter: { branchId?: string; status?: ShiftStatus; from?: string; to?: string; page?: number; pageSize?: number }): Observable<PagedResult<ShiftDto>> {
    return this.http.get<ApiEnvelope<PagedResult<ShiftDto>>>('/api/v1/pos/shifts', { params: q(filter) }).pipe(unwrap());
  }

  get(id: string): Observable<ShiftDto> {
    return this.http.get<ApiEnvelope<ShiftDto>>(`/api/v1/pos/shifts/${id}`).pipe(unwrap());
  }

  open(body: OpenShiftRequest): Observable<ShiftDto> {
    return this.http.post<ApiEnvelope<ShiftDto>>('/api/v1/pos/shifts/open', body).pipe(unwrap());
  }

  cashMovement(id: string, body: CashMovementRequest): Observable<ShiftDto> {
    return this.http.post<ApiEnvelope<ShiftDto>>(`/api/v1/pos/shifts/${id}/cash-movements`, body).pipe(unwrap());
  }

  close(id: string, body: CloseShiftRequest): Observable<ShiftDto> {
    return this.http.post<ApiEnvelope<ShiftDto>>(`/api/v1/pos/shifts/${id}/close`, body).pipe(unwrap());
  }

  review(id: string, body: ReviewShiftRequest): Observable<ShiftDto> {
    return this.http.post<ApiEnvelope<ShiftDto>>(`/api/v1/pos/shifts/${id}/review`, body).pipe(unwrap());
  }
}

/** One client for every report: the path decides which report, the query is validated and scoped by the server. */
@Injectable({ providedIn: 'root' })
export class ReportApi {
  private readonly http = inject(HttpClient);

  run(path: string, query: ReportQuery): Observable<ReportDto> {
    return this.http.get<ApiEnvelope<ReportDto>>(`/api/v1/${path}`, { params: q(query) }).pipe(unwrap());
  }

  /** The same report as CSV, with the same filters. Needs the separate export permission. */
  exportCsv(path: string, query: ReportQuery): Observable<Blob> {
    return this.http.get(`/api/v1/${path}`, { params: q({ ...query, format: 'csv', page: undefined, pageSize: undefined }), responseType: 'blob' });
  }
}

@Injectable({ providedIn: 'root' })
export class StockGroupApi {
  private readonly http = inject(HttpClient);

  list(includeInactive = false): Observable<StockGroupDto[]> {
    return this.http.get<ApiEnvelope<StockGroupDto[]>>('/api/v1/inventory/groups', { params: q({ includeInactive }) }).pipe(unwrap());
  }

  save(id: string | null, body: SaveStockGroupRequest): Observable<StockGroupDto> {
    return id
      ? this.http.put<ApiEnvelope<StockGroupDto>>(`/api/v1/inventory/groups/${id}`, body).pipe(unwrap())
      : this.http.post<ApiEnvelope<StockGroupDto>>('/api/v1/inventory/groups', body).pipe(unwrap());
  }

  remove(id: string): Observable<boolean> {
    return this.http.delete<ApiEnvelope<boolean>>(`/api/v1/inventory/groups/${id}`).pipe(unwrap());
  }

  reassign(id: string, targetGroupId: string): Observable<StockGroupDto> {
    return this.http.post<ApiEnvelope<StockGroupDto>>(`/api/v1/inventory/groups/${id}/reassign`, { targetGroupId }).pipe(unwrap());
  }
}

@Injectable({ providedIn: 'root' })
export class AdjustmentApi {
  private readonly http = inject(HttpClient);

  reasons(includeInactive = false): Observable<AdjustmentReasonDto[]> {
    return this.http.get<ApiEnvelope<AdjustmentReasonDto[]>>('/api/v1/inventory/adjustment-reasons', { params: q({ includeInactive }) }).pipe(unwrap());
  }

  saveReason(id: string | null, body: SaveAdjustmentReasonRequest): Observable<AdjustmentReasonDto> {
    return id
      ? this.http.put<ApiEnvelope<AdjustmentReasonDto>>(`/api/v1/inventory/adjustment-reasons/${id}`, body).pipe(unwrap())
      : this.http.post<ApiEnvelope<AdjustmentReasonDto>>('/api/v1/inventory/adjustment-reasons', body).pipe(unwrap());
  }

  list(filter: { branchId?: string; status?: AdjustmentStatus; itemId?: string; page?: number; pageSize?: number }): Observable<PagedResult<AdjustmentDto>> {
    return this.http.get<ApiEnvelope<PagedResult<AdjustmentDto>>>('/api/v1/inventory/adjustment-requests', { params: q(filter) }).pipe(unwrap());
  }

  request(body: CreateAdjustmentRequest): Observable<AdjustmentDto> {
    return this.http.post<ApiEnvelope<AdjustmentDto>>('/api/v1/inventory/adjustment-requests', body).pipe(unwrap());
  }

  decide(id: string, approve: boolean, note: string | null): Observable<AdjustmentDto> {
    return this.http.post<ApiEnvelope<AdjustmentDto>>(`/api/v1/inventory/adjustment-requests/${id}/decision`, { approve, note }).pipe(unwrap());
  }

  cancel(id: string): Observable<AdjustmentDto> {
    return this.http.post<ApiEnvelope<AdjustmentDto>>(`/api/v1/inventory/adjustment-requests/${id}/cancel`, null).pipe(unwrap());
  }
}

@Injectable({ providedIn: 'root' })
export class StockTakeApi {
  private readonly http = inject(HttpClient);

  list(filter: { branchId?: string; status?: StockTakeStatus; page?: number; pageSize?: number }): Observable<PagedResult<StockTakeDto>> {
    return this.http.get<ApiEnvelope<PagedResult<StockTakeDto>>>('/api/v1/inventory/stock-takes', { params: q(filter) }).pipe(unwrap());
  }

  get(id: string): Observable<StockTakeDto> {
    return this.http.get<ApiEnvelope<StockTakeDto>>(`/api/v1/inventory/stock-takes/${id}`).pipe(unwrap());
  }

  create(body: CreateStockTakeRequest): Observable<StockTakeDto> {
    return this.http.post<ApiEnvelope<StockTakeDto>>('/api/v1/inventory/stock-takes', body).pipe(unwrap());
  }

  action(id: string, action: 'start' | 'submit' | 'reconcile' | 'cancel'): Observable<StockTakeDto> {
    return this.http.post<ApiEnvelope<StockTakeDto>>(`/api/v1/inventory/stock-takes/${id}/${action}`, null).pipe(unwrap());
  }

  counts(id: string, body: RecordCountsRequest): Observable<StockTakeDto> {
    return this.http.post<ApiEnvelope<StockTakeDto>>(`/api/v1/inventory/stock-takes/${id}/counts`, body).pipe(unwrap());
  }

  decide(id: string, approve: boolean, note: string | null): Observable<StockTakeDto> {
    return this.http.post<ApiEnvelope<StockTakeDto>>(`/api/v1/inventory/stock-takes/${id}/decision`, { approve, note }).pipe(unwrap());
  }
}

@Injectable({ providedIn: 'root' })
export class GlobalStockApi {
  private readonly http = inject(HttpClient);

  preview(body: BulkStockChangeRequest): Observable<BulkChangeResultDto> {
    return this.http.post<ApiEnvelope<BulkChangeResultDto>>('/api/v1/inventory/global-maintenance/preview', body).pipe(unwrap());
  }

  apply(body: BulkStockChangeRequest): Observable<BulkChangeResultDto> {
    return this.http.post<ApiEnvelope<BulkChangeResultDto>>('/api/v1/inventory/global-maintenance/apply', body).pipe(unwrap());
  }
}

/** Serial numbers, other part numbers for an item, and label data. */
@Injectable({ providedIn: 'root' })
export class StockExtrasApi {
  private readonly http = inject(HttpClient);

  registerSerials(body: RegisterSerialsRequest): Observable<unknown[]> {
    return this.http.post<ApiEnvelope<unknown[]>>('/api/v1/inventory/serials', body).pipe(unwrap());
  }

  serialStatus(id: string, body: SerialStatusRequest): Observable<unknown> {
    return this.http.put<ApiEnvelope<unknown>>(`/api/v1/inventory/serials/${id}/status`, body).pipe(unwrap());
  }

  aliases(itemId: string): Observable<ItemAliasDto[]> {
    return this.http.get<ApiEnvelope<ItemAliasDto[]>>(`/api/v1/inventory/items/${itemId}/aliases`).pipe(unwrap());
  }

  addAlias(itemId: string, body: SaveItemAliasRequest): Observable<ItemAliasDto> {
    return this.http.post<ApiEnvelope<ItemAliasDto>>(`/api/v1/inventory/items/${itemId}/aliases`, body).pipe(unwrap());
  }

  removeAlias(itemId: string, aliasId: string): Observable<boolean> {
    return this.http.delete<ApiEnvelope<boolean>>(`/api/v1/inventory/items/${itemId}/aliases/${aliasId}`).pipe(unwrap());
  }

  labels(body: LabelRequest): Observable<LabelSheetDto> {
    return this.http.post<ApiEnvelope<LabelSheetDto>>('/api/v1/inventory/labels', body).pipe(unwrap());
  }
}

@Injectable({ providedIn: 'root' })
export class PurchasingApi {
  private readonly http = inject(HttpClient);

  payments(filter: { supplierId?: string; from?: string; to?: string; page?: number; pageSize?: number }): Observable<PagedResult<SupplierPaymentDto>> {
    return this.http.get<ApiEnvelope<PagedResult<SupplierPaymentDto>>>('/api/v1/purchasing/payments', { params: q(filter) }).pipe(unwrap());
  }

  balances(): Observable<SupplierBalanceDto[]> {
    return this.http.get<ApiEnvelope<SupplierBalanceDto[]>>('/api/v1/purchasing/balances').pipe(unwrap());
  }

  record(body: RecordSupplierPaymentRequest): Observable<SupplierPaymentDto> {
    return this.http.post<ApiEnvelope<SupplierPaymentDto>>('/api/v1/purchasing/payments', body).pipe(unwrap());
  }

  reverse(id: string, reason: string, idempotencyKey: string): Observable<SupplierPaymentDto> {
    return this.http.post<ApiEnvelope<SupplierPaymentDto>>(`/api/v1/purchasing/payments/${id}/reverse`, { reason, idempotencyKey }).pipe(unwrap());
  }
}
