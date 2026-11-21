/**
 * Permission and module keys. These MIRROR the backend (ZestPoint.Data/Authorization/Permissions.cs and Features);
 * keep both in sync (constitution Article 4). They only drive UX; the API re-checks every request.
 */
export const SCREEN_PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard.view',

  POS_VIEW: 'pos.view',
  POS_ORDER_CREATE: 'pos.order.create',
  POS_ORDER_EDIT: 'pos.order.edit',
  POS_PAYMENT_PROCESS: 'pos.payment.process',
  POS_DISCOUNT_APPLY: 'pos.discount.apply',
  POS_TAB_SPLIT: 'pos.tab.split',
  POS_VOID_REQUEST: 'pos.void.request',
  POS_VOID_APPROVE: 'pos.void.approve',
  POS_POINTS_AUTHORISE: 'pos.points.authorise',
  GIFT_CARDS_MANAGE: 'giftcards.manage',
  POS_REFUND_PROCESS: 'pos.refund.process',
  POS_DAY_VIEW: 'pos.day.view',
  POS_DAY_OPEN: 'pos.day.open',
  POS_DAY_CLOSE: 'pos.day.close',
  POS_DAY_REVIEW: 'pos.day.review',
  POS_BAR_ORDER_FULFIL: 'pos.bar_order.fulfil',

  INVENTORY_VIEW: 'inventory.view',
  INVENTORY_STOCK_ADJUST: 'inventory.stock.adjust',
  INVENTORY_AUDIT_PERFORM: 'inventory.audit.perform',
  INVENTORY_WEIGH_AUDIT_PERFORM: 'inventory.weigh_audit.perform',
  INVENTORY_VARIANCE_VIEW: 'inventory.variance.view',
  INVENTORY_PURCHASE_MANAGE: 'inventory.purchase.manage',
  INVENTORY_PURCHASE_APPROVE: 'inventory.purchase.approve',
  INVENTORY_ITEMS_MANAGE: 'inventory.items.manage',
  INVENTORY_COSTS_MANAGE: 'inventory.costs.manage',
  INVENTORY_GROUPS_VIEW: 'inventory.groups.view',
  INVENTORY_GROUPS_MANAGE: 'inventory.groups.manage',
  INVENTORY_GLOBAL_MANAGE: 'inventory.global.manage',
  INVENTORY_STOCK_ADJUST_APPROVE: 'inventory.stock.adjust.approve',
  INVENTORY_STOCKTAKE_VIEW: 'inventory.stocktake.view',
  INVENTORY_STOCKTAKE_PERFORM: 'inventory.stocktake.perform',
  INVENTORY_STOCKTAKE_APPROVE: 'inventory.stocktake.approve',
  INVENTORY_LABELS_PRINT: 'inventory.labels.print',
  INVENTORY_BINS_VIEW: 'inventory.bins.view',
  INVENTORY_BINS_MANAGE: 'inventory.bins.manage',
  INVENTORY_REPORT_ITEMS: 'inventory.reports.items.view',
  INVENTORY_REPORT_TRANSACTIONS: 'inventory.reports.transactions.view',
  INVENTORY_REPORT_QUANTITIES: 'inventory.reports.quantities.view',
  INVENTORY_REPORT_SELLING_PRICES: 'inventory.reports.selling_prices.view',
  INVENTORY_REPORT_COST_PRICES: 'inventory.reports.cost_prices.view',
  INVENTORY_REPORT_PERFORMANCE: 'inventory.reports.performance.view',
  INVENTORY_REPORT_OUT_OF_STOCK: 'inventory.reports.out_of_stock.view',
  INVENTORY_REPORT_REORDER: 'inventory.reports.reorder.view',
  INVENTORY_REPORT_VALUE: 'inventory.reports.value.view',
  INVENTORY_REPORT_HISTORY: 'inventory.reports.history.view',
  INVENTORY_REPORT_EXPIRY: 'inventory.reports.expiry.view',
  INVENTORY_REPORT_WEB_STORE: 'inventory.reports.web_store.view',
  INVENTORY_REPORT_AGING: 'inventory.reports.aging.view',
  INVENTORY_REPORT_SERIAL_NUMBERS: 'inventory.reports.serial_numbers.view',
  INVENTORY_REPORT_BIN_STOCK: 'inventory.reports.bin_stock.view',
  /** The kitchen (owner's decisions, 2026-11-21): mirrors the backend Permissions.cs. */
  INVENTORY_PRODUCTION_RECORD: 'inventory.production.record',
  INVENTORY_ISSUES_MANAGE: 'inventory.issues.manage',
  INVENTORY_REPORT_KITCHEN: 'inventory.reports.kitchen.view',

  PURCHASING_RECEIVE: 'purchasing.receive',
  PURCHASING_PAYMENTS_VIEW: 'purchasing.payments.view',
  PURCHASING_PAYMENTS_MANAGE: 'purchasing.payments.manage',
  PURCHASING_REPORTS_VIEW: 'purchasing.reports.view',
  PURCHASING_MARKETRUN_RECORD: 'purchasing.marketrun.record',
  PURCHASING_MARKETRUN_CONFIRM: 'purchasing.marketrun.confirm',

  PRODUCTS_MANAGE: 'products.manage',
  PRODUCTS_PRICES_MANAGE: 'products.prices.manage',
  PRODUCTS_PRICES_MANAGE_BRANCH: 'products.prices.manage_branch',

  POS_LAYBY_MANAGE: 'pos.layby.manage',
  POS_TIPS_MANAGE: 'pos.tips.manage',
  POS_TABLES_MANAGE: 'pos.tables.manage',
  POS_STATIONS_MANAGE: 'pos.stations.manage',
  POS_PRINTERS_MANAGE: 'pos.printers.manage',
  POS_SALES_VIEW_OWN: 'pos.sales.view_own',
  POS_SALES_VIEW_ALL: 'pos.sales.view_all',
  INVENTORY_CONSIGNMENT_MANAGE: 'inventory.consignment.manage',
  CUSTOMERS_USE: 'customers.use',
  CUSTOMERS_MANAGE: 'customers.manage',

  LEDGER_VIEW: 'ledger.view',
  LEDGER_ACCOUNTS_MANAGE: 'ledger.accounts.manage',

  REPORTS_SALES_VIEW: 'reports.sales.view',
  REPORTS_FINANCIAL_VIEW: 'reports.financial.view',
  REPORTS_INCOME_VIEW: 'reports.income.view',
  REPORTS_DAILY_SALES_VIEW: 'reports.daily_sales.view',
  REPORTS_STAFF_SALES_VIEW: 'reports.staff_sales.view',
  REPORTS_STOCK_GROUP_SALES_VIEW: 'reports.stock_group_sales.view',
  REPORTS_SALES_ANALYSIS_VIEW: 'reports.sales_analysis.view',
  REPORTS_MULTI_CURRENCY_VIEW: 'reports.multi_currency.view',
  REPORTS_HEAD_OFFICE_VIEW: 'reports.head_office.view',
  MESSAGING_MANAGE: 'messaging.manage',
  LOSS_PREVENTION_VIEW: 'lossprevention.view',
  LOSS_PREVENTION_REVIEW: 'lossprevention.review',
  LOSS_PREVENTION_RULES: 'lossprevention.rules',
  DAILY_SUMMARY_VIEW: 'reports.daily_summary.view',
  DAILY_SUMMARY_MANAGE: 'settings.daily_summary.manage',
  REPORTS_EXPORT: 'reports.export',

  STAFF_VIEW: 'staff.view',
  STAFF_MANAGE: 'staff.manage',
  ROLES_MANAGE: 'roles.manage',

  SUBSCRIPTIONS_VIEW: 'subscriptions.view',
  SUBSCRIPTIONS_MANAGE: 'subscriptions.manage',

  SETTINGS_BRANDING_VIEW: 'settings.branding.view',
  SETTINGS_BRANDING_MANAGE: 'settings.branding.manage',
  SETTINGS_COMPANY_MANAGE: 'settings.company.manage',
  BRANCHES_MANAGE: 'branches.manage',

  AUDIT_VIEW: 'audit.view',

  SUPPORT_VIEW: 'support.view',
  SUPPORT_CREATE: 'support.create'
} as const;

export type ScreenPermission = (typeof SCREEN_PERMISSIONS)[keyof typeof SCREEN_PERMISSIONS];

/** Subscription modules (entitlement keys), mirroring the backend Features class. */
export const FEATURES = {
  CORE_POS: 'core_pos',
  INVENTORY: 'inventory_management',
  RECIPE_DEPLETION: 'recipe_volumetric_depletion',
  KDS: 'kds_integration',
  BULK_WEIGHED_AUDIT: 'bulk_weighed_audit',
  ADVANCED_POUR_ANALYTICS: 'advanced_pour_analytics',
  MULTI_BRANCH_TRANSFERS: 'multi_branch_transfers',
  HOTEL_PMS: 'hotel_pms_room_charging',
  FINANCIAL_REPORTING: 'financial_reporting',
  ADVANCED_ANALYTICS: 'advanced_analytics',
  ENTERPRISE_API: 'enterprise_api',
  HEAD_OFFICE: 'head_office',
  MESSAGING: 'messaging',
  LOSS_PREVENTION: 'loss_prevention',
  LOYALTY_GIFT_CARDS: 'loyalty_giftcards',
  TABLE_ORDERING: 'table_ordering'
} as const;

export type FeatureCode = (typeof FEATURES)[keyof typeof FEATURES];

/** Route `data` contract consumed by permissionGuard / subscriptionGateGuard. */
export interface RouteAccessData {
  permission?: ScreenPermission | readonly ScreenPermission[];
  feature?: FeatureCode;
  /** The menu key (APP_NAV) of the screen, so an operator withholding just this screen is honoured on a direct URL. */
  screen?: string;
}
