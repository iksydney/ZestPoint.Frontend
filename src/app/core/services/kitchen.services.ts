import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiEnvelope } from '../models/api.model';
import {
  BatchRecipeDto, FoodCostChange, FoodCostDishDto, FoodCostDto, FoodCostSaveResult, MarketRunDto, MarketRunStatus, ProductionItemDto, ProductionRunDto, RecordMarketRunRequest, RecordRunRequest, SaveBatchRecipeRequest, StockIssueDto
} from '../models/kitchen.model';
import { unwrap } from './api.util';

/** The kitchen: what it makes in batches, the stock it asks the store for, what it buys at the market and what its food costs. The server decides every rule; these only carry the calls. */
@Injectable({ providedIn: 'root' })
export class KitchenApi {
  private readonly http = inject(HttpClient);

  // ---- batches and production
  batchRecipe(itemId: string): Observable<BatchRecipeDto> { return this.http.get<ApiEnvelope<BatchRecipeDto>>(`/api/v1/inventory/items/${itemId}/batch-recipe`).pipe(unwrap()); }
  saveBatchRecipe(itemId: string, body: SaveBatchRecipeRequest): Observable<BatchRecipeDto> { return this.http.put<ApiEnvelope<BatchRecipeDto>>(`/api/v1/inventory/items/${itemId}/batch-recipe`, body).pipe(unwrap()); }
  productionItems(branchId: string): Observable<ProductionItemDto[]> { return this.http.get<ApiEnvelope<ProductionItemDto[]>>('/api/v1/production/items', { params: new HttpParams().set('branchId', branchId) }).pipe(unwrap()); }
  productionRuns(branchId: string): Observable<ProductionRunDto[]> { return this.http.get<ApiEnvelope<ProductionRunDto[]>>('/api/v1/production/runs', { params: new HttpParams().set('branchId', branchId) }).pipe(unwrap()); }
  recordRun(body: RecordRunRequest): Observable<ProductionRunDto> { return this.http.post<ApiEnvelope<ProductionRunDto>>('/api/v1/production/runs', body).pipe(unwrap()); }

  // ---- store issues
  issues(branchId: string, openOnly: boolean): Observable<StockIssueDto[]> {
    return this.http.get<ApiEnvelope<StockIssueDto[]>>('/api/v1/store-issues', { params: new HttpParams().set('branchId', branchId).set('openOnly', openOnly) }).pipe(unwrap());
  }
  requestIssue(body: { id: string; branchId: string; stationId: string; note: string | null; lines: { inventoryItemId: string; quantity: number }[] }): Observable<StockIssueDto> {
    return this.http.post<ApiEnvelope<StockIssueDto>>('/api/v1/store-issues', body).pipe(unwrap());
  }
  issue(id: string, body: { lines: { lineId: string; issued: number; fromBinId: string | null }[]; rowVersion: string | null }): Observable<StockIssueDto> {
    return this.http.post<ApiEnvelope<StockIssueDto>>(`/api/v1/store-issues/${id}/issue`, body).pipe(unwrap());
  }
  receive(id: string, body: { lines: { lineId: string; received: number }[]; rowVersion: string | null }): Observable<StockIssueDto> {
    return this.http.post<ApiEnvelope<StockIssueDto>>(`/api/v1/store-issues/${id}/receive`, body).pipe(unwrap());
  }
  cancelIssue(id: string, reason: string): Observable<StockIssueDto> { return this.http.post<ApiEnvelope<StockIssueDto>>(`/api/v1/store-issues/${id}/cancel`, { reason }).pipe(unwrap()); }

  // ---- market runs
  marketRuns(branchId: string, status: MarketRunStatus | null): Observable<MarketRunDto[]> {
    let params = new HttpParams().set('branchId', branchId);
    if (status) params = params.set('status', status);
    return this.http.get<ApiEnvelope<MarketRunDto[]>>('/api/v1/purchasing/market-runs', { params }).pipe(unwrap());
  }
  recordMarketRun(body: RecordMarketRunRequest): Observable<MarketRunDto> { return this.http.post<ApiEnvelope<MarketRunDto>>('/api/v1/purchasing/market-runs', body).pipe(unwrap()); }
  confirmMarketRun(id: string, note: string | null, rowVersion: string | null): Observable<MarketRunDto> {
    return this.http.post<ApiEnvelope<MarketRunDto>>(`/api/v1/purchasing/market-runs/${id}/confirm`, { note, rowVersion }).pipe(unwrap());
  }
  queryMarketRun(id: string, note: string, rowVersion: string | null): Observable<MarketRunDto> {
    return this.http.post<ApiEnvelope<MarketRunDto>>(`/api/v1/purchasing/market-runs/${id}/query`, { note, rowVersion }).pipe(unwrap());
  }
  uploadReceipt(file: File): Observable<{ id: string }> {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<ApiEnvelope<{ id: string }>>('/api/v1/purchasing/market-runs/photos', body).pipe(unwrap());
  }

  // ---- food cost
  foodCost(targetPercent: number): Observable<FoodCostDto> { return this.http.get<ApiEnvelope<FoodCostDto>>('/api/v1/food-cost', { params: new HttpParams().set('targetPercent', targetPercent) }).pipe(unwrap()); }
  /** Several dishes' prices and own targets in one request: a dish that cannot be saved is named in `failed`, the rest are saved. */
  saveFoodCost(changes: FoodCostChange[], targetPercent: number): Observable<FoodCostSaveResult> {
    return this.http.post<ApiEnvelope<FoodCostSaveResult>>('/api/v1/food-cost/save', { changes }, { params: new HttpParams().set('targetPercent', targetPercent) }).pipe(unwrap());
  }
  applyPrice(productId: string, price: number, targetPercent: number): Observable<FoodCostDishDto> {
    return this.http.post<ApiEnvelope<FoodCostDishDto>>('/api/v1/food-cost/apply-price', { productId, price }, { params: new HttpParams().set('targetPercent', targetPercent) }).pipe(unwrap());
  }
}
