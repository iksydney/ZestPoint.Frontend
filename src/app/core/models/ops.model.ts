/**
 * Point-of-sale, catalogue and inventory contracts. These MIRROR the backend view models (ZestPoint.Data/ViewModel/PosModels.cs,
 * CatalogModels.cs, InventoryModels.cs); change both together (constitution Article 4). Enums travel as their names.
 */
import { PagedResult } from './staff.model';

export type { PagedResult };

export type OrderKind = 'Tab' | 'Table' | 'WalkUp' | 'Takeaway';
export type OrderStatus = 'Open' | 'PartiallyPaid' | 'Paid' | 'Voided' | 'Merged' | 'Refunded';
export type LineStatus = 'Active' | 'Voided';
export type PaymentMethod = 'Cash' | 'Card' | 'Transfer' | 'Other';
export type PaymentStatus = 'Pending' | 'Succeeded' | 'Failed' | 'Reversed';
export type VoidRequestStatus = 'Pending' | 'Approved' | 'Rejected';
export type StockUnit = 'Milliliter' | 'Gram' | 'Each';
export type InventoryItemKind = 'Ingredient' | 'FinishedGood';
export type StockMovementType =
  | 'Opening' | 'Receipt' | 'Sale' | 'SaleReversal' | 'Adjustment' | 'Waste' | 'Spillage' | 'Breakage'
  | 'TransferOut' | 'TransferIn' | 'Return' | 'AuditCorrection' | 'ConsignmentOut' | 'ConsignmentReturn';
export type PurchaseOrderStatus = 'Draft' | 'Submitted' | 'Approved' | 'PartiallyReceived' | 'Received' | 'Cancelled';
export type MeasurementSource = 'Scale' | 'Manual' | 'Demo';
export type VarianceSeverity = 'None' | 'Warning' | 'Investigate' | 'Escalate';
export type AuditKind = 'Manual' | 'Weighed';
export type AuditStatus = 'Open' | 'Completed';

// ---- Settings ---------------------------------------------------------------------------------

export interface CompanySettingsDto {
  taxName: string;
  taxRatePercent: number;
  taxInclusive: boolean;
  varianceWarnPercent: number;
  varianceInvestigatePercent: number;
  varianceEscalatePercent: number;
  discountApprovalPercent: number;
  cashVarianceReviewThreshold: number;
  requireOpenShiftToSell: boolean;
  adjustmentApprovalAboveValue: number | null;
  expiryWarningDays: number;
  allowCashPayments: boolean;
  allowCardPayments: boolean;
  allowTransferPayments: boolean;
  currencyCode: string;
  paymentProvider: string;
  paymentProviderIsDemo: boolean;
  /** The bar man method is on: Send hands items to a bar man and stock is deducted when the bar man dispatches them. */
  barManMethodEnabled: boolean;
  /** Layby rules: least first payment (percent of the total), days a layby may run, what is kept on cancelling (percent of what was paid). */
  laybyMinDepositPercent: number;
  laybyDays: number;
  laybyCancelFeePercent: number;
  /** True for a bar-type business; only these can switch the method on. */
  barManMethodAvailable: boolean;
  rowVersion: string;
}

export type UpdateCompanySettingsRequest = Omit<CompanySettingsDto, 'currencyCode' | 'paymentProvider' | 'paymentProviderIsDemo' | 'barManMethodAvailable'>;

// ---- Catalogue --------------------------------------------------------------------------------

export interface CategoryDto { id: string; name: string; sortOrder: number; isActive: boolean; isDemo: boolean }

export interface ModifierDto { id: string; name: string; priceDelta: number; inventoryItemId: string | null; quantity: number; isActive: boolean }

export interface ProductDto {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  price: number;
  isActive: boolean;
  isFavorite: boolean;
  isDemo: boolean;
  inventoryItemId: string | null;
  stockPerSale: number;
  hasRecipe: boolean;
  /** The linked stock item carries serial numbers: the till asks for the unit's serial and sells one unit per line. */
  tracksSerials: boolean;
  /**
   * Sale rules of the linked stock item (stock card). `price` is what the till charges now: the special while its period runs, else the
   * regular price. The server enforces every one of these; the till follows them so the person is not surprised by a refusal.
   */
  regularPrice?: number;
  onSpecial?: boolean;
  specialEndsAtUtc?: string | null;
  taxExempt?: boolean;
  blockQtyFractions?: boolean;
  editQtyOnSales?: boolean;
  blockDiscount?: boolean;
  minimumPrice?: number | null;
  /** The item's own discount in force now (0 or absent = none): the till takes this percentage off `price` by itself, never below the minimum price. */
  discountPercent?: number;
  /** Other ways this product is sold (a case of 12), each priced at the item's price times what it holds. */
  sellingUnits?: SellingUnitDto[];
  /** Set when the product is a package: price is the total of its contents and stock comes from the contents. */
  package?: ProductPackageDto | null;
  modifiers: ModifierDto[];
  available: number | null;
  rowVersion: string;
}

export interface PackagePartDto { name: string; quantity: number }

/** A package as the till needs it. The three amounts are per one package and are zero unless `mixed`: the part of its price that is tax exempt, allows no discount, or both. */
export interface ProductPackageDto {
  contents: PackagePartDto[];
  mixed: boolean;
  splitExempt: number;
  splitNoDiscount: number;
  splitExemptNoDiscount: number;
}

/** A content row on the stock card's Package content tab. Prices are null for people who may not see selling prices. */
export interface PackageContentDto {
  contentItemId: string;
  name: string;
  sku: string | null;
  quantity: number;
  isPackage: boolean;
  unitPrice: number | null;
  lineValue: number | null;
  taxExempt: boolean;
  blockDiscount: boolean;
  problem: string | null;
}

/** An item's package content; `price` is what the package sells for now (the total of its contents). */
export interface PackageDto {
  inventoryItemId: string;
  contents: PackageContentDto[];
  price: number | null;
  problem: string | null;
  usedIn: { itemId: string; name: string }[];
}

export interface SavePackageRequest { contents: { contentItemId: string; quantity: number }[] }

/** A selling unit of an item (the Unit of Measure tab of the stock card). It has no price or stock of its own. */
export interface SellingUnitDto {
  id: string;
  inventoryItemId: string;
  name: string;
  /** How many base units one of these holds. */
  size: number;
  barcode: string | null;
  isActive: boolean;
  /** What one unit costs at the till now; null where prices are not shown. */
  price: number | null;
}

export interface SaveSellingUnitRequest { name: string; size: number; barcode: string | null; isActive: boolean }

export interface SaveProductRequest {
  categoryId: string | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  price: number;
  isActive: boolean;
  isFavorite: boolean;
  inventoryItemId: string | null;
  stockPerSale: number;
  modifiers: { id: string | null; name: string; priceDelta: number; inventoryItemId: string | null; quantity: number; isActive: boolean }[];
  rowVersion: string | null;
}

export interface RecipeIngredientDto {
  inventoryItemId: string;
  itemName: string;
  unit: StockUnit;
  quantity: number;
  substituteItemId: string | null;
  substituteRatio: number | null;
}

export interface RecipeDto {
  id: string;
  productId: string;
  version: number;
  isCurrent: boolean;
  notes: string | null;
  dateCreated: string;
  ingredients: RecipeIngredientDto[];
  costPerUnit: number;
}

export interface SaveRecipeRequest {
  notes: string | null;
  ingredients: { inventoryItemId: string; quantity: number; substituteItemId: string | null; substituteRatio: number | null }[];
}

// ---- Orders -----------------------------------------------------------------------------------

export interface AppliedModifierDto { id: string; name: string; priceDelta: number }

export interface OrderLineDto {
  id: string;
  /** The station this line goes to or went to, when the company uses stations. */
  stationName?: string | null;
  /** Still waiting on a station that holds payment: the bill cannot be paid until it is made. */
  holdsPayment?: boolean;
  /** Stock for this line has left the shelf (at Send, or when its station marked it ready). */
  stockDeducted?: boolean;
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  seat: number | null;
  serialNumber?: string | null;
  notes: string | null;
  modifiers: AppliedModifierDto[];
  modifierTotal: number;
  /** Everything taken off the line: the item's own discount (itemDiscountPerUnit times the quantity) plus any discount given at the till. */
  discountAmount: number;
  /** The item's own discount (stock card), fixed when the line was added: the percentage, and what it takes off one unit. */
  itemDiscountPercent?: number;
  itemDiscountPerUnit?: number;
  lineTotal: number;
  status: LineStatus;
  /** The company tax is not charged on this line. */
  taxExempt?: boolean;
  /** The unit price was the item's special price when the line was added. */
  onSpecial?: boolean;
  /** The item blocks discounts: none on this line, and a whole-bill discount skips it. */
  blockDiscount?: boolean;
  /** Set when the line sells a selling unit (a case): quantity counts units, each holding unitSize base units. */
  sellingUnitId?: string | null;
  unitSize?: number | null;
  /** Set when the line sells a package: its contents as sold, and the tax / discount split of its price when they are mixed. */
  package?: ProductPackageDto | null;
  /** True once the line has been sent (to the bar man, for a company that uses the bar man method). */
  confirmed: boolean;
  voidReason: string | null;
  voidPending: boolean;
  /** Bar man method only: where the line is at the bar. Absent or null when it never went to the bar (or was sent offline and has not synced). */
  barState?: BarLineState | null;
  /** The bar man's reason when barState is CantMake. */
  barNote?: string | null;
}

/**
 * Who authorises a void, proving it for that void: a staff code and PIN, OR an email and password (exactly one pair). Mirrors
 * VoidAuthorizationRequest in the API. Sent with the void and kept nowhere on the device.
 */
export interface VoidAuthorizer {
  staffCode?: string;
  pin?: string;
  email?: string;
  password?: string;
}

// ---- Bar man method (mirrors BarOrderDto and friends in the API's PosModels.cs) ---------------

export type BarLineState = 'Waiting' | 'Preparing' | 'Ready' | 'Collected' | 'CantMake';
export type BarOrderStatus = 'New' | 'Taken' | 'Ready' | 'Collected' | 'CantMake' | 'Cancelled';
export type BarItemStatus = 'Pending' | 'Done' | 'CantMake' | 'Cancelled';

export interface BarOrderItemDto {
  id: string;
  orderLineId: string;
  productName: string;
  quantity: number;
  seat: number | null;
  notes: string | null;
  modifiers: string[];
  status: BarItemStatus;
  cantMakeReason: string | null;
  acknowledged: boolean;
}

/** What one press of Send handed to the bar, with the bill it belongs to as it is now. */
export interface BarOrderDto {
  id: string;
  branchId: string;
  /** The station this ticket is for (null only for tickets from before stations). */
  stationId?: string | null;
  stationName?: string | null;
  orderId: string;
  orderNumber: number;
  orderKind: OrderKind;
  label: string | null;
  tableLabel: string | null;
  customerName: string | null;
  orderNotes: string | null;
  status: BarOrderStatus;
  requestedByMembershipId: string;
  requestedByName: string;
  sentAtUtc: string;
  takenByMembershipId: string | null;
  takenByName: string | null;
  takenAtUtc: string | null;
  readyAtUtc: string | null;
  collectedAtUtc: string | null;
  /** For the attendant: ready to collect, or an item cannot be made and they have not confirmed seeing that. */
  needsAttention: boolean;
  items: BarOrderItemDto[];
}

/** The live notice: ids only. The order itself is then read through the API. */
export interface BarOrderNotice {
  barOrderId: string;
  branchId: string;
  change: 'sent' | 'taken' | 'released' | 'cant_make' | 'ready' | 'collected' | 'cancelled';
}

export interface PaymentDto {
  id: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  tipAmount: number;
  cashTendered: number | null;
  changeGiven: number | null;
  provider: string;
  providerReference: string | null;
  failureReason: string | null;
  isDemo: boolean;
  completedAtUtc: string | null;
  refunded: number;
}

/** A preparation station (bar, kitchen, grill) and how it behaves. */
export interface StationDto {
  id: string;
  name: string;
  /** The bill cannot be paid until this station has marked its items ready. */
  holdsPayment: boolean;
  /** Stock leaves when the station marks the items ready; otherwise when the bill is sent. */
  stockWhenReady: boolean;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  groupCount: number;
  itemCount: number;
}

/** A table at a branch, and how many bills are running at it now. */
export interface TableDto {
  id: string;
  branchId: string;
  name: string;
  area: string | null;
  seats: number;
  isActive: boolean;
  sortOrder: number;
  openBills: number;
}

export interface OrderDto {
  /** The branch table this bill is for, when it is one of the branch's list. */
  tableId?: string | null;
  id: string;
  branchId: string;
  number: number;
  kind: OrderKind;
  status: OrderStatus;
  label: string | null;
  tableLabel: string | null;
  customerName: string | null;
  /** The customer record on the bill, if one was chosen (separate from the free-text name). */
  customerId?: string | null;
  customer?: { id: string; number: number; name: string; phone: string; pointsBalance: number } | null;
  /** Set when the bill came from an agent's report of consignment goods sold: its items and prices are fixed. */
  consignmentSaleId?: string | null;
  /** Set when the bill is a layby: its items are fixed and it is paid in parts. */
  layby?: { id: string; number: number; status: 'Active' | 'Completed' | 'Cancelled'; dueDate: string; minimumDeposit: number } | null;
  /** Loyalty points the lines on the bill are worth; the customer gets them when the bill is paid in full. */
  pointsOnBill?: number;
  /** Points this bill has given its customer so far. */
  pointsEarned?: number;
  notes: string | null;
  ownerMembershipId: string;
  ownerName: string | null;
  taxName: string;
  taxRatePercent: number;
  taxInclusive: boolean;
  currencyCode: string;
  subtotal: number;
  discountTotal: number;
  orderDiscount: number;
  taxTotal: number;
  tipAmount: number;
  total: number;
  amountPaid: number;
  refundedTotal: number;
  balance: number;
  openedAtUtc: string;
  closedAtUtc: string | null;
  mergedIntoOrderId: string | null;
  lines: OrderLineDto[];
  payments: PaymentDto[];
  hasPendingVoids: boolean;
  /** Bar man method: a supervisor or administrator allowed payment on this bill before the bar confirmed it. */
  paymentUnlocked?: boolean;
  rowVersion: string;
}

/** An order as the POS holds it: the server's view plus what is still waiting to sync. */
export interface LocalOrder extends OrderDto {
  /** True while the order (or a change to it) has not been confirmed by the server yet. */
  pendingSync: boolean;
  /** Offline-created orders have no server number until they sync. */
  numberPending: boolean;
}

export interface OrderSummaryDto {
  id: string;
  branchId: string;
  number: number;
  kind: OrderKind;
  status: OrderStatus;
  label: string | null;
  tableLabel: string | null;
  customerName: string | null;
  ownerMembershipId: string;
  total: number;
  balance: number;
  itemCount: number;
  openedAtUtc: string;
}

export interface SplitPreviewDto { balance: number; shares: number[] }

export interface VoidRequestDto {
  id: string;
  orderId: string;
  orderNumber: number;
  lineId: string | null;
  lineName: string | null;
  reason: string;
  status: VoidRequestStatus;
  requestedByMembershipId: string;
  dateCreated: string;
}

export interface ReceiptLineDto { name: string; quantity: number; unitPrice: number; lineTotal: number; modifiers: string[]; contents?: PackagePartDto[] }

export interface ReceiptDto {
  id: string;
  number: number;
  orderNumber: number;
  issuedAtUtc: string;
  /** Loyalty: the customer on the bill, what this bill earned them and their balance; absent when no customer was chosen. */
  loyaltyCustomer?: string | null;
  pointsEarned?: number | null;
  pointsBalance?: number | null;
  companyName: string;
  shortName: string;
  initialsFallback: string;
  logoUrl: string | null;
  tagline: string | null;
  header: string | null;
  footer: string | null;
  currencyCode: string;
  timeZoneId: string;
  branchName: string;
  label: string | null;
  servedBy: string | null;
  lines: ReceiptLineDto[];
  subtotal: number;
  discounts: number;
  taxName: string;
  taxRatePercent: number;
  taxInclusive: boolean;
  tax: number;
  tip: number;
  total: number;
  payments: PaymentDto[];
  change: number;
  printCount: number;
  isDemoPayment: boolean;
  /** The secret of the receipt's web link: the page is /r/{shareToken}. Absent on a receipt read before links existed. */
  shareToken?: string | null;
}

export interface PayRequest {
  method: PaymentMethod;
  amount: number;
  tip: number;
  cashTendered: number | null;
  token: string | null;
  idempotencyKey: string;
  rowVersion: string | null;
}

// ---- Offline sync -----------------------------------------------------------------------------

export type SyncKind =
  | 'order.create' | 'order.line.add' | 'order.line.update' | 'order.line.remove' | 'order.confirm'
  | 'order.discount' | 'order.tip' | 'payment.cash' | 'stock.adjust' | 'measurement.add'
  | 'shift.open' | 'shift.cash_movement' | 'shift.close';

export interface SyncOperationDto { clientOperationId: string; kind: SyncKind; payload: unknown; createdAtUtc: string }

export interface SyncOperationResultDto {
  clientOperationId: string;
  kind: SyncKind;
  outcome: 'applied' | 'duplicate' | 'rejected';
  code: string | null;
  message: string | null;
  result: unknown;
}

// ---- Inventory --------------------------------------------------------------------------------

export interface SupplierDto { id: string; name: string; contactName: string | null; email: string | null; phone: string | null; address: string | null; paymentTermsDays: number; isActive: boolean; isDemo: boolean; code?: string | null; taxId?: string | null; repName?: string | null; creditLimit?: number | null }

export interface SaveSupplierRequest { name: string; contactName: string | null; email: string | null; phone: string | null; address?: string | null; paymentTermsDays?: number; isActive: boolean; taxId?: string | null; repName?: string | null; creditLimit?: number | null }

export interface InventoryItemDto {
  id: string;
  name: string;
  sku: string | null;
  kind: InventoryItemKind;
  baseUnit: StockUnit;
  containerSize: number | null;
  tareGrams: number | null;
  densityGPerMl: number | null;
  minimumLevel: number;
  reorderLevel: number;
  targetDaysOfStock: number;
  /** Null when the signed-in role may not see costs. */
  averageCost: number | null;
  lastPurchaseCost: number | null;
  supplierId: string | null;
  tracksBatches: boolean;
  tracksSerials: boolean;
  groupId: string | null;
  groupName: string | null;
  barcode: string | null;
  description: string | null;
  purchaseUnitName: string | null;
  purchaseUnitSize: number | null;
  reorderQuantity: number;
  targetStock: number | null;
  listedOnWebStore: boolean;
  productId: string | null;
  sellingPrice: number | null;
  tradePrice?: number | null;
  wholesalePrice?: number | null;
  // ---- Stock card. Price fields are null without the selling-price right, cost fields without the cost right.
  resellerPrice?: number | null;
  bundlePrice?: number | null;
  specialPrice?: number | null;
  /** UTC on the wire; the card shows and takes them in the company's time zone. */
  specialFromUtc?: string | null;
  specialToUtc?: string | null;
  /** Taken off the price at the till by itself. The dates are optional: without them it always applies. */
  discountPercent?: number | null;
  discountFromUtc?: string | null;
  discountToUtc?: string | null;
  minimumPrice?: number | null;
  suggestedRetailPrice?: number | null;
  specialCost?: number | null;
  /** yyyy-MM-dd */
  specialCostFrom?: string | null;
  specialCostTo?: string | null;
  blockQtyFractions?: boolean;
  useScale?: boolean;
  printOnInvoice?: boolean;
  editQtyOnSales?: boolean;
  blockDiscount?: boolean;
  taxExempt?: boolean;
  pointsValue?: number;
  /** The item's own ledger accounts; null = as its stock group says, else the company's Sales / Stock account. */
  salesAccountId?: string | null;
  purchaseAccountId?: string | null;
  /** Where this item is prepared, overriding its stock group's station; null = as the group says. */
  stationId?: string | null;
  userPrompt?: string | null;
  notes?: string | null;
  onSpecial?: boolean;
  /** The item's own discount is in force right now. */
  discountLive?: boolean;
  hasPicture?: boolean;
  /** The item has package content: it holds no stock and sells for the total of its contents. */
  isPackage?: boolean;
  /** What customers are waiting for on sales back orders. */
  salesBackOrderQuantity?: number;
  /** What is held for customers on active laybys: still counted, not available to sell. */
  onLaybyQuantity?: number;
  /** What agents are holding on consignment: off the shelf, still the company's. */
  consignmentOutQuantity?: number;
  /** Filled when one item is read (the card); absent in lists. */
  onOrderQuantity?: number | null;
  lastSoldAtUtc?: string | null;
  lastReceiptAtUtc?: string | null;
  lastOrderedAtUtc?: string | null;
  isActive: boolean;
  isDemo: boolean;
  onHand: number;
  stockValue: number | null;
  lastMeasured: number | null;
  lastMeasuredAtUtc: string | null;
  belowMinimum: boolean;
  belowReorder: boolean;
  rowVersion: string;
}

export interface SaveInventoryItemRequest {
  name: string;
  sku: string | null;
  kind: InventoryItemKind;
  baseUnit: StockUnit;
  containerSize: number | null;
  tareGrams: number | null;
  densityGPerMl: number | null;
  minimumLevel: number;
  reorderLevel: number;
  targetDaysOfStock: number;
  averageCost: number;
  supplierId: string | null;
  tracksBatches: boolean;
  tracksSerials?: boolean;
  groupId?: string | null;
  barcode?: string | null;
  description?: string | null;
  purchaseUnitName?: string | null;
  purchaseUnitSize?: number | null;
  reorderQuantity?: number;
  targetStock?: number | null;
  listedOnWebStore?: boolean;
  sellingPrice?: number | null;
  tradePrice?: number | null;
  wholesalePrice?: number | null;
  // ---- Stock card. Price fields are null without the selling-price right, cost fields without the cost right.
  resellerPrice?: number | null;
  bundlePrice?: number | null;
  specialPrice?: number | null;
  /** UTC on the wire; the card shows and takes them in the company's time zone. */
  specialFromUtc?: string | null;
  specialToUtc?: string | null;
  /** Taken off the price at the till by itself. The dates are optional: without them it always applies. */
  discountPercent?: number | null;
  discountFromUtc?: string | null;
  discountToUtc?: string | null;
  minimumPrice?: number | null;
  suggestedRetailPrice?: number | null;
  specialCost?: number | null;
  /** yyyy-MM-dd */
  specialCostFrom?: string | null;
  specialCostTo?: string | null;
  blockQtyFractions?: boolean;
  useScale?: boolean;
  printOnInvoice?: boolean;
  editQtyOnSales?: boolean;
  blockDiscount?: boolean;
  taxExempt?: boolean;
  pointsValue?: number;
  /** The item's own ledger accounts; null = as its stock group says, else the company's Sales / Stock account. */
  salesAccountId?: string | null;
  purchaseAccountId?: string | null;
  /** Where this item is prepared, overriding its stock group's station; null = as the group says. */
  stationId?: string | null;
  userPrompt?: string | null;
  notes?: string | null;
  /** Cost of the most recent purchase; applied only with the cost right. */
  lastCost?: number | null;
  isActive: boolean;
  rowVersion: string | null;
}

export interface MovementDto {
  id: string;
  branchId: string;
  inventoryItemId: string;
  itemName: string;
  type: StockMovementType;
  quantityDelta: number;
  balanceAfter: number;
  unitCost: number | null;
  occurredAtUtc: string;
  actorMembershipId: string | null;
  referenceType: string | null;
  referenceId: string | null;
  reasonNote: string | null;
  reversesMovementId: string | null;
}

export interface AdjustStockRequest {
  branchId: string;
  inventoryItemId: string;
  type: StockMovementType;
  quantity: number;
  direction: 'up' | 'down' | null;
  reason: string;
  idempotencyKey: string;
}

export interface ReceiveLine { inventoryItemId: string; quantity: number; unitCost: number; lotCode: string | null; expiryDate: string | null; purchaseOrderLineId: string | null; taxRatePercent?: number; serials?: string[] }

export interface ReceiveGoodsRequest {
  branchId: string;
  supplierId: string | null;
  purchaseOrderId: string | null;
  reference: string | null;
  lines: ReceiveLine[];
  idempotencyKey: string;
}

export interface BatchDto {
  id: string;
  branchId: string;
  inventoryItemId: string;
  itemName: string;
  lotCode: string;
  expiryDate: string | null;
  quantityRemaining: number;
  expired: boolean;
  expiringSoon: boolean;
}

export interface PurchaseOrderLineDto {
  id: string;
  inventoryItemId: string;
  itemName: string;
  unit: StockUnit;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
}

export interface PurchaseOrderDto {
  id: string;
  number: number;
  branchId: string;
  supplierId: string | null;
  supplierName: string;
  status: PurchaseOrderStatus;
  isSuggested: boolean;
  suggestionReason: string | null;
  notes: string | null;
  approvedByMembershipId: string | null;
  approvedAtUtc: string | null;
  dateCreated: string;
  totalCost: number;
  expectedDeliveryDate: string | null;
  lines: PurchaseOrderLineDto[];
  rowVersion: string;
}

export interface SavePurchaseOrderRequest {
  branchId: string;
  supplierId: string;
  notes: string | null;
  expectedDeliveryDate?: string | null;
  /** One key per intended order: sending it twice returns the first draft. */
  idempotencyKey?: string;
  lines: { inventoryItemId: string; quantity: number; unitCost: number }[];
  rowVersion: string | null;
}

export interface TransferStockRequest {
  fromBranchId: string;
  toBranchId: string;
  notes: string | null;
  lines: { inventoryItemId: string; quantity: number }[];
  idempotencyKey: string;
}

export interface MeasurementDto {
  id: string;
  clientId: string;
  inventoryItemId: string;
  itemName: string;
  source: MeasurementSource;
  deviceId: string | null;
  stationId: string | null;
  isStable: boolean;
  grossGrams: number | null;
  tareGrams: number | null;
  netGrams: number | null;
  densityGPerMl: number | null;
  measuredQuantity: number;
  expectedQuantity: number;
  variance: number;
  variancePercent: number | null;
  severity: VarianceSeverity;
  operatorMembershipId: string;
  measuredAtUtc: string;
  note: string | null;
}

export interface AuditDto {
  id: string;
  number: number;
  branchId: string;
  kind: AuditKind;
  status: AuditStatus;
  stationId: string | null;
  shiftLabel: string | null;
  notes: string | null;
  startedByMembershipId: string;
  startedAtUtc: string;
  completedAtUtc: string | null;
  measurements: MeasurementDto[];
}

export interface AddMeasurementRequest {
  clientId: string;
  inventoryItemId: string;
  source: MeasurementSource;
  deviceId: string | null;
  stationId: string | null;
  isStable: boolean;
  grossGrams: number | null;
  tareGrams: number | null;
  manualQuantity: number | null;
  note: string | null;
  measuredAtUtc: string | null;
}

export interface VarianceDto {
  id: string;
  branchId: string;
  auditId: string;
  inventoryItemId: string;
  itemName: string;
  expectedQuantity: number;
  measuredQuantity: number;
  variance: number;
  variancePercent: number | null;
  severity: VarianceSeverity;
  source: MeasurementSource;
  stationId: string | null;
  shiftLabel: string | null;
  operatorMembershipId: string;
  measuredAtUtc: string;
  reviewed: boolean;
  reviewNote: string | null;
}

export interface UsageRowDto {
  inventoryItemId: string;
  itemName: string;
  unit: StockUnit;
  onHand: number;
  expectedConsumption: number;
  actualDepletion: number;
  averageDailyUsage: number;
  daysRemaining: number | null;
  low: boolean;
}

export interface VarianceSummaryRowDto { key: string; count: number; totalVariance: number; averagePercent: number; escalations: number }

export interface SuggestedLineDto {
  inventoryItemId: string;
  itemName: string;
  suggestedQuantity: number;
  onHand: number;
  averageDailyUsage: number;
  daysRemaining: number | null;
  unitCost: number;
  reason: string;
}

export interface SuggestedOrderDto { supplierId: string; supplierName: string; lines: SuggestedLineDto[] }
