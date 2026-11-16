/** Mirrors GiftCardModels.cs in the API. */

export type GiftCardStatus = 'Pending' | 'Active' | 'Cancelled';
export type GiftCardState = 'Pending' | 'Active' | 'Expired' | 'Used' | 'Cancelled';
export type GiftCardEntryKind = 'Issued' | 'Spent' | 'Refunded' | 'Cancelled' | 'Reissued';

export interface StartGiftCardSaleRequest {
  orderId: string;
  branchId: string;
  amount: number;
  recipientName?: string | null;
  recipientPhone?: string | null;
  recipientEmail?: string | null;
}

/** A card that has just been issued. The code is in here and nowhere else the server keeps: it is shown once and never stored on the device. */
export interface IssuedGiftCardDto {
  id: string;
  number: number;
  /** 16 characters in groups of four. */
  code: string;
  last4: string;
  amount: number;
  currencyCode: string;
  expiresAtUtc: string | null;
  recipientName: string | null;
  recipientEmail: string | null;
  emailQueued: boolean;
  messageNote: string | null;
  balanceLink: string;
}

/** The card a bill sells, as the bill shows it: never the code. */
export interface OrderGiftCardDto {
  id: string;
  number: number;
  last4: string | null;
  status: GiftCardStatus;
  amount: number;
  recipientName: string | null;
}

export interface GiftCardBalanceDto {
  number: number;
  last4: string;
  balance: number;
  currencyCode: string;
  expiresAtUtc: string | null;
  expired: boolean;
  state: GiftCardState;
}

export interface PublicGiftCardBalanceDto {
  companyName: string;
  last4: string;
  balance: number;
  currencyCode: string;
  expiresAtUtc: string | null;
  expired: boolean;
  state: GiftCardState;
}

export interface GiftCardEntryDto {
  kind: GiftCardEntryKind;
  amount: number;
  orderNumber: number | null;
  reason: string | null;
  byName: string | null;
  occurredAtUtc: string;
}

export interface GiftCardDto {
  id: string;
  number: number;
  last4: string | null;
  state: GiftCardState;
  amount: number;
  balance: number;
  spent: number;
  currencyCode: string;
  branchId: string | null;
  branchName: string | null;
  soldAtUtc: string | null;
  soldOnOrderNumber: number | null;
  soldByName: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  recipientEmail: string | null;
  expiresAtUtc: string | null;
  expired: boolean;
  cancelledAtUtc: string | null;
  cancelReason: string | null;
  cancelledByName: string | null;
  replacedByNumber: number | null;
  replacesNumber: number | null;
  history: GiftCardEntryDto[];
}

export interface GiftCardSummaryDto {
  currencyCode: string;
  soldCount: number;
  soldValue: number;
  spentValue: number;
  outstanding: number;
  activeCount: number;
  expiredBalance: number;
  expiredCount: number;
}

export interface GiftCardListDto {
  cards: { items: GiftCardDto[]; total: number; page: number; pageSize: number };
  summary: GiftCardSummaryDto;
}

export interface GiftCardReissueDto {
  cancelled: GiftCardDto;
  replacement: IssuedGiftCardDto;
}
