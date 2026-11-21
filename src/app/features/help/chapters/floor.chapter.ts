import { Chapter, careful, list, notYet, p, section, shot, steps, table, tip } from '../manual.types';

/** The cashier's chapter and the waiter's. Wording of the refusals is the server's own (OrderService, PaymentService, AuthService). */
export const CASHIER: Chapter = {
  id: 'cashier',
  title: 'For the cashier',
  summary: 'Starting your shift, taking payment, receipts, refunds and voids, and ending the day with the drawer right.',
  roles: ['cashier'],
  sections: [
    section('cashier-role', 'What a cashier can do', [
      p('The ready-made **Cashier** role takes orders and payments, starts and closes their own shift, sees their own sales, and can put a bill on layby. It cannot give discounts, approve voids or refund. For those, a supervisor or manager types their code and PIN on your till. You can do the same work on the website\'s till or on the phone app.'),
      table(['You need this right', 'To'], [
        ['Open the POS, create and change orders', 'Open bills, add and change items, send'],
        ['Take payments and close tabs', 'Take payment'],
        ['Split, merge and transfer tabs', 'Split a bill, merge bills, move or hand over a bill'],
        ['Start a trading shift; count the till and close it', 'Start and end your shift'],
        ['See your own sales', 'The **My Sales** screen']
      ])
    ]),
    section('cashier-shift', 'Starting your shift', [
      p('If your company asks for it, a box called **Start your shift** appears when you sign in. You cannot use ZestPoint until you start a shift or sign out.'),
      steps(
        'Count the cash in the drawer.',
        'Type it under **Cash in the drawer now (opening float)**.',
        'Tick **I have counted the drawer and this amount is right.** and press **Start shift**.'
      ),
      p('ZestPoint gives you a **till number** by itself, the lowest one at your branch that nobody else is using. You do not choose it. A shift belongs to one person, one branch and one till.'),
      p('You can also start a shift on **Sell**, **Start / End of Day**.'),
      shot('day-management', 'Cash in and cash out are recorded under the shift, each with a reason.', 'The Start and End of Day screen showing a shift with its float, the cash taken, a cash in and a cash out each with a reason, and the cash expected in the drawer.')
    ]),
    section('cashier-pay', 'Taking payment', [
      p('Open **Sell**, **Point of Sale**. Pick the bill from the list on the left, check it, and press **Pay**. The amount is on the button.'),
      steps(
        'Choose how it is paid: **Cash**, **Card** or **Transfer**. For cash, type what the customer handed over and ZestPoint works out the change.',
        'To pay one bill several ways, choose **Split into 2 parts** (or 3, 4 or 5). Each part has its own way of paying. Type the amount of each as the customer pays it, for example 5,500 cash and 3,000 card. The last part takes whatever is left, so the parts always add up. **Confirm** records them all together, and the receipt lists each one.',
        'Add a **tip** first if the customer leaves one. It belongs to whoever served the bill.'
      ),
      careful('**Card and transfer are recorded, not charged.** The customer pays on your own card machine or by bank transfer. You press confirm only once the money has been paid, and you may type a reference such as the slip number. ZestPoint checks nothing with a bank.'),
      p('A customer can also pay part of a bill with **loyalty points** (if your company has given a point a value) or a **gift card**. See the sections below.'),
      shot('pos-till', 'The till: open bills on the left, products in the middle, the bill on the right.', 'The Point of Sale screen with the list of open bills on the left, the product grid in the middle, and the current bill on the right with its lines, total, and Pay button.')
    ]),
    section('cashier-pay-waits', 'When Pay is greyed out', [
      p('The reason is written under the button. These are the ones you will meet:'),
      table(['What it says', 'What it means', 'What to do'], [
        ['Send this bill to the bar first. Payment is taken once the bar has marked the order ready.', 'The bill has items for a station that holds payment, and they were never sent', 'Press **Send** (or ask the waiter to)'],
        ['The bar has not marked this order ready yet. Payment is taken once it has.', 'The bar is still making the drinks', 'Wait, or ask a supervisor to allow payment now'],
        ['The kitchen could not make Burger. Change its quantity or take it off the bill before taking payment.', 'A station said it cannot make an item', 'Change or remove that line, then pay'],
        ['This bill was opened by Wale. Only they, a supervisor or a manager can change it or take payment on it. They can hand it over to you.', 'A bill belongs to the person who opened it', 'Ask the waiter to **Move / hand over** the bill to you']
      ]),
      p('A supervisor or an administrator can allow payment before the bar is ready: press **Take payment anyway (supervisor)** and they type their staff code and PIN. The record names them.')
    ]),
    section('cashier-receipt', 'The receipt', [
      p('After payment, press **Receipt**. It shows the lines, discounts, tax, tip, how it was paid, the change and any points earned. You can print it, or send it to the customer by WhatsApp, e-mail, SMS, your device\'s share options, a QR code the customer scans, or as a picture to download. The customer\'s copy is a web page that opens from its link without signing in.'),
      p('To find a receipt again, open **Sell**, **My Sales**: every bill you served or took payment on, today\'s first. **Receipt** on a row opens it. Printing a receipt again is recorded.')
    ]),
    section('cashier-points-cards', 'Points, gift cards and laybys', [
      list(
        '**Points.** With a customer on the bill, **Pay** offers **Points** when your company has given a point a value. Type how much of the bill to pay with points. The customer types their own four-digit code, or, if they have none yet, a supervisor types their PIN. No points are earned on the part paid with points.',
        '**Gift cards.** The **Gift card** button beside **New** sells a card: type what it is worth and who it is for, and take payment as usual. When the bill is paid in full the card\'s code is shown **once**, to print or share. To spend a card press **Pay**, choose **Gift card**, type or scan its code and press **Check** to see what is left. A card can pay part of a bill, at any branch.',
        '**Layby.** Put a customer on the bill and press **Layby**: the goods are held for them and the bill is fixed. Take the payments later on **Customers**, **Laybys**. Cancelling needs a supervisor\'s code and PIN.'
      ),
      notYet('Points and gift cards need a connection to the server. They cannot be used while you are offline.')
    ]),
    section('cashier-refund-void', 'Refunds and voids', [
      p('You cannot refund or void on your own. That is the rule, to protect you as much as the business.'),
      list(
        '**A void.** Removing an item that was **not yet sent** is free. Voiding a sent item, or a whole bill (**Void**, **Void whole bill**), needs a supervisor to type their staff code and PIN on your till, every time. Say how many to take off if the same item was sent more than once.',
        '**A refund.** Open the bill from **My Sales** and press the refund beside the payment. A manager who may refund types their staff code and PIN. A refund of a card or transfer payment is recorded the same way, and you give the money back yourself.'
      ),
      careful('A wrong PIN counts toward a lock. After five wrong PINs on one person, that PIN is locked for 15 minutes.')
    ]),
    section('cashier-end', 'Ending your shift', [
      steps(
        'Open **Sell**, **Start / End of Day**.',
        'Record cash as it moves during the day: choose **Add cash** or **Remove cash**, type the amount and a reason, and press the add button. You cannot remove more than the drawer should hold.',
        'At the end press **End shift** and count the drawer. Type the count.',
        'ZestPoint works out what it should hold: the float, plus cash sales, less cash refunds, plus cash in, less cash out. If your count matches, you are done. If it is off by more than the company\'s limit, the shift goes to a supervisor to review.'
      ),
      tip('If you leave a shift open for many hours, ZestPoint reminds you, and again every hour after, until you end it.')
    ]),
    section('cashier-wrong', 'When something looks wrong', [
      list(
        '**A payment did not go through twice, or went through twice?** Pressing Pay twice records one payment. A lost signal does the same: ZestPoint recognises the repeat.',
        '**The drawer is off.** Read the shift on **Start / End of Day**: every cash movement and refund is listed. Check **Payments History**.',
        '**Cannot refund or void?** You need a supervisor or manager. That is normal.',
        '**No connection?** Cash payments on the phone are kept and sent later. Card, transfer, points and gift cards need a connection.'
      )
    ])
  ]
};

export const WAITER: Chapter = {
  id: 'waiter',
  title: 'For the waiter',
  summary: 'Opening bills at the table, sending orders to the kitchen and bar, hearing back, and getting the bill paid.',
  roles: ['waiter'],
  sections: [
    section('waiter-role', 'What a waiter can do', [
      p('The ready-made **Waiter / Server** role opens bills, adds and changes items, splits and moves bills, asks for a void, and sees its own sales. It does **not** take payment. A waiter\'s bill is paid after it is handed over to a cashier, or by a supervisor. You can do your work on the website\'s till or on the phone app, which is built for the floor.')
    ]),
    section('waiter-open', 'Opening a bill', [
      steps(
        'Open **Sell**, **Point of Sale** (or the **Waiter** tab on the phone). The phone shows the **floor**: your tables with how many bills each has, and a count of guests\' requests.',
        'Press **New**. Choose the type: a **tab**, a **table**, a **walk-up** or a **takeaway**. Pick the table from the list, or type a name. Press **Start bill**.',
        'On the phone, tap a free table to open a bill there. Two bills on one table are told apart by number.'
      ),
      p('A bill belongs to whoever opened it. Colleagues can look at it, but only its owner, a supervisor or a manager can change it or take payment.')
    ]),
    section('waiter-add', 'Adding items', [
      list(
        'Type part of a name in the search box, or scan a barcode, and tap a product. It goes on the bill with ZestPoint\'s price. Nobody types a price.',
        'Adding the same item again raises the number on its row. Or type the number you want in the box between minus and plus.',
        'An item can have options (a double shot, extra cheese), a note for the kitchen, and a seat. Add these when you pick it.',
        'Before you press **Send**, you can change or remove anything freely.'
      )
    ]),
    section('waiter-send', 'Sending to the kitchen and bar', [
      p('Press **Send**. ZestPoint makes one ticket for each station, with only that station\'s items, in your name. On the phone it says which station got what, for example "Sent to the Kitchen (2 items) and the Bar (1 item)." Each line then shows where it is: Not sent yet, Sent, Being made, Ready to collect, Collected, Cannot be made.'),
      p('The picture in **How it all connects** shows the whole journey of one bill, from the table to the receipt.'),
      careful('After a line is sent, you cannot change or remove it yourself. Removing it is a **void**, and a supervisor types their code and PIN. The one exception is something the station said it **cannot make**: you can change its quantity or take it off without a PIN, as long as its stock has not left.'),
      notYet('If a phone has no signal, an order is saved on the phone and nothing reaches the kitchen or the bar until the signal is back. The phone says "Saved, waiting for the signal" and never says "Sent" while it is waiting.')
    ]),
    section('waiter-ready', 'Hearing that it is ready', [
      p('When a station marks an order ready, you are told: the bell rings with a sound and a prompt on whatever screen you are on, and the phone can also buzz and show a notification. Take it to the table and tap **Collected**.'),
      p('If something cannot be made, you are told at once, with the reason. Ask the guest, then change the line or take it off.')
    ]),
    section('waiter-requests', 'Guests ordering from the table', [
      p('If your company uses table ordering, a guest scans the code on the table and sees your menu. They can order, call a waiter or ask for the bill. You see **Table requests** on the till, or a card on the phone\'s floor.'),
      list(
        '**Accept** puts the items on the table\'s bill as lines **not yet sent**. Change or remove items first if you need to. Then you press **Send**.',
        '**Decline** needs a reason, which the guest sees.',
        '**Done** answers a call for a waiter or the bill.'
      ),
      careful('Nothing reaches the kitchen or the bar until you press **Send**.')
    ]),
    section('waiter-pay', 'Getting the bill paid', [
      steps(
        'On the phone, press **Ask for payment**. The cashiers at your branch are told "Table 4 is ready to pay". Pressing it again within a short time says a cashier was already asked.',
        '**Hand the bill over** to the cashier: **Move / hand over** on the website, **Hand over** on the phone. It leaves your list and the cashier sees it as theirs.',
        'The cashier takes payment.'
      ),
      careful('Asking a cashier does not let them pay your bill. A bill can be paid only by its owner, a supervisor or a manager, so you must hand it over, or ask a supervisor to take payment.'),
      p('If you are told **The bar has not marked this order ready yet**, the bar is still making it. Wait for the bell, or ask a supervisor to allow payment.')
    ]),
    section('waiter-split', 'Splitting a bill', [
      p('Press **Split** on a bill with more than one item. Tick the items to move to a new bill and press the button. The new bill has the same table and owner. You cannot split off every item: at least one must stay. Merging and moving a bill need the same right.')
    ]),
    section('waiter-print', 'Printing a ticket', [
      p('On the phone, a bill that has gone to a station has **Print ticket**. It lists the bill\'s tickets, newest first, and each has **Print this ticket**. The ticket goes to the printer that lists that station. Nothing prints by itself.'),
      notYet('If no printer lists the station, the phone says so and prints nothing. An admin chooses the stations on **Admin**, **Set-up**, **Printers**.')
    ]),
    section('waiter-wrong', 'When something looks wrong', [
      list(
        '**It will not let me change a line.** It was sent. Ask a supervisor to void it.',
        '**It will not let me change a bill.** It belongs to someone else. Ask them to hand it over.',
        '**Nothing came back from the kitchen.** Check the line\'s state. If the phone says it is saved and waiting for the signal, it has not reached the kitchen yet.',
        '**This bill was changed by someone else. Reload and try again.** Two people changed the bill at once. Reload it and look again.'
      )
    ])
  ]
};
