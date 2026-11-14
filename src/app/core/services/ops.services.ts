import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiEnvelope } from '../models/api.model';
import {
  AddMeasurementRequest, AdjustStockRequest, AuditDto, BatchDto, CategoryDto, CompanySettingsDto, InventoryItemDto, MeasurementDto,
  MovementDto, OrderDto, OrderSummaryDto, PagedResult, PayRequest, ProductDto, PurchaseOrderDto, ReceiptDto, ReceiveGoodsRequest, RecipeDto,
  SaveInventoryItemRequest, SaveSellingUnitRequest, SellingUnitDto, PackageDto, SavePackageRequest, SavePurchaseOrderRequest, SaveProductRequest, SaveRecipeRequest, SaveSupplierRequest, SplitPreviewDto, SuggestedOrderDto,
  SupplierDto, SyncOperationDto, SyncOperationResultDto, TransferStockRequest, UpdateCompanySettingsRequest, UsageRowDto, VarianceDto,
  VarianceSummaryRowDto, VoidAuthorizer, VoidRequestDto
} from '../models/ops.model';
import { unwrap } from './api.util';

const q = (filter: object): HttpParams => {
  let params = new HttpParams();
  for (const [k, v] of Object.entries(filter)) if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
  return params;
};

@Injectable({ providedIn: 'root' })
export class OperationSettingsApi {
  private readonly http = inject(HttpClient);

  get(): Observable<CompanySettingsDto> {
    return this.http.get<ApiEnvelope<CompanySettingsDto>>('/api/v1/settings/operations').pipe(unwrap());
  }

  update(body: UpdateCompanySettingsRequest): Observable<CompanySettingsDto> {
    return this.http.put<ApiEnvelope<CompanySettingsDto>>('/api/v1/settings/operations', body).pipe(unwrap());
  }

  seedDemo(): Observable<string> {
    return this.http.post<ApiEnvelope<string>>('/api/v1/demo', null).pipe(unwrap());
  }

  clearDemo(): Observable<number> {
    return this.http.delete<ApiEnvelope<number>>('/api/v1/demo').pipe(unwrap());
  }
}

@Injectable({ providedIn: 'root' })
export class CatalogApi {
  private readonly http = inject(HttpClient);

  categories(): Observable<CategoryDto[]> {
    return this.http.get<ApiEnvelope<CategoryDto[]>>('/api/v1/catalog/categories').pipe(unwrap());
  }

  saveCategory(id: string | null, body: { name: string; sortOrder: number; isActive: boolean }): Observable<CategoryDto> {
    return id
      ? this.http.put<ApiEnvelope<CategoryDto>>(`/api/v1/catalog/categories/${id}`, body).pipe(unwrap())
      : this.http.post<ApiEnvelope<CategoryDto>>('/api/v1/catalog/categories', body).pipe(unwrap());
  }

  products(filter: { search?: string; categoryId?: string; branchId?: string; activeOnly?: boolean; favoritesOnly?: boolean; page?: number; pageSize?: number }): Observable<PagedResult<ProductDto>> {
    return this.http.get<ApiEnvelope<PagedResult<ProductDto>>>('/api/v1/catalog/products', { params: q(filter) }).pipe(unwrap());
  }

  byBarcode(barcode: string, branchId?: string): Observable<ProductDto> {
    return this.http.get<ApiEnvelope<ProductDto>>(`/api/v1/catalog/products/barcode/${encodeURIComponent(barcode)}`, { params: q({ branchId }) }).pipe(unwrap());
  }

  product(id: string): Observable<ProductDto> {
    return this.http.get<ApiEnvelope<ProductDto>>(`/api/v1/catalog/products/${id}`).pipe(unwrap());
  }

  saveProduct(id: string | null, body: SaveProductRequest): Observable<ProductDto> {
    return id
      ? this.http.put<ApiEnvelope<ProductDto>>(`/api/v1/catalog/products/${id}`, body).pipe(unwrap())
      : this.http.post<ApiEnvelope<ProductDto>>('/api/v1/catalog/products', body).pipe(unwrap());
  }

  archiveProduct(id: string): Observable<boolean> {
    return this.http.delete<ApiEnvelope<boolean>>(`/api/v1/catalog/products/${id}`).pipe(unwrap());
  }

  recipes(productId: string): Observable<RecipeDto[]> {
    return this.http.get<ApiEnvelope<RecipeDto[]>>(`/api/v1/catalog/products/${productId}/recipes`).pipe(unwrap());
  }

  saveRecipe(productId: string, body: SaveRecipeRequest): Observable<RecipeDto> {
    return this.http.put<ApiEnvelope<RecipeDto>>(`/api/v1/catalog/products/${productId}/recipe`, body).pipe(unwrap());
  }
}

@Injectable({ providedIn: 'root' })
export class OrdersApi {
  private readonly http = inject(HttpClient);

  list(filter: { branchId?: string; openOnly?: boolean; status?: string; ownerId?: string; search?: string; page?: number; pageSize?: number }): Observable<PagedResult<OrderSummaryDto>> {
    return this.http.get<ApiEnvelope<PagedResult<OrderSummaryDto>>>('/api/v1/orders', { params: q(filter) }).pipe(unwrap());
  }

  get(id: string): Observable<OrderDto> {
    return this.http.get<ApiEnvelope<OrderDto>>(`/api/v1/orders/${id}`).pipe(unwrap());
  }

  pay(id: string, body: PayRequest): Observable<OrderDto> {
    return this.http.post<ApiEnvelope<OrderDto>>(`/api/v1/orders/${id}/payments`, body).pipe(unwrap());
  }

  refund(id: string, paymentId: string, body: { amount: number; reason: string; idempotencyKey: string }): Observable<OrderDto> {
    return this.http.post<ApiEnvelope<OrderDto>>(`/api/v1/orders/${id}/payments/${paymentId}/refunds`, body).pipe(unwrap());
  }

  updateLine(id: string, lineId: string, quantity: number): Observable<OrderDto> {
    return this.http.put<ApiEnvelope<OrderDto>>(`/api/v1/orders/${id}/lines/${lineId}`, { quantity }).pipe(unwrap());
  }

  removeLine(id: string, lineId: string): Observable<OrderDto> {
    return this.http.delete<ApiEnvelope<OrderDto>>(`/api/v1/orders/${id}/lines/${lineId}`).pipe(unwrap());
  }

  /** The colleagues at a branch a bill can be handed over to. */
  handOverTargets(branchId: string): Observable<{ id: string; name: string }[]> {
    return this.http.get<ApiEnvelope<{ id: string; name: string }[]>>('/api/v1/orders/hand-over-targets', { params: q({ branchId }) }).pipe(unwrap());
  }

  /** Bar man method: a supervisor or administrator (their credentials in the body) allows payment before the bar has confirmed. */
  unlockPayment(id: string, authorizer: VoidAuthorizer): Observable<OrderDto> {
    return this.http.post<ApiEnvelope<OrderDto>>(`/api/v1/orders/${id}/payment-unlock`, authorizer).pipe(unwrap());
  }

  transfer(id: string, body: { tableLabel: string | null; newOwnerMembershipId: string | null }): Observable<OrderDto> {
    return this.http.post<ApiEnvelope<OrderDto>>(`/api/v1/orders/${id}/transfer`, body).pipe(unwrap());
  }

  split(id: string, body: { mode: 'Items' | 'Seat'; lineIds: string[]; seat: number | null; newOrderId: string }): Observable<OrderDto> {
    return this.http.post<ApiEnvelope<OrderDto>>(`/api/v1/orders/${id}/split`, body).pipe(unwrap());
  }

  merge(id: string, sourceOrderId: string): Observable<OrderDto> {
    return this.http.post<ApiEnvelope<OrderDto>>(`/api/v1/orders/${id}/merge`, { sourceOrderId }).pipe(unwrap());
  }

  splitPreview(id: string, parts: number): Observable<SplitPreviewDto> {
    return this.http.get<ApiEnvelope<SplitPreviewDto>>(`/api/v1/orders/${id}/split-preview`, { params: q({ parts }) }).pipe(unwrap());
  }

  /** Voids a sent item. Needs the network: the server checks the authoriser's credentials at that moment. */
  voidLine(id: string, lineId: string, body: { reason: string; wasted: boolean; authorizer: VoidAuthorizer }): Observable<OrderDto> {
    return this.http.post<ApiEnvelope<OrderDto>>(`/api/v1/orders/${id}/lines/${lineId}/void`, body).pipe(unwrap());
  }

  voidOrder(id: string, body: { reason: string; wasted: boolean; authorizer: VoidAuthorizer }): Observable<OrderDto> {
    return this.http.post<ApiEnvelope<OrderDto>>(`/api/v1/orders/${id}/void`, body).pipe(unwrap());
  }

  voidRequests(filter: { branchId?: string; status?: string }): Observable<import('../models/ops.model').VoidRequestDto[]> {
    return this.http.get<ApiEnvelope<VoidRequestDto[]>>('/api/v1/orders/void-requests', { params: q(filter) }).pipe(unwrap());
  }

  /** Decides a request left from before voids were authorised at the till; approving and rejecting both need the authoriser's credentials. */
  decideVoid(requestId: string, approve: boolean, note: string | null, authorizer: VoidAuthorizer): Observable<OrderDto> {
    return this.http.post<ApiEnvelope<OrderDto>>(`/api/v1/orders/void-requests/${requestId}/decision`, { approve, note, authorizer }).pipe(unwrap());
  }

  receipt(id: string): Observable<ReceiptDto> {
    return this.http.get<ApiEnvelope<ReceiptDto>>(`/api/v1/orders/${id}/receipt`).pipe(unwrap());
  }

  reprint(id: string): Observable<ReceiptDto> {
    return this.http.post<ApiEnvelope<ReceiptDto>>(`/api/v1/orders/${id}/receipt/reprint`, null).pipe(unwrap());
  }
}

@Injectable({ providedIn: 'root' })
export class SyncApi {
  private readonly http = inject(HttpClient);

  send(operations: SyncOperationDto[]): Observable<{ results: SyncOperationResultDto[] }> {
    return this.http.post<ApiEnvelope<{ results: SyncOperationResultDto[] }>>('/api/v1/sync', { operations }).pipe(unwrap());
  }
}

@Injectable({ providedIn: 'root' })
export class InventoryApi {
  private readonly http = inject(HttpClient);

  items(filter: { branchId?: string; search?: string; lowOnly?: boolean; groupId?: string; active?: boolean; page?: number; pageSize?: number }): Observable<PagedResult<InventoryItemDto>> {
    return this.http.get<ApiEnvelope<PagedResult<InventoryItemDto>>>('/api/v1/inventory/items', { params: q(filter) }).pipe(unwrap());
  }

  /** One item with the stock card's own figures (on order, last sold, last ordered). */
  item(id: string, branchId?: string): Observable<InventoryItemDto> {
    return this.http.get<ApiEnvelope<InventoryItemDto>>(`/api/v1/inventory/items/${id}`, { params: q({ branchId }) }).pipe(unwrap());
  }

  /** The item's package content (what it is made of, and what that totals to now). */
  package(itemId: string): Observable<PackageDto> {
    return this.http.get<ApiEnvelope<PackageDto>>(`/api/v1/inventory/items/${itemId}/package`).pipe(unwrap());
  }

  /** Replaces the whole package content; an empty list makes the item an ordinary item again. */
  savePackage(itemId: string, body: SavePackageRequest): Observable<PackageDto> {
    return this.http.put<ApiEnvelope<PackageDto>>(`/api/v1/inventory/items/${itemId}/package`, body).pipe(unwrap());
  }

  units(itemId: string): Observable<SellingUnitDto[]> {
    return this.http.get<ApiEnvelope<SellingUnitDto[]>>(`/api/v1/inventory/items/${itemId}/units`).pipe(unwrap());
  }

  saveUnit(itemId: string, unitId: string | null, body: SaveSellingUnitRequest): Observable<SellingUnitDto> {
    return unitId
      ? this.http.put<ApiEnvelope<SellingUnitDto>>(`/api/v1/inventory/items/${itemId}/units/${unitId}`, body).pipe(unwrap())
      : this.http.post<ApiEnvelope<SellingUnitDto>>(`/api/v1/inventory/items/${itemId}/units`, body).pipe(unwrap());
  }

  removeUnit(itemId: string, unitId: string): Observable<boolean> {
    return this.http.delete<ApiEnvelope<boolean>>(`/api/v1/inventory/items/${itemId}/units/${unitId}`).pipe(unwrap());
  }

  /** The item's picture as a blob (the request carries the session, so an img tag cannot fetch it by itself). */
  picture(id: string): Observable<Blob> {
    return this.http.get(`/api/v1/inventory/items/${id}/picture`, { responseType: 'blob' });
  }

  setPicture(id: string, file: File): Observable<boolean> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<ApiEnvelope<boolean>>(`/api/v1/inventory/items/${id}/picture`, form).pipe(unwrap());
  }

  removePicture(id: string): Observable<boolean> {
    return this.http.delete<ApiEnvelope<boolean>>(`/api/v1/inventory/items/${id}/picture`).pipe(unwrap());
  }

  saveItem(id: string | null, body: SaveInventoryItemRequest): Observable<InventoryItemDto> {
    return id
      ? this.http.put<ApiEnvelope<InventoryItemDto>>(`/api/v1/inventory/items/${id}`, body).pipe(unwrap())
      : this.http.post<ApiEnvelope<InventoryItemDto>>('/api/v1/inventory/items', body).pipe(unwrap());
  }

  movements(filter: { branchId?: string; itemId?: string; type?: string; page?: number; pageSize?: number }): Observable<PagedResult<MovementDto>> {
    return this.http.get<ApiEnvelope<PagedResult<MovementDto>>>('/api/v1/inventory/movements', { params: q(filter) }).pipe(unwrap());
  }

  adjust(body: AdjustStockRequest): Observable<MovementDto> {
    return this.http.post<ApiEnvelope<MovementDto>>('/api/v1/inventory/adjustments', body).pipe(unwrap());
  }

  receive(body: ReceiveGoodsRequest): Observable<MovementDto[]> {
    return this.http.post<ApiEnvelope<MovementDto[]>>('/api/v1/inventory/receipts', body).pipe(unwrap());
  }

  transfer(body: TransferStockRequest): Observable<unknown> {
    return this.http.post<ApiEnvelope<unknown>>('/api/v1/inventory/transfers', body).pipe(unwrap());
  }

  batches(filter: { branchId?: string; expiringOnly?: boolean }): Observable<BatchDto[]> {
    return this.http.get<ApiEnvelope<BatchDto[]>>('/api/v1/inventory/batches', { params: q(filter) }).pipe(unwrap());
  }

  suppliers(): Observable<SupplierDto[]> {
    return this.http.get<ApiEnvelope<SupplierDto[]>>('/api/v1/inventory/suppliers').pipe(unwrap());
  }

  saveSupplier(id: string | null, body: SaveSupplierRequest): Observable<SupplierDto> {
    return id
      ? this.http.put<ApiEnvelope<SupplierDto>>(`/api/v1/inventory/suppliers/${id}`, body).pipe(unwrap())
      : this.http.post<ApiEnvelope<SupplierDto>>('/api/v1/inventory/suppliers', body).pipe(unwrap());
  }

  purchaseOrders(filter: { branchId?: string; status?: string }): Observable<PurchaseOrderDto[]> {
    return this.http.get<ApiEnvelope<PurchaseOrderDto[]>>('/api/v1/inventory/purchase-orders', { params: q(filter) }).pipe(unwrap());
  }

  savePurchaseOrder(id: string | null, body: SavePurchaseOrderRequest): Observable<PurchaseOrderDto> {
    return id
      ? this.http.put<ApiEnvelope<PurchaseOrderDto>>(`/api/v1/inventory/purchase-orders/${id}`, body).pipe(unwrap())
      : this.http.post<ApiEnvelope<PurchaseOrderDto>>('/api/v1/inventory/purchase-orders', body).pipe(unwrap());
  }

  purchaseOrderAction(id: string, action: 'submit' | 'approve' | 'cancel'): Observable<PurchaseOrderDto> {
    return this.http.post<ApiEnvelope<PurchaseOrderDto>>(`/api/v1/inventory/purchase-orders/${id}/${action}`, null).pipe(unwrap());
  }

  usage(branchId: string, days = 14): Observable<UsageRowDto[]> {
    return this.http.get<ApiEnvelope<UsageRowDto[]>>('/api/v1/inventory/analytics/usage', { params: q({ branchId, days }) }).pipe(unwrap());
  }

  varianceSummary(filter: { branchId?: string; groupBy: string }): Observable<VarianceSummaryRowDto[]> {
    return this.http.get<ApiEnvelope<VarianceSummaryRowDto[]>>('/api/v1/inventory/analytics/variance-summary', { params: q(filter) }).pipe(unwrap());
  }

  suggestions(branchId: string): Observable<SuggestedOrderDto[]> {
    return this.http.get<ApiEnvelope<SuggestedOrderDto[]>>('/api/v1/inventory/suggestions', { params: q({ branchId }) }).pipe(unwrap());
  }

  createSuggested(branchId: string): Observable<PurchaseOrderDto[]> {
    return this.http.post<ApiEnvelope<PurchaseOrderDto[]>>(`/api/v1/inventory/suggestions/create-orders?branchId=${branchId}`, null).pipe(unwrap());
  }
}

@Injectable({ providedIn: 'root' })
export class AuditsApi {
  private readonly http = inject(HttpClient);

  list(filter: { branchId?: string; status?: string; page?: number; pageSize?: number }): Observable<PagedResult<AuditDto>> {
    return this.http.get<ApiEnvelope<PagedResult<AuditDto>>>('/api/v1/inventory/audits', { params: q(filter) }).pipe(unwrap());
  }

  get(id: string): Observable<AuditDto> {
    return this.http.get<ApiEnvelope<AuditDto>>(`/api/v1/inventory/audits/${id}`).pipe(unwrap());
  }

  start(body: { branchId: string; kind: string; stationId: string | null; shiftLabel: string | null; notes: string | null; clientId: string }): Observable<AuditDto> {
    return this.http.post<ApiEnvelope<AuditDto>>('/api/v1/inventory/audits', body).pipe(unwrap());
  }

  addMeasurement(id: string, body: AddMeasurementRequest): Observable<MeasurementDto> {
    return this.http.post<ApiEnvelope<MeasurementDto>>(`/api/v1/inventory/audits/${id}/measurements`, body).pipe(unwrap());
  }

  complete(id: string): Observable<AuditDto> {
    return this.http.post<ApiEnvelope<AuditDto>>(`/api/v1/inventory/audits/${id}/complete`, null).pipe(unwrap());
  }

  correct(id: string, body: { measurementId: string; reason: string; idempotencyKey: string }): Observable<MovementDto> {
    return this.http.post<ApiEnvelope<MovementDto>>(`/api/v1/inventory/audits/${id}/corrections`, body).pipe(unwrap());
  }

  variances(filter: { branchId?: string; minSeverity?: string; page?: number; pageSize?: number }): Observable<PagedResult<VarianceDto>> {
    return this.http.get<ApiEnvelope<PagedResult<VarianceDto>>>('/api/v1/inventory/audits/variances', { params: q(filter) }).pipe(unwrap());
  }

  review(id: string, note: string): Observable<VarianceDto> {
    return this.http.post<ApiEnvelope<VarianceDto>>(`/api/v1/inventory/audits/variances/${id}/review`, { note }).pipe(unwrap());
  }
}
