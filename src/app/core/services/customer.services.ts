import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiEnvelope } from '../models/api.model';
import { OrderDto, PagedResult } from '../models/ops.model';
import { unwrap } from './api.util';

/** A customer as the till shows them on a bill. */
export interface CustomerBriefDto { id: string; number: number; name: string; phone: string; pointsBalance: number; /** The customer has set their own code for spending points; the code is never sent anywhere. */ hasRedemptionCode?: boolean }

export interface CustomerPointsDto { occurredAtUtc: string; kind: 'Earned' | 'TakenBack' | 'Spent' | 'GivenBack'; points: number; orderNumber: number | null; reason: string | null }

export interface CustomerDto extends CustomerBriefDto {
  email: string | null;
  address: string | null;
  /** yyyy-MM-dd */
  birthday: string | null;
  notes: string | null;
  isActive: boolean;
  createdAtUtc: string;
  lastBillAtUtc: string | null;
  billCount: number;
  /** Filled when one customer is opened: the newest changes to their points. */
  points: CustomerPointsDto[];
  rowVersion: string;
}

export interface SaveCustomerRequest {
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  birthday?: string | null;
  notes?: string | null;
  isActive: boolean;
  rowVersion?: string | null;
}

export type SalesBackOrderStatus = 'Waiting' | 'Supplied' | 'Cancelled';

export interface SalesBackOrderDto {
  id: string;
  number: number;
  branchId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  inventoryItemId: string;
  itemName: string;
  itemSku: string | null;
  quantity: number;
  note: string | null;
  status: SalesBackOrderStatus;
  createdAtUtc: string;
  /** What the branch has of the item now; null for a package. */
  onHand: number | null;
  canSupply: boolean;
  suppliedOrderId: string | null;
  suppliedOrderNumber: number | null;
  suppliedAtUtc: string | null;
  cancelReason: string | null;
  rowVersion: string;
}

const q = (filter: object): HttpParams => {
  let params = new HttpParams();
  for (const [k, v] of Object.entries(filter)) if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
  return params;
};

export type LaybyStatus = 'Active' | 'Completed' | 'Cancelled';

export interface LaybyDto {
  id: string;
  number: number;
  branchId: string;
  orderId: string;
  orderNumber: number;
  customerId: string;
  customerName: string;
  customerPhone: string;
  status: LaybyStatus;
  startedAtUtc: string;
  /** yyyy-MM-dd */
  dueDate: string;
  overdue: boolean;
  total: number;
  minimumDeposit: number;
  /** What the customer has paid so far; for a cancelled layby, what was kept. */
  paid: number;
  balance: number;
  /** The goods, in words. */
  items: string;
  completedAtUtc: string | null;
  cancelledAtUtc: string | null;
  cancelReason: string | null;
  cancelFee: number | null;
  refundedOnCancel: number | null;
  cancelAuthorisedByName: string | null;
  rowVersion: string;
}

@Injectable({ providedIn: 'root' })
export class LaybysApi {
  private readonly http = inject(HttpClient);

  list(filter: { branchId?: string; status?: LaybyStatus | ''; overdueOnly?: boolean; search?: string; page?: number; pageSize?: number }): Observable<PagedResult<LaybyDto>> {
    return this.http.get<ApiEnvelope<PagedResult<LaybyDto>>>('/api/v1/laybys', { params: q({ ...filter, overdueOnly: filter.overdueOnly ? true : undefined }) }).pipe(unwrap());
  }

  /** Turns an open bill that has a customer and no payment yet into a layby. */
  start(orderId: string): Observable<LaybyDto> {
    return this.http.post<ApiEnvelope<LaybyDto>>('/api/v1/laybys', { orderId }).pipe(unwrap());
  }

  /** Cancels with a supervisor's or administrator's typed credentials; they are sent once and kept nowhere. */
  cancel(id: string, reason: string, authorizer: { staffCode?: string; pin?: string; email?: string; password?: string }): Observable<LaybyDto> {
    return this.http.post<ApiEnvelope<LaybyDto>>(`/api/v1/laybys/${id}/cancel`, { reason, authorizer }).pipe(unwrap());
  }
}

@Injectable({ providedIn: 'root' })
export class CustomersApi {
  private readonly http = inject(HttpClient);

  list(filter: { search?: string; includeInactive?: boolean; page?: number; pageSize?: number }): Observable<PagedResult<CustomerDto>> {
    return this.http.get<ApiEnvelope<PagedResult<CustomerDto>>>('/api/v1/customers', { params: q(filter) }).pipe(unwrap());
  }

  get(id: string): Observable<CustomerDto> {
    return this.http.get<ApiEnvelope<CustomerDto>>(`/api/v1/customers/${id}`).pipe(unwrap());
  }

  /** Adding needs only the till right; without the right to manage customers the server keeps the name and phone and drops the rest. */
  create(body: SaveCustomerRequest): Observable<CustomerDto> {
    return this.http.post<ApiEnvelope<CustomerDto>>('/api/v1/customers', body).pipe(unwrap());
  }

  update(id: string, body: SaveCustomerRequest): Observable<CustomerDto> {
    return this.http.put<ApiEnvelope<CustomerDto>>(`/api/v1/customers/${id}`, body).pipe(unwrap());
  }

  /** The customer's own four-digit code for spending points. The first one needs no one; changing it needs a supervisor's credentials. */
  setRedemptionCode(id: string, body: { code: string; branchId?: string | null; authorizer?: { staffCode?: string; pin?: string; email?: string; password?: string } | null }): Observable<CustomerDto> {
    return this.http.put<ApiEnvelope<CustomerDto>>(`/api/v1/customers/${id}/redemption-code`, body).pipe(unwrap());
  }

  /** Puts a customer record on an open bill, or takes it off (null). */
  setOnOrder(orderId: string, customerId: string | null): Observable<OrderDto> {
    return this.http.put<ApiEnvelope<OrderDto>>(`/api/v1/orders/${orderId}/customer`, { customerId }).pipe(unwrap());
  }
}

@Injectable({ providedIn: 'root' })
export class SalesBackOrdersApi {
  private readonly http = inject(HttpClient);

  list(filter: { branchId?: string; status?: SalesBackOrderStatus | ''; search?: string; page?: number; pageSize?: number }): Observable<PagedResult<SalesBackOrderDto>> {
    return this.http.get<ApiEnvelope<PagedResult<SalesBackOrderDto>>>('/api/v1/sales-back-orders', { params: q(filter) }).pipe(unwrap());
  }

  create(body: { branchId: string; customerId: string; inventoryItemId: string; quantity: number; note: string | null }): Observable<SalesBackOrderDto> {
    return this.http.post<ApiEnvelope<SalesBackOrderDto>>('/api/v1/sales-back-orders', body).pipe(unwrap());
  }

  /** Puts the back order on a new bill for its customer. */
  fulfil(id: string): Observable<SalesBackOrderDto> {
    return this.http.post<ApiEnvelope<SalesBackOrderDto>>(`/api/v1/sales-back-orders/${id}/fulfil`, {}).pipe(unwrap());
  }

  cancel(id: string, reason: string): Observable<SalesBackOrderDto> {
    return this.http.post<ApiEnvelope<SalesBackOrderDto>>(`/api/v1/sales-back-orders/${id}/cancel`, { reason }).pipe(unwrap());
  }
}
