import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal, effect, untracked } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { StockGroupDto } from '../../core/models/nav-ops.model';
import { FEATURES, SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { InventoryItemDto, StockUnit } from '../../core/models/ops.model';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { BranchContextService } from '../../core/services/branch-context.service';
import { StockGroupApi } from '../../core/services/nav-ops.services';
import { InventoryApi } from '../../core/services/ops.services';
import { BranchPickerComponent } from '../../shared/ui/ops-chrome.components';
import { SearchSelectComponent, SelectOption } from '../../shared/ui/search-select.component';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';
import { EntitledActionDirective } from '../../shared/directives/entitled-action.directive';
import { ItemFollowUpService } from '../../core/services/item-follow-up.service';
import { ItemImportComponent } from './item-import.component';
import { StockCardComponent } from './stock-card.component';

const UNIT: Record<StockUnit, string> = { Milliliter: 'ml', Gram: 'g', Each: 'each' };

/**
 * Add / Modify Stock. Items are created and edited here, on the stock card (stock-card.component.ts); quantities are NOT: opening stock and every other change to on-hand stock goes
 * through a receipt, an adjustment or a stock take so it is audited. Costs have their own permission, separate from editing the item.
 */
@Component({
    selector: 'zp-item-maintenance',
    imports: [EntitledActionDirective, DecimalPipe, FormsModule, RouterLink, StatusBadgeComponent, BranchPickerComponent, SearchSelectComponent, StockCardComponent, ItemImportComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-bold">Add / Modify Stock</h1>
      <div class="flex items-center gap-4"><zp-branch-picker />@if (!readOnly()) { <button type="button" class="btn-outline" data-testid="item-import" zpAction="inventory.items.manage" (click)="importOpen.set(true)">Add many from a file</button> }
        @if (!readOnly()) { <button type="button" class="btn-primary" data-testid="item-new" zpAction="inventory.items.manage" (click)="openEdit(null)">New stock item</button> }</div>
    </div>
    @if (readOnly()) { <p class="sys-alert sys-alert-warning mb-3" role="status">Read-only: your subscription limits this screen.</p> }
    @if (error()) { <p class="sys-alert sys-alert-danger mb-3" role="alert" data-testid="items-error">{{ error() }}</p> }

    <form class="mb-3 flex flex-wrap items-end gap-3" (submit)="$event.preventDefault(); load()" aria-label="Filter items">
      <div class="min-w-[14rem] flex-1"><label class="app-label" for="im-search">Search</label><input id="im-search" type="search" class="app-input" data-testid="items-search" placeholder="Name, SKU, barcode or other part number" [ngModel]="search()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="search.set($event)" /></div>
      <div><label class="app-label" for="im-group">Stock group</label><zp-search-select class="w-56" inputId="im-group" testId="items-group" emptyLabel="All groups" noun="group" placeholder="Search groups" [options]="groupOptions()" [value]="groupFilter()" (valueChange)="groupFilter.set($event); load()" /></div>
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
                @if (!readOnly()) { <button type="button" class="btn-outline px-2 py-1 text-sm" [attr.data-testid]="'item-edit-' + i.name" (click)="openEdit(i.id)">Edit</button> }
              </td>
            </tr>
          } @empty { <tr><td [attr.colspan]="7 + (showCost() ? 1 : 0) + (showPrice() ? 1 : 0)" class="py-8 text-center text-ink/70">{{ loading() ? 'Loading...' : 'No stock items match.' }}</td></tr> }
        </tbody>
      </table>
    </div>
    <p class="mt-2 text-sm text-ink/70">{{ total() }} item(s). Quantities change only through receipts, adjustments and stock takes.</p>

    @if (importOpen()) { <zp-item-import (closed)="importOpen.set(false)" (imported)="load()" /> }
    @if (cardOpen()) {
      <zp-stock-card [itemId]="cardId()" [siblings]="ids()" [startTab]="cardTab()" (savedItem)="onSaved()" (closed)="cardOpen.set(false)" (navigate)="cardId.set($event)" />
    }
  `
})
export class ItemMaintenanceComponent implements OnInit {
  private readonly inventory = inject(InventoryApi);
  private readonly groupApi = inject(StockGroupApi);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  protected readonly branches = inject(BranchContextService);

  protected readonly items = signal<readonly InventoryItemDto[]>([]);
  protected readonly total = signal(0);
  protected readonly groups = signal<readonly StockGroupDto[]>([]);
  protected readonly groupOptions = computed<readonly SelectOption[]>(() => this.groups().map((g) => ({ value: g.id, label: g.name })));
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly search = signal('');
  protected readonly groupFilter = signal('');
  protected readonly statusFilter = signal<'active' | 'inactive' | 'all'>('active');
  /** The stock card: open or not, and which item it shows (null = a new one). */
  protected readonly cardOpen = signal(false);
  protected readonly importOpen = signal(false);
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
  /** The ids on screen, in order, so the card's Previous / Next walk the same list. */
  protected readonly ids = computed(() => this.items().map((i) => i.id));

  protected readonly readOnly = computed(() => this.auth.accessModeFor(FEATURES.INVENTORY) === 'readonly');
  protected readonly showCost = computed(() => this.auth.hasAnyPermission([SCREEN_PERMISSIONS.INVENTORY_REPORT_COST_PRICES, SCREEN_PERMISSIONS.INVENTORY_COSTS_MANAGE]));
  protected readonly showPrice = computed(() => this.auth.hasAnyPermission([SCREEN_PERMISSIONS.INVENTORY_REPORT_SELLING_PRICES, SCREEN_PERMISSIONS.PRODUCTS_MANAGE]));

  ngOnInit(): void {
    void this.branches.load().then(() => this.load());
    void firstValueFrom(this.groupApi.list(true)).then((g) => this.groups.set(g)).catch(() => undefined);
    // "Edit" links from reports arrive with ?edit=<item id>; "new" opens an empty card.
    const edit = this.route.snapshot.queryParamMap.get('edit');
    if (edit) this.openEdit(edit === 'new' ? null : edit);
  }

  protected unit = (u: StockUnit): string => UNIT[u];

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

  protected openEdit(id: string | null): void {
    this.cardTab.set(null);
    this.cardId.set(id);
    this.cardOpen.set(true);
  }

  /** The list is read again; the card closes itself when it should (it stays open when a tab asked for the save). */
  protected onSaved(): void {
    void this.load();
  }
}
