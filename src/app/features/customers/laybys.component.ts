import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { CompanySettingsDto, PaymentMethod, VoidAuthorizer } from '../../core/models/ops.model';
import { FEATURES } from '../../core/models/rbac.model';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { BranchContextService } from '../../core/services/branch-context.service';
import { LaybyDto, LaybyStatus, LaybysApi } from '../../core/services/customer.services';
import { OperationSettingsApi, OrdersApi } from '../../core/services/ops.services';
import { DialogComponent, ToastService } from '../../shared/ui/feedback';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';
import { VoidAuthoriserComponent } from '../pos-billing/void-authoriser.component';

/**
 * Laybys at this branch: goods customers have reserved and are paying off. A layby is started on a bill at the till (the bill needs a
 * customer). Here its payments are taken, and it can be cancelled with a supervisor's or administrator's typed authorisation: the
 * customer gets back what they paid less the company's fee, and the goods are free to sell again.
 */
@Component({
    selector: 'zp-laybys',
    imports: [CurrencyPipe, DatePipe, FormsModule, DialogComponent, StatusBadgeComponent, VoidAuthoriserComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-bold">Laybys</h1>
      <p class="text-sm text-ink/70">To start one: at the till, put a customer on the bill and press <strong>Layby</strong>.</p>
    </div>
    <div class="mb-3 flex flex-wrap items-center gap-3">
      <label class="text-sm" for="lb-status">Show</label>
      <select id="lb-status" class="app-input max-w-[12rem]" data-testid="lb-status" [ngModel]="status()" (ngModelChange)="status.set($event); load()">
        <option value="Active">Active</option><option value="Overdue">Overdue only</option><option value="Completed">Completed</option><option value="Cancelled">Cancelled</option><option value="">All</option>
      </select>
      <input class="app-input max-w-sm" placeholder="Customer, phone or layby number" aria-label="Search laybys" data-testid="lb-search" [ngModel]="search()" (ngModelChange)="search.set($event)" (keydown.enter)="load()" />
      <button type="button" class="btn-outline" (click)="load()">Search</button>
    </div>
    @if (!branchId()) { <p class="sys-alert sys-alert-warning mb-3" role="status">Choose a branch at the top of the page.</p> }
    @if (readOnly()) { <p class="sys-alert sys-alert-warning mb-3" role="status">Read-only: your subscription limits this screen.</p> }
    @if (error()) { <p class="sys-alert sys-alert-danger mb-3" role="alert" data-testid="lb-error">{{ error() }}</p> }
    @if (notice()) { <p class="sys-alert sys-alert-success mb-3" role="status" data-testid="lb-notice">{{ notice() }}</p> }

    <div class="app-card overflow-x-auto p-0" data-testid="lb-table">
      <table class="app-table">
        <caption class="sr-only">Laybys</caption>
        <thead><tr><th>No.</th><th>Customer</th><th>Goods</th><th>Due</th><th class="text-right">Total</th><th class="text-right">Paid</th><th class="text-right">Still owed</th><th>State</th><th></th></tr></thead>
        <tbody>
          @for (r of rows(); track r.id) {
            <tr [attr.data-testid]="'lb-' + r.customerName">
              <td class="font-mono text-xs">{{ r.number }}</td>
              <td class="font-medium">{{ r.customerName }} <span class="block font-mono text-xs font-normal text-ink/70">{{ r.customerPhone }}</span></td>
              <td>{{ r.items }}</td>
              <td>{{ r.dueDate | date: 'mediumDate' }}</td>
              <td class="text-right font-mono">{{ r.total | currency: currency() : 'symbol-narrow' : '1.2-2' }}</td>
              <td class="text-right font-mono" [attr.data-testid]="'lb-paid-' + r.customerName">{{ r.paid | currency: currency() : 'symbol-narrow' : '1.2-2' }}</td>
              <td class="text-right font-mono" [attr.data-testid]="'lb-balance-' + r.customerName">{{ r.balance | currency: currency() : 'symbol-narrow' : '1.2-2' }}</td>
              <td>
                @if (r.status === 'Active') { <zp-status-badge [tone]="r.overdue ? 'danger' : 'primary'">{{ r.overdue ? 'Overdue' : 'Active' }}</zp-status-badge> }
                @else if (r.status === 'Completed') { <zp-status-badge tone="success">Paid and collected</zp-status-badge> }
                @else { <zp-status-badge tone="danger">Cancelled</zp-status-badge> <span class="block text-xs text-ink/70">{{ r.cancelReason }}; {{ r.refundedOnCancel | currency: currency() : 'symbol-narrow' : '1.2-2' }} given back, authorised by {{ r.cancelAuthorisedByName }}</span> }
              </td>
              <td class="whitespace-nowrap text-right">
                @if (r.status === 'Active' && !readOnly()) {
                  <button type="button" class="btn-outline px-2 py-1 text-sm" [attr.data-testid]="'lb-pay-' + r.customerName" (click)="openPay(r)">Take payment</button>
                  <button type="button" class="btn-ghost px-2 py-1 text-sm text-danger" [attr.data-testid]="'lb-cancel-' + r.customerName" (click)="openCancel(r)">Cancel</button>
                }
              </td>
            </tr>
          } @empty { <tr><td colspan="9" class="py-8 text-center text-ink/70">{{ loading() ? 'Loading...' : 'Nothing here.' }}</td></tr> }
        </tbody>
      </table>
    </div>
    <p class="mt-2 text-xs text-ink/70">Goods on an active layby stay in the stock count but cannot be sold to someone else. They leave the shelf when the last payment is taken.</p>

    <zp-dialog [open]="dialog() === 'pay'" [title]="'Payment on layby #' + (current()?.number ?? '')" (closed)="dialog.set(null)">
      @if (current(); as c) {
        <form class="space-y-3" (submit)="$event.preventDefault(); pay()">
          <p>{{ c.customerName }}: <strong data-testid="lb-due">{{ c.balance | currency: currency() : 'symbol-narrow' : '1.2-2' }}</strong> still owed.
            @if (c.paid === 0) { <span class="block text-sm text-ink/70">The first payment must be at least {{ c.minimumDeposit | currency: currency() : 'symbol-narrow' : '1.2-2' }}.</span> }</p>
          <div class="grid gap-3 sm:grid-cols-2">
            <div><label class="app-label" for="lb-amount">Amount</label><input id="lb-amount" type="number" min="0" step="0.01" class="app-input" data-testid="lb-amount" [ngModel]="amount()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="amount.set(+$event)" /></div>
            <div><label class="app-label" for="lb-method">Paid by</label>
              <select id="lb-method" class="app-input" data-testid="lb-method" [ngModel]="method()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="method.set($event)">
                @for (m of methods(); track m) { <option [ngValue]="m">{{ m }}</option> }</select></div>
          </div>
          @if (amount() >= c.balance && c.balance > 0) { <p class="text-sm text-ink/80">This pays it off: the goods leave the shelf and the customer collects them.</p> }
          @if (dialogError()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="lb-pay-error">{{ dialogError() }}</p> }
          <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Close</button><button type="submit" class="btn-primary touch-target" data-testid="lb-pay-confirm" [disabled]="busy() || !(amount() > 0)">Take payment</button></div>
        </form>
      }
    </zp-dialog>

    <zp-dialog [open]="dialog() === 'cancel'" [title]="'Cancel layby #' + (current()?.number ?? '')" (closed)="dialog.set(null)">
      @if (current(); as c) {
        <div class="space-y-3">
          <p class="text-sm">{{ c.customerName }} has paid {{ c.paid | currency: currency() : 'symbol-narrow' : '1.2-2' }}.
            @if (feePercent() > 0) { The company keeps {{ feePercent() }}% of that ({{ feeOf(c) | currency: currency() : 'symbol-narrow' : '1.2-2' }}) and gives back <strong data-testid="lb-refund">{{ c.paid - feeOf(c) | currency: currency() : 'symbol-narrow' : '1.2-2' }}</strong>. }
            @else { All of it is given back. }
            Each payment is refunded the way it was made. The goods become available to sell again.</p>
          <div><label class="app-label" for="lb-reason">Why is it cancelled?</label><input id="lb-reason" class="app-input" maxlength="150" data-testid="lb-reason" [ngModel]="reason()" (ngModelChange)="reason.set($event)" /></div>
          @if (dialog() === 'cancel') { <zp-void-authoriser [clearSecret]="attempts()" (changed)="authorizer.set($event)" /> }
          @if (dialogError()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="lb-cancel-error">{{ dialogError() }}</p> }
          <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Keep the layby</button><button type="button" class="btn-primary" data-testid="lb-cancel-confirm" [disabled]="busy() || reason().trim().length < 3 || !authorizer()" (click)="cancel()">Cancel layby</button></div>
        </div>
      }
    </zp-dialog>
  `
})
export class LaybysComponent {
  private readonly api = inject(LaybysApi);
  private readonly ordersApi = inject(OrdersApi);
  private readonly settingsApi = inject(OperationSettingsApi);
  private readonly auth = inject(AuthService);
  private readonly branches = inject(BranchContextService);
  private readonly toast = inject(ToastService);

  protected readonly branchId = this.branches.activeId;
  protected readonly rows = signal<readonly LaybyDto[]>([]);
  protected readonly status = signal<LaybyStatus | 'Overdue' | ''>('Active');
  protected readonly search = signal('');
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly dialog = signal<'pay' | 'cancel' | null>(null);
  protected readonly dialogError = signal<string | null>(null);
  protected readonly current = signal<LaybyDto | null>(null);
  protected readonly amount = signal(0);
  protected readonly method = signal<PaymentMethod>('Cash');
  protected readonly reason = signal('');
  protected readonly authorizer = signal<VoidAuthorizer | null>(null);
  protected readonly attempts = signal(0);
  private readonly settings = signal<CompanySettingsDto | null>(null);

  protected readonly readOnly = computed(() => this.auth.accessModeFor(FEATURES.CORE_POS) === 'readonly');
  protected readonly currency = computed(() => this.settings()?.currencyCode ?? 'USD');
  protected readonly feePercent = computed(() => this.settings()?.laybyCancelFeePercent ?? 0);
  protected readonly methods = computed<PaymentMethod[]>(() => {
    const s = this.settings();
    const all: PaymentMethod[] = [];
    if (!s || s.allowCashPayments) all.push('Cash');
    if (s?.allowCardPayments) all.push('Card');
    if (s?.allowTransferPayments) all.push('Transfer');
    return all;
  });

  constructor() {
    void this.branches.load();
    void firstValueFrom(this.settingsApi.get()).then((s) => this.settings.set(s)).catch(() => undefined);
    effect(() => { this.branchId(); untracked(() => void this.load()); }, { allowSignalWrites: true });
  }

  /** What is kept on cancelling: the company's percentage of what was paid, to the cent (the server works out the same figure). */
  protected feeOf(c: LaybyDto): number { return Math.round(c.paid * this.feePercent()) / 100; }

  protected async load(): Promise<void> {
    const branchId = this.branchId();
    if (!branchId) { this.rows.set([]); return; }
    this.loading.set(true);
    this.error.set(null);
    const wanted = this.status();
    try {
      this.rows.set((await firstValueFrom(this.api.list({ branchId, status: wanted === 'Overdue' ? '' : wanted, overdueOnly: wanted === 'Overdue', search: this.search().trim(), pageSize: 200 }))).items);
    } catch (err) { this.error.set(toApiError(err).message); }
    finally { this.loading.set(false); }
  }

  protected openPay(r: LaybyDto): void {
    this.current.set(r);
    this.amount.set(r.paid === 0 ? Math.min(r.minimumDeposit, r.balance) : r.balance);
    this.method.set(this.methods()[0] ?? 'Cash');
    this.dialogError.set(null);
    this.notice.set(null);
    this.dialog.set('pay');
  }

  protected async pay(): Promise<void> {
    const c = this.current();
    if (!c) return;
    this.busy.set(true);
    this.dialogError.set(null);
    const amount = Math.round(this.amount() * 100) / 100;
    try {
      const bill = await firstValueFrom(this.ordersApi.pay(c.orderId, {
        method: this.method(), amount, tip: 0, cashTendered: this.method() === 'Cash' ? amount : null, token: null, idempotencyKey: `pay-${crypto.randomUUID()}`, rowVersion: null
      }));
      this.dialog.set(null);
      this.notice.set(bill.status === 'Paid' ? `Layby #${c.number} is paid in full. ${c.customerName} can collect: ${c.items}.` : `Payment taken on layby #${c.number}.`);
      await this.load();
    } catch (err) {
      const e = toApiError(err);
      this.dialogError.set(Object.values(e.fieldErrors ?? {})[0]?.[0] ?? e.message);
    } finally { this.busy.set(false); }
  }

  protected openCancel(r: LaybyDto): void {
    this.current.set(r);
    this.reason.set('');
    this.authorizer.set(null);
    this.dialogError.set(null);
    this.notice.set(null);
    this.dialog.set('cancel');
  }

  protected async cancel(): Promise<void> {
    const c = this.current();
    const authorizer = this.authorizer();
    if (!c || !authorizer) return;
    this.busy.set(true);
    this.dialogError.set(null);
    try {
      const done = await firstValueFrom(this.api.cancel(c.id, this.reason().trim(), authorizer));
      this.dialog.set(null);
      this.notice.set((done.refundedOnCancel ?? 0) > 0 ? `Layby #${c.number} cancelled. Give ${c.customerName} back ${done.refundedOnCancel}.` : `Layby #${c.number} cancelled. Nothing is refunded.`);
      await this.load();
    } catch (err) {
      this.attempts.update((n) => n + 1); // the secret is typed again after a refusal
      this.dialogError.set(toApiError(err).message);
    } finally { this.busy.set(false); }
  }
}
