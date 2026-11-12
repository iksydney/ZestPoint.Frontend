import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AliasKind, ItemAliasDto, StockGroupDto } from '../../core/models/nav-ops.model';
import { FEATURES, SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { InventoryItemDto, SaveInventoryItemRequest, StockUnit, SupplierDto } from '../../core/models/ops.model';
import { ApiError, toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { BranchContextService } from '../../core/services/branch-context.service';
import { StockExtrasApi, StockGroupApi } from '../../core/services/nav-ops.services';
import { InventoryApi } from '../../core/services/ops.services';
import { DialogComponent, ToastService } from '../../shared/ui/feedback';
import { BranchPickerComponent } from '../../shared/ui/ops-chrome.components';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';
import { EntitledActionDirective } from '../../shared/directives/entitled-action.directive';

const UNIT: Record<StockUnit, string> = { Milliliter: 'ml', Gram: 'g', Each: 'each' };

const blank = (): SaveInventoryItemRequest => ({
  name: '', sku: null, kind: 'FinishedGood', baseUnit: 'Each', containerSize: null, tareGrams: null, densityGPerMl: null, minimumLevel: 0, reorderLevel: 0, targetDaysOfStock: 14,
  averageCost: 0, supplierId: null, tracksBatches: false, tracksSerials: false, groupId: null, barcode: null, description: null, purchaseUnitName: null, purchaseUnitSize: null,
  reorderQuantity: 0, targetStock: null, listedOnWebStore: false, sellingPrice: null, tradePrice: null, wholesalePrice: null, isActive: true, rowVersion: null
});

/**
 * Add / Modify Stock. Items are created and edited here; quantities are NOT: opening stock and every other change to on-hand stock goes
 * through a receipt, an adjustment or a stock take so it is audited. Costs have their own permission, separate from editing the item.
 */
@Component({
  selector: 'zp-item-maintenance',
  standalone: true,
  imports: [EntitledActionDirective, DecimalPipe, FormsModule, RouterLink, DialogComponent, StatusBadgeComponent, BranchPickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-bold">Add / Modify Stock</h1>
      <div class="flex items-center gap-4"><zp-branch-picker />@if (!readOnly()) { <button type="button" class="btn-primary" data-testid="item-new" zpAction="inventory.items.manage" (click)="openEdit(null)">New stock item</button> }</div>
    </div>
    @if (readOnly()) { <p class="sys-alert sys-alert-warning mb-3" role="status">Read-only: your subscription limits this screen.</p> }
    @if (error()) { <p class="sys-alert sys-alert-danger mb-3" role="alert" data-testid="items-error">{{ error() }}</p> }

    <form class="mb-3 flex flex-wrap items-end gap-3" (submit)="$event.preventDefault(); load()" aria-label="Filter items">
      <div class="min-w-[14rem] flex-1"><label class="app-label" for="im-search">Search</label><input id="im-search" type="search" class="app-input" data-testid="items-search" placeholder="Name, SKU, barcode or other part number" [ngModel]="search()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="search.set($event)" /></div>
      <div><label class="app-label" for="im-group">Stock group</label><select id="im-group" class="app-input" data-testid="items-group" [ngModel]="groupFilter()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="groupFilter.set($event); load()"><option value="">All groups</option>@for (g of groups(); track g.id) { <option [value]="g.id">{{ g.name }}</option> }</select></div>
      <div><label class="app-label" for="im-status">Status</label><select id="im-status" class="app-input" [ngModel]="statusFilter()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="statusFilter.set($event); load()"><option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All</option></select></div>
      <button type="submit" class="btn-outline">Search</button>
    </form>

    <div class="app-card overflow-x-auto p-0">
      <table class="app-table" data-testid="items-table">
        <caption class="sr-only">Stock items</caption>
        <thead><tr><th>Item</th><th>Group</th><th>SKU / barcode</th><th>Unit</th><th class="text-right">On hand</th>@if (showCost()) { <th class="text-right">Cost</th> } @if (showPrice()) { <th class="text-right">Selling price</th> }<th>Status</th><th></th></tr></thead>
        <tbody>
          @for (i of items(); track i.id) {
            <tr [attr.data-testid]="'item-' + i.name">
              <td class="font-medium">{{ i.name }} @if (i.tracksSerials) { <zp-status-badge tone="primary">Serial</zp-status-badge> } @if (i.tracksBatches) { <zp-status-badge tone="primary">Batch</zp-status-badge> }</td>
              <td>{{ i.groupName }}</td><td class="text-xs">{{ i.sku }} <span class="block text-ink/60">{{ i.barcode }}</span></td><td>{{ unit(i.baseUnit) }}</td>
              <td class="text-right">{{ i.onHand | number: '1.0-2' }}</td>
              @if (showCost()) { <td class="text-right">{{ i.averageCost === null ? '' : (i.averageCost | number: '1.2-4') }}</td> }
              @if (showPrice()) { <td class="text-right">{{ i.sellingPrice === null ? '' : (i.sellingPrice | number: '1.2-2') }}</td> }
              <td><zp-status-badge [tone]="i.isActive ? 'success' : 'danger'">{{ i.isActive ? 'Active' : 'Inactive' }}</zp-status-badge></td>
              <td class="whitespace-nowrap text-right">
                <a class="btn-ghost px-2 py-1 text-sm" routerLink="/app/inventory/reports/items-history" [queryParams]="{ itemId: i.id }">History</a>
                @if (!readOnly()) { <button type="button" class="btn-outline px-2 py-1 text-sm" [attr.data-testid]="'item-edit-' + i.name" (click)="openEdit(i)">Edit</button> }
              </td>
            </tr>
          } @empty { <tr><td [attr.colspan]="7 + (showCost() ? 1 : 0) + (showPrice() ? 1 : 0)" class="py-8 text-center text-ink/70">{{ loading() ? 'Loading...' : 'No stock items match.' }}</td></tr> }
        </tbody>
      </table>
    </div>
    <p class="mt-2 text-sm text-ink/70">{{ total() }} item(s). Quantities change only through receipts, adjustments and stock takes.</p>

    <zp-dialog [open]="dialog()" [title]="editing() ? 'Edit ' + editing()!.name : 'New stock item'" [wide]="true" (closed)="dialog.set(false)">
      <form class="space-y-5" (submit)="$event.preventDefault(); save()" data-testid="item-form">
        <fieldset class="grid gap-3 sm:grid-cols-2"><legend class="mb-1 font-semibold">Identity</legend>
          <div class="sm:col-span-2"><label class="app-label" for="f-name">Name</label><input id="f-name" class="app-input" data-testid="item-name" maxlength="160" [ngModel]="f().name" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ name: $event })" />@if (fe('name')) { <p class="app-error" role="alert">{{ fe('name') }}</p> }</div>
          <div><label class="app-label" for="f-sku">SKU</label><input id="f-sku" class="app-input" data-testid="item-sku" maxlength="60" [ngModel]="f().sku" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ sku: $event || null })" />@if (fe('sku')) { <p class="app-error" role="alert">{{ fe('sku') }}</p> }</div>
          <div><label class="app-label" for="f-barcode">Barcode</label><input id="f-barcode" class="app-input" data-testid="item-barcode" maxlength="60" [ngModel]="f().barcode" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ barcode: $event || null })" />@if (fe('barcode')) { <p class="app-error" role="alert">{{ fe('barcode') }}</p> }</div>
          <div class="sm:col-span-2"><label class="app-label" for="f-desc">Description</label><input id="f-desc" class="app-input" maxlength="500" [ngModel]="f().description" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ description: $event || null })" /></div>
          <div><label class="app-label" for="f-group">Stock group</label><select id="f-group" class="app-input" data-testid="item-group" [ngModel]="f().groupId" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ groupId: $event || null })"><option [ngValue]="null">No group</option>@for (g of activeGroups(); track g.id) { <option [ngValue]="g.id">{{ g.name }}</option> }</select>@if (fe('groupId')) { <p class="app-error" role="alert">{{ fe('groupId') }}</p> }</div>
          <div><label class="app-label" for="f-kind">Product type</label><select id="f-kind" class="app-input" data-testid="item-kind" [ngModel]="f().kind" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ kind: $event })"><option value="FinishedGood">Finished good (resold as is)</option><option value="Ingredient">Ingredient (used in recipes)</option></select></div>
        </fieldset>

        <fieldset class="grid gap-3 sm:grid-cols-2"><legend class="mb-1 font-semibold">Units</legend>
          <div><label class="app-label" for="f-unit">Stock unit</label><select id="f-unit" class="app-input" data-testid="item-unit" [disabled]="!!editing()" [ngModel]="f().baseUnit" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ baseUnit: $event })"><option value="Each">Each (counted)</option><option value="Milliliter">Millilitres (liquids)</option><option value="Gram">Grams</option></select>
            @if (editing()) { <p class="mt-1 text-xs text-ink/70">The unit cannot change once stock has moved.</p> }@if (fe('baseUnit')) { <p class="app-error" role="alert">{{ fe('baseUnit') }}</p> }</div>
          <div class="grid grid-cols-2 gap-2"><div><label class="app-label" for="f-pun">Purchase unit</label><input id="f-pun" class="app-input" placeholder="e.g. case" maxlength="40" [ngModel]="f().purchaseUnitName" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ purchaseUnitName: $event || null })" /></div>
            <div><label class="app-label" for="f-pus">Holds ({{ unit(f().baseUnit) }})</label><input id="f-pus" type="number" min="0" step="any" class="app-input" [ngModel]="f().purchaseUnitSize" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ purchaseUnitSize: $event === null || $event === '' ? null : +$event })" /></div>
            @if (fe('purchaseUnitSize')) { <p class="app-error col-span-2" role="alert">{{ fe('purchaseUnitSize') }}</p> }</div>
          @if (f().baseUnit === 'Milliliter') {
            <div><label class="app-label" for="f-cs">Bottle size (ml)</label><input id="f-cs" type="number" min="0" class="app-input" [ngModel]="f().containerSize" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ containerSize: $event ? +$event : null })" /></div>
            <div class="grid grid-cols-2 gap-2"><div><label class="app-label" for="f-tare">Empty weight (g)</label><input id="f-tare" type="number" min="0" class="app-input" [ngModel]="f().tareGrams" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ tareGrams: $event ? +$event : null })" /></div>
              <div><label class="app-label" for="f-den">Density (g/ml)</label><input id="f-den" type="number" min="0.01" max="100" step="0.01" class="app-input" [ngModel]="f().densityGPerMl" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ densityGPerMl: $event ? +$event : null })" /></div></div>
          }
        </fieldset>

        <fieldset class="grid gap-3 sm:grid-cols-3"><legend class="mb-1 font-semibold">Stock levels ({{ unit(f().baseUnit) }})</legend>
          <div><label class="app-label" for="f-min">Minimum level</label><input id="f-min" type="number" min="0" class="app-input" [ngModel]="f().minimumLevel" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ minimumLevel: +$event })" /></div>
          <div><label class="app-label" for="f-ro">Reorder threshold</label><input id="f-ro" type="number" min="0" class="app-input" data-testid="item-reorder" [ngModel]="f().reorderLevel" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ reorderLevel: +$event })" />@if (fe('reorderLevel')) { <p class="app-error" role="alert">{{ fe('reorderLevel') }}</p> }</div>
          <div><label class="app-label" for="f-roq">Reorder quantity</label><input id="f-roq" type="number" min="0" class="app-input" [ngModel]="f().reorderQuantity" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ reorderQuantity: +$event })" /></div>
          <div><label class="app-label" for="f-ts">Target stock</label><input id="f-ts" type="number" min="0" class="app-input" placeholder="optional" [ngModel]="f().targetStock" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ targetStock: $event === null || $event === '' ? null : +$event })" />@if (fe('targetStock')) { <p class="app-error" role="alert">{{ fe('targetStock') }}</p> }</div>
          <div><label class="app-label" for="f-days">Days of cover</label><input id="f-days" type="number" min="1" max="365" class="app-input" [ngModel]="f().targetDaysOfStock" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ targetDaysOfStock: +$event })" /></div>
          <div><label class="app-label" for="f-sup">Supplier</label><select id="f-sup" class="app-input" [ngModel]="f().supplierId" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ supplierId: $event || null })"><option [ngValue]="null">None</option>@for (s of suppliers(); track s.id) { <option [ngValue]="s.id">{{ s.name }}</option> }</select></div>
        </fieldset>

        <fieldset class="grid gap-3 sm:grid-cols-2"><legend class="mb-1 font-semibold">Price and cost</legend>
          @if (canPrice()) { <div><label class="app-label" for="f-price">Selling price</label><input id="f-price" type="number" min="0" step="0.01" class="app-input" data-testid="item-price" placeholder="not sold directly" [ngModel]="f().sellingPrice" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ sellingPrice: $event === null || $event === '' ? null : +$event })" />
            <p class="mt-1 text-xs text-ink/70">Creates or updates the sellable product for this item (finished goods only).</p>@if (fe('sellingPrice')) { <p class="app-error" role="alert">{{ fe('sellingPrice') }}</p> }</div>
            <div><label class="app-label" for="f-trade">Trade price per {{ unit(f().baseUnit) }}</label><input id="f-trade" type="number" min="0" step="0.0001" class="app-input" data-testid="item-trade" placeholder="optional" [ngModel]="f().tradePrice" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ tradePrice: $event === null || $event === '' ? null : +$event })" /></div>
            <div><label class="app-label" for="f-wholesale">Wholesale price per {{ unit(f().baseUnit) }}</label><input id="f-wholesale" type="number" min="0" step="0.0001" class="app-input" data-testid="item-wholesale" placeholder="optional" [ngModel]="f().wholesalePrice" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ wholesalePrice: $event === null || $event === '' ? null : +$event })" />
              <p class="mt-1 text-xs text-ink/70">Trade and wholesale prices feed the margin panel on purchase orders.</p></div> }
          @else { <p class="text-sm text-ink/70">Selling prices are set by people with the product-management permission.</p> }
          @if (canCost()) { <div><label class="app-label" for="f-cost">Cost per {{ unit(f().baseUnit) }} (moving average)</label><input id="f-cost" type="number" min="0" step="0.0001" class="app-input" data-testid="item-cost" [ngModel]="f().averageCost" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ averageCost: +$event })" />
            <p class="mt-1 text-xs text-ink/70">A goods receipt recalculates this automatically.</p></div> }
          @else { <p class="text-sm text-ink/70">Costs are hidden and cannot be changed with your role.</p> }
        </fieldset>

        <fieldset class="flex flex-wrap gap-x-6 gap-y-2 text-sm"><legend class="mb-1 font-semibold">Tracking and availability</legend>
          <label class="flex items-center gap-2"><input type="checkbox" [checked]="f().tracksBatches" (change)="patch({ tracksBatches: !f().tracksBatches })" /> Track batches and expiry</label>
          <label class="flex items-center gap-2"><input type="checkbox" data-testid="item-serials" [checked]="f().tracksSerials" (change)="patch({ tracksSerials: !f().tracksSerials })" /> Track serial numbers</label>
          <label class="flex items-center gap-2"><input type="checkbox" [checked]="f().listedOnWebStore" (change)="patch({ listedOnWebStore: !f().listedOnWebStore })" /> Flag for the web store</label>
          <label class="flex items-center gap-2"><input type="checkbox" data-testid="item-active" [checked]="f().isActive" (change)="patch({ isActive: !f().isActive })" /> Active</label>
          @if (fe('tracksSerials')) { <p class="app-error w-full" role="alert">{{ fe('tracksSerials') }}</p> }
        </fieldset>
        <p class="rounded-lg border border-ink/10 bg-canvas p-3 text-xs text-ink/80">Every branch can stock an active item. Branch quantities are not edited here: record opening stock with <a class="underline" routerLink="/app/inventory/adjustments">Stock Qty Adjustments</a> or by receiving goods. Deactivating keeps all sales and stock history.</p>

        @if (editing()) {
          <fieldset><legend class="mb-1 font-semibold">Other part numbers</legend>
            <ul class="mb-2 space-y-1 text-sm" data-testid="alias-list">
              @for (a of aliases(); track a.id) { <li class="flex items-center justify-between gap-2"><span><span class="font-mono">{{ a.code }}</span> <span class="text-ink/70">{{ a.kind === 'Equivalent' ? 'equivalent' : 'supplier: ' + a.supplierName }}</span></span><button type="button" class="btn-ghost px-2 py-0.5 text-sm text-danger" (click)="removeAlias(a)">Remove</button></li> }
              @empty { <li class="text-ink/70">None.</li> }
            </ul>
            <div class="grid gap-2 sm:grid-cols-[10rem_1fr_12rem_auto]">
              <select class="app-input" aria-label="Code type" [ngModel]="aliasKind()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="aliasKind.set($event)"><option value="Equivalent">Equivalent</option><option value="SupplierPartNumber">Supplier part no.</option></select>
              <input class="app-input" aria-label="Part number" placeholder="Part number" maxlength="80" data-testid="alias-code" [ngModel]="aliasCode()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="aliasCode.set($event)" />
              @if (aliasKind() === 'SupplierPartNumber') { <select class="app-input" aria-label="Supplier" [ngModel]="aliasSupplier()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="aliasSupplier.set($event)"><option value="">Supplier...</option>@for (s of suppliers(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }</select> } @else { <span></span> }
              <button type="button" class="btn-outline" data-testid="alias-add" [disabled]="!aliasCode().trim()" (click)="addAlias()">Add</button>
            </div>
            @if (aliasError()) { <p class="app-error" role="alert">{{ aliasError() }}</p> }
          </fieldset>
        }

        @if (dialogError()) { <p class="sys-alert sys-alert-danger" role="alert">{{ dialogError() }}</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(false)">Cancel</button><button type="submit" class="btn-primary" data-testid="item-save" zpAction="inventory.items.manage" [disabled]="saving() || !f().name.trim()">Save item</button></div>
      </form>
    </zp-dialog>
  `
})
export class ItemMaintenanceComponent implements OnInit {
  private readonly inventory = inject(InventoryApi);
  private readonly groupApi = inject(StockGroupApi);
  private readonly extras = inject(StockExtrasApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  protected readonly branches = inject(BranchContextService);

  protected readonly items = signal<readonly InventoryItemDto[]>([]);
  protected readonly total = signal(0);
  protected readonly groups = signal<readonly StockGroupDto[]>([]);
  protected readonly suppliers = signal<readonly SupplierDto[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly dialogError = signal<string | null>(null);
  protected readonly search = signal('');
  protected readonly groupFilter = signal('');
  protected readonly statusFilter = signal<'active' | 'inactive' | 'all'>('active');
  protected readonly dialog = signal(false);
  protected readonly editing = signal<InventoryItemDto | null>(null);
  protected readonly f = signal<SaveInventoryItemRequest>(blank());
  protected readonly aliases = signal<readonly ItemAliasDto[]>([]);
  protected readonly aliasKind = signal<AliasKind>('Equivalent');
  protected readonly aliasCode = signal('');
  protected readonly aliasSupplier = signal('');
  protected readonly aliasError = signal<string | null>(null);
  private readonly fieldErrors = signal<Readonly<Record<string, readonly string[]>>>({});

  protected readonly readOnly = computed(() => this.auth.accessModeFor(FEATURES.INVENTORY) === 'readonly');
  protected readonly canCost = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.INVENTORY_COSTS_MANAGE));
  protected readonly canPrice = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.PRODUCTS_MANAGE));
  protected readonly showCost = computed(() => this.auth.hasAnyPermission([SCREEN_PERMISSIONS.INVENTORY_REPORT_COST_PRICES, SCREEN_PERMISSIONS.INVENTORY_COSTS_MANAGE]));
  protected readonly showPrice = computed(() => this.auth.hasAnyPermission([SCREEN_PERMISSIONS.INVENTORY_REPORT_SELLING_PRICES, SCREEN_PERMISSIONS.PRODUCTS_MANAGE]));
  protected readonly activeGroups = computed(() => this.groups().filter((g) => g.isActive));

  ngOnInit(): void {
    void this.branches.load().then(() => this.load());
    void firstValueFrom(this.groupApi.list(true)).then((g) => this.groups.set(g)).catch(() => undefined);
    void firstValueFrom(this.inventory.suppliers()).then((s) => this.suppliers.set(s)).catch(() => undefined);
    // "Edit" links from reports arrive with ?edit=<item id>.
    const edit = this.route.snapshot.queryParamMap.get('edit');
    if (edit) void firstValueFrom(this.inventory.items({ pageSize: 500 })).then((p) => { const hit = p.items.find((i) => i.id === edit); if (hit) this.openEdit(hit); }).catch(() => undefined);
  }

  protected unit = (u: StockUnit): string => UNIT[u];
  protected fe = (name: string): string | null => this.fieldErrors()[name]?.[0] ?? null;
  protected patch(p: Partial<SaveInventoryItemRequest>): void { this.f.update((v) => ({ ...v, ...p })); }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const status = this.statusFilter();
      const page = await firstValueFrom(this.inventory.items({
        branchId: this.branches.activeId() ?? undefined, search: this.search().trim() || undefined, groupId: this.groupFilter() || undefined,
        active: status === 'all' ? undefined : status === 'active', pageSize: 200
      }));
      this.items.set(page.items);
      this.total.set(page.total);
    } catch (err) { this.error.set(toApiError(err).message); } finally { this.loading.set(false); }
  }

  protected openEdit(i: InventoryItemDto | null): void {
    this.editing.set(i);
    this.fieldErrors.set({});
    this.dialogError.set(null);
    this.aliasError.set(null);
    this.f.set(i ? {
      name: i.name, sku: i.sku, kind: i.kind, baseUnit: i.baseUnit, containerSize: i.containerSize, tareGrams: i.tareGrams, densityGPerMl: i.densityGPerMl, minimumLevel: i.minimumLevel,
      reorderLevel: i.reorderLevel, targetDaysOfStock: i.targetDaysOfStock, averageCost: i.averageCost ?? 0, supplierId: i.supplierId, tracksBatches: i.tracksBatches, tracksSerials: i.tracksSerials,
      groupId: i.groupId, barcode: i.barcode, description: i.description, purchaseUnitName: i.purchaseUnitName, purchaseUnitSize: i.purchaseUnitSize, reorderQuantity: i.reorderQuantity,
      targetStock: i.targetStock, listedOnWebStore: i.listedOnWebStore, sellingPrice: i.sellingPrice, tradePrice: i.tradePrice ?? null, wholesalePrice: i.wholesalePrice ?? null, isActive: i.isActive, rowVersion: i.rowVersion
    } : blank());
    this.aliases.set([]);
    if (i) void firstValueFrom(this.extras.aliases(i.id)).then((a) => this.aliases.set(a)).catch(() => undefined);
    this.dialog.set(true);
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    this.fieldErrors.set({});
    this.dialogError.set(null);
    const body: SaveInventoryItemRequest = { ...this.f(), name: this.f().name.trim() };
    if (!this.canPrice()) { body.sellingPrice = null; body.tradePrice = null; body.wholesalePrice = null; }
    try {
      await firstValueFrom(this.inventory.saveItem(this.editing()?.id ?? null, body));
      this.dialog.set(false);
      this.toast.success('Item saved.');
      await this.load();
    } catch (err) {
      const e = toApiError(err) as ApiError;
      this.fieldErrors.set(e.fieldErrors);
      this.dialogError.set(Object.keys(e.fieldErrors).length === 0 ? e.message : null);
    } finally { this.saving.set(false); }
  }

  protected async addAlias(): Promise<void> {
    const item = this.editing();
    if (!item) return;
    this.aliasError.set(null);
    try {
      const a = await firstValueFrom(this.extras.addAlias(item.id, { kind: this.aliasKind(), code: this.aliasCode().trim(), supplierId: this.aliasKind() === 'SupplierPartNumber' ? this.aliasSupplier() || null : null, note: null }));
      this.aliases.update((l) => [...l, a]);
      this.aliasCode.set('');
    } catch (err) { this.aliasError.set(toApiError(err).message); }
  }

  protected async removeAlias(a: ItemAliasDto): Promise<void> {
    const item = this.editing();
    if (!item) return;
    try { await firstValueFrom(this.extras.removeAlias(item.id, a.id)); this.aliases.update((l) => l.filter((x) => x.id !== a.id)); }
    catch (err) { this.aliasError.set(toApiError(err).message); }
  }
}
