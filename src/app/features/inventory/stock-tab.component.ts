import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { FEATURES, SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import {
  BatchDto, InventoryItemDto, MovementDto, SaveInventoryItemRequest, StockMovementType, StockUnit, SupplierDto
} from '../../core/models/ops.model';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { BranchContextService } from '../../core/services/branch-context.service';
import { InventoryApi } from '../../core/services/ops.services';
import { SyncAgentService } from '../../core/services/sync-agent.service';
import { DialogComponent, ToastService } from '../../shared/ui/feedback';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';

type Dialog = 'item' | 'adjust' | 'receive' | 'transfer' | 'history' | null;

const UNIT_LABEL: Record<StockUnit, string> = { Milliliter: 'ml', Gram: 'g', Each: 'each' };

const blankItem = (): SaveInventoryItemRequest => ({
  name: '', sku: null, kind: 'Ingredient', baseUnit: 'Milliliter', containerSize: null, tareGrams: null, densityGPerMl: null, minimumLevel: 0,
  reorderLevel: 0, targetDaysOfStock: 14, averageCost: 0, supplierId: null, tracksBatches: false, isActive: true, rowVersion: null
});

/** Stock levels, item set-up, adjustments, goods received, transfers and batch/expiry view for the active branch. */
@Component({
  selector: 'zp-stock-tab',
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe, FormsModule, DialogComponent, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <input class="app-input max-w-xs" type="search" placeholder="Search items" aria-label="Search items" data-testid="stock-search" [ngModel]="search()" (ngModelChange)="search.set($event); load()" />
      <label class="flex items-center gap-2 text-sm"><input type="checkbox" data-testid="low-only" [checked]="lowOnly()" (change)="lowOnly.set(!lowOnly()); load()" /> Low stock only</label>
      <span class="ml-auto flex flex-wrap gap-2">
        @if (canAdjust() && !readOnly()) { <button type="button" class="btn-primary" data-testid="new-item" (click)="openItem(null)">New item</button> }
        @if (canPurchase() && !readOnly()) { <button type="button" class="btn-outline" data-testid="receive-goods" (click)="openReceive()">Receive goods</button> }
        @if (canAdjust() && canTransfer() && !readOnly()) { <button type="button" class="btn-outline" (click)="openTransfer()">Transfer</button> }
      </span>
    </div>
    @if (error()) { <p class="sys-alert sys-alert-danger mb-3" role="alert">{{ error() }}</p> }

    <div class="app-card overflow-x-auto p-0">
      <table class="app-table">
        <caption class="sr-only">Stock at the current branch</caption>
        <thead><tr><th>Item</th><th class="text-right">On hand</th><th class="text-right">Reorder at</th><th class="text-right">Avg cost</th><th class="text-right">Value</th><th>Last weighed</th><th></th></tr></thead>
        <tbody>
          @for (i of items(); track i.id) {
            <tr [attr.data-testid]="'item-' + i.name">
              <td class="font-medium">{{ i.name }} @if (i.isDemo) { <zp-status-badge tone="warning">Demo</zp-status-badge> } @if (!i.isActive) { <zp-status-badge tone="danger">Inactive</zp-status-badge> }
                <span class="block text-xs font-normal text-ink/60">{{ i.sku }}</span></td>
              <td class="text-right" [class.text-danger]="i.onHand < 0" data-testid="on-hand">
                {{ i.onHand | number: '1.0-2' }} {{ unit(i.baseUnit) }}
                @if (i.belowMinimum) { <zp-status-badge tone="danger">Below minimum</zp-status-badge> } @else if (i.belowReorder) { <zp-status-badge tone="warning">Reorder</zp-status-badge> }
              </td>
              <td class="text-right">{{ i.reorderLevel | number: '1.0-2' }}</td>
              <td class="text-right">{{ i.averageCost | currency: 'USD' : '' : '1.2-4' }}</td>
              <td class="text-right">{{ i.stockValue | number: '1.2-2' }}</td>
              <td class="text-sm">@if (i.lastMeasured !== null) { {{ i.lastMeasured | number: '1.0-2' }} {{ unit(i.baseUnit) }} } @else { <span class="text-ink/50">never</span> }</td>
              <td class="whitespace-nowrap text-right">
                <button type="button" class="btn-ghost px-2 py-1 text-sm" (click)="openHistory(i)">History</button>
                @if (canAdjust() && !readOnly()) {
                  <button type="button" class="btn-outline px-2 py-1 text-sm" [attr.data-testid]="'adjust-' + i.name" (click)="openAdjust(i)">Adjust</button>
                  <button type="button" class="btn-ghost px-2 py-1 text-sm" (click)="openItem(i)">Edit</button>
                }
              </td>
            </tr>
          } @empty { <tr><td colspan="7" class="py-8 text-center text-ink/70">{{ loading() ? 'Loading...' : 'No stock items yet.' }}</td></tr> }
        </tbody>
      </table>
    </div>

    @if (batches().length > 0) {
      <h2 class="mb-2 mt-6 text-lg font-semibold">Batches expiring soon or expired</h2>
      <div class="app-card overflow-x-auto p-0">
        <table class="app-table"><thead><tr><th>Item</th><th>Lot</th><th>Expires</th><th class="text-right">Remaining</th><th></th></tr></thead>
          <tbody>@for (b of batches(); track b.id) { <tr><td>{{ b.itemName }}</td><td class="font-mono text-xs">{{ b.lotCode }}</td><td>{{ b.expiryDate?.slice(0, 10) }}</td><td class="text-right">{{ b.quantityRemaining | number: '1.0-2' }}</td>
            <td><zp-status-badge [tone]="b.expired ? 'danger' : 'warning'">{{ b.expired ? 'Expired' : 'Expiring soon' }}</zp-status-badge></td></tr> }</tbody></table>
      </div>
    }

    <!-- Item -->
    <zp-dialog [open]="dialog() === 'item'" [title]="editingId() ? 'Edit item' : 'New stock item'" [wide]="true" (closed)="dialog.set(null)">
      <form class="grid gap-3 sm:grid-cols-2" (submit)="$event.preventDefault(); saveItem()">
        <div class="sm:col-span-2"><label class="app-label" for="it-name">Name</label><input id="it-name" class="app-input" data-testid="item-name" [ngModel]="item().name" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchItem({ name: $event })" />
          @if (fe()['name']) { <p class="app-error" role="alert">{{ fe()['name'] }}</p> }</div>
        <div><label class="app-label" for="it-unit">Unit</label>
          <select id="it-unit" class="app-input" data-testid="item-unit" [ngModel]="item().baseUnit" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchItem({ baseUnit: $event })" [disabled]="!!editingId()">
            <option value="Milliliter">Millilitres (liquids)</option><option value="Gram">Grams</option><option value="Each">Each (counted)</option></select></div>
        <div><label class="app-label" for="it-kind">Kind</label>
          <select id="it-kind" class="app-input" [ngModel]="item().kind" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchItem({ kind: $event })"><option value="Ingredient">Ingredient</option><option value="FinishedGood">Finished good (resold as is)</option></select></div>
        <div><label class="app-label" for="it-sku">SKU</label><input id="it-sku" class="app-input" [ngModel]="item().sku" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchItem({ sku: $event || null })" />
          @if (fe()['sku']) { <p class="app-error" role="alert">{{ fe()['sku'] }}</p> }</div>
        <div><label class="app-label" for="it-cost">Average cost per {{ unit(item().baseUnit) }}</label><input id="it-cost" type="number" min="0" step="0.0001" class="app-input" [ngModel]="item().averageCost" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchItem({ averageCost: +$event })" /></div>
        <div><label class="app-label" for="it-min">Minimum level</label><input id="it-min" type="number" min="0" class="app-input" [ngModel]="item().minimumLevel" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchItem({ minimumLevel: +$event })" /></div>
        <div><label class="app-label" for="it-reorder">Reorder level</label><input id="it-reorder" type="number" min="0" class="app-input" data-testid="item-reorder" [ngModel]="item().reorderLevel" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchItem({ reorderLevel: +$event })" />
          @if (fe()['reorderLevel']) { <p class="app-error" role="alert">{{ fe()['reorderLevel'] }}</p> }</div>
        <div><label class="app-label" for="it-days">Days of cover to order up to</label><input id="it-days" type="number" min="1" max="365" class="app-input" [ngModel]="item().targetDaysOfStock" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchItem({ targetDaysOfStock: +$event })" /></div>
        <div><label class="app-label" for="it-sup">Supplier</label>
          <select id="it-sup" class="app-input" [ngModel]="item().supplierId" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchItem({ supplierId: $event || null })"><option [ngValue]="null">None</option>@for (s of suppliers(); track s.id) { <option [ngValue]="s.id">{{ s.name }}</option> }</select></div>
        @if (item().baseUnit === 'Milliliter') {
          <div><label class="app-label" for="it-cs">Bottle size (ml)</label><input id="it-cs" type="number" min="0" class="app-input" [ngModel]="item().containerSize" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchItem({ containerSize: $event ? +$event : null })" /></div>
          <div><label class="app-label" for="it-tare">Empty bottle weight (g)</label><input id="it-tare" type="number" min="0" class="app-input" data-testid="item-tare" [ngModel]="item().tareGrams" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchItem({ tareGrams: $event ? +$event : null })" /></div>
          <div><label class="app-label" for="it-dens">Density (g per ml)</label><input id="it-dens" type="number" min="0.01" max="100" step="0.01" class="app-input" data-testid="item-density" [ngModel]="item().densityGPerMl" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchItem({ densityGPerMl: $event ? +$event : null })" />
            <p class="mt-1 text-xs text-ink/70">Needed to turn a weighed bottle into millilitres. Liquids differ (gin is about 0.94), so it is never assumed.</p>
            @if (fe()['baseUnit']) { <p class="app-error" role="alert">{{ fe()['baseUnit'] }}</p> }</div>
        }
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" [checked]="item().tracksBatches" (change)="patchItem({ tracksBatches: !item().tracksBatches })" /> Track batches and expiry</label>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" [checked]="item().isActive" (change)="patchItem({ isActive: !item().isActive })" /> Active</label>
        <div class="flex justify-end gap-2 sm:col-span-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="item-save" [disabled]="saving()">Save item</button></div>
      </form>
    </zp-dialog>

    <!-- Adjust -->
    <zp-dialog [open]="dialog() === 'adjust'" [title]="'Adjust stock: ' + (target()?.name ?? '')" (closed)="dialog.set(null)">
      @if (!sync.online()) { <p class="sys-alert sys-alert-info mb-3" role="status">You are offline. This change is saved on this device and applied when you reconnect.</p> }
      <form class="space-y-3" (submit)="$event.preventDefault(); submitAdjust()">
        <div><label class="app-label" for="ad-type">What happened</label>
          <select id="ad-type" class="app-input" data-testid="adjust-type" [ngModel]="adj().type" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchAdj({ type: $event })">
            <option value="Adjustment">Correct the count</option><option value="Waste">Waste</option><option value="Spillage">Spillage</option><option value="Breakage">Breakage</option></select></div>
        @if (adj().type === 'Adjustment') {
          <div class="flex gap-4 text-sm"><label><input type="radio" name="dir" [checked]="adj().direction === 'up'" (change)="patchAdj({ direction: 'up' })" /> Add stock</label><label><input type="radio" name="dir" data-testid="adjust-down" [checked]="adj().direction === 'down'" (change)="patchAdj({ direction: 'down' })" /> Remove stock</label></div>
        }
        <div><label class="app-label" for="ad-qty">Quantity ({{ unit(target()?.baseUnit ?? 'Each') }})</label><input id="ad-qty" type="number" min="0" step="any" class="app-input" data-testid="adjust-qty" [ngModel]="adj().quantity" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchAdj({ quantity: +$event })" /></div>
        <div><label class="app-label" for="ad-reason">Reason (required)</label><input id="ad-reason" class="app-input" data-testid="adjust-reason" [ngModel]="adj().reason" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchAdj({ reason: $event })" /></div>
        @if (adjError()) { <p class="sys-alert sys-alert-danger" role="alert">{{ adjError() }}</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="adjust-save" [disabled]="saving() || adj().quantity <= 0 || adj().reason.trim().length < 3">Record</button></div>
      </form>
    </zp-dialog>

    <!-- Receive -->
    <zp-dialog [open]="dialog() === 'receive'" title="Receive goods" [wide]="true" (closed)="dialog.set(null)">
      <form class="space-y-3" (submit)="$event.preventDefault(); submitReceive()">
        <div class="grid gap-3 sm:grid-cols-2">
          <div><label class="app-label" for="rc-item">Item</label>
            <select id="rc-item" class="app-input" data-testid="receive-item" [ngModel]="rc().itemId" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchRc({ itemId: $event })"><option value="">Choose...</option>@for (i of items(); track i.id) { <option [value]="i.id">{{ i.name }}</option> }</select></div>
          <div><label class="app-label" for="rc-ref">Delivery note / reference</label><input id="rc-ref" class="app-input" [ngModel]="rc().reference" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchRc({ reference: $event })" /></div>
          <div><label class="app-label" for="rc-qty">Quantity received</label><input id="rc-qty" type="number" min="0" step="any" class="app-input" data-testid="receive-qty" [ngModel]="rc().quantity" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchRc({ quantity: +$event })" /></div>
          <div><label class="app-label" for="rc-cost">Cost per unit</label><input id="rc-cost" type="number" min="0" step="any" class="app-input" data-testid="receive-cost" [ngModel]="rc().unitCost" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchRc({ unitCost: +$event })" /></div>
          <div><label class="app-label" for="rc-sup">Supplier</label><select id="rc-sup" class="app-input" data-testid="receive-supplier" [ngModel]="rc().supplierId" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchRc({ supplierId: $event })"><option value="">None recorded</option>@for (s of suppliers(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }</select></div>
          <div><label class="app-label" for="rc-tax">Purchase tax on this line (%)</label><input id="rc-tax" type="number" min="0" max="100" step="any" class="app-input" data-testid="receive-tax" [ngModel]="rc().tax" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchRc({ tax: +$event })" /></div>
          @if (receiveItem()?.tracksSerials) {
            <div class="sm:col-span-2"><label class="app-label" for="rc-serials">Serial numbers (one per line; one for each unit received)</label><textarea id="rc-serials" rows="4" class="app-input font-mono" data-testid="receive-serials" [ngModel]="rc().serials" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchRc({ serials: $event })"></textarea></div>
          }
          @if (receiveItem()?.tracksBatches) {
            <div><label class="app-label" for="rc-lot">Lot code</label><input id="rc-lot" class="app-input" [ngModel]="rc().lot" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchRc({ lot: $event })" /></div>
            <div><label class="app-label" for="rc-exp">Expiry date</label><input id="rc-exp" type="date" class="app-input" [ngModel]="rc().expiry" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchRc({ expiry: $event })" /></div>
          }
        </div>
        @if (adjError()) { <p class="sys-alert sys-alert-danger" role="alert">{{ adjError() }}</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="receive-save" [disabled]="saving() || !rc().itemId || rc().quantity <= 0">Record delivery</button></div>
      </form>
    </zp-dialog>

    <!-- Transfer -->
    <zp-dialog [open]="dialog() === 'transfer'" title="Transfer stock to another branch" (closed)="dialog.set(null)">
      <form class="space-y-3" (submit)="$event.preventDefault(); submitTransfer()">
        <div><label class="app-label" for="tf-to">To branch</label>
          <select id="tf-to" class="app-input" [ngModel]="tf().toBranchId" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchTf({ toBranchId: $event })"><option value="">Choose...</option>@for (b of otherBranches(); track b.id) { <option [value]="b.id">{{ b.name }}</option> }</select></div>
        <div><label class="app-label" for="tf-item">Item</label>
          <select id="tf-item" class="app-input" [ngModel]="tf().itemId" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchTf({ itemId: $event })"><option value="">Choose...</option>@for (i of items(); track i.id) { <option [value]="i.id">{{ i.name }} ({{ i.onHand | number: '1.0-2' }})</option> }</select></div>
        <div><label class="app-label" for="tf-qty">Quantity</label><input id="tf-qty" type="number" min="0" step="any" class="app-input" [ngModel]="tf().quantity" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchTf({ quantity: +$event })" /></div>
        @if (adjError()) { <p class="sys-alert sys-alert-danger" role="alert">{{ adjError() }}</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Cancel</button><button type="submit" class="btn-primary" [disabled]="saving() || !tf().toBranchId || !tf().itemId || tf().quantity <= 0">Transfer</button></div>
      </form>
    </zp-dialog>

    <!-- History -->
    <zp-dialog [open]="dialog() === 'history'" [title]="'Movement history: ' + (target()?.name ?? '')" [wide]="true" (closed)="dialog.set(null)">
      <div class="max-h-[60vh] overflow-auto"><table class="app-table"><thead><tr><th>When</th><th>Type</th><th class="text-right">Change</th><th class="text-right">Balance</th><th>Note</th></tr></thead>
        <tbody>@for (m of history(); track m.id) { <tr><td class="whitespace-nowrap text-xs">{{ m.occurredAtUtc.slice(0, 16).replace('T', ' ') }}</td><td>{{ m.type }}</td><td class="text-right" [class.text-danger]="m.quantityDelta < 0">{{ m.quantityDelta | number: '1.0-4' }}</td><td class="text-right">{{ m.balanceAfter | number: '1.0-4' }}</td><td class="text-xs">{{ m.reasonNote }}</td></tr> }
          @empty { <tr><td colspan="5" class="py-6 text-center text-ink/70">No movements yet.</td></tr> }</tbody></table></div>
    </zp-dialog>
  `
})
export class StockTabComponent {
  private readonly api = inject(InventoryApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  protected readonly branches = inject(BranchContextService);
  protected readonly sync = inject(SyncAgentService);

  protected readonly dialog = signal<Dialog>(null);
  protected readonly items = signal<readonly InventoryItemDto[]>([]);
  protected readonly batches = signal<readonly BatchDto[]>([]);
  protected readonly suppliers = signal<readonly SupplierDto[]>([]);
  protected readonly history = signal<readonly MovementDto[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly adjError = signal<string | null>(null);
  protected readonly fe = signal<Readonly<Record<string, readonly string[] | string>>>({});
  protected readonly search = signal('');
  protected readonly lowOnly = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly item = signal<SaveInventoryItemRequest>(blankItem());
  protected readonly target = signal<InventoryItemDto | null>(null);
  protected readonly adj = signal({ type: 'Adjustment' as StockMovementType, direction: 'up' as 'up' | 'down', quantity: 0, reason: '' });
  protected readonly rc = signal({ itemId: '', quantity: 0, unitCost: 0, reference: '', lot: '', expiry: '', supplierId: '', tax: 0, serials: '' });
  protected readonly tf = signal({ toBranchId: '', itemId: '', quantity: 0 });

  protected readonly readOnly = computed(() => this.auth.accessModeFor(FEATURES.INVENTORY) === 'readonly');
  protected readonly canAdjust = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.INVENTORY_STOCK_ADJUST));
  protected readonly canPurchase = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.INVENTORY_PURCHASE_MANAGE));
  protected readonly canTransfer = computed(() => this.auth.accessModeFor(FEATURES.MULTI_BRANCH_TRANSFERS) === 'full' && this.branches.branches().length > 1);
  protected readonly otherBranches = computed(() => this.branches.branches().filter((b) => b.id !== this.branches.activeId()));
  protected readonly receiveItem = computed(() => this.items().find((i) => i.id === this.rc().itemId) ?? null);

  constructor() {
    effect(() => {
      if (this.branches.activeId()) untracked(() => void this.load());
    });
    // A queued adjustment that has just synced changes the figures on screen.
    this.sync.flushed.subscribe(() => void this.load());
  }

  protected unit = (u: StockUnit): string => UNIT_LABEL[u];

  protected async load(): Promise<void> {
    const branchId = this.branches.activeId();
    if (!branchId) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const [items, batches, suppliers] = await Promise.all([
        firstValueFrom(this.api.items({ branchId, search: this.search().trim() || undefined, lowOnly: this.lowOnly() || undefined, pageSize: 200 })),
        firstValueFrom(this.api.batches({ branchId, expiringOnly: true })),
        firstValueFrom(this.api.suppliers())
      ]);
      this.items.set(items.items);
      this.batches.set(batches);
      this.suppliers.set(suppliers);
    } catch (err) {
      this.error.set(toApiError(err).message);
    } finally {
      this.loading.set(false);
    }
  }

  // ---- item ----
  protected openItem(i: InventoryItemDto | null): void {
    this.fe.set({});
    this.editingId.set(i?.id ?? null);
    this.item.set(i ? { ...i, averageCost: i.averageCost ?? 0, rowVersion: i.rowVersion } : blankItem());
    this.dialog.set('item');
  }

  protected patchItem(p: Partial<SaveInventoryItemRequest>): void { this.item.update((v) => ({ ...v, ...p })); }

  protected async saveItem(): Promise<void> {
    this.saving.set(true);
    this.fe.set({});
    try {
      await firstValueFrom(this.api.saveItem(this.editingId(), this.item()));
      this.dialog.set(null);
      this.toast.success('Item saved.');
      await this.load();
    } catch (err) {
      const e = toApiError(err);
      this.fe.set(Object.fromEntries(Object.entries(e.fieldErrors).map(([k, v]) => [k, v[0] ?? ''])));
      if (Object.keys(e.fieldErrors).length === 0) this.toast.error(e.message);
    } finally { this.saving.set(false); }
  }

  // ---- adjust (offline-first) ----
  protected openAdjust(i: InventoryItemDto): void {
    this.target.set(i);
    this.adj.set({ type: 'Adjustment', direction: 'up', quantity: 0, reason: '' });
    this.adjError.set(null);
    this.dialog.set('adjust');
  }

  protected patchAdj(p: Partial<ReturnType<typeof this.adj>>): void { this.adj.update((v) => ({ ...v, ...p })); }

  protected async submitAdjust(): Promise<void> {
    const t = this.target();
    const branchId = this.branches.activeId();
    if (!t || !branchId) return;
    this.saving.set(true);
    try {
      const a = this.adj();
      const body = {
        branchId, inventoryItemId: t.id, type: a.type, quantity: a.quantity, direction: a.type === 'Adjustment' ? a.direction : null,
        reason: a.reason.trim(), idempotencyKey: `adj-${crypto.randomUUID()}`
      };
      await this.sync.enqueue('stock.adjust', body, `${a.type} ${a.quantity} ${this.unit(t.baseUnit)} of ${t.name}`);
      this.dialog.set(null);
      this.toast.success(this.sync.online() ? 'Stock change sent.' : 'Saved on this device; it will apply when you are back online.');
      if (this.sync.online()) { await this.sync.flush(); await this.load(); }
    } catch (err) { this.adjError.set(toApiError(err).message); } finally { this.saving.set(false); }
  }

  // ---- receive ----
  protected openReceive(): void {
    this.rc.set({ itemId: '', quantity: 0, unitCost: 0, reference: '', lot: '', expiry: '', supplierId: '', tax: 0, serials: '' });
    this.adjError.set(null);
    this.dialog.set('receive');
  }

  protected patchRc(p: Partial<ReturnType<typeof this.rc>>): void {
    this.rc.update((v) => ({ ...v, ...p }));
    const it = this.receiveItem();
    if (p.itemId && it && this.rc().unitCost === 0) this.rc.update((v) => ({ ...v, unitCost: it.averageCost ?? 0 }));
  }

  protected async submitReceive(): Promise<void> {
    const branchId = this.branches.activeId();
    if (!branchId) return;
    const r = this.rc();
    const receiveSerials = this.receiveItem()?.tracksSerials ? r.serials.split(/\r?\n/).map((x) => x.trim()).filter(Boolean) : undefined;
    this.saving.set(true);
    this.adjError.set(null);
    try {
      await firstValueFrom(this.api.receive({
        branchId, supplierId: r.supplierId || null, purchaseOrderId: null, reference: r.reference.trim() || null, idempotencyKey: `rcv-${crypto.randomUUID()}`,
        lines: [{ inventoryItemId: r.itemId, quantity: r.quantity, unitCost: r.unitCost, lotCode: r.lot.trim() || null, expiryDate: r.expiry ? new Date(r.expiry).toISOString() : null, purchaseOrderLineId: null, taxRatePercent: r.tax,
          serials: receiveSerials }]
      }));
      this.dialog.set(null);
      this.toast.success('Delivery recorded.');
      await this.load();
    } catch (err) { this.adjError.set(toApiError(err).message); } finally { this.saving.set(false); }
  }

  // ---- transfer ----
  protected openTransfer(): void {
    this.tf.set({ toBranchId: '', itemId: '', quantity: 0 });
    this.adjError.set(null);
    this.dialog.set('transfer');
  }

  protected patchTf(p: Partial<ReturnType<typeof this.tf>>): void { this.tf.update((v) => ({ ...v, ...p })); }

  protected async submitTransfer(): Promise<void> {
    const from = this.branches.activeId();
    if (!from) return;
    const t = this.tf();
    this.saving.set(true);
    this.adjError.set(null);
    try {
      await firstValueFrom(this.api.transfer({ fromBranchId: from, toBranchId: t.toBranchId, notes: null, idempotencyKey: `trf-${crypto.randomUUID()}`, lines: [{ inventoryItemId: t.itemId, quantity: t.quantity }] }));
      this.dialog.set(null);
      this.toast.success('Transfer completed.');
      await this.load();
    } catch (err) { this.adjError.set(toApiError(err).message); } finally { this.saving.set(false); }
  }

  // ---- history ----
  protected async openHistory(i: InventoryItemDto): Promise<void> {
    this.target.set(i);
    this.history.set([]);
    this.dialog.set('history');
    try {
      this.history.set((await firstValueFrom(this.api.movements({ branchId: this.branches.activeId() ?? undefined, itemId: i.id, pageSize: 100 }))).items);
    } catch (err) { this.error.set(toApiError(err).message); }
  }
}
