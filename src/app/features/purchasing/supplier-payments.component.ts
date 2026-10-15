import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { SupplierBalanceDto, SupplierPaymentDto } from '../../core/models/nav-ops.model';
import { FEATURES, SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { TenantTimePipe } from '../../core/pipes/tenant-time.pipe';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { PurchasingApi } from '../../core/services/nav-ops.services';
import { DialogComponent, ToastService } from '../../shared/ui/feedback';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';

type Method = 'Cash' | 'Card' | 'Transfer' | 'Other';

/**
 * Payments to suppliers. What you owe a supplier is the value of goods received (cost plus recorded purchase tax) minus what you have paid.
 * Payments are never edited or deleted: a mistake is corrected by a reversing entry that stays linked to the original.
 */
@Component({
  selector: 'zp-supplier-payments',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, TenantTimePipe, DialogComponent, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-2xl font-bold">Payments to Suppliers</h1>
    <p class="mt-1 max-w-3xl text-sm text-ink/80">Record money paid to suppliers and see what is still owed. This covers the whole company.</p>
    @if (readOnly()) { <p class="sys-alert sys-alert-warning my-3" role="status">Read-only: your subscription limits this screen.</p> }
    @if (error()) { <p class="sys-alert sys-alert-danger my-3" role="alert" data-testid="pay-error">{{ error() }}</p> }

    <section class="mt-4" aria-label="Balances"><h2 class="mb-2 text-lg font-semibold">What you owe</h2>
      <div class="app-card overflow-x-auto p-0"><table class="app-table" data-testid="pay-balances">
        <thead><tr><th>Supplier</th><th class="text-right">Goods received</th><th class="text-right">Paid</th><th class="text-right">Owed</th><th></th></tr></thead>
        <tbody>@for (b of balances(); track b.supplierId) {
          <tr [attr.data-testid]="'bal-' + b.supplierName"><td class="font-medium">{{ b.supplierName }}</td><td class="text-right">{{ b.received | currency: b.currencyCode }}</td><td class="text-right">{{ b.paid | currency: b.currencyCode }}</td>
            <td class="text-right font-semibold">{{ b.balance | currency: b.currencyCode }}</td>
            <td class="text-right">@if (canPay() && !readOnly() && b.balance > 0) { <button type="button" class="btn-outline px-2 py-1 text-sm" [attr.data-testid]="'pay-' + b.supplierName" (click)="openPay(b)">Record payment</button> }</td></tr>
        } @empty { <tr><td colspan="5" class="py-6 text-center text-ink/70">{{ loading() ? 'Loading...' : 'Nothing owed to anyone.' }}</td></tr> }</tbody></table></div></section>

    <section class="mt-8" aria-label="Payments"><h2 class="mb-2 text-lg font-semibold">Payments made</h2>
      <div class="app-card overflow-x-auto p-0"><table class="app-table" data-testid="pay-list">
        <thead><tr><th>#</th><th>When</th><th>Supplier</th><th>Method</th><th class="text-right">Amount</th><th>Reference</th><th>By</th><th></th></tr></thead>
        <tbody>@for (p of payments(); track p.id) {
          <tr [attr.data-testid]="'payment-' + p.number"><td>{{ p.number }}</td><td class="text-xs">{{ p.paidAtUtc | tenantTime }}</td><td>{{ p.supplierName }}</td><td>{{ p.method }}</td>
            <td class="text-right" [class.text-danger]="p.amount < 0">{{ p.amount | currency: currency() }}</td><td>{{ p.reference }}<span class="block text-xs text-ink/60">{{ p.note }}</span></td><td class="text-xs">{{ p.recordedByName }}</td>
            <td class="text-right">@if (p.isReversed) { <zp-status-badge tone="danger">Reversed</zp-status-badge> } @else if (p.amount > 0 && canPay() && !readOnly()) { <button type="button" class="btn-ghost px-2 py-1 text-sm" [attr.data-testid]="'reverse-' + p.number" (click)="openReverse(p)">Reverse</button> }</td></tr>
        } @empty { <tr><td colspan="8" class="py-6 text-center text-ink/70">No payments yet.</td></tr> }</tbody></table></div>
      <div class="mt-2 flex items-center justify-end gap-2 text-sm"><button type="button" class="btn-outline px-3 py-1" [disabled]="page() <= 1" (click)="goPage(page() - 1)">Previous</button><span>Page {{ page() }} of {{ pages() }}</span><button type="button" class="btn-outline px-3 py-1" [disabled]="page() >= pages()" (click)="goPage(page() + 1)">Next</button></div></section>

    <zp-dialog [open]="dialog() === 'pay'" [title]="'Payment to ' + (target()?.supplierName ?? '')" (closed)="dialog.set(null)">
      @if (target(); as t) {
        <form class="space-y-3" (submit)="$event.preventDefault(); pay()">
          <p class="text-sm">Owed: <strong>{{ t.balance | currency: t.currencyCode }}</strong>. You cannot pay more than is owed.</p>
          <div><label class="app-label" for="p-amount">Amount ({{ t.currencyCode }})</label><input id="p-amount" type="number" min="0.01" step="0.01" class="app-input" data-testid="pay-amount" [ngModel]="amount()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="amount.set(+$event)" /></div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div><label class="app-label" for="p-method">Method</label><select id="p-method" class="app-input" data-testid="pay-method" [ngModel]="method()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="method.set($event)"><option value="Transfer">Bank transfer</option><option value="Cash">Cash</option><option value="Card">Card</option><option value="Other">Other</option></select></div>
            <div><label class="app-label" for="p-ref">Reference</label><input id="p-ref" class="app-input" maxlength="100" data-testid="pay-reference" [ngModel]="reference()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="reference.set($event)" /></div>
          </div>
          <div><label class="app-label" for="p-note">Note</label><input id="p-note" class="app-input" maxlength="300" [ngModel]="note()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="note.set($event)" /></div>
          @if (dialogError()) { <p class="sys-alert sys-alert-danger" role="alert">{{ dialogError() }}</p> }
          <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="pay-save" [disabled]="busy() || amount() <= 0 || amount() > t.balance">Record payment</button></div>
        </form>
      }
    </zp-dialog>

    <zp-dialog [open]="dialog() === 'reverse'" [title]="'Reverse payment #' + (reversing()?.number ?? '')" (closed)="dialog.set(null)">
      @if (reversing(); as r) {
        <p class="mb-2 text-sm">This adds a linked entry of -{{ r.amount | currency: currency() }} to {{ r.supplierName }}'s account. The original payment stays on record.</p>
        <label class="app-label" for="r-reason">Reason (required)</label><input id="r-reason" class="app-input" maxlength="300" data-testid="reverse-reason" [ngModel]="reason()" (ngModelChange)="reason.set($event)" />
        @if (dialogError()) { <p class="sys-alert sys-alert-danger mt-2" role="alert">{{ dialogError() }}</p> }
        <div class="mt-3 flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Cancel</button><button type="button" class="btn-primary" data-testid="reverse-confirm" [disabled]="busy() || reason().trim().length < 3" (click)="reverse()">Reverse payment</button></div>
      }
    </zp-dialog>
  `
})
export class SupplierPaymentsComponent implements OnInit {
  private readonly api = inject(PurchasingApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly balances = signal<readonly SupplierBalanceDto[]>([]);
  protected readonly payments = signal<readonly SupplierPaymentDto[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly dialogError = signal<string | null>(null);
  protected readonly dialog = signal<'pay' | 'reverse' | null>(null);
  protected readonly target = signal<SupplierBalanceDto | null>(null);
  protected readonly reversing = signal<SupplierPaymentDto | null>(null);
  protected readonly amount = signal(0);
  protected readonly method = signal<Method>('Transfer');
  protected readonly reference = signal('');
  protected readonly note = signal('');
  protected readonly reason = signal('');
  /** One key per attempt: a double tap or retry is the same payment, never two. */
  private key = crypto.randomUUID();
  private readonly size = 25;

  protected readonly readOnly = computed(() => this.auth.accessModeFor(FEATURES.INVENTORY) === 'readonly');
  protected readonly canPay = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.PURCHASING_PAYMENTS_MANAGE));
  protected readonly currency = computed(() => this.balances()[0]?.currencyCode ?? this.auth.tenant()?.currencyCode ?? '');
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / this.size)));

  ngOnInit(): void { void this.load(); }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [b, p] = await Promise.all([firstValueFrom(this.api.balances()), firstValueFrom(this.api.payments({ page: this.page(), pageSize: this.size }))]);
      this.balances.set(b);
      this.payments.set(p.items);
      this.total.set(p.total);
    } catch (err) { this.error.set(toApiError(err).message); } finally { this.loading.set(false); }
  }

  protected goPage(p: number): void { this.page.set(p); void this.load(); }

  protected openPay(b: SupplierBalanceDto): void {
    this.target.set(b);
    this.amount.set(b.balance);
    this.method.set('Transfer'); this.reference.set(''); this.note.set(''); this.dialogError.set(null);
    this.key = crypto.randomUUID();
    this.dialog.set('pay');
  }

  protected async pay(): Promise<void> {
    const t = this.target();
    if (!t) return;
    this.busy.set(true);
    this.dialogError.set(null);
    try {
      await firstValueFrom(this.api.record({ supplierId: t.supplierId, amount: this.amount(), method: this.method(), paidAtUtc: null, reference: this.reference().trim() || null, note: this.note().trim() || null, purchaseOrderId: null, idempotencyKey: this.key }));
      this.dialog.set(null);
      this.toast.success('Payment recorded.');
      await this.load();
    } catch (err) { this.dialogError.set(toApiError(err).message); } finally { this.busy.set(false); }
  }

  protected openReverse(p: SupplierPaymentDto): void {
    this.reversing.set(p);
    this.reason.set(''); this.dialogError.set(null);
    this.key = crypto.randomUUID();
    this.dialog.set('reverse');
  }

  protected async reverse(): Promise<void> {
    const p = this.reversing();
    if (!p) return;
    this.busy.set(true);
    this.dialogError.set(null);
    try {
      await firstValueFrom(this.api.reverse(p.id, this.reason().trim(), this.key));
      this.dialog.set(null);
      this.toast.success('Payment reversed.');
      await this.load();
    } catch (err) { this.dialogError.set(toApiError(err).message); } finally { this.busy.set(false); }
  }
}
