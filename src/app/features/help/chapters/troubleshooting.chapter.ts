import { Chapter, careful, list, p, section, steps, table, tip } from '../manual.types';

/**
 * When something looks wrong. The sentences in the tables are the ones ZestPoint itself gives (OrderService, StockIssueService, AuthService, the
 * phone's api_client and printing code), so a person can match what they see to what is here. Reasons follow the findings, never a guess.
 */
export const TROUBLESHOOTING: Chapter = {
  id: 'troubleshooting',
  title: 'When something looks wrong',
  summary: 'The plain reasons ZestPoint gives, what they mean, and what to do next.',
  roles: 'all',
  sections: [
    section('ts-method', 'How to look', [
      steps(
        '**Read the sentence on the screen.** Almost every refusal in ZestPoint says what is wrong and what to do. It is written for the person at the till.',
        '**Check who you are.** Is it the right person, the right branch, the right role? Many refusals are about that.',
        '**Look at what was recorded.** A bill\'s own lines, an item\'s **Activity** tab and the **Activity log** on **Staff** (for those who may see it) say what happened, who did it and when.',
        '**Write down** which step, what you expected, what you saw, the bill number and the time, before you ask for help.'
      )
    ]),
    section('ts-access', 'I cannot see a screen, or a button is greyed out', [
      table(['What you see', 'Why', 'What to do'], [
        ['A screen is missing from the menu', 'Your role does not include it', 'Ask the owner or an administrator to change your role on **Staff**, **Roles & permissions**'],
        ['**Not included in your plan** or **Upgrade required**', 'The company\'s plan does not have that part', 'Ask whoever looks after the subscription'],
        ['A greyed-out button', 'Your role or plan does not allow it', 'The reason is in the tooltip'],
        ['**No access**', 'Your role cannot open that page. For example a store keeper opens the receiving screen, not the order itself.', 'Use the screen your job needs'],
        ['The company is **locked**', 'The subscription is overdue past its grace period; only **Subscription** (and **Support**, for those who may) works', 'Ask the owner to settle the subscription']
      ])
    ]),
    section('ts-pay', 'I cannot take payment', [
      table(['What it says', 'What it means', 'What to do'], [
        ['Send this bill to the bar first. Payment is taken once the bar has marked the order ready.', 'The bill has items for a station that holds payment, and they were never sent', 'Send the bill'],
        ['The bar has not marked this order ready yet. Payment is taken once it has. A supervisor or an administrator can allow payment now.', 'The bar is still making the drinks', 'Wait for the bell, or have a supervisor press **Take payment anyway** and type their code and PIN'],
        ['The kitchen could not make Burger. Change its quantity or take it off the bill before taking payment.', 'A station said it cannot make an item', 'Change or remove that line'],
        ['This bill was opened by Wale. Only they, a supervisor or a manager can change it or take payment on it. They can hand it over to you.', 'A bill belongs to the person who opened it', 'Ask them to hand it over to you'],
        ['This bill was changed by someone else while the payment was being taken. Check the bill and try again.', 'Two people changed the bill at the same moment', 'Open the bill again, check it and pay'],
        ['Card and transfer: the button is off', 'The phone has no signal, or your company has not allowed that way of paying', 'Take cash, or wait for the signal. Managers can tick the ways of paying in **Settings**'],
        ['Staff must start a shift', 'Your company asks cashiers to start a shift before they take payment', 'Start your shift']
      ]),
      p('Pressing **Pay** twice, or again after a lost signal, never takes payment twice. ZestPoint recognises the same attempt and records it once.')
    ]),
    section('ts-bill', 'I cannot change a bill', [
      table(['What it says', 'What it means', 'What to do'], [
        ['This bill was opened by (a name). Only they, a supervisor or a manager can change it or take payment on it.', 'It is someone else\'s bill', 'Ask them to **Move / hand over** (or **Hand over** on the phone), or ask a supervisor'],
        ['This bill was changed by someone else. Reload and try again.', 'Someone changed it while you had it open', 'Reload the bill and look again'],
        ['A line cannot be changed after it is sent', 'It has gone to a station', 'A supervisor voids it. The exception: something the station said it **cannot make** can be changed or removed by the bill\'s owner with no PIN.'],
        ['A cashier was already asked a moment ago.', 'A waiter pressed **Ask for payment** twice in a short time', 'Nothing to do; the cashier has been told']
      ])
    ]),
    section('ts-void', 'A void or a refund is refused', [
      table(['What it says', 'What it means', 'What to do'], [
        ['A supervisor\'s staff code and PIN, or an administrator\'s email and password, is needed to authorise this.', 'The details were left empty', 'A supervisor types their own code and PIN, or an administrator their e-mail and password'],
        ['Those details are not right. Check the staff code and PIN, or the email and password, and try again.', 'A wrong code, a wrong PIN, or a person who is not in this company. ZestPoint never says which part.', 'Try again carefully. Five wrong PINs lock it.'],
        ['This PIN is temporarily locked. Ask a manager to reset it, or try again later.', 'Five wrong PINs on that person: it stays locked for 15 minutes', 'Wait 15 minutes, or have a manager reset the PIN'],
        ['The person is right but may not authorise here', 'Their role does not hold the right to approve (or to refund) at this branch', 'Use someone whose role holds it. By default a Supervisor can approve voids but cannot refund.']
      ]),
      careful('Every refused attempt is recorded, with who tried. The code and PIN are never stored or logged.')
    ]),
    section('ts-station', 'Orders are not reaching the kitchen or the bar', [
      list(
        '**Was the bill sent?** The line must say Sent, not Not sent yet. On a phone with no signal it says "Saved, waiting for the signal", and nothing has reached the station.',
        '**Is the station switched on?** **Admin**, **Set-up**, **Settings** must have **Send orders to preparation stations** ticked, and **Preparation Stations** must list the station as in use.',
        '**Does the item have a station?** The item\'s stock group says **Prepared at**. An item with no station and no group station goes to the default station, or nowhere if there is none. An item that goes nowhere is sold at once and makes no ticket.',
        '**Does the person\'s role work at that station?** On **Staff**, **Roles & permissions**, a role that lists stations only hears about those. A role with none ticked hears about all.',
        '**Is the screen right?** The kitchen display and the bar screen show a chosen station. Check the choice at the top.',
        '**Does the plan have the Kitchen Display?** Without it, the kitchen works its tickets on **Bar Orders**.'
      )
    ]),
    section('ts-stock', 'Stock looks wrong', [
      steps(
        'Open the item\'s stock card and its **Activity** tab. Every movement is there: a delivery, a sale, a batch, a waste, an adjustment, a transfer.',
        'Check whether a delivery is **held**. Goods going into a secure bin do not count until a second person confirms them.',
        'Check whether a station took stock **when sent** or **when ready**. Until a bar marks drinks ready, the bottles are still on the shelf in ZestPoint.',
        'Check the **usable percent** of a recipe. Tomato at 85 takes more off the shelf than the quantity typed.',
        'Count it. Do a stock take and read **Actual Against Expected Use Report**.'
      ),
      p('Negative stock is allowed and shown, so a sale is never blocked because the shelf in ZestPoint says zero. A minus figure means something was sold that ZestPoint did not know had arrived.')
    ]),
    section('ts-store', 'Receiving and store issues are refused', [
      table(['What it says', 'What it means', 'What to do'], [
        ['The Kitchen has no stock place at this branch yet. Set one up on Bin Locations (choose the station on the bin) and ask again.', 'The station has no bin of its own', 'A manager sets one on **Stock**, **Bin Locations**'],
        ['The person who asked for the stock does not issue it: someone else in the store does.', 'You made the request, so you cannot hand it over', 'Ask a colleague in the store'],
        ['The person who issued the stock does not confirm it: someone at the station does.', 'You handed it over, so you cannot confirm it', 'Ask a colleague at the station'],
        ['(An item): the bin holds only a smaller amount. Or: only a smaller amount sits outside the bins. Choose the bin it is in.', 'The store does not hold as much of the item as you tried to hand over, in the bin you chose', 'Choose the bin it is in, or hand over less'],
        ['You raised this order, so someone else must receive it.', 'The person who raised an order cannot receive it (the owner is the exception)', 'Ask the store keeper'],
        ['Another person must give the second key: you received these goods.', 'The goods went to a secure bin, and the person who received them cannot also confirm them', 'A different person who may receive goods opens the delivery and confirms it'],
        ['(An item) is batch tracked: enter a lot code.', 'The item is kept by lot and has no shelf life to work a lot from, and no lot code was typed', 'Type the lot code under **Details**']
      ])
    ]),
    section('ts-cash', 'The drawer does not match', [
      steps(
        'Open **Sell**, **Start / End of Day** and the shift. Read the float, each cash in and out and each refund.',
        'Open **Payments History** for the day, filtered by the cashier and by cash.',
        'Check for a **tip**: tips are held for staff and are not in the drawer\'s expected cash unless taken in cash.',
        'If a count is off by more than your limit, the shift waits for a supervisor to review. They see the same figures.'
      ),
      p('ZestPoint works out what a drawer should hold: the float, plus cash sales, less cash refunds, plus cash in, less cash out. It is always worked out again and frozen when the shift closes.')
    ]),
    section('ts-phone-signal', 'The phone says it has no connection', [
      p('The phone tries the server every time. These sentences say what failed:'),
      table(['What it says', 'What to check'], [
        ['No connection to the server. Check the signal and try again.', 'Mobile data or Wi-Fi, and whether the phone is in a dead spot'],
        ['The phone could not find the ZestPoint server. Check the connection and try again.', 'The phone cannot look up the server\'s address: check the internet connection'],
        ['The server took too long to answer. Check the connection and try again.', 'A weak signal. Try again, or move.'],
        ['This phone does not trust the server\'s security certificate. Check that the phone\'s date and time are right, then try again.', 'The phone\'s date and time. A wrong clock makes a secure connection fail.']
      ]),
      p('Meanwhile you can keep selling for cash. See **The phone app**, **Working without a signal**. If the strip says "1 change was not accepted by the server. Tap to read why.", open **Waiting to be sent**, read the reason and press **Dismiss**.'),
      tip('The first sign-in on a phone always needs a signal.')
    ]),
    section('ts-phone-print', 'The phone will not print', [
      table(['What it says', 'What it means', 'What to do'], [
        ['No printer is set up for receipts and gift card slips at this branch. An admin can add one on the website: Admin > Set-up > Printers.', 'No printer is listed for that job at this branch', 'An admin adds one'],
        ['Could not reach (the printer) at (an address). Check that it is on and on the same network as this phone.', 'A network printer is off, or the phone is on a different network', 'Switch it on; join the shop Wi-Fi'],
        ['Turn Bluetooth on to print to (the printer)', 'Bluetooth is off', 'Turn it on'],
        ['Pair (the printer) in this phone\'s Bluetooth settings first', 'Each phone pairs a Bluetooth printer by hand, once', 'Pair it in the phone\'s Bluetooth settings'],
        ['The handheld is out of paper.', 'A handheld\'s own printer has no paper', 'Load paper'],
        ['That label is too small for a QR code.', 'The label size on the printer is too small', 'An admin sets a larger label on the printer'],
        ['No printer at this branch prints the Kitchen tickets. An admin can choose the stations a kitchen and bar printer prints on the website.', 'No printer lists that station', 'An admin lists the station on **Admin**, **Set-up**, **Printers**'],
        ['These items did not go to a station, so there is no ticket to print.', 'The items have no station', 'Nothing to print; the items were sold without a ticket']
      ]),
      p('A **Test print** on the printers page of the Till tab tells you whether the phone can reach the printer at all.')
    ]),
    section('ts-phone-notify', 'Notifications do not arrive', [
      steps(
        'Open the **bell** on the phone\'s Home. It says why this phone is not receiving, when the phone knows.',
        'If it says notifications are not switched on yet, nothing is wrong with the phone. A manager opens **Admin**, **Set-up**, **Messages**: **Push to phones** shows whether the server is ready and why not.',
        'If it says they are turned off for ZestPoint in the phone\'s settings, turn them on there.',
        'If it says Google did not give the phone its notification address, check the signal and update **Google Play services** in the Play Store, then open the screen again.',
        'Check the switch for that kind on the same screen, and **Quiet hours**.',
        'A phone that was force-stopped gets nothing until the app is opened again.'
      ),
      p('The bell on the website and the list in the app keep every notice, whether or not the phone was told. Messages on the website lists each notification with how it went, and Google\'s own words when one failed.')
    ]),
    section('ts-ask', 'If it is still not clear', [
      p('If you may, open **Admin**, **Support** and ask ZestPoint. Say what you were doing, what you expected and what you saw, with the bill number and the time. You can follow the answer there. There is also a public page, **ZestPoint status**, that says whether each part of ZestPoint is working.')
    ])
  ]
};
