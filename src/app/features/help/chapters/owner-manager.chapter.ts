import { Chapter, careful, list, notYet, p, section, shot, steps, table, tip } from '../manual.types';

/** The owner's chapter and the manager's. The default rights come from ZestPoint.Data/Seed/SystemRoles.cs; every company can change its roles. */
export const OWNER: Chapter = {
  id: 'owner',
  title: 'For the owner',
  summary: 'Your day in a few minutes, what only you can do, where the money is, and what to do when something looks wrong.',
  roles: ['owner'],
  sections: [
    section('owner-role', 'What the owner can do', [
      p('The owner holds every right in ZestPoint, including any added later. The **Company Administrator** role is nearly the same: it cannot manage the owner or the subscription. Everyone else holds only the rights their role gives them, and you decide those on **Admin**, **Staff**, **Roles & permissions**.'),
      p('Because you can do everything, ZestPoint records everything you do the same way it records everyone else: under your name, with the time and the reason.')
    ]),
    section('owner-morning', 'Your morning in five minutes', [
      steps(
        '**The bell.** Open the speech-bubble button at the top. It lists what ZestPoint has to tell you, newest first. Open a notice to go to the screen it is about, or mark them all read.',
        '**Yesterday.** Open **Sell**, **Reports**, **Daily Summary**. It was built that morning and is kept as it was: sales against the same day last week, money taken, shifts, voids and discounts, stock and what sold best. Choose a branch to see just that one. It can also be sent to you each morning (see **Daily Summary Set-up**).',
        '**All branches.** Open **Head Office**, **Reports**, **Head Office Overview**: every branch side by side for the period you choose, with each branch\'s share and how it moved on the period before.',
        '**Anything unusual.** Open **Head Office**, **Reports**, **Loss Prevention** and look at the alerts.',
        '**What waits for you.** Stock adjustments, stock takes, purchase orders, shifts and market runs wait for someone to approve them. Your bell and, if you use the phone app, the **Owner** tab on it tell you.'
      ),
      shot('daily-summary', 'The daily summary: yesterday, built once and kept.', 'The Daily Summary screen, with a list of days on the left and the figures of one day on the right: sales, money taken by cash, card and transfer, shifts, voids and discounts, stock and best sellers.')
    ]),
    section('owner-screens', 'The screens an owner uses', [
      table(['Screen', 'What it tells you or lets you do', 'Where'], [
        ['**Dashboard**', 'Today at a glance, and shortcuts to what you use most', 'The top of the menu'],
        ['**Daily Summary**', 'How each day went', '**Sell**, **Reports**'],
        ['**Head Office Overview** and **Branch Comparison**', 'Branches side by side, and over time as a chart', '**Head Office**, **Reports**'],
        ['**Loss Prevention**', 'Unusual voids, discounts, refunds and cash, found for you', '**Head Office**, **Reports**'],
        ['**Payments History**, **Void History Report**, **Tips Report**', 'Every payment, every void with who asked and who allowed it, every tip', '**Sell**, **Reports**'],
        ['**Stock Value Report**, **Stock Expiry Report**', 'What your stock is worth, and what has expired or soon will', '**Stock**, **Reports**'],
        ['**Aged Suppliers Report**', 'What you owe each supplier, by how old the debt is', '**Purchasing**, **Reports**'],
        ['**Profit and Loss**, **Trial Balance**', 'The books', '**Finance**, **Reports**'],
        ['**Staff**', 'People, roles and the activity log', '**Admin**'],
        ['**Settings**, **Branches**, **Branding**, **Messages**', 'How you trade', '**Admin**, **Set-up**'],
        ['**Subscription**, **Support**', 'Your plan and invoices; ask ZestPoint for help', '**Admin**']
      ])
    ]),
    section('owner-money', 'Where the money is', [
      p('Some money in your business is not yours yet, or not in the till. ZestPoint keeps each of these apart so you can see them.'),
      table(['Money', 'Whose it is until', 'Where to see it'], [
        ['**Tips**', 'Held by the business until paid to the person who served the bill, or given away', '**Sell**, **Tips**'],
        ['**Gift cards**', 'Owed to whoever holds the card until it is spent. A card sold is not a sale; spending it is.', '**Customers**, **Reports**, **Gift Cards**'],
        ['**Loyalty points**', 'Owed to customers as money off, once you give a point a value', '**Customers**, **Reports**, **Loyalty Points Report**'],
        ['**Supplier debts**', 'Owed to suppliers until you record a payment', '**Purchasing**, **Supplier Payments**'],
        ['**Laybys**', 'Held for the customer until the last payment makes it a sale', '**Customers**, **Laybys**']
      ]),
      careful('Card and bank transfer payments are **recorded, not charged**. ZestPoint does not talk to a bank or a card machine. Your cashier confirms that the customer paid, and you check the money against your own card machine and bank statement.')
    ]),
    section('owner-approvals', 'What waits for your approval', [
      p('For the risky things, one person starts and a second person finishes. You, or a manager, are the second person. ZestPoint never lets you approve something you did yourself, except where it says the owner may.'),
      list(
        '**A purchase order** that someone posted: open it on **Purchasing**, **Purchase Orders** and press **Approve** or **Send back** with a reason.',
        '**A stock adjustment** above the limit you set in Settings, and **a stock take** sent for review: on **Stock**, **Adjustments** and **Stock Take Report**.',
        '**A shift** that ended with a cash difference over your limit: on **Sell**, **Start / End of Day**.',
        '**A market run**: on **Purchasing**, **Market Runs**, **Confirm** it or query it with a question the buyer must answer.',
        '**A loss-prevention alert**: mark it reviewed. You cannot review an alert about yourself.'
      ),
      tip('On the phone app, the **Owner** tab has **Waiting for your approval**, with a count, for stock adjustments, stock takes and purchase orders.')
    ]),
    section('owner-loss', 'Loss prevention: pointers, never proof', [
      p('Each hour ZestPoint looks over what is already recorded (voids, discounts, refunds, cash, receipts printed again, stock, tips, prices and open bills) and raises an alert for anything unusual. An alert is a pointer for you to look at. It is never proof that someone did wrong.'),
      steps(
        'Open **Loss Prevention**. The overview ranks people and branches by what was found, set against how much they sold, and says in words what each score is made of.',
        'Open an **alert**, look at the evidence and mark it reviewed: **no concern**, or **followed up** with a note of what you did.',
        'Open **Rules** to change the number a rule looks for, its weight, or switch it off if it does not suit how you trade.'
      ),
      careful('You do not see yourself here, and nobody can review an alert about themselves. People who are measured cannot open these screens.'),
      notYet('Loss prevention is part of some plans only. If you do not see it, it is not in your plan.')
    ]),
    section('owner-people', 'People, phones and the activity log', [
      list(
        '**Roles.** Change what a role may do on **Staff**, **Roles & permissions**. It applies on the person\'s very next request.',
        '**Shifts.** The till asks anyone who sells or takes orders to start a shift, so a role that can take orders also needs the three shift rights: **See shifts and the end-of-day summary**, **Start a trading shift with an opening float** and **Count the till and close a shift**. The ready-made Waiter role has them. A role made by your company may not: the person is told they need the right and cannot open the till until you give it.',
        '**Phones.** Open a person on **Staff** and their **Sessions** list every phone and browser they are signed in on, with the phone\'s name. You can sign one out, or press **Sign out everywhere**. Deactivating someone or changing their PIN signs out every phone they have.',
        '**The activity log** (**Staff**, **Activity log**) lists every void, discount, adjustment, price change and sign-in, with who and when. Each time a phone signs in, ZestPoint writes down the phone\'s make and model, its app version, and how far its clock is from the server\'s. It never records a serial number, a phone number, contacts or a location.'
      )
    ]),
    section('owner-branches', 'Several branches', [
      p('**Head Office** brings your branches together. **Prices and Menus** (under **Head Office**, **Set-up**) shows what each item costs at each branch and why: the branch\'s own price, a price list it uses, or the company price. You can change prices now or from a date, and take items off one branch\'s till. A price below an item\'s minimum price is refused.'),
      p('By default only head office sets prices. In **Settings** you can tick **Branch managers may set their own branch\'s prices and what it sells**.'),
      p('**Adding a branch.** Open **Admin**, **Set-up**, **Branches** and press **Add branch**. A new branch is not visible to your staff until you give it to them: the people who worked at "every branch" are switched to the branches they had (you, the owner, still see everything), and a window asks **Who works at** the new branch. Add people who already work for you, or create new people for it. A person sees only the branches they work at: the branch menu, the reports and the till show only those.'),
      careful('Someone who works at only some branches cannot give a branch they do not work at, nor "All branches". That keeps a new branch from reaching people the person who made it cannot see.')
    ]),
    section('owner-phone', 'On your phone', [
      p('Sign in to the phone app with your e-mail and password. The **Owner** tab shows the daily summary, the branches side by side, loss-prevention alerts and what waits for your approval. All of it needs a signal. The chapter **The phone app** says more.')
    ]),
    section('owner-wrong', 'When something looks wrong', [
      list(
        'A figure looks wrong: compare it with the same figure on another report for the same period. They read the same records and should agree. Then open the item\'s **Activity** tab or the **Activity log**.',
        'Cash is short: open **Start / End of Day**, find the shift and read its movements, refunds and difference. Then **Payments History** for the day.',
        'Stock does not match the shelf: count it with a stock take, and read **Actual Against Expected Use Report** under **Kitchen**, **Reports**.',
        'Something on a screen is refused: read the sentence it gives. The chapter **When something looks wrong** explains the common ones.'
      )
    ])
  ]
};

export const MANAGER: Chapter = {
  id: 'manager',
  title: 'For the manager',
  summary: 'Running a branch day to day: opening, approving, reviewing shifts, stock and the kitchen, and closing.',
  roles: ['manager'],
  sections: [
    section('manager-role', 'What a manager can do', [
      p('A **General Manager** oversees operations across the company; a **Branch Manager** runs one branch. Both approve voids, review shifts, see reports and look after stock and staff. A Branch Manager sets prices for their own branch only, and only when the owner allows it. A **Supervisor** runs the floor: approves voids and reviews shifts. These are the ready-made roles; your owner may have changed them.'),
      table(['Role', 'In the words ZestPoint gives it'], [
        ['**Supervisor**', 'Runs the floor: approves voids, reviews shifts and sees the daily sales report.'],
        ['**General Manager**', 'Oversees operations, approves overrides, sees reports and inventory.'],
        ['**Branch Manager**', 'Runs one branch: approves voids, manages stock and staff for that branch.']
      ])
    ]),
    section('manager-open', 'Opening the branch', [
      steps(
        'Check the people: is everyone who should work today on **Staff**, with the right role and branch?',
        'Check the stations and tables are right on **Admin**, **Set-up**.',
        'Look at the bell for anything left from last night: a shift waiting for review, stock that is low, stock about to expire.',
        'Everyone who sells or takes orders starts a shift with a counted float: ZestPoint asks for it the moment they open **Sell**, **Point of Sale**, not when they sign in. That includes you, if you open the till.'
      )
    ]),
    section('manager-approve', 'Approving: you are the second person', [
      p('Many things in ZestPoint need a second person. You are often that person.'),
      table(['What', 'What you do', 'Where'], [
        ['**A void** of a sent item or a whole bill', 'Type your staff code and PIN (or an administrator\'s e-mail and password) on the till where the void is made. This is asked **every time**, even if you are signed in.', 'At the till'],
        ['**A refund**', 'Only a role that holds the refund right can approve one: type your staff code and PIN. By default that is the General Manager, the Company Administrator and the owner, not the Supervisor.', 'At the till'],
        ['**A discount over the limit**', 'Only someone who may approve can give it. Cashiers, by default, cannot give discounts at all.', 'At the till'],
        ['**Paying before the bar is ready**', 'Type your code and PIN to let a bill be paid while the bar still holds it. The record names you.', 'At the till'],
        ['**A layby cancelled**', 'Needs a supervisor\'s staff code and PIN; the customer gets back what was paid less the fee you set.', '**Customers**, **Laybys**'],
        ['**A shift with a cash difference**', 'Review it and sign it off. You cannot review a shift you counted yourself (the owner may).', '**Sell**, **Start / End of Day**'],
        ['**A purchase order**', 'Approve or send back with a reason.', '**Purchasing**, **Purchase Orders**'],
        ['**A stock adjustment or stock take**', 'Approve or reject.', '**Stock**'],
        ['**A market run**', 'Confirm it, or query it with a question. You must not be the buyer.', '**Purchasing**, **Market Runs**'],
        ['**A tip paid out**', 'Record what is paid to a person or given away. It cannot be more than what is held.', '**Sell**, **Tips**']
      ]),
      careful('A wrong PIN counts toward a lock. Five wrong PINs on one person lock them for 15 minutes. ZestPoint\'s sentence for a wrong code never says which part was wrong.')
    ]),
    section('manager-shifts', 'Reviewing a shift', [
      p('Everyone who sells or takes orders starts a shift with a float when they open the till. A cashier then takes payments, puts cash in and takes cash out, and at the end counts the drawer. ZestPoint works out what the drawer should hold: the float, plus cash sales, less cash refunds, plus cash in, less cash out. If the count differs by more than the limit in Settings, the shift waits for you.'),
      steps(
        'Open **Sell**, **Start / End of Day**.',
        'Find the shift that is **pending review** and open it. It shows the movements, the refunds and the difference.',
        'Review it. If you reject it, the shift goes back to being open.'
      ),
      shot('day-management', 'Start / End of Day: a shift, its float and its cash movements.', 'The Start and End of Day screen showing an open shift with its float, cash in and out, expected cash in the drawer, and a button to end the shift.')
    ]),
    section('manager-stock', 'Stock and purchasing', [
      p('Managers usually look after stock too. The chapters **For the store keeper** and **A day in the kitchen** show the detail. In short:'),
      list(
        'Raise purchase orders from **Stock**, **Reports**, **Stock Re-Order Report**: it suggests what to order, and you can turn the list into purchase orders.',
        'Count with a **stock take**, and write off what has spoiled or expired as an **adjustment** with a reason.',
        'Watch **Stock Expiry Report**. Expired stock stays on the count until a person writes it off.'
      ),
      notYet('ZestPoint warns about stock that is expiring but never writes it off by itself. Someone must record the waste.')
    ]),
    section('manager-kitchen', 'The kitchen', [
      p('Make sure each station\'s staff are on a role that works at that station (**Staff**, **Roles & permissions**). Look at **Kitchen**, **Reports**, **Prep List** in the morning, **Production Variance Report** and **Kitchen Waste Report** at the end of the week, and **Food Cost** whenever prices change.')
    ]),
    section('manager-close', 'Closing the day', [
      steps(
        'Make sure every open bill is paid, handed over, or voided with a supervisor\'s authority.',
        'Make sure each cashier has ended their shift and counted the drawer.',
        'Review any shift that is waiting.',
        'Check **Stock**, **Reports**, **Out of Stock Report** and the low-stock notices, and plan tomorrow\'s buying.'
      ),
      tip('The daily summary for today will be built tomorrow morning and sent to whoever is on its list.')
    ]),
    section('manager-wrong', 'When something looks wrong', [
      list(
        'A bill will not take payment: the screen says why (see **When something looks wrong**). Often it is waiting for the bar, or the bill belongs to another waiter.',
        'Someone cannot start a shift: they may already have one running on another device or at another branch (a person can have only one), or their role may not allow it, and the till then says "You need the right to start a shift before you can sell".',
        'Stock does not match: do a stock take, then read the **Actual Against Expected Use Report**.',
        'A person cannot see a screen: check their role on **Staff**, **Roles & permissions**.'
      )
    ])
  ]
};
