// The kitchen programme (owner's decisions, 2026-11-21): batches, store issues, market runs and food cost. Mirrors the backend's KitchenModels.cs; keep in sync.

export type StockUnitName = 'Milliliter' | 'Gram' | 'Each';

export interface BatchIngredientDto {
  inventoryItemId: string;
  itemName: string;
  unit: StockUnitName;
  /** The USABLE amount one batch needs, in the ingredient's own unit. */
  quantity: number;
  usablePercent: number;
  /** What one batch takes off the shelf once trimming is allowed for. */
  shelfQuantity: number;
  unitCost: number | null;
}

export interface BatchRecipeDto {
  itemId: string;
  itemName: string;
  portionsPerBatch: number | null;
  ingredients: BatchIngredientDto[];
  costPerBatch: number | null;
  costPerPortion: number | null;
}

export interface SaveBatchRecipeRequest {
  portionsPerBatch: number;
  ingredients: { inventoryItemId: string; quantity: number; usablePercent: number | null }[];
}

export interface ProductionItemDto {
  itemId: string;
  name: string;
  unit: StockUnitName;
  portionsPerBatch: number;
  onHand: number;
  stationId: string | null;
  stationName: string | null;
  shelfLifeDays: number | null;
  ingredientCount: number;
  costPerPortion: number | null;
}

export interface RecordRunRequest { id: string; branchId: string; outputItemId: string; batches: number; actualPortions: number; note: string | null }

export interface ProductionRunDto {
  id: string;
  number: number;
  branchId: string;
  outputItemId: string;
  outputItemName: string;
  batches: number;
  expectedPortions: number;
  actualPortions: number;
  variance: number;
  variancePercent: number | null;
  totalCost: number | null;
  costPerPortion: number | null;
  lotCode: string;
  expiryDate: string | null;
  note: string | null;
  recordedByName: string;
  recordedAtUtc: string;
  lines: { ingredientItemId: string; ingredientName: string; quantity: number; cost: number | null }[];
}

export type StockIssueStatus = 'Requested' | 'Issued' | 'Received' | 'Cancelled';

export interface StockIssueLineDto {
  id: string;
  inventoryItemId: string;
  itemName: string;
  unit: StockUnitName;
  requested: number;
  issued: number | null;
  received: number | null;
  fromBinId: string | null;
  shortfall: number | null;
}

export interface StockIssueDto {
  id: string;
  number: number;
  branchId: string;
  stationId: string;
  stationName: string;
  status: StockIssueStatus;
  requestedByName: string;
  requestedAtUtc: string;
  issuedByName: string | null;
  issuedAtUtc: string | null;
  receivedByName: string | null;
  receivedAtUtc: string | null;
  note: string | null;
  cancelReason: string | null;
  lines: StockIssueLineDto[];
  rowVersion: string;
}

export type MarketRunStatus = 'ToConfirm' | 'Confirmed' | 'Queried';
export type MarketExpenseCategory = 'Transport' | 'LoadersAndCarriers' | 'LocalLeviesAndSecurity' | 'WaterAndSmallItems';

export const MARKET_EXPENSE_LABELS: Readonly<Record<MarketExpenseCategory, string>> = {
  Transport: 'Transport',
  LoadersAndCarriers: 'Loaders and carriers',
  LocalLeviesAndSecurity: 'Local levies and security',
  WaterAndSmallItems: 'Water and small items'
};

export interface MarketRunDto {
  id: string;
  number: number;
  branchId: string;
  marketName: string;
  ranOnUtc: string;
  buyerName: string;
  cashGiven: number;
  changeReturned: number;
  goodsTotal: number;
  expensesTotal: number;
  difference: number;
  status: MarketRunStatus;
  hasFlaggedExpense: boolean;
  binId: string | null;
  receiptMediaIds: string[];
  note: string | null;
  confirmedByName: string | null;
  confirmedAtUtc: string | null;
  confirmNote: string | null;
  lines: { id: string; inventoryItemId: string; itemName: string; unit: StockUnitName; quantity: number; amountPaid: number; unitCost: number; lotCode: string | null; expiryDate: string | null }[];
  expenses: { id: string; category: MarketExpenseCategory; amount: number; justification: string; flagged: boolean }[];
  rowVersion: string;
}

export interface RecordMarketRunRequest {
  id: string;
  branchId: string;
  marketName: string;
  cashGiven: number;
  changeReturned: number;
  binId: string | null;
  note: string | null;
  receiptMediaIds: string[];
  lines: { inventoryItemId: string; quantity: number; amountPaid: number; lotCode: string | null; expiryDate: string | null }[];
  expenses: { category: MarketExpenseCategory; amount: number; justification: string }[];
}

export interface FoodCostDishDto {
  productId: string;
  name: string;
  groupName: string | null;
  stationName: string | null;
  price: number;
  netPrice: number;
  costAverage: number | null;
  costLast: number | null;
  foodCostPercent: number | null;
  suggestedPrice: number | null;
  /** The dish's OWN food cost target, or null when it follows the screen's. */
  targetPercent: number | null;
  /** The target the suggested price was worked out for: the dish's own, else the screen's. */
  effectiveTargetPercent: number;
  /** Price including tax per 1 of price without tax: 1 when prices carry no tax or the dish is exempt. The page uses it to follow a typed price at once; the server stays the authority. */
  taxFactor: number;
  basis: string;
}

export interface FoodCostDto { targetPercent: number; taxInclusive: boolean; currencyCode: string; canSetPrices: boolean; dishes: FoodCostDishDto[] }

/** One dish's change. It carries a price, an own target, or clearTarget (back to following the screen's target). */
export interface FoodCostChange { productId: string; price?: number | null; targetPercent?: number | null; clearTarget?: boolean }
/** A dish the server could not save, with its own words; the others of the same request are saved. */
export interface FoodCostFailure { productId: string; name: string; message: string }
export interface FoodCostSaveResult { saved: string[]; failed: FoodCostFailure[]; cost: FoodCostDto }
