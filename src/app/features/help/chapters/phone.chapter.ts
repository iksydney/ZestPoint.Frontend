import { Chapter, careful, list, notYet, p, section, steps, table, tip } from '../manual.types';

/** The phone app, in words (no pictures: the screenshots are of the website only). Facts: ZestPointMobile/architecture.md and README.md. */
export const PHONE: Chapter = {
  id: 'phone',
  title: 'The phone app',
  summary: 'Signing in, what is on each tab, selling without a signal, printing, notifications and the Station tab.',
  roles: 'all',
  sections: [
    section('phone-what', 'What the phone app is', [
      p('The ZestPoint phone app is for waiters, tills, stock and owners. It talks to the same ZestPoint as the website, with the same rights: what you may do on the website you may do on the phone, and what you may not, you may not. The server stays the only judge of prices, totals, rights and which company you are in.'),
      notYet('The app is built for Android and iPhone from one project, but so far only **Android** has been prepared. The iPhone needs a developer account and a computer that ZestPoint\'s makers do not have set up yet, so there is no iPhone app and no iPhone notifications. The app has been tested by computer and on an emulator, and **has not yet been tried on a real phone with a real printer** (see **What ZestPoint does not do yet**).')
    ]),
    section('phone-signin', 'Signing in', [
      steps(
        'Type your **Venue address**: the first part of your ZestPoint address.',
        'Choose **Staff PIN** and type your **Staff code** (it looks like BHL-007) and your **PIN**. Or choose **Owner / admin** and type your **E-mail** and **Password**.',
        'The first time on a phone, a box says **What is recorded when you sign in**. Read it and tick **I understand**.',
        'Press **Sign in**.'
      ),
      list(
        'There is no box to name the phone. ZestPoint names it from your name and the phone\'s make and model, for example "Wale Waiter\'s Google Pixel 8". The owner sees this name on **Staff** when deciding which phone to sign out.',
        'The first sign-in on a phone needs a signal, because ZestPoint has to check your code and PIN.',
        'A phone stays signed in for **30 days since it was last used**. Using it starts the 30 days again.',
        'After **two minutes untouched** the app locks. You type your PIN (or password) again and carry on. Locking does not sign you out. If someone else types their own details, they are signed in and you are signed out.',
        'Signing out, or the owner signing your phone out, ends it at once.'
      ),
      careful('What is recorded when you sign in: the phone\'s make and model, its Android version, the app\'s version, its time zone, how far its clock is from the server\'s, and how it is connected. Never a serial number, your phone number, your contacts or where you are. The owner, managers and supervisors can see this in the activity log.')
    ]),
    section('phone-tabs', 'The bottom bar', [
      p('The bar at the bottom shows only the parts your role may use: **Home** first, **More** last. A waiter has three tabs; the owner has seven.'),
      table(['Tab', 'For', 'Needs'], [
        ['**Home**', 'The company\'s mark, who you are, the notifications bell, the branch, and a card for each part you may use', 'Anyone'],
        ['**Waiter**', 'The floor, bills, the menu, and guests\' requests', 'The right to open the POS or create orders'],
        ['**Till**', 'Your shift, taking payment, receipts, customers, refunds, printing and labels', 'The right to take payment'],
        ['**Station**', 'A station\'s tickets: take, mark ready, say what cannot be made', 'The right to work station orders'],
        ['**Stock**', 'Look up an item, adjust stock, count a stock take, receive a delivery', 'A stock right, and stock in your plan'],
        ['**Owner**', 'The daily summary, branches side by side, loss-prevention alerts, what waits for approval', 'The matching right, and the module in your plan'],
        ['**More**', 'Lock the phone and sign out', 'Anyone']
      ]),
      p('A bill, a payment, a receipt or a stock take takes the whole screen with a back arrow, so nobody is one tap from walking out of something half done.'),
      p('The app uses your company\'s colours and logo, in light or dark as your phone\'s own setting says.')
    ]),
    section('phone-waiter', 'Waiter: floor, bill and menu', [
      list(
        '**The floor** shows what needs you now (a ticket ready to collect, or something a station cannot make, with its reason), your bills, and the branch\'s tables grouped by area with how many bills each has. It updates by itself, and a small bolt in the title shows it is live. If the connection drops it looks again every few seconds and says so.',
        '**Tapping a free table** opens a bill there. One bill opens it; several ask which.',
        '**The bill** shows each line with where it is: Not sent yet, Sent, Being made, Ready to collect, Collected, Cannot be made. You can **Add items**, **Send**, **Hand over** to a colleague, **Ask for payment**, **Split** the bill, **Void whole bill** (a supervisor types their PIN) and, once sent, **Print ticket**.',
        '**The menu** has search, categories and a sheet for how many, the options, a note, and the serial number for an item sold as one numbered unit.',
        '**Guests\' requests** show what guests sent from a table\'s code. **Accept** puts the items on the table\'s bill as lines you then send. **Decline** needs a reason the guest sees.'
      ),
      p('After you press **Send**, the bill says which station got what, for example "Sent to the Kitchen (2 items) and the Bar (1 item)." After a bill is paid in full, going back skips the old open bill and takes you to where you were.')
    ]),
    section('phone-till', 'Till: shift, payment and receipt', [
      list(
        '**Shift.** Start with a counted float, record cash in and cash out with a reason, and end the shift by counting the drawer. A shift started with no signal says "Shift (no till number yet)" until ZestPoint gives it one.',
        '**Taking payment.** Cash, card (recorded, not charged), transfer, loyalty points and gift cards, one way or split into parts. Cash gives the change. The pay screen shows what is still to pay.',
        '**A supervisor\'s PIN.** Where a supervisor is needed (a void, a refund, allowing payment early, a customer\'s points when they have no code), a sheet asks for their staff code and PIN.',
        '**Customers.** Put a customer on a bill, spend their points, hand the phone to the customer to type their own four-digit code, or sell and scan gift cards. A gift card\'s code is shown once.',
        '**Receipts.** Print, or share by WhatsApp, e-mail, SMS, the phone\'s share options or a QR code. Every press on Print records a reprint on the server first, so a copy says "Reprint 2".',
        '**Sales and refunds.** Your own paid bills, newest first, a page at a time. A manager lists every gift card and issues a lost one again.'
      ),
      tip('Receipts and slips print with plain letters only: a letter with an accent loses its accent and the Naira sign prints as N. This is so that every printer, whatever its code page, prints readable text.')
    ]),
    section('phone-offline', 'Working without a signal', [
      p('ZestPoint is built so that a sale is never lost because the network is down. The phone tries the server every time. Only when that really fails does it use what it kept.'),
      table(['Works without a signal', 'Needs a signal, and says so'], [
        ['Opening a bill', 'Card and transfer payments'],
        ['Adding items from the menu the phone last saw', 'Loyalty points and gift cards'],
        ['Changing or removing items **not yet sent**', 'Discounts'],
        ['Sending (it is saved on the phone)', 'Splitting a bill'],
        ['A tip', 'Customers, handing a bill over, asking a cashier'],
        ['Taking **cash**, a part or the rest, with the change', 'Voids and refunds (a supervisor\'s PIN is checked by the server)'],
        ['The shift: start, cash in and out, end', 'Receipts and the list of paid bills'],
        ['Counting a stock take (once it has been opened with a signal)', 'Anything that reads what other people did']
      ]),
      steps(
        'A strip appears above every screen: "No signal. You can keep selling: cash is saved on this phone, 3 changes wait to be sent."',
        'A bill opened offline is called **New bill** until ZestPoint numbers it. A cash payment says "Cash taken and saved on this phone" and offers no receipt until the bill has reached the server.',
        'When the signal returns, the changes are sent in the order they were made. The strip says "Sending 3 changes..." and then goes away.',
        'If ZestPoint cannot accept a change, the strip says "1 change was not accepted by the server. Tap to read why." Open **Waiting to be sent**, read the reason and press **Dismiss**. The bill goes back to what the server has.'
      ),
      careful('**Nothing reaches the kitchen or the bar until the phone has a signal.** An item sent offline says "Saved, waiting for the signal", never "Sent". Tell the kitchen another way.'),
      p('A phone that was signed in while it had a signal opens **locked** when it has none. Type your PIN to unlock. Five wrong PINs in a row make it forget the PIN, and you need a signal to sign in again. The offline database on the phone is encrypted.')
    ]),
    section('phone-print', 'Printing', [
      p('Printers are set up **on the website**, once for the company, under **Admin**, **Set-up**, **Printers**. Every phone at the branch then finds them. The phone does the printing: the server never connects to a printer.'),
      table(['How the printer is reached', 'What to do'], [
        ['**On the shop network**', 'Nothing on the phone, as long as the phone is on the same network. The phone connects to the printer\'s address, on port 9100 unless another is set, and gives up after six seconds.'],
        ['**By Bluetooth**', 'Pair the printer in the phone\'s own Bluetooth settings, **once per phone**. The app finds it by the name the admin gave it. Android asks to allow **Nearby devices** the first time.'],
        ['**A handheld\'s own printer**', 'For example a Sunmi handheld. It prints on itself.']
      ]),
      list(
        'It prints the customer\'s **receipt**, a **gift card slip**, the **shift summary**, **price and barcode labels** and **table QR stickers**, and a bill\'s **kitchen and bar tickets**.',
        'The phone uses the **first printer, in the order set on the website, that is for what it is printing**. Kitchen and bar tickets go to the printer that lists that ticket\'s station.',
        '**Test print** on the printers page of the Till tab prints a test page, to check the paper and the connection. Printers are added and changed on the website, not on the phone.',
        'Labels need the right to print labels. Table stickers need the right to set up tables, because a sticker lets anyone order at that table.'
      ),
      notYet('Nothing has been printed on a real printer yet. Kitchen and bar tickets print only when a waiter presses **Print ticket** on a bill, one at a time, newest first, and what is printed is not recorded. The width of the large letters on a 58 mm roll has not been seen.')
    ]),
    section('phone-notify', 'Notifications', [
      p('A notification arrives when something needs you: an order is ready, a bill is ready to pay, a guest is asking, something waits for your approval, the daily summary is ready, an alert, or a new order for your station. See **How it all connects** for who is told what.'),
      list(
        'On a locked screen a notification shows **what and where**, never a name or an amount.',
        'Tapping it opens the screen it is about. If the app is locked, it waits for your PIN and then opens it.',
        'While the app is open, a notification shows as a bar at the bottom with **Open**, and the phone plays its own alert sound.',
        'Press the **bell** on Home to open **Notifications**. It has a switch for each kind your role could ever be sent, kept on the server so it follows you to a new phone, and **Quiet hours** (a start and an end): notifications wait until the window ends, and alerts always come through. In Android\'s own settings you can choose the sound of each kind, or silence it.',
        'A manager sees **Send a test to this phone** to check it works.',
        'Several notifications with the same words replace each other in the tray, so three asks from one table are one entry.'
      ),
      table(['If the Notifications screen says', 'It means'], [
        ['Notifications are not switched on yet, so none are sent to this phone. Nothing is wrong with your phone or its settings.', 'ZestPoint has not been given its key to send notifications. A manager can see the reason on the website, under **Messages**.'],
        ['Notifications are turned off for ZestPoint in this phone\'s settings', 'You said no when asked. Turn them on in the phone\'s settings.'],
        ['Google did not give this phone its notification address. Check that the phone has a signal and that Google Play services is up to date.', 'The phone needs Google Play services 26.12 or newer. Update it in the Play Store, then open this screen again.']
      ]),
      notYet('Notifications are for Android only so far. A phone that was **force-stopped** gets none until the app is opened again. Real notifications have been seen on an emulator but not yet on a real phone.')
    ]),
    section('phone-station', 'The Station tab', [
      p('For a cook or a bar hand. The tab\'s title is the station\'s name, for example "Kitchen orders". Tickets are in three groups: **Being made by you**, **Waiting** and **Being made by someone else**. Each card shows the table (or tab name, or bill number), who it is from, how long ago, the bill\'s note and each item with its options and notes.'),
      list(
        '**Take order** takes a ticket. Only one person can; the first to press wins and the other is told who has it.',
        '**Ready** marks it ready, and the waiter is told.',
        '**Can\'t make** asks which items, how many and why.',
        'A new ticket sounds the alert and buzzes. It needs a signal. There is nothing offline here, because the server decides who took a ticket first.'
      ),
      notYet('The phone cannot tick off single items or call back a ticket marked ready, and does not remind a station of a ticket that has waited past its red minutes. The Kitchen Display on the website does the first two.')
    ]),
    section('phone-stock', 'The Stock tab', [
      list(
        '**Look up an item** by name, part number or barcode (or scan it): what ZestPoint expects the branch to hold, the levels and a warning when it is low, and, if you may see them, the price, cost and the bins it is in.',
        '**Adjust stock:** take away, add, or set to a counted quantity, with a reason and a note. Above the company\'s limit it is held for someone else to approve.',
        '**Stock takes:** start one, then count one item at a time with a big number pad, scan to jump to an item, and **Save and next**. Counting works without a signal. Submitting needs one.',
        '**Receiving:** the queue of what waits at your branch, then each line: how many arrived, the bin, the lot, the expiry date, what was turned away and a photo. A secure bin needs a second person.'
      ),
      notYet('On the phone you cannot receive goods that have no order, see a photo once taken, or approve and reconcile a stock take. Use the website for those.')
    ]),
    section('phone-owner', 'The Owner tab', [
      p('**Daily summary** (the finished days, and a day in full, with **Send to me**), **Branches side by side** (today, yesterday, the last 7 or 30 days), **Loss-prevention alerts** (open ones first; review one with no concern, or followed up with a note) and **Waiting for your approval** (stock adjustments, stock takes and purchase orders, each approved or sent back with a note). Everything here is read and decided online, and nothing is saved for later. With no signal a screen says so in words and never says that nothing is waiting.')
    ]),
    section('phone-wrong', 'Known things on the phone', [
      notYet('After switching **Waiter**, **Till** and back to **Waiter** on the bottom bar, the waiter\'s floor can stop refreshing by itself. Pull down to refresh, or open the floor again. This is a known fault.'),
      notYet('On very small phones some screens have not been looked at by eye. The app has been checked on the sizes of small phones by test, with no part of a screen cut off, but not on a real small phone.')
    ])
  ]
};
