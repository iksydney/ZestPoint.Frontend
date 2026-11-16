import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PurchaseOrderStatus } from '../../core/models/ops.model';
import { DOCUMENT_TYPES, PurchaseDocumentType, STATUS_TEXT, WorkstationListItemDto } from '../../core/models/purchasing.model';
import { FEATURES, SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { BranchContextService } from '../../core/services/branch-context.service';
import { PurchasingWorkstationApi } from '../../core/services/purchasing.services';
import { BranchPickerComponent, SyncStatusComponent } from '../../shared/ui/ops-chrome.components';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';
import { ZpIconComponent } from '../../shared/ui/zp-icon.component';

/**
 * Purchasing / Purchase Orders: every purchasing document (orders, direct consignments, returns and transfers) with its stage, and the way
 * into the order workstation. The document opens in the workstation, where it is raised, priced, posted and followed.
 */
@Component({
    selector: 'zp-purchase-orders-page',
    imports: [DatePipe, DecimalPipe, FormsModule, RouterLink, BranchPickerComponent, SyncStatusComponent, StatusBadgeComponent, ZpIconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="flex flex-col gap-4 font-jakarta" data-testid="po-list">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div><h1 class="font-syne text-2xl font-bold">Purchasing / Purchase Orders</h1><p class="text-sm text-ink/70">Orders, goods without an order, returns to suppliers and transfers between branches.</p></div>
        <div class="flex flex-wrap items-center gap-4"><zp-branch-picker /><zp-sync-status /></div>
      </div>
      @if (readOnly()) { <p class="sys-alert sys-alert-warning" role="status">Read-only: your subscription limits this screen. You can look, but not change anything.</p> }

      <div class="flex flex-wrap items-end gap-3">
        <div><label class="app-label" for="pl-search">Search</label><input id="pl-search" type="search" class="app-input w-64" placeholder="Number, supplier or invoice" data-testid="po-search" [ngModel]="search()" (ngModelChange)="search.set($event)" (keydown.enter)="load()" /></div>
        <div><label class="app-label" for="pl-status">Stage</label><select id="pl-status" class="app-input" data-testid="po-filter-status" [ngModel]="status()" (ngModelChange)="status.set($event); load()"><option value="">Any</option>@for (s of statuses; track s) { <option [value]="s">{{ text(s) }}</option> }</select></div>
        <div><label class="app-label" for="pl-type">Kind</label><select id="pl-type" class="app-input" data-testid="po-filter-type" [ngModel]="kind()" (ngModelChange)="kind.set($event); load()"><option value="">All</option>@for (t of types; track t.value) { <option [value]="t.value">{{ t.short }}</option> }</select></div>
        <button type="button" class="btn-outline" data-testid="po-find" (click)="load()">Find</button>
        @if (canManage() && !readOnly()) {
          <div class="ml-auto flex flex-wrap gap-2">
            <a class="btn-primary" routerLink="/app/purchasing/orders/new" data-testid="po-new"><zp-icon name="plus" [size]="16" /> New purchase order</a>
            <a class="btn-outline" [routerLink]="['/app/purchasing/orders/new']" [queryParams]="{ type: 'VendorReturn' }" data-testid="po-new-return">Return to supplier</a>
            <a class="btn-outline" [routerLink]="['/app/purchasing/orders/new']" [queryParams]="{ type: 'StockTransfer' }" data-testid="po-new-transfer">Branch transfer</a>
            @if (canReceive()) { <a class="btn-outline" [routerLink]="['/app/purchasing/orders/new']" [queryParams]="{ type: 'DirectConsignment' }" data-testid="po-new-direct">Goods without an order</a> }
          </div>
        }
      </div>
      @if (error()) { <p class="sys-alert sys-alert-danger" role="alert">{{ error() }}</p> }

      <div class="app-card overflow-x-auto p-0"><table class="app-table min-w-[48rem]" data-testid="po-table"><thead><tr><th>Document</th><th>Supplier / route</th><th>Branch</th><th>Stage</th><th class="text-right">Lines</th><th class="text-right">Total</th><th>Created</th></tr></thead>
        <tbody>@for (o of items(); track o.id) {
          <tr [attr.data-testid]="'po-row-' + o.documentNumber"><td><a class="font-data font-semibold text-primary underline" [routerLink]="['/app/purchasing/orders', o.id]">{{ o.documentNumber }}</a><span class="block text-xs text-ink/60">{{ typeLabel(o.documentType) }}</span></td>
            <td>{{ o.supplierName ?? 'Between branches' }}</td><td>{{ o.branchName }}</td>
            <td><zp-status-badge [tone]="tone(o.status)">{{ text(o.status) }}</zp-status-badge>@if (o.awaitingSecondKey) { <span class="ml-1 app-badge app-badge-warning">Second key needed</span> }</td>
            <td class="text-right font-data">{{ o.lineCount }}</td><td class="text-right font-data">{{ o.total | number: '1.2-2' }}</td><td class="whitespace-nowrap">{{ o.dateCreated | date: 'mediumDate' }}</td></tr> }
          @empty { <tr><td colspan="7" class="py-10 text-center text-ink/70">{{ loading() ? 'Loading...' : 'No documents match.' }}</td></tr> }</tbody></table></div>
      <p class="text-sm text-ink/70" data-testid="po-total-count">{{ total() }} document(s)</p>
    </div>
  `
})
export class PurchaseOrdersPageComponent implements OnInit {
  private readonly api = inject(PurchasingWorkstationApi);
  private readonly auth = inject(AuthService);
  protected readonly branches = inject(BranchContextService);

  protected readonly types = DOCUMENT_TYPES;
  protected readonly statuses: readonly PurchaseOrderStatus[] = ['Draft', 'Submitted', 'Approved', 'PartiallyReceived', 'Received', 'Cancelled'];
  protected readonly items = signal<readonly WorkstationListItemDto[]>([]);
  protected readonly total = signal(0);
  protected readonly search = signal('');
  protected readonly status = signal<PurchaseOrderStatus | ''>('');
  protected readonly kind = signal<PurchaseDocumentType | ''>('');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly readOnly = computed(() => this.auth.accessModeFor(FEATURES.INVENTORY) === 'readonly');
  protected readonly canManage = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.INVENTORY_PURCHASE_MANAGE));
  protected readonly canReceive = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.PURCHASING_RECEIVE));

  constructor() {
    effect(() => { this.branches.activeId(); untracked(() => void this.load()); }, { allowSignalWrites: true });
  }

  async ngOnInit(): Promise<void> { await this.branches.load(); }

  protected text = (s: PurchaseOrderStatus): string => STATUS_TEXT[s];
  protected typeLabel(t: PurchaseDocumentType): string { return DOCUMENT_TYPES.find((d) => d.value === t)?.short ?? t; }
  protected tone(s: PurchaseOrderStatus): 'success' | 'warning' | 'danger' | 'primary' { return s === 'Received' ? 'success' : s === 'Cancelled' ? 'danger' : s === 'Draft' || s === 'Submitted' ? 'warning' : 'primary'; }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const page = await firstValueFrom(this.api.list({ branchId: this.branches.activeId() ?? undefined, status: this.status(), type: this.kind(), search: this.search().trim() || undefined, pageSize: 100 }));
      this.items.set(page.items);
      this.total.set(page.total);
    } catch (err) { this.error.set(toApiError(err).message); } finally { this.loading.set(false); }
  }
}
