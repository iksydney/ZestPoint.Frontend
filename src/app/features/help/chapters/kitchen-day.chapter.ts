import { Chapter, careful, list, notYet, p, section, shot, steps, table, tip } from '../manual.types';

/**
 * A day in the kitchen: from the groceries to the price on the menu. Facts are from the backend architecture.md section 59 (the kitchen programme,
 * FND-152), section 58 (who works at which station) and the screens' own words. The honest limits are the ones FND-152 lists as not done.
 */
export const KITCHEN_DAY: Chapter = {
  id: 'kitchen-day',
  title: 'A day in the kitchen',
  summary: 'From buying groceries to the price on the menu: purchase orders and market runs, expiry dates, recipes, batches, asking the store, the prep list, waste and food cost.',
  roles: ['kitchen', 'store', 'manager', 'owner'],
  sections: [
    section('kd-overview', 'The day in order', [
      p('This chapter follows a kitchen through one trading cycle. It uses one example all the way: a kitchen that cooks with tomatoes and flour, bakes a chocolate cake, and sells it by the slice.'),
      table(['When', 'What happens', 'Where'], [
        ['Before service', 'Look at what to prepare today', '**Kitchen**, **Reports**, **Prep List**'],
        ['Early', 'Buy groceries, by purchase order or at the market', '**Purchasing**, **Purchase Orders** or **Market Runs**'],
        ['On arrival', 'Receive what came, with expiry dates', '**Purchasing**, **Goods Receiving**'],
        ['As needed', 'Ask the store for stock', '**Kitchen**, **Store Issues**'],
        ['Cooking', 'Record each batch made', '**Kitchen**, **Production**'],
        ['Service', 'Sell: tickets come to the station', '**Sell**, **Kitchen Display**'],
        ['All day', 'Write down waste', '**Stock**, **Adjustments**'],
        ['End of week', 'Check what each dish costs and what was lost', '**Kitchen**, **Food Cost** and the kitchen reports']
      ])
    ]),
    section('kd-buy', 'Buying groceries', [
      p('There are two ways, and both put stock in the store.'),
      p('**By purchase order**, for a supplier you order from. Open **Purchasing**, **Purchase Orders**, press **New purchase order**, choose the supplier, scan or type the items and press **Post purchase order**. Someone else approves it (the owner may approve their own), and you can press **Share** to send the supplier a link to see it.'),
      p('**By market run**, for cash buying at a market with no supplier and no order. Open **Purchasing**, **Market Runs** and press **Record a market run**.'),
      steps(
        'Type **Which market**, the **Cash you were given** and the **Change you hand back**.',
        'Choose each item bought, type **How much** and what you paid, in **Paid** (for all of it). Press **Add an item** for the next.',
        'Press **Add an expense** for any other money spent on the way. Choose its kind: **Transport**, **Loaders and carriers**, **Local levies and security**, or **Water and small items**. **Every expense needs a reason.**',
        'Attach **photos of the receipts**.',
        'Save. The stock is counted in **at once**, so the kitchen can cook, and the cash is reconciled on the run: money given, less the goods, less the expenses, less the change, should be nothing. Anything not accounted for shows in red.'
      ),
      p('Later a manager who is **not the buyer** opens the run and confirms it, or **queries** it with a question the buyer must answer. A run nobody has confirmed after a day is brought back to the managers. Expenses are kept apart from the goods and never change what an ingredient costs.'),
      shot('market-runs', 'A market run: what was bought, the money spent on the way, and the cash worked out.', 'The Market Runs screen with a run recorded at a market: the goods bought with what was paid, an expense for loaders with its reason, the cash given and change returned, and the unaccounted difference shown.'),
      careful('Local levies and security are flagged for the manager so that they look at the reason.')
    ]),
    section('kd-receive', 'Receiving with expiry dates', [
      p('When an order arrives, the store keeper opens **Purchasing**, **Goods Receiving**, checks the goods and presses **Details** on a line to type the **expiry date** and the **bin**. The chapter **For the store keeper** shows each step.'),
      p('You rarely need to type the date. On an item\'s stock card, **Shelf life (days)** says how long the item lasts. When stock arrives, ZestPoint works out the expiry date from that, whether it came through receiving or a market run or a batch. Setting a shelf life also makes the item keep its stock by batch (lot), so ZestPoint knows which lot is oldest. **Warn before expiry (days)** says how early to warn about that item. Without it, the company\'s own "expiring soon" days apply.'),
      tip('Stock is used oldest first. When a sale takes an item, ZestPoint takes it from the lot that expires first.')
    ]),
    section('kd-recipes', 'Recipes and the usable part', [
      p('A dish with a **recipe** takes its ingredients off the shelf each time it is sold. The recipe is on the dish\'s stock card, on the **Recipe and options** tab, and each line has three things: the ingredient, the **quantity per sale**, and the **usable percent**.'),
      p('The usable percent is the part of what you buy that you can actually use once it is trimmed. **The quantity you type is the usable amount.** The shelf gives up more.'),
      table(['Ingredient', 'Quantity per sale', 'Usable percent', 'What leaves the shelf'], [
        ['Tomato', '850 g', '85', '1,000 g (850 divided by 0.85)'],
        ['Rice', '200 g', '100', '200 g']
      ]),
      p('This is used everywhere: sales, the cost of a dish, how many can still be made, and the margin on a purchase order. So a dish\'s cost includes the part that is trimmed away.'),
      shot('recipe-tab', 'A dish\'s recipe: ingredients, quantity and usable percent.', 'The Recipe and options tab of a dish listing a tomato ingredient with its quantity and a usable percent of 85, a rice ingredient at 100 percent, and the Save recipe button.')
    ]),
    section('kd-batches', 'Batches made and recorded', [
      p('A cake is baked once and sold by the slice. A pot of stew is made once and sold by the plate. For things like these, record each **batch**. It keeps stock right: the ingredients leave, the portions are added.'),
      p('**A cake is not always sold by the slice.** A cake baked whole for one customer, such as a birthday cake, is a batch of **one** portion: put **Portions per batch** as 1, so one batch gives one cake and it is sold whole at its own price. A cake that you cut into slices can be sold whole as well: on its **Unit of Measure** tab add a selling unit, **Whole cake**, that holds its slices. A unit has no price of its own, so a whole cake costs the slice price times the number of slices it holds. And a cake that is baked only when someone orders it needs no batch at all: give it a recipe on its **Recipe and options** tab, and the ingredients leave when it is sold.'),
      p('**First, on the stock card.** On the cake\'s **Details** tab set **Portions per batch** (8 slices). On its **Recipe and options** tab, in **Made in batches**, say what one batch takes: each ingredient, its quantity and its usable percent. ZestPoint shows what one batch costs and what one portion costs. A batch recipe cannot name the item itself or loop back through another batch recipe.'),
      shot('batch-recipe', 'What one batch takes, with the cost of a batch and of a portion.', 'The Made in batches part of a cake\'s stock card listing the ingredients of one batch with quantities and usable percents, and the cost of one batch and of one portion.'),
      p('**Then, each time you bake.** Open **Kitchen**, **Production**.'),
      steps(
        'Under **What was made**, choose the cake. ZestPoint says "One batch gives 8 portions and takes 3 ingredients".',
        'Type how many **batches** you made.',
        'Type **Portions that came out**: how many slices you actually got, not how many you hoped for. If fewer came out than the recipe says, the screen shows how many fewer.',
        'Add a note if you like and press **Record the batch**.'
      ),
      p('What ZestPoint then does, all at once: the ingredients leave stock (allowing for the usable part, taking from your station\'s own place first), the slices you got are added, the cost of one slice is worked out from what the ingredients cost and how many slices came out, and the difference between expected and actual is kept and reported. The batch gets a lot number and an expiry date from the shelf life.'),
      p('Example: a batch takes 500 g of flour at a cost of 1 a gram, so it costs 500. Eight slices were expected and seven came out. A slice costs 71.43 (500 divided by 7), and the report shows one fewer than expected.'),
      shot('production', 'Production: recording a batch with the portions that came out.', 'The Production screen with the Record a batch form showing a chocolate cake, the number of batches, the portions that came out and the difference from expected, with the list of recent batches below.'),
      list(
        'Nobody has to approve a batch.',
        'A batch you send twice (a lost signal, a double press) is recorded once.',
        'If you sell more slices than were recorded as made, the sale is **never held up**. The kitchen is told once a day for that item, so the next batch gets recorded.'
      ),
      notYet('A recorded batch **cannot be undone**. If you made a mistake, put it right with a stock adjustment and write a note saying why.'),
      notYet('The phone app has no screen for batches. Record them on the website.')
    ]),
    section('kd-issues', 'Asking the store for stock', [
      p('The store holds the stock; the kitchen holds only what it has been given. When the kitchen needs more flour it asks. Open **Kitchen**, **Store Issues**, press **Ask the store for stock**, choose the station, the items and how much.'),
      steps(
        'The **station asks**. It shows as "Waiting for the store", and the store is told.',
        'The **store hands over** what it can. It may be less than was asked. Stock moves from the store\'s bin to the station\'s own place.',
        'The **station confirms what arrived**. If less arrived than was handed over, say so: the difference is shown and the store is told.'
      ),
      p('The person who asks cannot hand over, and the person who handed over cannot confirm. A request that has not been handed over can be cancelled by the person who asked, with a reason.'),
      careful('A station needs its own stock place first (**Stock**, **Bin Locations**, then **A station\'s own stock place**). Without it ZestPoint says "The Kitchen has no stock place at this branch yet" and points to Bin Locations.'),
      p('The kitchen\'s sales, tickets and batches take from its own place first. If the place runs short of something, the people at the station are told once a day for that item.')
    ]),
    section('kd-prep', 'The prep list', [
      p('**Kitchen**, **Reports**, **Prep List** says what to prepare today for the things you make in batches. For each one it shows the **par** (how much you want ready), what is **on hand**, how much **to prepare**, how many **batches to make**, and what **usually sells on this weekday** beside it (the average of the last four of the same weekday).'),
      p('The par is the item\'s **Target stock** on its stock card (optional). An item with no target stock has no par and shows nothing to prepare. Only items made in batches are listed.'),
      shot('prep-list', 'The prep list: what to prepare today.', 'The Prep List report showing items with their target stock, the amount on hand, the amount to prepare, and what usually sells on this weekday.')
    ]),
    section('kd-sell', 'Selling', [
      p('When a waiter sends an order, the kitchen\'s tickets arrive on the kitchen display (a station is shown on the Kitchen Display or on Bar Orders, never both) and the people at the station are told. The cook ticks items off and presses **Bump: ready**. The chapter **For kitchen and bar staff** shows how.'),
      p('Stock leaves the moment the station is set to use: when the bill is **sent** (a kitchen usually) or when the station marks it **ready** (a bar usually). For a dish with a recipe, the ingredients leave. For a portion from a batch, the portion leaves the stock that the batch added.')
    ]),
    section('kd-waste', 'Waste reasons', [
      p('Record every loss, so that stock stays right and the reports can say where it went. Open **Stock**, **Adjustments**, pick the item and take the quantity away. The reasons every company starts with include four for the kitchen:'),
      list(
        '**Prep trim**: what you cut away.',
        '**Spoiled in store**: it went off.',
        '**Staff meal and tasting**.',
        '**Remade or thrown away after cooking**.'
      ),
      p('The others are **Breakage**, **Spillage**, **Expired stock**, **Count correction**, **Missing stock**, **Damaged goods**, **Receiving correction** and **Other authorised reason**. The **Kitchen Waste Report** shows the kitchen\'s losses by reason, by item or by station. An owner can add reasons with the **Reasons** button on the Adjustments screen.')
    ]),
    section('kd-expiry', 'Expiry alerts', [
      p('Each hour, ZestPoint looks for stock that is close to its expiry date, using each item\'s own warning time. The people at the item\'s station, and the stock managers, are told once a day for each group. **Stock Expiry Report** (**Stock**, **Reports**) lists stock that has expired or soon will; choose **Expired**, **Expiring soon** or **OK**, and how many days to warn within.'),
      notYet('ZestPoint warns about stock that is expiring but **does not write it off**. Expired stock stays on the count until a person writes it off as an adjustment, with the reason **Expired stock**. This is the owner\'s choice.')
    ]),
    section('kd-cost', 'Food cost and setting prices', [
      p('**Kitchen**, **Food Cost** shows what each dish costs against its price. The cost of one portion comes from what its ingredients cost, allowing for what is lost in trimming. The **food cost %** is that cost against the price **without** tax, and shows red when it is above what you want.'),
      steps(
        'Type the food cost you aim for, for example 30, and press **Work it out**. Each dish now shows the price that would reach it.',
        'Look at the two costs side by side. **Cost (average)** is what the stock is valued at. **Cost (last bought)** shows a price rise early.',
        'To take a suggested price as it is, press **Use this price** and confirm. It sets the company price for that item at once, and the change is recorded with a reason. You need the right to set prices.'
      ),
      p('**Typing a price, or a target for one dish.** If you may set prices, each dish has a **Price** box, and beside it a box for **Its own target**. As you type, that dish\'s **Food cost** and its **Price for target** change at once, so you can try a number before anything is kept. Leave **Its own target** empty and the dish follows the **Food cost I want** above. Type a number from 1 to 99 and that dish is worked out against its own target instead, and still is tomorrow. The small **x** beside the box empties it again. A price must be above zero.'),
      steps(
        'Change what you like, in as many dishes as you like. Each dish you have changed is marked **Changed**, and the bar above the table counts them ("3 changes").',
        'Press **Save** on a dish to save just that dish, or **Save changes** in the bar to save all the changed dishes together. ZestPoint first lists what will change, each price from and to and each target, and asks you to confirm.',
        'If a dish cannot be saved, for example because its price is below the minimum price on its stock card, ZestPoint names the dish and says why. The other dishes are still saved, and what you typed for the dish that failed stays in the table so that you can put it right. **Discard** throws away everything you have not saved.'
      ),
      p('A price you save is set for the whole company, as **Use this price** does, and is recorded with who changed it. Price lists and branch prices are on the **Prices and Menus** screen.'),
      shot('food-cost', 'Food cost: what each dish costs, and the price that reaches your target.', 'The Food cost screen with a target of 30 percent, a bar saying one change is not saved with Save changes and Discard buttons, and a table of dishes with their price in a box that can be typed in, average cost, last bought cost, food cost percent, a box for the dish\'s own target and the price for the target. The chocolate cake is marked Changed, with a new price and a target of 25 typed in and a Save button; the other dishes can have a Use this price button.'),
      notYet('A dish\'s food cost does **not** include its options or add-ons. For a dish that is a portion of a batch, the cost used is the cost per portion of its latest batch.')
    ]),
    section('kd-reports', 'The kitchen\'s reports', [
      table(['Report', 'What it tells you'], [
        ['**Prep List**', 'What to prepare today'],
        ['**Kitchen Waste Report**', 'What the kitchen lost: trim, spoiled, staff meals, remade'],
        ['**Production Variance Report**', 'Portions each batch was expected to give against the portions that came out'],
        ['**Actual Against Expected Use Report**', 'For each item: what sales and batches should have used, what was written off, and what stock takes found unexplained'],
        ['**Market Run Expenses Report**', 'Money spent on market runs that was not stock, by kind, buyer or line, with the reason for each']
      ]),
      p('The first four are under **Kitchen**, **Reports**. The last is under **Purchasing**, **Reports**. People who may not see costs do not see cost columns.')
    ]),
    section('kd-limits', 'What the kitchen part does not do yet', [
      notYet('A recorded batch cannot be undone; correct it with a stock adjustment and a note.'),
      notYet('The day used for alerts, and the weekday on the prep list, start and end at midnight in universal time (UTC), not at midnight in your branch, so something late at night may count as the next day.'),
      notYet('Photos of receipts from market runs and deliveries are kept but are not shown back on the website yet.'),
      notYet('**Actual Against Expected Use Report** only means something if stock takes were done in the period. Without them it cannot say what is unexplained.'),
      notYet('Alerts reach only people whose role works at the station.'),
      notYet('The phone has no screens for batches, store issues or market runs. Only the **Station** tab works a station\'s tickets.'),
      notYet('Nothing in the kitchen part has been tried in a real kitchen yet.')
    ])
  ]
};
