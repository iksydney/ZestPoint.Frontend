import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { IdleLockService } from '../../core/services/idle-lock.service';
import { ShiftPromptService } from '../../core/services/shift-prompt.service';
import { TenantTimePipe } from '../../core/pipes/tenant-time.pipe';

/**
 * The reminder to end a shift, shown over whatever screen the person is on (owner's rule, 2026-11-15): once a shift has run six hours, and
 * each hour after "Still working". It is for anyone with an open shift, whether or not they take payments.
 *
 * The box that asks a person to START a shift is no longer here: it is asked when the Point of Sale is opened (`ShiftGateComponent`, owner's
 * answer of 2026-11-24), so this component only starts the look at the shift for the whole application.
 */
@Component({
    selector: 'zp-shift-prompt',
    imports: [TenantTimePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
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
  `
})
export class ShiftPromptComponent {
  protected readonly prompt = inject(ShiftPromptService);
  private readonly lock = inject(IdleLockService);
  private readonly router = inject(Router);

  protected readonly saving = signal(false);

  constructor() {
    this.prompt.start();
    // Coming back from the lock screen: the shift may have been ended elsewhere, or have passed six hours meanwhile.
    let wasLocked = false;
    effect(() => {
      const locked = this.lock.locked();
      untracked(() => { if (wasLocked && !locked) void this.prompt.check(); wasLocked = locked; });
    });
  }

  protected async answer(answer: 'still_working' | 'end_now'): Promise<void> {
    this.saving.set(true);
    try {
      await this.prompt.answer(answer);
      if (answer === 'end_now') await this.router.navigateByUrl('/app/pos/day-management');
    } finally { this.saving.set(false); }
  }
}
