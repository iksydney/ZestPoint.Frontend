# CLAUDE.md

This repo is governed by `constitution.md` in this folder. **Read it before making any change and treat it as a guardrail**: Part 2 (Hard stops) is never overridden, and Part 3 (working loop and Definition of Done) is followed on every task. **Never assume: when anything is unclear, ask the owner in a modal question prompt before proceeding (Article 13).**

- How the system is built: `architecture.md`
- Out-of-scope bugs, defects and gaps go to `../../findings.md` (Article 11), not into TODOs.
- Contract changes (permission/feature codes, DTOs, routes, sync format) must be applied to every repo (Article 4).

## Navigation, guided tours and the manual (owner's rule, 2026-11-14; the manual added 2026-11-21)

The menu, the guided tours and the client manual are part of every screen. **Any change that adds, moves, renames or removes a screen, a menu entry, or a control that a tour step points at, or that changes how something the manual describes works (a flow, a right, a notification, a phone screen), must, in the same change:**

1. place the screen in the menu and give it its one-line explanation: `ZestPoint.Frontend/src/app/core/navigation/nav-layout.ts` (`NAV_AREAS`, `MENU_LABELS`, `NAV_HELP`);
2. bring the tour along: `ZestPoint.Frontend/src/app/core/tour/tours.ts`. Fix or add the steps, raise that tour's `version` by one, and add a `changes` entry for the new version saying what is new or has moved (people who already took the tour are shown only that);
3. bring the manual along: the chapter that describes it, in `ZestPoint.Frontend/src/app/features/help/chapters/` (assembled by `manual.content.ts`; how it is built is `ZestPoint.Frontend/architecture.md` section 15). Fix or add the words in plain language, checked against the code, and never describe what is not built (Hard stop 9). A new main screen gets its place in the chapter for the people who use it. A change that fixes or adds a limit updates the chapter **What ZestPoint does not do yet** and the "not yet" notes in the other chapters: a finding listed there that is fixed comes out. Retake the pictures of any screen whose look changed (`MANUAL_SCREENSHOTS=1 npx playwright test e2e/manual-screenshots.spec.ts`, which fills `public/manual/img`), and rebuild the PDF (`npm run manual:pdf`, which writes `public/manual/ZestPoint-Manual.pdf`) so that it matches the Help screen;
4. keep the checks green: `NavigationLayoutParityTests` (backend test project), `e2e/tour.spec.ts` (walks every tour on the real screens) and `e2e/help.spec.ts` (the manual's words, pictures, PDF link and layout). A new main screen gets its own tour.

Do not weaken or skip those tests to get a change through; if a tour step or a sentence in the manual can no longer be true, rewrite it.
