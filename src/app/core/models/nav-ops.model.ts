/**
 * DTOs for Start/End of Day, stock maintenance, stock take, adjustments, serials, labels, supplier payments and the report envelope.
 * They MIRROR the backend ViewModel/NavigationModels.cs (constitution Article 4): keep both in step.
 */

// ---- Report envelope ----------------------------------------------------------------------------

export type ReportColumnType = 'text' | 'int' | 'number' | 'money' | 'percent' | 'date' | 'datetime' | 'badge' | 'bool' | 'id';

export interface ReportColumn {
  readonly key: string;
  readonly label: string;
  readonly type: ReportColumnType;
  readonly unit: string | null;
  readonly sortable: boolean;
}

export interface ReportMetric {
  readonly label: string;
  readonly value: string | number | boolean | null;
  readonly type: string;
  readonly hint: string | null;
}

export type ReportCell = string | number | boolean | null;
export type ReportRow = Readonly<Record<string, ReportCell>>;

export interface ReportDto {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly columns: readonly ReportColumn[];
  readonly rows: readonly ReportRow[];
  readonly totals: ReportRow | null;
  readonly summary: readonly ReportMetric[];
  readonly notes: readonly string[];
  readonly currencyCode: string;
  readonly timeZoneId: string;
  readonly generatedAtUtc: string;
  readonly from: string | null;
  readonly to: string | null;
  readonly filters: Readonly<Record<string, string>>;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly truncated: boolean;
  readonly integrationStatus: string | null;
}

/** The query a report understands. Everything is optional; the server validates and scopes it. */
export interface ReportQuery {
  from?: string;
  to?: string;
  asOf?: string;
  branchId?: string;
  groupId?: string;
  itemId?: string;
  staffId?: string;
  supplierId?: string;
  search?: string;
  status?: string;
  type?: string;
  buckets?: string;
  /** Payments history. */
  method?: string;
  flag?: string;
  minAmount?: string;
  maxAmount?: string;
  warningDays?: number;
  compare?: boolean;
  sort?: string;
  desc?: boolean;
  page?: number;
  pageSize?: number;
}

// ---- Start / End of Day ------------------------------------------------------------------------

export type ShiftStatus = 'Open' | 'PendingReview' | 'Closed';
export type CashMovementKind = 'CashIn' | 'CashOut';

export interface CashMovementDto {
  readonly id: string;
  readonly kind: CashMovementKind;
  readonly amount: number;
  readonly reason: string;
  readonly staffName: string | null;
  readonly occurredAtUtc: string;
}

export interface ShiftCashDto {
  readonly openingFloat: number;
  readonly cashSales: number;
  readonly cashRefunds: number;
  readonly cashIn: number;
  readonly cashOut: number;
  readonly expectedCash: number;
  readonly cardSales: number;
  readonly transferSales: number;
  readonly otherSales: number;
  /** Paid with loyalty points during the shift: their value, never money in the drawer. */
  readonly pointsSales: number;
  /** Paid with gift cards during the shift: money taken earlier, not money in the drawer. */
  readonly giftCardSales: number;
  readonly paymentCount: number;
}

export interface ShiftDto {
  readonly id: string;
  readonly number: number;
  readonly branchId: string;
  readonly branchName: string;
  readonly terminalId: string;
  readonly membershipId: string;
  readonly staffName: string;
  readonly status: ShiftStatus;
  readonly businessDate: string;
  readonly openedAtUtc: string;
  readonly openingFloat: number;
  readonly closedAtUtc: string | null;
  readonly expectedCash: number | null;
  readonly countedCash: number | null;
  readonly variance: number | null;
  readonly closingNotes: string | null;
  readonly reviewedByName: string | null;
  readonly reviewedAtUtc: string | null;
  readonly reviewNote: string | null;
  readonly currencyCode: string;
  readonly rowVersion: string;
  readonly cash: ShiftCashDto;
  readonly movements: readonly CashMovementDto[];
}

/** No till is sent: the server assigns the lowest free "Till N" at the branch and returns it as ShiftDto.terminalId. */
export interface OpenShiftRequest { id: string; branchId: string; openingFloat: number; openingFloatConfirmed: boolean }
export interface CashMovementRequest { id: string; kind: CashMovementKind; amount: number; reason: string }
export interface CloseShiftRequest { countedCash: number; notes: string | null; confirm: boolean; rowVersion: string | null }
export interface ReviewShiftRequest { approve: boolean; note: string }

// ---- Stock groups ------------------------------------------------------------------------------

export interface StockGroupDto {
  readonly id: string;
  readonly name: string;
  readonly code: string | null;
  readonly description: string | null;
  readonly parentId: string | null;
  readonly parentName: string | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly productCount: number;
  readonly itemCount: number;
  readonly inUse: boolean;
  /** The ledger accounts for the group's sales and stock; null = the company's Sales / Stock account. */
  readonly salesAccountId?: string | null;
  readonly purchaseAccountId?: string | null;
  /** Where the group's items are prepared; null = the company's default station. */
  readonly stationId?: string | null;
}

export interface SaveStockGroupRequest { name: string; code: string | null; description: string | null; parentId: string | null; sortOrder: number; isActive: boolean; salesAccountId?: string | null; purchaseAccountId?: string | null; stationId?: string | null }

// ---- Adjustments -------------------------------------------------------------------------------

export type StockMovementKind = 'Adjustment' | 'Waste' | 'Spillage' | 'Breakage';
export type AdjustmentStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';

export interface AdjustmentReasonDto { readonly id: string; readonly code: string; readonly name: string; readonly movementType: string; readonly isActive: boolean }
export interface SaveAdjustmentReasonRequest { code: string; name: string; movementType: StockMovementKind; isActive: boolean }

export interface AdjustmentDto {
  readonly id: string;
  readonly number: number;
  readonly branchId: string;
  readonly inventoryItemId: string;
  readonly itemName: string;
  readonly sku: string | null;
  readonly unit: string;
  readonly reasonName: string;
  readonly expectedAtRequest: number;
  readonly countedQuantity: number | null;
  readonly quantityDelta: number;
  readonly resultingQuantity: number;
  readonly estimatedValue: number | null;
  readonly note: string | null;
  readonly status: AdjustmentStatus;
  readonly requestedByMembershipId: string;
  readonly requestedByName: string | null;
  readonly decidedByName: string | null;
  readonly decidedAtUtc: string | null;
  readonly decisionNote: string | null;
  readonly dateCreated: string;
}

export interface CreateAdjustmentRequest {
  branchId: string; inventoryItemId: string; reasonId: string; quantityDelta: number | null; countedQuantity: number | null; note: string | null; idempotencyKey: string;
}

// ---- Stock take --------------------------------------------------------------------------------

export type StockTakeStatus = 'Draft' | 'Counting' | 'Submitted' | 'Approved' | 'Rejected' | 'Reconciled' | 'Cancelled';

export interface StockTakeLineDto {
  readonly id: string;
  readonly inventoryItemId: string;
  readonly itemName: string;
  readonly sku: string | null;
  /** The item's barcode, so a phone can find a line by scanning it. */
  readonly barcode?: string | null;
  readonly unit: string;
  readonly expectedQuantity: number | null;
  readonly countedQuantity: number | null;
  readonly variance: number | null;
  readonly varianceValue: number | null;
  readonly isUnexpected: boolean;
  readonly isMissing: boolean;
  readonly explanation: string | null;
}

export interface StockTakeDto {
  readonly id: string;
  readonly number: number;
  readonly branchId: string;
  readonly branchName: string;
  readonly status: StockTakeStatus;
  readonly isBlind: boolean;
  readonly notes: string | null;
  readonly snapshotAtUtc: string | null;
  readonly createdByName: string | null;
  readonly decidedByName: string | null;
  readonly decisionNote: string | null;
  readonly reconciledAtUtc: string | null;
  readonly lineCount: number;
  readonly countedCount: number;
  readonly dateCreated: string;
  readonly lines: readonly StockTakeLineDto[] | null;
}

export interface CreateStockTakeRequest { branchId: string; groupId: string | null; isBlind: boolean; notes: string | null }
export interface RecordCountsRequest { lines: { inventoryItemId: string; countedQuantity: number; explanation: string | null }[] }

// ---- Global maintenance ------------------------------------------------------------------------

export type BulkField = 'group' | 'reorder_level' | 'minimum_level' | 'reorder_quantity' | 'target_stock' | 'active' | 'web_store';

export interface BulkStockChangeRequest {
  field: BulkField; value: string; groupId: string | null; search: string | null; itemIds: string[] | null; activeOnly: boolean | null; expectedCount: number | null; reason: string | null;
}

export interface BulkChangeRowDto { readonly itemId: string; readonly itemName: string; readonly sku: string | null; readonly before: string | null; readonly after: string | null; readonly problem: string | null }
export interface BulkChangeResultDto { readonly applied: boolean; readonly affectedCount: number; readonly problemCount: number; readonly truncated: boolean; readonly rows: readonly BulkChangeRowDto[] }

// ---- Serials, aliases, labels ------------------------------------------------------------------

export type SerialStatus = 'InStock' | 'Sold' | 'Returned' | 'Damaged' | 'Dispatched';
export interface RegisterSerialsRequest { inventoryItemId: string; branchId: string; serials: string[]; warrantyExpiresOn: string | null }
export interface SerialStatusRequest { status: SerialStatus; reference: string | null; transferToBranchId: string | null; note: string | null }

export type AliasKind = 'Equivalent' | 'SupplierPartNumber';
export interface ItemAliasDto { readonly id: string; readonly kind: AliasKind; readonly code: string; readonly supplierId: string | null; readonly supplierName: string | null; readonly note: string | null }
export interface SaveItemAliasRequest { kind: AliasKind; code: string; supplierId: string | null; note: string | null }

export interface LabelRequest { lines: { inventoryItemId: string; copies: number; lotCode: string | null; expiryDate: string | null; serialNumber: string | null }[]; showPrice: boolean; showGroup: boolean }

export interface LabelDto {
  readonly inventoryItemId: string;
  readonly name: string;
  readonly sku: string | null;
  readonly barcodeValue: string | null;
  readonly barcodeFormat: 'code128' | 'ean13' | null;
  readonly price: string | null;
  readonly groupName: string | null;
  readonly lotCode: string | null;
  readonly expiryDate: string | null;
  readonly serialNumber: string | null;
  readonly copies: number;
  readonly problem: string | null;
}

export interface LabelSheetDto { readonly labels: readonly LabelDto[]; readonly priceHidden: boolean; readonly currencyCode: string }

// ---- Supplier payments -------------------------------------------------------------------------

export interface SupplierPaymentDto {
  readonly id: string;
  readonly number: number;
  readonly supplierId: string;
  readonly supplierName: string;
  readonly amount: number;
  readonly method: string;
  readonly paidAtUtc: string;
  readonly reference: string | null;
  readonly note: string | null;
  readonly reversesPaymentId: string | null;
  readonly isReversed: boolean;
  readonly recordedByName: string | null;
}

export interface RecordSupplierPaymentRequest { supplierId: string; amount: number; method: 'Cash' | 'Card' | 'Transfer' | 'Other'; paidAtUtc: string | null; reference: string | null; note: string | null; purchaseOrderId: string | null; idempotencyKey: string }
export interface SupplierBalanceDto { readonly supplierId: string; readonly supplierName: string; readonly received: number; readonly paid: number; readonly balance: number; readonly currencyCode: string }
