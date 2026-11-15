import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { BranchContextService } from '../../core/services/branch-context.service';
import { IdleLockService } from '../../core/services/idle-lock.service';
import { ShiftPromptService } from '../../core/services/shift-prompt.service';
import { ShiftStore } from '../../core/services/shift-store.service';
import { TenantTimePipe } from '../../core/pipes/tenant-time.pipe';

/**
 * The two boxes about a person's shift, shown over whatever screen they are on (owner's rule, 2026-11-15):
 *  - "Start your shift": for a cashier who has signed in with no shift running. It cannot be put aside; the only other way out is
 *    to sign out.
 *  - "Remember to end your shift": once a shift has run six hours, and each hour after "Still working".
 */
@Component({
  selector: 'zp-shift-prompt',
  standalone: true,
  imports: [FormsModule, TenantTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (prompt.mustStart()) {
      <div class="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/60 p-3 print:hidden" role="dialog" aria-modal="true" aria-labelledby="shift-box-title" data-testid="shift-box">
        <form class="app-card w-full max-w-md space-y-3 shadow-2xl" (submit)="$event.preventDefault(); start()">
          <h2 id="shift-box-title" class="text-lg font-bold">Start your shift</h2>
          <p class="text-sm text-ink/80">{{ name() }}, you have no shift running at {{ branches.active()?.name }}. Start it now so that your sales and the cash in your drawer are recorded under your name.</p>
          <p class="text-xs text-ink/70" data-testid="shift-box-till">You do not choose a till: you are given the next free one when the shift starts.</p>
          <div>
            <label class="app-label" for="shift-box-float">Cash in the drawer now (opening float)</label>
            <input id="shift-box-float" type="number" inputmode="decimal" min="0" step="any" class="app-input" data-testid="shift-box-float" [ngModel]="float()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="float.set(+$event || 0)" />
          </div>
          <label class="flex items-start gap-2 text-sm"><input type="checkbox" class="mt-1" data-testid="shift-box-confirm" [checked]="confirmed()" (change)="confirmed.set(!confirmed())" /> <span>I have counted the drawer and this amount is right.</span></label>
          @if (error()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="shift-box-error">{{ error() }}</p> }
          <div class="flex flex-wrap items-center justify-between gap-2">
            <button type="button" class="btn-ghost" data-testid="shift-box-signout" [disabled]="saving()" (click)="signOut()">Sign out</button>
            <button type="submit" class="btn-primary touch-target" data-testid="shift-box-start" [disabled]="saving() || !confirmed() || float() < 0">{{ saving() ? 'Starting...' : 'Start shift' }}</button>
          </div>
          @if (!confirmed()) { <p class="text-right text-xs text-ink/70">Tick the box to say the drawer was counted.</p> }
        </form>
      </div>
    } @else {
     @if (prompt.reminder(); as s) {
      <div class="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/60 p-3 print:hidden" role="alertdialog" aria-modal="true" aria-labelledby="shift-reminder-title" data-testid="shift-reminder">
        <div class="app-card w-full max-w-md space-y-3 shadow-2xl">
          <h2 id="shift-reminder-title" class="text-lg font-bold">Remember to end your shift</h2>
          <p class="text-sm text-ink/80">Your shift{{ s.terminalId ? ' on ' + s.terminalId : '' }} started {{ s.openedAtUtc | tenantTime }} and has run for <strong data-testid="shift-reminder-hours">{{ prompt.hoursOpen() }} hours</strong>. When you finish, count your drawer and end the shift so your sales are closed under your name.</p>
          <p class="text-xs text-ink/70">If you are still working you will be reminded again in an hour. Your answer is recorded.</p>
          <div class="flex flex-wrap justify-end gap-2">
            <button type="button" class="btn-outline" data-testid="shift-reminder-working" [disabled]="saving()" (click)="answer('still_working')">Still working</button>
            <button type="button" class="btn-primary touch-target" data-testid="shift-reminder-end" [disabled]="saving()" (click)="answer('end_now')">End my shift now</button>
          </div>
        </div>
      </div>
     }
    }
  `
})
export class ShiftPromptComponent {
  protected readonly prompt = inject(ShiftPromptService);
  protected readonly branches = inject(BranchContextService);
  private readonly store = inject(ShiftStore);
  private readonly auth = inject(AuthService);
  private readonly lock = inject(IdleLockService);
  private readonly router = inject(Router);

  protected readonly float = signal(0);
  protected readonly confirmed = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly name = computed(() => this.auth.membership()?.displayName ?? 'Hello');
  private openId = crypto.randomUUID();

  constructor() {
    this.prompt.start();
    // Coming back from the lock screen: the shift may have been ended elsewhere, or have passed six hours meanwhile.
    let wasLocked = false;
    effect(() => {
      const locked = this.lock.locked();
      untracked(() => { if (wasLocked && !locked) void this.prompt.check(); wasLocked = locked; });
    });
  }

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
      // "You already have a shift": it was started on another device. Read it and carry on.
      if (e.status === 409) await this.prompt.check();
      else this.error.set(e.message);
    } finally { this.saving.set(false); }
  }

  protected async answer(answer: 'still_working' | 'end_now'): Promise<void> {
    this.saving.set(true);
    try {
      await this.prompt.answer(answer);
      if (answer === 'end_now') await this.router.navigateByUrl('/app/pos/day-management');
    } finally { this.saving.set(false); }
  }

  protected signOut(): void { void this.auth.logout(); }
}
