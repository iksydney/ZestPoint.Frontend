import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { FEATURES, SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import {
  BatchDto, InventoryItemDto, MovementDto, StockMovementType, StockUnit
} from '../../core/models/ops.model';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { BranchContextService } from '../../core/services/branch-context.service';
import { InventoryApi } from '../../core/services/ops.services';
import { SyncAgentService } from '../../core/services/sync-agent.service';
import { DialogComponent, ToastService } from '../../shared/ui/feedback';
import { SearchSelectComponent, SelectOption } from '../../shared/ui/search-select.component';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';
import { ItemFollowUpService } from '../../core/services/item-follow-up.service';
import { StockCardComponent } from './stock-card.component';

type Dialog = 'adjust' | 'transfer' | 'history' | null;

const UNIT_LABEL: Record<StockUnit, string> = { Milliliter: 'ml', Gram: 'g', Each: 'each' };

/** Stock levels, item set-up, adjustments, transfers and batch/expiry view for the active branch. Goods are received only through purchasing (Purchase Orders and Goods Receiving), never from here. */
@Component({
    selector: 'zp-stock-tab',
    imports: [CurrencyPipe, DecimalPipe, FormsModule, DialogComponent, SearchSelectComponent, StatusBadgeComponent, StockCardComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <input class="app-input max-w-xs" type="search" placeholder="Search items" aria-label="Search items" data-testid="stock-search" [ngModel]="search()" (ngModelChange)="search.set($event); load()" />
      <label class="flex items-center gap-2 text-sm"><input type="checkbox" data-testid="low-only" [checked]="lowOnly()" (change)="lowOnly.set(!lowOnly()); load()" /> Low stock only</label>
      <span class="ml-auto flex flex-wrap gap-2">
        @if (canManageItems() && !readOnly()) { <button type="button" class="btn-primary" data-testid="new-item" (click)="openItem(null)">New stock item</button> }
        @if (canAdjust() && canTransfer() && !readOnly()) { <button type="button" class="btn-outline" (click)="openTransfer()">Transfer</button> }
      </span>
    </div>
    @if (error()) { <p class="sys-alert sys-alert-danger mb-3" role="alert">{{ error() }}</p> }
    <p class="mb-3 text-xs text-ink/70" data-testid="stock-receive-hint">Stock goes up when goods are received through Purchasing (a purchase order received at Goods Receiving, goods without an order, or a market run) or by an adjustment.</p>

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
                }
                @if (canManageItems() && !readOnly()) { <button type="button" class="btn-ghost px-2 py-1 text-sm" [attr.data-testid]="'edit-item-' + i.name" (click)="openItem(i)">Edit</button> }
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

    <!-- New item and Edit open the stock card, the one place an item is set up (the same card as on the Items screen). -->
    @if (cardOpen()) {
      <zp-stock-card [itemId]="cardId()" [siblings]="itemIds()" [startTab]="cardTab()" (savedItem)="load()" (closed)="cardOpen.set(false)" (navigate)="cardId.set($event)" />
    }

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

    <!-- Transfer -->
    <zp-dialog [open]="dialog() === 'transfer'" title="Transfer stock to another branch" (closed)="dialog.set(null)">
      <form class="space-y-3" (submit)="$event.preventDefault(); submitTransfer()">
        <div><label class="app-label" for="tf-to">To branch</label>
          <zp-search-select inputId="tf-to" testId="transfer-to" emptyLabel="Choose..." noun="branch" placeholder="Search branches" [options]="branchOptions()" [value]="tf().toBranchId" (valueChange)="patchTf({ toBranchId: $event })" /></div>
        <div><label class="app-label" for="tf-item">Item</label>
          <zp-search-select inputId="tf-item" testId="transfer-item" emptyLabel="Choose..." noun="item" placeholder="Search items" [options]="transferItemOptions()" [value]="tf().itemId" (valueChange)="patchTf({ itemId: $event })" /></div>
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
  protected readonly history = signal<readonly MovementDto[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly adjError = signal<string | null>(null);
  protected readonly fe = signal<Readonly<Record<string, readonly string[] | string>>>({});
  protected readonly search = signal('');
  protected readonly lowOnly = signal(false);
  protected readonly cardOpen = signal(false);
  protected readonly cardId = signal<string | null>(null);
  /** The tab the card opens on: the set-up tabs when "finish setting this one up" was chosen after adding an item. */
  protected readonly cardTab = signal<string | null>(null);
  private readonly follow = inject(ItemFollowUpService);
  private handledRequest = this.follow.request()?.n ?? 0;
  /** The "saved, add another?" box asks this screen to open the card again: blank, or on the item just added. */
  private readonly followRequests = effect(() => {
    const r = this.follow.request();
    if (!r || r.n <= this.handledRequest) return;
    this.handledRequest = r.n;
    untracked(() => { this.cardTab.set(r.action === 'finish' ? 'units' : null); this.cardId.set(r.id); this.cardOpen.set(true); });
  }, { allowSignalWrites: true });
  protected readonly itemIds = computed(() => this.items().map((i) => i.id));
  protected readonly canManageItems = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.INVENTORY_ITEMS_MANAGE));
  protected readonly target = signal<InventoryItemDto | null>(null);
  protected readonly adj = signal({ type: 'Adjustment' as StockMovementType, direction: 'up' as 'up' | 'down', quantity: 0, reason: '' });
  protected readonly tf = signal({ toBranchId: '', itemId: '', quantity: 0 });

  protected readonly readOnly = computed(() => this.auth.accessModeFor(FEATURES.INVENTORY) === 'readonly');
  protected readonly canAdjust = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.INVENTORY_STOCK_ADJUST));
  protected readonly canTransfer = computed(() => this.auth.accessModeFor(FEATURES.MULTI_BRANCH_TRANSFERS) === 'full' && this.branches.branches().length > 1);
  protected readonly otherBranches = computed(() => this.branches.branches().filter((b) => b.id !== this.branches.activeId()));
  protected readonly transferItemOptions = computed<readonly SelectOption[]>(() => this.items().map((i) => ({ value: i.id, label: i.name, description: `${i.onHand.toLocaleString('en-US', { maximumFractionDigits: 2 })} on hand` })));
  protected readonly branchOptions = computed<readonly SelectOption[]>(() => this.otherBranches().map((b) => ({ value: b.id, label: b.name })));

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
      const [items, batches] = await Promise.all([
        firstValueFrom(this.api.items({ branchId, search: this.search().trim() || undefined, lowOnly: this.lowOnly() || undefined, pageSize: 200 })),
        firstValueFrom(this.api.batches({ branchId, expiringOnly: true }))
      ]);
      this.items.set(items.items);
      this.batches.set(batches);
    } catch (err) {
      this.error.set(toApiError(err).message);
    } finally {
      this.loading.set(false);
    }
  }

  // ---- item ----
  protected openItem(i: InventoryItemDto | null): void {
    this.cardTab.set(null);
    this.cardId.set(i?.id ?? null);
    this.cardOpen.set(true);
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
