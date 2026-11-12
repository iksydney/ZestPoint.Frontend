import { Injectable, computed, inject } from '@angular/core';
import { AccessSummaryDto } from '../models/access.model';
import type { NavDefinition } from '../navigation/app-nav';
import { AuthService } from './auth.service';
import { BranchContextService } from './branch-context.service';

const NONE: AccessSummaryDto = { deniedScreens: [], deniedActions: [], byBranch: {} };

/** The plain reason shown wherever something the organisation was not given is visible but unavailable. */
export const NOT_INCLUDED = 'Not included in your plan';

/**
 * What the signed-in organisation was (not) given below the module: screens and actions. The server decides and re-checks every call
 * (it answers 403 `not_entitled`); this is only the UX snapshot that hides withheld screens and disables withheld buttons.
 *
 * The snapshot lists only what is WITHHELD, because the default is allowed: an organisation nobody changed gets empty lists. Items of a module
 * that is off are not listed either (the module's own lock covers them). The branch the person is working at can change the answer, so the
 * organisation-wide lists are adjusted by that branch's differences.
 */
@Injectable({ providedIn: 'root' })
export class AccessService {
  private readonly auth = inject(AuthService);
  private readonly branches = inject(BranchContextService);
  private lastRefresh = 0;

  private readonly summary = computed<AccessSummaryDto>(() => this.auth.subscription()?.access ?? NONE);

  private readonly withheld = computed(() => {
    const s = this.summary();
    const screens = new Set(s.deniedScreens);
    const actions = new Set(s.deniedActions);
    const delta = s.byBranch[this.branches.activeId() ?? ''];
    if (delta) {
      delta.deniedScreens.forEach((k) => screens.add(k));
      delta.allowedScreens.forEach((k) => screens.delete(k));
      delta.deniedActions.forEach((k) => actions.add(k));
      delta.allowedActions.forEach((k) => actions.delete(k));
    }
    return { screens, actions };
  });

  screenAllowed(screenKey: string): boolean {
    return !this.withheld().screens.has(screenKey);
  }

  /** False when the organisation was not given this button (a permission code). Does not look at the person's role: that is `AuthService.hasPermission`. */
  actionAllowed(permission: string): boolean {
    return !this.withheld().actions.has(permission);
  }

  /** Whether a menu entry is offered: its module is not locked AND its screen was not withheld. Role permission is checked separately. */
  canShow(nav: NavDefinition): boolean {
    return !nav.feature || (this.auth.accessModeFor(nav.feature) !== 'locked' && this.screenAllowed(nav.key));
  }

  /**
   * Called when the server refuses a call as `not_entitled`: the snapshot is probably stale (an operator changed access since sign-in),
   * so it is re-read, at most once every ten seconds, and the menu and buttons correct themselves.
   */
  noteRefusal(): void {
    const now = Date.now();
    if (now - this.lastRefresh < 10_000) return;
    this.lastRefresh = now;
    void this.auth.reload().catch(() => { /* a failed refresh leaves the snapshot as it was */ });
  }
}
