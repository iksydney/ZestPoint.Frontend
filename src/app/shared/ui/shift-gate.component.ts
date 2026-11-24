import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { menuLabel } from '../../core/navigation/nav-layout';
import { NavService } from '../../core/navigation/nav.service';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { BranchContextService } from '../../core/services/branch-context.service';
import { ShiftPromptService } from '../../core/services/shift-prompt.service';
import { ShiftStore } from '../../core/services/shift-store.service';
import { BranchPickerComponent } from './ops-chrome.components';

/**
 * What stands in front of the Point of Sale for a person who sells or takes orders and has no shift running (owner's rule, 2026-11-15,
 * changed 2026-11-24: asked when the Point of Sale is opened, of everyone who sells or takes orders, not at sign-in).
 *
 * It takes the place of the till, so nothing of the till is built or reachable until the shift has started; the rest of the application stays
 * usable (the menu, search, the other screens), and there is always a plain way back and a way to sign out. Which of its four faces shows is
 * decided by `ShiftPromptService.gate`; the server still decides what it accepts.
 */
@Component({
  selector: 'zp-shift-gate',
  imports: [FormsModule, RouterLink, BranchPickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-bold">Point of sale</h1>
      <zp-branch-picker />
    </div>
    <div class="mx-auto w-full max-w-md" data-testid="shift-gate" [attr.data-state]="prompt.gate()">
      @switch (prompt.gate()) {
        @case ('start') {
          <form class="app-card space-y-3" aria-labelledby="shift-box-title" data-testid="shift-box" (submit)="$event.preventDefault(); start()">
            <h2 id="shift-box-title" class="text-lg font-bold">Start your shift</h2>
            <p class="text-sm text-ink/80">{{ name() }}, you have no shift running at {{ branches.active()?.name }}. Start it now so that what you sell, and the cash in your drawer, are recorded under your name.</p>
            <p class="text-xs text-ink/70" data-testid="shift-box-till">You do not choose a till: you are given the next free one when the shift starts.</p>
            <div>
              <label class="app-label" for="shift-box-float">Cash in the drawer now (opening float)</label>
              <input id="shift-box-float" type="number" inputmode="decimal" min="0" step="any" class="app-input" data-testid="shift-box-float" [ngModel]="float()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="float.set(+$event || 0)" />
            </div>
            <label class="flex items-start gap-2 text-sm"><input type="checkbox" class="mt-1" data-testid="shift-box-confirm" [checked]="confirmed()" (change)="confirmed.set(!confirmed())" /> <span>I have counted the drawer and this amount is right.</span></label>
            @if (error()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="shift-box-error">{{ error() }}</p> }
            <div class="flex flex-wrap items-center justify-between gap-2">
              <button type="submit" class="btn-primary touch-target" data-testid="shift-box-start" [disabled]="saving() || !confirmed() || float() < 0">{{ saving() ? 'Starting...' : 'Start shift' }}</button>
              <span class="flex flex-wrap items-center gap-2">
                @if (back(); as b) { <a class="btn-outline" [routerLink]="b.route" data-testid="shift-gate-back">{{ b.label }}</a> }
                <button type="button" class="btn-ghost" data-testid="shift-box-signout" [disabled]="saving()" (click)="signOut()">Sign out</button>
              </span>
            </div>
            @if (!confirmed()) { <p class="text-xs text-ink/70">Tick the box to say the drawer was counted.</p> }
          </form>
        }
        @case ('cannot') {
          <section class="app-card space-y-3" aria-labelledby="shift-cannot-title" data-testid="shift-gate-cannot">
            <h2 id="shift-cannot-title" class="text-lg font-bold">You cannot sell yet</h2>
            <p class="text-sm text-ink/80">You need the right to start a shift before you can sell. Ask a manager to give it to you.</p>
            <div class="flex flex-wrap items-center justify-end gap-2">
              @if (back(); as b) { <a class="btn-outline" [routerLink]="b.route" data-testid="shift-gate-back">{{ b.label }}</a> }
              <button type="button" class="btn-ghost" data-testid="shift-box-signout" (click)="signOut()">Sign out</button>
            </div>
          </section>
        }
        @case ('other-branch') {
          <section class="app-card space-y-3" aria-labelledby="shift-other-title" data-testid="shift-gate-other-branch">
            <h2 id="shift-other-title" class="text-lg font-bold">Your shift is at another branch</h2>
            <p class="text-sm text-ink/80">{{ name() }}, you have a shift running at <strong>{{ prompt.shiftBranchName() }}</strong>. A person can have only one shift at a time, so you cannot start one at {{ branches.active()?.name }}. Change the branch above to {{ prompt.shiftBranchName() }}, or end that shift first on Start / End of Day.</p>
            <div class="flex flex-wrap items-center justify-end gap-2">
              <a class="btn-outline" routerLink="/app/pos/day-management" data-testid="shift-gate-day">Start / End of Day</a>
              @if (back(); as b) { <a class="btn-outline" [routerLink]="b.route" data-testid="shift-gate-back">{{ b.label }}</a> }
              <button type="button" class="btn-ghost" data-testid="shift-box-signout" (click)="signOut()">Sign out</button>
            </div>
          </section>
        }
        @default {
          <p class="py-8 text-center text-ink/70" role="status" data-testid="shift-gate-checking">Checking your shift...</p>
        }
      }
    </div>
  `
})
export class ShiftGateComponent {
  protected readonly prompt = inject(ShiftPromptService);
  protected readonly branches = inject(BranchContextService);
  private readonly store = inject(ShiftStore);
  private readonly auth = inject(AuthService);
  private readonly nav = inject(NavService);

  protected readonly float = signal(0);
  protected readonly confirmed = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly name = computed(() => this.auth.membership()?.displayName ?? 'Hello');
  /** A plain way back that never leads into selling: the Dashboard, or the first other screen this person may use. */
  protected readonly back = computed(() => {
    const items = this.nav.items();
    const home = items.find((n) => n.key === 'dashboard');
    const other = home ?? items.find((n) => n.key !== 'pos');
    return other ? { route: other.route, label: home ? 'Back to the Dashboard' : `Go to ${menuLabel(other)}` } : null;
  });
  /** One id for one attempt: a double tap, or a retry after a lost answer, is one shift. */
  private openId = crypto.randomUUID();

  protected async start(): Promise<void> {
    const branch = this.branches.active();
    if (!branch || this.saving() || !this.confirmed()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.store.open({ id: this.openId, branchId: branch.id, openingFloat: Math.round(this.float() * 100) / 100, openingFloatConfirmed: true });
      this.openId = crypto.randomUUID();
      this.confirmed.set(false);
      this.float.set(0);
    } catch (err) {
      const e = toApiError(err);
      // "You already have a shift": it was started on another device. Read it and carry on; if the look finds none, the server's own words are shown.
      if (e.status === 409) await this.prompt.check();
      if (e.status !== 409 || this.prompt.gate() === 'start') this.error.set(e.message);
    } finally { this.saving.set(false); }
  }

  protected signOut(): void { void this.auth.logout(); }
}
