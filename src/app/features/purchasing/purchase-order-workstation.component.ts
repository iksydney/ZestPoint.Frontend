import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { InventoryItemDto, StockUnit, SupplierDto } from '../../core/models/ops.model';
import {
  AnalyseDto, BinDto, DOCUMENT_TYPES, PurchaseDocumentType, STATUS_TEXT, SaveWorkstationOrderRequest, SupplierStandingDto, WorkstationLineRequest, WorkstationOrderDto
} from '../../core/models/purchasing.model';
import { SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { lineAmounts, quantityFromPacks, round2, sumLines } from '../../core/purchase-math';
import { ApiError, toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { BranchContextService } from '../../core/services/branch-context.service';
import { PurchasingApi } from '../../core/services/nav-ops.services';
import { InventoryApi, OperationSettingsApi } from '../../core/services/ops.services';
import { BinApi, PurchasingWorkstationApi, ReceivingApi } from '../../core/services/purchasing.services';
import { ConfirmService, DialogComponent, ToastService } from '../../shared/ui/feedback';
import { ZpIconComponent } from '../../shared/ui/zp-icon.component';
import { PoPrintSheetComponent } from './po-print-sheet.component';
import { SupplierFormComponent, SupplierLookupComponent } from './supplier-dialogs.component';
import { EntitledActionDirective } from '../../shared/directives/entitled-action.directive';
import { StockCardComponent } from '../inventory/stock-card.component';

const UNIT: Record<StockUnit, string> = { Milliliter: 'ml', Gram: 'g', Each: 'each' };
const TERMS: readonly { days: number; label: string }[] = [
  { days: 0, label: 'Immediate settlement' }, { days: 7, label: 'Net 7 days' }, { days: 15, label: 'Net 15 days' }, { days: 30, label: 'Net 30 days' },
  { days: 45, label: 'Net 45 days' }, { days: 60, label: 'Net 60 days' }, { days: 90, label: 'Net 90 days' }
];

interface LineVm {
  key: string;
  itemId: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  group: string | null;
  unit: StockUnit;
  qty: number;
  cost: number;
  disc: number;
  tax: number;
  expiry: string;
  binId: string | null;
  note: string;
  packName: string | null;
  packSize: number | null;
  packCount: number | null;
  onHand: number;
  lastCost: number | null;
  defaultBin: string | null;
  tracksBatches: boolean;
  tracksSerials: boolean;
  selected: boolean;
}

interface DirectLine { key: string; name: string; qty: number; binId: string | null; lot: string; expiry: string; serials: string; tracksBatches: boolean; tracksSerials: boolean }

/**
 * The purchase-order workstation: one screen to raise, price, post and follow an order, a supplier return or a branch transfer, and to book in goods
 * that arrived without an order. Every figure (line totals, discounts, tax, the payable) is worked out live as the person types, with the same
 * arithmetic the server uses; the server recomputes on save and its figures are the record. The supplier can be added or edited here without leaving.
 * Typography and layout follow the Obsidian Reserve design; colours come from the venue's theme.
 */
@Component({
  selector: 'zp-po-workstation',
  standalone: true,
  imports: [EntitledActionDirective, DatePipe, DecimalPipe, FormsModule, RouterLink, DialogComponent, ZpIconComponent, SupplierLookupComponent, SupplierFormComponent, PoPrintSheetComponent, StockCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="no-print flex flex-col gap-4 font-jakarta" data-testid="po-workstation">
      @if (error()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="po-error">{{ error() }}</p> }
      @if (loading()) { <p class="py-8 text-center text-ink/70">Loading...</p> }

      <!-- Document header and meta strip -->
      <section class="app-card flex flex-col gap-3 p-4" aria-label="Document">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-3">
            <div class="flex items-center gap-2 rounded-lg bg-ink/10 px-3 py-1.5"><zp-icon name="box" [size]="20" class="text-primary" /><h1 class="font-syne text-xl font-semibold">Purchase &amp; Inward Consignment</h1></div>
            <div class="flex items-center gap-2 rounded-lg bg-ink/5 px-3 py-1.5"><span class="po-cap">Doc ID</span><span class="font-data text-sm font-bold tracking-wider text-primary" data-testid="po-number">{{ doc()?.documentNumber ?? 'NEW' }}</span>
              @if (doc()) { <button type="button" class="text-ink/60 hover:text-primary" aria-label="Copy the document number" (click)="copyNumber()"><zp-icon name="copy" [size]="16" /></button> }</div>
            <div class="flex items-center gap-2 rounded-full px-3 py-1" [class]="statusTone()"><span class="h-2 w-2 animate-pulse rounded-full bg-current"></span><span class="font-data text-[11px] font-bold uppercase tracking-wide" data-testid="po-status">{{ statusText() }}</span></div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <label class="flex items-center gap-2 rounded-lg bg-ink/10 px-3 py-1.5"><span class="po-cap">Type</span>
              <select class="bg-transparent font-data text-xs font-semibold focus:outline-none" data-testid="po-type" [disabled]="!!doc() || !editable() || direct()" [ngModel]="type()" (ngModelChange)="setType($event)">
                @for (t of types; track t.value) { <option class="bg-panel text-ink" [value]="t.value" [disabled]="t.value === 'DirectConsignment' && !canDirect()">{{ t.label }}</option> }</select></label>
            <label class="flex items-center gap-2 rounded-lg bg-ink/10 px-3 py-1.5"><zp-icon name="branch" [size]="16" class="text-success" /><span class="po-cap">{{ type() === 'VendorReturn' ? 'Returning from' : 'Target' }}</span>
              <select class="bg-transparent font-data text-xs font-semibold text-success focus:outline-none" data-testid="po-branch" [disabled]="!!doc() || !editable()" [ngModel]="branchId()" (ngModelChange)="setBranch($event)">
                @for (b of branches.branches(); track b.id) { <option class="bg-panel text-ink" [value]="b.id">{{ b.name }}</option> }</select></label>
          </div>
        </div>

        @if (doc()?.rejectionNote) { <p class="sys-alert sys-alert-warning" role="status" data-testid="po-rejection">Sent back by the approver: {{ doc()!.rejectionNote }}</p> }
        @if (doc()?.overLimitReason) { <p class="sys-alert sys-alert-warning" role="status" data-testid="po-overlimit-note">Posted over the supplier's credit limit. Reason given: {{ doc()!.overLimitReason }}</p> }

        <div class="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <div class="flex flex-col gap-1 rounded-lg bg-ink/5 p-2"><span class="po-cap">Posting date</span><span class="font-data text-xs font-semibold">{{ (doc()?.dateCreated ?? today) | date: 'dd / MM / yyyy' }}</span></div>
          <label class="flex flex-col gap-1 rounded-lg bg-ink/5 p-2"><span class="po-cap">Vendor invoice ref #</span>
            <input class="bg-transparent font-data text-xs font-bold text-primary focus:outline-none" placeholder="Scan or type" data-testid="po-invoice" [disabled]="!editable()" [ngModel]="invoiceRef()" (ngModelChange)="touch(invoiceRef, $event)" /></label>
          <label class="flex flex-col gap-1 rounded-lg bg-ink/5 p-2"><span class="po-cap">Payment terms</span>
            <select class="bg-transparent font-data text-xs font-semibold focus:outline-none" data-testid="po-terms" [disabled]="!editable() || type() === 'StockTransfer'" [ngModel]="terms()" (ngModelChange)="touch(terms, +$event)">
              @for (t of termOptions(); track t.days) { <option class="bg-panel text-ink" [ngValue]="t.days">{{ t.label }}</option> }</select></label>
          <div class="flex flex-col gap-1 rounded-lg bg-ink/5 p-2"><span class="po-cap">Raised by</span><span class="flex items-center gap-2"><span class="grid h-5 w-5 place-items-center rounded-full bg-primary font-data text-[10px] font-bold text-on-primary">{{ initials() }}</span><span class="truncate font-data text-xs">{{ doc()?.createdByName ?? auth.membership()?.displayName }}</span></span></div>
          <div class="flex flex-col gap-1 rounded-lg bg-ink/5 p-2"><span class="po-cap">Prices include tax</span>
            <span class="flex items-center justify-between"><span class="font-data text-xs font-bold text-success">{{ taxLabel() }}</span>
              <label class="relative inline-flex cursor-pointer items-center"><input type="checkbox" class="peer sr-only" data-testid="po-inclusive" aria-label="Prices include tax" [disabled]="!editable()" [ngModel]="inclusive()" (ngModelChange)="touch(inclusive, $event)" />
                <span class="h-4 w-8 rounded-full bg-ink/25 transition peer-checked:bg-success peer-focus-visible:ring-2 peer-focus-visible:ring-primary after:absolute after:left-[2px] after:top-[2px] after:h-3 after:w-3 after:rounded-full after:bg-canvas after:transition-all peer-checked:after:translate-x-4"></span></label></span></div>
          <label class="flex flex-col gap-1 rounded-lg bg-ink/5 p-2"><span class="po-cap">Expected delivery</span>
            <input type="date" class="bg-transparent font-data text-xs font-semibold focus:outline-none" data-testid="po-expected" [disabled]="!editable()" [ngModel]="expected()" (ngModelChange)="touch(expected, $event)" /></label>
        </div>
      </section>

      <!-- Supplier / route and delivery cards -->
      <section class="grid grid-cols-1 gap-4 lg:grid-cols-12">
        @if (type() === 'StockTransfer') {
          <div class="app-card flex flex-col gap-3 lg:col-span-7" data-testid="po-route">
            <div class="flex items-center gap-2 border-b border-ink/10 pb-2"><zp-icon name="dispatch" [size]="20" class="text-primary" /><h2 class="font-syne text-lg font-semibold">Transfer route</h2></div>
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="rounded-lg bg-ink/5 p-3"><span class="po-cap">Sending branch</span>
                <select class="app-input mt-1" data-testid="po-source" [disabled]="!editable()" [ngModel]="sourceId()" (ngModelChange)="touch(sourceId, $event)"><option value="">Choose the branch the stock comes from</option>
                  @for (b of otherBranches(); track b.id) { <option [value]="b.id">{{ b.name }}</option> }</select></label>
              <div class="rounded-lg bg-ink/5 p-3"><span class="po-cap">Receiving branch</span><p class="mt-2 font-semibold">{{ branchName() }}</p><p class="text-xs text-ink/70">Stock leaves the sending branch when this branch's receiver verifies it, and goes into the bins chosen on each line.</p></div>
            </div>
          </div>
        } @else {
          <div class="app-card flex flex-col gap-3 lg:col-span-7" data-testid="po-supplier">
            <div class="flex items-center justify-between border-b border-ink/10 pb-2">
              <div class="flex items-center gap-2"><zp-icon name="truck" [size]="20" class="text-primary" /><h2 class="font-syne text-lg font-semibold">Supplier profile &amp; ledger</h2></div>
              @if (editable()) {
                <div class="flex items-center gap-1">
                  <button type="button" class="rounded-lg bg-ink/10 px-2 py-1 font-data text-[11px] font-semibold text-primary hover:bg-ink/15" data-testid="po-supplier-lookup" (click)="lookupOpen.set(true)"><zp-icon name="search" [size]="14" /> Lookup <span class="po-kbd">F6</span></button>
                  <button type="button" class="rounded-lg bg-ink/10 px-2 py-1 font-data text-[11px] font-semibold hover:bg-ink/15" data-testid="po-supplier-new" (click)="openSupplierForm(false)"><zp-icon name="plus" [size]="14" /> New supplier</button>
                  @if (supplier()) { <button type="button" class="rounded-lg bg-ink/5 px-2 py-1 hover:bg-ink/15" aria-label="Edit this supplier" data-testid="po-supplier-edit" (click)="openSupplierForm(true)"><zp-icon name="edit" [size]="16" /></button> }
                </div>
              }
            </div>
            @if (supplier(); as s) {
              <div class="grid grid-cols-1 items-center gap-2 sm:grid-cols-3">
                <div class="flex flex-col gap-1 rounded-lg bg-ink/5 p-3 sm:col-span-2">
                  <div class="flex items-center justify-between gap-2"><span class="font-semibold" data-testid="po-supplier-name">{{ s.name }}</span><span class="font-data text-xs font-bold text-primary">{{ s.code }}</span></div>
                  <p class="text-xs text-ink/70">{{ s.address }}</p>
                  <div class="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-data text-[11px] text-ink/70">
                    @if (s.taxId) { <span><strong class="text-ink">Tax ID:</strong> {{ s.taxId }}</span> } @if (s.phone) { <span><strong class="text-ink">Tel:</strong> {{ s.phone }}</span> } @if (s.repName) { <span><strong class="text-ink">Rep:</strong> {{ s.repName }}</span> }
                    @if (s.email) { <span><strong class="text-ink">E-mail:</strong> {{ s.email }}</span> }</div>
                </div>
                <div class="flex flex-col gap-1" data-testid="po-standing">
                  <div class="flex items-center justify-between rounded bg-ink/5 px-2 py-1"><span class="po-cap">Balance</span><span class="font-data text-xs font-bold" [class]="(standing()?.balance ?? 0) > 0 ? 'text-danger' : 'text-ink'">{{ standing()?.balance ?? 0 | number: '1.2-2' }}</span></div>
                  <div class="flex items-center justify-between rounded bg-ink/5 px-2 py-1"><span class="po-cap">On order</span><span class="font-data text-xs font-semibold">{{ standing()?.onOrder ?? 0 | number: '1.2-2' }}</span></div>
                  <div class="flex items-center justify-between rounded bg-ink/5 px-2 py-1"><span class="po-cap">Credit limit</span><span class="font-data text-xs font-semibold">{{ standing()?.creditLimit == null ? 'None set' : (standing()!.creditLimit | number: '1.2-2') }}</span></div>
                  <div class="flex items-center justify-between rounded bg-ink/10 px-2 py-1"><span class="po-cap font-bold text-success">Available</span><span class="font-data text-xs font-bold" [class]="overBy() > 0 ? 'text-danger' : 'text-success'" data-testid="po-available">{{ standing()?.available == null ? 'No limit' : (standing()!.available | number: '1.2-2') }}</span></div>
                </div>
              </div>
              @if (overBy() > 0) { <p class="sys-alert sys-alert-warning" role="status" data-testid="po-overlimit">This order is {{ overBy() | number: '1.2-2' }} over {{ s.name }}'s available credit. You can still post it, with a reason the approver will see.</p> }
              @if (!s.email && doc()) { <p class="text-xs text-ink/60">This supplier has no e-mail address, so the order cannot be e-mailed. Edit the supplier to add one.</p> }
            } @else {
              <div class="rounded-lg border border-dashed border-ink/25 p-6 text-center text-sm text-ink/70">
                <p>Choose the supplier for this document.</p>
                @if (editable()) { <p class="mt-2 flex justify-center gap-2"><button type="button" class="btn-outline" (click)="lookupOpen.set(true)">Find a supplier</button><button type="button" class="btn-primary" (click)="openSupplierForm(false)">Add a new supplier</button></p> }
              </div>
            }
          </div>
        }

        <div class="app-card flex flex-col gap-3 lg:col-span-5">
          <div class="flex items-center justify-between border-b border-ink/10 pb-2"><div class="flex items-center gap-2"><zp-icon name="clipboard" [size]="20" class="text-success" /><h2 class="font-syne text-lg font-semibold">Consignment inward manifest</h2></div>
            @if ((doc()?.receipts?.length ?? 0) > 0) { <span class="rounded bg-ink/10 px-2 py-1 font-data text-[11px] font-semibold text-success">DOCK VERIFIED</span> }</div>
          <div class="grid grid-cols-2 gap-2">
            <label class="flex flex-col gap-1 rounded-lg bg-ink/5 p-2"><span class="po-cap">Logistics courier</span><input class="bg-transparent font-data text-xs font-semibold focus:outline-none" maxlength="120" data-testid="po-courier" [disabled]="!editable()" [ngModel]="courier()" (ngModelChange)="touch(courier, $event)" /></label>
            <label class="flex flex-col gap-1 rounded-lg bg-ink/5 p-2"><span class="po-cap">Waybill</span><input class="bg-transparent font-data text-xs font-semibold focus:outline-none" maxlength="80" data-testid="po-waybill" [disabled]="!editable()" [ngModel]="waybill()" (ngModelChange)="touch(waybill, $event)" /></label>
          </div>
          <div class="rounded-lg bg-ink/5 p-2"><span class="po-cap">Receiving branch</span><p class="font-data text-xs font-semibold">{{ branchName() }}</p></div>
          <label class="flex flex-col gap-1 rounded-lg bg-ink/5 p-2"><span class="po-cap">Memo for the supplier and receiver</span><textarea rows="2" maxlength="500" class="resize-none bg-transparent text-xs focus:outline-none" data-testid="po-notes" [disabled]="!editable()" [ngModel]="notes()" (ngModelChange)="touch(notes, $event)"></textarea></label>
        </div>
      </section>

      <!-- Lines -->
      <section class="app-card flex flex-col gap-3" aria-label="Order lines">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2"><zp-icon name="list" [size]="20" class="text-primary" /><h2 class="font-syne text-lg font-semibold">Order lines</h2>
            <span class="rounded-full bg-ink/10 px-2 py-0.5 font-data text-[11px] text-ink/70" data-testid="po-line-count">{{ lines().length }} {{ lines().length === 1 ? 'line' : 'lines' }}</span></div>
          @if (editable()) {
            <div class="relative flex max-w-xl flex-1 items-center gap-2 rounded-lg bg-ink/10 p-1">
              <zp-icon name="scan" [size]="18" class="ml-2 text-primary" />
              <input #scan class="w-full bg-transparent font-data text-xs placeholder:text-ink/50 focus:outline-none" placeholder="Quick scan barcode or SKU, or type an item name" data-testid="po-scan" autocomplete="off" [ngModel]="scanText()" (ngModelChange)="onScanText($event)" (keydown.enter)="scanEnter(); $event.preventDefault()" />
              <span class="po-kbd">F4</span>
              <button type="button" class="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 font-data text-[11px] font-bold text-on-primary" data-testid="po-add-sku" [attr.title]="canAddItems() ? 'Create a new stock item and add it to this document' : 'You need the right to edit stock items to create one'" (click)="addSku()"><zp-icon name="plus" [size]="14" /> Add SKU</button>
              @if (matches().length > 0) {
                <ul class="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-lg border border-ink/15 bg-panel shadow-xl" data-testid="po-matches">
                  @for (m of matches(); track m.id) { <li><button type="button" class="app-focus flex w-full justify-between gap-3 px-3 py-2 text-left hover:bg-primary/10" [attr.data-testid]="'po-match-' + m.id" (click)="addItem(m)"><span class="text-sm font-semibold">{{ m.name }}</span><span class="font-data text-[11px] text-ink/60">{{ m.sku }} {{ m.barcode }}</span></button></li> }
                </ul>
              }
            </div>
          }
        </div>
        @if (scanNote()) { <p class="text-xs text-warning" role="status" data-testid="po-scan-note">{{ scanNote() }}</p> }
        <!-- Add SKU: the stock card for a brand-new item; once saved it goes straight onto this document. -->
        @if (newItemOpen()) { <zp-stock-card [itemId]="null" [prefill]="newItemPrefill()" (savedItem)="onNewItem($event)" (closed)="newItemOpen.set(false)" /> }

        <div class="overflow-x-auto rounded-lg bg-ink/5">
          <table class="w-full min-w-[60rem] text-left" data-testid="po-lines">
            <thead><tr class="bg-ink/10 font-data text-[11px] uppercase tracking-wider text-ink/70">
              <th class="w-8 px-2 py-2"></th><th class="w-8 px-2 py-2 text-center">#</th><th class="w-32 px-2 py-2">Part / SKU</th><th class="px-2 py-2">Item details &amp; category</th><th class="w-32 px-2 py-2">{{ type() === 'VendorReturn' ? 'From bin' : 'Bin / loc' }}</th>
              <th class="w-32 px-2 py-2 text-right">Quantity</th><th class="w-24 px-2 py-2 text-right">Cost</th><th class="w-20 px-2 py-2 text-right">Disc %</th><th class="w-28 px-2 py-2 text-center">Expiry</th><th class="w-24 px-2 py-2 text-right">Tax %</th><th class="w-28 px-2 py-2 text-right">Total</th></tr></thead>
            <tbody class="divide-y divide-ink/10 text-sm">
              @for (l of lines(); track l.key; let i = $index) {
                @let r = results()[i];
                <tr class="transition-colors hover:bg-ink/5" [class]="inspectedKey() === l.key ? 'bg-primary/5' : ''" [attr.data-testid]="'line-' + i" (click)="inspectedKey.set(l.key)">
                  <td class="px-2 py-2 text-center"><input type="checkbox" class="h-4 w-4" [attr.aria-label]="'Select ' + l.name" [attr.data-testid]="'line-select-' + i" [ngModel]="l.selected" (ngModelChange)="patchLine(l.key, { selected: $event })" [disabled]="!editable()" /></td>
                  <td class="px-2 py-2 text-center font-data text-[11px] text-ink/60">{{ i + 1 }}</td>
                  <td class="px-2 py-2 font-data text-[11px] font-bold text-primary">{{ l.sku || '-' }}</td>
                  <td class="px-2 py-2"><span class="block text-sm font-semibold">{{ l.name }}</span>
                    <span class="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-ink/70">@if (l.group) { <span class="rounded bg-ink/10 px-1.5 py-0.5 font-data text-primary">{{ l.group }}</span> }<span>{{ unit(l.unit) }}@if (l.packName && l.packSize) { &bull; {{ l.packCount ?? 0 | number: '1.0-2' }} {{ l.packName }} x {{ l.packSize | number: '1.0-4' }} }</span></span></td>
                  <td class="px-2 py-2"><select class="w-full rounded bg-canvas px-1 py-1 font-data text-[11px] text-success focus:outline-none focus:ring-1 focus:ring-primary" [attr.aria-label]="'Bin for ' + l.name" [attr.data-testid]="'line-bin-' + i" [disabled]="!editable() || bins().length === 0" [ngModel]="l.binId" (ngModelChange)="patchLine(l.key, { binId: $event })">
                    <option [ngValue]="null">{{ bins().length === 0 ? 'No bins set up' : 'Choose a bin' }}</option>@for (b of bins(); track b.id) { <option [ngValue]="b.id">{{ b.code }}{{ b.isHighSecurity ? ' (secure)' : '' }}</option> }</select></td>
                  <td class="px-2 py-2"><div class="flex flex-col items-end gap-1">
                    <input type="number" min="0" step="any" class="po-cell" [attr.aria-label]="'Quantity of ' + l.name" [attr.data-testid]="'line-qty-' + i" [disabled]="!editable()" [ngModel]="l.qty" (ngModelChange)="setQty(l.key, +$event)" />
                    @if (l.packName && l.packSize && editable()) { <span class="flex items-center gap-1 text-[10px] text-ink/60"><input type="number" min="0" step="any" class="po-cell w-14 py-0.5" [attr.aria-label]="l.packName + 's of ' + l.name" [attr.data-testid]="'line-packs-' + i" [ngModel]="l.packCount" (ngModelChange)="setPacks(l.key, +$event)" /> {{ l.packName }}</span> }
                    @if (type() !== 'VendorReturn') { <span class="font-data text-[10px] text-success">+{{ l.qty | number: '1.0-2' }} on {{ l.onHand | number: '1.0-2' }} held</span> } @else { <span class="font-data text-[10px] text-ink/60">{{ l.onHand | number: '1.0-2' }} held</span> }</div></td>
                  <td class="px-2 py-2"><input type="number" min="0" step="any" class="po-cell" [attr.aria-label]="'Cost of ' + l.name" [attr.data-testid]="'line-cost-' + i" [disabled]="!editable() || type() === 'StockTransfer'" [ngModel]="l.cost" (ngModelChange)="patchLine(l.key, { cost: +$event })" /></td>
                  <td class="px-2 py-2"><input type="number" min="0" max="100" step="any" class="po-cell" [attr.aria-label]="'Discount percent of ' + l.name" [attr.data-testid]="'line-disc-' + i" [disabled]="!editable() || type() === 'StockTransfer'" [ngModel]="l.disc" (ngModelChange)="patchLine(l.key, { disc: +$event })" /></td>
                  <td class="px-2 py-2"><input type="date" class="w-full rounded bg-canvas px-1 py-1 font-data text-[11px] focus:outline-none focus:ring-1 focus:ring-primary" [attr.aria-label]="'Expiry of ' + l.name" [disabled]="!editable() || type() === 'VendorReturn'" [ngModel]="l.expiry" (ngModelChange)="patchLine(l.key, { expiry: $event })" /></td>
                  <td class="px-2 py-2"><input type="number" min="0" max="100" step="any" class="po-cell" [attr.aria-label]="'Tax percent of ' + l.name" [attr.data-testid]="'line-tax-' + i" [disabled]="!editable() || type() === 'StockTransfer'" [ngModel]="l.tax" (ngModelChange)="patchLine(l.key, { tax: +$event })" />
                    <span class="mt-1 block text-right font-data text-[10px] text-ink/60">{{ r.tax | number: '1.2-2' }}</span></td>
                  <td class="px-2 py-2 text-right font-data text-sm font-bold text-success" [attr.data-testid]="'line-total-' + i">{{ r.total | number: '1.2-2' }}</td>
                </tr>
              } @empty { <tr><td colspan="11" class="px-3 py-10 text-center text-sm text-ink/70">No lines yet. Scan a barcode, type an SKU or search for an item above.</td></tr> }
            </tbody>
          </table>
        </div>

        <!-- Inspected item -->
        <div class="grid grid-cols-2 items-center gap-3 rounded-lg bg-ink/5 p-3 sm:grid-cols-4 lg:grid-cols-6" data-testid="po-inspect">
          <div class="flex flex-col"><span class="po-cap">Inspected SKU</span><span class="font-data text-xs font-bold text-primary">{{ inspected()?.sku || inspected()?.name || '-' }}</span></div>
          <div class="flex flex-col"><span class="po-cap">Currently on hand</span><span class="font-data text-xs font-semibold">{{ inspected() ? (inspected()!.onHand | number: '1.0-2') + ' ' + unit(inspected()!.unit) : '-' }}</span></div>
          <div class="flex flex-col"><span class="po-cap">Default bin</span><span class="font-data text-xs font-semibold text-success">{{ inspectedBin() }}</span></div>
          <div class="flex flex-col"><span class="po-cap">Total units on this document</span><span class="font-data text-sm font-bold" data-testid="po-units">{{ totalUnits() | number: '1.0-2' }}</span></div>
          <div class="flex flex-col"><span class="po-cap">Last purchase cost</span><span class="font-data text-xs font-semibold">{{ inspected()?.lastCost == null ? 'None yet' : (inspected()!.lastCost | number: '1.2-4') }}@if (costChange() != null) { <span [class]="costChange()! > 0 ? 'text-danger' : 'text-success'"> {{ costChange()! > 0 ? '+' : '' }}{{ costChange() | number: '1.1-1' }}%</span> }</span></div>
          <div class="flex flex-wrap items-center justify-end gap-2">
            @if (inspected()?.tracksBatches) { <span class="rounded bg-ink/10 px-2 py-1 font-data text-[10px]">Batch tracked</span> }
            @if (inspected()?.tracksSerials) { <span class="rounded bg-ink/10 px-2 py-1 font-data text-[10px]">Serial tracked</span> }</div>
        </div>
      </section>

      <!-- Margin telemetry and payable -->
      <section class="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div class="app-card flex flex-col gap-3 lg:col-span-6" data-testid="po-margins">
          <div class="flex items-center justify-between border-b border-ink/10 pb-2"><div class="flex items-center gap-2"><zp-icon name="chart" [size]="20" class="text-primary" /><h2 class="font-syne text-lg font-semibold">Yield &amp; pricing markup</h2></div>
            <span class="rounded bg-ink/10 px-2 py-1 font-data text-[11px] font-semibold text-success">LIVE FROM YOUR PRODUCTS</span></div>
          @if (analysis(); as a) {
            <div class="grid grid-cols-3 gap-2">
              <div class="flex flex-col gap-1 rounded-lg bg-ink/5 p-2"><div class="flex items-center justify-between"><span class="po-cap">Retail pour</span><span class="font-data text-[11px] font-bold text-success">{{ a.retailMarginPercent == null ? '' : a.retailMarginPercent + '%' }}</span></div>
                <span class="font-data text-lg font-bold" data-testid="po-retail">{{ a.retailRevenue | number: '1.0-0' }}</span><span class="text-[10px] text-ink/60">Expected takings at today's prices</span></div>
              <div class="flex flex-col gap-1 rounded-lg bg-ink/5 p-2"><div class="flex items-center justify-between"><span class="po-cap">Trade</span><span class="font-data text-[11px] font-bold text-success">{{ a.tradeMarginPercent == null ? '' : a.tradeMarginPercent + '%' }}</span></div>
                <span class="font-data text-lg font-bold text-success">{{ a.tradeRevenue | number: '1.0-0' }}</span><span class="text-[10px] text-ink/60">{{ a.tradeRevenue === 0 ? 'No trade prices set' : 'At item trade prices' }}</span></div>
              <div class="flex flex-col gap-1 rounded-lg bg-ink/5 p-2"><div class="flex items-center justify-between"><span class="po-cap">Wholesale</span><span class="font-data text-[11px] font-bold text-primary">{{ a.wholesaleMarginPercent == null ? '' : a.wholesaleMarginPercent + '%' }}</span></div>
                <span class="font-data text-lg font-bold">{{ a.wholesaleRevenue | number: '1.0-0' }}</span><span class="text-[10px] text-ink/60">{{ a.wholesaleRevenue === 0 ? 'No wholesale prices set' : 'At item wholesale prices' }}</span></div>
            </div>
            <div class="flex flex-col gap-1 rounded-lg bg-ink/5 p-2"><div class="flex items-center justify-between"><span class="po-cap">Blended margin on lines that have a retail price</span><span class="font-data text-[11px] font-bold text-success" data-testid="po-margin">{{ a.retailMarginPercent == null ? 'No priced lines' : a.retailMarginPercent + '%' }}</span></div>
              <div class="h-2 overflow-hidden rounded-full bg-ink/15"><div class="h-full rounded-full bg-success transition-all" [style.width.%]="clampPercent(a.retailMarginPercent)"></div></div></div>
            @if (a.unpricedLines > 0) { <p class="text-xs text-warning" data-testid="po-unpriced">{{ a.unpricedLines }} line(s) have no product selling this item, so they are left out of the retail figures.</p> }
          } @else { <p class="py-6 text-center text-sm text-ink/70">Add lines to see what the stock should earn.</p> }
        </div>

        <div class="app-card flex flex-col gap-3 lg:col-span-6" data-testid="po-payable">
          <div class="flex items-center justify-between border-b border-ink/10 pb-2"><h2 class="font-syne text-lg font-semibold">Accounts payable settlement</h2><span class="po-cap">Currency: {{ currency() }}</span></div>
          <dl class="grid grid-cols-2 gap-x-4 gap-y-1 py-1 text-sm">
            <div class="flex items-center justify-between"><dt class="text-ink/70">Items subtotal:</dt><dd class="font-data font-semibold" data-testid="po-subtotal">{{ totals().subtotal | number: '1.2-2' }}</dd></div>
            <div class="flex items-center justify-between"><dt class="text-ink/70">Applied discounts:</dt><dd class="font-data font-semibold text-primary" data-testid="po-discount">-{{ totals().discount | number: '1.2-2' }}</dd></div>
            <div class="flex items-center justify-between"><dt class="text-ink/70">Net inward total:</dt><dd class="font-data font-semibold" data-testid="po-net">{{ totals().netInward | number: '1.2-2' }}</dd></div>
            <div class="flex items-center justify-between"><dt class="text-ink/70">Tax {{ inclusive() ? 'included' : 'added' }}:</dt><dd class="font-data font-semibold" data-testid="po-tax">{{ totals().tax | number: '1.2-2' }}</dd></div>
          </dl>
          <div class="flex items-center justify-between rounded-xl bg-ink/10 p-4 shadow-lg">
            <div class="flex flex-col"><span class="po-cap font-bold text-success">{{ type() === 'VendorReturn' ? 'Credit expected from supplier' : 'Total consignment payable' }}</span><span class="text-[11px] text-ink/60">{{ inclusive() ? 'Tax is already in the prices' : 'Includes ' + (totals().tax | number: '1.2-2') + ' tax' }}</span></div>
            <div class="flex flex-col items-end"><span class="font-syne text-3xl font-bold leading-none text-success" data-testid="po-total">{{ totals().total | number: '1.2-2' }}</span>
              @if (type() === 'Standard' || type() === 'DirectConsignment') { <span class="mt-1 font-data text-[11px] font-semibold text-primary" data-testid="po-paid">Paid: {{ paid() | number: '1.2-2' }} &bull; Due: {{ due() | number: '1.2-2' }}</span> }</div>
          </div>
        </div>
      </section>

      <!-- Command dock -->
      <section class="app-card sticky bottom-2 z-30 flex flex-wrap items-center justify-between gap-3 p-3 shadow-2xl" aria-label="Actions">
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class="btn-outline h-11" data-testid="po-print" [disabled]="!doc()" (click)="print()"><zp-icon name="printer" [size]="18" /> Print <span class="po-kbd">F3</span></button>
          <button type="button" class="btn-outline h-11" data-testid="po-email" zpAction="inventory.purchase.manage" [disabled]="!doc()?.actions?.canEmail" [title]="doc()?.actions?.canEmail ? '' : 'Available once the order is approved and the supplier has an e-mail address'" (click)="email()"><zp-icon name="mail" [size]="18" /> E-mail order</button>
          <button type="button" class="btn-outline h-11" data-testid="po-tags" [disabled]="lines().length === 0" (click)="shelfTags()"><zp-icon name="tag" [size]="18" /> Print shelf tags</button>
          @if (editable()) { <button type="button" class="inline-flex h-11 items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 text-sm font-semibold text-danger disabled:opacity-40" data-testid="po-void" [disabled]="selectedCount() === 0" (click)="voidSelected()"><zp-icon name="trash" [size]="18" /> Void selection</button> }
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class="btn-ghost h-11" data-testid="po-cancel" (click)="leave()"><zp-icon name="x" [size]="18" /> Close <span class="po-kbd">Esc</span></button>
          @if (doc()?.actions?.canReject) { <button type="button" class="btn-outline h-11" data-testid="po-reject" zpAction="inventory.purchase.approve" (click)="rejectOpen.set(true)">Send back</button> }
          @if (doc()?.actions?.canApprove) { <button type="button" class="btn-primary h-11" data-testid="po-approve" zpAction="inventory.purchase.approve" [disabled]="busy()" (click)="approve()"><zp-icon name="check" [size]="18" /> Approve</button> }
          @if (doc()?.actions?.canCloseShort) { <button type="button" class="btn-outline h-11" data-testid="po-close-short" zpAction="inventory.purchase.approve" (click)="closeShortOpen.set(true)">Close short</button> }
          @if (doc()?.actions?.canCancel) { <button type="button" class="btn-ghost h-11 text-danger" data-testid="po-cancel-doc" zpAction="inventory.purchase.manage" (click)="cancelDocument()">Cancel document</button> }
          @if (doc()?.actions?.canPay) { <button type="button" class="btn-outline h-11" data-testid="po-pay" zpAction="purchasing.payments.manage" (click)="openPay()"><zp-icon name="wallet" [size]="18" /> Record payment <span class="po-kbd">F5</span></button> }
          @if (doc()?.actions?.canReceive) { <a class="btn-primary h-11" data-testid="po-receive" zpAction="purchasing.receive" [routerLink]="['/app/purchasing/orders', doc()!.id, 'receive']"><zp-icon name="inbox" [size]="18" /> Receive goods</a> }
          @if (!doc()?.actions?.canReceive && doc()?.actions?.receiveBlockedReason) { <span class="text-xs text-ink/70" data-testid="po-receive-blocked">{{ doc()!.actions.receiveBlockedReason }}</span> }
          @if (editable()) {
            <button type="button" class="btn-outline h-11" data-testid="po-save" zpAction="inventory.purchase.manage" [disabled]="busy() || !dirty()" (click)="saveDraft()"><zp-icon name="doneall" [size]="18" /> Save draft</button>
            @if (direct()) { <button type="button" class="btn-primary h-11 px-6" data-testid="po-book" zpAction="purchasing.receive" [disabled]="busy()" (click)="openDirect()"><zp-icon name="inbox" [size]="20" /> Book into stock <span class="po-kbd">F2</span></button> }
            @else { <button type="button" class="btn-primary h-11 px-6 font-syne uppercase tracking-wide" data-testid="po-post" zpAction="inventory.purchase.manage" [disabled]="busy()" (click)="post()"><zp-icon name="shield" [size]="20" /> {{ postLabel() }} <span class="po-kbd">F2</span></button> }
          }
        </div>
      </section>
    </div>

    <zp-po-print-sheet [doc]="doc()" />

    <!-- Dialogs -->
    <zp-supplier-lookup [open]="lookupOpen()" (picked)="pickSupplier($event)" (addNew)="lookupOpen.set(false); openSupplierForm(false)" (closed)="lookupOpen.set(false)" />
    <zp-supplier-form [open]="supplierFormOpen()" [supplier]="editingSupplier()" (saved)="onSupplierSaved($event)" (closed)="supplierFormOpen.set(false)" />

    <zp-dialog [open]="reasonOpen()" title="This order is over the supplier's credit limit" (closed)="reasonOpen.set(false)">
      <form class="space-y-3" (submit)="$event.preventDefault(); confirmOverLimit()">
        <p class="text-sm">{{ overLimitMessage() }}</p>
        <div><label class="app-label" for="ol-reason">Reason (the approver and the audit log will see it)</label><input id="ol-reason" class="app-input" maxlength="400" data-testid="po-overlimit-reason" [ngModel]="overLimitReason()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="overLimitReason.set($event)" /></div>
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="reasonOpen.set(false)">Cancel</button><button type="submit" class="btn-primary" data-testid="po-overlimit-post" [disabled]="busy() || overLimitReason().trim().length < 3">Post anyway</button></div>
      </form>
    </zp-dialog>

    <zp-dialog [open]="rejectOpen()" title="Send back to the buyer" (closed)="rejectOpen.set(false)">
      <form class="space-y-3" (submit)="$event.preventDefault(); reject()">
        <div><label class="app-label" for="rj-reason">What needs to change?</label><input id="rj-reason" class="app-input" maxlength="400" data-testid="po-reject-reason" [ngModel]="reasonText()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="reasonText.set($event)" /></div>
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="rejectOpen.set(false)">Cancel</button><button type="submit" class="btn-primary" data-testid="po-reject-confirm" [disabled]="busy() || reasonText().trim().length < 3">Send back</button></div>
      </form>
    </zp-dialog>

    <zp-dialog [open]="closeShortOpen()" title="Close this order short" (closed)="closeShortOpen.set(false)">
      <form class="space-y-3" (submit)="$event.preventDefault(); closeShort()">
        <p class="text-sm">What is still outstanding will not be delivered, and the order is marked received.</p>
        <div><label class="app-label" for="cs-reason">Reason</label><input id="cs-reason" class="app-input" maxlength="400" data-testid="po-close-reason" [ngModel]="reasonText()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="reasonText.set($event)" /></div>
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="closeShortOpen.set(false)">Cancel</button><button type="submit" class="btn-primary" data-testid="po-close-confirm" [disabled]="busy() || reasonText().trim().length < 3">Close order</button></div>
      </form>
    </zp-dialog>

    <zp-dialog [open]="payOpen()" title="Record a payment to the supplier" (closed)="payOpen.set(false)">
      <form class="grid gap-3 sm:grid-cols-2" (submit)="$event.preventDefault(); pay()">
        <div><label class="app-label" for="py-amount">Amount</label><input id="py-amount" type="number" min="0.01" step="0.01" class="app-input font-data" data-testid="po-pay-amount" [ngModel]="payAmount()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="payAmount.set(+$event)" /></div>
        <div><label class="app-label" for="py-method">Method</label><select id="py-method" class="app-input" data-testid="po-pay-method" [ngModel]="payMethod()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="payMethod.set($event)"><option>Transfer</option><option>Cash</option><option>Card</option><option>Other</option></select></div>
        <div class="sm:col-span-2"><label class="app-label" for="py-ref">Reference</label><input id="py-ref" class="app-input" maxlength="100" data-testid="po-pay-ref" [ngModel]="payRef()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="payRef.set($event)" /></div>
        <p class="text-xs text-ink/70 sm:col-span-2">Due on this order: {{ due() | number: '1.2-2' }}. Payments are recorded against the supplier's account and shown in Payments to Suppliers.</p>
        @if (payError()) { <p class="sys-alert sys-alert-danger sm:col-span-2" role="alert">{{ payError() }}</p> }
        <div class="flex justify-end gap-2 sm:col-span-2"><button type="button" class="btn-ghost" (click)="payOpen.set(false)">Cancel</button><button type="submit" class="btn-primary" data-testid="po-pay-confirm" [disabled]="busy() || payAmount() <= 0">Record payment</button></div>
      </form>
    </zp-dialog>

    <zp-dialog [open]="directOpen()" title="Book these goods into stock" [wide]="true" (closed)="directOpen.set(false)">
      <p class="mb-3 text-sm">These goods arrived without an order. Checking them in creates the document and puts the stock away in one step, and it is audited as a direct consignment.</p>
      <div class="overflow-x-auto"><table class="app-table min-w-[40rem]" data-testid="po-direct-table"><thead><tr><th>Item</th><th class="text-right">Quantity</th><th>Bin</th><th>Lot</th><th>Expiry</th><th>Serial numbers</th></tr></thead>
        <tbody>@for (d of directLines(); track d.key; let i = $index) {
          <tr><td>{{ d.name }}</td><td class="text-right font-data">{{ d.qty | number: '1.0-4' }}</td>
            <td><select class="app-input py-1" [attr.aria-label]="'Bin for ' + d.name" [attr.data-testid]="'direct-bin-' + i" [disabled]="bins().length === 0" [ngModel]="d.binId" (ngModelChange)="patchDirect(d.key, { binId: $event })"><option [ngValue]="null">{{ bins().length === 0 ? 'No bins' : 'Choose' }}</option>@for (b of bins(); track b.id) { <option [ngValue]="b.id">{{ b.code }}</option> }</select></td>
            <td>@if (d.tracksBatches) { <input class="app-input py-1" maxlength="60" [attr.aria-label]="'Lot of ' + d.name" [attr.data-testid]="'direct-lot-' + i" [ngModel]="d.lot" (ngModelChange)="patchDirect(d.key, { lot: $event })" /> } @else { <span class="text-xs text-ink/50">-</span> }</td>
            <td><input type="date" class="app-input py-1" [attr.aria-label]="'Expiry of ' + d.name" [ngModel]="d.expiry" (ngModelChange)="patchDirect(d.key, { expiry: $event })" /></td>
            <td>@if (d.tracksSerials) { <textarea rows="2" class="app-input font-data text-xs" placeholder="One per line" [attr.aria-label]="'Serials of ' + d.name" [attr.data-testid]="'direct-serials-' + i" [ngModel]="d.serials" (ngModelChange)="patchDirect(d.key, { serials: $event })"></textarea> } @else { <span class="text-xs text-ink/50">-</span> }</td></tr> }</tbody></table></div>
      @if (directError()) { <p class="sys-alert sys-alert-danger mt-3" role="alert" data-testid="po-direct-error">{{ directError() }}</p> }
      <div class="mt-3 flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="directOpen.set(false)">Cancel</button><button type="button" class="btn-primary" data-testid="po-direct-confirm" [disabled]="busy()" (click)="book()">Book into stock</button></div>
    </zp-dialog>
  `
})
export class PurchaseOrderWorkstationComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly api = inject(PurchasingWorkstationApi);
  private readonly receiving = inject(ReceivingApi);
  private readonly inventory = inject(InventoryApi);
  private readonly paymentsApi = inject(PurchasingApi);
  private readonly binApi = inject(BinApi);
  private readonly settings = inject(OperationSettingsApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  protected readonly auth = inject(AuthService);
  protected readonly branches = inject(BranchContextService);

  protected readonly types = DOCUMENT_TYPES;
  protected readonly today = new Date().toISOString();

  // The saved document and the working copy of the form.
  protected readonly doc = signal<WorkstationOrderDto | null>(null);
  protected readonly type = signal<PurchaseDocumentType>('Standard');
  protected readonly branchId = signal('');
  protected readonly sourceId = signal('');
  protected readonly supplier = signal<SupplierDto | null>(null);
  protected readonly invoiceRef = signal('');
  protected readonly terms = signal<number>(30);
  protected readonly inclusive = signal(false);
  protected readonly courier = signal('');
  protected readonly waybill = signal('');
  protected readonly expected = signal('');
  protected readonly notes = signal('');
  protected readonly lines = signal<readonly LineVm[]>([]);
  protected readonly bins = signal<readonly BinDto[]>([]);
  protected readonly standing = signal<SupplierStandingDto | null>(null);
  protected readonly analysis = signal<AnalyseDto | null>(null);
  protected readonly defaultTax = signal(0);
  protected readonly taxName = signal('Tax');

  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly inspectedKey = signal<string | null>(null);

  // Item search.
  protected readonly scanText = signal('');
  protected readonly matches = signal<readonly InventoryItemDto[]>([]);
  protected readonly scanNote = signal<string | null>(null);
  protected readonly newItemOpen = signal(false);
  protected readonly newItemPrefill = signal<{ name?: string; barcode?: string } | null>(null);

  // Dialogs.
  protected readonly lookupOpen = signal(false);
  protected readonly supplierFormOpen = signal(false);
  protected readonly editingSupplier = signal<SupplierDto | null>(null);
  protected readonly reasonOpen = signal(false);
  protected readonly overLimitReason = signal('');
  protected readonly overLimitMessage = signal('');
  protected readonly rejectOpen = signal(false);
  protected readonly closeShortOpen = signal(false);
  protected readonly reasonText = signal('');
  protected readonly payOpen = signal(false);
  protected readonly payAmount = signal(0);
  protected readonly payMethod = signal<'Cash' | 'Card' | 'Transfer' | 'Other'>('Transfer');
  protected readonly payRef = signal('');
  protected readonly payError = signal<string | null>(null);
  protected readonly directOpen = signal(false);
  protected readonly directLines = signal<readonly DirectLine[]>([]);
  protected readonly directError = signal<string | null>(null);

  private snapshot = '';
  private readonly formKey = `po-${crypto.randomUUID()}`;
  private readonly receiptKey = `dc-${crypto.randomUUID()}`;

  /** UX only: creating a stock item is checked again by the server. */
  protected readonly canAddItems = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.INVENTORY_ITEMS_MANAGE));
  protected readonly canDirect = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.PURCHASING_RECEIVE));
  protected readonly direct = computed(() => this.type() === 'DirectConsignment');
  protected readonly editable = computed(() => !this.doc() || this.doc()!.actions.canEdit);
  protected readonly branchName = computed(() => this.branches.branches().find((b) => b.id === this.branchId())?.name ?? '');
  protected readonly otherBranches = computed(() => this.branches.branches().filter((b) => b.id !== this.branchId()));
  protected readonly currency = computed(() => this.doc()?.currencyCode || this.auth.tenant()?.currencyCode || '');
  protected readonly termOptions = computed(() => (TERMS.some((t) => t.days === this.terms()) ? TERMS : [...TERMS, { days: this.terms(), label: `Net ${this.terms()} days` }]));

  protected readonly results = computed(() => this.lines().map((l) => lineAmounts({ quantity: l.qty, unitCost: l.cost, discountPercent: l.disc, taxRatePercent: l.tax }, this.inclusive())));
  protected readonly totals = computed(() => sumLines(this.results()));
  protected readonly totalUnits = computed(() => this.lines().reduce((n, l) => n + l.qty, 0));
  protected readonly selectedCount = computed(() => this.lines().filter((l) => l.selected).length);
  protected readonly inspected = computed<LineVm | null>(() => this.lines().find((l) => l.key === this.inspectedKey()) ?? this.lines().at(-1) ?? null);
  protected readonly inspectedBin = computed(() => { const l = this.inspected(); const id = l?.binId ?? l?.defaultBin; return this.bins().find((b) => b.id === id)?.code ?? 'None chosen'; });
  protected readonly costChange = computed(() => { const l = this.inspected(); return l && l.lastCost && l.cost ? ((l.cost - l.lastCost) / l.lastCost) * 100 : null; });
  protected readonly overBy = computed(() => {
    const available = this.standing()?.available;
    return this.type() === 'Standard' && available != null && this.totals().total > available ? round2(this.totals().total - Math.max(0, available)) : 0;
  });
  protected readonly paid = computed(() => this.doc()?.paid ?? 0);
  protected readonly due = computed(() => (this.doc() ? this.doc()!.due : this.totals().total));
  protected readonly taxLabel = computed(() => `${this.taxName()} ${this.defaultTax()}% ${this.inclusive() ? 'INCL' : 'EXCL'}`);
  protected readonly initials = computed(() => (this.doc()?.createdByName ?? this.auth.membership()?.displayName ?? '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase());
  protected readonly postLabel = computed(() => (this.type() === 'VendorReturn' ? 'Post return' : this.type() === 'StockTransfer' ? 'Post transfer' : 'Post purchase order'));
  protected readonly statusText = computed(() => (this.doc() ? STATUS_TEXT[this.doc()!.status] : 'Draft - not saved yet'));
  protected readonly statusTone = computed(() => {
    const s = this.doc()?.status;
    return s === 'Received' ? 'bg-success/15 text-success' : s === 'Cancelled' ? 'bg-danger/15 text-danger' : s === 'Approved' || s === 'PartiallyReceived' ? 'bg-primary/20 text-primary' : 'bg-warning/15 text-warning';
  });
  protected readonly dirty = computed(() => this.snapshotOf() !== this.snapshot);
  protected readonly anyDialog = computed(() => this.lookupOpen() || this.supplierFormOpen() || this.reasonOpen() || this.rejectOpen() || this.closeShortOpen() || this.payOpen() || this.directOpen() || !!this.confirm.request());

  constructor() {
    // Re-price the margin panel shortly after the lines settle.
    effect(() => {
      const payload = this.lines().filter((l) => l.qty > 0).map((l) => ({ inventoryItemId: l.itemId, quantity: l.qty, unitCost: l.cost, discountPercent: l.disc }));
      untracked(() => this.scheduleAnalysis(payload));
    }, { allowSignalWrites: true });
    // The supplier's standing follows the supplier.
    effect(() => {
      const s = this.supplier();
      untracked(() => { if (s && this.type() !== 'StockTransfer') void this.loadStanding(s.id); else this.standing.set(null); });
    }, { allowSignalWrites: true });
  }

  async ngOnInit(): Promise<void> {
    await this.branches.load();
    try {
      const s = await firstValueFrom(this.settings.get());
      this.defaultTax.set(s.taxRatePercent);
      this.taxName.set(s.taxName || 'Tax');
    } catch { /* the buyer may not see company settings: tax defaults to 0 and can be typed on each line */ }

    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.loading.set(true);
      try { this.show(await firstValueFrom(this.api.get(id))); } catch (err) { this.error.set(toApiError(err).message); } finally { this.loading.set(false); }
    } else {
      const wanted = this.route.snapshot.queryParamMap.get('type') as PurchaseDocumentType | null;
      if (wanted && DOCUMENT_TYPES.some((t) => t.value === wanted) && (wanted !== 'DirectConsignment' || this.canDirect())) this.type.set(wanted);
      this.branchId.set(this.branches.activeId() ?? this.branches.branches()[0]?.id ?? '');
      this.inclusive.set(false);
      await this.loadBins();
      this.snapshot = this.snapshotOf();
    }

    // Moving to another document from a link on this screen reuses it: load the one asked for.
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((p) => {
      const next = p.get('id');
      if (next && next !== 'new' && next !== this.doc()?.id) void this.openDocument(next);
    });
  }

  private async openDocument(id: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try { await this.show(await firstValueFrom(this.api.get(id))); } catch (err) { this.error.set(toApiError(err).message); } finally { this.loading.set(false); }
  }

  // ---- Showing a saved document ---------------------------------------------------------------------------

  private async show(d: WorkstationOrderDto): Promise<void> {
    this.doc.set(d);
    this.type.set(d.documentType);
    this.branchId.set(d.branchId);
    this.sourceId.set(d.sourceBranchId ?? '');
    this.supplier.set(d.supplier);
    this.invoiceRef.set(d.invoiceRef ?? '');
    this.terms.set(d.paymentTermsDays ?? d.supplier?.paymentTermsDays ?? 30);
    this.inclusive.set(d.taxInclusive);
    this.courier.set(d.courier ?? '');
    this.waybill.set(d.waybill ?? '');
    this.expected.set(d.expectedDeliveryDate ? d.expectedDeliveryDate.slice(0, 10) : '');
    this.notes.set(d.notes ?? '');
    this.lines.set(d.lines.map((l) => ({
      key: l.id, itemId: l.inventoryItemId, name: l.itemName, sku: l.sku, barcode: l.barcode, group: l.groupName, unit: l.unit, qty: l.quantity, cost: l.unitCost, disc: l.discountPercent, tax: l.taxRatePercent,
      expiry: l.expiryDate ? l.expiryDate.slice(0, 10) : '', binId: l.binId, note: l.note ?? '', packName: l.packName ?? l.purchaseUnitName, packSize: l.packSize ?? l.purchaseUnitSize, packCount: l.packCount,
      onHand: l.onHand, lastCost: null, defaultBin: null, tracksBatches: l.tracksBatches, tracksSerials: l.tracksSerials, selected: false
    })));
    await this.loadBins();
    this.snapshot = this.snapshotOf();
  }

  private async loadBins(): Promise<void> {
    const branch = this.branchId();
    if (!branch) { this.bins.set([]); return; }
    try { this.bins.set(await firstValueFrom(this.binApi.list({ branchId: branch }))); } catch { this.bins.set([]); }
  }

  private async loadStanding(supplierId: string): Promise<void> {
    try { this.standing.set(await firstValueFrom(this.api.standing(supplierId))); } catch { this.standing.set(null); }
  }

  private scheduleAnalysis(payload: { inventoryItemId: string; quantity: number; unitCost: number; discountPercent: number }[]): void {
    if (this.analysisTimer) clearTimeout(this.analysisTimer);
    if (payload.length === 0) { this.analysis.set(null); return; }
    if (!this.auth.hasPermission(SCREEN_PERMISSIONS.INVENTORY_PURCHASE_MANAGE)) return;
    this.analysisTimer = setTimeout(async () => {
      try { this.analysis.set(await firstValueFrom(this.api.analyse({ lines: payload }))); } catch { this.analysis.set(null); }
    }, 400);
  }

  private analysisTimer: ReturnType<typeof setTimeout> | null = null;

  // ---- Editing the form -------------------------------------------------------------------------------------------

  protected touch<T>(target: { set(v: T): void }, value: T): void { target.set(value); }

  protected setType(t: PurchaseDocumentType): void {
    this.type.set(t);
    if (t !== 'StockTransfer') this.sourceId.set('');
    if (t === 'StockTransfer') { this.supplier.set(null); this.lines.update((ls) => ls.map((l) => ({ ...l, cost: 0, disc: 0, tax: 0 }))); }
  }

  protected async setBranch(id: string): Promise<void> {
    this.branchId.set(id);
    if (this.sourceId() === id) this.sourceId.set('');
    this.lines.update((ls) => ls.map((l) => ({ ...l, binId: null })));
    await this.loadBins();
  }

  protected patchLine(key: string, patch: Partial<LineVm>): void {
    this.lines.update((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  protected setQty(key: string, qty: number): void {
    const l = this.lines().find((x) => x.key === key);
    const packCount = l?.packSize ? Math.round((qty / l.packSize) * 10000) / 10000 : null;
    this.patchLine(key, { qty: qty < 0 || Number.isNaN(qty) ? 0 : qty, packCount });
  }

  protected setPacks(key: string, packs: number): void {
    const l = this.lines().find((x) => x.key === key);
    if (!l?.packSize) return;
    const count = packs < 0 || Number.isNaN(packs) ? 0 : packs;
    this.patchLine(key, { packCount: count, qty: quantityFromPacks(count, l.packSize) });
  }

  protected voidSelected(): void {
    this.lines.update((ls) => ls.filter((l) => !l.selected));
    this.inspectedKey.set(null);
  }

  protected unit = (u: StockUnit): string => UNIT[u];
  protected clampPercent = (v: number | null): number => Math.max(0, Math.min(100, v ?? 0));

  // ---- Items -------------------------------------------------------------------------------------------------------

  protected onScanText(text: string): void {
    this.scanText.set(text);
    this.scanNote.set(null);
    if (this.itemTimer) clearTimeout(this.itemTimer);
    if (text.trim().length < 2) { this.matches.set([]); return; }
    this.itemTimer = setTimeout(async () => {
      try { this.matches.set((await firstValueFrom(this.inventory.items({ branchId: this.branchId() || undefined, search: text.trim(), active: true, pageSize: 8 }))).items); } catch { this.matches.set([]); }
    }, 200);
  }

  private itemTimer: ReturnType<typeof setTimeout> | null = null;

  protected async scanEnter(): Promise<void> {
    const text = this.scanText().trim();
    if (!text) return;
    try {
      const found = (await firstValueFrom(this.inventory.items({ branchId: this.branchId() || undefined, search: text, active: true, pageSize: 8 }))).items;
      const exact = found.find((i) => i.barcode === text || i.sku?.toLowerCase() === text.toLowerCase());
      if (exact) this.addItem(exact);
      else if (found.length === 1) this.addItem(found[0]!);
      else if (found.length === 0) this.scanNote.set(this.canAddItems() ? `Nothing matches "${text}". Check the code, or press Add SKU to create it as a new item.` : `Nothing matches "${text}". Check the code, or ask someone who can edit stock items to add it.`);
      else this.matches.set(found);
    } catch (err) { this.scanNote.set(toApiError(err).message); }
  }

  /**
   * Add SKU: with the right to edit stock items it opens the stock card for a NEW item, carrying over what was typed (digits are taken as
   * a barcode, anything else as the name). Without that right it does what Enter does: looks the typed code up among existing items.
   */
  protected addSku(): void {
    if (!this.canAddItems()) return void this.scanEnter();
    const text = this.scanText().trim();
    this.matches.set([]);
    this.scanNote.set(null);
    this.newItemPrefill.set(/^\d{6,}$/.test(text) ? { barcode: text } : { name: text });
    this.newItemOpen.set(true);
  }

  protected onNewItem(item: InventoryItemDto): void {
    this.newItemOpen.set(false);
    this.addItem(item);
  }

  protected addItem(item: InventoryItemDto): void {
    this.matches.set([]);
    this.scanText.set('');
    this.scanNote.set(null);
    const existing = this.lines().find((l) => l.itemId === item.id);
    if (existing) {
      this.setQty(existing.key, existing.qty + (existing.packSize ? existing.packSize : 1));
      this.inspectedKey.set(existing.key);
      this.scanNote.set(`${item.name} is already on the document: its quantity was increased.`);
      return;
    }
    const packSize = item.purchaseUnitSize ?? null;
    const vm: LineVm = {
      key: crypto.randomUUID(), itemId: item.id, name: item.name, sku: item.sku, barcode: item.barcode, group: item.groupName, unit: item.baseUnit, qty: packSize ?? 1, cost: this.type() === 'StockTransfer' ? 0 : (item.lastPurchaseCost ?? item.averageCost ?? 0),
      disc: 0, tax: this.type() === 'StockTransfer' ? 0 : this.defaultTax(), expiry: '', binId: null, note: '', packName: item.purchaseUnitName, packSize, packCount: packSize ? 1 : null, onHand: item.onHand, lastCost: item.lastPurchaseCost ?? null,
      defaultBin: null, tracksBatches: item.tracksBatches, tracksSerials: item.tracksSerials, selected: false
    };
    this.lines.update((ls) => [...ls, vm]);
    this.inspectedKey.set(vm.key);
    void this.applyDefaultBin(vm);
  }

  private async applyDefaultBin(vm: LineVm): Promise<void> {
    const branch = this.branchId();
    if (!branch || this.bins().length === 0) return;
    try {
      const d = (await firstValueFrom(this.binApi.defaults(branch))).find((x) => x.inventoryItemId === vm.itemId);
      if (d?.binId) this.patchLine(vm.key, { defaultBin: d.binId, binId: this.lines().find((l) => l.key === vm.key)?.binId ?? d.binId });
    } catch { /* a missing default is not an error */ }
  }

  // ---- Supplier --------------------------------------------------------------------------------------------------------

  protected pickSupplier(s: SupplierDto): void {
    this.supplier.set(s);
    this.terms.set(s.paymentTermsDays);
    this.lookupOpen.set(false);
  }

  protected openSupplierForm(edit: boolean): void {
    this.editingSupplier.set(edit ? this.supplier() : null);
    this.supplierFormOpen.set(true);
  }

  protected onSupplierSaved(s: SupplierDto): void {
    this.supplierFormOpen.set(false);
    const wasNew = !this.editingSupplier();
    this.supplier.set(s);
    if (wasNew) this.terms.set(s.paymentTermsDays);
    this.toast.success(wasNew ? `${s.name} was added and chosen.` : 'Supplier saved.');
    void this.loadStanding(s.id);
  }

  @HostListener('document:keydown', ['$event'])
  protected onKey(e: KeyboardEvent): void {
    if (this.anyDialog()) return;
    if (e.key === 'F2') { e.preventDefault(); if (this.editable()) { if (this.direct()) this.openDirect(); else void this.post(); } }
    else if (e.key === 'F3') { e.preventDefault(); this.print(); }
    else if (e.key === 'F4') { e.preventDefault(); (document.querySelector('[data-testid="po-scan"]') as HTMLInputElement | null)?.focus(); }
    else if (e.key === 'F5') { e.preventDefault(); if (this.doc()?.actions.canPay) this.openPay(); }
    else if (e.key === 'F6') { e.preventDefault(); if (this.editable() && this.type() !== 'StockTransfer') this.lookupOpen.set(true); }
    else if (e.key === 'Escape') { void this.leave(); }
  }

  // ---- Saving and posting ----------------------------------------------------------------------------------------------

  private snapshotOf(): string {
    return JSON.stringify([this.type(), this.branchId(), this.sourceId(), this.supplier()?.id, this.invoiceRef(), this.terms(), this.inclusive(), this.courier(), this.waybill(), this.expected(), this.notes(),
      this.lines().map((l) => [l.itemId, l.qty, l.cost, l.disc, l.tax, l.expiry, l.binId])]);
  }

  private request(): SaveWorkstationOrderRequest {
    return {
      documentType: this.type(), branchId: this.branchId(), sourceBranchId: this.type() === 'StockTransfer' ? this.sourceId() || null : null, supplierId: this.type() === 'StockTransfer' ? null : this.supplier()?.id ?? null,
      invoiceRef: this.invoiceRef().trim() || null, paymentTermsDays: this.terms(), taxInclusive: this.inclusive(), courier: this.courier().trim() || null, waybill: this.waybill().trim() || null,
      expectedDeliveryDate: this.expected() ? new Date(`${this.expected()}T12:00:00Z`).toISOString() : null, notes: this.notes().trim() || null, idempotencyKey: this.doc() ? null : this.formKey,
      rowVersion: this.doc()?.rowVersion ?? null,
      lines: this.lines().map<WorkstationLineRequest>((l) => ({
        inventoryItemId: l.itemId, quantity: l.qty, unitCost: l.cost, discountPercent: l.disc, taxRatePercent: l.tax, expiryDate: l.expiry ? new Date(`${l.expiry}T12:00:00Z`).toISOString() : null, binId: l.binId,
        packName: l.packName && l.packSize && l.packCount != null ? l.packName : null, packSize: l.packName && l.packSize && l.packCount != null ? l.packSize : null, packCount: l.packName && l.packSize && l.packCount != null ? l.packCount : null, note: l.note || null
      }))
    };
  }

  /** What is missing before anything can be saved, in words. */
  private problem(): string | null {
    if (!this.branchId()) return 'Choose the receiving branch.';
    if (this.type() === 'StockTransfer') { if (!this.sourceId()) return 'Choose the branch the stock comes from.'; }
    else if (!this.supplier()) return 'Choose a supplier first.';
    if (this.lines().length === 0) return 'Add at least one line.';
    const bad = this.lines().find((l) => !(l.qty > 0));
    return bad ? `Enter a quantity for ${bad.name}.` : null;
  }

  protected async saveDraft(): Promise<boolean> {
    const why = this.problem();
    if (why) { this.error.set(why); return false; }
    this.busy.set(true);
    this.error.set(null);
    try {
      const saved = await firstValueFrom(this.api.save(this.doc()?.id ?? null, this.request()));
      const created = !this.doc();
      await this.show(saved);
      if (created) await this.router.navigate(['/app/purchasing/orders', saved.id], { replaceUrl: true });
      this.toast.success('Saved.');
      return true;
    } catch (err) { this.fail(err); return false; } finally { this.busy.set(false); }
  }

  protected async post(): Promise<void> {
    const why = this.problem();
    if (why) { this.error.set(why); return; }
    if (this.dirty() || !this.doc()) { if (!(await this.saveDraft())) return; }
    const d = this.doc()!;
    if (!(await this.confirm.ask({ title: `${this.postLabel()}?`, message: `${d.documentNumber} for ${this.currency()} ${this.totals().total.toFixed(2)} goes to an approver. You cannot edit it after it is posted.`, confirmLabel: 'Post' }))) return;
    await this.doPost(null);
  }

  private async doPost(reason: string | null): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.show(await firstValueFrom(this.api.post(this.doc()!.id, reason)));
      this.reasonOpen.set(false);
      this.toast.success('Posted for approval.');
    } catch (err) {
      const e = toApiError(err);
      if (e.field('overLimitReason')) { this.overLimitMessage.set(e.message); this.overLimitReason.set(''); this.reasonOpen.set(true); }
      else this.fail(e);
    } finally { this.busy.set(false); }
  }

  protected async confirmOverLimit(): Promise<void> { await this.doPost(this.overLimitReason().trim()); }

  private async run(action: () => Promise<WorkstationOrderDto>, done: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try { await this.show(await action()); this.toast.success(done); } catch (err) { this.fail(err); } finally { this.busy.set(false); }
  }

  protected approve(): Promise<void> { return this.run(() => firstValueFrom(this.api.approve(this.doc()!.id)), 'Approved. It now waits for the receiver.'); }

  protected async reject(): Promise<void> {
    await this.run(() => firstValueFrom(this.api.reject(this.doc()!.id, this.reasonText().trim())), 'Sent back to the buyer.');
    if (!this.error()) { this.rejectOpen.set(false); this.reasonText.set(''); }
  }

  protected async closeShort(): Promise<void> {
    await this.run(() => firstValueFrom(this.api.closeShort(this.doc()!.id, this.reasonText().trim())), 'Closed.');
    if (!this.error()) { this.closeShortOpen.set(false); this.reasonText.set(''); }
  }

  protected async cancelDocument(): Promise<void> {
    if (!(await this.confirm.ask({ title: 'Cancel this document?', message: 'It will no longer be received or paid. This cannot be undone.', confirmLabel: 'Cancel document', danger: true }))) return;
    await this.run(() => firstValueFrom(this.api.cancel(this.doc()!.id)), 'Cancelled.');
  }

  protected async email(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const r = await firstValueFrom(this.api.email(this.doc()!.id));
      if (r.delivered) this.toast.success(r.message); else this.toast.info(r.message);
    } catch (err) { this.fail(err); } finally { this.busy.set(false); }
  }

  // ---- Payment -------------------------------------------------------------------------------------------------------------

  protected openPay(): void {
    this.payAmount.set(this.due());
    this.payRef.set(this.doc()?.invoiceRef ?? '');
    this.payError.set(null);
    this.payOpen.set(true);
  }

  protected async pay(): Promise<void> {
    const d = this.doc();
    if (!d?.supplierId) return;
    this.busy.set(true);
    this.payError.set(null);
    try {
      await firstValueFrom(this.paymentsApi.record({ supplierId: d.supplierId, amount: this.payAmount(), method: this.payMethod(), paidAtUtc: null, reference: this.payRef().trim() || null, note: `Payment for ${d.documentNumber}`, purchaseOrderId: d.id, idempotencyKey: `pay-${crypto.randomUUID()}` }));
      this.payOpen.set(false);
      this.toast.success('Payment recorded.');
      await this.show(await firstValueFrom(this.api.get(d.id)));
    } catch (err) { this.payError.set(toApiError(err).message); } finally { this.busy.set(false); }
  }

  // ---- Goods without an order ------------------------------------------------------------------------------------------------

  protected openDirect(): void {
    const why = this.problem();
    if (why) { this.error.set(why); return; }
    this.directError.set(null);
    this.directLines.set(this.lines().map((l) => ({ key: l.key, name: l.name, qty: l.qty, binId: l.binId, lot: '', expiry: l.expiry, serials: '', tracksBatches: l.tracksBatches, tracksSerials: l.tracksSerials })));
    this.directOpen.set(true);
  }

  protected patchDirect(key: string, patch: Partial<DirectLine>): void {
    this.directLines.update((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  protected async book(): Promise<void> {
    this.busy.set(true);
    this.directError.set(null);
    try {
      const receipt = await firstValueFrom(this.receiving.direct({
        order: { ...this.request(), documentType: 'DirectConsignment', idempotencyKey: null },
        receipt: {
          idempotencyKey: this.receiptKey, invoiceRef: this.invoiceRef().trim() || null,
          lines: this.directLines().map((d) => ({
            purchaseOrderLineId: '00000000-0000-0000-0000-000000000000', acceptedQuantity: d.qty, rejectedQuantity: 0, binId: d.binId, lotCode: d.lot.trim() || null,
            expiryDate: d.expiry ? new Date(`${d.expiry}T12:00:00Z`).toISOString() : null, serials: d.tracksSerials ? d.serials.split(/\r?\n/).map((x) => x.trim()).filter(Boolean) : null
          }))
        }
      }));
      this.directOpen.set(false);
      this.toast.success('Goods booked into stock.');
      await this.router.navigate(['/app/purchasing/receipts', receipt.id]);
    } catch (err) {
      const e = toApiError(err);
      const first = Object.values(e.fieldErrors)[0]?.[0];
      this.directError.set(first ? `${e.message} ${first}` : e.message);
    } finally { this.busy.set(false); }
  }

  // ---- Output and leaving ---------------------------------------------------------------------------------------------------------

  protected print(): void { if (this.doc()) window.print(); }

  protected async copyNumber(): Promise<void> {
    try { await navigator.clipboard.writeText(this.doc()!.documentNumber); this.toast.info('Document number copied.'); } catch { this.toast.error('Your browser did not allow copying.'); }
  }

  protected shelfTags(): void {
    const items = this.lines().map((l) => `${l.itemId}:${Math.max(1, Math.round(l.qty))}`).join(',');
    void this.router.navigate(['/app/inventory/reports/stock-labels'], { queryParams: { items } });
  }

  protected async leave(event?: Event): Promise<void> {
    event?.preventDefault();
    if (this.dirty() && !(await this.confirm.ask({ title: 'Discard your changes?', message: 'This document has changes you have not saved.', confirmLabel: 'Discard', danger: true }))) return;
    await this.router.navigate(['/app/purchasing/orders']);
  }

  private fail(err: unknown): void {
    const e: ApiError = toApiError(err);
    const first = Object.values(e.fieldErrors)[0]?.[0];
    this.error.set(first && !e.message.includes(first) ? `${e.message} ${first}` : e.message);
  }
}
