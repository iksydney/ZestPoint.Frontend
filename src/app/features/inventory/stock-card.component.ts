import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, HostListener, OnDestroy, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AliasKind, ItemAliasDto, StockGroupDto } from '../../core/models/nav-ops.model';
import { InventoryItemDto, PackageContentDto, PackageDto, SaveInventoryItemRequest, SellingUnitDto, StockUnit, SupplierDto } from '../../core/models/ops.model';
import { BinDto } from '../../core/models/purchasing.model';
import { FEATURES, SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { TenantTimePipe } from '../../core/pipes/tenant-time.pipe';
import { ApiError, toApiError } from '../../core/services/api.util';
import { LedgerAccountOptionDto, LedgerApi } from '../../core/services/ledger.services';
import { AuthService } from '../../core/services/auth.service';
import { BranchContextService } from '../../core/services/branch-context.service';
import { StockExtrasApi, StockGroupApi } from '../../core/services/nav-ops.services';
import { InventoryApi } from '../../core/services/ops.services';
import { BinApi } from '../../core/services/purchasing.services';
import { utcToZoned, zonedToUtc } from '../../core/time-zone';
import { ToastService } from '../../shared/ui/feedback';

const UNIT: Record<StockUnit, string> = { Milliliter: 'ml', Gram: 'g', Each: 'each' };
type Tab = 'details' | 'aliases' | 'units' | 'package' | 'picture' | 'history' | 'sales' | 'purchases';
type PriceKey = 'sellingPrice' | 'tradePrice' | 'wholesalePrice' | 'resellerPrice' | 'bundlePrice' | 'specialPrice';

const PRICE_LEVELS: readonly { key: PriceKey; label: string; testId: string }[] = [
  { key: 'sellingPrice', label: 'Retail', testId: 'item-price' }, { key: 'tradePrice', label: 'Trade', testId: 'item-trade' }, { key: 'wholesalePrice', label: 'Wholesale', testId: 'item-wholesale' },
  { key: 'resellerPrice', label: 'Reseller', testId: 'item-reseller' }, { key: 'bundlePrice', label: 'Bundle', testId: 'item-bundle' }, { key: 'specialPrice', label: 'On special', testId: 'item-special' }
];

const blank = (): SaveInventoryItemRequest => ({
  name: '', sku: null, kind: 'FinishedGood', baseUnit: 'Each', containerSize: null, tareGrams: null, densityGPerMl: null, minimumLevel: 0, reorderLevel: 0, targetDaysOfStock: 14,
  averageCost: 0, supplierId: null, tracksBatches: false, tracksSerials: false, groupId: null, barcode: null, description: null, purchaseUnitName: null, purchaseUnitSize: null,
  reorderQuantity: 0, targetStock: null, listedOnWebStore: false, sellingPrice: null, tradePrice: null, wholesalePrice: null, resellerPrice: null, bundlePrice: null,
  specialPrice: null, specialFromUtc: null, specialToUtc: null, minimumPrice: null, suggestedRetailPrice: null, lastCost: null, specialCost: null, specialCostFrom: null, specialCostTo: null,
  blockQtyFractions: false, useScale: false, printOnInvoice: true, editQtyOnSales: true, blockDiscount: false, taxExempt: false, pointsValue: 0, salesAccountId: null, purchaseAccountId: null,
  userPrompt: null, notes: null, isActive: true, rowVersion: null
});

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || Number.isNaN(+(v as number)) ? null : +(v as number));

/**
 * The Stock Card: one card to add or change a stock item, laid out after the card stock controllers know (identity and sale flags on top,
 * price levels with a markup row, costs and live figures on the right, tabs for other part numbers, the picture and history).
 *
 * It only edits the item. Quantities are never typed here: on-hand stock changes through receipts, adjustments and stock takes, so every
 * change is audited. Prices need the product-management right and costs the cost right; without them those boxes are not shown and the
 * server leaves the values as they were. Everything on the card is checked again by the server.
 */
@Component({
  selector: 'zp-stock-card',
  standalone: true,
  imports: [DecimalPipe, FormsModule, RouterLink, TenantTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 z-50 grid place-items-start overflow-auto bg-black/60 p-2 sm:p-4 print:static print:bg-transparent print:p-0" (mousedown)="onBackdrop($event)">
      <div class="app-card mx-auto w-full max-w-6xl shadow-2xl print:max-w-none print:border-0 print:shadow-none" role="dialog" aria-modal="true" [attr.aria-label]="title()" data-testid="stock-card">
        <div class="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 class="text-lg font-bold" data-testid="stock-card-title">{{ title() }}</h2>
            <p class="text-xs text-ink/70">Quantities are not typed here: stock on hand changes through receipts, adjustments and stock takes.</p>
          </div>
          <button type="button" class="btn-ghost -mr-2 -mt-1 px-2 print:hidden" aria-label="Close" data-testid="stock-card-close" (click)="closed.emit()">x</button>
        </div>

        @if (loading()) { <p class="py-10 text-center text-ink/70" role="status">Loading...</p> }
        @else if (loadError()) { <p class="sys-alert sys-alert-danger" role="alert">{{ loadError() }}</p> }
        @else {
        <form class="space-y-4" (submit)="$event.preventDefault(); save()" data-testid="item-form" autocomplete="off">
          <!-- Identity, flags, type -->
          <div class="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
            <div class="space-y-2">
              <div><label class="app-label" for="sc-sku">Part number (SKU)</label><input id="sc-sku" class="app-input font-mono" data-testid="item-sku" maxlength="60" [ngModel]="f().sku" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ sku: $event || null })" />@if (fe('sku')) { <p class="app-error" role="alert">{{ fe('sku') }}</p> }</div>
              <div><label class="app-label" for="sc-name">Item details (name)</label><input id="sc-name" class="app-input" data-testid="item-name" maxlength="160" [ngModel]="f().name" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ name: $event })" />@if (fe('name')) { <p class="app-error" role="alert">{{ fe('name') }}</p> }</div>
              <div><label class="app-label" for="sc-desc">Other details</label><input id="sc-desc" class="app-input" maxlength="500" data-testid="item-description" [ngModel]="f().description" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ description: $event || null })" /></div>
              <div class="grid gap-2 sm:grid-cols-2">
                <div><label class="app-label" for="sc-barcode">Barcode</label><input id="sc-barcode" class="app-input font-mono" data-testid="item-barcode" maxlength="60" [ngModel]="f().barcode" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ barcode: $event || null })" />@if (fe('barcode')) { <p class="app-error" role="alert">{{ fe('barcode') }}</p> }</div>
                <div><label class="app-label" for="sc-sup">Default supplier</label><select id="sc-sup" class="app-input" data-testid="item-supplier" [ngModel]="f().supplierId" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ supplierId: $event || null })"><option [ngValue]="null">None</option>@for (s of suppliers(); track s.id) { <option [ngValue]="s.id">{{ s.name }}</option> }</select>@if (fe('supplierId')) { <p class="app-error" role="alert">{{ fe('supplierId') }}</p> }</div>
              </div>
            </div>

            <fieldset class="grid content-start gap-x-4 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"><legend class="app-label">Sale and tracking rules</legend>
              <label class="flex min-h-9 items-center gap-2"><input type="checkbox" data-testid="item-inactive" [checked]="!f().isActive" (change)="patch({ isActive: !f().isActive })" /> Inactive</label>
              <label class="flex min-h-9 items-center gap-2"><input type="checkbox" data-testid="item-webstore" [checked]="!!f().listedOnWebStore" (change)="patch({ listedOnWebStore: !f().listedOnWebStore })" /> Web store</label>
              <label class="flex min-h-9 items-center gap-2"><input type="checkbox" data-testid="item-block-fractions" [checked]="!!f().blockQtyFractions" (change)="patch({ blockQtyFractions: !f().blockQtyFractions })" /> Block qty fractions</label>
              <label class="flex min-h-9 items-center gap-2"><input type="checkbox" data-testid="item-serials" [checked]="!!f().tracksSerials" (change)="patch({ tracksSerials: !f().tracksSerials })" /> Track serial numbers</label>
              <label class="flex min-h-9 items-center gap-2"><input type="checkbox" data-testid="item-expiry" [checked]="f().tracksBatches" (change)="patch({ tracksBatches: !f().tracksBatches })" /> Track expiry date</label>
              <label class="flex min-h-9 items-center gap-2" title="Stored on the item. The till does not read a scale for sales yet."><input type="checkbox" data-testid="item-use-scale" [checked]="!!f().useScale" (change)="patch({ useScale: !f().useScale })" /> Use scale <span class="text-xs text-ink/60">(stored)</span></label>
              <label class="flex min-h-9 items-center gap-2" title="Stored on the item. Receipts list every item today."><input type="checkbox" data-testid="item-print-invoice" [checked]="!!f().printOnInvoice" (change)="patch({ printOnInvoice: !f().printOnInvoice })" /> Print on invoice <span class="text-xs text-ink/60">(stored)</span></label>
              <label class="flex min-h-9 items-center gap-2"><input type="checkbox" data-testid="item-edit-qty" [checked]="f().editQtyOnSales !== false" (change)="patch({ editQtyOnSales: f().editQtyOnSales === false })" /> Edit qty on sales</label>
              <label class="flex min-h-9 items-center gap-2"><input type="checkbox" data-testid="item-block-discount" [checked]="!!f().blockDiscount" (change)="patch({ blockDiscount: !f().blockDiscount })" /> Block discount</label>
              @if (fe('tracksSerials')) { <p class="app-error sm:col-span-2" role="alert">{{ fe('tracksSerials') }}</p> }
              @if (fe('blockQtyFractions')) { <p class="app-error sm:col-span-2" role="alert">{{ fe('blockQtyFractions') }}</p> }
            </fieldset>

            <div class="space-y-2">
              <div><label class="app-label" for="sc-kind">Item type</label><select id="sc-kind" class="app-input" data-testid="item-kind" [ngModel]="f().kind" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ kind: $event })"><option value="FinishedGood">Stock item (sold as is)</option><option value="Ingredient">Ingredient (used in recipes)</option></select></div>
              <div><label class="app-label" for="sc-group">Stock group</label><select id="sc-group" class="app-input" data-testid="item-group" [ngModel]="f().groupId" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ groupId: $event || null })"><option [ngValue]="null">No group</option>@for (g of activeGroups(); track g.id) { <option [ngValue]="g.id">{{ g.name }}</option> }</select>@if (fe('groupId')) { <p class="app-error" role="alert">{{ fe('groupId') }}</p> }</div>
              <p class="text-xs text-ink/70">The price is never typed at the till: staff sell at the price set here, or at the special while it runs.</p>
            </div>
          </div>

          <!-- Tabs -->
          <div class="flex flex-wrap gap-1 border-b border-ink/15 print:hidden" role="tablist" aria-label="Stock card sections">
            @for (t of tabs; track t.key) {
              <button type="button" role="tab" class="rounded-t-lg px-3 py-2 text-sm font-semibold" [class]="tab() === t.key ? 'bg-primary/15 text-ink' : 'text-ink/70 hover:bg-ink/10'" [attr.aria-selected]="tab() === t.key"
                      [disabled]="t.needsItem && !saved()" [attr.title]="t.needsItem && !saved() ? 'Save the item first' : null" [attr.data-testid]="'sc-tab-' + t.key" (click)="tab.set(t.key)">{{ t.label }}</button>
            }
          </div>

          @switch (tab()) {
            @case ('details') {
              @if (item()?.isPackage) {
                <p class="sys-alert sys-alert-info" role="status" data-testid="package-note">This item is a package. It sells for the total of its contents (see Package content) and holds no stock of its own: the Retail price shown is that total, and a special or minimum price set here is not used.</p>
              }
              <!-- Prices -->
              @if (canPrice()) {
                <div class="overflow-x-auto rounded-lg border border-ink/10">
                  <table class="w-full min-w-[46rem] text-sm" data-testid="price-grid">
                    <thead><tr class="bg-ink/5 text-xs text-ink/70"><th class="w-28 px-2 py-1.5 text-left font-semibold"></th>@for (p of levels; track p.key) { <th class="px-1 py-1.5 text-right font-semibold">{{ p.label }}</th> }<th class="px-1 py-1.5 text-right font-semibold">Minimum</th></tr></thead>
                    <tbody>
                      <tr><th scope="row" class="px-2 py-1 text-left font-semibold">Sell price</th>
                        @for (p of levels; track p.key) { <td class="px-1 py-1"><input type="number" min="0" step="0.01" class="app-input px-2 py-1 text-right" [attr.aria-label]="p.label + ' sell price'" [attr.data-testid]="p.testId" [ngModel]="f()[p.key]" [ngModelOptions]="{ standalone: true }" (ngModelChange)="setPrice(p.key, $event)" /></td> }
                        <td class="px-1 py-1"><input type="number" min="0" step="0.01" class="app-input px-2 py-1 text-right" aria-label="Minimum selling price" data-testid="item-minimum-price" [ngModel]="f().minimumPrice" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ minimumPrice: n($event) })" /></td></tr>
                      @if (canCost()) {
                        <tr><th scope="row" class="px-2 py-1 text-left font-semibold">Markup %</th>
                          @for (p of levels; track p.key) { <td class="px-1 py-1"><input type="number" step="0.01" class="app-input px-2 py-1 text-right text-primary" [attr.aria-label]="p.label + ' markup percent'" [attr.data-testid]="'markup-' + p.key" [disabled]="!lastCost()" [ngModel]="markup(p.key)" [ngModelOptions]="{ standalone: true }" (ngModelChange)="setMarkup(p.key, $event)" /></td> }
                          <td class="px-1 py-1 text-right text-xs text-ink/60">on last cost</td></tr>
                      }
                    </tbody>
                  </table>
                </div>
                <div class="grid gap-2 sm:grid-cols-[auto_1fr_1fr] sm:items-end">
                  <p class="text-sm font-semibold">Special period <span class="block text-xs font-normal text-ink/70">{{ zone() }} time</span></p>
                  <div><label class="app-label" for="sc-sp-from">From</label><input id="sc-sp-from" type="datetime-local" class="app-input" data-testid="item-special-from" [ngModel]="specialFrom()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ specialFromUtc: toUtc($event) })" /></div>
                  <div><label class="app-label" for="sc-sp-to">Until</label><input id="sc-sp-to" type="datetime-local" class="app-input" data-testid="item-special-to" [ngModel]="specialTo()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ specialToUtc: toUtc($event) })" /></div>
                </div>
                @if (item()?.onSpecial) { <p class="sys-alert sys-alert-info" role="status" data-testid="special-live">The special is running now: the till is selling this item at the special price.</p> }
                @for (k of priceErrors; track k) { @if (fe(k)) { <p class="app-error" role="alert" [attr.data-testid]="'error-' + k">{{ fe(k) }}</p> } }
                <p class="text-xs text-ink/70">The till charges Retail, or On special during its period. Trade, Wholesale, Reseller and Bundle are kept for those price lists. Minimum is the lowest one unit may go for after any discount.</p>
              } @else { <p class="text-sm text-ink/70">Selling prices are set by people with the product-management permission.</p> }

              <div class="grid gap-4 lg:grid-cols-2">
                <!-- Left block -->
                <div class="space-y-3">
                  <div class="grid gap-2 sm:grid-cols-2">
                    <div><label class="app-label" for="sc-points">Points value</label><input id="sc-points" type="number" min="0" step="0.01" class="app-input" data-testid="item-points" [ngModel]="f().pointsValue" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ pointsValue: n($event) ?? 0 })" /><p class="app-hint">Loyalty points a customer earns per unit when their bill is paid.</p></div>
                    <div><label class="app-label" for="sc-tax">Tax</label><select id="sc-tax" class="app-input" data-testid="item-tax" [ngModel]="f().taxExempt ? 'exempt' : 'taxable'" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ taxExempt: $event === 'exempt' })"><option value="taxable">Taxable (company rate)</option><option value="exempt">Tax exempt</option></select></div>
                    <div><label class="app-label" for="sc-sales-ac">Sales A/C</label><select id="sc-sales-ac" class="app-input" data-testid="item-sales-ac" [ngModel]="f().salesAccountId ?? null" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ salesAccountId: $event || null })">
            <option [ngValue]="null">As the stock group says</option>@for (a of salesAccounts(); track a.id) { <option [ngValue]="a.id">{{ a.code }} {{ a.name }}</option> }</select>
                      @if (fe('salesAccountId')) { <p class="app-error" role="alert">{{ fe('salesAccountId') }}</p> }</div>
                    <div><label class="app-label" for="sc-purchase-ac">Purchase A/C</label><select id="sc-purchase-ac" class="app-input" data-testid="item-purchase-ac" [ngModel]="f().purchaseAccountId ?? null" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ purchaseAccountId: $event || null })">
            <option [ngValue]="null">As the stock group says</option>@for (a of stockAccounts(); track a.id) { <option [ngValue]="a.id">{{ a.code }} {{ a.name }}</option> }</select>
                      @if (fe('purchaseAccountId')) { <p class="app-error" role="alert">{{ fe('purchaseAccountId') }}</p> }</div>
                  </div>
                  <p class="app-hint -mt-1">Account codes are kept as typed until the accounts list is set up.</p>

                  <div class="grid gap-2 sm:grid-cols-3">
                    <div><label class="app-label" for="sc-min">Minimum level</label><input id="sc-min" type="number" min="0" class="app-input" data-testid="item-min-level" [ngModel]="f().minimumLevel" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ minimumLevel: n($event) ?? 0 })" /></div>
                    <div><label class="app-label" for="sc-ro">Reorder level</label><input id="sc-ro" type="number" min="0" class="app-input" data-testid="item-reorder" [ngModel]="f().reorderLevel" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ reorderLevel: n($event) ?? 0 })" />@if (fe('reorderLevel')) { <p class="app-error" role="alert">{{ fe('reorderLevel') }}</p> }</div>
                    <div><label class="app-label" for="sc-roq">Reorder qty</label><input id="sc-roq" type="number" min="0" class="app-input" data-testid="item-reorder-qty" [ngModel]="f().reorderQuantity" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ reorderQuantity: n($event) ?? 0 })" /></div>
                  </div>

                  <div class="grid gap-2 sm:grid-cols-3">
                    <div><label class="app-label" for="sc-unit">Units</label><select id="sc-unit" class="app-input" data-testid="item-unit" [disabled]="!!saved()" [ngModel]="f().baseUnit" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ baseUnit: $event })"><option value="Each">Each (counted)</option><option value="Milliliter">Millilitres</option><option value="Gram">Grams</option></select>@if (fe('baseUnit')) { <p class="app-error" role="alert">{{ fe('baseUnit') }}</p> }</div>
                    <div><label class="app-label" for="sc-pun">Bought by the</label><input id="sc-pun" class="app-input" placeholder="e.g. case" maxlength="40" [ngModel]="f().purchaseUnitName" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ purchaseUnitName: $event || null })" /></div>
                    <div><label class="app-label" for="sc-pus">which holds ({{ unit() }})</label><input id="sc-pus" type="number" min="0" step="any" class="app-input" [ngModel]="f().purchaseUnitSize" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ purchaseUnitSize: n($event) })" />@if (fe('purchaseUnitSize')) { <p class="app-error" role="alert">{{ fe('purchaseUnitSize') }}</p> }</div>
                  </div>
                  @if (f().baseUnit === 'Milliliter') {
                    <div class="grid gap-2 sm:grid-cols-3">
                      <div><label class="app-label" for="sc-cs">Bottle size (ml)</label><input id="sc-cs" type="number" min="0" class="app-input" [ngModel]="f().containerSize" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ containerSize: n($event) })" /></div>
                      <div><label class="app-label" for="sc-tare">Empty weight (g)</label><input id="sc-tare" type="number" min="0" class="app-input" [ngModel]="f().tareGrams" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ tareGrams: n($event) })" /></div>
                      <div><label class="app-label" for="sc-den">Density (g/ml)</label><input id="sc-den" type="number" min="0.01" max="100" step="0.01" class="app-input" [ngModel]="f().densityGPerMl" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ densityGPerMl: n($event) })" /></div>
                    </div>
                  }

                  <div class="grid gap-2 sm:grid-cols-3">
                    <div><label class="app-label" for="sc-bin">Bin location</label><select id="sc-bin" class="app-input" data-testid="item-bin" [disabled]="!branches.activeId() || bins().length === 0" [ngModel]="binId()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="binId.set($event || null)"><option [ngValue]="null">{{ bins().length ? 'No default bin' : 'No bins at this branch' }}</option>@for (b of bins(); track b.id) { <option [ngValue]="b.id">{{ b.code }} {{ b.name }}</option> }</select><p class="app-hint">Default bin at {{ branches.active()?.name ?? 'the chosen branch' }}.</p></div>
                    <div><label class="app-label" for="sc-ts">Target stock</label><input id="sc-ts" type="number" min="0" class="app-input" placeholder="optional" [ngModel]="f().targetStock" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ targetStock: n($event) })" />@if (fe('targetStock')) { <p class="app-error" role="alert">{{ fe('targetStock') }}</p> }</div>
                    <div><label class="app-label" for="sc-days">Days of cover</label><input id="sc-days" type="number" min="1" max="365" class="app-input" [ngModel]="f().targetDaysOfStock" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ targetDaysOfStock: n($event) ?? 14 })" /></div>
                  </div>

                  <div><label class="app-label" for="sc-prompt">User prompt</label><input id="sc-prompt" class="app-input" maxlength="200" data-testid="item-prompt" [ngModel]="f().userPrompt" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ userPrompt: $event || null })" /><p class="app-hint">A message for the person selling. Stored; the till does not show it yet.</p></div>
                  <div><label class="app-label" for="sc-notes">Notes</label><textarea id="sc-notes" rows="3" class="app-input" maxlength="2000" data-testid="item-notes" [ngModel]="f().notes" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ notes: $event || null })"></textarea></div>
                </div>

                <!-- Right block: costs and live figures -->
                <div class="space-y-3">
                  @if (canPrice()) { <div class="grid grid-cols-[1fr_9rem] items-center gap-2"><label class="text-sm font-medium" for="sc-srp">Suggested retail price</label><input id="sc-srp" type="number" min="0" step="0.01" class="app-input px-2 py-1 text-right" data-testid="item-srp" [ngModel]="f().suggestedRetailPrice" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ suggestedRetailPrice: n($event) })" /></div> }
                  @if (canCost()) {
                    <div class="grid grid-cols-[1fr_9rem] items-center gap-2"><label class="text-sm font-medium" for="sc-last">Last cost per {{ unit() }}</label><input id="sc-last" type="number" min="0" step="0.0001" class="app-input px-2 py-1 text-right" data-testid="item-cost" [ngModel]="f().lastCost" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ lastCost: n($event) })" /></div>
                    <p class="app-hint -mt-2 text-right">A goods receipt replaces it with what was really paid.</p>
                    <div class="grid grid-cols-[1fr_9rem] items-center gap-2"><label class="text-sm font-medium" for="sc-scost">Special cost</label><input id="sc-scost" type="number" min="0" step="0.0001" class="app-input px-2 py-1 text-right" data-testid="item-special-cost" [ngModel]="f().specialCost" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ specialCost: n($event) })" /></div>
                    <div class="grid grid-cols-2 gap-2"><div><label class="app-label" for="sc-scf">Special cost from</label><input id="sc-scf" type="date" class="app-input" [ngModel]="f().specialCostFrom" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ specialCostFrom: $event || null })" /></div><div><label class="app-label" for="sc-sct">until</label><input id="sc-sct" type="date" class="app-input" [ngModel]="f().specialCostTo" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ specialCostTo: $event || null })" /></div></div>
                    @if (fe('specialCost')) { <p class="app-error" role="alert">{{ fe('specialCost') }}</p> }
                  } @else { <p class="text-sm text-ink/70">Costs are hidden and cannot be changed with your role.</p> }

                  <dl class="divide-y divide-ink/10 rounded-lg bg-primary/5 px-3 text-sm" data-testid="card-figures">
                    @if (canCost()) { <div class="flex justify-between gap-3 py-1.5"><dt>Average cost</dt><dd class="font-mono" data-testid="fig-average-cost">{{ item()?.averageCost ?? 0 | number: '1.2-4' }}</dd></div> }
                    <div class="flex justify-between gap-3 py-1.5"><dt>Qty on hand @if (branches.active()) { <span class="text-xs text-ink/60">({{ branches.active()!.name }})</span> }</dt><dd class="font-mono" data-testid="fig-on-hand">{{ item()?.onHand ?? 0 | number: '1.0-3' }}</dd></div>
                    <div class="flex justify-between gap-3 py-1.5"><dt>Purchase orders qty</dt><dd class="font-mono" data-testid="fig-on-order">{{ item()?.onOrderQuantity ?? 0 | number: '1.0-3' }}</dd></div>
                    <div class="flex justify-between gap-3 py-1.5"><dt>Consignment out</dt><dd class="text-ink/60">Not tracked yet</dd></div>
                    <div class="flex justify-between gap-3 py-1.5"><dt>Qty on layby</dt><dd data-testid="fig-layby">{{ item()?.onLaybyQuantity ?? 0 }}</dd></div>
                    <div class="flex justify-between gap-3 py-1.5"><dt>Sales back orders qty</dt><dd data-testid="fig-back-orders">{{ item()?.salesBackOrderQuantity ?? 0 }}</dd></div>
                    <div class="flex justify-between gap-3 py-1.5"><dt>Last sold</dt><dd data-testid="fig-last-sold">{{ (item()?.lastSoldAtUtc | tenantTime) || 'Never' }}</dd></div>
                    <div class="flex justify-between gap-3 py-1.5"><dt>Last purchase</dt><dd>{{ (item()?.lastReceiptAtUtc | tenantTime) || 'Never' }}</dd></div>
                    <div class="flex justify-between gap-3 py-1.5"><dt>Last order</dt><dd>{{ (item()?.lastOrderedAtUtc | tenantTime) || 'Never' }}</dd></div>
                  </dl>
                </div>
              </div>
            }

            @case ('aliases') {
              <fieldset><legend class="mb-1 font-semibold">Equivalent part numbers</legend>
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

            @case ('package') {
              <div class="space-y-3" data-testid="package-tab">
                <p class="text-sm text-ink/80">What this item is made of when it is sold as a package (a hamper, a gift set). The package is made up at the sale: it sells for the total of its contents' prices at that moment, each content keeps its own tax and discount rule, and selling one takes the contents off the shelf. A content must have a selling price. A package may contain another package.</p>
                @if (pkgUsedIn().length) { <p class="text-sm text-ink/80" data-testid="pkg-used-in">This item is inside: {{ pkgUsedIn().join(', ') }}.</p> }
                <table class="app-table" data-testid="pkg-list">
                  <thead><tr><th>Item</th><th class="text-right">Quantity</th>@if (canPrice()) { <th class="text-right">Each</th><th class="text-right">Value</th> }<th>Rules</th><th></th></tr></thead>
                  <tbody>
                    @for (r of pkgRows(); track r.contentItemId) {
                      <tr [attr.data-testid]="'pkg-row-' + r.name">
                        <td><span class="font-medium">{{ r.name }}</span> @if (r.sku) { <span class="font-mono text-xs text-ink/70">{{ r.sku }}</span> } @if (r.isPackage) { <span class="app-badge app-badge-primary">package</span> }
                          @if (r.problem) { <p class="text-xs font-semibold text-danger">{{ r.problem }}</p> }</td>
                        <td class="text-right">
                          @if (readOnly()) { {{ r.quantity | number: '1.0-3' }} }
                          @else { <input type="number" min="0" step="any" class="app-input ml-auto w-24 px-2 py-1 text-right" [attr.aria-label]="'Quantity of ' + r.name" [attr.data-testid]="'pkg-qty-' + r.name" [ngModel]="r.quantity" [ngModelOptions]="{ standalone: true }" (ngModelChange)="setPkgQty(r.contentItemId, $event)" /> }
                        </td>
                        @if (canPrice()) { <td class="text-right font-mono">{{ r.unitPrice | number: '1.2-2' }}</td><td class="text-right font-mono">{{ r.unitPrice === null ? '' : (r.unitPrice * r.quantity | number: '1.2-2') }}</td> }
                        <td>@if (r.taxExempt) { <span class="app-badge bg-ink/10 text-ink/80">no tax</span> } @if (r.blockDiscount) { <span class="app-badge bg-ink/10 text-ink/80">no discount</span> }</td>
                        <td class="text-right">@if (!readOnly()) { <button type="button" class="btn-ghost px-2 py-0.5 text-sm text-danger" [attr.data-testid]="'pkg-remove-' + r.name" (click)="removePkgRow(r.contentItemId)">Remove</button> }</td>
                      </tr>
                    } @empty { <tr><td [attr.colspan]="canPrice() ? 6 : 4" class="py-4 text-center text-ink/70">Not a package: this item is sold as it is.</td></tr> }
                  </tbody>
                  @if (canPrice() && pkgRows().length) {
                    <tfoot><tr><td colspan="3" class="text-right font-semibold">The package sells for</td><td class="text-right font-mono font-bold" data-testid="pkg-total">{{ pkgTotal() | number: '1.2-2' }}</td><td colspan="2"></td></tr></tfoot>
                  }
                </table>
                @if (!readOnly()) {
                  <div>
                    <label class="app-label" for="sc-pkg-search">Add an item to the package</label>
                    <input id="sc-pkg-search" class="app-input" placeholder="Type a name or part number" autocomplete="off" data-testid="pkg-search" [ngModel]="pkgSearch()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="searchPkg($event)" />
                    @if (pkgResults().length) {
                      <ul class="mt-1 divide-y divide-ink/10 rounded-lg border border-ink/15" data-testid="pkg-results">
                        @for (c of pkgResults(); track c.id) {
                          <li><button type="button" class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-ink/10" [attr.data-testid]="'pkg-result-' + c.name" (click)="addPkgRow(c)"><span>{{ c.name }} @if (c.sku) { <span class="font-mono text-xs text-ink/70">{{ c.sku }}</span> }</span>
                            <span class="font-mono">{{ c.sellingPrice === null || c.sellingPrice === undefined ? 'no selling price' : (c.sellingPrice | number: '1.2-2') }}</span></button></li>
                        }
                      </ul>
                    }
                  </div>
                  <div class="flex flex-wrap items-center gap-2">
                    <button type="button" class="btn-primary" data-testid="pkg-save" [disabled]="!pkgDirty() || pkgBusy()" (click)="savePkg()">{{ pkgBusy() ? 'Saving...' : 'Save package content' }}</button>
                    @if (pkgDirty()) { <span class="text-sm text-ink/70">Not saved yet.</span> }
                    @if (pkgMsg()) { <span class="text-sm text-success" role="status" data-testid="pkg-msg">{{ pkgMsg() }}</span> }
                  </div>
                }
                @if (pkgError()) { <p class="app-error" role="alert" data-testid="pkg-error">{{ pkgError() }}</p> }
              </div>
            }

            @case ('units') {
              <div class="space-y-3" data-testid="units-tab">
                <p class="text-sm text-ink/80">Other ways this item is sold besides singly, for example Half case = 6, Case = 12. At the till one unit costs the item's price (or its special) times what it holds, and that many leave the shelf. Adding a unit never adds stock: stock comes in through purchasing, receiving and adjustments.</p>
                <table class="app-table" data-testid="unit-list">
                  <thead><tr><th>Unit</th><th class="text-right">Holds</th><th>Barcode</th>@if (canPrice()) { <th class="text-right">Sells for now</th> }<th></th></tr></thead>
                  <tbody>
                    @for (u of units(); track u.id) {
                      <tr [attr.data-testid]="'unit-row-' + u.name"><td class="font-medium">{{ u.name }}</td><td class="text-right font-mono">{{ u.size | number: '1.0-3' }}</td><td class="font-mono text-xs">{{ u.barcode }}</td>
                        @if (canPrice()) { <td class="text-right font-mono">{{ unitPrice(u.size) | number: '1.2-2' }}</td> }
                        <td class="text-right">@if (!readOnly()) { <button type="button" class="btn-ghost px-2 py-0.5 text-sm text-danger" [attr.data-testid]="'unit-remove-' + u.name" (click)="removeUnit(u)">Remove</button> }</td></tr>
                    } @empty { <tr><td [attr.colspan]="canPrice() ? 5 : 4" class="py-4 text-center text-ink/70">Sold singly only.</td></tr> }
                  </tbody>
                </table>
                @if (!readOnly()) {
                  <div class="grid gap-2 sm:grid-cols-[1fr_8rem_1fr_auto] sm:items-end">
                    <div><label class="app-label" for="sc-u-name">Unit name</label><input id="sc-u-name" class="app-input" maxlength="40" placeholder="e.g. Case" data-testid="unit-name" [ngModel]="unitName()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="unitName.set($event)" /></div>
                    <div><label class="app-label" for="sc-u-size">Holds</label><input id="sc-u-size" type="number" min="0" step="any" class="app-input" placeholder="12" data-testid="unit-size" [ngModel]="unitSize()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="unitSize.set(unitNumber($event))" /></div>
                    <div><label class="app-label" for="sc-u-barcode">Its barcode (optional)</label><input id="sc-u-barcode" class="app-input font-mono" maxlength="60" data-testid="unit-barcode" [ngModel]="unitBarcode()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="unitBarcode.set($event)" /></div>
                    <button type="button" class="btn-outline" data-testid="unit-add" [disabled]="!unitName().trim() || !unitSize()" (click)="addUnit()">Add unit</button>
                  </div>
                }
                @if (unitError()) { <p class="app-error" role="alert" data-testid="unit-error">{{ unitError() }}</p> }
              </div>
            }

            @case ('picture') {
              <div class="grid gap-4 sm:grid-cols-[16rem_1fr]" data-testid="picture-tab">
                <div class="grid h-56 place-items-center overflow-hidden rounded-lg border border-ink/15 bg-ink/5">
                  @if (pictureUrl()) { <img class="max-h-56 max-w-full object-contain" [src]="pictureUrl()" [alt]="'Picture of ' + f().name" data-testid="item-picture" /> } @else { <p class="text-sm text-ink/60" data-testid="no-picture">No picture</p> }
                </div>
                <div class="space-y-2 text-sm">
                  <p class="text-ink/80">A PNG, JPEG or WebP photo, up to 5 MB. Uploading a new one replaces the old.</p>
                  <input type="file" accept="image/png,image/jpeg,image/webp" class="app-input" aria-label="Choose a picture" data-testid="picture-file" (change)="onPicture($event)" />
                  @if (pictureUrl()) { <button type="button" class="btn-outline" data-testid="picture-remove" [disabled]="pictureBusy()" (click)="removePicture()">Remove picture</button> }
                  @if (pictureError()) { <p class="app-error" role="alert" data-testid="picture-error">{{ pictureError() }}</p> }
                </div>
              </div>
            }

            @case ('history') {
              <p class="text-sm text-ink/80">Every movement of this item (receipts, sales, adjustments, transfers), with dates and who did it.</p>
              <a class="btn-outline" routerLink="/app/inventory/reports/items-history" [queryParams]="{ itemId: saved() }" data-testid="link-history" (click)="closed.emit()">Open Items History for this item</a>
            }
            @case ('sales') {
              <p class="text-sm text-ink/80">Sales of this item from the stock ledger. Last sold: {{ (item()?.lastSoldAtUtc | tenantTime) || 'never' }}.</p>
              <a class="btn-outline" routerLink="/app/inventory/reports/transactions" [queryParams]="{ itemId: saved(), type: 'Sale' }" data-testid="link-sales" (click)="closed.emit()">Open the sales movements for this item</a>
            }
            @case ('purchases') {
              <p class="text-sm text-ink/80">Goods received for this item. Still on order: {{ item()?.onOrderQuantity ?? 0 | number: '1.0-3' }}. Last purchase: {{ (item()?.lastReceiptAtUtc | tenantTime) || 'never' }}.</p>
              <a class="btn-outline" routerLink="/app/inventory/reports/transactions" [queryParams]="{ itemId: saved(), type: 'Receipt' }" data-testid="link-purchases" (click)="closed.emit()">Open the receipts for this item</a>
            }
          }

          @if (formError()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="stock-card-error">{{ formError() }}</p> }

          <div class="flex flex-wrap items-center justify-between gap-2 border-t border-ink/10 pt-3 print:hidden">
            <div class="flex flex-wrap gap-2">
              @if (siblings().length > 1 && saved()) {
                <button type="button" class="btn-outline" data-testid="sc-previous" [disabled]="!previousId()" (click)="go(previousId())">Previous</button>
                <button type="button" class="btn-outline" data-testid="sc-next" [disabled]="!nextId()" (click)="go(nextId())">Next</button>
              }
              <button type="button" class="btn-outline" data-testid="sc-print" (click)="print()">Print</button>
              @if (saved() && !readOnly()) { <button type="button" class="btn-outline" data-testid="sc-deactivate" [disabled]="saving()" (click)="toggleActive()">{{ f().isActive ? 'Deactivate' : 'Reactivate' }}</button> }
            </div>
            <div class="flex gap-2">
              <button type="button" class="btn-ghost" data-testid="sc-close" (click)="closed.emit()">Close (Esc)</button>
              @if (!readOnly()) { <button type="submit" class="btn-primary touch-target" data-testid="item-save" [disabled]="saving() || !f().name.trim()">{{ saving() ? 'Saving...' : 'Save' }}</button> }
            </div>
          </div>
          @if (saved() && !readOnly()) { <p class="text-right text-xs text-ink/60 print:hidden">Items are never deleted: deactivating hides the item and keeps all its sales and stock history.</p> }
        </form>
        }
      </div>
    </div>
  `
})
export class StockCardComponent implements OnDestroy {
  private readonly inventory = inject(InventoryApi);
  private readonly ledgerApi = inject(LedgerApi);
  private readonly accountOptions = signal<readonly LedgerAccountOptionDto[]>([]);
  /** Sales go to an income account; stock is held on an asset account (or, for a company that prefers it, an expense). */
  protected readonly salesAccounts = computed(() => this.accountOptions().filter((a) => a.type === 'Income'));
  protected readonly stockAccounts = computed(() => this.accountOptions().filter((a) => a.type === 'Asset' || a.type === 'Expense'));
  private readonly groupApi = inject(StockGroupApi);
  private readonly extras = inject(StockExtrasApi);
  private readonly binApi = inject(BinApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  protected readonly branches = inject(BranchContextService);

  /** The item to open, or null for a new one. */
  readonly itemId = input<string | null>(null);
  /** For a new item: what the person had already typed (a scanned code or a name). */
  readonly prefill = input<{ name?: string; sku?: string; barcode?: string } | null>(null);
  /** The ids of the list the card was opened from, for Previous / Next. */
  readonly siblings = input<readonly string[]>([]);

  /** The item was saved (created or changed). */
  readonly savedItem = output<InventoryItemDto>();
  readonly closed = output<void>();
  /** Previous / Next asks the host to show another item. */
  readonly navigate = output<string>();

  protected readonly tabs: readonly { key: Tab; label: string; needsItem: boolean }[] = [
    { key: 'details', label: 'Details', needsItem: false }, { key: 'aliases', label: 'Equivalent part numbers', needsItem: true }, { key: 'units', label: 'Unit of measure', needsItem: true }, { key: 'package', label: 'Package content', needsItem: true }, { key: 'picture', label: 'Picture', needsItem: true },
    { key: 'history', label: 'History', needsItem: true }, { key: 'sales', label: 'Sales', needsItem: true }, { key: 'purchases', label: 'Purchases', needsItem: true }
  ];
  protected readonly levels = PRICE_LEVELS;
  protected readonly priceErrors = ['sellingPrice', 'specialPrice', 'minimumPrice'] as const;

  protected readonly tab = signal<Tab>('details');
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly item = signal<InventoryItemDto | null>(null);
  /** The id once the item exists on the server (tabs that need an item open then). */
  protected readonly saved = signal<string | null>(null);
  protected readonly f = signal<SaveInventoryItemRequest>(blank());
  protected readonly groups = signal<readonly StockGroupDto[]>([]);
  protected readonly suppliers = signal<readonly SupplierDto[]>([]);
  protected readonly bins = signal<readonly BinDto[]>([]);
  protected readonly binId = signal<string | null>(null);
  private binAtLoad: string | null = null;
  protected readonly aliases = signal<readonly ItemAliasDto[]>([]);
  protected readonly aliasKind = signal<AliasKind>('Equivalent');
  protected readonly aliasCode = signal('');
  protected readonly aliasSupplier = signal('');
  protected readonly aliasError = signal<string | null>(null);
  protected readonly pkgRows = signal<readonly PackageContentDto[]>([]);
  protected readonly pkgUsedIn = signal<readonly string[]>([]);
  protected readonly pkgSearch = signal('');
  protected readonly pkgResults = signal<readonly InventoryItemDto[]>([]);
  protected readonly pkgDirty = signal(false);
  protected readonly pkgBusy = signal(false);
  protected readonly pkgError = signal<string | null>(null);
  protected readonly pkgMsg = signal<string | null>(null);
  /** The total of the rows on screen; rows without a known price count as nothing until the server prices them on save. */
  protected readonly pkgTotal = computed(() => Math.round(this.pkgRows().reduce((s, r) => s + (r.unitPrice ?? 0) * r.quantity, 0) * 100) / 100);
  private pkgSearchSeq = 0;
  protected readonly units = signal<readonly SellingUnitDto[]>([]);
  protected readonly unitName = signal('');
  protected readonly unitSize = signal<number | null>(null);
  protected readonly unitBarcode = signal('');
  protected readonly unitError = signal<string | null>(null);
  protected readonly pictureUrl = signal<string | null>(null);
  protected readonly pictureError = signal<string | null>(null);
  protected readonly pictureBusy = signal(false);
  private readonly fieldErrors = signal<Readonly<Record<string, readonly string[]>>>({});

  protected readonly readOnly = computed(() => this.auth.accessModeFor(FEATURES.INVENTORY) === 'readonly' || !this.auth.hasPermission(SCREEN_PERMISSIONS.INVENTORY_ITEMS_MANAGE));
  protected readonly canCost = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.INVENTORY_COSTS_MANAGE));
  protected readonly canPrice = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.PRODUCTS_MANAGE));
  protected readonly activeGroups = computed(() => this.groups().filter((g) => g.isActive || g.id === this.f().groupId));
  protected readonly title = computed(() => (this.saved() ? `Stock card: ${this.item()?.name ?? ''}` : 'Stock card: new item'));
  protected readonly unit = computed(() => UNIT[this.f().baseUnit]);
  protected readonly zone = computed(() => this.auth.tenant()?.timeZoneId || 'UTC');
  protected readonly lastCost = computed(() => this.f().lastCost ?? 0);
  protected readonly specialFrom = computed(() => utcToZoned(this.f().specialFromUtc, this.zone()));
  protected readonly specialTo = computed(() => utcToZoned(this.f().specialToUtc, this.zone()));
  protected readonly previousId = computed(() => { const i = this.siblings().indexOf(this.saved() ?? ''); return i > 0 ? this.siblings()[i - 1]! : null; });
  protected readonly nextId = computed(() => { const i = this.siblings().indexOf(this.saved() ?? ''); return i >= 0 && i < this.siblings().length - 1 ? this.siblings()[i + 1]! : null; });

  constructor() {
    void firstValueFrom(this.groupApi.list(true)).then((g) => this.groups.set(g)).catch(() => undefined);
    void firstValueFrom(this.inventory.suppliers()).then((s) => this.suppliers.set(s)).catch(() => undefined);
    void this.branches.load().then(() => this.loadBins());
    // Opening another item (Previous / Next, or a different row) reloads the card.
    effect(() => { const id = this.itemId(); untracked(() => void this.open(id)); }, { allowSignalWrites: true });
  }

  ngOnDestroy(): void { this.revokePicture(); }

  protected n = num;
  protected fe = (name: string): string | null => this.fieldErrors()[name]?.[0] ?? null;
  protected patch(p: Partial<SaveInventoryItemRequest>): void { this.f.update((v) => ({ ...v, ...p })); }
  protected toUtc(local: string): string | null { return zonedToUtc(local, this.zone()); }

  // ---- Markup: one percentage on last cost, two-way with the price above it ------------------------

  protected markup(key: PriceKey): number | null {
    const cost = this.lastCost();
    const price = this.f()[key];
    if (!cost || price === null || price === undefined) return null;
    return Math.round(((price - cost) / cost) * 10000) / 100;
  }

  protected setPrice(key: PriceKey, value: unknown): void { this.patch({ [key]: num(value) } as Partial<SaveInventoryItemRequest>); }

  protected setMarkup(key: PriceKey, value: unknown): void {
    const cost = this.lastCost();
    const percent = num(value);
    if (!cost || percent === null) return;
    this.patch({ [key]: Math.round(cost * (1 + percent / 100) * 100) / 100 } as Partial<SaveInventoryItemRequest>);
  }

  // ---- Load ------------------------------------------------------------------------------------

  private async open(id: string | null): Promise<void> {
    if (!this.accountOptions().length) void firstValueFrom(this.ledgerApi.options()).then((o) => this.accountOptions.set(o)).catch(() => undefined);
    this.tab.set('details');
    this.fieldErrors.set({});
    this.formError.set(null);
    this.loadError.set(null);
    this.aliases.set([]);
    this.units.set([]);
    this.unitError.set(null);
    this.pkgRows.set([]);
    this.pkgUsedIn.set([]);
    this.pkgResults.set([]);
    this.pkgSearch.set('');
    this.pkgDirty.set(false);
    this.pkgError.set(null);
    this.pkgMsg.set(null);
    this.revokePicture();
    this.binId.set(null);
    this.binAtLoad = null;

    if (!id) {
      const pre = this.prefill();
      this.item.set(null);
      this.saved.set(null);
      this.f.set({ ...blank(), name: pre?.name ?? '', sku: pre?.sku || null, barcode: pre?.barcode || null });
      return;
    }

    this.loading.set(true);
    try {
      this.adopt(await firstValueFrom(this.inventory.item(id, this.branches.activeId() ?? undefined)));
      void firstValueFrom(this.extras.aliases(id)).then((a) => this.aliases.set(a)).catch(() => undefined);
      void firstValueFrom(this.inventory.package(id)).then((p) => this.showPkg(p)).catch((err) => this.pkgError.set(toApiError(err).message));
      void firstValueFrom(this.inventory.units(id)).then((u) => this.units.set(u)).catch((err) => this.unitError.set(toApiError(err).message));
      void this.loadBinDefault(id);
    } catch (err) { this.loadError.set(toApiError(err).message); } finally { this.loading.set(false); }
  }

  private adopt(i: InventoryItemDto): void {
    this.item.set(i);
    this.saved.set(i.id);
    this.f.set({
      name: i.name, sku: i.sku, kind: i.kind, baseUnit: i.baseUnit, containerSize: i.containerSize, tareGrams: i.tareGrams, densityGPerMl: i.densityGPerMl, minimumLevel: i.minimumLevel,
      reorderLevel: i.reorderLevel, targetDaysOfStock: i.targetDaysOfStock, averageCost: i.averageCost ?? 0, supplierId: i.supplierId, tracksBatches: i.tracksBatches, tracksSerials: i.tracksSerials,
      groupId: i.groupId, barcode: i.barcode, description: i.description, purchaseUnitName: i.purchaseUnitName, purchaseUnitSize: i.purchaseUnitSize, reorderQuantity: i.reorderQuantity,
      targetStock: i.targetStock, listedOnWebStore: i.listedOnWebStore, sellingPrice: i.sellingPrice, tradePrice: i.tradePrice ?? null, wholesalePrice: i.wholesalePrice ?? null,
      resellerPrice: i.resellerPrice ?? null, bundlePrice: i.bundlePrice ?? null, specialPrice: i.specialPrice ?? null, specialFromUtc: i.specialFromUtc ?? null, specialToUtc: i.specialToUtc ?? null,
      minimumPrice: i.minimumPrice ?? null, suggestedRetailPrice: i.suggestedRetailPrice ?? null, lastCost: i.lastPurchaseCost ?? null, specialCost: i.specialCost ?? null,
      specialCostFrom: i.specialCostFrom ?? null, specialCostTo: i.specialCostTo ?? null, blockQtyFractions: !!i.blockQtyFractions, useScale: !!i.useScale, printOnInvoice: i.printOnInvoice !== false,
      editQtyOnSales: i.editQtyOnSales !== false, blockDiscount: !!i.blockDiscount, taxExempt: !!i.taxExempt, pointsValue: i.pointsValue ?? 0, salesAccountId: i.salesAccountId ?? null,
      purchaseAccountId: i.purchaseAccountId ?? null, userPrompt: i.userPrompt ?? null, notes: i.notes ?? null, isActive: i.isActive, rowVersion: i.rowVersion
    });
    if (i.hasPicture) void this.loadPicture(i.id); else this.revokePicture();
  }

  private async loadBins(): Promise<void> {
    const branch = this.branches.activeId();
    if (!branch) return;
    try { this.bins.set((await firstValueFrom(this.binApi.list({ branchId: branch }))).filter((b) => b.isActive)); } catch { this.bins.set([]); }
  }

  private async loadBinDefault(itemId: string): Promise<void> {
    const branch = this.branches.activeId();
    if (!branch) return;
    try {
      const hit = (await firstValueFrom(this.binApi.defaults(branch))).find((d) => d.inventoryItemId === itemId);
      this.binAtLoad = hit?.binId ?? null;
      this.binId.set(this.binAtLoad);
    } catch { /* bins are optional: the card works without them */ }
  }

  // ---- Save ------------------------------------------------------------------------------------

  protected async save(): Promise<void> {
    if (this.saving() || this.readOnly()) return;
    this.saving.set(true);
    this.fieldErrors.set({});
    this.formError.set(null);
    const isNew = !this.saved();
    const body: SaveInventoryItemRequest = { ...this.f(), name: this.f().name.trim() };
    // A new item's average cost starts at the last cost typed; afterwards receipts keep the average, so it is sent back unchanged.
    if (isNew) body.averageCost = body.lastCost ?? 0;
    if (!this.canPrice()) for (const k of ['sellingPrice', 'tradePrice', 'wholesalePrice', 'resellerPrice', 'bundlePrice', 'specialPrice', 'specialFromUtc', 'specialToUtc', 'minimumPrice', 'suggestedRetailPrice'] as const) body[k] = null as never;
    try {
      const result = await firstValueFrom(this.inventory.saveItem(this.saved(), body));
      const branch = this.branches.activeId();
      if (branch && this.binId() !== this.binAtLoad) {
        try { await firstValueFrom(this.binApi.setDefault(result.id, branch, this.binId())); this.binAtLoad = this.binId(); }
        catch (err) { this.toast.error(`The item was saved, but its bin was not: ${toApiError(err).message}`); }
      }
      this.adopt(await firstValueFrom(this.inventory.item(result.id, branch ?? undefined)).catch(() => result));
      this.toast.success('Item saved.');
      this.savedItem.emit(this.item()!);
    } catch (err) {
      const e = toApiError(err) as ApiError;
      this.fieldErrors.set(e.fieldErrors);
      const fields = Object.keys(e.fieldErrors);
      this.formError.set(fields.length === 0 ? e.message : 'Please correct the highlighted fields.');
      if (fields.length > 0) this.tab.set('details');
    } finally { this.saving.set(false); }
  }

  /** "Delete" on the old card: here the item is switched off (and can be switched back on); nothing is ever physically deleted. */
  protected async toggleActive(): Promise<void> {
    const was = this.f().isActive;
    this.patch({ isActive: !was });
    await this.save();
    if (this.formError()) this.patch({ isActive: was }); // not saved: the card must not claim the item was switched
  }

  protected go(id: string | null): void { if (id) this.navigate.emit(id); }
  protected print(): void { window.print(); }

  // ---- Other part numbers ----------------------------------------------------------------------

  protected async addAlias(): Promise<void> {
    const id = this.saved();
    if (!id) return;
    this.aliasError.set(null);
    try {
      const a = await firstValueFrom(this.extras.addAlias(id, { kind: this.aliasKind(), code: this.aliasCode().trim(), supplierId: this.aliasKind() === 'SupplierPartNumber' ? this.aliasSupplier() || null : null, note: null }));
      this.aliases.update((l) => [...l, a]);
      this.aliasCode.set('');
    } catch (err) { this.aliasError.set(toApiError(err).message); }
  }

  protected async removeAlias(a: ItemAliasDto): Promise<void> {
    const id = this.saved();
    if (!id) return;
    try { await firstValueFrom(this.extras.removeAlias(id, a.id)); this.aliases.update((l) => l.filter((x) => x.id !== a.id)); }
    catch (err) { this.aliasError.set(toApiError(err).message); }
  }

  // ---- Package content ----

  private showPkg(p: PackageDto): void {
    this.pkgRows.set(p.contents);
    this.pkgUsedIn.set(p.usedIn.map((u) => u.name));
    this.pkgDirty.set(false);
    this.pkgError.set(p.problem);
  }

  protected searchPkg(text: string): void {
    this.pkgSearch.set(text);
    const term = text.trim();
    const seq = ++this.pkgSearchSeq;
    if (term.length < 2) { this.pkgResults.set([]); return; }
    void firstValueFrom(this.inventory.items({ search: term, active: true, pageSize: 8 }))
      .then((page) => { if (seq === this.pkgSearchSeq) this.pkgResults.set(page.items.filter((i) => i.id !== this.saved() && !this.pkgRows().some((r) => r.contentItemId === i.id))); })
      .catch((err) => this.pkgError.set(toApiError(err).message));
  }

  protected addPkgRow(i: InventoryItemDto): void {
    this.pkgRows.update((rows) => [...rows, {
      contentItemId: i.id, name: i.name, sku: i.sku ?? null, quantity: 1, isPackage: i.isPackage ?? false, unitPrice: i.sellingPrice ?? null, lineValue: null,
      taxExempt: i.taxExempt ?? false, blockDiscount: i.blockDiscount ?? false, problem: null
    }]);
    this.pkgResults.set([]);
    this.pkgSearch.set('');
    this.pkgDirty.set(true);
    this.pkgMsg.set(null);
  }

  protected setPkgQty(id: string, value: unknown): void {
    const quantity = this.unitNumber(value) ?? 0;
    this.pkgRows.update((rows) => rows.map((r) => (r.contentItemId === id ? { ...r, quantity } : r)));
    this.pkgDirty.set(true);
    this.pkgMsg.set(null);
  }

  protected removePkgRow(id: string): void {
    this.pkgRows.update((rows) => rows.filter((r) => r.contentItemId !== id));
    this.pkgDirty.set(true);
    this.pkgMsg.set(null);
  }

  protected async savePkg(): Promise<void> {
    const id = this.saved();
    if (!id || this.pkgBusy()) return;
    this.pkgBusy.set(true);
    this.pkgError.set(null);
    this.pkgMsg.set(null);
    try {
      const p = await firstValueFrom(this.inventory.savePackage(id, { contents: this.pkgRows().map((r) => ({ contentItemId: r.contentItemId, quantity: r.quantity })) }));
      this.showPkg(p);
      this.item.update((i) => (i ? { ...i, isPackage: p.contents.length > 0 } : i));
      if (p.price !== null) this.patch({ sellingPrice: p.price });
      this.pkgMsg.set(p.contents.length ? 'Package content saved.' : 'This item is no longer a package.');
    } catch (err) {
      const e = toApiError(err);
      this.pkgError.set(Object.values(e.fieldErrors ?? {})[0]?.[0] ?? e.message);
    } finally { this.pkgBusy.set(false); }
  }

  // ---- Selling units (Unit of measure) ----

  protected unitNumber(v: unknown): number | null {
    const x = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
    return Number.isFinite(x) ? x : null;
  }

  /** What one unit sells for now: the special while it runs, else the retail price, times what it holds. Null when there is no price. */
  protected unitPrice(size: number): number | null {
    const f = this.f() as { specialPrice?: number | null; sellingPrice?: number | null };
    const each = this.item()?.onSpecial ? f.specialPrice : f.sellingPrice;
    return each === null || each === undefined ? null : Math.round(each * size * 100) / 100;
  }

  protected async addUnit(): Promise<void> {
    const id = this.saved();
    const size = this.unitSize();
    if (!id || !size) return;
    this.unitError.set(null);
    try {
      const unit = await firstValueFrom(this.inventory.saveUnit(id, null, { name: this.unitName().trim(), size, barcode: this.unitBarcode().trim() || null, isActive: true }));
      this.units.update((l) => [...l, unit].sort((a, b) => a.size - b.size));
      this.unitName.set('');
      this.unitSize.set(null);
      this.unitBarcode.set('');
    } catch (err) {
      const e = toApiError(err);
      this.unitError.set(Object.values(e.fieldErrors ?? {})[0]?.[0] ?? e.message);
    }
  }

  protected async removeUnit(u: SellingUnitDto): Promise<void> {
    const id = this.saved();
    if (!id) return;
    this.unitError.set(null);
    try { await firstValueFrom(this.inventory.removeUnit(id, u.id)); this.units.update((l) => l.filter((x) => x.id !== u.id)); }
    catch (err) { this.unitError.set(toApiError(err).message); }
  }

  // ---- Picture ---------------------------------------------------------------------------------

  private async loadPicture(id: string): Promise<void> {
    try {
      const blob = await firstValueFrom(this.inventory.picture(id));
      this.revokePicture();
      this.pictureUrl.set(URL.createObjectURL(blob));
    } catch { this.revokePicture(); }
  }

  private revokePicture(): void {
    const url = this.pictureUrl();
    if (url) URL.revokeObjectURL(url);
    this.pictureUrl.set(null);
  }

  protected async onPicture(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const id = this.saved();
    if (!file || !id) return;
    this.pictureError.set(null);
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return void this.pictureError.set('Use a PNG, JPEG or WebP photo.');
    if (file.size > 5_242_880) return void this.pictureError.set('The picture is too large (max 5 MB).');
    this.pictureBusy.set(true);
    try {
      await firstValueFrom(this.inventory.setPicture(id, file));
      await this.loadPicture(id);
      await this.refreshVersion(id);
      this.toast.success('Picture saved.');
    } catch (err) { this.pictureError.set(toApiError(err).message); } finally { this.pictureBusy.set(false); }
  }

  protected async removePicture(): Promise<void> {
    const id = this.saved();
    if (!id) return;
    this.pictureBusy.set(true);
    try { await firstValueFrom(this.inventory.removePicture(id)); this.revokePicture(); await this.refreshVersion(id); }
    catch (err) { this.pictureError.set(toApiError(err).message); } finally { this.pictureBusy.set(false); }
  }

  /**
   * Setting or removing the picture changes the item on the server, so the version this card holds would be stale and its next Save
   * refused as "changed by someone else". Only the version is taken: what the person has typed and not yet saved stays as it is.
   */
  private async refreshVersion(id: string): Promise<void> {
    try {
      const fresh = await firstValueFrom(this.inventory.item(id, this.branches.activeId() ?? undefined));
      this.item.set(fresh);
      this.patch({ rowVersion: fresh.rowVersion });
    } catch { /* the next Save reports a stale version if this could not be read */ }
  }

  protected onBackdrop(event: MouseEvent): void { if (event.target === event.currentTarget) this.closed.emit(); }

  @HostListener('document:keydown.escape')
  protected onEscape(): void { this.closed.emit(); }
}
