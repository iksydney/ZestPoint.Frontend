import { NavDefinition, NavIcon } from './app-nav';

/**
 * How the screens in APP_NAV are laid out for people: a short menu of working screens grouped by the job being done, with each area's
 * reports behind one "Reports" entry and its set-up screens behind one "Set-up" entry (each a page of cards). APP_NAV stays the single list of what exists and who may use it; this file only
 * decides where a screen appears, what it is called in the menu, and the one-line explanation shown beside it.
 *
 * RULE (owner, 2026-11-14): when a screen is added, moved, renamed or removed, this file and core/tour/tours.ts change in the same
 * commit. Tests fail otherwise: every APP_NAV key must be placed here and explained here (ZestPoint.Tests NavigationLayoutParityTests),
 * and every tour step must point at something on screen (e2e/tour.spec.ts).
 */

export type NavAreaKey = 'sell' | 'customers' | 'stock' | 'purchasing' | 'finance' | 'head' | 'admin';

export interface NavArea {
  readonly key: NavAreaKey;
  readonly label: string;
  readonly icon: NavIcon;
  /** One line on what the area is for: shown on its reports page and in the tour. */
  readonly blurb: string;
  /** The working screens of the area, in menu order (APP_NAV keys). */
  readonly screens: readonly string[];
  /**
   * Screens used once in a while to set things up (owner's decision, 2026-11-15). They are reached from the area's one "Set-up" entry,
   * a page of cards like the Reports page, so the menu stays the short list of places to work. Search finds them all the same.
   */
  readonly setup?: readonly string[];
}

/** The screen above every area. */
export const NAV_HOME = 'dashboard';

export const NAV_AREAS: readonly NavArea[] = [
  { key: 'sell', label: 'Sell', icon: 'cart', blurb: 'Take orders and payments, and open and close the day.', screens: ['pos', 'pos.day', 'pos.sales', 'pos.bar', 'pos.kitchen', 'pos.tips'] },
  { key: 'customers', label: 'Customers', icon: 'users', blurb: 'The people you sell to: their points, their laybys and what they are waiting for.', screens: ['customers', 'pos.laybys', 'pos.backorders'] },
  {
    key: 'stock', label: 'Stock', icon: 'box', blurb: 'What you hold and sell: items, groups, counts and where things are.',
    screens: ['inventory', 'stock.items', 'stock.groups', 'stock.adjust', 'stock.global', 'stock.bins', 'stock.labels', 'stock.consignment']
  },
  { key: 'purchasing', label: 'Purchasing', icon: 'truck', blurb: 'Order from suppliers, receive goods and pay for them.', screens: ['purchasing.orders', 'purchasing.receiving', 'purchasing.suppliers', 'purchasing.payments'] },
  { key: 'finance', label: 'Finance', icon: 'wallet', blurb: 'The ledger: accounts and the entries posted from sales, purchases and stock.', screens: ['ledger.accounts'] },
  { key: 'head', label: 'Head Office', icon: 'branch', blurb: 'All your branches together: how each is doing side by side, and the prices and menus they share.', screens: [], setup: ['stock.prices'] },
  { key: 'admin', label: 'Admin', icon: 'settings', blurb: 'People, branches, settings, your brand and your subscription.', screens: ['staff', 'subscription', 'support'], setup: ['branches', 'pos.tables', 'pos.stations', 'pos.printers', 'operations', 'dailysummary', 'messages', 'branding'] }
];

/** Reports that belong to another area than their key prefix suggests. */
const REPORT_AREA_OVERRIDES: Readonly<Record<string, NavAreaKey>> = { 'pos.report.laybys': 'customers', 'pos.report.backorders': 'customers', 'pos.report.loyalty': 'customers', 'pos.report.giftcards': 'customers' };
const REPORT_AREA_BY_PREFIX: Readonly<Record<string, NavAreaKey>> = { pos: 'sell', stock: 'stock', purchasing: 'purchasing', ledger: 'finance', head: 'head' };

/** A report is reached from its area's Reports page, not from the menu. */
export const isReport = (n: NavDefinition): boolean => n.key.includes('.report.');

export function areaOf(n: NavDefinition): NavAreaKey | null {
  if (isReport(n)) return REPORT_AREA_OVERRIDES[n.key] ?? REPORT_AREA_BY_PREFIX[n.key.split('.')[0]!] ?? null;
  return NAV_AREAS.find((a) => a.screens.includes(n.key) || !!a.setup?.includes(n.key))?.key ?? null;
}

/** A set-up screen is reached from its area's Set-up page, not from the menu. */
export const isSetup = (n: NavDefinition): boolean => NAV_AREAS.some((a) => !!a.setup?.includes(n.key));
export const setupRoute = (area: NavAreaKey): string => `/app/setup/${area}`;

export const areaByKey = (key: string | null | undefined): NavArea | null => NAV_AREAS.find((a) => a.key === key) ?? null;
export const reportsRoute = (area: NavAreaKey): string => `/app/reports/${area}`;

/** Shorter names for the menu, search and breadcrumb. The full name stays the screen's own heading, and search finds both. */
const MENU_LABELS: Readonly<Record<string, string>> = {
  'inventory': 'Stock Overview',
  'stock.items': 'Items',
  'stock.groups': 'Stock Groups',
  'stock.adjust': 'Adjustments',
  'stock.global': 'Bulk Changes',
  'stock.labels': 'Labels',
  'purchasing.orders': 'Purchase Orders',
  'purchasing.suppliers': 'Suppliers',
  'purchasing.payments': 'Supplier Payments',
  'operations': 'Settings'
};

export const menuLabel = (n: NavDefinition): string => MENU_LABELS[n.key] ?? n.label;

/**
 * What each screen is for, in one line a new person understands. Used on the Reports pages, in search results and by the tour.
 * EVERY key in APP_NAV must be here (a test checks both ways).
 */
export const NAV_HELP: Readonly<Record<string, string>> = {
  'dashboard': 'Today at a glance, and shortcuts to what you use most.',

  'pos': 'The till: open a bill, add items, take payment and print the receipt.',
  'pos.day': 'Start your shift with a float, record cash in and out, and count the drawer when you finish.',
  'pos.sales': 'Your own sales: the bills you served or took payment on, with their receipts to show or send.',
  'pos.bar': 'Orders sent by attendants for the bar to make and hand over.',
  'pos.kitchen': 'A station\'s tickets on a wall screen: tick items off, bump them when ready, call one back if it was a mistake.',
  'pos.report.prep': 'How long tickets wait for someone to start them, how long they take to make, and how long the guest waits.',
  'pos.report.income': 'Sales, discounts, tax, tips and payments for a period, in one summary.',
  'pos.report.summary': 'How each day went: sales against last week, money taken, shifts, voids and discounts, stock and the best sellers. Built each morning and kept.',
  'pos.report.daily': 'Sales day by day.',
  'pos.report.staff': 'What each member of staff sold.',
  'pos.report.groups': 'Sales by stock group.',
  'pos.report.analysis': 'Sales by hour, by product and by member of staff, to see what sells when.',
  'pos.report.currency': 'Sales and payments by currency.',
  'pos.report.voids': 'Every voided item: what, why, who asked and who authorised it.',
  'pos.tips': 'Tips collected per staff member; record what is paid to them or donated.',
  'pos.report.tips': 'Tips per staff member and per bill, and every payout or donation.',
  'pos.report.payments': 'Every payment taken, filtered by date, staff, method, amount and more.',

  'customers': 'Customer records, found by phone or name, with their loyalty points.',
  'pos.laybys': 'Goods customers are paying off: take a payment or cancel a layby.',
  'pos.report.laybys': 'Every layby: its total, what is paid, what is still owed and which are overdue.',
  'pos.backorders': 'What customers are waiting for. Put one on a bill when it can be supplied.',
  'pos.report.backorders': 'A list of sales back orders and whether they can be supplied now.',
  'pos.report.giftcards': 'Every gift card sold and what is left on it, what the business owes the holders, cards that expired, and a lost card cancelled and issued again.',
  'pos.report.loyalty': 'Loyalty points: what customers earned and spent, what is still owed to them, and who took points as payment.',

  'inventory': 'Stock levels at this branch, receiving, transfers, counts and weigh checks.',
  'stock.items': 'Add an item or change one: prices, discount, units, package content, recipe and options, picture and sale rules.',
  'stock.groups': 'The groups items belong to, and the ledger accounts each group posts to.',
  'stock.adjust': 'Correct a quantity or record waste, spillage and breakage, with a reason.',
  'stock.global': 'Change many items at once: prices, groups and levels.',
  'stock.bins': 'Where stock is kept in the branch: bins, their security and what each holds.',
  'stock.labels': 'Print shelf and barcode labels for items.',
  'stock.consignment': 'Goods sent to agents to sell for you: send, record sold and returned.',
  'stock.prices': 'What each item costs at each branch and why: price lists, what a branch sells, and changes scheduled for a date.',
  'head.report.overview': 'Every branch side by side for a period: sales, bills, discounts, voids, cash differences and stock, with each branch\'s share and how it moved.',
  'head.report.loss': 'Unusual voids, discounts, refunds, cash differences, receipts, stock, tips, prices and open bills, found in what is recorded, ranked for each person and branch, and reviewed one by one. Pointers, never proof.',
  'head.report.compare': 'One measure for your branches over time as a chart, a ranking of the branches, and what each one sells most.',
  'stock.report.items': 'Look up items and where they are held.',
  'stock.report.transactions': 'Every stock movement: receipts, sales, adjustments and transfers.',
  'stock.report.quantities': 'How much of each item is on hand.',
  'stock.report.selling': 'The selling prices of items.',
  'stock.report.cost': 'What items cost you.',
  'stock.report.performance': 'How fast items sell and what they earn.',
  'stock.report.out': 'Items that have run out.',
  'stock.report.reorder': 'What needs ordering, with suggested quantities. Turn the list into purchase orders.',
  'stock.report.stocktake': 'Count stock and see the differences against the book figure.',
  'stock.report.value': 'What the stock on the shelves is worth.',
  'stock.report.history': 'Everything that has happened to one item.',
  'stock.report.expiry': 'Stock that has expired or soon will.',
  'stock.report.web': 'Items listed on the web store and their stock.',
  'stock.report.aging': 'How long stock has been sitting.',
  'stock.report.bins': 'What is in each bin.',
  'stock.report.serials': 'Serial-numbered units and where each one is.',
  'stock.report.consignment': 'Goods agents are holding: sent, sold, returned and still out.',

  'purchasing.orders': 'Raise, approve and follow purchase orders.',
  'purchasing.receiving': 'Check deliveries in against their orders and put them away.',
  'purchasing.suppliers': 'Supplier records and their terms.',
  'purchasing.payments': 'Record what you pay suppliers and see what is still owed.',
  'purchasing.report.suppliers': 'A list of your suppliers.',
  'purchasing.report.purchases': 'What was bought in a period.',
  'purchasing.report.orders': 'Purchase orders and how far each has got.',
  'purchasing.report.summary': 'Purchases added up by supplier or by period.',
  'purchasing.report.aged': 'What you owe each supplier, by how old the debt is.',
  'purchasing.report.statement': 'Everything between you and one supplier: deliveries, payments and the balance.',
  'purchasing.report.analysis': 'What you buy most, and from whom.',
  'purchasing.report.back': 'Ordered from suppliers and not yet delivered.',
  'purchasing.report.onorder': 'Stock that is on its way.',
  'purchasing.report.tax': 'Tax charged by suppliers.',
  'purchasing.report.payments': 'Payments made to suppliers.',
  'purchasing.report.equivalent': 'Other part numbers the same item is known by.',

  'ledger.accounts': 'The accounts of the ledger and what each holds today.',
  'ledger.report.trial': 'Every account at the start and end of a period.',
  'ledger.report.pnl': 'Income less the cost of goods sold and losses.',
  'ledger.report.journal': 'Every ledger entry, newest first.',

  'staff': 'The people who work here, their roles and their sign-in.',
  'branches': 'Your branches and their details.',
  'pos.tables': 'The tables at each branch. The till offers them and shows which have a bill running.',
  'pos.stations': 'The bar, the kitchen and other places orders are prepared: which items go where, and whether payment and stock wait for them. Who works at each is set on their role.',
  'pos.printers': 'The printers your phones print to: receipts and gift card slips, shift reports, labels, and kitchen and bar tickets for the stations you choose, for each branch or all of them.',
  'operations': 'Tax, payments, shifts, layby rules and other settings for how you trade.',
  'dailysummary': 'Whether the daily summary is sent, at what time, and to whom: staff or anyone with an e-mail address or a number, for every branch or one.',
  'messages': 'What the system has sent to your people in the app, by e-mail, SMS or WhatsApp, whether it arrived, and what is left of the paid messages.',
  'branding': 'Your name, logo and colours, on screen and on receipts.',
  'subscription': 'Your plan, what it includes and your invoices.',
  'support': 'Ask ZestPoint for help and follow your requests.'
};

export const helpFor = (n: NavDefinition): string => NAV_HELP[n.key] ?? n.description ?? '';
