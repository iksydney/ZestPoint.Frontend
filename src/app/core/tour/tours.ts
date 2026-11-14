/**
 * Every guided tour in the application.
 *
 * RULE (owner, 2026-11-14): the tour is part of the screen it describes. A change that adds, moves, renames or removes a menu entry, a
 * screen, or a control a step points at must update this file in the same commit:
 *   1. fix or add the steps so they describe the screen as it now is;
 *   2. raise that tour's `version` by one;
 *   3. add a `changes` entry for the new version with one or two steps on what is new or has moved. People who already took the tour
 *      are shown only those steps; people who never did get the whole tour as it now stands.
 * Tests hold this up: e2e/tour.spec.ts walks every tour and fails if a step points at something that is not on screen, and
 * ZestPoint.Tests NavigationLayoutParityTests fails if a tour names a screen that does not exist or a change is missing for a version.
 *
 * A step's `target` is a CSS selector. For the frame of the application it is a data-tour attribute; inside a screen it is the
 * data-testid the screen already carries. A step with no target is a card in the middle of the screen.
 */

export interface TourStep {
  /** Stable name of the step inside its tour. */
  readonly id: string;
  readonly target?: string;
  readonly title: string;
  readonly body: string;
  /** The target is in the side menu: on a phone the menu is opened for this step. */
  readonly menu?: boolean;
  /** Not everyone has this (it depends on what the person may do): if it is not on screen the step is simply left out. */
  readonly optional?: boolean;
}

export interface TourChange {
  /** The version of the tour these steps were added for. */
  readonly version: number;
  readonly steps: readonly TourStep[];
}

export interface TourDefinition {
  readonly key: string;
  readonly title: string;
  readonly version: number;
  /** The APP_NAV key of the screen the tour belongs to; none for the tour of the whole application. */
  readonly nav?: string;
  readonly steps: readonly TourStep[];
  /** One entry for every version after the first: what changed, for people who took an earlier version. */
  readonly changes?: readonly TourChange[];
}

export const APP_TOUR = 'app';

export const TOURS: readonly TourDefinition[] = [
  {
    key: APP_TOUR, title: 'Welcome to ZestPoint', version: 1,
    steps: [
      { id: 'welcome', title: 'Welcome', body: 'This takes about a minute. It shows where things are; you can leave at any time and take it again from Help.' },
      { id: 'menu', target: '[data-tour="nav"]', menu: true, title: 'The menu', body: 'Everything you can do is here, grouped by the job you are doing. You only see what your role allows. Click an area\'s name to fold it away.' },
      { id: 'sell', target: '[data-tour="nav-area-sell"]', menu: true, optional: true, title: 'Sell', body: 'The till, and starting and ending your day: open your shift with a float, sell, then count the drawer when you finish.' },
      { id: 'customers', target: '[data-tour="nav-area-customers"]', menu: true, optional: true, title: 'Customers', body: 'Customer records and their loyalty points, goods being paid off on layby, and what customers are waiting for.' },
      { id: 'stock', target: '[data-tour="nav-area-stock"]', menu: true, optional: true, title: 'Stock', body: 'The items you sell, their groups and prices, counts and adjustments, where stock is kept, and goods out with agents.' },
      { id: 'purchasing', target: '[data-tour="nav-area-purchasing"]', menu: true, optional: true, title: 'Purchasing', body: 'Order from suppliers, check deliveries in and record what you pay.' },
      { id: 'finance', target: '[data-tour="nav-area-finance"]', menu: true, optional: true, title: 'Finance', body: 'The ledger. Nothing is typed into it: every sale, payment and delivery posts its own entry.' },
      { id: 'admin', target: '[data-tour="nav-area-admin"]', menu: true, optional: true, title: 'Admin', body: 'Staff and their roles, branches, settings, your brand and your subscription.' },
      { id: 'reports', target: '[data-nav^="reports."]', menu: true, optional: true, title: 'Reports', body: 'Each area keeps its reports behind one Reports entry: a page listing them, each with a line on what it shows.' },
      { id: 'search', target: '[data-tour="nav-search"]', menu: true, title: 'Search', body: 'The quickest way anywhere: press Ctrl+K (or click here) and type part of a screen\'s or report\'s name.' },
      { id: 'help', target: '[data-tour="help"]', title: 'Help', body: 'Take this tour again, or the tour of the screen you are on, whenever you like. When something changes in ZestPoint you will be shown what moved.' },
      { id: 'account', target: '[data-tour="account"]', title: 'You', body: 'Who is signed in on this device. Sign out here when you leave, especially on a shared till.' }
    ]
  },
  {
    key: 'pos', nav: 'pos', title: 'The till', version: 1,
    steps: [
      { id: 'bills', target: '[data-testid="bill-list"]', title: 'Open bills', body: 'Bills that are still open at this branch. Click one to carry on with it.' },
      { id: 'new', target: '[data-testid="new-bill"]', optional: true, title: 'Start a bill', body: 'Every sale starts here: a tab, a table, a walk-up or a takeaway. Give it a name you will recognise.' },
      { id: 'find', target: '[data-testid="product-search"]', title: 'Find what to sell', body: 'Type part of a name, or scan a barcode in the box beside it. Tapping a product adds it to the bill.' },
      { id: 'bill', target: '[data-testid="current-bill"]', title: 'The bill', body: 'What is on the bill, its total, and what you can do with it: add a customer, discount, split, take payment and print the receipt. Prices come from the stock card; nobody types a price here.' }
    ]
  },
  {
    key: 'stock.items', nav: 'stock.items', title: 'Items', version: 1,
    steps: [
      { id: 'search', target: '[data-testid="items-search"]', title: 'Find an item', body: 'Search by name, part number or barcode, or narrow the list to one stock group.' },
      { id: 'new', target: '[data-testid="item-new"]', optional: true, title: 'Add an item', body: 'Opens the stock card: name, prices, the special price and its dates, tax, loyalty points and the rules the till follows. Creating an item adds no stock; stock comes in through purchasing and adjustments.' },
      { id: 'list', target: '[data-testid="items-table"]', title: 'Your items', body: 'Edit opens the same stock card, where you also set selling units (a case of 12), package content, the picture and the ledger accounts.' }
    ]
  },
  {
    key: 'purchasing.orders', nav: 'purchasing.orders', title: 'Purchase orders', version: 1,
    steps: [
      { id: 'new', target: '[data-testid="po-new"]', optional: true, title: 'Raise an order', body: 'Choose the supplier, scan or type items, and post it for approval. Other buttons here start a direct delivery, a return to a supplier or a transfer between branches.' },
      { id: 'find', target: '[data-testid="po-search"]', title: 'Find a document', body: 'Search by number or supplier, and filter by status or type.' },
      { id: 'list', target: '[data-testid="po-table"]', title: 'Your documents', body: 'Each order and how far it has got: draft, waiting for approval, approved, part received, received.' }
    ]
  },
  {
    key: 'customers', nav: 'customers', title: 'Customers', version: 1,
    steps: [
      { id: 'search', target: '[data-testid="customer-search"]', title: 'Find a customer', body: 'By part of their name, their phone number or their customer number.' },
      { id: 'new', target: '[data-testid="customer-new"]', title: 'Add a customer', body: 'A name and a phone number are enough. A phone number belongs to one customer only. Customers can also be added at the till, on a bill.' },
      { id: 'list', target: '[data-testid="customers-table"]', title: 'Points', body: 'A customer earns each item\'s loyalty points when their bill is paid. Points shows what they have and where it came from.' }
    ]
  },
  {
    key: 'pos.laybys', nav: 'pos.laybys', title: 'Laybys', version: 1,
    steps: [
      { id: 'how', title: 'How a layby starts', body: 'At the till: put a customer on the bill and press Layby. The goods are held for them and the bill is fixed. This screen is where you take the payments.' },
      { id: 'filter', target: '[data-testid="lb-status"]', title: 'Which laybys', body: 'Active ones first. Choose Overdue only to see the ones past their date; nothing is cancelled by itself.' },
      { id: 'list', target: '[data-testid="lb-table"]', title: 'Pay or cancel', body: 'Take payment records a payment; the last one makes it a sale and the customer collects. Cancel needs a supervisor\'s code and PIN and gives back what was paid less your fee.' }
    ]
  },
  {
    key: 'stock.consignment', nav: 'stock.consignment', title: 'Consignment out', version: 1,
    steps: [
      { id: 'agents', target: '[data-testid="agents-open"]', title: 'Agents', body: 'The people or outlets who sell for you. Add them here first.' },
      { id: 'send', target: '[data-testid="cons-new"]', title: 'Send goods out', body: 'Choose the agent, the items, how many and the price agreed for each. The goods leave this branch\'s shelf but stay yours.' },
      { id: 'list', target: '[data-testid="cons-list"]', title: 'What is out', body: 'For each consignment: record what the agent sold (a bill opens for them to pay at the till) and what came back (it returns to the shelf).' }
    ]
  },
  {
    key: 'ledger.accounts', nav: 'ledger.accounts', title: 'Chart of accounts', version: 1,
    steps: [
      { id: 'sync', target: '[data-testid="ledger-sync"]', title: 'Always worked out, never typed', body: 'Every sale, payment, refund, delivery and stock movement posts its own entry. Opening this screen brings the ledger up to date; this button does it again.' },
      { id: 'list', target: '[data-testid="accounts-table"]', title: 'Your accounts', body: 'A ready-made list you can rename and add to, with what each holds today. Entries shows what made up a balance.' },
      { id: 'reports', target: '[data-testid="link-trial"]', title: 'The reports', body: 'Trial Balance, Profit and Loss and the Journal are one click away, and under Finance > Reports.' }
    ]
  }
];

export const tourByKey = (key: string): TourDefinition | null => TOURS.find((t) => t.key === key) ?? null;
export const tourForNav = (navKey: string | null | undefined): TourDefinition | null => (navKey ? TOURS.find((t) => t.nav === navKey) ?? null : null);

/** The steps a person should see: the whole tour if they never took it, otherwise only what changed since the version they saw. */
export function stepsSince(tour: TourDefinition, seenVersion: number | null): readonly TourStep[] {
  if (seenVersion === null || seenVersion <= 0) return tour.steps;
  return (tour.changes ?? []).filter((c) => c.version > seenVersion && c.version <= tour.version).flatMap((c) => c.steps);
}
