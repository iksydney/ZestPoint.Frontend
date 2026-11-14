# CLAUDE.md

This repo is governed by `constitution.md` in this folder. **Read it before making any change and treat it as a guardrail**: Part 2 (Hard stops) is never overridden, and Part 3 (working loop and Definition of Done) is followed on every task. **Never assume: when anything is unclear, ask the owner in a modal question prompt before proceeding (Article 13).**

- How the system is built: `architecture.md`
- Out-of-scope bugs, defects and gaps go to `../../findings.md` (Article 11), not into TODOs.
- Contract changes (permission/feature codes, DTOs, routes, sync format) must be applied to every repo (Article 4).

## Navigation and guided tours (owner's rule, 2026-11-14)

The menu and the guided tours are part of every screen. **Any change that adds, moves, renames or removes a screen, a menu entry, or a control that a tour step points at must, in the same change:**

1. place the screen in the menu and give it its one-line explanation: `ZestPoint.Frontend/src/app/core/navigation/nav-layout.ts` (`NAV_AREAS`, `MENU_LABELS`, `NAV_HELP`);
2. bring the tour along: `ZestPoint.Frontend/src/app/core/tour/tours.ts`. Fix or add the steps, raise that tour's `version` by one, and add a `changes` entry for the new version saying what is new or has moved (people who already took the tour are shown only that);
3. keep the checks green: `NavigationLayoutParityTests` (backend test project) and `e2e/tour.spec.ts` (walks every tour on the real screens). A new main screen gets its own tour.

Do not weaken or skip those tests to get a change through; if a tour step can no longer be true, rewrite the step.
