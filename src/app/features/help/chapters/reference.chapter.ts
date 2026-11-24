import { Chapter, careful, list, p, section, table, tip } from '../manual.types';

/**
 * What ZestPoint does not do yet (every line is from the findings and architecture notes of the three repositories: Hard stop 9, never claim what
 * does not exist), a glossary, and the frequently asked questions.
 */
export const NOT_YET: Chapter = {
  id: 'not-yet',
  title: 'What ZestPoint does not do yet',
  summary: 'An honest list of what is partly done or not done, so you never plan around something that is not there.',
  roles: 'all',
  sections: [
    section('ny-intro', 'Why this list is here', [
      p('A manual that promised things ZestPoint does not do would cost you money and trust. This chapter lists what is partly done or not done, as of 24 November 2026. The same notes appear in the chapters where they matter.')
    ]),
    section('ny-money', 'Money and the books', [
      list(
        '**Card and bank transfer are recorded, not charged.** ZestPoint talks to no bank, card machine or payment provider. The customer pays on your own card machine or by transfer, and the cashier confirms it. A refund is recorded the same way.',
        '**One tax setting for the company:** one name, one rate, inclusive or exclusive. An item can be marked tax exempt, but per-item rates are not there.',
        '**No exchange rates.** The Multi-Currency Report shows each currency as it is and does not convert one into another.',
        '**No journal entries by hand.** The ledger is posted by ZestPoint from what happens. A correction is made to the thing it came from.',
        '**No supplier invoice register.** Purchases are recorded when goods are received and payments separately.',
        '**A supplier\'s credit limit warns; it does not stop an order.**',
        '**Some figures are estimates,** and say so on the report: how much of a batch is left, and the age of stock when it is worked out from the ledger.'
      )
    ]),
    section('ny-selling', 'Selling', [
      list(
        '**Asking a cashier to take payment does not let them take it.** A bill can be paid only by its owner, a supervisor or a manager. The waiter asks, then hands the bill over. The owner chose to leave it this way.',
        '**Promotions, price look-up screens and multi-lane checkout** are not built.',
        '**Selling by weight at the till:** an item can be marked as sold by a scale, but the till does not read a scale for sales yet.',
        '**No web store.** An item can be marked as listed on a web store, but there is no web store.',
        '**Card, transfer, loyalty points and gift cards** need a connection. They cannot be used offline.',
        '**The till asks for a shift, but ZestPoint does not insist on one.** The Point of Sale asks everyone who sells or takes orders to start a shift, on the screen only. ZestPoint itself still accepts a bill or an order with no shift behind it. The one thing it refuses is a payment with no shift, and only when **Staff must start a shift before taking payments** is ticked in **Settings**; a sale already made offline is never refused for this.',
        '**Hotel room charging and an enterprise interface** are marked "coming soon" in the plans and do nothing yet.'
      )
    ]),
    section('ny-kitchen', 'The kitchen and the store', [
      list(
        '**A recorded batch cannot be undone.** Correct it with a stock adjustment and a note.',
        '**Expired stock stays on the count** until a person writes it off. ZestPoint warns but does not remove it.',
        '**A dish\'s food cost does not include its options or add-ons.**',
        '**The days used for kitchen alerts, and the weekday on the prep list, start at midnight in universal time (UTC),** not at midnight in your branch.',
        '**Photos of receipts** from market runs and deliveries are kept but not yet shown back on the website.',
        '**Actual Against Expected Use** needs stock takes in the period to say anything about what is unexplained.',
        '**Stations are limited by role, not by person.** A cook who also covers the bar needs a role that lists both stations. The ready-made Kitchen Staff and Bartender roles list no station until an admin sets them, so until then they work at every station.',
        '**A ticket that waits past its red minutes does not remind the station.**',
        '**The Kitchen Display sounds only while it is open.** A new ticket of a station shown there does not ring the bar bell or float a prompt on other screens: those belong to the stations shown on Bar Orders.',        '**A role changed while someone is connected** reaches their live connection when it reconnects, within about 15 minutes. The lists they read are right at once.',
        '**Loss prevention** cannot show a supervisor only the people below them, because ZestPoint has no record of who reports to whom. Branch managers and supervisors get no loss-prevention rights by default.'
      )
    ]),
    section('ny-messages', 'Messages and notices', [
      list(
        '**SMS and WhatsApp are not available yet.** They need a provider account. Until then a message on them fails with that reason and is never pretended to have been sent.',
        '**E-mail** is sent only when the server has been given its mail settings.',
        '**Notifications on phones** need the server to have been given a key by whoever runs ZestPoint, and work on Android only. There is no iPhone support yet.',
        '**The low-stock notice** comes once a day for each branch and lists what is low then.',
        'There are **no notices** for a layby or consignment that is due, for a kitchen ticket waiting too long, or for a bill the waiter paid themselves.',
        '**Quiet hours** use the company\'s time zone, not a branch\'s.'
      )
    ]),
    section('ny-phone', 'The phone app', [
      list(
        '**Not tried on a real phone or a real printer yet.** It has been tested by computer and on an Android emulator, and notifications have been seen on an emulator only.',
        '**No iPhone app.**',
        '**The phone has no screens for batches, store issues or market runs.** Use the website.',
        '**The Station tab** cannot tick off single items or call back a ticket marked ready, and needs a signal.',
        '**Offline:** a first sign-in needs a signal; card, transfer, points, gift cards, discounts, splitting and voids need one; a sent item cannot be corrected offline; **nothing reaches the kitchen or bar until the signal is back.**',
        '**Printing:** nothing has been printed on a real printer; a kitchen ticket prints one at a time when a waiter presses **Print ticket**, and is not recorded.',
        '**A known fault:** after switching Waiter, Till and back to Waiter on the bottom bar, the floor can stop refreshing by itself. Pull down to refresh.',
        '**The website offline:** if you close the website while offline and open it again, it shows the sign-in screen, because signing in needs the server. The phone is different: a phone that was signed in opens locked and unlocks with the same PIN.'
      )
    ]),
    section('ny-proved', 'What has been proved and what has not', [
      table(['Part', 'Tested by computer', 'Tried on real equipment'], [
        ['The website and the server', 'Yes: automated checks of the whole flow', 'Not against a real kitchen yet'],
        ['The phone app', 'Yes, against a pretend server and a real test server', 'Not on a real phone'],
        ['Notifications', 'Yes, including a check with Google that the key is accepted', 'Seen on an emulator only; not on a real phone'],
        ['Printing', 'Yes: the bytes sent to the printer are checked', 'Not on a real printer'],
        ['The kitchen part', 'Yes', 'Not in a real kitchen']
      ]),
      careful('When you try ZestPoint in your own kitchen, with your own printer and phone, you are the first. Tell ZestPoint what you find through **Admin**, **Support**.')
    ])
  ]
};

export const GLOSSARY: Chapter = {
  id: 'glossary',
  title: 'Glossary',
  summary: 'The words ZestPoint uses, in plain language.',
  roles: 'all',
  sections: [
    section('gl-a-m', 'A to M', [
      table(['Word', 'What it means'], [
        ['**Approve**', 'A second person says yes to something the first started: a purchase order, a stock adjustment, a stock take, a shift.'],
        ['**Average cost**', 'What an item costs on average. When a delivery comes in at a different price, the average moves. Stock is valued at it.'],
        ['**Bar man method**', 'Orders sent from the table go to a bar man, who makes them and marks them ready. The setting is called **Send orders to preparation stations**.'],
        ['**Batch**', 'Something made once and sold in portions, such as a cake. Also a lot of stock with one expiry date.'],
        ['**Bell**', 'The speech-bubble button at the top, where ZestPoint tells you things.'],
        ['**Bin**', 'A place stock is kept: a shelf, a cage, a cellar. A **high-security** bin needs a second person to confirm goods going in. A station can have a bin of its own.'],
        ['**Branch**', 'A place you trade from.'],
        ['**Bump**', 'Press **Bump: ready** on the kitchen display to say an order is ready.'],
        ['**Float**', 'The cash you start a shift with.'],
        ['**Food cost %**', 'What a dish costs, as a share of its price without tax.'],
        ['**Goods without an order**', 'Goods that arrived with no purchase order, booked in one step.'],
        ['**Hand over**', 'Give a bill to a colleague, so that they can change it and take payment.'],
        ['**Item**', 'Anything you sell or cook with, with its stock card.'],
        ['**Layby**', 'Goods held for a customer who pays them off in parts.'],
        ['**Ledger**', 'The accounts. ZestPoint posts to it by itself from sales, payments, deliveries and stock.'],
        ['**Loyalty point**', 'Earned by a customer on what they buy, and spent as money off once you give a point a value.'],
        ['**Lot**', 'One delivery\'s worth of an item kept by batch, with its own expiry date.']
      ])
    ]),
    section('gl-n-z', 'N to Z', [
      table(['Word', 'What it means'], [
        ['**Par**', 'How much of an item you want ready. On the prep list it is the item\'s **Target stock**.'],
        ['**Plan**', 'What your company\'s subscription includes. Some screens belong to a plan.'],
        ['**Portion**', 'One slice, plate or serving made from a batch.'],
        ['**Post**', 'Send a purchase order to an approver. You cannot edit it afterwards.'],
        ['**Prep list**', 'What to prepare today.'],
        ['**Production**', 'Recording a batch the kitchen made.'],
        ['**Recipe**', 'What one sale of a dish uses from stock.'],
        ['**Right**', 'One thing a role may do, such as taking payment. A role is a set of rights.'],
        ['**Role**', 'A named set of rights given to people, such as Cashier.'],
        ['**Second key**', 'A second person\'s confirmation before goods in a secure bin count as stock.'],
        ['**Server**', 'The computer that runs ZestPoint for everyone. The website and the phone app talk to it, and it decides prices, totals and who may do what.'],
        ['**Shift**', 'One person\'s working period at a till, from a counted float to a counted drawer. Everyone who sells or takes orders starts one when they open the Point of Sale.'],
        ['**Shown on**', 'The screen that works a station\'s tickets: Bar Orders or the Kitchen Display. A station is on one only.'],
        ['**Staff code**', 'A person\'s code for signing in, such as BHL-007, used with their PIN.'],
        ['**Station**', 'A place that makes what you sell: the bar, the kitchen, a grill.'],
        ['**Stock card**', 'The one screen for everything about an item.'],
        ['**Stock take**', 'Counting what is on the shelves and comparing it with what ZestPoint expects.'],
        ['**Store issue**', 'A station asking the store for stock, the store handing it over, and the station confirming.'],
        ['**Tab**', 'A bill opened under a name rather than a table.'],
        ['**Ticket**', 'The part of a sent order that one station makes.'],
        ['**Till number**', 'The number ZestPoint gives a person\'s shift, the lowest free one at the branch.'],
        ['**Usable percent**', 'How much of an ingredient you can use once it is trimmed. Tomato 85 means 15 percent is lost.'],
        ['**Variance**', 'The difference between what was expected and what came out or was counted.'],
        ['**Venue address**', 'The short name from your ZestPoint address, typed to sign in.'],
        ['**Void**', 'Taking a sent item or a whole bill off, with a supervisor\'s authority. It is recorded.'],
        ['**Wallet**', 'A currency your company trades in. One is opened in your default currency.']
      ])
    ])
  ]
};

export const FAQ: Chapter = {
  id: 'faq',
  title: 'Questions people ask',
  summary: 'Short answers to the questions that come up most.',
  roles: 'all',
  sections: [
    section('faq-prices', 'Can I change a price at the till?', [
      p('No. Nobody can. The price is the one on the item\'s stock card. To change it, change the stock card (or **Prices and Menus**, for a branch, or type the new price on **Kitchen**, **Food Cost**, for a dish). A discount is given with the discount button, within the limit, by someone who may.')
    ]),
    section('faq-card', 'A customer paid by card. Did ZestPoint charge it?', [
      p('No. ZestPoint records that the customer paid. The money moves on your own card machine or by bank transfer, and the cashier confirms it. Check it against your card machine or bank statement.')
    ]),
    section('faq-waiter-pay', 'Why can a waiter not take payment?', [
      p('The ready-made Waiter role has no payment right, so money is handled by cashiers. A company can give the right to a waiter on **Staff**, **Roles & permissions**. Also, a bill can be paid only by its owner, a supervisor or a manager, so a waiter hands the bill over to the cashier.')
    ]),
    section('faq-void-pin', 'Why does every void ask for a PIN?', [
      p('So that no one can remove a sent item alone, and every void names who allowed it. It is asked every time, even if the person is a supervisor or the owner and is signed in. Taking off an item that was **not sent yet** is free.')
    ]),
    section('faq-stock-full', 'Why is the stock of the drinks still full after the bar sent them?', [
      p('A bar usually takes stock when it marks the order **ready**, not when it is sent. Until it does, the bottles are still on the shelf in ZestPoint. A kitchen usually takes stock when the bill is sent. It is set on each station.')
    ]),
    section('faq-kitchen-only', 'How do I make a cook hear only the kitchen\'s orders?', [
      p('On **Staff**, **Roles & permissions**, open the cook\'s role. Once it holds the right to act as a bar man, a section **Stations this role works at** appears. Tick **Kitchen**. Everyone with that role then hears only the kitchen\'s orders, on screen and on their phone.')
    ]),
    section('faq-existing-stock', 'How do I tell ZestPoint about stock I already hold?', [
      p('Through an opening quantity in the items file, a delivery of goods without an order, a stock take or an adjustment. Creating an item adds no stock. The chapter **Your first day** has the table.')
    ]),
    section('faq-shared-phone', 'Can two people use one phone?', [
      p('Yes. When the app locks, or when one person signs out, the next person signs in with their own staff code and PIN. If someone types their own details on a locked phone, they are signed in and the first person is signed out. Everything they do is under their own name.')
    ]),
    section('faq-internet', 'What happens when the internet goes down?', [
      p('You can keep selling for cash on the phone: it saves the sales and sends them when the signal returns. Card, transfer, points and gift cards need a connection, and the screen says so. Nothing reaches the kitchen or the bar until the signal is back. See **The phone app**.')
    ]),
    section('faq-who-did', 'Where can I see who did something?', [
      p('On **Staff**, in the **Activity log**, if your role may see it. Every void, discount, refund, price change, stock adjustment and sign-in is there with who, when and why. An item\'s **Activity** tab shows everything that happened to that item.')
    ]),
    section('faq-delete', 'Can I delete a table, a station or a printer?', [
      p('No. They are switched off, never deleted, so that old bills and records keep what they were. A table with a bill still open cannot be switched off, and neither can a station with open tickets.')
    ]),
    section('faq-night', 'How do I stop notifications at night?', [
      p('On the phone, open the bell on Home, then **Notifications**, and turn on **Quiet hours** with a start and an end. Alerts still come through, and the bell keeps everything.')
    ]),
    section('faq-demo', 'What is the "Demo" data?', [
      p('**Load demonstration data** on **Settings** adds sample items, stock and a supplier, all named "Demo", so you can try ZestPoint. **Remove demonstration data** takes them out in one click. Real bills and stock history are not touched.')
    ]),
    section('faq-other-companies', 'Can another company see my data?', [
      p('No. Everything in ZestPoint belongs to one company, and the server only ever returns a company\'s own records to the people signed in to it.')
    ]),
    section('faq-pdf', 'Can I have this manual on paper?', [
      p('Yes. Press **Download the PDF** at the top of the manual. It has the same text and pictures, a cover, contents and page numbers, and prints on A4.'),
      tip('The pictures in the manual show a demonstration company. Your screens show your own names and figures.')
    ])
  ]
};
