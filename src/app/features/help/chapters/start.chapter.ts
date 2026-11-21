import { Chapter, careful, list, notYet, p, section, shot, steps, table, tip } from '../manual.types';

/** The first chapter: what the manual is, how to use it, and where things are. Menu names come from core/navigation/nav-layout.ts. */
export const START: Chapter = {
  id: 'start',
  title: 'Start here',
  summary: 'What this manual is, how to find your way around it, and where things are in ZestPoint.',
  roles: 'all',
  sections: [
    section('what-this-is', 'What this manual is', [
      p('This manual is for the people who work in a business that uses ZestPoint: bars, restaurants, lounges, nightclubs and shops. It says how everything works, and how the parts connect: what you buy, what the store holds, what the kitchen and the bar use, what the till sells, and what ZestPoint writes down along the way.'),
      p('It is written from what ZestPoint does today. Where something is only half done, a note marked **Not there yet** says so plainly, so you never have to guess.'),
      p('Amounts in the pictures are examples. In your own ZestPoint every amount is in your company\'s currency, and every price, limit and rule is the one you set.')
    ]),
    section('how-to-use', 'How to use this manual', [
      list(
        '**Contents.** The list of chapters is on the left (on a phone, press **Show the contents**). Pick a chapter to read it.',
        '**Search.** Type a word in the search box and only the sections that mention it are shown. If nothing matches, it says so.',
        '**Your job.** Pick your job (Owner, Manager, Cashier and so on) to see only the chapters written for it. Press it again, or **Everyone**, to see everything.',
        '**Links.** Every section has a link beside its title. Copy it to send someone the exact place.',
        '**The PDF.** **Download the PDF** gives the same text with the same pictures, to read or print. It is made from this same text, so the two cannot disagree.'
      ),
      tip('For a short walk round a screen, open **Help** at the top of ZestPoint and choose **Tour of this screen**. For a tour of the whole menu choose **Tour of ZestPoint**. The tours are about a minute each.')
    ]),
    section('about-the-pictures', 'About the pictures', [
      p('The pictures are taken from a demonstration company with sample items, sample people and sample amounts, so no real person or business appears in them. Your screens will show your own names and figures. Where your screen looks a little different from a picture, the words on the screen are the ones to follow.'),
      p('The phone app is described in words, not pictures, in the chapter **The phone app**.')
    ]),
    section('what-you-see', 'You only see what your job allows', [
      p('The menu shows only the screens your role allows. Someone who works the till does not see the ledger; someone in the store does not see the till. This is on purpose, and it is not only the menu: ZestPoint checks the same rule again every time you press a button.'),
      p('If a screen in this manual is not in your menu, one of two things is true. Either your role does not include it (an owner or administrator can change roles on **Staff**, then **Roles**), or your plan does not include it, and ZestPoint says so on a page called **Not included in your plan** or **Upgrade required**.'),
      table(['If you see', 'It usually means', 'What to do'], [
        ['A screen missing from the menu', 'Your role does not include it', 'Ask the owner or an administrator to change your role'],
        ['A button that is greyed out', 'Your role or your plan does not allow that action', 'The reason is in the button\'s tooltip; ask a manager'],
        ['**Not included in your plan**', 'The company\'s plan does not have that part', 'Ask the person who looks after the subscription (**Admin**, then **Subscription**)']
      ])
    ]),
    section('menu-areas', 'Where things are', [
      p('The menu on the left is a short list of areas, each grouped by the job being done. Each area keeps its reports behind one **Reports** entry, and the things you set up once and change now and then behind one **Set-up** entry, so the menu stays short. Press **Ctrl+K** (or the search button) and type part of a screen\'s name to go straight to it.'),
      table(['Area', 'What it is for', 'Main screens'], [
        ['**Sell**', 'Take orders and payments, and open and close the day', 'Point of Sale, Start / End of Day, My Sales, Bar Orders, Kitchen Display, Tips'],
        ['**Customers**', 'The people you sell to: their points, their laybys and what they are waiting for', 'Customers, Laybys, Sales Back Orders'],
        ['**Stock**', 'What you hold and sell: items, groups, counts and where things are', 'Stock Overview, Items, Stock Groups, Adjustments, Bulk Changes, Bin Locations, Labels, Consignment Out'],
        ['**Kitchen**', 'What the kitchen makes and uses: batches, stock asked of the store, what each dish costs, and what to prepare', 'Production, Store Issues, Food Cost'],
        ['**Purchasing**', 'Order from suppliers, receive goods and pay for them', 'Purchase Orders, Goods Receiving, Market Runs, Suppliers, Supplier Payments'],
        ['**Finance**', 'The ledger: accounts and the entries posted from sales, purchases and stock', 'Chart of Accounts'],
        ['**Head Office**', 'All your branches together: side by side, and the prices and menus they share', 'Reports (overview, comparison, loss prevention); Prices and Menus under Set-up'],
        ['**Admin**', 'People, branches, settings, your brand and your subscription', 'Staff, Subscription, Support; under Set-up: Branches, Tables, Preparation Stations, Printers, Settings, Daily Summary Set-up, Messages, Branding']
      ]),
      shot('dashboard', 'The Dashboard, with the menu on the left. The speech-bubble button at the top is the bell, where ZestPoint tells you things.', 'The ZestPoint dashboard for a demonstration lounge: the menu of areas on the left, the bell and Help at the top, and shortcut tiles for what the person uses most.')
    ]),
    section('notes', 'How the notes are marked', [
      p('Three kinds of note appear in this manual. Each is labelled with a word as well as a colour, so you never need the colour to tell them apart.'),
      tip('A **Tip** is a shortcut or a good habit.'),
      careful('**Careful** means a step that cannot be taken back, or that records something under your name.'),
      notYet('**Not there yet** means ZestPoint does not do this today, or does only part of it. The chapter **What ZestPoint does not do yet** gathers them in one place.')
    ]),
    section('if-stuck', 'If you are stuck', [
      steps(
        'Open **Help** at the top and choose **Tour of this screen** for a minute\'s walk round the screen you are on.',
        'Read the chapter **When something looks wrong**. It uses the plain reasons ZestPoint itself gives.',
        'If you may, open **Admin**, then **Support**, and ask ZestPoint for help. You can follow the answer there.'
      )
    ])
  ]
};
