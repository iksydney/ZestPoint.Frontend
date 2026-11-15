import { Type } from '@angular/core';
import { FEATURES, FeatureCode, SCREEN_PERMISSIONS } from '../models/rbac.model';
import { REPORTS, ReportDefinition } from './report-definitions';

const P = SCREEN_PERMISSIONS;

/** Icon keys drawn by the sidebar (inline SVG, so no icon library is needed). */
export type NavIcon = 'home' | 'cart' | 'clock' | 'chart' | 'file' | 'box' | 'layers' | 'edit' | 'globe' | 'adjust' | 'clipboard' | 'tag' | 'printer' | 'calendar'
  | 'search' | 'truck' | 'wallet' | 'users' | 'settings' | 'card' | 'branch' | 'palette' | 'recipe' | 'list' | 'inbox' | 'grid';

export type NavGroupKey = 'pos' | 'stock' | 'purchasing' | 'ledger';

/** A submenu: a titled, expandable group of screens. */
export interface NavGroup {
  readonly key: NavGroupKey;
  readonly label: string;
  readonly icon: NavIcon;
  readonly kind: 'submenu';
}

/** One screen. The id is stable: authorisation and routing never derive from the label or the shortcut. */
export interface NavDefinition {
  readonly key: string;
  readonly label: string;
  readonly route: string;
  readonly icon: NavIcon;
  /** A permission, or a list of which any one is enough. The API re-checks it on every call. */
  readonly permission: string | readonly string[];
  /** Subscription module the screen belongs to; a `locked` module hides it from the menu. */
  readonly feature?: FeatureCode;
  /** The legacy menu the screen sat in. Not what lays the menu out any more: see nav-layout.ts (areas, order, menu names, help text). */
  readonly group?: NavGroupKey;
  readonly kind: 'screen';
  /** The key this screen had in the legacy menu. No longer used: the menu keys were dropped for search (Ctrl+K) on 2026-11-14. Kept as a record. */
  readonly shortcut?: string;
  /** True when the screen works on the branch picked in the header. */
  readonly needsBranch?: boolean;
  readonly quickAccess?: boolean;
  /** Lazy component for a screen routed from this list. Screens routed by hand in app.routes omit it. */
  readonly load?: () => Promise<Type<unknown>>;
  /** Extra route data (the report definition of a report screen). */
  readonly data?: { readonly report: ReportDefinition };
  readonly description?: string;
}

const reportPage = () => import('../../features/reports/report-page.component').then((m) => m.ReportPageComponent);

const report = (
  key: string, label: string, slug: string, group: NavGroupKey, def: ReportDefinition, permission: string, feature: FeatureCode, shortcut: string, icon: NavIcon = 'file', description?: string
): NavDefinition => ({
  key, label, route: `/app/${slug}`, icon, permission, feature, group, kind: 'screen', shortcut, data: { report: def }, load: reportPage, description
});

/**
 * Every screen of the signed-in application, in menu order. The sidebar, breadcrumbs, search, the landing redirect and the route table
 * all read this one list, so a screen cannot be offered in one place and routed or protected differently in another.
 */
export const APP_NAV: readonly NavDefinition[] = [
  { key: 'dashboard', label: 'Dashboard', route: '/app/dashboard', icon: 'home', permission: P.DASHBOARD_VIEW, kind: 'screen' },

  // ---- POS ---------------------------------------------------------------------------------------
  { key: 'pos', label: 'Point of Sale', route: '/app/pos', icon: 'cart', permission: P.POS_VIEW, feature: FEATURES.CORE_POS, group: 'pos', kind: 'screen', needsBranch: true, quickAccess: true,
    load: () => import('../../features/pos-billing/pos-billing.component').then((m) => m.PosBillingComponent), description: 'Open tabs, take orders and payments.' },
  { key: 'pos.day', label: 'Start / End of Day', route: '/app/pos/day-management', icon: 'clock', permission: P.POS_DAY_VIEW, feature: FEATURES.CORE_POS, group: 'pos', kind: 'screen', needsBranch: true, quickAccess: true,
    load: () => import('../../features/pos-billing/day-management.component').then((m) => m.DayManagementComponent), description: 'Start your shift, count the till and close.' },
  { key: 'pos.sales', label: 'My Sales', route: '/app/pos/my-sales', icon: 'clipboard', permission: P.POS_SALES_VIEW_OWN, feature: FEATURES.CORE_POS, group: 'pos', kind: 'screen', needsBranch: true,
    load: () => import('../../features/pos-billing/my-sales.component').then((m) => m.MySalesComponent), description: 'The bills you served or took payment on, and their receipts to share.' },
  // The bar man method. The menu offers it only to a company that uses the method (the shell filters on that); the route and the API are guarded as usual.
  { key: 'pos.bar', label: 'Bar Orders', route: '/app/pos/bar-orders', icon: 'inbox', permission: P.POS_BAR_ORDER_FULFIL, feature: FEATURES.CORE_POS, group: 'pos', kind: 'screen', needsBranch: true,
    load: () => import('../../features/pos-billing/bar-orders.component').then((m) => m.BarOrdersComponent), description: 'Orders sent by attendants: take, make and dispatch them.' },
  report('pos.report.income', 'Summary Income Report', 'pos/reports/summary-income', 'pos', REPORTS.summaryIncome, P.REPORTS_INCOME_VIEW, FEATURES.CORE_POS, '1', 'chart'),
  report('pos.report.daily', 'Daily Sales Report', 'pos/reports/daily-sales', 'pos', REPORTS.dailySales, P.REPORTS_DAILY_SALES_VIEW, FEATURES.CORE_POS, '2', 'calendar'),
  report('pos.report.staff', 'Staff Sales Report', 'pos/reports/staff-sales', 'pos', REPORTS.staffSales, P.REPORTS_STAFF_SALES_VIEW, FEATURES.CORE_POS, '3', 'users'),
  report('pos.report.groups', 'Stock Groups Sales Report', 'pos/reports/stock-group-sales', 'pos', REPORTS.stockGroupSales, P.REPORTS_STOCK_GROUP_SALES_VIEW, FEATURES.CORE_POS, '4', 'layers'),
  report('pos.report.analysis', 'Sales Analysis Report', 'pos/reports/sales-analysis', 'pos', REPORTS.salesAnalysis, P.REPORTS_SALES_ANALYSIS_VIEW, FEATURES.ADVANCED_ANALYTICS, '5', 'chart'),
  report('pos.report.currency', 'Multi-Currency Report', 'pos/reports/multi-currency', 'pos', REPORTS.multiCurrency, P.REPORTS_MULTI_CURRENCY_VIEW, FEATURES.FINANCIAL_REPORTING, '6', 'globe'),
  { key: 'pos.tips', label: 'Tips', route: '/app/pos/tips', icon: 'wallet', permission: P.POS_TIPS_MANAGE, feature: FEATURES.CORE_POS, group: 'pos', kind: 'screen', needsBranch: true,
    load: () => import('../../features/pos-billing/tips.component').then((m) => m.TipsComponent), description: 'Tips collected per staff member, and every payout or donation out of them.' },
  report('pos.report.tips', 'Tips Report', 'pos/reports/tips', 'pos', REPORTS.tips, P.POS_TIPS_MANAGE, FEATURES.CORE_POS, '8', 'wallet', 'Tips per staff member and per bill, and what was paid out or donated.'),
  report('pos.report.payments', 'Payments History', 'pos/reports/payments-history', 'pos', REPORTS.paymentsHistory, P.REPORTS_INCOME_VIEW, FEATURES.CORE_POS, '9', 'clipboard', 'Every payment taken, with filters for checking the drawer, the terminal and the bank.'),
  report('pos.report.voids', 'Void History Report', 'pos/reports/void-history', 'pos', REPORTS.voidHistory, P.POS_VOID_APPROVE, FEATURES.CORE_POS, '7', 'clipboard', 'Every void: what, why, who asked and who authorised it.'),
  { key: 'pos.laybys', label: 'Laybys', route: '/app/pos/laybys', icon: 'wallet', permission: P.POS_LAYBY_MANAGE, feature: FEATURES.CORE_POS, group: 'pos', kind: 'screen', shortcut: 'l', needsBranch: true,
    load: () => import('../../features/customers/laybys.component').then((m) => m.LaybysComponent), description: 'Goods customers are paying off: take payments, or cancel one.' },
  report('pos.report.laybys', 'Layby Report', 'pos/reports/laybys', 'pos', REPORTS.laybys, P.POS_LAYBY_MANAGE, FEATURES.CORE_POS, 'y', 'wallet'),
  { key: 'pos.backorders', label: 'Sales Back Orders', route: '/app/pos/back-orders', icon: 'inbox', permission: P.CUSTOMERS_USE, feature: FEATURES.CORE_POS, group: 'pos', kind: 'screen', shortcut: '8', needsBranch: true,
    load: () => import('../../features/customers/sales-back-orders.component').then((m) => m.SalesBackOrdersComponent), description: 'What customers are waiting for; put one on a bill when it can be supplied.' },
  report('pos.report.backorders', 'Sales Back Order Report', 'pos/reports/sales-back-orders', 'pos', REPORTS.salesBackOrders, P.CUSTOMERS_USE, FEATURES.CORE_POS, '9', 'clipboard'),

  // ---- Stock -------------------------------------------------------------------------------------
  { key: 'stock.items', label: 'Add / Modify Stock', route: '/app/inventory/items', icon: 'edit', permission: P.INVENTORY_ITEMS_MANAGE, feature: FEATURES.INVENTORY, group: 'stock', kind: 'screen', quickAccess: true,
    load: () => import('../../features/inventory/item-maintenance.component').then((m) => m.ItemMaintenanceComponent), description: 'Create and edit stock items.' },
  { key: 'stock.groups', label: 'Stock Group Maintenance', route: '/app/inventory/groups', icon: 'layers', permission: P.INVENTORY_GROUPS_VIEW, feature: FEATURES.INVENTORY, group: 'stock', kind: 'screen',
    load: () => import('../../features/inventory/stock-groups.component').then((m) => m.StockGroupsComponent) },
  { key: 'stock.global', label: 'Global Stock Maintenance', route: '/app/inventory/global-maintenance', icon: 'globe', permission: P.INVENTORY_GLOBAL_MANAGE, feature: FEATURES.INVENTORY, group: 'stock', kind: 'screen',
    load: () => import('../../features/inventory/global-maintenance.component').then((m) => m.GlobalMaintenanceComponent) },
  { key: 'stock.adjust', label: 'Stock Qty Adjustments', route: '/app/inventory/adjustments', icon: 'adjust', permission: [P.INVENTORY_STOCK_ADJUST, P.INVENTORY_STOCK_ADJUST_APPROVE], feature: FEATURES.INVENTORY, group: 'stock', kind: 'screen', needsBranch: true,
    load: () => import('../../features/inventory/adjustments.component').then((m) => m.AdjustmentsComponent) },
  report('stock.report.items', 'Items Enquiry Report', 'inventory/reports/items-enquiry', 'stock', REPORTS.itemsEnquiry, P.INVENTORY_REPORT_ITEMS, FEATURES.INVENTORY, '1', 'search'),
  report('stock.report.transactions', 'Stock Transactions Enquiry Report', 'inventory/reports/transactions', 'stock', REPORTS.transactions, P.INVENTORY_REPORT_TRANSACTIONS, FEATURES.INVENTORY, '2', 'list'),
  report('stock.report.quantities', 'Stock Quantities Report', 'inventory/reports/quantities', 'stock', REPORTS.quantities, P.INVENTORY_REPORT_QUANTITIES, FEATURES.INVENTORY, '3', 'box'),
  report('stock.report.selling', 'Selling Prices Report', 'inventory/reports/selling-prices', 'stock', REPORTS.sellingPrices, P.INVENTORY_REPORT_SELLING_PRICES, FEATURES.INVENTORY, '4', 'tag'),
  report('stock.report.cost', 'Cost Prices Report', 'inventory/reports/cost-prices', 'stock', REPORTS.costPrices, P.INVENTORY_REPORT_COST_PRICES, FEATURES.INVENTORY, '5', 'tag'),
  report('stock.report.performance', 'Stock Performance Report', 'inventory/reports/performance', 'stock', REPORTS.performance, P.INVENTORY_REPORT_PERFORMANCE, FEATURES.INVENTORY, '6', 'chart'),
  report('stock.report.out', 'Out of Stock Report', 'inventory/reports/out-of-stock', 'stock', REPORTS.outOfStock, P.INVENTORY_REPORT_OUT_OF_STOCK, FEATURES.INVENTORY, '7', 'box'),
  { key: 'stock.report.reorder', label: 'Stock Re-Order Report', route: '/app/inventory/reports/re-order', icon: 'truck', permission: P.INVENTORY_REPORT_REORDER, feature: FEATURES.INVENTORY, group: 'stock', kind: 'screen', shortcut: '8',
    data: { report: REPORTS.reorder }, load: () => import('../../features/inventory/reorder.component').then((m) => m.ReorderComponent) },
  { key: 'stock.report.stocktake', label: 'Stock Take Report', route: '/app/inventory/reports/stock-take', icon: 'clipboard', permission: P.INVENTORY_STOCKTAKE_VIEW, feature: FEATURES.INVENTORY, group: 'stock', kind: 'screen', shortcut: '9', needsBranch: true,
    data: { report: REPORTS.stockTake }, load: () => import('../../features/inventory/stock-take.component').then((m) => m.StockTakeComponent) },
  report('stock.report.value', 'Stock Value Report', 'inventory/reports/stock-value', 'stock', REPORTS.stockValue, P.INVENTORY_REPORT_VALUE, FEATURES.INVENTORY, 'v', 'wallet'),
  report('stock.report.history', 'Items History Report', 'inventory/reports/items-history', 'stock', REPORTS.itemsHistory, P.INVENTORY_REPORT_HISTORY, FEATURES.INVENTORY, 'h', 'clock'),
  { key: 'stock.labels', label: 'Stock Labels Printing', route: '/app/inventory/reports/stock-labels', icon: 'printer', permission: P.INVENTORY_LABELS_PRINT, feature: FEATURES.INVENTORY, group: 'stock', kind: 'screen', shortcut: 'b',
    load: () => import('../../features/inventory/labels.component').then((m) => m.LabelsComponent) },
  report('stock.report.expiry', 'Stock Expiry Report', 'inventory/reports/expiry', 'stock', REPORTS.expiry, P.INVENTORY_REPORT_EXPIRY, FEATURES.INVENTORY, 'x', 'calendar'),
  report('stock.report.web', 'Web Store Stock Report', 'inventory/reports/web-store-stock', 'stock', REPORTS.webStore, P.INVENTORY_REPORT_WEB_STORE, FEATURES.INVENTORY, 'w', 'globe'),
  report('stock.report.aging', 'Stock Aging Report', 'inventory/reports/stock-aging', 'stock', REPORTS.stockAging, P.INVENTORY_REPORT_AGING, FEATURES.INVENTORY, 'g', 'clock'),
  { key: 'stock.bins', label: 'Bin Locations', route: '/app/inventory/bins', icon: 'grid', permission: P.INVENTORY_BINS_VIEW, feature: FEATURES.INVENTORY, group: 'stock', kind: 'screen', shortcut: 'k', needsBranch: true,
    load: () => import('../../features/inventory/bins.component').then((m) => m.BinsComponent), description: 'Shelves, cages and cellars, and what each holds.' },
  report('stock.report.bins', 'Stock by Bin Report', 'inventory/reports/bin-stock', 'stock', REPORTS.binStock, P.INVENTORY_REPORT_BIN_STOCK, FEATURES.INVENTORY, 'n', 'grid'),
  { key: 'stock.report.serials', label: 'Serial Numbers Report', route: '/app/inventory/reports/serial-numbers', icon: 'list', permission: P.INVENTORY_REPORT_SERIAL_NUMBERS, feature: FEATURES.INVENTORY, group: 'stock', kind: 'screen', shortcut: 's',
    data: { report: REPORTS.serialNumbers }, load: () => import('../../features/inventory/serials.component').then((m) => m.SerialsComponent) },
  { key: 'stock.consignment', label: 'Consignment Out', route: '/app/inventory/consignment', icon: 'truck', permission: P.INVENTORY_CONSIGNMENT_MANAGE, feature: FEATURES.INVENTORY, group: 'stock', kind: 'screen', shortcut: 'c', needsBranch: true,
    load: () => import('../../features/inventory/consignments.component').then((m) => m.ConsignmentsComponent), description: 'Goods sent to agents to sell for you: send, record sold and returned.' },
  report('stock.report.consignment', 'Consignment Out Report', 'inventory/reports/consignment-out', 'stock', REPORTS.consignmentOut, P.INVENTORY_CONSIGNMENT_MANAGE, FEATURES.INVENTORY, 'o', 'truck'),

  // ---- Purchasing --------------------------------------------------------------------------------
  { key: 'purchasing.orders', label: 'Purchasing / Purchase Orders', route: '/app/purchasing/orders', icon: 'truck', permission: [P.INVENTORY_PURCHASE_MANAGE, P.INVENTORY_PURCHASE_APPROVE], feature: FEATURES.INVENTORY, group: 'purchasing', kind: 'screen', needsBranch: true, quickAccess: true,
    load: () => import('../../features/purchasing/purchase-orders-page.component').then((m) => m.PurchaseOrdersPageComponent) },
  { key: 'purchasing.receiving', label: 'Goods Receiving', route: '/app/purchasing/receiving', icon: 'inbox', permission: P.PURCHASING_RECEIVE, feature: FEATURES.INVENTORY, group: 'purchasing', kind: 'screen', shortcut: 'r', needsBranch: true, quickAccess: true,
    load: () => import('../../features/purchasing/receiving-queue.component').then((m) => m.ReceivingQueueComponent), description: 'Check deliveries against their orders and put them away.' },
  { key: 'purchasing.payments', label: 'Payments to Suppliers', route: '/app/purchasing/payments', icon: 'wallet', permission: P.PURCHASING_PAYMENTS_VIEW, feature: FEATURES.INVENTORY, group: 'purchasing', kind: 'screen',
    load: () => import('../../features/purchasing/supplier-payments.component').then((m) => m.SupplierPaymentsComponent) },
  { key: 'purchasing.suppliers', label: 'Add / Modify Suppliers', route: '/app/purchasing/suppliers', icon: 'edit', permission: P.INVENTORY_PURCHASE_MANAGE, feature: FEATURES.INVENTORY, group: 'purchasing', kind: 'screen',
    load: () => import('../../features/purchasing/suppliers.component').then((m) => m.SuppliersComponent) },
  report('purchasing.report.suppliers', "Supplier's List Report", 'purchasing/reports/suppliers-list', 'purchasing', REPORTS.suppliersList, P.PURCHASING_REPORTS_VIEW, FEATURES.INVENTORY, '1', 'list'),
  report('purchasing.report.purchases', 'Purchases Report', 'purchasing/reports/purchases', 'purchasing', REPORTS.purchases, P.PURCHASING_REPORTS_VIEW, FEATURES.INVENTORY, '2', 'file'),
  report('purchasing.report.orders', 'Purchase Orders Report', 'purchasing/reports/purchase-orders', 'purchasing', REPORTS.purchaseOrders, P.PURCHASING_REPORTS_VIEW, FEATURES.INVENTORY, '3', 'clipboard'),
  report('purchasing.report.summary', 'Summary Purchases Report', 'purchasing/reports/summary-purchases', 'purchasing', REPORTS.summaryPurchases, P.PURCHASING_REPORTS_VIEW, FEATURES.INVENTORY, '4', 'chart'),
  report('purchasing.report.aged', 'Aged Suppliers Report', 'purchasing/reports/aged-suppliers', 'purchasing', REPORTS.agedSuppliers, P.PURCHASING_REPORTS_VIEW, FEATURES.INVENTORY, '5', 'clock'),
  report('purchasing.report.statement', "Supplier's Statement of Account", 'purchasing/reports/statement-of-account', 'purchasing', REPORTS.statementOfAccount, P.PURCHASING_REPORTS_VIEW, FEATURES.INVENTORY, '6', 'file'),
  report('purchasing.report.analysis', 'Purchase Analysis Report', 'purchasing/reports/purchase-analysis', 'purchasing', REPORTS.purchaseAnalysis, P.PURCHASING_REPORTS_VIEW, FEATURES.INVENTORY, '7', 'chart'),
  report('purchasing.report.back', 'Back Orders Report', 'purchasing/reports/back-orders', 'purchasing', REPORTS.backOrders, P.PURCHASING_REPORTS_VIEW, FEATURES.INVENTORY, '8', 'truck'),
  report('purchasing.report.onorder', 'Stock On Order Report', 'purchasing/reports/stock-on-order', 'purchasing', REPORTS.stockOnOrder, P.PURCHASING_REPORTS_VIEW, FEATURES.INVENTORY, '9', 'box'),
  report('purchasing.report.tax', 'Purchases Tax Report', 'purchasing/reports/purchases-tax', 'purchasing', REPORTS.purchasesTax, P.PURCHASING_REPORTS_VIEW, FEATURES.INVENTORY, 'x', 'file'),
  report('purchasing.report.payments', 'Purchase Payments Report', 'purchasing/reports/purchase-payments', 'purchasing', REPORTS.purchasePayments, P.PURCHASING_PAYMENTS_VIEW, FEATURES.INVENTORY, 'y', 'wallet'),
  report('purchasing.report.equivalent', 'Equivalent Part Numbers Report', 'purchasing/reports/equivalent-part-numbers', 'purchasing', REPORTS.equivalentPartNumbers, P.PURCHASING_REPORTS_VIEW, FEATURES.INVENTORY, 'q', 'tag'),

  // ---- Ledger ------------------------------------------------------------------------------------
  { key: 'ledger.accounts', label: 'Chart of Accounts', route: '/app/ledger/accounts', icon: 'wallet', permission: P.LEDGER_VIEW, feature: FEATURES.FINANCIAL_REPORTING, group: 'ledger', kind: 'screen', shortcut: '1',
    load: () => import('../../features/ledger/ledger-accounts.component').then((m) => m.LedgerAccountsComponent), description: 'The accounts of the ledger and what each holds today.' },
  report('ledger.report.trial', 'Trial Balance', 'ledger/reports/trial-balance', 'ledger', REPORTS.trialBalance, P.LEDGER_VIEW, FEATURES.FINANCIAL_REPORTING, '2', 'list', 'Every account at the start and end of a period.'),
  report('ledger.report.pnl', 'Profit and Loss', 'ledger/reports/profit-and-loss', 'ledger', REPORTS.profitAndLoss, P.LEDGER_VIEW, FEATURES.FINANCIAL_REPORTING, '3', 'chart', 'Income less cost of goods sold and losses.'),
  report('ledger.report.journal', 'Ledger Journal', 'ledger/reports/journal', 'ledger', REPORTS.ledgerJournal, P.LEDGER_VIEW, FEATURES.FINANCIAL_REPORTING, '4', 'file', 'Every entry, newest first.'),

  // ---- The rest of the application ---------------------------------------------------------------
  { key: 'inventory', label: 'Inventory', route: '/app/inventory', icon: 'box', permission: P.INVENTORY_VIEW, feature: FEATURES.INVENTORY, kind: 'screen', needsBranch: true,
    description: 'Stock levels, receiving, transfers, purchasing, audits and weigh-scale checks.' },
  { key: 'customers', label: 'Customers', route: '/app/customers', icon: 'users', permission: P.CUSTOMERS_USE, feature: FEATURES.CORE_POS, kind: 'screen',
    load: () => import('../../features/customers/customers.component').then((m) => m.CustomersComponent), description: 'Customer records and their loyalty points.' },
  { key: 'subscription', label: 'Subscription', route: '/app/subscription', icon: 'card', permission: P.SUBSCRIPTIONS_VIEW, kind: 'screen' },
  { key: 'support', label: 'Support', route: '/app/support', icon: 'list', permission: P.SUPPORT_VIEW, kind: 'screen',
    description: 'Ask ZestPoint for help and follow your requests.' },
  { key: 'staff', label: 'Staff', route: '/app/staff', icon: 'users', permission: P.STAFF_VIEW, kind: 'screen' },
  { key: 'branding', label: 'Branding', route: '/app/settings/branding', icon: 'palette', permission: P.SETTINGS_BRANDING_VIEW, kind: 'screen' },
  { key: 'operations', label: 'Operations', route: '/app/settings/operations', icon: 'settings', permission: P.SETTINGS_COMPANY_MANAGE, kind: 'screen' },
  { key: 'branches', label: 'Branches', route: '/app/settings/branches', icon: 'branch', permission: P.BRANCHES_MANAGE, kind: 'screen' },
  { key: 'pos.stations', label: 'Preparation Stations', route: '/app/settings/stations', icon: 'grid', permission: P.POS_STATIONS_MANAGE, feature: FEATURES.CORE_POS, kind: 'screen',
    load: () => import('../../features/settings/stations.component').then((m) => m.StationsComponent), description: 'The bar, the kitchen and other places orders are prepared, and how each behaves.' },
  { key: 'pos.tables', label: 'Tables', route: '/app/settings/tables', icon: 'grid', permission: P.POS_TABLES_MANAGE, feature: FEATURES.CORE_POS, kind: 'screen', needsBranch: true,
    load: () => import('../../features/settings/tables.component').then((m) => m.TablesComponent), description: 'The tables at each branch, offered by the till when a table bill is opened.' }
];

/** The permissions a screen accepts, always as a list ("any of"). */
export const permissionsOf = (n: NavDefinition): readonly string[] => (Array.isArray(n.permission) ? n.permission : [n.permission as string]);

/** The screen (and its group) that owns a URL: the longest matching route wins. */
export function navFor(url: string): NavDefinition | null {
  const path = url.split('?')[0]!.split('#')[0]!.replace(/\/+$/, '');
  let best: NavDefinition | null = null;
  for (const n of APP_NAV) {
    if ((path === n.route || path.startsWith(n.route + '/')) && (!best || n.route.length > best.route.length)) best = n;
  }
  return best;
}


