import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { CashMovementKind, ShiftDto, ShiftStatus } from '../../core/models/nav-ops.model';
import { FEATURES, SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { TenantTimePipe } from '../../core/pipes/tenant-time.pipe';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { BranchContextService } from '../../core/services/branch-context.service';
import { ShiftApi } from '../../core/services/nav-ops.services';
import { ShiftStore } from '../../core/services/shift-store.service';
import { SyncAgentService } from '../../core/services/sync-agent.service';
import { BranchPickerComponent } from '../../shared/ui/ops-chrome.components';
import { ConfirmService, DialogComponent, ToastService } from '../../shared/ui/feedback';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';


/**
 * Start / End of Day: the cashier's own shift. The till total is never typed in: expected cash is calculated by the server from the
 * opening float, cash payments taken under this shift, cash refunds and the cash moved in and out. A supervisor reviews a variance.
 */
@Component({
    selector: 'zp-day-management',
    imports: [CurrencyPipe, FormsModule, TenantTimePipe, StatusBadgeComponent, DialogComponent, BranchPickerComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="no-print mb-3 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-bold">Start / End of Day</h1>
      <zp-branch-picker />
    </div>
    @if (readOnly()) { <p class="sys-alert sys-alert-warning mb-3 no-print" role="status" data-testid="day-readonly">Read-only: your subscription limits this screen. You can look, but not start or close shifts.</p> }
    @if (error()) { <p class="sys-alert sys-alert-danger mb-3 no-print" role="alert" data-testid="day-error">{{ error() }}</p> }
    @if (store.waitingToSync()) { <p class="sys-alert sys-alert-info mb-3 no-print" role="status" data-testid="day-offline">Saved on this device. {{ sync.pending() }} change(s) will be sent when you are back online@if (store.figuresIncomplete()) { <span>; expected cash below only knows the float and the cash you added or removed, and the server adds your cash sales when this syncs</span> }.</p> }

    @if (loading() && !loaded()) { <p class="py-8 text-center text-ink/70" role="status">Loading...</p> }
    @else {
      @if (!current()) {
        <section class="app-card no-print max-w-xl space-y-3" data-testid="day-start">
          <div class="flex items-center gap-2"><h2 class="text-lg font-semibold">Start your shift</h2><zp-status-badge tone="warning">Not started</zp-status-badge></div>
          <p class="text-sm text-ink/80">Count the cash in your till and enter it as the opening float. Sales and cash movements are counted from the moment you start.</p>
          @if (!branches.active()) { <p class="sys-alert sys-alert-warning" role="status">You are not assigned to a branch yet. Ask a manager to give you access.</p> }
          @else {
            <p class="text-sm">Branch: <strong>{{ branches.active()!.name }}</strong> &middot; User: <strong>{{ auth.membership()?.displayName }}</strong></p>
            <form class="space-y-3" (submit)="$event.preventDefault(); start()">
              <p class="text-sm" data-testid="day-till-note">Till: <strong>given to you when you start</strong>. You get the lowest free till number at this branch (the first person to start is Till 1, the next Till 2).</p>
              <div><label class="app-label" for="d-float">Opening float ({{ currency() }})</label><input id="d-float" type="number" min="0" step="0.01" class="app-input" data-testid="day-float" [ngModel]="openingFloat()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="openingFloat.set(+$event)" /></div>
              <label class="flex items-start gap-2 text-sm"><input type="checkbox" class="mt-1" data-testid="day-float-confirm" [checked]="floatConfirmed()" (change)="floatConfirmed.set(!floatConfirmed())" /> I counted the float and it is correct.</label>
              <button type="submit" class="btn-primary" data-testid="day-start-btn" [disabled]="saving() || readOnly() || !canOpen() || !floatConfirmed()">Start shift</button>
              @if (!canOpen()) { <p class="text-sm text-ink/70">Your role cannot start shifts.</p> }
            </form>
          }
        </section>
      } @else {
        @let s = current()!;
        <section class="no-print space-y-4" data-testid="day-current">
          <div class="app-card flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-lg font-semibold" data-testid="day-till">{{ s.terminalId || 'Till number comes when this device syncs' }}</p>
              <p class="text-sm text-ink/70">Shift #{{ s.number }} &middot; {{ s.branchName }} &middot; {{ s.staffName }}</p>
              <p class="text-sm">Opened {{ s.openedAtUtc | tenantTime }} &middot; business date {{ s.businessDate }}</p>
            </div>
            <zp-status-badge [tone]="tone(s.status)" data-testid="day-status">{{ statusText(s.status) }}</zp-status-badge>
          </div>

          <div class="grid gap-4 lg:grid-cols-2">
            <div class="app-card" data-testid="day-cash">
              <h2 class="mb-2 font-semibold">Cash in the till (calculated)</h2>
              <dl class="space-y-1 text-sm">
                <div class="flex justify-between"><dt>Opening float</dt><dd>{{ s.cash.openingFloat | currency: s.currencyCode }}</dd></div>
                <div class="flex justify-between"><dt>Cash sales</dt><dd>{{ s.cash.cashSales | currency: s.currencyCode }}</dd></div>
                <div class="flex justify-between"><dt>Cash refunds</dt><dd>- {{ s.cash.cashRefunds | currency: s.currencyCode }}</dd></div>
                <div class="flex justify-between"><dt>Cash added</dt><dd>{{ s.cash.cashIn | currency: s.currencyCode }}</dd></div>
                <div class="flex justify-between"><dt>Cash removed</dt><dd>- {{ s.cash.cashOut | currency: s.currencyCode }}</dd></div>
                <div class="flex justify-between border-t border-ink/15 pt-1 text-base font-bold"><dt>Expected cash</dt><dd data-testid="day-expected">{{ (s.expectedCash ?? s.cash.expectedCash) | currency: s.currencyCode }}</dd></div>
              </dl>
              <h3 class="mb-1 mt-4 text-sm font-semibold">Not cash (never in the till)</h3>
              <dl class="space-y-1 text-sm">
                <div class="flex justify-between"><dt>Card</dt><dd>{{ s.cash.cardSales | currency: s.currencyCode }}</dd></div>
                <div class="flex justify-between"><dt>Bank transfer</dt><dd>{{ s.cash.transferSales | currency: s.currencyCode }}</dd></div>
                @if (s.cash.otherSales > 0) { <div class="flex justify-between"><dt>Other</dt><dd>{{ s.cash.otherSales | currency: s.currencyCode }}</dd></div> }
                @if (s.cash.giftCardSales > 0) { <div class="flex justify-between" data-testid="shift-giftcards"><dt>Paid with gift cards</dt><dd>{{ s.cash.giftCardSales | currency: s.currencyCode }}</dd></div> }
                @if (s.cash.pointsSales > 0) { <div class="flex justify-between" data-testid="shift-points"><dt>Paid with loyalty points</dt><dd>{{ s.cash.pointsSales | currency: s.currencyCode }}</dd></div> }
                <div class="flex justify-between text-ink/70"><dt>Payments taken</dt><dd>{{ s.cash.paymentCount }}</dd></div>
              </dl>
            </div>

            <div class="app-card">
              <h2 class="mb-2 font-semibold">Cash added or removed</h2>
              <ul class="mb-3 space-y-1 text-sm" data-testid="day-movements">
                @for (m of s.movements; track m.id) {
                  <li class="flex justify-between gap-2"><span>{{ m.kind === 'CashIn' ? 'Added' : 'Removed' }}: {{ m.reason }} <span class="text-xs text-ink/60">{{ m.occurredAtUtc | tenantTime }}</span></span>
                    <span [class.text-danger]="m.kind === 'CashOut'">{{ m.kind === 'CashOut' ? '-' : '+' }}{{ m.amount | currency: s.currencyCode }}</span></li>
                } @empty { <li class="text-ink/70">Nothing yet.</li> }
              </ul>
              @if (s.status === 'Open' && !readOnly()) {
                <form class="grid gap-2 sm:grid-cols-[8rem_1fr_7rem_auto]" (submit)="$event.preventDefault(); addMovement()">
                  <select class="app-input" aria-label="Type" data-testid="move-kind" [ngModel]="moveKind()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="moveKind.set($event)"><option value="CashIn">Add cash</option><option value="CashOut">Remove cash</option></select>
                  <input class="app-input" aria-label="Reason" placeholder="Reason (required)" data-testid="move-reason" maxlength="200" [ngModel]="moveReason()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="moveReason.set($event)" />
                  <input class="app-input" type="number" min="0.01" step="0.01" aria-label="Amount" data-testid="move-amount" [ngModel]="moveAmount()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="moveAmount.set(+$event)" />
                  <button type="submit" class="btn-outline" data-testid="move-add" [disabled]="saving() || moveReason().trim().length < 3 || moveAmount() <= 0">Add</button>
                </form>
              }
            </div>
          </div>

          @if (s.status === 'Open') {
            <form class="app-card max-w-xl space-y-3" (submit)="$event.preventDefault(); close()" data-testid="day-close">
              <h2 class="font-semibold">Close your shift</h2>
              <p class="text-sm text-ink/80">Count the cash in the till and enter the total. The difference is worked out for you; a difference needs a supervisor to review it.</p>
              <div><label class="app-label" for="c-count">Counted cash ({{ s.currencyCode }})</label><input id="c-count" type="number" min="0" step="0.01" class="app-input" data-testid="close-count" [ngModel]="counted()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="counted.set($event === null || $event === '' ? null : +$event)" /></div>
              @if (counted() !== null) {
                <p class="text-sm" data-testid="close-variance" [class.text-danger]="variance() !== 0">Difference from expected: <strong>{{ variance() | currency: s.currencyCode }}</strong> {{ variance() === 0 ? '(matches)' : variance() < 0 ? '(short)' : '(over)' }}</p>
              }
              <div><label class="app-label" for="c-notes">Notes</label><textarea id="c-notes" rows="2" class="app-input" maxlength="500" data-testid="close-notes" [ngModel]="notes()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="notes.set($event)"></textarea></div>
              <label class="flex items-start gap-2 text-sm"><input type="checkbox" class="mt-1" data-testid="close-confirm" [checked]="closeConfirmed()" (change)="closeConfirmed.set(!closeConfirmed())" /> The count is final. I understand the shift cannot be reopened by me.</label>
              <button type="submit" class="btn-primary" data-testid="close-btn" [disabled]="saving() || readOnly() || counted() === null || !closeConfirmed() || !canClose()">Close shift</button>
              @if (!canClose()) { <p class="text-sm text-ink/70">Your role cannot close shifts.</p> }
            </form>
          } @else if (s.status === 'PendingReview') {
            <p class="sys-alert sys-alert-warning" role="status" data-testid="day-pending">Closed with a difference of {{ s.variance | currency: s.currencyCode }}. A supervisor must review it before the shift is final.</p>
          }
        </section>
      }

      @if (canReview() && queue().length > 0) {
        <section class="no-print mt-8" data-testid="day-queue">
          <h2 class="mb-2 text-lg font-semibold">Waiting for review</h2>
          <div class="app-card overflow-x-auto p-0"><table class="app-table">
            <thead><tr><th>Shift</th><th>Staff</th><th>Branch</th><th class="text-right">Expected</th><th class="text-right">Counted</th><th class="text-right">Difference</th><th></th></tr></thead>
            <tbody>@for (q of queue(); track q.id) {
              <tr><td>#{{ q.number }} {{ q.businessDate }}</td><td>{{ q.staffName }}</td><td>{{ q.branchName }} / {{ q.terminalId }}</td>
                <td class="text-right">{{ q.expectedCash | currency: q.currencyCode }}</td><td class="text-right">{{ q.countedCash | currency: q.currencyCode }}</td>
                <td class="text-right text-danger">{{ q.variance | currency: q.currencyCode }}</td>
                <td class="text-right"><button type="button" class="btn-outline px-2 py-1 text-sm" [attr.data-testid]="'review-' + q.number" (click)="openReview(q)">Review</button></td></tr> }</tbody></table></div>
        </section>
      }

      <section class="no-print mt-8" data-testid="day-history">
        <h2 class="mb-2 text-lg font-semibold">Shift history</h2>
        <div class="app-card overflow-x-auto p-0"><table class="app-table">
          <thead><tr><th>Shift</th><th>Date</th><th>Staff</th><th>Till</th><th>Status</th><th class="text-right">Expected</th><th class="text-right">Counted</th><th class="text-right">Difference</th><th></th></tr></thead>
          <tbody>@for (h of history(); track h.id) {
            <tr><td>#{{ h.number }}</td><td>{{ h.businessDate }}</td><td>{{ h.staffName }}</td><td>{{ h.branchName }} / {{ h.terminalId }}</td>
              <td><zp-status-badge [tone]="tone(h.status)">{{ statusText(h.status) }}</zp-status-badge></td>
              <td class="text-right">{{ h.expectedCash === null ? '' : (h.expectedCash | currency: h.currencyCode) }}</td><td class="text-right">{{ h.countedCash === null ? '' : (h.countedCash | currency: h.currencyCode) }}</td>
              <td class="text-right" [class.text-danger]="(h.variance ?? 0) !== 0">{{ h.variance === null ? '' : (h.variance | currency: h.currencyCode) }}</td>
              <td class="text-right"><button type="button" class="btn-ghost px-2 py-1 text-sm" [attr.data-testid]="'view-' + h.number" (click)="view(h)">Summary</button></td></tr>
          } @empty { <tr><td colspan="9" class="py-6 text-center text-ink/70">No shifts yet.</td></tr> }</tbody></table></div>
      </section>
    }

    @if (selected(); as v) {
      <section class="app-card mt-6 max-w-2xl print:max-w-none print:border-0 print:shadow-none" data-testid="shift-summary" aria-label="Shift summary">
        <div class="flex items-start justify-between gap-3"><h2 class="text-lg font-bold">Shift summary #{{ v.number }}</h2>
          <span class="no-print flex gap-2"><button type="button" class="btn-outline px-3 py-1" data-testid="print-summary" (click)="print()">Print</button><button type="button" class="btn-ghost px-3 py-1" (click)="selected.set(null)">Close</button></span></div>
        <p class="text-sm">{{ v.branchName }} &middot; {{ v.terminalId }} &middot; {{ v.staffName }} &middot; business date {{ v.businessDate }}</p>
        <p class="text-sm">Opened {{ v.openedAtUtc | tenantTime }}@if (v.closedAtUtc) { &middot; closed {{ v.closedAtUtc | tenantTime }} }</p>
        <dl class="mt-3 grid max-w-sm gap-1 text-sm">
          <div class="flex justify-between"><dt>Opening float</dt><dd>{{ v.cash.openingFloat | currency: v.currencyCode }}</dd></div>
          <div class="flex justify-between"><dt>Cash sales</dt><dd>{{ v.cash.cashSales | currency: v.currencyCode }}</dd></div>
          <div class="flex justify-between"><dt>Cash refunds</dt><dd>- {{ v.cash.cashRefunds | currency: v.currencyCode }}</dd></div>
          <div class="flex justify-between"><dt>Cash added / removed</dt><dd>+{{ v.cash.cashIn | currency: v.currencyCode }} / -{{ v.cash.cashOut | currency: v.currencyCode }}</dd></div>
          <div class="flex justify-between font-bold"><dt>Expected cash</dt><dd>{{ (v.expectedCash ?? v.cash.expectedCash) | currency: v.currencyCode }}</dd></div>
          @if (v.countedCash !== null) {
            <div class="flex justify-between"><dt>Counted cash</dt><dd>{{ v.countedCash | currency: v.currencyCode }}</dd></div>
            <div class="flex justify-between font-bold"><dt>Difference</dt><dd>{{ v.variance | currency: v.currencyCode }}</dd></div>
          }
          <div class="flex justify-between"><dt>Card / transfer / other</dt><dd>{{ v.cash.cardSales | currency: v.currencyCode }} / {{ v.cash.transferSales | currency: v.currencyCode }} / {{ v.cash.otherSales | currency: v.currencyCode }}</dd></div>
          @if (v.cash.giftCardSales > 0) { <div class="flex justify-between"><dt>Paid with gift cards</dt><dd>{{ v.cash.giftCardSales | currency: v.currencyCode }}</dd></div> }
          @if (v.cash.pointsSales > 0) { <div class="flex justify-between"><dt>Paid with loyalty points</dt><dd>{{ v.cash.pointsSales | currency: v.currencyCode }}</dd></div> }
        </dl>
        @if (v.closingNotes) { <p class="mt-2 text-sm">Notes: {{ v.closingNotes }}</p> }
        @if (v.reviewedByName) { <p class="mt-2 text-sm">Reviewed by {{ v.reviewedByName }} ({{ v.reviewedAtUtc | tenantTime }}): {{ v.reviewNote }}</p> }
        <p class="mt-3 text-xs text-ink/60">Printed from ZestPoint. This is a record of the shift, not proof that a printer produced paper.</p>
      </section>
    }

    <zp-dialog [open]="!!reviewing()" [title]="'Review shift #' + (reviewing()?.number ?? '')" (closed)="reviewing.set(null)">
      @if (reviewing(); as r) {
        <p class="mb-2 text-sm">{{ r.staffName }} counted {{ r.countedCash | currency: r.currencyCode }} against {{ r.expectedCash | currency: r.currencyCode }} expected: a difference of <strong>{{ r.variance | currency: r.currencyCode }}</strong>.</p>
        <label class="app-label" for="rv-note">Your note (required)</label>
        <textarea id="rv-note" rows="3" class="app-input" data-testid="review-note" maxlength="500" [ngModel]="reviewNote()" (ngModelChange)="reviewNote.set($event)"></textarea>
        <div class="mt-3 flex justify-end gap-2">
          <button type="button" class="btn-outline" data-testid="review-reject" [disabled]="saving() || reviewNote().trim().length < 3" (click)="decide(false)">Send back for a recount</button>
          <button type="button" class="btn-primary" data-testid="review-approve" [disabled]="saving() || reviewNote().trim().length < 3" (click)="decide(true)">Approve and close</button>
        </div>
      }
    </zp-dialog>
  `
})
export class DayManagementComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly branches = inject(BranchContextService);
  private readonly api = inject(ShiftApi);
  protected readonly store = inject(ShiftStore);
  protected readonly sync = inject(SyncAgentService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly loading = signal(false);
  protected readonly loaded = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly current = this.store.current;
  protected readonly history = signal<readonly ShiftDto[]>([]);
  protected readonly queue = signal<readonly ShiftDto[]>([]);
  protected readonly selected = signal<ShiftDto | null>(null);
  protected readonly reviewing = signal<ShiftDto | null>(null);

  protected readonly openingFloat = signal(0);
  protected readonly floatConfirmed = signal(false);
  protected readonly moveKind = signal<CashMovementKind>('CashIn');
  protected readonly moveReason = signal('');
  protected readonly moveAmount = signal(0);
  protected readonly counted = signal<number | null>(null);
  protected readonly notes = signal('');
  protected readonly closeConfirmed = signal(false);
  protected readonly reviewNote = signal('');

  /** Client ids: a retry (or a double tap) repeats the same request and the server treats it as one. */
  private openId = crypto.randomUUID();
  private moveId = crypto.randomUUID();

  protected readonly readOnly = computed(() => this.auth.accessModeFor(FEATURES.CORE_POS) === 'readonly');
  protected readonly canOpen = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.POS_DAY_OPEN));
  protected readonly canClose = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.POS_DAY_CLOSE));
  protected readonly canReview = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.POS_DAY_REVIEW));
  protected readonly currency = computed(() => this.current()?.currencyCode ?? this.auth.tenant()?.currencyCode ?? '');
  protected readonly variance = computed(() => {
    const s = this.current();
    const c = this.counted();
    return s && c !== null ? Math.round((c - s.cash.expectedCash) * 100) / 100 : 0;
  });

  ngOnInit(): void {
    void this.branches.load();
    void this.refresh();
  }

  protected tone = (s: ShiftStatus): 'success' | 'warning' | 'danger' | 'primary' => (s === 'Closed' ? 'success' : s === 'PendingReview' ? 'warning' : 'primary');
  protected statusText = (s: ShiftStatus): string => (s === 'PendingReview' ? 'Pending review' : s);

  protected async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.store.load();
      // History and the review queue need the server; offline they keep what was last loaded.
      try {
        this.history.set((await firstValueFrom(this.api.list({ pageSize: 25 }))).items);
        if (this.canReview()) this.queue.set((await firstValueFrom(this.api.list({ status: 'PendingReview', pageSize: 25 }))).items);
      } catch (err) { if (toApiError(err).status !== 0) throw err; }
    } catch (err) { this.error.set(toApiError(err).message); }
    finally { this.loading.set(false); this.loaded.set(true); }
  }

  protected async start(): Promise<void> {
    const branch = this.branches.active();
    if (!branch) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      // No till is chosen here: the server gives this cashier the lowest free till number at the branch.
      const shift = await this.store.open({ id: this.openId, branchId: branch.id, openingFloat: this.openingFloat(), openingFloatConfirmed: this.floatConfirmed() });
      this.openId = crypto.randomUUID();
      this.floatConfirmed.set(false);
      this.toast.success(this.store.waitingToSync() ? 'Shift started on this device. Your till number is given when it syncs.' : `Shift started. You are on ${shift.terminalId}.`);
      if (!this.store.waitingToSync()) await this.refresh();
    } catch (err) { this.error.set(toApiError(err).message); } finally { this.saving.set(false); }
  }

  protected async addMovement(): Promise<void> {
    const s = this.current();
    if (!s) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.store.addMovement(s, { id: this.moveId, kind: this.moveKind(), amount: this.moveAmount(), reason: this.moveReason().trim() });
      this.moveId = crypto.randomUUID();
      this.moveReason.set('');
      this.moveAmount.set(0);
      this.toast.success('Recorded.');
    } catch (err) { this.error.set(toApiError(err).message); } finally { this.saving.set(false); }
  }

  protected async close(): Promise<void> {
    const s = this.current();
    const counted = this.counted();
    if (!s || counted === null) return;
    const ok = await this.confirm.ask({ title: 'Close this shift?', message: `You counted ${counted.toFixed(2)} against ${s.cash.expectedCash.toFixed(2)} expected. This cannot be undone.`, confirmLabel: 'Close shift' });
    if (!ok) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const result = await this.store.close(s, { countedCash: counted, notes: this.notes().trim() || null, confirm: true, rowVersion: s.rowVersion || null });
      this.counted.set(null); this.notes.set(''); this.closeConfirmed.set(false);
      if (result === null) {
        this.toast.success('Close saved on this device. The server will work out the difference when you are back online.');
        return;
      }
      this.toast.success(result.status === 'PendingReview' ? 'Closed. A supervisor must review the difference.' : 'Shift closed.');
      await this.refresh();
      this.selected.set(result);
    } catch (err) { this.error.set(toApiError(err).message); } finally { this.saving.set(false); }
  }

  protected view(s: ShiftDto): void {
    void firstValueFrom(this.api.get(s.id)).then((full) => this.selected.set(full)).catch((err) => this.error.set(toApiError(err).message));
  }

  protected openReview(s: ShiftDto): void {
    this.reviewNote.set('');
    this.reviewing.set(s);
  }

  protected async decide(approve: boolean): Promise<void> {
    const s = this.reviewing();
    if (!s) return;
    this.saving.set(true);
    try {
      await firstValueFrom(this.api.review(s.id, { approve, note: this.reviewNote().trim() }));
      this.reviewing.set(null);
      this.toast.success(approve ? 'Shift reviewed and closed.' : 'Sent back for a recount.');
      await this.refresh();
    } catch (err) { this.error.set(toApiError(err).message); this.reviewing.set(null); } finally { this.saving.set(false); }
  }

  protected print(): void {
    window.print();
  }
}
