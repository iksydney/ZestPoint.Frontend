/**
 * What each report screen needs from the shared report page: which API path, which filters make sense, which views it offers.
 * The server decides what a report means and who may see it; this only shapes the filter bar. Paths are under /api/v1/.
 */
export interface FilterOption { readonly value: string; readonly label: string }

export interface ReportDefinition {
  readonly path: string;
  /** "range" = from/to dates, "asof" = a single snapshot date, "none" = no date filter. */
  readonly period: 'range' | 'asof' | 'none';
  readonly branch?: boolean;
  readonly group?: boolean;
  readonly item?: boolean;
  /** The report cannot run without an item (items history). */
  readonly itemRequired?: boolean;
  readonly supplier?: boolean;
  readonly supplierRequired?: boolean;
  readonly search?: string;
  readonly status?: { readonly label: string; readonly options: readonly FilterOption[] };
  readonly view?: { readonly label: string; readonly options: readonly FilterOption[]; readonly default: string };
  readonly compare?: boolean;
  readonly warningDays?: { readonly label: string; readonly default: number };
  readonly buckets?: boolean;
  /** Default sort key and direction (server-side). */
  readonly sort?: string;
  readonly desc?: boolean;
  /** Where a row can take you: item id column to items history / item maintenance. */
  readonly itemIdColumn?: string;
  /** Rows can be ticked (the re-order report) so the page can offer an action on the selection. */
  readonly selectable?: boolean;
}

const opts = (...pairs: [string, string][]): readonly FilterOption[] => pairs.map(([value, label]) => ({ value, label }));

export const REPORTS = {
  // ---- POS ---------------------------------------------------------------------------------------
  summaryIncome: {
    path: 'pos/reports/summary-income', period: 'range', branch: true, compare: true,
    status: { label: 'Sales status', options: opts(['', 'All completed'], ['paid', 'Paid'], ['refunded', 'Refunded']) }
  },
  dailySales: {
    path: 'pos/reports/daily-sales', period: 'range', branch: true,
    view: { label: 'Show by', default: 'day', options: opts(['day', 'Business day'], ['hour', 'Hour'], ['branch', 'Branch'], ['payment', 'Payment method'], ['terminal', 'Terminal']) },
    status: { label: 'Sales status', options: opts(['', 'All completed'], ['paid', 'Paid'], ['refunded', 'Refunded']) }
  },
  staffSales: {
    path: 'pos/reports/staff-sales', period: 'range', branch: true,
    view: { label: 'Show by', default: 'staff', options: opts(['staff', 'Staff member'], ['shift', 'Shift']) }
  },
  stockGroupSales: {
    path: 'pos/reports/stock-group-sales', period: 'range', branch: true, group: true, compare: true,
    view: { label: 'Show by', default: 'group', options: opts(['group', 'Stock group'], ['product', 'Product (pick a group to drill in)'], ['branch', 'Group by branch']) }
  },
  salesAnalysis: {
    path: 'pos/reports/sales-analysis', period: 'range', branch: true, group: true, compare: true,
    view: { label: 'Analyse by', default: 'day', options: opts(['day', 'Business day'], ['hour', 'Hour of day'], ['branch', 'Branch'], ['terminal', 'Terminal'], ['staff', 'Staff member'], ['product', 'Product'], ['group', 'Stock group'], ['payment', 'Payment method'], ['customer', 'Customer name']) },
    status: { label: 'Sales status', options: opts(['', 'All completed'], ['paid', 'Paid'], ['refunded', 'Refunded']) }
  },
  multiCurrency: {
    path: 'pos/reports/multi-currency', period: 'range', branch: true,
    view: { label: 'Show', default: 'currency', options: opts(['currency', 'By currency'], ['transactions', 'Bills in other currencies']) }
  },
  /** Every voided item with who asked and who authorised it. Read by people who may authorise voids. */
  voidHistory: { path: 'pos/reports/void-history', period: 'range', branch: true, search: 'Item or reason' },

  /** What customers are waiting for. Waiting ones unless another status is chosen. */
  salesBackOrders: {
    path: 'pos/reports/sales-back-orders', period: 'none', branch: true, search: 'Customer, phone or item',
    status: { label: 'Status', options: opts(['', 'Waiting'], ['Supplied', 'Supplied'], ['Cancelled', 'Cancelled'], ['all', 'All']) }
  },

  /** Laybys: what each is worth, what is paid and what is still owed. Active ones unless another status is chosen. */
  laybys: {
    path: 'pos/reports/laybys', period: 'none', branch: true, search: 'Customer, phone or layby number',
    status: { label: 'Status', options: opts(['', 'Active'], ['overdue', 'Overdue'], ['completed', 'Completed'], ['cancelled', 'Cancelled'], ['all', 'All']) }
  },

  // ---- Stock -------------------------------------------------------------------------------------
  itemsEnquiry: {
    path: 'inventory/reports/items-enquiry', period: 'none', branch: true, group: true, search: 'Name, SKU, barcode or other part number', itemIdColumn: 'itemId',
    status: { label: 'Item status', options: opts(['', 'Active'], ['inactive', 'Inactive'], ['all', 'All']) },
    view: { label: 'Show', default: 'item', options: opts(['item', 'One row per item'], ['branch', 'Stock by branch']) }
  },
  transactions: {
    path: 'inventory/reports/transactions', period: 'range', branch: true, group: true, item: true, search: 'Reference, note or document id', itemIdColumn: 'itemId', desc: true, sort: 'date',
    view: { label: 'Movement type', default: '', options: opts(['', 'All movements'], ['Receipt', 'Receipt'], ['Sale', 'Sale'], ['SaleReversal', 'Sale reversal'], ['Adjustment', 'Adjustment'], ['Waste', 'Waste'], ['Spillage', 'Spillage'], ['Breakage', 'Breakage'], ['TransferIn', 'Transfer in'], ['TransferOut', 'Transfer out'], ['Return', 'Return'], ['AuditCorrection', 'Audit correction'], ['Opening', 'Opening stock']) }
  },
  quantities: {
    path: 'inventory/reports/quantities', period: 'none', branch: true, group: true, search: 'Name, SKU, barcode or other part number', itemIdColumn: 'itemId',
    view: { label: 'Show', default: 'item', options: opts(['item', 'Item by branch'], ['group', 'Summary by group'], ['compare', 'Branch comparison']) },
    status: { label: 'Item status', options: opts(['', 'Active'], ['inactive', 'Inactive'], ['all', 'All']) }
  },
  sellingPrices: {
    path: 'inventory/reports/selling-prices', period: 'none', group: true, search: 'Name, SKU or barcode',
    status: { label: 'Product status', options: opts(['', 'Active'], ['inactive', 'Inactive'], ['all', 'All']) }
  },
  costPrices: {
    path: 'inventory/reports/cost-prices', period: 'none', group: true, supplier: true, search: 'Name, SKU or barcode',
    view: { label: 'Show', default: '', options: opts(['', 'All items'], ['missing', 'Missing cost only']) }
  },
  performance: { path: 'inventory/reports/performance', period: 'range', branch: true, group: true, search: 'Name, SKU or barcode', compare: true, itemIdColumn: 'itemId' },
  outOfStock: { path: 'inventory/reports/out-of-stock', period: 'none', branch: true, group: true, search: 'Name, SKU or barcode', itemIdColumn: 'itemId' },
  reorder: {
    path: 'inventory/reports/re-order', period: 'none', branch: true, group: true, supplier: true, search: 'Name, SKU or barcode', selectable: true,
    status: { label: 'Order status', options: opts(['', 'All'], ['Order needed', 'Order needed'], ['Covered by orders', 'Covered by orders'], ['Needs a target', 'Needs a target']) }
  },
  stockTake: {
    path: 'inventory/reports/stock-take', period: 'range', branch: true,
    view: { label: 'Show', default: 'sessions', options: opts(['sessions', 'Stock takes'], ['variances', 'Variances by item']) },
    status: { label: 'Status', options: opts(['', 'Any'], ['Draft', 'Draft'], ['Counting', 'Counting'], ['Submitted', 'Submitted'], ['Approved', 'Approved'], ['Rejected', 'Rejected'], ['Reconciled', 'Reconciled'], ['Cancelled', 'Cancelled']) }
  },
  stockValue: {
    path: 'inventory/reports/stock-value', period: 'none', branch: true, group: true, search: 'Name, SKU or barcode', itemIdColumn: 'itemId',
    view: { label: 'Show', default: 'item', options: opts(['item', 'Item by branch'], ['group', 'Group by branch'], ['branch', 'Branch totals']) },
    status: { label: 'Item status', options: opts(['all', 'All items'], ['', 'Active only'], ['inactive', 'Inactive only']) }
  },
  itemsHistory: { path: 'inventory/reports/items-history', period: 'range', branch: true, item: true, itemRequired: true },
  expiry: {
    path: 'inventory/reports/expiry', period: 'none', branch: true, group: true, search: 'Name, SKU or barcode', warningDays: { label: 'Warn within (days)', default: 30 },
    status: { label: 'Status', options: opts(['', 'All'], ['expired', 'Expired'], ['expiringsoon', 'Expiring soon'], ['ok', 'OK']) }
  },
  webStore: {
    path: 'inventory/reports/web-store-stock', period: 'none', branch: true, group: true, search: 'Name, SKU or barcode',
    status: { label: 'Items', options: opts(['', 'Flagged for the web store'], ['all', 'All items']) }
  },
  stockAging: { path: 'inventory/reports/stock-aging', period: 'asof', branch: true, group: true, search: 'Name, SKU or barcode', buckets: true, warningDays: { label: 'Slow-moving after (days)', default: 90 } },
  serialNumbers: {
    path: 'inventory/reports/serial-numbers', period: 'none', branch: true, item: true, search: 'Serial number, product or SKU',
    status: { label: 'Serial status', options: opts(['', 'Any'], ['InStock', 'In stock'], ['Sold', 'Sold'], ['Returned', 'Returned'], ['Damaged', 'Damaged'], ['Dispatched', 'Dispatched']) }
  },

  binStock: {
    path: 'inventory/reports/bin-stock', period: 'none', branch: true, item: true, search: 'Item name, SKU or barcode',
    status: { label: 'Bins', options: opts(['', 'All bins'], ['UNASSIGNED', 'Not in any bin']) }
  },

  // ---- Purchasing --------------------------------------------------------------------------------
  suppliersList: {
    path: 'purchasing/reports/suppliers-list', period: 'none', search: 'Name, contact or e-mail',
    status: { label: 'Supplier status', options: opts(['', 'Active'], ['inactive', 'Inactive'], ['all', 'All']) }
  },
  purchases: { path: 'purchasing/reports/purchases', period: 'range', branch: true, supplier: true, item: true, group: true, search: 'Item, SKU or receipt reference', desc: true, sort: 'date' },
  purchaseOrders: {
    path: 'purchasing/reports/purchase-orders', period: 'range', branch: true, supplier: true,
    status: { label: 'Order status', options: opts(['', 'Any'], ['Draft', 'Draft'], ['Submitted', 'Submitted'], ['Approved', 'Approved'], ['PartiallyReceived', 'Partly received'], ['Received', 'Received'], ['Cancelled', 'Cancelled']) }
  },
  summaryPurchases: {
    path: 'purchasing/reports/summary-purchases', period: 'range', branch: true, supplier: true, group: true,
    view: { label: 'Total by', default: 'supplier', options: opts(['supplier', 'Supplier'], ['month', 'Month'], ['branch', 'Branch'], ['group', 'Stock group']) }
  },
  agedSuppliers: { path: 'purchasing/reports/aged-suppliers', period: 'asof', supplier: true, buckets: true },
  statementOfAccount: { path: 'purchasing/reports/statement-of-account', period: 'range', supplier: true, supplierRequired: true },
  purchaseAnalysis: {
    path: 'purchasing/reports/purchase-analysis', period: 'range', branch: true, supplier: true, group: true,
    view: { label: 'Analyse by', default: 'item', options: opts(['item', 'Item'], ['supplier', 'Supplier']) }
  },
  backOrders: {
    path: 'purchasing/reports/back-orders', period: 'none', branch: true, supplier: true,
    status: { label: 'Show', options: opts(['', 'All outstanding'], ['overdue', 'Overdue only']) }
  },
  stockOnOrder: { path: 'purchasing/reports/stock-on-order', period: 'none', branch: true, group: true, search: 'Item or SKU' },
  purchasesTax: {
    path: 'purchasing/reports/purchases-tax', period: 'range', branch: true, supplier: true,
    view: { label: 'Total by', default: 'rate', options: opts(['rate', 'Tax rate'], ['supplier', 'Supplier'], ['month', 'Month']) }
  },
  purchasePayments: {
    path: 'purchasing/reports/purchase-payments', period: 'range', supplier: true,
    view: { label: 'Method', default: '', options: opts(['', 'All methods'], ['Cash', 'Cash'], ['Card', 'Card'], ['Transfer', 'Transfer'], ['Other', 'Other']) }
  },
  equivalentPartNumbers: {
    path: 'purchasing/reports/equivalent-part-numbers', period: 'none', supplier: true, item: true, search: 'Part number, item or SKU',
    view: { label: 'Code type', default: '', options: opts(['', 'All codes'], ['Equivalent', 'Equivalent part numbers'], ['SupplierPartNumber', 'Supplier part numbers']) }
  },

  // ---- Ledger ------------------------------------------------------------------------------------
  /** Each of these first brings the ledger up to date on the server, so it includes everything that has happened. */
  trialBalance: { path: 'ledger/reports/trial-balance', period: 'range', branch: true },
  profitAndLoss: { path: 'ledger/reports/profit-and-loss', period: 'range', branch: true },
  ledgerJournal: { path: 'ledger/reports/journal', period: 'range', branch: true, search: 'Account code, account name or description' }
} as const satisfies Record<string, ReportDefinition>;
