import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { FEATURES, SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { InventoryItemDto, PurchaseOrderDto, SuggestedOrderDto, SupplierDto } from '../../core/models/ops.model';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { BranchContextService } from '../../core/services/branch-context.service';
import { InventoryApi } from '../../core/services/ops.services';
import { DialogComponent, ToastService } from '../../shared/ui/feedback';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';

type Dialog = 'po' | 'supplier' | null;
interface PoLine { inventoryItemId: string; quantity: number; unitCost: number }

/** Suppliers, purchase orders (draft, submit, approve, receive) and explainable reorder suggestions. Nothing is sent or paid automatically. */
@Component({
    selector: 'zp-purchasing-tab',
    imports: [CurrencyPipe, DecimalPipe, FormsModule, DialogComponent, StatusBadgeComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    @if (error()) { <p class="sys-alert sys-alert-danger mb-3" role="alert">{{ error() }}</p> }

    <section class="app-card mb-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div><h2 class="font-semibold">What to reorder</h2><p class="text-sm text-ink/70">Based on reorder levels and recent usage. Each suggestion says why.</p></div>
        <div class="flex gap-2">
          <button type="button" class="btn-outline" data-testid="check-suggestions" (click)="loadSuggestions()">Check now</button>
          @if (canManage() && !readOnly() && suggestions().length) { <button type="button" class="btn-primary" data-testid="create-suggested" (click)="createSuggested()">Create draft orders</button> }
        </div>
      </div>
      @for (s of suggestions(); track s.supplierId) {
        <div class="mt-3" data-testid="suggestion">
          <p class="font-medium">{{ s.supplierName }}</p>
          <ul class="mt-1 space-y-1 text-sm">
            @for (l of s.lines; track l.inventoryItemId) {
              <li class="rounded-lg border border-ink/10 p-2"><span class="font-medium">{{ l.itemName }}</span>: order {{ l.suggestedQuantity | number: '1.0-2' }} <span class="text-ink/70">(on hand {{ l.onHand | number: '1.0-2' }})</span><br /><span class="text-xs text-ink/70">{{ l.reason }}</span></li>
            }
          </ul>
        </div>
      } @empty { @if (checked()) { <p class="mt-3 text-sm text-ink/70" data-testid="no-suggestions">Nothing needs reordering right now.</p> } }
    </section>

    <section class="mb-4">
      <div class="mb-2 flex items-center justify-between"><h2 class="text-lg font-semibold">Purchase orders</h2>
        @if (canManage() && !readOnly()) { <button type="button" class="btn-primary" data-testid="new-po" (click)="openPo()">New purchase order</button> }</div>
      <div class="app-card overflow-x-auto p-0">
        <table class="app-table"><thead><tr><th>#</th><th>Supplier</th><th>Status</th><th class="text-right">Total</th><th>Notes</th><th></th></tr></thead>
          <tbody>
            @for (p of orders(); track p.id) {
              <tr [attr.data-testid]="'po-' + p.number">
                <td>{{ p.number }}</td><td>{{ p.supplierName }}</td>
                <td><zp-status-badge [tone]="p.status === 'Received' || p.status === 'Approved' ? 'success' : p.status === 'Cancelled' ? 'danger' : 'primary'">{{ p.status }}</zp-status-badge>
                  @if (p.isSuggested) { <zp-status-badge tone="warning">Suggested</zp-status-badge> }</td>
                <td class="text-right">{{ p.totalCost | number: '1.2-2' }}</td>
                <td class="max-w-xs truncate text-xs" [title]="p.suggestionReason ?? p.notes ?? ''">{{ p.suggestionReason ?? p.notes }}</td>
                <td class="whitespace-nowrap text-right">
                  @if (canManage() && !readOnly() && p.status === 'Draft') { <button type="button" class="btn-outline px-2 py-1 text-sm" [attr.data-testid]="'submit-po-' + p.number" (click)="act(p, 'submit')">Submit</button> }
                  @if (canApprove() && !readOnly() && p.status === 'Submitted') { <button type="button" class="btn-primary px-2 py-1 text-sm" [attr.data-testid]="'approve-po-' + p.number" (click)="act(p, 'approve')">Approve</button> }
                  @if (canManage() && !readOnly() && (p.status === 'Approved' || p.status === 'PartiallyReceived')) { <button type="button" class="btn-outline px-2 py-1 text-sm" [attr.data-testid]="'receive-po-' + p.number" (click)="receiveAll(p)">Receive all</button> }
                  @if (canManage() && !readOnly() && (p.status === 'Draft' || p.status === 'Submitted' || p.status === 'Approved')) { <button type="button" class="btn-ghost px-2 py-1 text-sm" (click)="act(p, 'cancel')">Cancel</button> }
                </td>
              </tr>
            } @empty { <tr><td colspan="6" class="py-6 text-center text-ink/70">No purchase orders.</td></tr> }
          </tbody></table>
      </div>
    </section>

    <section>
      <div class="mb-2 flex items-center justify-between"><h2 class="text-lg font-semibold">Suppliers</h2>
        @if (canManage() && !readOnly()) { <button type="button" class="btn-outline" data-testid="new-supplier" (click)="openSupplier()">Add supplier</button> }</div>
      <div class="app-card overflow-x-auto p-0"><table class="app-table"><thead><tr><th>Name</th><th>Contact</th><th>Email</th><th>Phone</th></tr></thead>
        <tbody>@for (s of suppliers(); track s.id) { <tr><td>{{ s.name }} @if (s.isDemo) { <zp-status-badge tone="warning">Demo</zp-status-badge> }</td><td>{{ s.contactName }}</td><td>{{ s.email }}</td><td>{{ s.phone }}</td></tr> }
          @empty { <tr><td colspan="4" class="py-6 text-center text-ink/70">No suppliers yet.</td></tr> }</tbody></table></div>
    </section>

    <zp-dialog [open]="dialog() === 'po'" title="New purchase order" [wide]="true" (closed)="dialog.set(null)">
      <form class="space-y-3" (submit)="$event.preventDefault(); savePo()">
        <div><label class="app-label" for="po-sup">Supplier</label>
          <select id="po-sup" class="app-input" data-testid="po-supplier" [ngModel]="poSupplier()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="poSupplier.set($event)"><option value="">Choose...</option>@for (s of suppliers(); track s.id) { @if (s.isActive) { <option [value]="s.id">{{ s.name }}</option> } }</select></div>
        <div class="space-y-2">
          @for (l of poLines(); track $index) {
            <div class="grid grid-cols-[1fr_6rem_6rem_auto] items-end gap-2">
              <select class="app-input" aria-label="Item" [attr.data-testid]="'po-item-' + $index" [ngModel]="l.inventoryItemId" [ngModelOptions]="{ standalone: true }" (ngModelChange)="setLine($index, { inventoryItemId: $event })"><option value="">Item...</option>@for (i of items(); track i.id) { <option [value]="i.id">{{ i.name }}</option> }</select>
              <input type="number" min="0" step="any" class="app-input" aria-label="Quantity" [attr.data-testid]="'po-qty-' + $index" [ngModel]="l.quantity" [ngModelOptions]="{ standalone: true }" (ngModelChange)="setLine($index, { quantity: +$event })" />
              <input type="number" min="0" step="any" class="app-input" aria-label="Unit cost" [ngModel]="l.unitCost" [ngModelOptions]="{ standalone: true }" (ngModelChange)="setLine($index, { unitCost: +$event })" />
              <button type="button" class="btn-ghost px-2" aria-label="Remove line" (click)="removeLine($index)">x</button>
            </div>
          }
          <button type="button" class="btn-outline text-sm" (click)="addLine()">Add line</button>
        </div>
        @if (poError()) { <p class="sys-alert sys-alert-danger" role="alert">{{ poError() }}</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="po-save" [disabled]="saving()">Save as draft</button></div>
      </form>
    </zp-dialog>

    <zp-dialog [open]="dialog() === 'supplier'" title="Add supplier" (closed)="dialog.set(null)">
      <form class="space-y-3" (submit)="$event.preventDefault(); saveSupplier()">
        <div><label class="app-label" for="sp-name">Name</label><input id="sp-name" class="app-input" data-testid="supplier-name" [ngModel]="supName()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="supName.set($event)" /></div>
        <div><label class="app-label" for="sp-email">Email</label><input id="sp-email" type="email" class="app-input" [ngModel]="supEmail()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="supEmail.set($event)" /></div>
        @if (poError()) { <p class="sys-alert sys-alert-danger" role="alert">{{ poError() }}</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="supplier-save" [disabled]="saving() || !supName().trim()">Save</button></div>
      </form>
    </zp-dialog>
  `
})
export class PurchasingTabComponent {
  private readonly api = inject(InventoryApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  protected readonly branches = inject(BranchContextService);

  protected readonly dialog = signal<Dialog>(null);
  protected readonly orders = signal<readonly PurchaseOrderDto[]>([]);
  protected readonly suppliers = signal<readonly SupplierDto[]>([]);
  protected readonly items = signal<readonly InventoryItemDto[]>([]);
  protected readonly suggestions = signal<readonly SuggestedOrderDto[]>([]);
  protected readonly checked = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly poError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly poSupplier = signal('');
  protected readonly poLines = signal<readonly PoLine[]>([{ inventoryItemId: '', quantity: 0, unitCost: 0 }]);
  protected readonly supName = signal('');
  protected readonly supEmail = signal('');

  protected readonly readOnly = computed(() => this.auth.accessModeFor(FEATURES.INVENTORY) === 'readonly');
  protected readonly canManage = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.INVENTORY_PURCHASE_MANAGE));
  protected readonly canApprove = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.INVENTORY_PURCHASE_APPROVE));

  constructor() {
    effect(() => {
      if (this.branches.activeId()) untracked(() => void this.load());
    });
  }

  private async load(): Promise<void> {
    const branchId = this.branches.activeId();
    if (!branchId) return;
    try {
      const [orders, suppliers, items] = await Promise.all([
        firstValueFrom(this.api.purchaseOrders({ branchId })),
        firstValueFrom(this.api.suppliers()),
        firstValueFrom(this.api.items({ branchId, pageSize: 200 }))
      ]);
      this.orders.set(orders);
      this.suppliers.set(suppliers);
      this.items.set(items.items);
    } catch (err) { this.error.set(toApiError(err).message); }
  }

  protected async loadSuggestions(): Promise<void> {
    const branchId = this.branches.activeId();
    if (!branchId) return;
    this.error.set(null);
    try {
      this.suggestions.set(await firstValueFrom(this.api.suggestions(branchId)));
      this.checked.set(true);
    } catch (err) { this.error.set(toApiError(err).message); }
  }

  protected async createSuggested(): Promise<void> {
    const branchId = this.branches.activeId();
    if (!branchId) return;
    try {
      const created = await firstValueFrom(this.api.createSuggested(branchId));
      this.toast.success(`${created.length} draft order(s) created. Review and approve them before anything is ordered.`);
      this.suggestions.set([]);
      await this.load();
    } catch (err) { this.error.set(toApiError(err).message); }
  }

  protected async act(p: PurchaseOrderDto, action: 'submit' | 'approve' | 'cancel'): Promise<void> {
    this.error.set(null);
    try {
      await firstValueFrom(this.api.purchaseOrderAction(p.id, action));
      await this.load();
    } catch (err) { this.error.set(toApiError(err).message); }
  }

  protected async receiveAll(p: PurchaseOrderDto): Promise<void> {
    const branchId = this.branches.activeId();
    if (!branchId) return;
    this.error.set(null);
    try {
      await firstValueFrom(this.api.receive({
        branchId, supplierId: p.supplierId, purchaseOrderId: p.id, reference: `PO ${p.number}`, idempotencyKey: `po-rcv-${crypto.randomUUID()}`,
        lines: p.lines.filter((l) => l.quantityOrdered > l.quantityReceived).map((l) => ({
          inventoryItemId: l.inventoryItemId, quantity: l.quantityOrdered - l.quantityReceived, unitCost: l.unitCost, lotCode: null, expiryDate: null, purchaseOrderLineId: l.id
        }))
      }));
      this.toast.success('Goods received against the order.');
      await this.load();
    } catch (err) { this.error.set(toApiError(err).message); }
  }

  // ---- dialogs ----
  protected openPo(): void {
    this.poSupplier.set('');
    this.poLines.set([{ inventoryItemId: '', quantity: 0, unitCost: 0 }]);
    this.poError.set(null);
    this.dialog.set('po');
  }

  protected addLine(): void { this.poLines.update((l) => [...l, { inventoryItemId: '', quantity: 0, unitCost: 0 }]); }
  protected removeLine(i: number): void { this.poLines.update((l) => (l.length > 1 ? l.filter((_, x) => x !== i) : l)); }

  protected setLine(i: number, p: Partial<PoLine>): void {
    this.poLines.update((lines) => lines.map((l, x) => {
      if (x !== i) return l;
      const next = { ...l, ...p };
      if (p.inventoryItemId && next.unitCost === 0) next.unitCost = this.items().find((it) => it.id === p.inventoryItemId)?.averageCost ?? 0;
      return next;
    }));
  }

  protected async savePo(): Promise<void> {
    const branchId = this.branches.activeId();
    if (!branchId) return;
    const lines = this.poLines().filter((l) => l.inventoryItemId && l.quantity > 0);
    if (!this.poSupplier() || lines.length === 0) { this.poError.set('Choose a supplier and at least one item with a quantity.'); return; }
    this.saving.set(true);
    this.poError.set(null);
    try {
      await firstValueFrom(this.api.savePurchaseOrder(null, { branchId, supplierId: this.poSupplier(), notes: null, lines, rowVersion: null }));
      this.dialog.set(null);
      await this.load();
    } catch (err) { this.poError.set(toApiError(err).message); } finally { this.saving.set(false); }
  }

  protected openSupplier(): void {
    this.supName.set('');
    this.supEmail.set('');
    this.poError.set(null);
    this.dialog.set('supplier');
  }

  protected async saveSupplier(): Promise<void> {
    this.saving.set(true);
    this.poError.set(null);
    try {
      await firstValueFrom(this.api.saveSupplier(null, { name: this.supName().trim(), contactName: null, email: this.supEmail().trim() || null, phone: null, isActive: true }));
      this.dialog.set(null);
      await this.load();
    } catch (err) { this.poError.set(toApiError(err).message); } finally { this.saving.set(false); }
  }
}
