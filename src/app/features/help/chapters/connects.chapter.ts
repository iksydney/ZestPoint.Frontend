import { Chapter, careful, diagram, list, notYet, p, section, steps, table, tip } from '../manual.types';

/** How buying, the store, the kitchen and bar, the till and the books connect. Every statement is from the architecture notes of the three repositories. */
export const CONNECTS: Chapter = {
  id: 'connects',
  title: 'How it all connects',
  summary: 'One picture of the whole business: what you buy, what the store holds, what the kitchen and bar use, what the till sells, and where it all ends up.',
  roles: 'all',
  sections: [
    section('big-picture', 'The big picture', [
      p('ZestPoint is one system, not a set of separate tools. What happens in one place changes what another place shows. Buying puts stock in the store. The kitchen and bar take stock from the store. The till sells what the kitchen and bar made. Every step is written down, so stock, cost and the ledger always agree.'),
      diagram('connect', 'How buying, the store, the kitchen and bar, the till and the books connect.',
        'A picture in five steps from top to bottom. One: buying, with purchase orders, market runs and suppliers. Two: the store, where goods are received into bins with expiry dates. Three: the kitchen and bar, where stations ask the store for stock, cook from recipes and make batches. Four: the till and the receipt, where orders are sent, paid and receipted. Five: stock, cost and the ledger, where every movement is recorded. A side box says that the bell and the phone tell the right person at each step.'),
      p('Read it from the top. Each step has its own section below.')
    ]),
    section('one-bag-of-flour', 'One bag of flour, start to finish', [
      p('The easiest way to see the connections is to follow one thing through the whole business. Here is a kitchen that bakes a cake and sells it by the slice.'),
      steps(
        '**Buy.** A manager raises a purchase order for flour with a supplier and posts it. Someone else approves it, and the supplier is sent a link to see the order. (If the flour was bought for cash at a market, the cook records a **market run** instead.)',
        '**Receive.** The flour arrives. The store keeper checks it against the order, puts it in a bin and types its expiry date. Stock goes up, and the average cost of flour moves if the price changed.',
        '**Ask the store.** The kitchen asks the store for flour on **Store Issues**. The store hands it over and the kitchen confirms what arrived. The flour now sits in the kitchen\'s own stock place, apart from the store\'s.',
        '**Make a batch.** The cook records the cake on **Production**: how many batches and how many slices actually came out. The ingredients leave stock, the slices are added, and the cost of one slice is worked out.',
        '**Sell.** A waiter adds a slice to a bill and sends it. A kitchen ticket is made. The slice leaves the kitchen\'s stock when the station says it should (when sent or when ready).',
        '**Pay.** The cashier takes payment. The receipt shows what was sold. The sale is recorded with the cost of what was used.',
        '**Count the cost.** **Food Cost** shows what a slice costs against its price. The ledger has already posted the sale, the money taken and the cost of goods sold, with nothing typed in.'
      ),
      tip('Nothing in this chain is typed twice. Each step uses what the step before it recorded.')
    ]),
    section('buying', 'Step 1: Buying', [
      p('There are two ways to buy, and both end with stock in the store.'),
      list(
        '**Purchase orders** (**Purchasing**, then **Purchase Orders**) for suppliers you order from. You choose the supplier, scan or type the items, and press **Post purchase order**. It goes to an approver, who is someone else (the owner may approve what they posted themselves). The order shows how far it has got: Draft, Posted and awaiting approval, Approved and awaiting receiving, Awaiting verification or part received, Received.',
        '**Market runs** (**Purchasing**, then **Market Runs**) for cash buying at a market, with no supplier and no order. The stock is counted in at once so the kitchen can cook, and a manager confirms the run afterwards.'
      ),
      p('The same screen also starts three other documents: a **direct delivery** (goods that arrived with no earlier order, booked in one step), a **return to a supplier**, and a **transfer between branches**.'),
      p('A purchase order can be shared. Open it and press **Share** to send its link to the supplier by WhatsApp, e-mail, SMS or a QR code. They see that one order without signing in.'),
      p('Buying also records what you owe. **Supplier Payments** shows what you owe each supplier and lets you record what you pay. The reports **Aged Suppliers** and **Supplier\'s Statement of Account** show it by age and by supplier.'),
      notYet('A supplier\'s credit limit warns, it does not stop you. Posting over the limit asks for a reason, and the approver can see that reason.')
    ]),
    section('store', 'Step 2: The store', [
      p('Goods become stock only when someone receives them. **Goods Receiving** lists what is waiting. Open an order and check what arrived against what was ordered: type or scan each item, or press **Receive all lines (100%)** when everything is right.'),
      list(
        'For each line you can note the **lot**, the **expiry date**, the quantity **turned away** (damaged or wrong) and the **bin** it goes into. If an item has a shelf life set on its stock card, ZestPoint fills the expiry date for you.',
        'Goods that were turned away are recorded as a problem with a photo, and a claim slip with its own number can be issued for the supplier.',
        'The person who raised an order cannot receive it. The owner is the exception, and so is a direct delivery, which has no earlier order.',
        'A **bin** can be marked as secure. Goods put into a secure bin are held until a second person confirms them, and only then do they count as stock.',
        'A person who receives goods does not see costs unless their role allows it.'
      ),
      p('When goods are received, the stock goes up in the bin you chose. ZestPoint keeps an **average cost** for every item: when a new delivery comes in at a different price, the average moves. That average is what stock is valued at and what recipes are costed from.'),
      careful('Creating an item adds no stock. Stock comes in only through receiving, a market run, an adjustment, a stock take or an opening quantity in an import file.')
    ]),
    section('kitchen-and-bar', 'Step 3: The kitchen and the bar', [
      p('The bar, the kitchen and any other place that makes what you sell are called **stations**. A station can hold its own stock, ask the store for more, and cook from recipes.'),
      list(
        '**Stations** (**Admin**, **Set-up**, **Preparation Stations**) say where orders are made. Each stock group goes to a station, and one item can have its own. A station says whether a bill must wait for it before it can be paid (a bar usually does, a kitchen usually does not) and whether stock leaves when the order is sent or when the station marks it ready.',
        '**Store Issues** (**Kitchen**, **Store Issues**) is how a station asks the store for stock. The station asks, the store hands over what it can (it may be less), and the station confirms what arrived. If less arrives than was handed over, the difference is shown and the store is told.',
        '**Recipes** (on an item\'s stock card, on the **Recipe and options** tab) say what one sale of a dish uses. Each ingredient has a **usable percent**, because trimming wastes some: tomato at 85 means 850 g usable takes 1,000 g off the shelf.',
        '**Batches** (**Kitchen**, **Production**) are for things made once and sold in portions, such as a cake or a pot of stew. When a batch is finished you record how many portions came out. The ingredients leave stock, the portions are added, and the cost of one portion is worked out.'
      ),
      p('A station can have its own stock place, a bin that belongs to it. Sales, tickets and batches at that station take from its own bin first, and from the store only after that.')
    ]),
    section('till', 'Step 4: The till and the receipt', [
      p('A waiter or cashier opens a bill, adds items and presses **Send**. ZestPoint makes one ticket for each station involved, with only that station\'s items, and tells the right people. When the station marks the order ready, the waiter is told. Then the bill is paid and a receipt is made.'),
      diagram('journey', 'The journey of one bill, from the table to the receipt.',
        'A picture in seven steps from top to bottom. The waiter opens a bill and adds items. The waiter presses Send. ZestPoint makes one ticket for each station. The station takes the ticket and marks it ready, and stock leaves at the moment the station is set to use. The waiter collects and serves. The bill is handed to a cashier. The cashier takes payment and the receipt is made.'),
      list(
        'Prices come from the stock card. **Nobody can type a price at the till.** An item\'s own discount, its special price and its minimum price are applied by ZestPoint.',
        'Payment can be cash, card or bank transfer, or part of a bill by loyalty points or a gift card, or any mix. Card and transfer are **recorded, not charged**: the customer pays on your own card machine or by transfer, and the cashier confirms it on the till. ZestPoint moves no money.',
        'The receipt is a fixed copy of the sale. It can be printed, or shared by WhatsApp, e-mail, SMS or a QR code that opens a web page of the receipt.',
        'Every sale records what it used from stock and what that cost.'
      )
    ]),
    section('books', 'Step 5: Stock, cost and the ledger', [
      p('Every change to stock is written down as a movement: a delivery, a sale, a batch, a waste, an adjustment, a transfer. Nothing changes stock silently. An item\'s **Activity** tab and the **Stock Transactions Enquiry Report** lists every one.'),
      p('The **ledger** (**Finance**) is kept by ZestPoint, not typed. Sales, payments, refunds, goods received, supplier payments, stock losses, cash put in and taken out of the drawer, and a shift\'s cash difference each post their own balanced entry. **Chart of Accounts** shows the accounts and what each holds. **Trial Balance**, **Profit and Loss** and **Ledger Journal** are under Finance, then Reports.'),
      tip('The ledger catches up whenever someone opens **Chart of Accounts** or a ledger report, so it never slows down a sale. If a figure looks old, open the screen once.'),
      p('The reports in each area (sales, stock, purchasing, kitchen) all read the same records, so a figure on one report agrees with the same figure on another for the same period.')
    ]),
    section('who-is-told', 'Who is told what', [
      p('ZestPoint tells the right person at the right moment, in two places. The **bell** at the top of every screen (the speech-bubble button) keeps every notice with its details. On a phone with the app, the same notice can also arrive as a **notification**, in plain words that show what and where but never a name or an amount.'),
      table(['What happens', 'Who is told', 'What a locked phone shows'], [
        ['A new ticket for a station (after **Send**)', 'People whose role works at that station and who can work its orders, at that branch (not the person who sent it)', 'New order for the Kitchen: Table 7'],
        ['A station marks an order ready', 'The waiter who sent it', 'Table 4: your order is ready'],
        ['A station cannot make something', 'The waiter who sent it', 'Table 9: something in your order cannot be made'],
        ['A waiter asks for payment', 'People who can take payment at that branch', 'Table 4 is ready to pay'],
        ['A guest sends an order or a call from the code on a table', 'People who can take orders at that branch', 'Table 4: a guest is asking'],
        ['A bill is handed over to someone', 'The person who receives it', 'Table 5: a bill was handed over to you'],
        ['Someone else pays a bill you opened', 'The bill\'s owner', 'Table 5: your bill was paid'],
        ['A stock adjustment above the limit, a stock take or a purchase order is sent up', 'People who can approve it (not the person who sent it)', 'Something is waiting for your approval'],
        ['That request is decided', 'The person who sent it up', 'Your stock take was turned down (or approved)'],
        ['A shift is closed with a cash difference over the limit', 'People who review shifts at that branch', 'A shift was closed with a cash difference'],
        ['Goods for a secure bin wait for a second person', 'People who can receive goods at that branch (not the receiver)', 'A delivery is waiting for a second person'],
        ['An item is at or below its re-order level', 'People who can adjust stock at that branch, once a day for each branch', 'Items are running low at (the branch)'],
        ['A market run waits to be confirmed, or a station asks the store for stock', 'Managers who confirm market runs; people who may hand stock over (not the person who asked)', 'Something is waiting for your approval'],
        ['Stock expires soon, a station sold more portions than were recorded, or a station\'s own stock runs short', 'People at that station, and stock managers for expiry', 'Something at your station needs you'],
        ['ZestPoint finds something unusual (loss prevention)', 'People who may see loss prevention', 'A loss-prevention alert'],
        ['The plan is ending or a payment is overdue', 'People who manage the subscription', 'Your plan is ending soon'],
        ['The daily summary is ready', 'The people you chose on **Daily Summary Set-up**', 'Your daily summary is ready']
      ]),
      p('Each person can switch each kind of notification off for themselves on the phone, and can set quiet hours. The bell keeps everything either way.'),
      notYet('Notifications on the phone need the server to have been given a key by whoever runs ZestPoint, and they are on Android phones only for now. A manager can see whether they are working on **Admin**, **Set-up**, **Messages**. SMS and WhatsApp are not available yet. See the chapter **What ZestPoint does not do yet**.')
    ]),
    section('promises', 'Three promises ZestPoint keeps', [
      list(
        '**ZestPoint decides prices and totals.** The price is the one on the stock card. Totals, tax and change are worked out by ZestPoint, not by the screen.',
        '**Everything risky is written down.** Every void, discount, refund, price change, stock adjustment and count records who did it, when and why. It is in the activity log on **Staff**.',
        '**Two people for the risky things.** The person who starts something is often not the person who may finish it.'
      ),
      table(['The job', 'The first person', 'The second person'], [
        ['Purchase order', 'Raises and posts it', 'Someone else approves it (the owner may approve their own)'],
        ['Receiving goods', 'The person who receives', 'Not the person who raised the order (the owner excepted)'],
        ['Goods into a secure bin', 'The person who receives', 'A different person gives the second key'],
        ['Store issue', 'The station asks', 'The store hands over; whoever handed over does not confirm (the owner excepted)'],
        ['Voiding a sent item or a whole bill', 'The waiter or cashier', 'A supervisor types their staff code and PIN at that till, every time'],
        ['A refund', 'The cashier', 'A manager who may refund types their staff code and PIN'],
        ['A stock adjustment above the company\'s limit', 'Whoever asks', 'Someone else approves'],
        ['A stock take', 'The person who counts', 'Someone approves it, then the book figures are corrected'],
        ['A shift that ends with a big cash difference', 'The cashier', 'A supervisor reviews it (not the cashier)'],
        ['A market run', 'The buyer', 'A manager who is not the buyer confirms it or asks a question'],
        ['A loss-prevention alert', 'ZestPoint raises it', 'A reviewer, never someone it is about']
      ])
    ])
  ]
};
