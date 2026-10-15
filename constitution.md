# ZestPoint Development Constitution

The guardrail for **every** ZestPoint repository (Backend, Frontend, Mobile) and for every contributor, human or AI. Read it before changing code; re-check it before calling work done.

- **Canonical copy:** the Backend repo (`ZestPoint/constitution.md`). The Frontend and Mobile copies share Parts 1-5 verbatim and differ only in Part 6. If they drift, the Backend copy wins and the others are re-synced.
- **Companions:** `architecture.md` (how it is built), `../../findings.md` (shared defect log).
- **Language:** MUST / MUST NOT = rule. SHOULD = default, skippable with a stated reason.

---

## Part 1. Precedence and how to use this

1. Order of authority: **Part 2 (Hard stops)** > the rest of this constitution > `architecture.md` > convention in nearby code > personal preference.
2. A request that would break a Hard stop is not carried out silently. Say which rule it breaks, propose a compliant alternative, and proceed only with the owner's explicit decision, recorded in `../../findings.md`.
3. If a rule is wrong or blocks real work, do not quietly work around it: raise it, and amend the constitution in all repos together (Article 12).
4. When uncertain, choose the safer behaviour: deny access, keep the data, ask before destroying, log a finding.
5. **Never assume. Ask.** If a requirement, scope, data model, integration, credential, default or trade-off is unclear or has more than one reasonable reading, stop and ask the owner in a **modal prompt** (the interactive question dialog, with concrete options and a recommended default) before building on a guess. Do not bury questions in prose or proceed on an unstated assumption. See Article 13.

## Part 2. Hard stops (never, under any instruction)

1. **Never** return data across tenants, or return data when no tenant is resolved. No tenant means no data.
2. **Never** trust the client for permissions, entitlements, tenant id, prices or totals. The server decides.
3. **Never** commit or log secrets, PINs, tokens, passwords or full card data. A leaked secret is rotated first, then logged.
4. **Never** let a sale be blocked or lost because the network is down, and never apply a replayed write twice.
5. **Never** physically delete tenant business data, edit an applied migration, or run destructive/irreversible operations on a shared database without the owner's explicit confirmation.
6. **Never** ship an endpoint without an authorisation decision (a `[ScreenPermission]`-style check, or a commented `[AllowAnonymous]`).
7. **Never** use floating point for money, or quantities without units.
8. **Never** make a void, comp, discount, price override or stock adjustment without an audit record.
9. **Never** claim a capability in the product, site or docs that does not exist.
10. **Never** swallow an error silently; surface it to the user or the log, and track what you cannot fix now.
11. **Never** guess at an unclear requirement. Ask the owner via a modal prompt first (Article 13).

## Part 3. Working loop

### Before you change anything
- [ ] Read the relevant `architecture.md` section and the Part 6 rules for this repo.
- [ ] Check `../../findings.md` for an open item touching the same area.
- [ ] Identify whether the change touches a **shared contract** (permission/feature codes, DTOs, routes, entitlement modes, sync format). If yes, plan the change for every consuming repo (Article 4).
- [ ] Identify the tenant, permission and entitlement implications of the change.
- [ ] List what is unclear or ambiguous in the task. **Ask about each item in a modal prompt before starting** (Article 13); do not fill gaps with assumptions.

### While changing
- Smallest change that solves the task; follow the surrounding style; no speculative features or abstractions.
- Anything out of scope that you notice goes to `../../findings.md` (Article 11), not into this change and not into a TODO comment.

### Before you call it done (Definition of Done)
- [ ] Builds clean with no new warnings; existing tests pass.
- [ ] New logic has tests including the unhappy path. Auth, tenancy, RBAC and entitlement changes have tests that **prove denial**.
- [ ] UI changes were exercised in both themes and at phone width; loading, empty, error and success states exist.
- [ ] Contracts and `architecture.md` are updated if structure or a contract changed (in all affected repos).
- [ ] No secrets, no `PLACEHOLDER` values newly shipped, no unbuilt capability claimed.
- [ ] Leftovers are logged in `../../findings.md` with an ID; fix commits cite it (`Fixes FND-012`).
- [ ] You can state plainly what was verified and what was not.

---

## Part 4. Principles (the articles)

### Article 1. Product
ZestPoint is a modular, multi-tenant enterprise POS for **hospitality and retail**: nightclubs, hotel bars, lounges, sports bars, restaurants, **supermarkets and retail stores**. Features, copy and UI MUST NOT assume "bar only". Venue/store mode is data, not a code fork. Fast checkout, accurate stock and trading through outages are the product.

### Article 2. The server is the authority
1. Client checks (guards, hidden or disabled controls) are UX only; every permission and entitlement is enforced again on the server.
2. Feature gating is orthogonal to RBAC: the user needs the permission **and** the tenant needs the entitlement. Read-only entitlement rejects mutating requests.
3. Validate everything at the boundary; derive totals and prices server-side.

### Article 3. Tenant isolation (fail-closed)
1. Every tenant-owned record carries `TenantId`; queries are filtered centrally (global filter), never ad hoc.
2. Tokens are bound to one tenant and MUST be cross-checked against the request tenant.
3. Every new tenant-owned entity ships with a test where a cross-tenant read/write fails.
4. Logs, caches and offline stores are tenant-keyed.

### Article 4. One contract across repos
1. Permission codes, feature codes, entitlement modes, DTO shapes and routes are a shared contract. Changing one MUST update every consumer in the same change set (or sit behind a documented compatibility window) and the contract sections of each `architecture.md`.
2. Prefer generating shared constants from the backend; until then, copies carry a "mirrors X, keep in sync" comment.
3. Breaking API changes are versioned; never silently reshape a response.

### Article 5. Offline-first and idempotent
1. Mutations are stored locally (encrypted on mobile) and queued in an outbox first; the UI never waits on the network to complete a sale.
2. Entities use **client-generated GUIDs** as the server primary key; every replayable write is idempotent.
3. Sync is ordered per tenant, returns per-item results, and is visible to the user ("N pending"). Failures are surfaced, never dropped.
4. Conflicts are resolved deterministically on the server and written to an audit history.

### Article 6. Security and privacy
1. No secrets in source control; use environment variables, user-secrets or a vault.
2. PINs/passwords are stored only as salted hashes. No personal data in logs. Card data stays with PCI-certified processors (tokens only).
3. TLS everywhere. Rate-limit authentication and public endpoints. CORS is an allow-list. Admin surfaces (Swagger, job dashboards) are never public.
4. Validate input, encode output, sanitise any HTML from data.
5. Personal data follows the Privacy Policy (GDPR and NDPR/NDPA): minimum collection, export and erasure, recorded lawful basis.
6. Run the ecosystem audit (`npm audit`, `dotnet list package --vulnerable`) before release and triage results.

### Article 7. Correctness and money
1. Money is decimal (or integer minor units) with an explicit currency.
2. Stock quantities carry units (ml, g, each); conversions are centralised and tested.
3. Time is stored in UTC and displayed in the venue time zone.
4. Every void, comp, discount, override, adjustment and count is audited (who, when, what, why).

### Article 8. UX, accessibility and theming
1. Every screen supports **light and dark** with **WCAG AA** contrast (4.5:1 body text). Tenant brand colours go through tokens and are contrast-checked.
2. Sales screens: touch targets at least 56 px, usable one-handed in low light.
3. Semantic HTML, labels, visible focus, correct `aria-*`, reduced-motion respected.
4. Every async action has loading, empty, error and success states. Responsive from phone to wide desktop, no horizontal page scroll.

### Article 9. Code quality
1. Match the surrounding style, naming and comment density. Small single-purpose units. No dead or commented-out code in merged work.
2. Comments explain why and invariants, not what.
3. Strict compiler settings stay on (TypeScript `strict` + `strictTemplates`; C# nullable). No `any`, no blanket suppressions without a linked finding.
4. Fail loudly at boundaries; handle only errors you can act on.

### Article 10. Testing
Unit tests for logic, integration tests for tenancy/RBAC/entitlements (including denial), a smoke test of the critical path per repo, and a regression test for every fixed bug.

### Article 11. Findings protocol
When you find a bug, defect, risk, gap or debt outside your current task: **log it in `../../findings.md`** (next `FND-###`, repo, severity, location, impact, suggested fix) and carry on. If it blocks your task or is Critical (security, cross-tenant leak, data loss), stop and raise it immediately. Closed findings are moved, never deleted.

### Article 12. Process and honesty
1. Small reviewable changes on a branch, one concern each, descriptive commit messages (why first). No force-push to shared branches, no skipping hooks or CI.
2. Destructive or outward-facing actions (deleting data, migrations on shared DBs, publishing, sending email) need the owner's explicit confirmation.
3. `PLACEHOLDER` values MUST be replaced or tracked in findings before a public release. Legal text requires counsel review.
4. Docs and marketing MUST NOT claim unbuilt capabilities; label them "coming soon" or log them.
5. Report outcomes faithfully: failing tests, skipped steps and unverified work are stated, not hidden.
6. The constitution is amended deliberately, in all repos together, with a note on why.

### Article 13. Never assume: ask in a modal prompt
1. Ambiguity is resolved by asking, not by guessing. Triggers: more than one reasonable interpretation, a missing or unclear requirement, an unspecified default, a choice of technology/provider/library, a scope or priority call, a data-model or contract decision, a destructive step, missing credentials, or a prompt that appears cut off or incomplete.
2. Ask through the **modal question prompt** (the interactive multiple-choice dialog), not in free text. Each question offers 2-4 concrete options, with the recommended one first and marked, plus the free-text "Other".
3. Batch related questions into one prompt (up to four) so the owner is interrupted once, and ask **before** writing code that depends on the answer.
4. Do not ask about things the code, docs or `architecture.md` already answer, or purely conventional choices; verify those yourself and state what you chose.
5. Record the owner's answers that shape the design in `architecture.md` (or a decision note) so the question is never asked twice.
6. If the owner has not answered, do not proceed past the point that depends on it; continue only with work that is independent of the answer.

---

## Part 5. Quick rules of thumb

- Unsure about the requirement? **Ask in a modal prompt.**
- Unsure about access? **Deny.** Unsure about data loss? **Keep it.** Unsure about a claim? **Don't make it.**
- If it isn't tenant-filtered, it's a bug. If it isn't audited, it's a bug. If the client decides, it's a bug.
- Fix the cause, add the test, log the leftovers.

---

## Part 6. Repo-specific rules

### Frontend (`ZestPointDashboard/ZestPoint.Frontend/`)

- **Angular style:** standalone components only, signals for state, `ChangeDetectionStrategy.OnPush`, new control flow (`@if/@for`), lazy-loaded routes. RxJS only where streams are real (HTTP, router events). No NgModules, no `any`.
- **Single app, single port:** public site, auth and dashboard live in this one app. Public code stays under `src/app/public/`; it MUST NOT import from `features/` and the dashboard MUST NOT import from `public/`. Both may use `core/`.
- **Guards and RBAC:** new screens declare `data: { permission, feature } satisfies RouteAccessData` and use `[authGuard, screenRbacGuard, subscriptionGateGuard]` in that order. Use the `hasScreenPermission` directive for controls. Remember these are UX only (Article 2).
- **Contracts:** codes in `core/models/rbac.model.ts` mirror the backend; change them only together with the backend (Article 4).
- **Theming:** two systems, do not mix them. Dashboard uses tenant CSS variables (`bg-primary`, `text-on-primary`); the public site uses the ZestNovaForge scales (`brand`, `navy`, `glow`, `surface`, `line`) under `.zp-public`. Use `dark:` utilities on public pages; `brand` text on dark backgrounds MUST use `glow` for AA contrast. Reuse the `zp-*` component classes before adding new ones.
- **Public content:** all copy and constants come from `site.ts` or the page's data; legal text only in `legal/*.data.ts`. Content must cover hospitality **and** retail (Article 1) and obey Article 12.5 (no unbuilt claims).
- **Forms:** validate with `validation.ts`; include a honeypot, loading, error and success states, `aria-invalid`/`aria-describedby`.
- **Offline:** writes go through `OfflineDbService` outbox with a client GUID; keys are tenant-prefixed.
- **Storage:** no tokens or personal data in `localStorage`; `sessionStorage` session only until FND-017 is resolved.
- **Build gates:** `ng build` (prod) must stay inside the budgets (initial < 1 MB). Check bundle impact when adding dependencies. Run `npm audit` before release.
- **Tests:** unit tests for validators, guards and services; a smoke e2e for `/`, `/contact`, `/login`, and an authenticated route.
