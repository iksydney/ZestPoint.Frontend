import { Chapter, careful, list, notYet, p, section, shot, steps, table, tip } from '../manual.types';

/** Kitchen and bar staff, the store keeper (receiving clerk) and the accountant. Default rights: ZestPoint.Data/Seed/SystemRoles.cs. */
export const KITCHEN_STAFF: Chapter = {
  id: 'kitchen-staff',
  title: 'For kitchen and bar staff',
  summary: 'Working your station\'s tickets, saying what cannot be made, asking the store for stock, and recording what you make.',
  roles: ['kitchen'],
  sections: [
    section('ks-role', 'What kitchen and bar staff can do', [
      p('The ready-made **Kitchen Staff** role works the kitchen\'s tickets, records batches and the prep list, asks the store for stock, sees the kitchen reports and records market runs. The **Bartender / Mixologist** role prepares what is sent to the bar, tells the waiter it is ready, views stock, runs bottle audits and can ask the store for stock. A bartender does **not** sell: a company gives a bartender the selling rights, or the Cashier role, if they should.'),
      p('If your role works at one station, such as the Kitchen, you see and hear only that station\'s tickets. A role with no station ticked works at every station.')
    ]),
    section('ks-tickets', 'Working a ticket', [
      p('When a waiter presses **Send**, each station gets its own ticket with only its items, and the people at that station are told: a sound on the screen the station is shown on (below) and a notification on their phone, reading for example "New order for the Kitchen: Table 7".'),
      p('Each station is shown on **one** screen, **Bar Orders** or the **Kitchen Display**. A manager chooses it on **Admin**, **Set-up**, **Preparation Stations**, with **Shown on**: a bar is usually on Bar Orders and a kitchen on the Kitchen Display. A station\'s tickets are on its screen only, never on both.'),
      p('The kitchen display (**Sell**, **Kitchen Display**) is a wall screen or tablet. It lists the tickets of the stations shown on it and sounds for each new one while it is open. **Bar Orders** (**Sell**, **Bar Orders**) is a list for the stations shown there; for those stations a sound and a prompt also appear on whatever screen you are on, and the count on the floating button goes up. The two screens work the same way. (The Kitchen Display is part of some plans only. A company without it sees every station\'s tickets on **Bar Orders**, and **Preparation Stations** says so beside each station.)'),
      steps(
        'Choose the station the screen is for (Kitchen, Grill and so on). If your role works at one station, it is already chosen. The screen remembers your choice.',
        'Tickets appear by themselves, oldest first. Press **Start** (or **Take order** at the bar) to take a ticket. Only the person who took it works on it.',
        'On the kitchen display, tap an item to tick it off as you make it.',
        'Press **Bump: ready** (at the bar, **Ready: tell** and the waiter\'s name). The waiter who sent the order is told straight away.',
        'If you cannot make something, press **Can\'t make**. It asks how many and why. The waiter is told with your reason. The line stays on the bill until it is changed or voided.'
      ),
      p('**All day** shows what is still to make across every ticket added up: how many burgers, how many fries.'),
      p('A ticket turns **amber** and then **red** as it waits. How many minutes that takes is set on the station by a manager.'),
      shot('kitchen-display', 'The kitchen display: the station\'s tickets, oldest first, with what is still to make.', 'The Kitchen display screen showing the Kitchen station\'s tickets side by side, each with a table, the items to make, a Start button and a Bump button, and an All day summary above.'),
      careful('Marking a ticket **ready** can be called back by mistake for 30 minutes with **Recall**, unless the waiter has already collected it, or your station is set to take stock when an order is ready (the bar usually is). Stock has moved by then, and a button does not undo it: ask a supervisor to void what was a mistake.')
    ]),
    section('ks-stock-when', 'When does stock leave?', [
      p('It depends on how your station was set up. A **kitchen** usually takes its stock when the bill is **sent**. A **bar** usually takes it when you mark the order **ready**. This is why marking the bar\'s tickets ready on time matters: until you do, the shelf in ZestPoint still shows the bottles.')
    ]),
    section('ks-phone', 'Working a station from your phone', [
      p('If your role works at a station, the phone app has a **Station** tab. It lists your station\'s tickets in three groups: **Being made by you**, **Waiting** and **Being made by someone else**. You can take a ticket, mark it ready and say what cannot be made. A new ticket sounds the alert and buzzes. It needs a signal.'),
      notYet('The phone cannot tick off single items, and cannot call back a ticket that was marked ready. Use the website\'s Kitchen Display for those. The phone has no screen for batches, store issues or market runs.')
    ]),
    section('ks-store', 'Asking the store for stock', [
      p('When the kitchen runs low, ask the store. Open **Kitchen**, **Store Issues**, press **Ask the store for stock**, choose your station, the items and how much. The store hands over what it can, and you press **Confirm what arrived**. The stock then sits in your station\'s own place.'),
      list(
        'The person who asks cannot hand the stock over, and the person who handed it over cannot confirm it.',
        'If less arrives than was handed over, say so when you confirm. The difference is shown and the store is told.',
        'You can cancel a request that has not been handed over.'
      ),
      careful('Your station needs its own stock place before it can ask. If ZestPoint says **The Kitchen has no stock place at this branch yet**, ask a manager to set one up on **Stock**, **Bin Locations**.')
    ]),
    section('ks-batches', 'Recording what you make', [
      p('For things made once and sold in portions, a cake or a pot of stew, record each batch on **Kitchen**, **Production**. The chapter **A day in the kitchen** explains it step by step.')
    ]),
    section('ks-waste', 'Writing off waste', [
      p('When food is lost, record it so that stock stays right: open **Stock**, **Adjustments**, pick the item, take the quantity away and choose the reason. The kitchen has four of its own: **Prep trim**, **Spoiled in store**, **Staff meal and tasting**, and **Remade or thrown away after cooking**. They show on the **Kitchen Waste Report**.')
    ]),
    section('ks-wrong', 'When something looks wrong', [
      list(
        '**No tickets are showing.** Check the station chosen at the top. Check your role works at that station. Check the station is shown on this screen: a station shown on Bar Orders has no tickets on the Kitchen Display, and the other way round. A screen with no station on it says so and where to change it. A company that has the bar man method switched off sends nothing to stations.',
        '**This ticket is for the Bar, which your role does not work at.** You are on a role limited to another station. Ask a manager.',
        '**Someone else took the ticket.** The first person to take a ticket owns it. The screen says who has it.',
        '**A sound for the wrong station.** Ask a manager to tick the right station on your role.'
      )
    ])
  ]
};

export const STORE_KEEPER: Chapter = {
  id: 'store-keeper',
  title: 'For the store keeper',
  summary: 'Receiving deliveries against their orders, putting stock in bins, giving the second key, and handing stock to the kitchen and bar.',
  roles: ['store'],
  sections: [
    section('sk-role', 'What a store keeper can do', [
      p('The ready-made **Receiving Clerk** role receives deliveries at the dock: checks goods against orders, puts them in bins and can give the second key. It can also print labels, ask for and hand out store issues and record market runs. It cannot raise orders, and it does not see costs.')
    ]),
    section('sk-receive', 'Receiving a delivery', [
      steps(
        'Open **Purchasing**, **Goods Receiving**. It lists what is waiting at your branch: orders, returns to release, transfers in, and deliveries holding lines for a second person.',
        'Open the order and press **Receive**. You see each line: ordered, received before, and what is still **outstanding**.',
        'Check what arrived. Type or scan each item and its count, or press **Receive all lines (100%)** if all of it is right. Accepted quantity can never be more than what is outstanding.',
        'Press **Details** on a line to set its **bin**, its **lot code** (needed for some items), its **expiry date**, and how many you **turned away** because they were damaged or wrong.',
        'Fill in the **receiving bay** and the **security seal** if you use them.',
        'Press the commit button and confirm. The stock goes up in the bins you chose.'
      ),
      shot('goods-receiving', 'Receiving: each line against its order, with its bin and expiry date.', 'The Goods Receiving screen for a purchase order, with one row for each item showing ordered, outstanding and accepted quantities, a bin, and buttons to receive all lines and commit.'),
      tip('If an item has a **shelf life** on its stock card, ZestPoint fills the expiry date for you from the day it arrives. A delivery with no lot code you typed gets the lot of the day it came.'),
      careful('You cannot receive an order you raised yourself. The owner may, and a delivery with no earlier order has none to raise.')
    ]),
    section('sk-problems', 'When something is wrong with a delivery', [
      list(
        '**Damaged or wrong goods.** Put their number under **Turned away**. They are recorded as a problem. You can attach photos, and a **claim slip** with its own number can be issued for the supplier.',
        '**More arrived than was ordered.** ZestPoint will not accept more than is outstanding. Ask a manager to change the order, or send the extra back.',
        '**A line is for a high-security bin.** The screen says **Second key needed**. The stock is held, not counted, until another person confirms it.'
      )
    ]),
    section('sk-second-key', 'Giving the second key', [
      p('Some bins are marked **High security**, for expensive goods. A line going into one is saved but held. Another person who may receive goods, signed in on their own device, opens the delivery and confirms it (with a note) or refuses it with a reason. Only then does it count as stock.'),
      p('When a delivery is waiting for you, the people who can receive goods are told: "A delivery is waiting for a second person". The person who received it is not asked.')
    ]),
    section('sk-bins', 'Bins', [
      p('**Stock**, **Bin Locations** shows each shelf, cage and cellar and what it holds. You can move stock between bins (a reason is optional), and set a bin as the default for an item at a branch. Ordinary bins are used first, then secure ones.'),
      shot('bins', 'Bin Locations.', 'The Bin Locations screen listing a main shelf, a cellar, a secure cage and the kitchen\'s own bin with the number of items each holds.')
    ]),
    section('sk-issues', 'Handing stock to the kitchen or bar', [
      p('A station asks the store on **Kitchen**, **Store Issues**. When it does, you are told. Open the request and press **Hand over**, say how much of each line you hand over, and press **Hand it over**. It may be less than was asked. Stock moves from your bin to the station\'s own place.'),
      list(
        'You cannot hand over a request you made yourself.',
        'Whoever hands stock over cannot be the one who confirms it arrived: someone at the station does.',
        'If the store does not hold enough, ZestPoint says which item and refuses that line.'
      ),
      shot('store-issues', 'Store Issues: requests from the kitchen and bar, and where each is.', 'The Store Issues screen listing requests from the Kitchen and the Bar with their numbers, the items asked for and issued, their status, and buttons to hand over, confirm and cancel.')
    ]),
    section('sk-labels', 'Labels and counting', [
      list(
        '**Labels.** **Stock**, **Labels** prints shelf and barcode labels for items. A label printer must be set up first (**Admin**, **Set-up**, **Printers**).',
        '**Counting.** A stock take is counted on **Stock**, **Reports**, **Stock Take Report**, or on the phone, where counting works even without a signal. Someone else approves it.',
        '**Looking up.** On the phone, the **Stock** tab looks an item up by name or by scanning its barcode.'
      ),
      notYet('Expired stock stays on the count until someone writes it off. ZestPoint warns about it but does not remove it.')
    ]),
    section('sk-wrong', 'When something looks wrong', [
      list(
        '**An order is not in the queue.** It may not be approved yet. It shows as Posted and awaiting approval until someone else approves it.',
        '**I cannot open the order itself.** Receivers open the receiving screen, not the order. That is the rule.',
        '**A request for stock says there is no stock place.** The station needs a bin of its own: ask a manager.',
        '**The stock I received does not show.** If a line went into a secure bin, it waits for the second key.'
      )
    ])
  ]
};

export const ACCOUNTANT: Chapter = {
  id: 'accountant',
  title: 'For the accountant',
  summary: 'The ledger, what posts to it, paying suppliers, and the reports to check at the end of a month.',
  roles: ['accountant'],
  sections: [
    section('acc-role', 'What an accountant can do', [
      p('The ready-made **Accountant** role has financial reporting, valuation and cost visibility, no POS operation and no stock editing. It sees the ledger, the sales and stock reports, supplier payments and the kitchen reports, and it can export reports.')
    ]),
    section('acc-ledger', 'The ledger is kept for you', [
      p('Nothing is typed into the ledger. Every sale, payment, refund, delivery, stock movement and supplier payment posts its own balanced entry, from what was recorded. **Finance**, **Chart of Accounts** shows each account and what it holds today, and **Entries** shows what made up a balance. **Trial Balance**, **Profit and Loss** and **Ledger Journal** are under **Finance**, **Reports**.'),
      table(['What happened', 'What posts'], [
        ['A bill is paid or refunded', 'Customer bills and the way it was paid; sales per account; tax collected; tips owed to staff; discounts given; refunds given'],
        ['A payment is taken', 'Cash on hand, card takings or transfer takings, against customer bills'],
        ['Goods are received', 'Stock (at what was paid, after discount, without tax), tax on purchases, and suppliers owed'],
        ['Stock is sold', 'Cost of goods sold against stock, at the cost recorded at the time'],
        ['Waste, spillage, breakage or an adjustment', 'Stock losses and gains against stock'],
        ['Goods are returned to a supplier', 'Supplier returns against stock; the supplier\'s balance falls'],
        ['A supplier is paid', 'Suppliers owed against cash on hand or the bank'],
        ['Cash goes in or out of a drawer', 'Cash on hand against drawer cash in and out'],
        ['A shift closes with a difference', 'Cash on hand against cash over and short'],
        ['A gift card is sold or spent', 'Gift cards outstanding (a liability). A card sold is not income; spending it is.']
      ]),
      p('Every company starts with a ready-made list of accounts that you can rename and add to, for example 1000 Cash on hand, 1200 Stock, 2000 Suppliers owed, 4000 Sales, 5000 Cost of goods sold and 5100 Stock losses and gains. ZestPoint finds accounts by their role, so a renamed account still works. Each stock group can name its own sales and stock accounts, and so can an item; if neither does, the company\'s standard ones are used.'),
      tip('The ledger catches up whenever you open **Chart of Accounts** or a ledger report, or press its button. It never touches the sale itself, so it can never slow or stop one.'),
      shot('ledger', 'Chart of Accounts: each account and what it holds today.', 'The Chart of Accounts screen listing the ledger accounts with their codes, types and current balances, and a button to bring the ledger up to date.')
    ]),
    section('acc-suppliers', 'Paying suppliers', [
      steps(
        'Open **Purchasing**, **Supplier Payments**. It shows what you owe each supplier.',
        'Record a payment against a supplier. Payments are applied to the oldest received goods first.',
        'A wrong payment is reversed, never edited: the reversal is its own entry with a reason.'
      ),
      p('You cannot overpay: a payment above what is owed is refused. The reports **Aged Suppliers Report**, **Supplier\'s Statement of Account**, **Purchases Report** and **Purchases Tax Report** show the rest.'),
      notYet('There is no supplier invoice register. Purchases are recorded when goods are received, and payments are recorded separately. Supplier payments need access to every branch, because a supplier is the company\'s.')
    ]),
    section('acc-reports', 'Reports to check each month', [
      table(['Check', 'Report', 'Where'], [
        ['Sales, discounts, tax, tips and payments', '**Summary Income Report**, **Payments History**', '**Sell**, **Reports**'],
        ['Every void, and who authorised it', '**Void History Report**', '**Sell**, **Reports**'],
        ['Tips held and paid out', '**Tips Report**', '**Sell**, **Reports**'],
        ['What the stock is worth', '**Stock Value Report**, **Cost Prices Report**', '**Stock**, **Reports**'],
        ['How long stock has sat', '**Stock Aging Report**', '**Stock**, **Reports**'],
        ['What you owe suppliers', '**Aged Suppliers Report**', '**Purchasing**, **Reports**'],
        ['The books balance', '**Trial Balance**, **Profit and Loss**', '**Finance**, **Reports**'],
        ['What the kitchen lost, and what a batch gave', '**Kitchen Waste Report**, **Production Variance Report**, **Actual Against Expected Use Report**', '**Kitchen**, **Reports**'],
        ['Money spent at markets that was not stock', '**Market Run Expenses Report**', '**Purchasing**, **Reports**']
      ]),
      p('Reports can be exported to a file (a CSV that a spreadsheet opens) and printed, if your role allows it. Export is recorded in the activity log.')
    ]),
    section('acc-limits', 'What to know about the figures', [
      notYet('There is **one tax setting** for the company: one name, one rate, inclusive or exclusive. Per-product tax rates are not there yet, apart from marking an item exempt.'),
      notYet('The **Multi-Currency Report** shows sales and payments in each currency and uses no exchange rates: it does not convert one currency into another.'),
      notYet('You cannot post your own journal entries. A correction is made by correcting the thing it came from, and the ledger follows.'),
      notYet('Some figures are labelled estimates on the report itself: how much is left of a batch, and the age of stock when it is worked out from the ledger. The report says so in a note.'),
      careful('Card and transfer payments are recorded, not charged. Reconcile them against your card machine and bank statements, not against ZestPoint.')
    ]),
    section('acc-wrong', 'When something looks wrong', [
      list(
        '**The ledger looks old.** Open **Chart of Accounts** once; it catches up.',
        '**Stock in the ledger and the stock value disagree.** Stock that is waiting for a second key is left out of the ledger until it is released. A line that was held is posted as provisional and replaced when it is released.',
        '**Sales on the reports and on the dashboard differ.** A bill that sold a gift card is left out of the sales figures, because a card sold is not a sale. Collections still include the money taken.',
        '**A report is blank for a branch.** The report covers only the branches your role may see, and says so in a note.'
      )
    ])
  ]
};
