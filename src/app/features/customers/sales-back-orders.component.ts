import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { InventoryItemDto } from '../../core/models/ops.model';
import { FEATURES } from '../../core/models/rbac.model';
import { ApiError, toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { BranchContextService } from '../../core/services/branch-context.service';
import { CustomerDto, CustomersApi, SalesBackOrderDto, SalesBackOrderStatus, SalesBackOrdersApi } from '../../core/services/customer.services';
import { InventoryApi } from '../../core/services/ops.services';
import { DialogComponent, ToastService } from '../../shared/ui/feedback';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';

/**
 * Sales back orders: what customers are waiting for at this branch. Recording one takes no money and moves no stock. When the branch
 * has enough, "Put on a bill" opens a new bill for the customer with the item on it, to be paid at the till like any sale.
 */
@Component({
  selector: 'zp-sales-back-orders',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, RouterLink, DialogComponent, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-bold">Sales Back Orders</h1>
      <button type="button" class="btn-primary" data-testid="bo-new" [disabled]="readOnly() || !branchId()" (click)="openNew()">New back order</button>
    </div>
    <div class="mb-3 flex flex-wrap items-center gap-3">
      <label class="text-sm" for="bo-status">Show</label>
      <select id="bo-status" class="app-input max-w-[12rem]" data-testid="bo-status" [ngModel]="status()" (ngModelChange)="status.set($event); load()">
        <option value="Waiting">Waiting</option><option value="Supplied">Supplied</option><option value="Cancelled">Cancelled</option><option value="">All</option>
      </select>
      <input class="app-input max-w-sm" placeholder="Customer, phone or item" aria-label="Search back orders" data-testid="bo-search" [ngModel]="search()" (ngModelChange)="search.set($event)" (keydown.enter)="load()" />
      <button type="button" class="btn-outline" (click)="load()">Search</button>
    </div>
    @if (!branchId()) { <p class="sys-alert sys-alert-warning mb-3" role="status">Choose a branch at the top of the page.</p> }
    @if (readOnly()) { <p class="sys-alert sys-alert-warning mb-3" role="status">Read-only: your subscription limits this screen.</p> }
    @if (error()) { <p class="sys-alert sys-alert-danger mb-3" role="alert" data-testid="bo-error">{{ error() }}</p> }
    @if (lastBill(); as b) {
      <p class="sys-alert sys-alert-success mb-3" role="status" data-testid="bo-done">{{ b }} <a class="font-semibold underline" routerLink="/app/pos">Open Point of Sale</a> to take payment.</p>
    }

    <div class="app-card overflow-x-auto p-0" data-testid="bo-table">
      <table class="app-table">
        <caption class="sr-only">Sales back orders</caption>
        <thead><tr><th>No.</th><th>Asked on</th><th>Customer</th><th>Item</th><th class="text-right">Qty</th><th class="text-right">On hand</th><th>State</th><th></th></tr></thead>
        <tbody>
          @for (r of rows(); track r.id) {
            <tr [attr.data-testid]="'bo-' + r.customerName + '-' + r.itemName">
              <td class="font-mono text-xs">{{ r.number }}</td><td>{{ r.createdAtUtc | date: 'mediumDate' }}</td>
              <td class="font-medium">{{ r.customerName }} <span class="block font-mono text-xs font-normal text-ink/70">{{ r.customerPhone }}</span></td>
              <td>{{ r.itemName }} @if (r.note) { <span class="block text-xs text-ink/70">{{ r.note }}</span> }</td>
              <td class="text-right font-mono">{{ r.quantity | number: '1.0-3' }}</td>
              <td class="text-right font-mono">{{ r.onHand === null ? '' : (r.onHand | number: '1.0-3') }}</td>
              <td>
                @if (r.status === 'Waiting') { <zp-status-badge [tone]="r.canSupply ? 'success' : 'warning'">{{ r.canSupply ? 'Can be supplied now' : 'Waiting for stock' }}</zp-status-badge> }
                @else if (r.status === 'Supplied') { <zp-status-badge tone="primary">On bill #{{ r.suppliedOrderNumber }}</zp-status-badge> }
                @else { <zp-status-badge tone="danger">Cancelled</zp-status-badge> <span class="block text-xs text-ink/70">{{ r.cancelReason }}</span> }
              </td>
              <td class="whitespace-nowrap text-right">
                @if (r.status === 'Waiting' && !readOnly()) {
                  <button type="button" class="btn-outline px-2 py-1 text-sm" [attr.data-testid]="'bo-fulfil-' + r.customerName" [disabled]="busy()" [attr.title]="r.canSupply ? null : 'The branch does not have enough yet. The bill can still be opened.'" (click)="fulfil(r)">Put on a bill</button>
                  <button type="button" class="btn-ghost px-2 py-1 text-sm text-danger" [attr.data-testid]="'bo-cancel-' + r.customerName" (click)="openCancel(r)">Cancel</button>
                }
              </td>
            </tr>
          } @empty { <tr><td colspan="8" class="py-8 text-center text-ink/70">{{ loading() ? 'Loading...' : 'Nothing here.' }}</td></tr> }
        </tbody>
      </table>
    </div>
    <p class="mt-2 text-xs text-ink/70">"Can be supplied now" counts earlier back orders for the same item first. Stock leaves the shelf when the bill is sent or paid, as for any sale.</p>

    <zp-dialog [open]="dialog() === 'new'" title="New back order" (closed)="dialog.set(null)">
      <form class="space-y-3" autocomplete="off" (submit)="$event.preventDefault(); create()">
        <div>
          <label class="app-label" for="bo-cust">Customer</label>
          @if (customer(); as c) {
            <p class="flex items-center justify-between rounded-lg border border-ink/15 px-3 py-2" data-testid="bo-customer-chosen"><span>{{ c.name }} <span class="font-mono text-xs text-ink/70">{{ c.phone }}</span></span><button type="button" class="btn-ghost px-2 py-0.5 text-sm" (click)="customer.set(null)">Change</button></p>
          } @else {
            <input id="bo-cust" class="app-input" placeholder="Phone or name" autocomplete="off" data-testid="bo-customer-search" [ngModel]="customerSearch()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="findCustomers($event)" />
            @if (customerResults().length) {
              <ul class="mt-1 divide-y divide-ink/10 rounded-lg border border-ink/15">
                @for (c of customerResults(); track c.id) { <li><button type="button" class="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-ink/10" [attr.data-testid]="'bo-customer-' + c.name" (click)="customer.set(c); customerResults.set([])"><span>{{ c.name }}</span><span class="font-mono">{{ c.phone }}</span></button></li> }
              </ul>
            } @else if (customerSearch().trim().length >= 2) { <p class="mt-1 text-xs text-ink/70">Nobody found. Add the customer on the Customers screen or at the till first.</p> }
          }
          @if (fe('customerId')) { <p class="app-error" role="alert">{{ fe('customerId') }}</p> }
        </div>
        <div>
          <label class="app-label" for="bo-item">Item</label>
          @if (item(); as i) {
            <p class="flex items-center justify-between rounded-lg border border-ink/15 px-3 py-2" data-testid="bo-item-chosen"><span>{{ i.name }} @if (i.sku) { <span class="font-mono text-xs text-ink/70">{{ i.sku }}</span> }</span><button type="button" class="btn-ghost px-2 py-0.5 text-sm" (click)="item.set(null)">Change</button></p>
          } @else {
            <input id="bo-item" class="app-input" placeholder="Name or part number" autocomplete="off" data-testid="bo-item-search" [ngModel]="itemSearch()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="findItems($event)" />
            @if (itemResults().length) {
              <ul class="mt-1 divide-y divide-ink/10 rounded-lg border border-ink/15">
                @for (i of itemResults(); track i.id) { <li><button type="button" class="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-ink/10" [attr.data-testid]="'bo-item-' + i.name" (click)="item.set(i); itemResults.set([])"><span>{{ i.name }}</span><span class="font-mono text-xs">{{ i.sku }}</span></button></li> }
              </ul>
            }
          }
          @if (fe('inventoryItemId')) { <p class="app-error" role="alert" data-testid="bo-item-error">{{ fe('inventoryItemId') }}</p> }
        </div>
        <div class="grid gap-3 sm:grid-cols-[8rem_1fr]">
          <div><label class="app-label" for="bo-qty">Quantity</label><input id="bo-qty" type="number" min="0" step="any" class="app-input" data-testid="bo-qty" [ngModel]="quantity()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="quantity.set(+$event)" />
            @if (fe('quantity')) { <p class="app-error" role="alert">{{ fe('quantity') }}</p> }</div>
          <div><label class="app-label" for="bo-note">Note (optional)</label><input id="bo-note" class="app-input" maxlength="300" data-testid="bo-note" [ngModel]="note()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="note.set($event)" /></div>
        </div>
        <p class="text-xs text-ink/70">No money is taken now. The price is the item's price on the day it is put on a bill.</p>
        @if (dialogError()) { <p class="sys-alert sys-alert-danger" role="alert">{{ dialogError() }}</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Close</button><button type="submit" class="btn-primary" data-testid="bo-save" [disabled]="busy() || !customer() || !item() || !(quantity() > 0)">Record back order</button></div>
      </form>
    </zp-dialog>

    <zp-dialog [open]="dialog() === 'cancel'" [title]="'Cancel back order #' + (cancelling()?.number ?? '')" (closed)="dialog.set(null)">
      <label class="app-label" for="bo-reason">Why is it cancelled?</label>
      <input id="bo-reason" class="app-input" maxlength="200" data-testid="bo-reason" [ngModel]="reason()" (ngModelChange)="reason.set($event)" />
      @if (dialogError()) { <p class="sys-alert sys-alert-danger mt-3" role="alert">{{ dialogError() }}</p> }
      <div class="mt-4 flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Keep it</button><button type="button" class="btn-primary" data-testid="bo-cancel-confirm" [disabled]="busy() || reason().trim().length < 3" (click)="cancel()">Cancel back order</button></div>
    </zp-dialog>
  `
})
export class SalesBackOrdersComponent {
  private readonly api = inject(SalesBackOrdersApi);
  private readonly customersApi = inject(CustomersApi);
  private readonly inventory = inject(InventoryApi);
  private readonly auth = inject(AuthService);
  private readonly branches = inject(BranchContextService);
  private readonly toast = inject(ToastService);

  protected readonly branchId = this.branches.activeId;
  protected readonly rows = signal<readonly SalesBackOrderDto[]>([]);
  protected readonly status = signal<SalesBackOrderStatus | ''>('Waiting');
  protected readonly search = signal('');
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly lastBill = signal<string | null>(null);
  protected readonly dialog = signal<'new' | 'cancel' | null>(null);
  protected readonly dialogError = signal<string | null>(null);
  private readonly fieldErrors = signal<Readonly<Record<string, readonly string[]>>>({});

  protected readonly customer = signal<CustomerDto | null>(null);
  protected readonly customerSearch = signal('');
  protected readonly customerResults = signal<readonly CustomerDto[]>([]);
  protected readonly item = signal<InventoryItemDto | null>(null);
  protected readonly itemSearch = signal('');
  protected readonly itemResults = signal<readonly InventoryItemDto[]>([]);
  protected readonly quantity = signal(1);
  protected readonly note = signal('');
  protected readonly cancelling = signal<SalesBackOrderDto | null>(null);
  protected readonly reason = signal('');
  private seq = 0;

  protected readonly readOnly = computed(() => this.auth.accessModeFor(FEATURES.CORE_POS) === 'readonly');

  constructor() {
    void this.branches.load(); // the branch picked in the header; loaded here too so the screen works when opened directly
    effect(() => { this.branchId(); untracked(() => void this.load()); }, { allowSignalWrites: true });
  }

  protected fe = (name: string): string | null => this.fieldErrors()[name]?.[0] ?? null;

  protected async load(): Promise<void> {
    const branchId = this.branchId();
    if (!branchId) { this.rows.set([]); return; }
    this.loading.set(true);
    this.error.set(null);
    try { this.rows.set((await firstValueFrom(this.api.list({ branchId, status: this.status(), search: this.search().trim(), pageSize: 200 }))).items); }
    catch (err) { this.error.set(toApiError(err).message); }
    finally { this.loading.set(false); }
  }

  protected openNew(): void {
    this.customer.set(null);
    this.item.set(null);
    this.customerSearch.set('');
    this.itemSearch.set('');
    this.customerResults.set([]);
    this.itemResults.set([]);
    this.quantity.set(1);
    this.note.set('');
    this.fieldErrors.set({});
    this.dialogError.set(null);
    this.dialog.set('new');
  }

  protected findCustomers(text: string): void {
    this.customerSearch.set(text);
    const mine = ++this.seq;
    if (text.trim().length < 2) { this.customerResults.set([]); return; }
    void firstValueFrom(this.customersApi.list({ search: text.trim(), pageSize: 8 })).then((r) => { if (mine === this.seq) this.customerResults.set(r.items); }).catch((err) => this.dialogError.set(toApiError(err).message));
  }

  protected findItems(text: string): void {
    this.itemSearch.set(text);
    const mine = ++this.seq;
    if (text.trim().length < 2) { this.itemResults.set([]); return; }
    void firstValueFrom(this.inventory.items({ search: text.trim(), active: true, pageSize: 8 })).then((r) => { if (mine === this.seq) this.itemResults.set(r.items); }).catch((err) => this.dialogError.set(toApiError(err).message));
  }

  protected async create(): Promise<void> {
    const branchId = this.branchId();
    const customer = this.customer();
    const item = this.item();
    if (!branchId || !customer || !item) return;
    this.busy.set(true);
    this.fieldErrors.set({});
    this.dialogError.set(null);
    try {
      await firstValueFrom(this.api.create({ branchId, customerId: customer.id, inventoryItemId: item.id, quantity: this.quantity(), note: this.note().trim() || null }));
      this.dialog.set(null);
      this.toast.success('Back order recorded.');
      this.status.set('Waiting');
      await this.load();
    } catch (err) {
      const e = toApiError(err) as ApiError;
      this.fieldErrors.set(e.fieldErrors);
      this.dialogError.set(Object.keys(e.fieldErrors).length === 0 ? e.message : null);
    } finally { this.busy.set(false); }
  }

  protected async fulfil(r: SalesBackOrderDto): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.lastBill.set(null);
    try {
      const done = await firstValueFrom(this.api.fulfil(r.id));
      this.lastBill.set(`${r.quantity} x ${r.itemName} is on bill #${done.suppliedOrderNumber} for ${r.customerName}.`);
      await this.load();
    } catch (err) { this.error.set(toApiError(err).message); }
    finally { this.busy.set(false); }
  }

  protected openCancel(r: SalesBackOrderDto): void {
    this.cancelling.set(r);
    this.reason.set('');
    this.dialogError.set(null);
    this.dialog.set('cancel');
  }

  protected async cancel(): Promise<void> {
    const r = this.cancelling();
    if (!r) return;
    this.busy.set(true);
    this.dialogError.set(null);
    try {
      await firstValueFrom(this.api.cancel(r.id, this.reason().trim()));
      this.dialog.set(null);
      this.toast.success('Back order cancelled.');
      await this.load();
    } catch (err) { this.dialogError.set(toApiError(err).message); }
    finally { this.busy.set(false); }
  }
}
