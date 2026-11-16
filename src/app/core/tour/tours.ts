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
    key: APP_TOUR, title: 'Welcome to ZestPoint', version: 4,
    changes: [{ version: 2, steps: [{ id: 'setup', target: '[data-nav^="setup."]', menu: true, optional: true, title: 'Set-up has moved', body: 'Branches, Settings and Branding have left the menu. Things you set up once and change now and then are behind one Set-up entry: branches, tables, settings and your brand, each with a line on what it is for. Search finds them too.' }] }, { version: 3, steps: [{ id: 'head', target: '[data-tour="nav-area-head"]', menu: true, optional: true, title: 'Head Office', body: 'All your branches together: two reports (every branch side by side, and a comparison over time) behind its Reports entry, and Prices and Menus, which has moved here from Stock.' }] }, { version: 4, steps: [{ id: 'notices', target: '[data-testid="notices-bell"]', title: 'Notices', body: 'The new speech-bubble button at the top is where ZestPoint tells you things: alerts, summaries and messages from the system. The number is how many you have not read.' }] }],
    steps: [
      { id: 'welcome', title: 'Welcome', body: 'This takes about a minute. It shows where things are; you can leave at any time and take it again from Help.' },
      { id: 'menu', target: '[data-tour="nav"]', menu: true, title: 'The menu', body: 'Everything you can do is here, grouped by the job you are doing. You only see what your role allows. Click an area\'s name to fold it away.' },
      { id: 'sell', target: '[data-tour="nav-area-sell"]', menu: true, optional: true, title: 'Sell', body: 'The till, and starting and ending your day: open your shift with a float, sell, then count the drawer when you finish.' },
      { id: 'customers', target: '[data-tour="nav-area-customers"]', menu: true, optional: true, title: 'Customers', body: 'Customer records and their loyalty points, goods being paid off on layby, and what customers are waiting for.' },
      { id: 'stock', target: '[data-tour="nav-area-stock"]', menu: true, optional: true, title: 'Stock', body: 'The items you sell, their groups and prices, counts and adjustments, where stock is kept, and goods out with agents.' },
      { id: 'purchasing', target: '[data-tour="nav-area-purchasing"]', menu: true, optional: true, title: 'Purchasing', body: 'Order from suppliers, check deliveries in and record what you pay.' },
      { id: 'finance', target: '[data-tour="nav-area-finance"]', menu: true, optional: true, title: 'Finance', body: 'The ledger. Nothing is typed into it: every sale, payment and delivery posts its own entry.' },
      { id: 'head', target: '[data-tour="nav-area-head"]', menu: true, optional: true, title: 'Head Office', body: 'All your branches together: reports that put every branch side by side and compare them over time, and the prices and menus they share under Set-up.' },
      { id: 'admin', target: '[data-tour="nav-area-admin"]', menu: true, optional: true, title: 'Admin', body: 'Staff and their roles, your subscription and support. Branches, tables, settings and your brand are under Set-up.' },
      { id: 'setup', target: '[data-nav^="setup."]', menu: true, optional: true, title: 'Set-up', body: 'Things you set up once and change now and then are behind one Set-up entry: branches, tables, settings and your brand, each with a line on what it is for. Search finds them too.' },
      { id: 'reports', target: '[data-nav^="reports."]', menu: true, optional: true, title: 'Reports', body: 'Each area keeps its reports behind one Reports entry: a page listing them, each with a line on what it shows.' },
      { id: 'search', target: '[data-tour="nav-search"]', menu: true, title: 'Search', body: 'The quickest way anywhere: press Ctrl+K (or click here) and type part of a screen\'s or report\'s name.' },
      { id: 'notices', target: '[data-testid="notices-bell"]', title: 'Notices', body: 'The speech-bubble button is where ZestPoint tells you things: alerts, summaries and messages from the system. The number is how many you have not read; open it to read them, or mark them all read.' },
      { id: 'help', target: '[data-tour="help"]', title: 'Help', body: 'Take this tour again, or the tour of the screen you are on, whenever you like. When something changes in ZestPoint you will be shown what moved.' },
      { id: 'account', target: '[data-tour="account"]', title: 'You', body: 'Who is signed in on this device. Sign out here when you leave, especially on a shared till.' }
    ]
  },
  {
    key: 'pos', nav: 'pos', title: 'The till', version: 6,
    changes: [{ version: 2, steps: [{ id: 'quantity', target: '[data-testid="current-bill"]', title: 'One row per item', body: 'Adding the same item again now raises the number on its row instead of starting another row. Type the quantity you want in the box between minus and plus. Units already sent stay sent: to take those off, void them.' }] }, { version: 3, steps: [{ id: 'own-bills', target: '[data-testid="bill-list"]', title: 'Whose bill it is', body: 'A bill belongs to whoever opened it. Colleagues can look at it, but only its owner, a supervisor or a manager can change it or take payment. Move / hand over gives a bill to a colleague.' }, { id: 'receipt-send', target: '[data-testid="current-bill"]', title: 'Sending a receipt', body: 'Receipt now prints the receipt by itself and can send it: WhatsApp, e-mail, SMS, the share options of your device, a QR code the customer scans, or a picture to download. Where the bar man method is used, Pay unlocks when the bar marks the order ready.' }] }, { version: 4, steps: [{ id: 'every-item', target: '[data-testid="current-bill"]', title: 'A quantity box on every item', body: 'Every item now has minus, a box to type the number, and plus. Where the same item went to the bar more than once, the row shows one mark with the total, and Void asks how many to take off.' }] }, { version: 5, steps: [{ id: 'pay-several', target: '[data-testid="current-bill"]', title: 'Paying by cash, card and transfer together', body: 'To pay one bill in more than one way, press Pay, then choose Split into 2 parts (or 3, 4, 5). Each part has its own Paid by: cash, card or transfer. Type the amount of each part as the customer is paying it, for example 5,500 cash and 3,000 card: the last part takes whatever is left, so the parts always add up to the balance. Add a part adds another, x removes one, and One payment goes back to a single payment. Confirm records them all together and the receipt lists each one. Friends sharing a bill pay the same way: one part each.' }] }, { version: 6, steps: [{ id: 'points', target: '[data-testid="current-bill"]', optional: true, title: 'Paying with loyalty points', body: 'With a customer on the bill, Pay now offers Points when your company has said what a point is worth. Type how much of the bill to pay with points. The customer types their own four-digit code, or, if they have none yet, a supervisor types their PIN; Set the customer\'s code lets the customer choose one. Points can also be one part of a split payment. No points are earned on the part paid with points, and refunding it gives the points back. Points need a connection.' }] }],
    steps: [
      { id: 'bills', target: '[data-testid="bill-list"]', title: 'Open bills', body: 'Bills that are still open at this branch. Click one to carry on with it.' },
      { id: 'new', target: '[data-testid="new-bill"]', optional: true, title: 'Start a bill', body: 'Every sale starts here: a tab, a table, a walk-up or a takeaway. Give it a name you will recognise.' },
      { id: 'find', target: '[data-testid="product-search"]', title: 'Find what to sell', body: 'Type part of a name, or scan a barcode in the box beside it. Tapping a product adds it to the bill.' },
      { id: 'bill', target: '[data-testid="current-bill"]', title: 'The bill', body: 'What is on the bill, its total, and what you can do with it: add a customer, split, take payment and print the receipt. Each item has one row: type its quantity in the box. Prices and any item discount come from the stock card; nobody types a price here.' },
      { id: 'pay-several', target: '[data-testid="current-bill"]', title: 'Paying by cash, card and transfer together', body: 'To pay one bill in more than one way, press Pay, then choose Split into 2 parts (or 3, 4, 5). Each part has its own Paid by: cash, card or transfer. Type the amount of each part as the customer is paying it, for example 5,500 cash and 3,000 card: the last part takes whatever is left, so the parts always add up to the balance. Add a part adds another, x removes one, and One payment goes back to a single payment. Confirm records them all together and the receipt lists each one. Friends sharing a bill pay the same way: one part each.' }
    ]
  },
  {
    key: 'stock.items', nav: 'stock.items', title: 'Items', version: 3,
    changes: [{ version: 2, steps: [{ id: 'discount', target: '[data-testid="items-table"]', title: 'A discount on the item', body: 'The stock card now has Discount %, under the prices. The till takes it off that item by itself on every sale, always or only between the dates you give, and never below the minimum price.' }, { id: 'recipe', target: '[data-testid="items-table"]', title: 'Recipes moved here', body: 'The Catalogue screen is gone. A drink or dish made from ingredients is now an item like any other: open its stock card and use the Recipe and options tab. Everything about an item is on its card.' }] }, { version: 3, steps: [{ id: 'import', target: '[data-testid="item-import"]', optional: true, title: 'Add many items from a file', body: 'Download the template, fill it in a spreadsheet and choose the file. It is checked first: every problem is listed by row, and nothing is added until the file is right.' }, { id: 'after-save', target: '[data-testid="items-table"]', title: 'Saving an item', body: 'Save tells you what is missing instead of staying grey. After a new item the card closes and offers to add another. The card has an Activity tab now, in place of History, Sales and Purchases.' }] }],
    steps: [
      { id: 'search', target: '[data-testid="items-search"]', title: 'Find an item', body: 'Search by name, part number or barcode, or narrow the list to one stock group.' },
      { id: 'new', target: '[data-testid="item-new"]', optional: true, title: 'Add an item', body: 'Opens the stock card: name, prices, the special price and its dates, the discount percentage, tax, loyalty points and the rules the till follows. Creating an item adds no stock; stock comes in through purchasing and adjustments.' },
      { id: 'list', target: '[data-testid="items-table"]', title: 'Your items', body: 'Edit opens the same stock card, where you also set selling units (a case of 12), package content, the recipe and options, the picture and the ledger accounts.' }
    ]
  },
  {
    key: 'purchasing.orders', nav: 'purchasing.orders', title: 'Purchase orders', version: 2,
    changes: [{ version: 2, steps: [{ id: 'share-and-search', title: 'Sharing an order, and finding items', body: 'Open an order and press Share to send its link to the supplier by WhatsApp, e-mail, SMS or a QR code; they see that one order without signing in. Adding an item now finds it by any part of its name, code or barcode, in capitals or not.' }] }],
    steps: [
      { id: 'new', target: '[data-testid="po-new"]', optional: true, title: 'Raise an order', body: 'Choose the supplier, scan or type items, and post it for approval. Other buttons here start a direct delivery, a return to a supplier or a transfer between branches.' },
      { id: 'find', target: '[data-testid="po-search"]', title: 'Find a document', body: 'Search by number or supplier, and filter by status or type.' },
      { id: 'list', target: '[data-testid="po-table"]', title: 'Your documents', body: 'Each order and how far it has got: draft, waiting for approval, approved, part received, received.' }
    ]
  },
  {
    key: 'customers', nav: 'customers', title: 'Customers', version: 2,
    changes: [{ version: 2, steps: [{ id: 'spend', target: '[data-testid="customers-table"]', title: 'Points can now be spent', body: 'At the till a customer can pay part of a bill with their points. Open a customer to see points earned, spent and given back, and whether they have set their own code. Loyalty Points Report, in this area\'s reports, shows what is still owed to customers.' }] }],
    steps: [
      { id: 'search', target: '[data-testid="customer-search"]', title: 'Find a customer', body: 'By part of their name, their phone number or their customer number.' },
      { id: 'new', target: '[data-testid="customer-new"]', title: 'Add a customer', body: 'A name and a phone number are enough. A phone number belongs to one customer only. Customers can also be added at the till, on a bill.' },
      { id: 'list', target: '[data-testid="customers-table"]', title: 'Points', body: 'A customer earns each item\'s loyalty points when their bill is paid. Points shows what they have and where it came from.' }
    ]
  },
  {
    key: 'stock.prices', nav: 'stock.prices', title: 'Prices and menus', version: 2,
    changes: [{ version: 2, steps: [{ id: 'moved', title: 'Prices and Menus has moved', body: 'It is now under Head Office, in its Set-up page, beside the reports on your branches. It works as before.' }] }],
    steps: [
      { id: 'what', title: 'A price for every branch', body: 'The grid shows what each item costs at each branch and where the price comes from: the branch\'s own price, a price list it uses, or the company price.' },
      { id: 'change', target: '[data-testid="prices-change"]', title: 'Change prices', body: 'Tick items, then change the price for one branch, a price list or the whole company: set it, or raise or lower it by a percentage or an amount, now or from a date. A price below an item\'s minimum price is refused.' },
      { id: 'table', target: '[data-testid="prices-table"]', title: 'The grid', body: 'Not sold marks what a branch does not sell. Use Stop selling at to take items off one branch\'s till. History shows every change with who made it.' },
      { id: 'lists', target: '[data-testid="prices-tab-lists"]', title: 'Price lists', body: 'A price list holds prices for some branches, for example an airport or a happy hour. Say which branches use it, and on which days and times.' },
      { id: 'pending', target: '[data-testid="prices-tab-pending"]', title: 'Scheduled changes', body: 'A change set for a later date waits here and starts by itself. Cancel it here before it starts.' }
    ]
  },
  {
    key: 'head.report.overview', nav: 'head.report.overview', title: 'Head office overview', version: 1,
    steps: [
      { id: 'what', title: 'Every branch side by side', body: 'One row for each branch you may see, for the period you choose: net sales and each branch\'s share of them, how it moved on the period before, bills, discounts, voids, refunds, cash differences and stock. The bottom row adds them up.' },
      { id: 'period', target: '[data-testid="report-filters"]', title: 'Choose the period', body: 'Pick the dates and press Apply. The change is against the period of the same length just before.' },
      { id: 'summary', target: '[data-testid="report-summary"]', title: 'The headline', body: 'Net sales for all the branches together, the bills, the average bill and which branch sold most.' },
      { id: 'table', target: '[data-testid="report-table"]', title: 'The branches', body: 'Click a column heading to sort by it. Export CSV and Print are at the top if your role allows them. You only see the branches your role covers, and the totals add up only those.' }
    ]
  },
  {
    key: 'head.report.compare', nav: 'head.report.compare', title: 'Branch comparison', version: 1,
    steps: [
      { id: 'what', title: 'Branches over time', body: 'Choose one measure and see your branches as lines on one chart, with a ranking underneath. Each branch keeps its colour.' },
      { id: 'filters', target: '[data-testid="cmp-filters"]', title: 'Measure, dates and branches', body: 'Net sales, bills, average bill, void rate, discount rate, cash difference or top items, for the dates you choose. Tick branches to draw only those (up to eight), then press Apply.' },
      { id: 'chart', target: '[data-testid="cmp-chart"]', optional: true, title: 'The chart', body: 'Move over it (or use the arrow keys) to read the figures of each day, week or month. A gap in a line means there was nothing to divide by, such as no bills that day.' },
      { id: 'table', target: '[data-testid="cmp-table-details"]', optional: true, title: 'As a table', body: 'The same figures as a table, if you find them easier to read or to check.' },
      { id: 'ranking', target: '[data-testid="cmp-ranking"]', title: 'Who comes first', body: 'The branches in order, first being best. For void rate and discount rate lower is better; for cash difference, the closest to zero.' }
    ]
  },
  {
    key: 'messages', nav: 'messages', title: 'Messages', version: 1,
    steps: [
      { id: 'what', title: 'What the system sends', body: 'Every message ZestPoint sends to your people is kept here: in the app, by e-mail, by SMS or by WhatsApp, with how it went. A message that could not be sent stays with the reason.' },
      { id: 'usage', target: '[data-testid="msg-usage"]', title: 'Paid messages', body: 'SMS and WhatsApp are paid messages: your plan includes a number each month. When they are used up, further ones go by e-mail and you are told once.' },
      { id: 'channels', target: '[data-testid="msg-channels"]', title: 'Ways of sending', body: 'Each way says whether it is ready on this server. Send a test to yourself to see that it works, or why it does not.' },
      { id: 'table', target: '[data-testid="msg-table"]', title: 'What was sent', body: 'Filter by way of sending or by how it went. Try again puts a failed message back in the queue.' }
    ]
  },
  {
    key: 'head.report.loss', nav: 'head.report.loss', title: 'Loss prevention', version: 1,
    steps: [
      { id: 'what', title: 'Unusual things, found for you', body: 'ZestPoint looks over what is already recorded each hour (voids, discounts, refunds, cash, receipts, stock, tips, prices and bills) and raises an alert for anything unusual. An alert is a pointer for you to look at, never proof.' },
      { id: 'overview', target: '[data-testid="lp-tab-overview"]', title: 'Who stands out', body: 'The overview ranks people and branches by what was found, set against how much they sold, and says in words what each score is made of. You do not see yourself here.' },
      { id: 'alerts', target: '[data-testid="lp-tab-alerts"]', title: 'Alerts', body: 'Each alert with what was found. Open one, look at the evidence, and mark it reviewed: no concern, or followed up with what you did. Nobody can review an alert about themselves.' },
      { id: 'rules', target: '[data-testid="lp-tab-rules"]', title: 'Rules', body: 'The rules and their defaults. Change the number a rule looks for or its weight, or switch it off, if it does not suit how you trade.' }
    ]
  },
  {
    key: 'pos.report.summary', nav: 'pos.report.summary', title: 'Daily summary', version: 1,
    steps: [
      { id: 'what', title: 'How each day went', body: 'Yesterday and every earlier day, built once each morning and kept as it was: sales against the same day last week, money taken, shifts, voids and discounts, stock and what sold best. Choose a day on the left to read it; choose a branch to see just that one.' },
      { id: 'setup', target: '[data-testid="sum-setup-link"]', optional: true, title: 'Who gets it', body: 'The summary can also be sent to you and to others each morning, in the app, by e-mail, SMS or WhatsApp. Set up who gets it, and at what time.' }
    ]
  },
  {
    key: 'dailysummary', nav: 'dailysummary', title: 'Daily summary set-up', version: 1,
    steps: [
      { id: 'when', target: '[data-testid="dss-when"]', title: 'On or off, and when', body: 'Switch the summary on and choose the time it goes each morning, in your company\'s time. It covers the day before.' },
      { id: 'build', target: '[data-testid="dss-build"]', title: 'Look before the first morning', body: 'Build yesterday now makes the summary of a day that has none yet, so you can read it first. A day is never rebuilt once built: what was sent stays as it was.' },
      { id: 'who', target: '[data-testid="dss-table"]', title: 'Who gets it', body: 'A member of staff, or anyone with an e-mail address or a phone number, for every branch or one, in the app, by e-mail, SMS or WhatsApp. A way that is not available yet says so.' },
      { id: 'add', target: '[data-testid="dss-add"]', title: 'Add someone', body: 'Add yourself first to see what arrives. Then add the people who should have it each morning.' }
    ]
  },
  {
    key: 'pos.kitchen', nav: 'pos.kitchen', title: 'Kitchen display', version: 1,
    steps: [
      { id: 'what', title: 'Your station\'s tickets', body: 'Choose the station this screen is for (Kitchen, Grill...). Its tickets appear by themselves, oldest first, and the screen remembers your choice.' },
      { id: 'allday', target: '[data-testid="kitchen-allday"]', title: 'All day', body: 'What is still to make across every ticket added up: how many burgers, how many fries.' },
      { id: 'tickets', target: '[data-testid="kitchen-tickets"]', title: 'Tickets', body: 'Start takes a ticket. Tap an item to tick it off. Bump tells the waiter it is ready. A ticket turns amber, then red, as it waits. Can\'t make asks how many and why.' }
    ]
  },
  {
    key: 'pos.stations', nav: 'pos.stations', title: 'Preparation stations', version: 2,
    changes: [{ version: 2, steps: [{ id: 'add', target: '[data-testid="station-new"]', title: 'Colours for the kitchen display', body: 'A station now also has the minutes after which its tickets turn amber and then red on the kitchen display. Open a station with Edit to set them.' }] }],
    steps: [
      { id: 'what', title: 'Where orders are prepared', body: 'A station is a place that makes what you sell: the bar, the kitchen, a grill. When someone presses Send, each station gets its own ticket with its items.' },
      { id: 'add', target: '[data-testid="station-new"]', title: 'Add a station', body: 'Name it, and choose how it behaves: whether a bill waits for it before it can be paid (a bar usually does, a kitchen usually does not), and whether stock leaves when it is ready or when the bill is sent.' },
      { id: 'list', target: '[data-testid="station-list"]', title: 'Your stations', body: 'Give each stock group a station on the Stock Groups screen, and one item its own on its stock card. The default station takes whatever has none. A station is switched off, never deleted.' }
    ]
  },
  {
    key: 'pos.tables', nav: 'pos.tables', title: 'Tables', version: 1,
    steps: [
      { id: 'what', title: 'Your tables', body: 'List the tables of each branch once. When someone opens a table bill, the till offers the list and shows which tables already have a bill running. A name typed at the till still works for anything not listed.' },
      { id: 'add', target: '[data-testid="table-new"]', title: 'Add tables', body: 'Add one table with its name, area and seats, or use Add several to make Table 1 to Table 20 in one go.' },
      { id: 'list', target: '[data-testid="table-list"]', title: 'The list', body: 'Edit renames a table or switches it off. A table is never deleted, so old bills keep their table, and one with a bill still open cannot be switched off.' }
    ]
  },
  {
    key: 'pos.sales', nav: 'pos.sales', title: 'My Sales', version: 1,
    steps: [
      { id: 'what', title: 'Your own sales', body: 'Every bill you served or took a payment on is listed here, today\'s first. Nobody else\'s is shown to you, and yours are shown only to you and to supervisors and managers.' },
      { id: 'filters', target: '[data-testid="report-filters"]', optional: true, title: 'Find a sale', body: 'Choose the dates, how it was paid, an amount, or type the bill number, the customer or the table, then Apply.' },
      { id: 'figures', target: '[data-testid="report-summary"]', optional: true, title: 'Your figures', body: 'What you sold, and the money you took by cash, card and transfer. The cash figure is what your drawer should hold from sales.' },
      { id: 'receipt', target: '[data-testid="my-sales"]', title: 'Send a receipt again', body: 'Receipt on a row opens that bill\'s receipt. Print it, or send it to the customer by WhatsApp, e-mail, SMS or a code they scan.' }
    ]
  },
  {
    key: 'pos.tips', nav: 'pos.tips', title: 'Tips', version: 1,
    steps: [
      { id: 'what', title: 'Where tips go', body: 'A tip taken with a payment belongs to whoever served that bill. The business holds it until it is paid to them or given away, and both are recorded here so nothing goes missing.' },
      { id: 'totals', target: '[data-testid="tips-totals"]', optional: true, title: 'The four figures', body: 'Collected, paid to staff, donated, and what is still being held. Held is always collected less the other two.' },
      { id: 'staff', target: '[data-testid="tips-staff"]', optional: true, title: 'By staff member', body: 'What each person was tipped and what is held for them. Pay out records money handed to them; it cannot be more than what is held.' },
      { id: 'entries', target: '[data-testid="tips-entries"]', title: 'Payouts and donations', body: 'Every entry stays here with who recorded it. A mistake is reversed with a reason, never deleted. The Tips report shows any period.' }
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
