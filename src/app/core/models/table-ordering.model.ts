/** Mirrors TableOrderModels.cs in the API. */

export interface PublicMenuOptionDto { id: string; name: string; priceDelta: number }

export interface PublicMenuItemDto {
  id: string;
  name: string;
  description: string | null;
  /** The branch's price now, the one staff will charge. Null for an item that cannot be ordered now. */
  price: number | null;
  available: boolean;
  hasPicture: boolean;
  options: PublicMenuOptionDto[];
}

export interface PublicMenuCategoryDto { name: string; items: PublicMenuItemDto[] }

export interface PublicTableMenuDto {
  companyName: string;
  tagline: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  onPrimaryColor: string | null;
  backgroundColor: string | null;
  surfaceColor: string | null;
  textColor: string | null;
  branchName: string;
  tableName: string;
  currencyCode: string;
  acceptingOrders: boolean;
  notice: string | null;
  categories: PublicMenuCategoryDto[];
}

export interface PlaceTableOrderLine { productId: string; quantity: number; optionIds: string[]; note?: string | null }

export interface PlaceTableOrderRequest { deviceId: string; name?: string | null; note?: string | null; items: PlaceTableOrderLine[] }

export interface PublicBillDto { lines: { name: string; quantity: number; total: number }[]; total: number }

export type PublicRequestState = 'Waiting' | 'Confirmed' | 'Declined' | 'Expired' | 'Cancelled' | 'Done';

/** Where a customer's request is, in the customer's words. */
export interface PublicTableRequestDto {
  id: string;
  number: number;
  kind: 'order' | 'waiter' | 'bill';
  state: PublicRequestState;
  declineReason: string | null;
  total: number;
  items: { name: string; quantity: number; options: string | null; total: number }[];
  bill: PublicBillDto | null;
  currencyCode: string;
}

// ---- staff -------------------------------------------------------------------------------------

export type TableRequestState = 'Pending' | 'Expired' | 'Accepted' | 'Declined' | 'Cancelled' | 'Done';

export interface TableRequestItemDto { id: string; productId: string; name: string; quantity: number; unitPrice: number; options: string | null; note: string | null }

export interface TableRequestDto {
  id: string;
  number: number;
  branchId: string;
  tableId: string;
  tableName: string;
  kind: 'order' | 'waiter' | 'bill';
  state: TableRequestState;
  customerName: string | null;
  note: string | null;
  createdAtUtc: string;
  expiresAtUtc: string;
  decidedAtUtc: string | null;
  decidedByName: string | null;
  declineReason: string | null;
  acceptedOrderId: string | null;
  total: number;
  items: TableRequestItemDto[];
}

export interface TableQrDto { id: string; tableName: string; code: string }
