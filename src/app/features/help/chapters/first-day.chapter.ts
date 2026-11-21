import { Chapter, careful, list, notYet, p, section, shot, steps, table, tip } from '../manual.types';

/**
 * The set-up checklist, in the order the steps depend on each other. Labels are the ones on the screens (nav-layout.ts, the components under
 * features/). Opening stock follows architecture.md: an item adds no stock; stock comes from receiving, an adjustment, a stock take or an import file.
 */
export const FIRST_DAY: Chapter = {
  id: 'first-day',
  title: 'Your first day: the set-up checklist',
  summary: 'Everything to set up before you trade, in the order to do it, with where to click.',
  roles: ['owner', 'manager'],
  sections: [
    section('fd-before', 'Before you start', [
      p('Setting up takes a few hours, not a few minutes, and it can be done over several days. Every step saves by itself, so you can stop and come back. Nearly everything can be changed later.'),
      p('Have these ready: your business details, your logo if you have one, the list of tables, the list of what you sell with prices, what each dish is made from, the names of your staff, and what you hold in stock.'),
      p('The order below matters. Each step uses the one before it: an item needs a group, a group needs a station, a recipe needs ingredients, and a person needs a role.')
    ]),
    section('fd-checklist', 'The checklist at a glance', [
      table(['#', 'Step', 'Where to click', 'You are done when'], [
        ['1', 'Register your business', '**Register** on the website', 'You are signed in and the set-up wizard opens'],
        ['2', 'Choose your brand', 'The **Brand** step of the wizard', 'Your name, logo and colours show'],
        ['3', 'Settings: tax, payments, shifts', '**Admin**, **Set-up**, **Settings**', 'Tax and the payment methods are right'],
        ['4', 'Branches', '**Admin**, **Set-up**, **Branches**', 'Every place you trade from is listed'],
        ['5', 'Stations and printers', '**Admin**, **Set-up**, **Preparation Stations** and **Printers**', 'The bar and the kitchen exist'],
        ['6', 'Tables', '**Admin**, **Set-up**, **Tables**', 'Each branch has its tables'],
        ['7', 'Stock groups', '**Stock**, **Stock Groups**', 'Each group goes to a station'],
        ['8', 'Items', '**Stock**, **Items**', 'What you sell and what you cook with is listed'],
        ['9', 'Recipes', 'An item\'s stock card, **Recipe and options** tab', 'Each dish says what it uses'],
        ['10', 'Bins', '**Stock**, **Bin Locations**', 'Shelves and cellars exist; the kitchen has its own place'],
        ['11', 'Staff and roles', '**Admin**, **Staff**', 'Everyone can sign in and sees the right screens'],
        ['12', 'Suppliers', '**Purchasing**, **Suppliers**', 'The people you buy from are listed'],
        ['13', 'Opening stock', 'An import file, a delivery or an adjustment', 'The shelves in ZestPoint match the shelves in the building'],
        ['14', 'Try it', 'The till, with a test bill', 'A bill goes to the kitchen, is paid and receipted']
      ])
    ]),
    section('fd-register', '1. Register your business', [
      p('Registration has three steps, and it takes about two minutes. You can change everything later.'),
      steps(
        '**Business type.** Search for your type: supermarket, bar, hotel and so on. You may also tick other things your business does. Your main type sets the starting look and the words used. If it is a bar, a lounge, a nightclub or a beach club, ZestPoint asks **Will you use the bar man method?** This means orders go to a bar man on their own screen. Answer yes if drinks are made at a bar and brought to the table. You can change it later in Settings.',
        '**Company.** Your company or trading name, **Your ZestPoint address** (the short name staff type to sign in), your business e-mail and phone, your country, your default currency, any other currencies you also trade in (a wallet is opened for each), your time zone and your main location. A logo is optional.',
        '**Your account.** Your name, the e-mail you will sign in with, and a password of at least 10 characters with a capital letter, a small letter and a number. Tick the terms and press the button to create your company.'
      ),
      careful('Your time zone matters. A day\'s sales, the daily summary and a shift\'s business date all follow it.'),
      p('You are the owner, and you hold every right. A new company starts on a free trial; **Admin**, then **Subscription** shows your plan.'),
      shot('register-type', 'Registration, step 1: the type of business.', 'The first step of registering a business in ZestPoint, asking what type of business is being registered, with a search box and the three steps shown above.')
    ]),
    section('fd-brand', '2. Choose your brand', [
      p('The next screen is a set-up wizard with four steps: Company (done by registration), **Brand**, **Staff & roles** and **Plan**. Brand is first.'),
      steps(
        'On the **Identity** tab, type your company name and a short name, and add a tagline if you like. Add a logo; without one, ZestPoint makes a tile from your initials.',
        'On the **Colours** tab, pick a **Theme preset**. Every preset meets the contrast rules for easy reading. A preset with a dark background gives a dark ZestPoint, and a light one gives a light ZestPoint. Change any colour and the theme becomes your own.',
        'The **Type & receipt** tab is for the writing on your receipts.',
        'Press **Preview theme** to see it on sample screens, then **Save and continue**. If a colour pair is too hard to read, ZestPoint tells you which and will not save until you fix it.'
      ),
      tip('Your logo and colours also appear on receipts and, on the phone, in the app. You can change them later under **Admin**, **Set-up**, **Branding**.'),
      shot('onboarding-brand', 'The Brand step of the set-up wizard, with a theme preset chosen.', 'The brand step of the ZestPoint set-up wizard on its Colours tab, with a theme preset list and colour fields on the left and a live preview on the right.')
    ]),
    section('fd-settings', '3. Settings: tax, payments and shifts', [
      p('Open **Admin**, then **Set-up**, then **Settings**. Set these before the first bill, because a bill keeps the tax it was opened with.'),
      list(
        '**Tax:** its name, the rate, and whether prices already include tax. There is one tax setting for the company.',
        '**Discount needing manager approval above (%):** a discount over this needs a supervisor. 0 means anyone who may give discounts can give any.',
        '**Cash, Card, Bank transfer:** the ways of paying you accept. Card and transfer are recorded, not charged.',
        '**Send orders to preparation stations:** tick this if the bar or kitchen prepares what you sell. See step 5.',
        '**Staff must start a shift before taking payments:** tick it if cashiers should count a float in and out.',
        '**Till difference that needs a supervisor:** a closed shift that is off by more than this waits for a supervisor to review it.',
        '**"Expiring soon" means within (days):** the warning time for stock that goes off, unless an item has its own.',
        '**Stock adjustments above a value need approval by someone else:** tick it and set the amount.',
        '**Spending loyalty points, Gift cards, Layby, Ordering from the table:** set these only if you use them. A point is worth nothing until you give it a value.'
      ),
      tip('To try ZestPoint before you set up for real, press **Load demonstration data** at the bottom of Settings. It adds sample items, stock and a supplier, all named "Demo", and **Remove demonstration data** takes them out again in one click.')
    ]),
    section('fd-branches', '4. Branches', [
      p('A branch is a place you trade from: a bar, a restaurant, a shop. Open **Admin**, **Set-up**, **Branches**, press **Add branch**, and give it a name, a code and an address. Staff are given the branches they work at, and what they see follows. Registration made your first one for you, called **Main branch**, at the main location you typed. If you have only one branch, you only need to rename it if you wish.'),
      shot('branches', 'Branches and outlets.', 'The Branches and outlets screen listing the demonstration company\'s branches, each with a code and an address, and an Add branch button.')
    ]),
    section('fd-stations', '5. Stations and printers', [
      p('A **station** is a place that makes what you sell: the bar, the kitchen, a grill. When someone presses **Send**, each station gets its own ticket with only its items. Open **Admin**, **Set-up**, **Preparation Stations**.'),
      list(
        'If you said yes to the bar man method, or ticked **Send orders to preparation stations** in Settings, a first station exists already: a **Bar** for a business with a bar, otherwise a **Kitchen**.',
        'Press **Add a station**, name it, and choose how it behaves: whether a bill must wait for it before it can be paid (a bar usually does, a kitchen usually does not), and whether stock leaves when the order is sent or when the station marks it ready.',
        'Set the minutes after which a ticket turns amber and then red on the kitchen display.',
        'One station is the **default**. It takes whatever has no station of its own.'
      ),
      p('A station is never deleted, only switched off. A station with open tickets cannot be switched off.'),
      shot('stations', 'Preparation stations: the Bar and the Kitchen, and how each behaves.', 'The Preparation stations screen listing a Bar and a Kitchen, each with whether the bill waits for it and when stock leaves, and an Add a station button.'),
      p('Then add your **printers**. Open **Admin**, **Set-up**, **Printers** and press **Add a printer**. Say how a phone reaches it: on your shop network (its address), by Bluetooth (each phone pairs it by hand), or a handheld\'s own printer. Then say what it prints: receipts and gift card slips, shift reports, labels, or kitchen and bar tickets. A kitchen and bar printer also needs the stations whose tickets it prints. Add each printer once for the whole company, or for one branch.'),
      notYet('The server never talks to a printer. A phone does the printing, so a network printer must be reachable from inside your shop. Printing to a real printer has not been tried yet. See **The phone app**.'),
      shot('printers', 'Printers, set up once and shared by every phone.', 'The Printers screen listing a receipt printer and a kitchen printer, with how each is reached, the paper, and what each prints, and an Add a printer button.')
    ]),
    section('fd-tables', '6. Tables', [
      p('Open **Admin**, **Set-up**, **Tables**. List the tables of each branch once. When someone opens a table bill, the till offers the list and shows which tables already have a bill running.'),
      steps(
        'Press **Add a table** for one, with its name or number, area and seats.',
        'Or press **Add several** to make Table 1 to Table 20 in one go: choose the word before the number and the first and last number.',
        'Press **QR code** on a table, then **Print the sticker**, and stick it on the table. Guests who scan it see your menu and can order, call a waiter or ask for the bill. (This needs the table-ordering part of your plan.)'
      ),
      careful('A table is never deleted, so old bills keep their table. One with a bill still open cannot be switched off. If a sticker is copied or photographed, press **Make a new code**: the old sticker stops working.'),
      shot('tables', 'Tables: the list for a branch, with a QR code for each.', 'The Tables screen listing tables named Table 1 to Table 8 with their areas and seats, with buttons to add one, add several and print all QR codes.')
    ]),
    section('fd-groups', '7. Stock groups', [
      p('Open **Stock**, **Stock Groups**. A group is a heading your items sit under, such as Starters, Mains, Spirits, Beer or Cleaning. Press **New group**, give it a name, and choose **Prepared at**: the station that makes what is in the group. A group with no station goes to the default station.'),
      p('A group can also name the ledger accounts its sales and stock post to. Leave them empty and ZestPoint uses the company\'s standard accounts.'),
      shot('stock-groups', 'Stock groups, each with the station that prepares it.', 'The Stock Group Maintenance screen listing the groups Food, Drinks and Ingredients, each with its station, and a New group button.')
    ]),
    section('fd-items', '8. Items', [
      p('Open **Stock**, **Items** and press **New stock item**. This opens the **stock card**: the one place for everything about an item. You need an item for what you sell and for what you cook with.'),
      list(
        '**Name, group, unit and prices.** The retail price is what the till charges. Nobody can type a different price at the till. The card also has a special price with its dates, an item discount, tax, loyalty points and the rules the till follows.',
        '**Last cost per unit.** What you last paid for one unit. Only people who may see costs see this.',
        '**Prepared at.** Leave it as the stock group says, or pick a station for this one item.',
        '**For things that go off:** **Shelf life (days)** fills the expiry date when stock arrives, and **Warn before expiry (days)** says how early to warn.',
        '**Portions per batch:** for a cake baked once and sold by the slice. See **A day in the kitchen**.',
        '**Other tabs:** selling units (a case of 12), package content (a hamper), equivalent part numbers, the recipe and options, the picture and the ledger accounts. The **Activity** tab shows everything that ever happened to the item.'
      ),
      careful('Creating an item adds no stock. A new item starts with none. Stock comes in through receiving, an adjustment, a stock take or an opening quantity.'),
      tip('Adding many items? Press **Add many from a file**, download the template, fill it in a spreadsheet and choose the file. It is checked first: every problem is listed by row, and nothing is added until the file is right. The file can carry an **Opening quantity** for each item.'),
      shot('items-list', 'Items: search, add, import and edit.', 'The Items screen listing demonstration items with their groups, prices and units, with a search box, a New stock item button and an Add many from a file button.'),
      shot('stock-card', 'The stock card, Details tab, with the shelf life and portions per batch for a cake.', 'The stock card of a chocolate cake, showing its name, group, prices, and the fields for shelf life, warning before expiry and portions per batch.')
    ]),
    section('fd-recipes', '9. Recipes', [
      p('A dish that is made from ingredients has a **recipe**: what one sale uses. With a recipe, selling the dish takes the ingredients off the shelf and the dish itself holds no stock.'),
      steps(
        'Make the ingredients as items first (type **ingredient**, in grams, millilitres or each).',
        'Make the dish as an item with a retail price, and save it. The recipe tab opens once the dish is saved and priced.',
        'Open the dish\'s stock card and the **Recipe and options** tab. Press **Add ingredient**, choose the ingredient and type the quantity.',
        'Type the **usable percent** for each ingredient. It says how much of what you buy is usable once trimmed: 100 when all of it is, 85 for tomato. The quantity you type is the usable amount, so 850 g of usable tomato takes 1,000 g off the shelf.',
        'Press **Save recipe**. Saving makes a new version, and past sales keep what they used then.'
      ),
      p('The same tab holds **Options and add-ons**, the extras the till offers when the item is picked (a double shot, extra cheese), each with an extra price and the stock it uses.'),
      notYet('The cost of a dish does not include its options or add-ons. Recipes with automatic ingredient depletion also need to be part of your plan.'),
      shot('recipe-tab', 'A dish\'s recipe: ingredients, quantity and usable percent.', 'The Recipe and options tab of a dish, listing ingredients with a quantity and a usable percent for each, and an Add ingredient and Save recipe button.')
    ]),
    section('fd-bins', '10. Bins', [
      p('A **bin** is a place stock is kept: a shelf, a cage, a cellar, the kitchen\'s own fridge. Open **Stock**, **Bin Locations**, press the add button, and give the bin a code and a name.'),
      list(
        'Tick **High security** for a bin where goods need a second person\'s confirmation before they count as stock.',
        'Choose **A station\'s own stock place** to make a bin the kitchen\'s (or the bar\'s) own place at that branch. What the store issues to the station lands there, and its sales and batches take from it first. A station can have one active bin at each branch.'
      ),
      careful('**Store Issues** will not work for a station until the station has its own bin. ZestPoint tells you so and points to **Bin Locations**.'),
      shot('bins', 'Bin Locations: shelves and cellars, and what each holds.', 'The Bin Locations screen listing a main shelf, a cellar, a cage marked secure and the kitchen\'s own bin, each with the number of items it holds.')
    ]),
    section('fd-staff', '11. Staff and roles', [
      p('Open **Admin**, **Staff**. There are tabs for the **Staff**, their **Roles & permissions**, and an **Activity log** for those who may see it. A role is a named set of rights. ZestPoint starts you with ready-made roles, and you can change them, copy them and make your own.'),
      steps(
        'Open the **Roles & permissions** tab. Look at the ready-made roles and change any that do not fit. For a cook or a bar hand, a role that holds the right to **act as a bar man** shows a section **Stations this role works at**. Tick the station (Kitchen or Bar) and the people with that role are told only about that station\'s orders. A role with no station ticked works at every station.',
        'Press **Add staff**. Type their name, choose how they sign in, pick their role and the branches they work at.',
        '**PIN set by me:** type a PIN of 4 to 12 digits, not a run or a repeat such as 1234 or 1111. ZestPoint makes their **staff code**, which looks like BHL-007, and shows it to you at once; it stays in the Staff list. Give them the code and the PIN.',
        '**Email invitation:** they get an e-mail with a link and a default PIN. Opening the link asks for that PIN once, then they choose their own.'
      ),
      p('Staff sign in with your **Venue address**, their **staff code** and their **PIN**, on the website or on the phone. The owner and administrators sign in with an e-mail and a password.'),
      tip('Add yourself a Cashier or Waiter test person first, so you can see the screens your staff will see.'),
      shot('staff-list', 'Staff: the people, their roles and their branches.', 'The Staff screen listing demonstration staff with their staff codes, roles, branches and status, with an Add staff button and tabs for Staff, Roles and permissions, and the Activity log.'),
      shot('roles', 'Roles: a role that works at the Kitchen only.', 'The Roles and permissions tab with the Line cook role open, showing its rights and the section Stations this role works at with the Kitchen ticked.')
    ]),
    section('fd-suppliers', '12. Suppliers', [
      p('Open **Purchasing**, **Suppliers**, or press **New supplier** from inside a purchase order. A supplier has a name, an e-mail and phone, a representative, a tax number and a **credit limit**. The credit limit is a warning: posting an order over it asks for a reason.')
    ]),
    section('fd-opening-stock', '13. Opening stock', [
      p('Your shelves already hold stock. ZestPoint needs to be told, once, so that its figures start right. There are four ways, and any of them is recorded.'),
      table(['Way', 'Best when', 'Where'], [
        ['**An opening quantity in the items file**', 'You are adding many items at once', '**Stock**, **Items**, **Add many from a file**: fill the **Opening quantity** and **Cost** columns and say which branch the stock is at'],
        ['**Goods without an order**', 'You want the stock valued at what you paid', '**Purchasing**, **Purchase Orders**, then **Goods without an order** (goods with no earlier order); receive it as usual'],
        ['**A stock take**', 'You will count it all anyway', '**Stock**, **Reports**, **Stock Take Report**: **New stock take**, count, **Submit for review**, **Approve**, **Reconcile**'],
        ['**An adjustment**', 'A few items', '**Stock**, **Adjustments**: choose the item, **Add**, and a reason']
      ]),
      careful('Every one of these is recorded with who did it and why. Stock in ZestPoint changes only through a delivery, a sale, a batch, a waste, an adjustment, a transfer or a stock take.')
    ]),
    section('fd-try-it', '14. Try it before the doors open', [
      steps(
        'Sign in as a cashier. If you ticked **Staff must start a shift before taking payments**, a box asks you to start your shift with a float. Type the cash in the drawer, tick that you counted it and press **Start shift**. ZestPoint gives you a till number.',
        'Open **Sell**, **Point of Sale**. Press **New**, choose a table, add a dish and a drink, and press **Send**.',
        'On **Sell**, **Kitchen Display** (or **Bar Orders**), take the ticket and mark it ready. The waiter is told.',
        'Take payment. Check the receipt.',
        'Look at **Stock**, **Reports**, **Stock Quantities Report**: the stock of what you sold has gone down.',
        'End the shift: count the drawer. The difference is shown.'
      ),
      tip('If something does not work, read **When something looks wrong**. Almost every refusal in ZestPoint says plainly what to do next.')
    ]),
    section('fd-later', 'When you are up and running', [
      p('These are worth setting up once you are trading:'),
      list(
        '**Daily Summary Set-up** (**Admin**, **Set-up**): who is sent yesterday\'s figures each morning, and at what time.',
        '**Prices and Menus** (**Head Office**, **Set-up**): a price for each branch, price lists and changes planned for a date.',
        '**Messages** (**Admin**, **Set-up**): see what ZestPoint sent your people, and send yourself a test.',
        '**Loss prevention** (**Head Office**, **Reports**): the rules that find unusual voids, discounts and cash differences.'
      )
    ])
  ]
};
