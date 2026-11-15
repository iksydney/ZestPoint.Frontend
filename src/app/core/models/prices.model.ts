/** Prices per branch, price lists, what a branch sells, scheduled changes (head office). Mirrors the server's PriceModels. */

export type PriceSource = 'company' | 'branch' | 'list';
export type PriceScopeName = 'company' | 'branch' | 'list';
export type PriceMode = 'absolute' | 'percent' | 'amount' | 'clear';

export interface PriceBranchDto {
  id: string;
  name: string;
  /** The person may change this branch's prices. */
  mayChange: boolean;
}

/** What one product costs at one branch right now, and why. */
export interface PriceCellDto {
  branchId: string;
  price: number;
  source: PriceSource;
  sourceName: string | null;
  /** The branch does not sell it. */
  off: boolean;
  /** Changes for this branch that have not started yet. */
  pending: number;
}

export interface PriceRowDto {
  productId: string;
  name: string;
  sku: string | null;
  groupName: string | null;
  companyPrice: number;
  minimumPrice: number | null;
  pendingCompany: number;
  cells: PriceCellDto[];
}

export interface PriceMatrixDto {
  currencyCode: string;
  mayManageAll: boolean;
  branchManagersMaySet: boolean;
  branches: PriceBranchDto[];
  rows: PriceRowDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SetPricesRequest {
  scope: PriceScopeName;
  branchId?: string | null;
  priceListId?: string | null;
  productIds: string[];
  mode: PriceMode;
  value?: number | null;
  startsAtUtc?: string | null;
  reason?: string | null;
}

export interface SetPricesResultDto { changed: number; skipped: number; scheduled: boolean }

export interface PriceChangeDto {
  id: string;
  productId: string;
  productName: string;
  scope: PriceScopeName;
  branchId: string | null;
  branchName: string | null;
  priceListId: string | null;
  listName: string | null;
  price: number | null;
  startsAtUtc: string;
  status: 'pending' | 'in force' | 'replaced' | 'cancelled';
  setByName: string | null;
  reason: string | null;
  cancelledAtUtc: string | null;
}

export interface PriceListAssignmentDto {
  branchId: string;
  branchName: string;
  sortOrder: number;
  validFromUtc: string | null;
  validToUtc: string | null;
  /** Bit 0 = Sunday ... bit 6 = Saturday. 0 = every day. */
  daysOfWeek: number;
  fromMinute: number | null;
  toMinute: number | null;
}

export interface PriceListDto {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  productCount: number;
  branches: PriceListAssignmentDto[];
}

export interface SavePriceListRequest { name: string; description: string | null; isActive: boolean }

export interface PriceListAssignmentRequest {
  branchId: string;
  sortOrder: number;
  validFromUtc: string | null;
  validToUtc: string | null;
  daysOfWeek: number;
  fromMinute: number | null;
  toMinute: number | null;
}
