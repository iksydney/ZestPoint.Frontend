# ZestPoint Frontend: Architecture

> Repo: `ZestPointDashboard/ZestPoint.Frontend/` (Angular 18). Last reviewed: 2026-10-14 (after Phases 1-7 of `Firstprompt.md` and the POS/Stock/Purchasing navigation of `POSContinuum.md`, section 12).
> Sister repos: **Backend** `../../ZestPoint/architecture.md`, **Mobile** `../../ZestPointMobile/architecture.md`.
> Shared rules live in `constitution.md`; defects and gaps are logged in `../../findings.md`. Delivery summary and run instructions: `../../ZestPoint/DELIVERY.md`.

## 1. Purpose

One Angular single-page app, one origin, one port (`ng serve` -> `:4200`) containing:

1. the **public marketing site** (`/`, `/features`, `/pricing`, `/contact`, `/privacy`, `/terms`) for hospitality **and retail**; its forms post to the real API;
2. **registration, sign-in and onboarding** (`/register`, `/login`, `/accept-invite`, `/onboarding`). Registration step 1 picks the main business type plus optional extra types; step 2 picks the default currency and which extra wallets (USD, CNY, JPY, NGN; `WALLET_CURRENCIES` mirrors the API) to open. Continue / Create stay disabled until the step is valid, but never silently: each field shows its own message under it once visited, and a "Still needed: ..." / "Waiting for the address availability check" status beside the button names what is missing or pending (local checks are UX only; the server re-validates on register and its field errors replace the local ones). `/register` and `/accept-invite` have no venue theme yet, so they follow the public light/dark choice (OS setting until the visitor picks, shared with the marketing site, Sun/Moon switch in the header; `PublicThemeService.attach(true)` adds `zp-entry` to `<html>` and `styles.scss` swaps the colour tokens for an AA-checked light set); sign-in stays venue-driven (FND-075). `/accept-invite` asks for the default PIN from the invitation e-mail once, then a new PIN;
3. the **signed-in application** under `/app` (dashboard, POS, inventory, catalogue, staff and roles, branding, branches, operations settings, subscription), gated by authentication, screen-level RBAC, the workspace lock and module entitlements;
4. the **platform operator interface** under `/platform` (a separate sign-in: overview, companies, plans).

The browser only shapes the experience. **Every rule is enforced again by the API**; hiding a button or redirecting a route is a convenience, never a control.

## 2. Stack

Angular 18 (standalone components, signals, new control flow, `OnPush`), TypeScript strict + `strictTemplates`, Tailwind CSS 3 with CSS-variable tokens, RxJS for HTTP only, **Dexie (IndexedDB)** for the offline queue, `lucide-angular` icons, Playwright for end-to-end tests. No unit-test runner is configured (see FND-037).

## 3. Directory map

```
src/app/
  app.routes.ts            route table and guard order (section 4)
  core/
    guards/                auth, landing, onboarding, screen-rbac, subscription-gate, workspace-lock, platform
    interceptors/          jwt (bearer + one refresh retry; platform token for /api/v1/platform), api-base-url
    models/                api.model (session), rbac.model (permission + module keys), staff.model, ops.model (POS/inventory),
                           subscription.model (plans, entitlements, platform) - all mirror backend DTOs
    services/              auth (session in memory), theme, branch-context, pos-store (offline-first POS state), sync-agent,
                           offline-db (Dexie), ops.services / staff.services / subscription.services / domain.services (API clients)
    offline/order-calc.ts  local mirror of the server's order maths (display only while offline; the server recomputes)
    hardware/scale.ts      scale abstraction: Web Bluetooth adapter, demonstration adapter; manual entry is a form
    navigation/               app-nav.ts = the ONE typed list of screens (menu, routes, landing, breadcrumbs, search, quick access all read it); report-definitions.ts = filters per report
    pipes/tenant-time.pipe UTC -> the company's time zone
    theme/                 colour maths and token generation
  shared/ui/               dialog/toast/confirm, ui kit, search-select, account banner, branch picker + sync status
  features/
    registration/ onboarding/ branding/ system/ shell/        entry flows, theme editor with live preview, login, app frame, dashboard
    pos-billing/ inventory/ catalog/ settings/                 point of sale, inventory console (stock, purchasing, audits, usage and variance), catalogue and recipes, operations settings
    staff-rbac/ subscription/ platform/                        staff, roles and audit; subscription and billing; operator interface
  public/                  marketing site (self-contained, `.zp-public` styles)
```

## 4. Routing and guard order

`/app` runs `authGuard` (restores the session from the refresh cookie first) then `workspaceLockGuard` (restricted company: only the subscription screen, or `/restricted` for staff without `subscriptions.view`). Each screen then runs `screenRbacGuard` (permission) and `subscriptionGateGuard` (module `locked` -> `/upgrade?feature=...`, which names the module and says who can change it). `/app` itself redirects to the first screen the person may use. `/platform/**` needs an operator session held in memory only (a reload returns to the operator sign-in).

## 5. Session, RBAC and entitlements

`AuthService` keeps the access token and the session snapshot in signals (never web storage); the refresh token is an httpOnly cookie, so a reload calls `restore()`. A network failure during refresh does **not** sign the person out (the POS keeps working offline). The snapshot (permissions, branch ids, per-module access, subscription state with the account banner) is **UX only**; `auth.reload()` refreshes it after any billing action. Permission and module keys live in `rbac.model.ts` and are checked against the backend by a contract-parity test.

The **account banner** (`zp-account-banner`) shows on every signed-in screen: what is wrong or coming, the affected modules, the reason and the next step ("Update payment", "Choose a plan"), in fixed system colours that are never themed. People who cannot manage billing see the message and who to ask.

## 6. Theming

The saved company theme is applied as CSS variables (`--primary-rgb`, ...) by `ThemeService` and used by every screen through Tailwind tokens (`bg-primary`, `text-ink`, ...). The branding editor previews a **draft** by scoping the same variables onto the preview frame (`themeVariables()` is the one function for both), so unsaved colours never leak to other sessions. System alerts (`.sys-alert`) and the marketing site (`.zp-public`) are deliberately outside the tenant theme.

## 7. Offline-first POS (Phase 5)

`PosStore` applies every sale-floor change to the bill on screen immediately and appends a matching operation to the Dexie queue; `SyncAgentService` replays the queue through `POST /api/v1/sync` (in order, idempotent by client operation id) when online, on reconnect and every 15 s, and the server's figures then replace the local ones.

- Queue rows are tied to the **tenant and the signed-in member**; only that member's operations are ever sent (the server authorises them as the sender). A rejected operation stays visible under "not accepted" with the server's reason and is never silently dropped.
- Works offline: open a bill, add/change/remove items, send, discount, tip, take **cash**, request a void, stock adjustments and scale/manual measurements (into an audit that already exists on the server). Needs the server (and says so): card/transfer payments, split, merge, move table, refunds, receipts, starting an audit, purchasing.
- The catalogue, tax settings and branches are cached for offline use. A reload while offline needs a prior online session (FND-025).
- Scale audits: `ScaleService` offers the Bluetooth adapter (standard Weight Scale service only), a clearly labelled **demonstration** scale, or typed entry (`Manual`). Readings are recorded with their true source; a weight becomes millilitres only if the item has a density.

## 8. Subscription and platform screens

`/app/subscription` shows plan and status, the renewal/grace dates in the company time zone, usage against limits, per-module access with upgrade hints, plan comparison and change, payment method (development tokens are explained on screen), pay now, cancel/resume, billing history and the entitlement ledger. `/platform/*` lets an operator find companies, see their subscription, ledger and usage, act on them (every action needs a written reason) and edit plans.

## 9. Testing

`npx playwright test` drives the real stack: the API on `:5250` against `ZestPoint_E2E` (LocalDB) and `ng serve --configuration e2e` on `:4300` through `proxy.e2e.conf.json` (the `e2e` configuration swaps in `environment.e2e.ts`, so your own `.env.*` files are never touched). Suites: registration/branding, staff/RBAC, POS and inventory (including offline), subscription and platform, dashboard and receipts, public forms. Edge is the only browser. Before the first e2e run on a database with many old companies, start the API once (the subscription backfill can take a minute).

## 10. Environment

`npm start` runs `scripts/generate-env.mjs` to write `src/environments/environment.ts` from `.env.development` (API base URL, site URL); production builds read `.env.production`. Nothing secret belongs in either file.

## 11. Known gaps

See `../../findings.md` and the "What is not built" list in `../../ZestPoint/DELIVERY.md`.

## 12. Navigation groups, report screens and stock screens

- **One list** (`core/navigation/app-nav.ts`): every screen has a stable `key`, label, route, icon, permission(s), module, group (`pos`, `stock`, `purchasing`), optional legacy `shortcut`, `needsBranch`, `quickAccess` and a lazy `load`. `app.routes.ts` builds the route table from the entries that have `load` (guards: `screenRbacGuard`, then `subscriptionGateGuard`), the sidebar and landing guard filter the same list by permission and module, the shell derives breadcrumbs from it, and the dashboard shows the `quickAccess` entries. Screens keep their original hand-written routes (dashboard, inventory console, catalogue, subscription, staff, settings). Authorisation never reads a label or a shortcut.
- **Menu** (`shared/ui/nav-sidebar.component.ts`): expandable groups (the group holding the current screen is always open), active-route highlight, search, arrow/Home/End keys, legacy keys that fire **only while focus is on an entry inside that group's list**, tooltips, an off-canvas drawer on phones. Locked modules and refused screens are not shown; typed URLs are refused by the guards and the API.
- **Report screens** (`features/reports/`): `ReportViewComponent` renders any report from its `ReportDefinition`: only the filters that report supports, server sorting and paging, summary figures, applied-filter chips, generated-at and currency, column visibility, loading/empty/error states, calculation notes, CSV export (shown only with `reports.export`), print, and filters kept in the URL (refresh/back/drill-down keep them). It never calculates a figure. Row actions come from a template the host supplies (serial numbers) and the re-order report offers selection to create purchase-order **drafts** (grouped by supplier and branch; nothing is sent or approved).
- **Workflow screens**: Start / End of Day (`pos-billing/day-management`), Add / Modify Stock, Stock Groups, Global Maintenance (preview then apply), Adjustments (request/approve/reject/cancel, reasons), Stock Take (counts, blind mode, review, reconcile; plus the variance report tab), Labels (Code 128 / EAN-13 drawn from `core/barcode.ts`; the screen only opens the browser print dialog and says it cannot know whether anything printed), Serial Numbers, Purchasing orders (reuses the existing tab), Suppliers, Supplier Payments. Mutating calls carry client-generated idempotency keys; every screen shows read-only mode and server errors.
- **Contract**: `core/models/nav-ops.model.ts` and `ops.model.ts` mirror the backend DTOs; `rbac.model.ts` mirrors the permission keys (parity-tested). Cost fields arrive as `null` for roles that may not see them and the screens hide those columns.
- **Tests**: `e2e/navigation.spec.ts` (10 tests: menu structure and order, all 43 entries opening, shortcuts and arrow keys, menu search, cashier denial and typed URLs, shift and supervisor review, groups/items/adjustments/stock take/labels, reports with filters/export/print, purchasing, phone drawer). Existing specs were updated for the new "Point of Sale" menu entry.
- **Offline shifts and serials**: `core/services/shift-store.service.ts` (`ShiftStore`) is online-first and falls back to the durable sync queue (`shift.*` kinds) with the shift cached in Dexie; Start / End of Day shows `day-offline` and says expected cash is recalculated on sync. The till asks for a serial on products with `tracksSerials`, and the goods-receipt dialog takes serial numbers, supplier and purchase tax. The re-order screen sends one purchase-order idempotency key per supplier/branch group.

- **Support and the operator console**: company screen `features/support/support.component.ts` (`/app/support`, permission `support.view`/`support.create`, kept reachable while the workspace is locked). Platform screens under `features/platform/`: `platform-support` (queue and summary), `platform-ticket` (thread, internal notes, assignment, status, priority), `platform-customers` and `platform-customer` (CRM), `platform-users` (people care with a mandatory reason), `platform-operators` (Admin). `PlatformAuthService.can()` reads the permission list returned at sign-in to decide what the console shows; `platformPermissionGuard` turns back typed addresses; the server re-checks everything. Models in `core/models/support.model.ts`, calls in `core/services/support.services.ts`. e2e: `e2e/support-portal.spec.ts` (3 tests).


- **Purchase order workstation and receiving**: `features/purchasing/purchase-order-workstation.component.ts` (`/app/purchasing/orders/:id`, `new` starts a document; one route serves new and saved so the screen is not rebuilt mid-save), `goods-receiving.component.ts` (`/app/purchasing/orders/:id/receive`), `goods-receipt-view.component.ts` (GRN, second key, claim slip), `receiving-queue.component.ts`, `purchase-orders-page.component.ts` (document list), `supplier-dialogs.component.ts` (find or add a supplier without leaving the order), `features/inventory/bins.component.ts`. Arithmetic lives in `core/purchase-math.ts` (same worked examples as the server). Typography is Syne / Plus Jakarta Sans / JetBrains Mono (`font-syne`, `font-jakarta`, `font-data`); every colour is a venue theme token. Icons are inline SVG (`shared/ui/icon-paths.ts`, `zp-icon`), so nothing needs the network. Effects that write signals must pass `allowSignalWrites`; `track` expressions must not use `??` (Angular generates an undefined temporary).

