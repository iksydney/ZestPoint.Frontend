# ZESTPOINT IMPLEMENTATION PROMPT
## POS Navigation, Stock Navigation, Reporting, Permissions, Backend APIs, and End-to-End Completion

### ROLE AND OBJECTIVE

Act as a principal Angular engineer, ASP.NET Core engineer, database architect, product engineer, security engineer, and QA lead.

Implement the complete POS and Stock navigation modules illustrated in the supplied screenshots within the existing ZestPoint application.

**Repositories**
- Frontend: `ZestPointDashboard/ZestPoint.Frontend/` — Angular 18.
- Backend: `ZestPoint/` — ASP.NET Core 8, EF Core, SQL Server.
- Shared architecture rules: `constitution.md`.
- Existing implementation gaps: `findings.md`.
- Backend implementation and setup status: `ZestPoint/DELIVERY.md`.
- Existing feature definitions and technical structure: the frontend and backend `architecture.md` files.

Read these documents and inspect the actual source code before making changes. Use the existing architecture, naming conventions, API response envelopes, DTOs, authorization handlers, entitlement engine, services, repositories where applicable, migrations, and testing patterns.

Do not replace working code or create duplicate versions of existing services.

The screenshots define the required navigation entries. The architecture defines how to implement them.

**Definition of done:** Every required menu entry must open a working feature, use real persisted data, enforce permissions on the backend, respect subscription entitlements, handle errors correctly, and have automated tests. A static screen, placeholder route, mock report, or button without a working action is not a completed feature.

---

# PART 1 — NAVIGATION AND ACCESS-CONTROL PRINCIPLES

## 1.1 Separate selling privileges from management privileges

A user who has permission to sell must not automatically gain access to:
- Sales reports.
- Income reports.
- Staff performance reports.
- Cost prices.
- Selling-price administration.
- Stock adjustments.
- Stock valuation.
- Stock-taking approval.
- Global stock maintenance.
- Stock-group maintenance.
- Company-wide settings.
- Subscription management.

Implement authorization at the individual screen and action level.

Use the existing architecture's authorization mechanisms:
- `ScreenPermission`.
- `ScreenPermissionHandler`.
- `AuthorizationStateService`.
- Tenant and branch checks.
- Subscription entitlement checks.
- Workspace lock enforcement.

Do not introduce a second, conflicting authorization system.

The frontend may hide unauthorized navigation items, but the backend must reject unauthorized API requests independently.

## 1.2 Use one navigation configuration

Inspect `src/app/navigation/app-nav.ts` and the existing routing and guards.

Extend the existing navigation configuration so that:
- Navigation rendering.
- Default landing-page selection.
- Route permission metadata.
- Module entitlement metadata.
- Breadcrumbs.
- Navigation search, if present.

all derive from consistent feature definitions.

Do not maintain separate hard-coded lists in the sidebar, dashboard, and landing redirect logic.

Create a strongly typed navigation definition where appropriate. Each item should include:
- Stable feature ID.
- Display label.
- Route.
- Icon.
- Required permission.
- Required subscription module, if applicable.
- Parent navigation group.
- Required branch context, if applicable.
- Whether it is a direct screen or a submenu.
- Optional keyboard shortcut.
- Whether it should appear in quick access.

Never derive authorization from the display label or keyboard shortcut.

## 1.3 Navigation groups

Implement these groups under `/app`.

**POS**
1. Point of Sale
2. Start / End of Day
3. Summary Income Report
4. Daily Sales Report
5. Staff Sales Report
6. Stock Groups Sales Report
7. Sales Analysis Report
8. Multi-Currency Report

**Stock**
1. Add / Modify Stock
2. Stock Group Maintenance
3. Global Stock Maintenance
4. Stock Qty Adjustments
5. Items Enquiry Report
6. Stock Transactions Enquiry Report
7. Stock Quantities Report
8. Selling Prices Report
9. Cost Prices Report
10. Stock Performance Report
11. Out of Stock Report
12. Stock Re-Order Report
13. Stock Take Report
14. Stock Value Report
15. Items History Report
16. Stock Labels Printing
17. Stock Expiry Report
18. Web Store Stock Report
19. Stock Aging Report
20. Serial Numbers Report

Retain the shortcut identifiers shown in the stock screenshot where practical:
- `v` — Stock Value Report.
- `h` — Items History Report.
- `b` — Stock Labels Printing.
- `x` — Stock Expiry Report.
- `w` — Web Store Stock Report.
- `g` — Stock Aging Report.
- `s` — Serial Numbers Report.

Preserve the legacy menu ordering and labels unless a documented UX improvement requires a clearer label. If changing a label, preserve a mapping to the original identifier.

Use separate, descriptive route names. Do not create routes that conflict with existing `/app/pos`, `/app/inventory`, `/app/catalog`, or other established routes.

Suggested route structure:

- `/app/pos`
- `/app/pos/day-management`
- `/app/pos/reports/summary-income`
- `/app/pos/reports/daily-sales`
- `/app/pos/reports/staff-sales`
- `/app/pos/reports/stock-group-sales`
- `/app/pos/reports/sales-analysis`
- `/app/pos/reports/multi-currency`
- `/app/inventory/items`
- `/app/inventory/groups`
- `/app/inventory/global-maintenance`
- `/app/inventory/adjustments`
- `/app/inventory/reports/items-enquiry`
- `/app/inventory/reports/transactions`
- `/app/inventory/reports/quantities`
- `/app/inventory/reports/selling-prices`
- `/app/inventory/reports/cost-prices`
- `/app/inventory/reports/performance`
- `/app/inventory/reports/out-of-stock`
- `/app/inventory/reports/re-order`
- `/app/inventory/reports/stock-take`
- `/app/inventory/reports/stock-value`
- `/app/inventory/reports/items-history`
- `/app/inventory/reports/stock-labels`
- `/app/inventory/reports/expiry`
- `/app/inventory/reports/web-store-stock`
- `/app/inventory/reports/stock-aging`
- `/app/inventory/reports/serial-numbers`

Adapt routes to the existing route conventions and prevent duplicate implementations.

## 1.4 Role and permission matrix

Implement and test permissions using the existing permission catalogue and role system.

Suggested initial defaults:

| Feature | Cashier | Supervisor | Inventory Manager | Accountant | CEO/Superadmin |
|---|---|---|---|---|---|
| Point of Sale | Yes | Yes | Optional | Optional | Yes |
| Start / End of Day | Own shift | Assigned shifts | No by default | View if authorized | Yes |
| Summary Income Report | No | Optional | No | Yes | Yes |
| Daily Sales Report | No | Optional | No | Yes | Yes |
| Staff Sales Report | No | Optional | No | Yes | Yes |
| Stock Groups Sales Report | No | Optional | Optional | Yes | Yes |
| Sales Analysis Report | No | Optional | No | Yes | Yes |
| Multi-Currency Report | No | Optional | No | Yes | Yes |
| Add / Modify Stock | No by default | Optional | Yes | No by default | Yes |
| Stock Group Maintenance | No | No by default | Yes | No by default | Yes |
| Global Stock Maintenance | No | No | Restricted | No | Yes |
| Stock Qty Adjustments | No | Request or limited | Yes | View if authorized | Yes |
| Cost Prices Report | No | No by default | Optional | Yes | Yes |
| Stock Take Report | No | Optional | Yes | View if authorized | Yes |
| Stock Value Report | No | No by default | Optional | Yes | Yes |
| Stock Labels Printing | No | Optional | Yes | No | Yes |
| Stock Expiry Report | No | Optional | Yes | Optional | Yes |
| Serial Numbers Report | No | Optional | Yes | Optional | Yes |

These are suggested defaults, not hard-coded restrictions. The CEO/Superadmin should be able to configure appropriate custom roles and permissions, subject to the existing owner protection and privilege-escalation safeguards.

A permission to view a report must not automatically grant permission to export it if the application supports export-specific restrictions. Likewise, viewing cost prices must not imply permission to edit them.

Provide distinct permissions for sensitive actions such as:
- View.
- Create.
- Edit.
- Approve.
- Adjust.
- Export.
- Print.
- Void or reverse.

For example, a stock adjustment may require both `inventory.stock.adjust` and an approval permission when the amount or variance exceeds the company's configured threshold.

Use existing permission keys where they accurately represent the action. Add new keys through the backend permission catalogue, seeds, DTOs, and frontend parity checks.

---

# PART 2 — POS MODULE IMPLEMENTATION

## 2.1 Point of Sale

Integrate the navigation entry with the existing POS implementation. Reuse the existing POS store, order calculation, order state machine, payment workflow, and offline synchronization.

Implement and verify:
- Open an existing tab or create a new sale.
- Select a branch and operating terminal within the user's authorized scope.
- Search and select products.
- Add, edit, and remove order lines.
- Apply permitted modifiers and substitutions.
- Calculate quantity, prices, taxes, discounts, tips, and totals.
- Save and resume open orders.
- Send an order to the applicable workflow.
- Process permitted payment methods.
- Record successful payments.
- Generate immutable receipt snapshots.
- Handle failed and pending payments.
- Prevent duplicate orders and payments.
- Apply recipe-based stock depletion according to the existing stock policy.
- Respect the company's currency and tax configuration.

Do not duplicate existing POS functionality merely to satisfy the new menu. Identify missing capabilities and complete them in place.

### Offline behavior

Preserve the existing offline-first POS architecture.

Support the operations already approved for offline execution. Do not silently extend offline support to refunds, card payments, or other operations that require online authorization.

Every queued operation must:
- Have a unique client operation ID.
- Be associated with the correct tenant and staff member.
- Be processed idempotently.
- Be reauthorized by the backend.
- Preserve rejection details.
- Reconcile with server-calculated totals and inventory movements.

Do not display a queued cash payment as server-confirmed settlement until synchronization confirms it.

## 2.2 Start / End of Day

Implement a dedicated operational screen for starting and closing a cashier's or terminal's trading session.

Support:
- Select or confirm the operating branch.
- Identify the user and terminal.
- Opening cash amount.
- Opening float confirmation.
- Opening timestamp.
- Active shift status.
- Cash additions and withdrawals, with reasons.
- Cash sales totals.
- Non-cash sales totals where relevant.
- Expected cash balance.
- Actual counted cash.
- Cash variance.
- Closing notes.
- Closing confirmation.
- Supervisor review where required.
- Shift history and printable shift summary.

Create explicit states such as:
`NotStarted`, `Open`, `PendingReview`, `Closed`.

Define allowed state transitions and prevent closing a shift twice or opening conflicting sessions for the same terminal where the business rules prohibit it.

Calculate expected cash from recorded cash movements and eligible transactions, not from a manually entered total.

Separate:
- User shift.
- Terminal session.
- Company business day.

A shift spanning midnight must remain associated with the correct configured business date and time zone.

Use existing tenant-time utilities and backend UTC timestamps.

### Backend and database

Inspect existing entities before adding anything. Reuse or extend existing order, payment, branch, and audit entities.

If the functionality is missing, add suitable entities such as:
- `PosShift`.
- `PosCashMovement`.
- `PosShiftReview`.

Persist opening float, actual count, calculated expected balance, variance, state, user, terminal, timestamps, and approval information.

Add constraints to prevent duplicate active shifts where required.

Suggested endpoints, adapted to existing API conventions:

- `GET /api/v1/pos/shifts/current`
- `GET /api/v1/pos/shifts`
- `POST /api/v1/pos/shifts/open`
- `POST /api/v1/pos/shifts/{id}/cash-movements`
- `POST /api/v1/pos/shifts/{id}/close`
- `POST /api/v1/pos/shifts/{id}/review`

Apply tenant, branch, role, and permission checks to every endpoint.

## 2.3 Summary Income Report

Provide a date-filtered financial summary of sales and relevant recorded transactions.

Include:
- Gross sales.
- Discounts.
- Returns and refunds.
- Tax.
- Net sales, with an explicitly documented formula.
- Cash collected.
- Card and transfer collections.
- Other configured payment methods.
- Outstanding or pending payment totals.
- Transaction counts.
- Comparisons with a previous period, where meaningful.

Separate sales totals from cash settlement totals. Do not count a pending payment as collected revenue.

Provide date range, branch, terminal, currency, and transaction-status filters where applicable.

Display calculation definitions and ensure the report reconciles with source transactions.

## 2.4 Daily Sales Report

Include:
- Business date.
- Transaction count.
- Gross and net sales.
- Discounts.
- Tax.
- Refunds and voids, displayed separately.
- Payment-method breakdown.
- Branch and terminal breakdown.
- Hourly or time-bucket sales.
- Average transaction value.

Support date and branch filters and authorized exports.

Ensure voided, refunded, and partially paid transactions are treated consistently with the report's documented definitions.

## 2.5 Staff Sales Report

Include:
- Staff member.
- Branch and terminal.
- Number of transactions.
- Gross and net sales.
- Discounts.
- Refunds and voids.
- Payment totals.
- Average sale value.
- Optional shift breakdown.

Attribute transactions to the appropriate staff member using recorded transaction history.

Handle tab transfers and staff reassignment consistently so sales are not counted twice.

Restrict individual performance and staff-level financial details to authorized roles.

## 2.6 Stock Groups Sales Report

Group sales by configured product or stock group.

Include:
- Stock group.
- Number of products sold.
- Quantity sold.
- Gross sales.
- Discounts.
- Net sales.
- Returns and voided quantities.
- Contribution to total sales.
- Comparison across branches and time periods.

Use the product's recorded group association at the appropriate point in the transaction history. If product groups can change later, preserve sufficient historical information to avoid silently reclassifying old sales.

Provide drill-down into authorized product-level sales.

## 2.7 Sales Analysis Report

Implement configurable analysis across:
- Date and time.
- Branch.
- Terminal.
- Staff member.
- Product.
- Product category or stock group.
- Payment method.
- Customer, when enabled and authorized.

Provide trend charts, totals, comparisons, top-selling items, low-performing items, average transaction value, and sales composition.

Where margin is shown, calculate it using a clearly documented cost basis. Do not label gross sales as profit.

Provide pagination for detailed results and server-side aggregation for large datasets.

## 2.8 Multi-Currency Report

Support reporting for companies that have configured multiple currencies.

Include:
- Original transaction currency.
- Original transaction amount.
- Recorded exchange rate.
- Company reporting currency.
- Converted reporting amount.
- Transaction date and source.
- Applicable exchange-rate timestamp.
- Realized conversion differences when reliable settlement data exists.

Do not add amounts in different currencies without conversion.

Preserve the exchange-rate snapshot associated with the transaction. Historical reports must not change merely because the current exchange rate changes.

If the system does not yet support a particular currency or conversion source, show the limitation explicitly instead of fabricating a conversion.

---

# PART 3 — STOCK MAINTENANCE FEATURES

## 3.1 Add / Modify Stock

Build a complete stock-item management interface using the existing catalogue, inventory-item, recipe, and stock-balance models.

Support:
- Create a stock item.
- Edit permitted item properties.
- Activate and deactivate items.
- SKU and barcode.
- Product name and description.
- Stock group.
- Product type.
- Unit of measure.
- Purchase and selling units.
- Conversion factors where required.
- Supplier references.
- Purchase cost.
- Selling price.
- Tax classification.
- Reorder threshold.
- Reorder quantity.
- Opening stock through an audited stock-receipt or adjustment workflow.
- Batch, expiry, and serial tracking where applicable.
- Recipe and ingredient links for recipe-based products.
- Branch availability.
- Optional web-store availability.

Validate duplicate SKUs, invalid units, negative or invalid prices, missing groups, and incompatible tracking settings.

Do not directly overwrite stock quantities during ordinary item edits. Changes to on-hand stock must go through the stock movement workflow.

Sensitive cost fields must be permission-controlled independently from general product editing.

When a product is deactivated, retain its historical sales and inventory records.

## 3.2 Stock Group Maintenance

Provide CRUD functionality for stock groups.

Include:
- Group name.
- Group code.
- Description.
- Parent group if hierarchical groups are supported.
- Active/inactive state.
- Default tax configuration if supported.
- Default costing or reporting settings where appropriate.

Prevent deletion of groups referenced by existing products or historical records. Offer safe deactivation or a controlled reassignment workflow.

Use the same group model for catalogue navigation, stock reports, and sales-by-group reporting.

## 3.3 Global Stock Maintenance

Implement authorized company-wide stock administration.

Support:
- Review stock records across branches.
- Identify missing or inconsistent item configuration.
- Manage approved shared product properties.
- Bulk updates for permitted fields.
- View branch-level balances.
- Compare product settings across branches.
- Apply approved group or catalogue changes.
- Validate changes before committing them.
- Display the affected record count and preview.
- Record before-and-after values for sensitive changes.

Do not confuse company-wide configuration with permission to ignore tenant isolation.

A global operation must remain restricted to the current tenant. Cross-tenant operations belong to the separate platform-operator interface and must never be exposed through ordinary stock maintenance.

Use batch processing for large changes. Provide transactional or explicitly staged execution with clear failure reporting. Do not leave partially updated data without a recoverable, auditable outcome.

## 3.4 Stock Qty Adjustments

Implement a dedicated inventory adjustment workflow.

Support:
- Select branch and stock item.
- Display current expected quantity.
- Enter the adjustment quantity or counted quantity.
- Calculate the resulting quantity.
- Select an adjustment reason.
- Add explanatory notes.
- Attach supporting evidence if the existing file-storage architecture supports it.
- Submit for approval where required.
- Approve or reject adjustments.
- Record the final stock movement.
- View adjustment history.

Adjustment reasons should be configurable and may include:
- Breakage.
- Spillage.
- Expired stock.
- Count correction.
- Missing stock.
- Damaged goods.
- Receiving correction.
- Other authorized reasons.

Do not allow the requester to approve their own adjustment when separation of duties is required.

All committed changes must use the existing `StockService` or its established equivalent, with atomic updates and append-only `StockMovement` records.

Use idempotency keys, concurrency controls, and server-side validation.

---

# PART 4 — STOCK REPORTS

Implement each report as a distinct, functional screen. Use shared report infrastructure for filters, tables, pagination, totals, permissions, and export controls, but do not render the same generic report under different labels.

All reports must be generated from actual server-side data. Apply tenant and branch scope to the underlying queries before aggregation.

## 4.1 Items Enquiry Report

Purpose: Search and inspect the company's stock-item catalogue.

Include:
- SKU and barcode.
- Item name.
- Stock group.
- Item type.
- Unit of measure.
- Selling price, if authorized.
- Cost price, if authorized.
- Current stock by authorized branch.
- Reorder status.
- Expiry or serial-tracking indicators.
- Active/inactive status.

Provide keyword search, group filters, branch filters, item-status filters, sorting, pagination, and item-detail navigation.

## 4.2 Stock Transactions Enquiry Report

Purpose: Trace every stock movement.

Include:
- Transaction date and time.
- Stock item.
- Branch.
- Movement type.
- Quantity in and out.
- Previous and resulting balance where available.
- Reference number.
- Source document.
- User or system actor.
- Reason.
- Related order, receipt, adjustment, transfer, or audit.

Support date, branch, item, movement type, and reference filters.

The report must read the append-only stock movement history. Do not reconstruct history from the current balance.

Where reversal entries exist, display the original movement and its reversal relationship.

## 4.3 Stock Quantities Report

Purpose: Report current stock levels.

Include:
- Item.
- SKU.
- Group.
- Branch.
- Expected on-hand quantity.
- Reserved quantity, if implemented.
- Available quantity, calculated according to the actual reservation model.
- Unit of measure.
- Reorder level.
- Reorder status.
- Last movement date.

Support summary by group, detailed item-level views, and branch comparison.

Do not mix kilograms, units, bottles, milliliters, and other incompatible units in a single unlabelled total.

## 4.4 Selling Prices Report

Purpose: Review authorized product selling prices.

Include:
- SKU and item name.
- Stock group.
- Branch or applicable price list.
- Selling price.
- Currency.
- Tax treatment.
- Effective date, where supported.
- Active status.

Provide filtering, sorting, authorized export, and optional price-change history.

Do not permit this report to change prices unless the user also has the required price-edit permission.

If branch-specific prices are not currently implemented, document that limitation and implement the report using the existing price model rather than inventing branch-specific records.

## 4.5 Cost Prices Report

Purpose: Review stock acquisition costs.

Include:
- SKU and item.
- Supplier where recorded.
- Last purchase cost.
- Current configured cost.
- Moving-average cost, where maintained.
- Currency.
- Last receipt date.
- Branch or stock location where applicable.

Define which cost measure is displayed in each column. Do not substitute selling price for cost price or imply that all cost fields are interchangeable.

Enforce cost-view permissions on the API, export, and drill-down endpoints.

## 4.6 Stock Performance Report

Purpose: Measure stock movement and sales performance.

Include:
- Quantity sold or consumed.
- Stock received.
- Stock transferred.
- Adjustments and waste.
- Current stock.
- Sales value where applicable.
- Cost of goods sold where reliably calculated.
- Turnover or depletion rate.
- Period-over-period comparison.

Support item, group, branch, and date filters.

Clearly distinguish:
- Sales performance.
- Inventory movement.
- Recipe ingredient consumption.
- Financial margin.

Do not count an ingredient's recipe consumption as a separate retail sale.

## 4.7 Out of Stock Report

Purpose: Identify items with no available stock.

Include:
- Item and SKU.
- Branch.
- Current expected quantity.
- Available quantity if reservations are supported.
- Last stock movement.
- Last sale.
- Supplier.
- Reorder threshold.
- Pending purchase orders.

Define the out-of-stock condition based on the existing stock model.

Allow authorized users to navigate to the item, initiate replenishment, or open a purchase-order draft.

Do not classify every inactive product as an out-of-stock item.

## 4.8 Stock Re-Order Report

Purpose: Identify replenishment requirements.

Include:
- Item.
- Branch.
- Current stock.
- Reorder threshold.
- Target stock.
- Pending inbound quantity.
- Suggested reorder quantity.
- Supplier.
- Estimated cost where available.
- Suggested purchase order status.

Use an explainable calculation based on configured reorder levels, target stock, and pending receipts.

Where supported, include sales velocity and estimated days of stock remaining.

Do not create or send purchase orders merely by viewing the report.

Allow an authorized user to select items and generate a purchase-order draft through the existing purchasing workflow.

Respect approval requirements and idempotency.

## 4.9 Stock Take Report

Purpose: Manage physical stock counts and reconcile differences.

Support:
- Start an authorized stock-take session.
- Select branch and stock items.
- Capture a stock snapshot at a defined time.
- Record physical counts.
- Support blind counts when configured.
- Save incomplete counts.
- Identify missing and unexpected items.
- Calculate expected quantity, counted quantity, and variance.
- Record explanations.
- Submit for review.
- Approve or reject reconciliation.
- Commit approved corrections through the stock movement service.
- Preserve stock-take history.

Use explicit states, for example:
`Draft`, `Counting`, `Submitted`, `Approved`, `Rejected`, `Reconciled`, `Cancelled`.

Prevent duplicate reconciliation and unsafe changes to finalized sessions.

Where stock continues moving during a count, use a consistent snapshot and cutoff strategy. Document how subsequent movements are handled.

## 4.10 Stock Value Report

Purpose: Calculate inventory valuation.

Include:
- Item.
- Branch.
- Stock group.
- On-hand quantity.
- Valuation unit.
- Unit cost.
- Extended stock value.
- Total by group and branch.
- Grand total in the applicable currency.

Use the existing costing policy, such as moving-average cost, where implemented.

Do not use retail selling prices as inventory cost unless a specifically named retail-value calculation is being presented.

Document how negative stock, zero-cost items, missing costs, and multiple currencies are handled.

Prevent unauthorized access to valuation data.

## 4.11 Items History Report

Purpose: Provide a historical view of a stock item.

Include:
- Item identification.
- Stock movements over time.
- Receipts and transfers.
- Sales-related consumption.
- Adjustments.
- Audits and reconciliations.
- Returns and reversals.
- Relevant user or system actor.
- Reference documents.
- Historical balance where it can be reliably calculated.

Support item, branch, and date filters.

Preserve chronological traceability. If the system cannot reconstruct a historical balance reliably, state that limitation rather than displaying a fabricated balance.

## 4.12 Stock Labels Printing

Purpose: Generate and print stock labels.

Support:
- Select items.
- Enter print quantities.
- Preview labels.
- Barcode and SKU.
- Product name.
- Optional price.
- Optional stock group.
- Optional batch, expiry date, or serial number.
- Configurable label dimensions.
- Printer-friendly layouts.
- Appropriate barcode formats supported by the application.

Provide permission checks for displaying prices or sensitive information on labels.

Validate barcode data and generate printable output using a consistent library or established implementation.

Do not claim a physical label has been printed when the browser has only generated a print view or downloaded a document.

Support browser printing and, if needed, a clearly defined printer integration.

## 4.13 Stock Expiry Report

Purpose: Track expiry-sensitive inventory.

Include:
- Item.
- Batch or lot.
- Branch.
- Expiry date.
- Quantity remaining.
- Days until expiry.
- Expired, expiring soon, and safe-to-stock classifications.
- Supplier and receipt reference where available.

Provide configurable expiry warning periods and filters.

Do not invent batch-level expiry dates for products that do not have recorded expiry information.

Support navigation to receiving, stock adjustment, or approved disposal workflows.

Expired stock must not be silently deleted from inventory.

## 4.14 Web Store Stock Report

Purpose: Compare internal stock with online-store availability.

First inspect the existing web-store integrations and catalogue model.

If an online store or integration exists, report:
- Internal stock.
- Store-listed quantity.
- Available-to-sell quantity.
- Reserved quantity where supported.
- Listing status.
- Synchronization status.
- Last synchronization time.
- Discrepancies and failed synchronization messages.

If no web-store integration is implemented, build the report around an explicit integration boundary and clearly report the integration as unconfigured. Do not fabricate online quantities or successful synchronization.

Where web-store quantities are managed, apply the existing reservation and stock-availability rules to prevent overselling.

Implement retry-safe synchronization if supported by the existing integration.

## 4.15 Stock Aging Report

Purpose: Show how long inventory has been held.

Include:
- Item.
- Branch.
- Quantity.
- Cost value where authorized.
- Receipt or batch date.
- Age in days.
- Configurable aging buckets.
- Last sale or movement.
- Slow-moving and potentially obsolete indicators.

Prefer batch or receipt-level costing data where available.

If the application only has current aggregate balances, disclose the aging method and its limitations. Do not claim FIFO aging precision without the necessary receipt-layer data.

## 4.16 Serial Numbers Report

Purpose: Track uniquely identified stock items.

Include:
- Serial number.
- SKU and product.
- Branch or location.
- Status.
- Receipt reference.
- Sale or dispatch reference.
- Transfer history.
- Return status.
- Warranty details if implemented.
- Last movement.

Support serial-number search and filters.

Enforce uniqueness at the appropriate tenant or product scope and validate permitted status transitions.

If serial tracking is enabled for an item, require the necessary serial information at receipt, transfer, sale, and return operations.

Do not create meaningless serial numbers for ordinary bulk inventory.

---

# PART 5 — REPORT ENGINE, FILTERS, EXPORTS, AND PERFORMANCE

Build a reusable report framework for the POS and Stock reports.

## 5.1 Shared report interface

Provide:
- Page title and explanation.
- Breadcrumbs.
- Date-range selector where relevant.
- Branch selector constrained to authorized branches.
- Search and filters.
- Apply and reset actions.
- Loading, empty, and error states.
- Summary metrics where meaningful.
- Sortable data grid.
- Pagination.
- Column visibility where appropriate.
- Refresh action.
- Print or export actions subject to permissions.
- Clear indication of applied filters.
- Generated-at timestamp.
- Currency and unit labels.

Preserve the user's filters during permitted drill-down and navigation.

Use the company's time zone for date filters and display while storing timestamps in UTC.

Do not load the entire dataset into the browser to calculate reports.

## 5.2 Backend report queries

Implement report queries in the business/service layer with DTOs specifically designed for each report.

Use:
- Server-side filtering.
- Server-side aggregation.
- Pagination.
- Appropriate indexes.
- Projection into DTOs.
- Asynchronous database access.
- Cancellation tokens where supported.
- Query limits and validation.

Avoid loading complete entity graphs when a report only requires a few fields.

Review execution plans and indexes for high-volume transaction and movement tables where appropriate.

All financial report calculations must use the same documented business rules as their underlying transactions.

## 5.3 Exports and printing

Support CSV or Excel export if the existing application supports the required library and format. Add PDF only where justified.

Exports must:
- Use the same filters and authorization as the visible report.
- Enforce tenant and branch isolation.
- Respect sensitive-field permissions.
- Protect against spreadsheet formula injection in exported text.
- Apply reasonable row and file-size limits.
- Record sensitive export events where required.

Do not return an unrestricted export endpoint that bypasses the report's normal permissions.

---

# PART 6 — BACKEND AND DATABASE WORK

## 6.1 Inspect before creating entities

The existing backend already includes:
- Company and tenant scoping.
- Branch authorization.
- POS orders, order lines, payments, refunds, and receipts.
- Inventory balances and stock movements.
- Stock adjustment and audit functionality.
- Product catalogue and recipes.
- Subscription entitlements.
- Append-only audit records.
- Idempotent offline synchronization.
- Platform-operator functionality.

Inspect the actual entity and service implementations. Extend existing functionality rather than duplicating it.

## 6.2 Services

Use the established service-registration conventions.

Potential service extensions include:
- POS shift service.
- Sales reporting service.
- Stock reporting service.
- Stock group maintenance service.
- Stock maintenance service.
- Stock take service.
- Stock label generation service.
- Web-store stock reporting or integration service.

Only create a new service when the functionality does not already exist or when a distinct responsibility is required.

Maintain the dependency direction:

`API -> Business -> Data -> Common`

Controllers should remain thin and must not contain business calculations or direct database mutation logic.

## 6.3 Database changes

For every new entity or property:
- Add EF Core configuration.
- Add the appropriate migration.
- Define indexes and constraints.
- Enforce tenant ownership.
- Configure required relationships.
- Apply concurrency controls.
- Define archival or immutable-history behavior.
- Add test coverage.

Use the established global tenant query filter and fail-closed behavior.

Never use `IgnoreQueryFilters()` merely to make a report easier to implement. If an exceptional cross-tenant query is necessary, require an explicit tenant predicate and the correct platform-operator authorization.

Do not modify or delete append-only `StockMovement`, `AuditLog`, `EntitlementLedgerEntry`, or `PlatformAuditEntry` records. Represent corrections as new linked records.

## 6.4 API response and error conventions

Follow the existing `Response<T>` envelope and `ErrorCodes`.

Return meaningful validation, authorization, conflict, and not-found responses.

Ensure:
- Invalid filters are rejected.
- Invalid date ranges are rejected.
- Unknown branch IDs cannot broaden access.
- Concurrent changes return a clear conflict.
- Duplicate operations remain idempotent.
- Missing optional integrations are reported accurately.
- Exceptions do not leak sensitive internal details.

## 6.5 Permission catalogue and parity

For every new protected feature:
1. Add or reuse the backend permission key.
2. Add appropriate seeded role defaults.
3. Integrate with the authorization handler.
4. Update frontend permission models.
5. Update navigation metadata.
6. Add backend authorization tests.
7. Update contract-parity tests.

Suggested additional permission keys, subject to existing conventions:

POS:
- `pos.day.view`
- `pos.day.open`
- `pos.day.close`
- `pos.day.review`
- `reports.income.view`
- `reports.daily_sales.view`
- `reports.staff_sales.view`
- `reports.stock_group_sales.view`
- `reports.sales_analysis.view`
- `reports.multi_currency.view`

Stock:
- `inventory.items.view`
- `inventory.items.manage`
- `inventory.groups.view`
- `inventory.groups.manage`
- `inventory.global.manage`
- `inventory.stock.adjust`
- `inventory.stock.adjust.approve`
- `inventory.reports.items.view`
- `inventory.reports.transactions.view`
- `inventory.reports.quantities.view`
- `inventory.reports.selling_prices.view`
- `inventory.reports.cost_prices.view`
- `inventory.reports.performance.view`
- `inventory.reports.out_of_stock.view`
- `inventory.reports.reorder.view`
- `inventory.stocktake.view`
- `inventory.stocktake.perform`
- `inventory.stocktake.approve`
- `inventory.reports.value.view`
- `inventory.reports.history.view`
- `inventory.labels.print`
- `inventory.reports.expiry.view`
- `inventory.reports.web_store.view`
- `inventory.reports.aging.view`
- `inventory.reports.serial_numbers.view`
- `reports.export`

Use the existing dotted-key conventions and avoid duplicating permissions that already provide equivalent protection.

Do not treat the suggested list as a requirement to create redundant keys. Document the final mapping between each screen, action, permission, and subscription module.

---

# PART 7 — SUBSCRIPTION ENTITLEMENTS

Integrate each feature with the existing entitlement engine.

Review the existing module catalogue before assigning features. Do not automatically create a separate subscription module for every report.

Use the existing core POS and inventory entitlements where appropriate. Add new module keys only when there is a genuine commercial or operational reason.

For each feature, define:
- Required module.
- Behavior when the module is fully enabled.
- Behavior when access is read-only.
- Behavior when access is denied.
- Whether historical data remains accessible.
- Whether an upgrade prompt is appropriate.

Maintain the existing server-side enforcement order: tenant, membership, branch, live permission, workspace restriction, and module entitlement.

A hidden navigation item is not proof that the backend is protected.

The account restriction banner must continue to appear as designed. Subscription lockouts must not destroy historical report data or bypass the authorized billing recovery workflow.

---

# PART 8 — FRONTEND IMPLEMENTATION

## 8.1 Angular standards

Use Angular 18 standalone components, signals, strict TypeScript, strict templates, `OnPush`, Tailwind design tokens, and existing RxJS HTTP patterns.

Use existing shared components for:
- Data grids.
- Forms.
- Dialogs.
- Confirmations.
- Toasts.
- Search and filtering.
- Branch selection.
- Theme handling.
- Account restriction banners.

Do not introduce a second state-management approach without a clear architectural need.

## 8.2 Navigation behavior

Implement:
- Expandable POS and Stock groups.
- Active-route highlighting.
- Accessible keyboard navigation.
- Responsive sidebar behavior.
- Tooltips for icons.
- Permission-aware menu rendering.
- Entitlement-aware menu rendering.
- Clear upgrade links for locked modules.
- Breadcrumbs.
- Searchable navigation if consistent with the existing shell.

A user must not see management menus simply because their account is authenticated.

A user who lacks permission for all children of a group should not see the empty group unless the design intentionally provides an authorized landing screen.

Do not display broken links for inaccessible features.

## 8.3 Route and guard behavior

Use the established guard order.

Preserve:
- Authentication and session restoration.
- Workspace lock.
- Screen-level RBAC.
- Subscription gating.

A user who enters a URL manually must receive the appropriate redirect or access-denied state. The backend remains the security boundary.

Ensure the default `/app` landing screen selects the first screen the user is actually permitted to access.

## 8.4 Theme compatibility

All new screens must use the existing ZestPoint theme variables.

Do not introduce hard-coded colors that break the CEO's saved branding.

System alerts must retain their protected system colors, and report tables, chart labels, dialogs, and print layouts must remain legible in supported themes.

---

# PART 9 — TESTING AND ACCEPTANCE CRITERIA

Use the existing xUnit backend tests and Playwright frontend tests. Add tests using the established testing infrastructure.

Run backend tests one process at a time because the existing LocalDB-backed test environment can stall when concurrent hosts run.

## 9.1 Navigation tests

Verify:
- Every required menu entry is present for an appropriately privileged administrator.
- POS and Stock are separate navigation groups.
- The menu order matches the required screenshot.
- Every menu entry opens its intended route.
- No duplicate route or duplicate feature ID exists.
- Keyboard shortcuts work only when the user is in the appropriate application context.
- Unauthorized users cannot reveal restricted screens by entering URLs manually.
- The default landing route is valid for each test role.

## 9.2 RBAC tests

Create test users with different combinations of permissions.

Verify:
- A cashier can sell without automatically seeing financial reports.
- A cashier cannot access cost-price or stock-adjustment APIs without permission.
- A supervisor can access only the explicitly granted reports and actions.
- An inventory manager can manage permitted stock functions without automatically accessing financial reports.
- An accountant can access permitted reports without automatically gaining stock-edit privileges.
- A custom role follows its assigned permissions.
- Removing a permission invalidates effective access within the established refresh/invalidation period.
- Cross-tenant and unauthorized-branch requests fail.

Test both the frontend and direct HTTP API calls.

## 9.3 POS and day-management tests

Verify:
- Opening a shift records the correct user, terminal, branch, and opening float.
- Duplicate active shifts are rejected where prohibited.
- Cash movements update expected cash correctly.
- Closing calculates expected cash from recorded transactions.
- Actual cash and variance are persisted.
- Required approvals are enforced.
- Closed shifts cannot be closed or settled twice.
- Offline queue retries do not duplicate transactions.

## 9.4 Reporting tests

For each report, seed known source records and verify the calculated output.

Include:
- Date boundaries and time zones.
- Branch filters.
- Product and stock-group filters.
- Refunds and voids.
- Pending payments.
- Multiple currencies.
- Negative stock.
- Missing cost data.
- Historical group changes.
- Reversed stock movements.
- Empty datasets.
- Pagination.
- Restricted sensitive columns.
- Export permissions.

Verify that report totals reconcile with their source transactions and stock movements.

## 9.5 Stock-operation tests

Verify:
- Item creation and modification.
- Stock-group creation and deactivation.
- Global maintenance remains tenant-scoped.
- Stock adjustments create append-only movements.
- Unauthorized adjustments are rejected.
- Approval separation of duties is enforced.
- Stock takes cannot be reconciled twice.
- Concurrent stock updates do not silently lose changes.
- Labels contain valid item data.
- Expiry reports use recorded expiry data.
- Stock-aging calculations follow the documented method.
- Serial numbers obey uniqueness and lifecycle rules.
- Missing web-store integration is reported honestly.

## 9.6 Subscription tests

Verify:
- Entitlement restrictions hide the relevant menu items.
- The backend rejects locked-feature requests.
- Read-only modules reject unsafe operations.
- Restricted tenants retain the allowed billing-recovery route.
- Existing historical data remains intact.
- Subscription restoration re-enables eligible modules.
- The entitlement ledger records changes.

## 9.7 Regression tests

Run:
- `dotnet test ZestPoint.Tests`
- The existing frontend build and lint commands.
- `npx playwright test`

Inspect the actual package scripts before assuming command names or adding dependencies.

Run the real-stack E2E tests using the existing test API port, test database, Angular E2E configuration, and proxy setup documented in the architecture.

Do not modify personal development environment files to make tests pass.

Fix regressions caused by this implementation. Record unrelated pre-existing failures separately.

---

# PART 10 — IMPLEMENTATION AND DELIVERY SEQUENCE

Work in verifiable phases.

### Phase 1: Source inspection
- Read the architecture, constitution, findings, and delivery documents.
- Inspect current routes, navigation, permission definitions, entities, reports, stock services, and tests.
- Identify which requested features already exist.
- Produce a gap matrix mapping each menu entry to its current implementation and missing work.

### Phase 2: Navigation and permission foundation
- Update the shared navigation configuration.
- Add missing route metadata.
- Update permission keys and contract-parity tests.
- Verify role-specific navigation and guard behavior.

### Phase 3: POS day management
- Complete shift opening, closing, cash reconciliation, and approval workflows.
- Connect the frontend to real APIs.
- Add database migrations only where necessary.

### Phase 4: POS reports
- Implement or complete all six requested reports.
- Add report DTOs, filters, aggregation queries, authorization, and UI.
- Verify totals against source transactions.

### Phase 5: Stock maintenance
- Complete item maintenance, group maintenance, global maintenance, and quantity adjustments.
- Ensure all stock changes use the established stock movement service.

### Phase 6: Stock reports
- Implement all sixteen stock reports.
- Reuse shared report infrastructure while preserving each report's specific business rules.
- Complete exports and label printing where supported.

### Phase 7: Subscription and security verification
- Map features to the existing entitlement catalogue.
- Verify locked, read-only, and full-access behavior.
- Test tenant and branch isolation.

### Phase 8: End-to-end validation
- Run migrations against a clean test database.
- Run unit and integration tests.
- Run Playwright against the real frontend and backend.
- Resolve all failures caused by the implementation.
- Update architecture and delivery documentation.

After each phase, summarize:
- Features completed.
- Files created or changed.
- Database changes.
- API endpoints added or modified.
- Tests executed and results.
- Remaining blockers.

Continue implementing after the initial inspection. Do not stop after generating a plan.

---

# PART 11 — FINAL DEFINITION OF DONE

The work is complete only when:

1. All eight POS navigation entries are implemented.
2. All twenty Stock navigation entries are implemented.
3. The menu structure follows the supplied screenshots.
4. A cashier's selling permission does not grant access to every POS or Stock screen.
5. Each screen has explicit permission and entitlement metadata.
6. Every protected API enforces tenant, branch, permission, and applicable entitlement rules.
7. All report totals come from real data and follow documented calculations.
8. Stock-changing operations use the established atomic stock service and append-only movement history.
9. Shift, stock-take, approval, and adjustment workflows persist their states correctly.
10. Reports support the required filters, pagination, and permitted export/printing.
11. Subscription restrictions work on the backend as well as in the frontend.
12. Existing offline-first POS behavior remains intact.
13. Database migrations run successfully in the existing test environment.
14. The automated tests pass, or remaining pre-existing failures are explicitly documented.
15. Architecture, permission mappings, and delivery documentation are updated.
16. No requested menu item is falsely marked complete when it only contains a placeholder.

**Final instruction:** Inspect first, implement the missing functionality in the existing architecture, verify every route and API, run the tests, and document the evidence of completion. Do not claim a feature is complete unless its behavior has been tested.