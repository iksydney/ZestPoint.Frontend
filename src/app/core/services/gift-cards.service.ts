import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiEnvelope } from '../models/api.model';
import {
  GiftCardBalanceDto, GiftCardDto, GiftCardListDto, GiftCardReissueDto, PublicGiftCardBalanceDto, StartGiftCardSaleRequest
} from '../models/gift-card.model';
import { OrderDto } from '../models/ops.model';
import { unwrap } from './api.util';

/**
 * Gift cards. Every call is authorised by the server (right, module, and the card belonging to this company); the code is sent only to be
 * checked, never kept, and the server never sends one back except the one time a card is issued.
 */
@Injectable({ providedIn: 'root' })
export class GiftCardsApi {
  private readonly http = inject(HttpClient);

  /** Opens a bill that holds one card. It is paid like any bill, and the card is issued when it is paid in full. */
  startSale(body: StartGiftCardSaleRequest): Observable<OrderDto> {
    return this.http.post<ApiEnvelope<OrderDto>>('/api/v1/orders/gift-card-sale', body).pipe(unwrap());
  }

  /** What is left on a card, for the till. */
  balance(code: string): Observable<GiftCardBalanceDto> {
    return this.http.post<ApiEnvelope<GiftCardBalanceDto>>('/api/v1/orders/gift-card-balance', { code }).pipe(unwrap());
  }

  /** For a paid gift card bill whose card was not issued with the payment: issues it now, and the answer carries the code once. */
  issue(orderId: string): Observable<OrderDto> {
    return this.http.post<ApiEnvelope<OrderDto>>(`/api/v1/orders/${orderId}/gift-card-issue`, {}).pipe(unwrap());
  }

  list(filter: { state?: string; search?: string; branchId?: string; from?: string; to?: string; page?: number; pageSize?: number }): Observable<GiftCardListDto> {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(filter)) if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
    return this.http.get<ApiEnvelope<GiftCardListDto>>('/api/v1/gift-cards', { params }).pipe(unwrap());
  }

  get(id: string): Observable<GiftCardDto> {
    return this.http.get<ApiEnvelope<GiftCardDto>>(`/api/v1/gift-cards/${id}`).pipe(unwrap());
  }

  cancelAndReissue(id: string, reason: string): Observable<GiftCardReissueDto> {
    return this.http.post<ApiEnvelope<GiftCardReissueDto>>(`/api/v1/gift-cards/${id}/cancel-reissue`, { reason }).pipe(unwrap());
  }

  /** The holder's own check, with no sign-in. */
  publicBalance(code: string): Observable<PublicGiftCardBalanceDto> {
    return this.http.post<ApiEnvelope<PublicGiftCardBalanceDto>>('/api/v1/public/gift-cards/balance', { code }).pipe(unwrap());
  }
}
