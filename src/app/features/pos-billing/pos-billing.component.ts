import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { FEATURES, SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { CustomerDto, CustomersApi, LaybysApi } from '../../core/services/customer.services';
import { BarLineState, OrderKind, OrderLineDto, PaymentMethod, ProductDto, ReceiptDto, SellingUnitDto, VoidAuthorizer, VoidRequestDto } from '../../core/models/ops.model';
import { lineKey, splitEvenly } from '../../core/offline/order-calc';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { BarStore } from '../../core/services/bar.services';
import { BranchContextService } from '../../core/services/branch-context.service';
import { OrdersApi } from '../../core/services/ops.services';
import { PosStore } from '../../core/services/pos-store.service';
import { SyncAgentService } from '../../core/services/sync-agent.service';
import { DialogComponent, ToastService } from '../../shared/ui/feedback';
import { BranchPickerComponent, SyncStatusComponent } from '../../shared/ui/ops-chrome.components';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';
import { printReceipt } from '../../core/receipt/receipt-render';
import { ReceiptShareComponent, ReceiptViewComponent } from '../../shared/ui/receipt.components';
import { VoidAuthoriserComponent } from './void-authoriser.component';

/** One row of the bill: every active line that is the same thing at the same price. Sent lines cannot change; the unsent one carries the rest. */
interface BillRow {
  readonly key: string;
  readonly name: string;
  readonly first: OrderLineDto;
  readonly sent: readonly OrderLineDto[];
  readonly unsent: readonly OrderLineDto[];
  readonly quantity: number;
  readonly sentQty: number;
  readonly unsentQty: number;
  /** Sent units that are not at the bar (no bar state to show): they carry the plain "sent" mark. */
  readonly plainSentQty: number;
  readonly total: number;
  readonly discount: number;
  readonly voidPending: boolean;
  /** No quantity box: a serial-numbered unit, or an item sold one per line. */
  readonly locked: boolean;
  /** The bar handed this line back (it could not make it): the attendant may change its quantity or take it off, with nobody's PIN. */
  readonly back: OrderLineDto | null;
}

const q3 = (value: number): number => Math.round(value * 1000) / 1000;

type Dialog = 'unlock' | 'new' | 'serial' | 'unit' | 'customer' | 'modifiers' | 'pay' | 'void' | 'discount' | 'split' | 'merge' | 'transfer' | 'receipt' | 'approvals' | 'tip' | null;

/**
 * Three-panel point of sale: open bills | catalogue | the bill being built. Works offline for everything except card/transfer
 * payments and the bill-structure actions (split, merge, transfer), which need the server and say so.
 * All buttons are UX only; the API re-checks permission, branch and subscription on every call.
 */
@Component({
  selector: 'zp-pos-billing',
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe, FormsModule, DialogComponent, StatusBadgeComponent, BranchPickerComponent, SyncStatusComponent, VoidAuthoriserComponent, ReceiptViewComponent, ReceiptShareComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-bold">Point of sale</h1>
      <div class="flex flex-wrap items-center gap-4"><zp-branch-picker /><zp-sync-status /></div>
    </div>

    @if (readOnly()) { <p class="sys-alert sys-alert-warning mb-3" role="status" data-testid="pos-readonly">Read-only: your subscription limits this screen. You can look, but not change anything.</p> }
    @if (store.catalogFromCache()) { <p class="sys-alert sys-alert-info mb-3" role="status">Showing the catalogue saved on this device. Prices and availability may be out of date.</p> }
    @if (!branches.activeId()) { <p class="sys-alert sys-alert-warning" role="status">You are not assigned to a branch yet. Ask a manager to give you access.</p> }

    @if (branches.activeId()) {
    <div class="grid gap-3 lg:grid-cols-[15rem_minmax(0,1fr)_24rem]">
      <!-- Open bills -->
      <section class="app-card flex flex-col gap-2" aria-label="Open bills">
        <div class="flex items-center justify-between">
          <h2 class="font-semibold">Open bills</h2>
          @if (canCreate()) { <button type="button" class="btn-primary px-3 py-1.5 text-sm" data-testid="new-bill" [disabled]="readOnly()" (click)="openNew()">New</button> }
        </div>
        <ul class="space-y-1.5" data-testid="bill-list">
          @for (b of store.bills(); track b.id) {
            <li>
              <button type="button" class="app-focus w-full rounded-lg border px-3 py-2 text-left" [class]="b.id === store.current()?.id ? 'border-primary bg-primary/10' : 'border-ink/15 hover:border-primary/60'"
                      [attr.data-testid]="'bill-' + (b.label ?? b.id)" (click)="select(b.id)">
                <span class="flex items-center justify-between gap-2">
                  <span class="font-medium">{{ b.label ?? ('Bill ' + (b.numberPending ? '(new)' : '#' + b.number)) }}</span>
                  <span class="text-sm font-semibold">{{ b.total | currency: store.currency() : 'symbol-narrow' : '1.2-2' }}</span>
                </span>
                <span class="flex items-center gap-2 text-xs text-ink/70">
                  <span>{{ b.numberPending ? 'Not synced yet' : '#' + b.number }}</span><span>{{ b.itemCount }} item(s)</span>
                  @if (b.tableLabel) { <span>Table {{ b.tableLabel }}</span> }
                  @if (b.pendingSync) { <span class="app-badge app-badge-warning">pending</span> }
                </span>
              </button>
            </li>
          } @empty { <li class="text-sm text-ink/70">No open bills.</li> }
        </ul>
        <!-- Requests left from before voids were authorised at the till. No new ones can be made; the button goes when the list is empty. -->
        @if (canApproveVoid() && approvals().length) {
          <button type="button" class="btn-outline mt-2 text-sm" data-testid="open-approvals" (click)="openApprovals()">Old void requests ({{ approvals().length }})</button>
        }
      </section>

      <!-- Catalogue -->
      <section class="app-card" aria-label="Catalogue">
        <div class="mb-3 flex flex-wrap gap-2">
          <input class="app-input max-w-xs" type="search" placeholder="Search products" aria-label="Search products" data-testid="product-search" [ngModel]="search()" (ngModelChange)="search.set($event)" />
          <input class="app-input max-w-[11rem]" placeholder="Scan barcode" aria-label="Barcode" data-testid="barcode" [ngModel]="barcode()" (ngModelChange)="barcode.set($event)" (keydown.enter)="scan()" />
        </div>
        <div class="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Categories">
          <button type="button" class="app-badge cursor-pointer px-3 py-1" [class]="!categoryId() ? 'bg-primary text-on-primary' : 'bg-ink/10'" (click)="categoryId.set(null)">All</button>
          @for (c of store.categories(); track c.id) {
            <button type="button" class="app-badge cursor-pointer px-3 py-1" [class]="categoryId() === c.id ? 'bg-primary text-on-primary' : 'bg-ink/10'" (click)="categoryId.set(c.id)">{{ c.name }}</button>
          }
        </div>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4" data-testid="product-grid">
          @for (p of visibleProducts(); track p.id) {
            <button type="button" class="app-focus touch-target flex flex-col items-start gap-1 rounded-xl border border-ink/15 bg-panel p-3 text-left transition hover:border-primary/60 disabled:opacity-40"
                    [attr.data-testid]="'product-' + p.name" [disabled]="!store.current() || readOnly() || !canEdit()" (click)="pick(p)">
              <span class="text-sm font-semibold leading-tight">{{ p.name }}</span>
              <span class="flex w-full items-end justify-between">
                <span class="font-bold">{{ p.price | currency: store.currency() : 'symbol-narrow' : '1.2-2' }}</span>
                @if (p.available !== null) { <span class="app-badge" [class]="p.available > 5 ? 'app-badge-success' : p.available > 0 ? 'app-badge-warning' : 'app-badge-danger'">{{ p.available > 0 ? (p.available | number: '1.0-0') + ' left' : 'Low' }}</span> }
              </span>
            </button>
          } @empty { <p class="col-span-full text-ink/70">No products match.</p> }
        </div>
        @if (!store.current()) { <p class="mt-3 text-sm text-ink/70">Open or start a bill to add products.</p> }
      </section>

      <!-- The bill -->
      <section class="app-card flex flex-col" aria-label="Current bill" data-testid="current-bill">
        @if (store.current(); as o) {
          <div class="mb-2 flex items-start justify-between gap-2">
            <div>
              <h2 class="font-semibold">{{ o.label ?? 'Bill' }} <span class="text-sm font-normal text-ink/70">{{ o.numberPending ? '(not synced yet)' : '#' + o.number }}</span></h2>
              <p class="text-xs text-ink/70">{{ o.kind }}@if (o.tableLabel) { , table {{ o.tableLabel }} } @if (o.ownerName) { , {{ o.ownerName }} }</p>
              @if (o.layby; as lb) {
                <p class="mt-1 text-sm font-semibold" data-testid="bill-layby">Layby #{{ lb.number }}@if (lb.status === 'Active') { , due {{ lb.dueDate }}@if (o.amountPaid === 0) { . First payment at least {{ lb.minimumDeposit | currency: store.currency() : 'symbol-narrow' : '1.2-2' }} } } @else { : {{ lb.status.toLowerCase() }} }</p>
                @if (lb.status === 'Active') { <p class="text-xs text-ink/70">Its items are fixed. Take payments here or on the Laybys screen.</p> }
              }
              @if (o.consignmentSaleId) { <p class="mt-1 text-xs text-ink/70" data-testid="bill-consignment">Consignment goods sold by an agent, at the agreed prices. Take payment; nothing else can be changed.</p> }
              @if (!mine()) { <p class="sys-alert sys-alert-info mt-1 text-sm" role="status" data-testid="bill-not-mine">Opened by {{ o.ownerName ?? 'someone else' }}. You can look at it; only they, a supervisor or a manager can change it or take payment. They can hand it over to you with Move / hand over.</p> }
              @if (laybyError()) { <p class="app-error" role="alert" data-testid="layby-error">{{ laybyError() }}</p> }
              <p class="mt-1 text-sm" data-testid="bill-customer">
                @if (o.customer; as c) { <span class="font-medium">{{ c.name }}</span> <span class="text-ink/70">{{ c.pointsBalance }} points@if (o.pointsEarned) { , {{ o.pointsEarned }} from this bill } @else if (o.pointsOnBill) { , {{ o.pointsOnBill }} more when paid }</span> }
                @if (canLayby() && !readOnly() && o.customer && !o.layby && o.status === 'Open' && o.amountPaid === 0) { <button type="button" class="btn-outline ml-1 px-2 py-0 text-sm" data-testid="bill-layby-btn" [disabled]="laybyBusy()" (click)="startLayby()">Layby</button> }
                @if (canCustomers() && canEdit() && !readOnly() && !o.layby && (o.status === 'Open' || o.status === 'PartiallyPaid')) { <button type="button" class="btn-ghost px-1 py-0 text-sm underline" data-testid="bill-customer-btn" (click)="openCustomer()">{{ o.customer ? 'Change customer' : 'Add customer' }}</button> }
              </p>
            </div>
            <zp-status-badge [tone]="o.status === 'Paid' ? 'success' : o.status === 'Open' || o.status === 'PartiallyPaid' ? 'primary' : 'danger'"><span data-testid="bill-status">{{ o.status }}</span></zp-status-badge>
          </div>

          <!-- One row per item: the same thing at the same price is shown once, however many times it was added or sent. -->
          <ul class="mb-3 max-h-[22rem] flex-1 space-y-1 overflow-auto" data-testid="bill-lines">
            @for (r of rows(); track r.key) {
              <li class="rounded-lg border border-ink/10 p-2" [attr.data-testid]="'line-' + r.name">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="font-medium">{{ r.name }}</p>
                    @if (r.first.serialNumber) { <p class="font-mono text-xs text-ink/70">S/N {{ r.first.serialNumber }}</p> }
                    @for (m of r.first.modifiers; track m.id) { <p class="text-xs text-ink/70">+ {{ m.name }}</p> }
                    @if (r.first.package; as pk) {
                      <p class="text-xs text-ink/70" [attr.data-testid]="'contents-' + r.name">@for (c of pk.contents; track $index) { {{ $index ? ', ' : '' }}{{ c.quantity * r.quantity }} x {{ c.name }} }</p>
                      @if (pk.mixed && pk.splitExempt + pk.splitExemptNoDiscount > 0) { <span class="app-badge bg-ink/10 text-ink/80" [attr.data-testid]="'part-exempt-' + r.name">part tax free</span> }
                      @if (pk.mixed && pk.splitNoDiscount + pk.splitExemptNoDiscount > 0) { <span class="app-badge bg-ink/10 text-ink/80">part no discount</span> }
                    }
                    @for (l of r.sent; track l.id) {
                      @if (l.barState) {
                        <span class="app-badge" [class]="barTone(l.barState)" [attr.data-testid]="'bar-state-' + r.name">{{ r.sent.length > 1 || r.unsentQty > 0 ? (l.quantity | number: '1.0-3') + ' ' : '' }}{{ barLabel(l.barState) }}</span>
                        @if (l.barState === 'CantMake') { <p class="text-xs font-semibold text-danger" role="status" [attr.data-testid]="'handed-back-' + r.name">The bar handed this back: {{ l.barNote }}. Change the quantity or take it off, then Send again.</p> }
                      }
                    }
                    @if (r.plainSentQty > 0) { <span class="app-badge app-badge-success" [attr.data-testid]="'sent-' + r.name">{{ r.plainSentQty < r.quantity ? (r.plainSentQty | number: '1.0-3') + ' sent' : 'sent' }}</span> }
                    @if (r.sentQty > 0 && r.unsentQty > 0) { <span class="app-badge app-badge-warning" [attr.data-testid]="'unsent-' + r.name">{{ r.unsentQty | number: '1.0-3' }} not sent yet</span> }
                    @if (r.first.onSpecial) { <span class="app-badge app-badge-primary" [attr.data-testid]="'special-' + r.name">special price</span> }
                    @if (r.first.itemDiscountPercent) { <span class="app-badge app-badge-primary" [attr.data-testid]="'item-discount-' + r.name">{{ r.first.itemDiscountPercent | number: '1.0-2' }}% off</span> }
                    @if (r.first.taxExempt) { <span class="app-badge bg-ink/10 text-ink/80" [attr.data-testid]="'exempt-' + r.name">no tax</span> }
                    @if (r.first.blockDiscount) { <span class="app-badge bg-ink/10 text-ink/80">no discount</span> }
                    @if (r.voidPending) { <span class="app-badge app-badge-warning">void awaiting approval</span> }
                  </div>
                  <span class="text-right font-semibold">{{ r.total | currency: store.currency() : 'symbol-narrow' : '1.2-2' }}
                    @if (r.discount > 0) { <span class="block text-xs font-normal text-ink/70" [attr.data-testid]="'line-discount-' + r.name">-{{ r.discount | currency: store.currency() : 'symbol-narrow' : '1.2-2' }} discount</span> }
                  </span>
                </div>
                @if (canEdit() && !readOnly()) {
                  <div class="mt-1 flex flex-wrap items-center gap-1">
                    <!-- An item set to "one per line" on its stock card, and a serial-numbered unit, have no quantity box: add it again for another one. -->
                    @if (r.back; as b) {
                      <input type="number" inputmode="decimal" min="0" step="any" class="app-input h-9 w-20 px-1 py-0 text-center" [attr.aria-label]="'Quantity of ' + r.name" data-testid="line-qty" [disabled]="!online() || r.locked"
                             [value]="r.quantity" (focus)="$any($event.target).select()" (keydown.enter)="$any($event.target).blur()" (change)="changeBack(b, $any($event.target).value, $any($event.target))" />
                      <button type="button" class="btn-ghost ml-auto px-2 py-1 text-sm" [attr.data-testid]="'remove-' + r.name" [disabled]="!online()" (click)="removeBack(b)">Take off</button>
                    }
                    @else if (r.locked) { <span class="w-10 text-center" data-testid="line-qty">x{{ r.quantity | number: '1.0-3' }}</span> }
                    @else {
                      <button type="button" class="btn-outline h-9 w-9 p-0" aria-label="Fewer" [disabled]="r.quantity - 1 < r.sentQty" (click)="setRow(r, r.quantity - 1, null)">-</button>
                      <input type="number" inputmode="decimal" min="0" step="any" class="app-input h-9 w-20 px-1 py-0 text-center" [attr.aria-label]="'Quantity of ' + r.name" data-testid="line-qty"
                             [value]="r.quantity" (focus)="$any($event.target).select()" (keydown.enter)="$any($event.target).blur()" (change)="setRow(r, $any($event.target).value, $any($event.target))" />
                      <button type="button" class="btn-outline h-9 w-9 p-0" aria-label="More" (click)="setRow(r, r.quantity + 1, null)">+</button>
                    }
                    @if (!r.back) {
                    <span class="ml-auto flex flex-wrap items-center justify-end gap-1">
                      @if (r.unsent.length) { <button type="button" class="btn-ghost px-2 py-1 text-sm" [attr.data-testid]="'remove-' + r.name" (click)="removeUnsent(r)">{{ r.sentQty > 0 ? 'Remove unsent' : 'Remove' }}</button> }
                      @if (canVoid()) {
                        @for (l of r.sent; track l.id) {
                          @if (!l.voidPending) { <button type="button" class="btn-ghost px-2 py-1 text-sm" [attr.data-testid]="'void-' + r.name" (click)="openVoid(l.id)">{{ r.sent.length > 1 ? 'Void ' + (l.quantity | number: '1.0-3') : 'Void' }}</button> }
                        }
                      }
                    </span>
                    }
                  </div>
                }
              </li>
            } @empty { <li class="py-6 text-center text-sm text-ink/70">No items yet.</li> }
          </ul>

          <dl class="space-y-0.5 border-t border-ink/10 pt-2 text-sm" data-testid="bill-totals">
            <div class="flex justify-between"><dt>Subtotal</dt><dd>{{ o.subtotal | currency: store.currency() : 'symbol-narrow' : '1.2-2' }}</dd></div>
            @if (o.discountTotal + o.orderDiscount > 0) { <div class="flex justify-between"><dt>Discounts</dt><dd>-{{ o.discountTotal + o.orderDiscount | currency: store.currency() : 'symbol-narrow' : '1.2-2' }}</dd></div> }
            <div class="flex justify-between"><dt>{{ o.taxName }} ({{ o.taxRatePercent }}%{{ o.taxInclusive ? ', included' : '' }})</dt><dd>{{ o.taxTotal | currency: store.currency() : 'symbol-narrow' : '1.2-2' }}</dd></div>
            @if (o.tipAmount > 0) { <div class="flex justify-between"><dt>Tip</dt><dd>{{ o.tipAmount | currency: store.currency() : 'symbol-narrow' : '1.2-2' }}</dd></div> }
            <div class="flex justify-between text-base font-bold"><dt>Total</dt><dd data-testid="bill-total">{{ o.total | currency: store.currency() : 'symbol-narrow' : '1.2-2' }}</dd></div>
            @if (o.amountPaid > 0) { <div class="flex justify-between"><dt>Paid</dt><dd>{{ o.amountPaid | currency: store.currency() : 'symbol-narrow' : '1.2-2' }}</dd></div> }
            <div class="flex justify-between font-semibold"><dt>Balance</dt><dd data-testid="bill-balance">{{ o.balance | currency: store.currency() : 'symbol-narrow' : '1.2-2' }}</dd></div>
          </dl>

          @if (error()) { <p class="sys-alert sys-alert-danger mt-2" role="alert" data-testid="pos-error">{{ error() }}</p> }

          <div class="mt-3 grid grid-cols-2 gap-2">
            @if (canEdit() && !readOnly() && isOpen()) {
              <button type="button" class="btn-outline" data-testid="send-order" [disabled]="!hasUnsent()" (click)="sendOrder()">Send</button>
              @if (canDiscount()) { <button type="button" class="btn-outline" data-testid="discount" (click)="dialog.set('discount')">Discount</button> }
              <button type="button" class="btn-outline" (click)="dialog.set('tip')">Tip</button>
              @if (canSplit()) { <button type="button" class="btn-outline" data-testid="split" (click)="dialog.set('split')">Split</button> }
              @if (canSplit()) { <button type="button" class="btn-outline" (click)="openMerge()">Merge</button> }
              @if (canSplit()) { <button type="button" class="btn-outline" data-testid="transfer-open" (click)="openTransfer()">Move / hand over</button> }
            }
            @if (canPay() && !readOnly() && isOpen() && o.balance > 0) {
              <button type="button" class="btn-primary col-span-2 touch-target disabled:opacity-40" data-testid="pay" [disabled]="!!barLock()" (click)="openPay()">Pay {{ o.balance | currency: store.currency() : 'symbol-narrow' : '1.2-2' }}</button>
              @if (barLock(); as why) {
                <p class="col-span-2 text-sm text-ink/80" role="status" data-testid="pay-lock">{{ why }}
                  @if (canUnlock()) { <button type="button" class="btn-ghost px-1 py-0 text-sm underline" data-testid="pay-unlock" (click)="openUnlock()">Take payment anyway (supervisor)</button> }</p>
              }
            }
            @if (canVoid() && !readOnly() && isOpen() && o.amountPaid === 0 && activeLines().length > 0) { <button type="button" class="btn-ghost col-span-2 text-sm" data-testid="void-bill" (click)="openVoid(null)">Void whole bill</button> }
            @if (o.status === 'Paid' || o.amountPaid > 0) { <button type="button" class="btn-outline col-span-2" data-testid="receipt" (click)="openReceipt()">Receipt</button> }
          </div>
        } @else {
          <p class="py-10 text-center text-ink/70">Select a bill, or start a new one.</p>
        }
      </section>
    </div>
    }

    <!-- New bill -->
    <zp-dialog [open]="dialog() === 'new'" title="New bill" (closed)="dialog.set(null)">
      <form class="space-y-3" (submit)="$event.preventDefault(); createBill()">
        <div><label class="app-label" for="nb-kind">Type</label>
          <select id="nb-kind" class="app-input" data-testid="nb-kind" [ngModel]="form().kind" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ kind: $event })">
            <option value="Tab">Tab</option><option value="Table">Table</option><option value="WalkUp">Walk-up</option><option value="Takeaway">Takeaway</option>
          </select></div>
        <div><label class="app-label" for="nb-label">Name</label><input id="nb-label" class="app-input" data-testid="nb-label" placeholder="e.g. Ada's tab" [ngModel]="form().label" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ label: $event })" /></div>
        @if (form().kind === 'Table') { <div><label class="app-label" for="nb-table">Table</label><input id="nb-table" class="app-input" data-testid="nb-table" [ngModel]="form().table" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ table: $event })" /></div> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="nb-create">Start bill</button></div>
      </form>
    </zp-dialog>

    <!-- Serial number of the unit being sold (serial-tracked items) -->
    <zp-dialog [open]="dialog() === 'serial'" [title]="'Serial number: ' + (pending()?.name ?? '')" (closed)="dialog.set(null)">
      <form class="space-y-3" (submit)="$event.preventDefault(); confirmSerial()">
        <p class="text-sm text-ink/80">This item is sold one unit at a time. Scan or type the serial number printed on the unit.</p>
        <div><label class="app-label" for="sn-input">Serial number</label><input id="sn-input" class="app-input font-mono" autocomplete="off" maxlength="80" data-testid="serial-input" [ngModel]="serialText()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="serialText.set($event)" /></div>
        @if (!syncAgent.online()) { <p class="text-xs text-ink/70" role="status">You are offline: the serial is checked against stock when the bill syncs.</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="serial-add" [disabled]="!serialText().trim()">Continue</button></div>
      </form>
    </zp-dialog>

    <!-- Sold singly or by one of its selling units (a case): the price of a unit is the item's price times what it holds -->
    <zp-dialog [open]="dialog() === 'unit'" [title]="'How is ' + (pending()?.name ?? 'it') + ' sold?'" (closed)="dialog.set(null)">
      @if (pending(); as p) {
        <div class="grid gap-2" data-testid="unit-choices">
          <button type="button" class="btn-outline touch-target justify-between" data-testid="unit-single" (click)="chooseUnit(null)"><span>Single</span><span class="font-bold">{{ p.price | currency: store.currency() : 'symbol-narrow' : '1.2-2' }}</span></button>
          @for (u of p.sellingUnits ?? []; track u.id) {
            <button type="button" class="btn-outline touch-target justify-between" [attr.data-testid]="'unit-' + u.name" (click)="chooseUnit(u)"><span>{{ u.name }} <span class="text-ink/70">of {{ u.size }}</span></span><span class="font-bold">{{ p.price * u.size | currency: store.currency() : 'symbol-narrow' : '1.2-2' }}</span></button>
          }
        </div>
      }
    </zp-dialog>

    <!-- The customer record on the bill: found by phone or name, or added on the spot. Separate from the bill's own name. -->
    <zp-dialog [open]="dialog() === 'customer'" title="Customer on this bill" (closed)="dialog.set(null)">
      <div class="space-y-3">
        <div>
          <label class="app-label" for="cust-search">Find a customer</label>
          <input id="cust-search" class="app-input" placeholder="Phone or name" autocomplete="off" inputmode="search" data-testid="cust-search" [ngModel]="custSearch()" (ngModelChange)="findCustomers($event)" />
          @if (custResults().length) {
            <ul class="mt-1 divide-y divide-ink/10 rounded-lg border border-ink/15" data-testid="cust-results">
              @for (c of custResults(); track c.id) {
                <li><button type="button" class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-ink/10 touch-target" [attr.data-testid]="'cust-pick-' + c.name" [disabled]="custBusy()" (click)="setCustomer(c.id)"><span class="font-medium">{{ c.name }}</span><span class="font-mono text-sm">{{ c.phone }}</span><span class="text-sm text-ink/70">{{ c.pointsBalance }} points</span></button></li>
              }
            </ul>
          } @else if (custSearch().trim().length >= 2 && !custLooking()) { <p class="mt-1 text-sm text-ink/70" data-testid="cust-none">Nobody found. Add them below.</p> }
        </div>
        <form class="rounded-lg border border-ink/15 p-3" autocomplete="off" (submit)="$event.preventDefault(); addCustomer()">
          <p class="mb-2 text-sm font-semibold">New customer</p>
          <div class="grid gap-2 sm:grid-cols-2">
            <div><label class="app-label" for="cust-new-name">Name</label><input id="cust-new-name" name="zp-new-customer" class="app-input" maxlength="120" autocomplete="off" data-testid="cust-new-name" [ngModel]="custName()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="custName.set($event)" /></div>
            <div><label class="app-label" for="cust-new-phone">Phone</label><input id="cust-new-phone" name="zp-new-customer-phone" class="app-input font-mono" maxlength="30" inputmode="tel" autocomplete="off" data-testid="cust-new-phone" [ngModel]="custPhone()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="custPhone.set($event)" /></div>
          </div>
          <button type="submit" class="btn-primary mt-2" data-testid="cust-add" [disabled]="custBusy() || !custName().trim() || !custPhone().trim()">Add and put on the bill</button>
        </form>
        @if (custError()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="cust-error">{{ custError() }}</p> }
        <div class="flex justify-between gap-2">
          @if (store.current()?.customer) { <button type="button" class="btn-outline" data-testid="cust-remove" [disabled]="custBusy()" (click)="setCustomer(null)">Take the customer off</button> } @else { <span></span> }
          <button type="button" class="btn-ghost" (click)="dialog.set(null)">Close</button>
        </div>
        <p class="text-xs text-ink/70">The customer earns each item's loyalty points when the bill is paid in full. Needs a connection.</p>
      </div>
    </zp-dialog>

    <!-- Modifiers -->
    <zp-dialog [open]="dialog() === 'modifiers'" [title]="pending()?.name ?? 'Options'" (closed)="dialog.set(null)">
      @if (pending(); as p) {
        <div class="space-y-2">
          @for (m of p.modifiers; track m.id) {
            @if (m.isActive) {
              <label class="flex items-center justify-between gap-2 rounded-lg border border-ink/15 p-2">
                <span><input type="checkbox" class="mr-2" [attr.data-testid]="'mod-' + m.name" [checked]="chosenMods().includes(m.id)" (change)="toggleMod(m.id)" />{{ m.name }}</span>
                <span class="text-sm">+{{ m.priceDelta | currency: store.currency() : 'symbol-narrow' : '1.2-2' }}</span>
              </label>
            }
          }
          <div class="flex justify-end gap-2 pt-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Cancel</button><button type="button" class="btn-primary" data-testid="mod-add" (click)="addPending()">Add to bill</button></div>
        </div>
      }
    </zp-dialog>

    <!-- Payment -->
    <zp-dialog [open]="dialog() === 'pay'" title="Take payment" [wide]="true" (closed)="dialog.set(null)">
      @if (store.current(); as o) {
        <div class="space-y-4">
          <p class="text-lg">Balance due: <strong data-testid="pay-due">{{ o.balance | currency: store.currency() : 'symbol-narrow' : '1.2-2' }}</strong></p>
          <div class="flex flex-wrap gap-2" role="group" aria-label="Payment method">
            @for (m of methods(); track m.method) {
              <button type="button" class="btn-outline" [class.ring-2]="payMethod() === m.method" [attr.data-testid]="'method-' + m.method" (click)="payMethod.set(m.method)">{{ m.label }}</button>
            }
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <div><label class="app-label" for="pay-amount">Amount</label><input id="pay-amount" type="number" step="0.01" min="0" class="app-input" data-testid="pay-amount" [ngModel]="payAmount()" (ngModelChange)="payAmount.set(+$event)" /></div>
            <div><label class="app-label" for="pay-tip">Tip (optional)</label><input id="pay-tip" type="number" step="0.01" min="0" class="app-input" data-testid="pay-tip" [ngModel]="payTip()" (ngModelChange)="payTip.set(+$event)" /></div>
          </div>
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <span>Split the balance evenly:</span>
            @for (n of [2, 3, 4, 5]; track n) { <button type="button" class="btn-ghost px-2 py-1" [attr.data-testid]="'split-' + n" (click)="applyShare(n)">{{ n }} ways</button> }
          </div>
          @if (shares().length) { <p class="text-sm text-ink/80" data-testid="shares">Shares: {{ shareText() }} (sums exactly to the balance)</p> }

          @if (payMethod() === 'Cash') {
            <div><label class="app-label" for="pay-tendered">Cash handed over</label><input id="pay-tendered" type="number" step="0.01" min="0" class="app-input" data-testid="pay-tendered" [ngModel]="tendered()" (ngModelChange)="tendered.set(+$event)" />
              <p class="mt-1 text-sm" data-testid="pay-change">Change: {{ change() | currency: store.currency() : 'symbol-narrow' : '1.2-2' }}</p></div>
          } @else {
            @if (store.settings()?.paymentProviderIsDemo) {
              <p class="sys-alert sys-alert-warning" role="status" data-testid="demo-payment-note">Development payment stub: no real money moves. Use token tok_ok (approve), tok_decline or tok_pending.</p>
            }
            <div><label class="app-label" for="pay-token">Payment token</label><input id="pay-token" class="app-input" data-testid="pay-token" [ngModel]="token()" (ngModelChange)="token.set($event)" /></div>
            @if (!online()) { <p class="sys-alert sys-alert-warning" role="status">You are offline. Card and transfer payments need a connection; take cash or wait until you are back online.</p> }
          }

          @if (payError()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="pay-error">{{ payError() }}</p> }
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-ghost" (click)="dialog.set(null)">Cancel</button>
            <button type="button" class="btn-primary touch-target" data-testid="pay-confirm" [disabled]="paying() || payAmount() <= 0 || (payMethod() !== 'Cash' && !online())" (click)="submitPay()">{{ paying() ? 'Processing...' : 'Confirm payment' }}</button>
          </div>
        </div>
      }
    </zp-dialog>

    <!-- Void -->
    <zp-dialog [open]="dialog() === 'void'" [title]="voidLineId() ? 'Void item' : 'Void whole bill'" (closed)="dialog.set(null)">
      <form class="space-y-3" (submit)="$event.preventDefault(); submitVoid()" data-testid="void-dialog">
        <p class="text-sm text-ink/80">{{ voidLineId() ? 'The item is removed from the bill' : 'Every item is removed and the bill is closed as voided' }} as soon as a supervisor or an administrator authorises it. Stock is returned unless it was thrown away. The void is recorded with who asked and who authorised it.</p>
        @if (!online()) { <p class="sys-alert sys-alert-warning" role="status" data-testid="void-offline">A void needs a connection: the authoriser's details are checked by the server. Try again when this device is back online.</p> }
        <div><label class="app-label" for="void-reason">Reason</label><input id="void-reason" class="app-input" data-testid="void-reason" [ngModel]="voidReason()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="voidReason.set($event)" /></div>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" data-testid="void-wasted" [checked]="voidWasted()" (change)="voidWasted.set(!voidWasted())" /> It was made and thrown away (keep the stock used)</label>
        @if (dialog() === 'void') { <zp-void-authoriser [clearSecret]="authAttempts()" (changed)="authorizer.set($event)" /> }
        @if (voidError()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="void-error">{{ voidError() }}</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Cancel</button><button type="submit" class="btn-primary touch-target" data-testid="void-confirm" [disabled]="voiding() || !online() || voidReason().trim().length < 3 || !authorizer()">{{ voiding() ? 'Checking...' : voidLineId() ? 'Void item' : 'Void bill' }}</button></div>
      </form>
    </zp-dialog>

    <!-- Discount -->
    <zp-dialog [open]="dialog() === 'discount'" title="Discount" (closed)="dialog.set(null)">
      <form class="space-y-3" (submit)="$event.preventDefault(); submitDiscount()">
        <div class="grid grid-cols-2 gap-3">
          <div><label class="app-label" for="d-pct">Percent</label><input id="d-pct" type="number" min="0" max="100" class="app-input" data-testid="discount-percent" [ngModel]="discPercent()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="discPercent.set(+$event)" /></div>
          <div><label class="app-label" for="d-amt">or amount</label><input id="d-amt" type="number" min="0" class="app-input" [ngModel]="discAmount()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="discAmount.set(+$event)" /></div>
        </div>
        <div><label class="app-label" for="d-reason">Reason</label><input id="d-reason" class="app-input" data-testid="discount-reason" [ngModel]="discReason()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="discReason.set($event)" /></div>
        @if (settingsApprovalNote()) { <p class="text-xs text-ink/70">{{ settingsApprovalNote() }}</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="discount-apply" [disabled]="discReason().trim().length < 2 || (discPercent() <= 0 && discAmount() <= 0)">Apply</button></div>
      </form>
    </zp-dialog>

    <!-- Tip -->
    <zp-dialog [open]="dialog() === 'tip'" title="Tip" (closed)="dialog.set(null)">
      <form class="space-y-3" (submit)="$event.preventDefault(); submitTip()">
        <div><label class="app-label" for="tip-amt">Tip amount</label><input id="tip-amt" type="number" min="0" step="0.01" class="app-input" data-testid="tip-amount" [ngModel]="tipAmount()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="tipAmount.set(+$event)" /></div>
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="tip-save">Save tip</button></div>
      </form>
    </zp-dialog>

    <!-- Split -->
    <zp-dialog [open]="dialog() === 'split'" title="Split this bill" [wide]="true" (closed)="dialog.set(null)">
      @if (store.current(); as o) {
        <p class="mb-2 text-sm text-ink/80">Choose the items to move to a new bill. Splitting needs a connection.</p>
        <ul class="mb-3 space-y-1">
          @for (l of activeLines(); track l.id) {
            <li><label class="flex items-center gap-2 rounded-lg border border-ink/10 p-2"><input type="checkbox" [attr.data-testid]="'split-line-' + l.productName" [checked]="splitIds().includes(l.id)" (change)="toggleSplit(l.id)" /> {{ l.quantity }} x {{ l.productName }} <span class="ml-auto">{{ l.lineTotal | currency: store.currency() : 'symbol-narrow' : '1.2-2' }}</span></label></li>
          }
        </ul>
        @if (splitError()) { <p class="sys-alert sys-alert-danger mb-2" role="alert">{{ splitError() }}</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Cancel</button><button type="button" class="btn-primary" data-testid="split-confirm" [disabled]="splitIds().length === 0 || splitIds().length === activeLines().length" (click)="submitSplit(o.id)">Split off {{ splitIds().length }} item(s)</button></div>
      }
    </zp-dialog>

    <!-- Merge -->
    <zp-dialog [open]="dialog() === 'merge'" title="Merge another bill into this one" (closed)="dialog.set(null)">
      <ul class="space-y-1">
        @for (b of mergeCandidates(); track b.id) {
          <li><button type="button" class="btn-outline w-full justify-between" [attr.data-testid]="'merge-' + (b.label ?? b.id)" (click)="submitMerge(b.id)"><span>{{ b.label ?? ('Bill #' + b.number) }}</span><span>{{ b.total | currency: store.currency() : 'symbol-narrow' : '1.2-2' }}</span></button></li>
        } @empty { <li class="text-ink/70">There is no other open bill at this branch.</li> }
      </ul>
      @if (splitError()) { <p class="sys-alert sys-alert-danger mt-2" role="alert">{{ splitError() }}</p> }
    </zp-dialog>

    <!-- Transfer -->
    <zp-dialog [open]="dialog() === 'transfer'" title="Move table or hand the bill over" (closed)="dialog.set(null)">
      <form class="space-y-3" (submit)="$event.preventDefault(); submitTransfer()">
        <div><label class="app-label" for="tr-table">Table</label><input id="tr-table" class="app-input" data-testid="transfer-table" [ngModel]="transferTable()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="transferTable.set($event)" /></div>
        <div><label class="app-label" for="tr-owner">Hand the bill over to</label>
          <select id="tr-owner" class="app-input" data-testid="transfer-owner" [ngModel]="transferOwner()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="transferOwner.set($event)">
            <option value="">Nobody: it stays with {{ store.current()?.ownerName ?? 'its owner' }}</option>
            @for (p of handOverTargets(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
          </select>
          <p class="mt-1 text-xs text-ink/70">The bill then belongs to that person: only they, a supervisor or a manager can change it or take payment on it.</p></div>
        @if (splitError()) { <p class="sys-alert sys-alert-danger" role="alert">{{ splitError() }}</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="transfer-save">Move</button></div>
      </form>
    </zp-dialog>

    <!-- Void approvals -->
    <zp-dialog [open]="dialog() === 'approvals'" title="Old void requests" [wide]="true" (closed)="dialog.set(null)">
      <p class="mb-3 text-sm text-ink/80">These were asked for before voids were authorised at the till. Approve or reject each one; either way you enter your own details first.</p>
      @if (dialog() === 'approvals') { <zp-void-authoriser class="mb-3 block" [clearSecret]="authAttempts()" (changed)="authorizer.set($event)" /> }
      <ul class="space-y-2">
        @for (r of approvals(); track r.id) {
          <li class="app-card flex items-start justify-between gap-3" [attr.data-testid]="'void-request-' + r.orderNumber">
            <div><p class="font-medium">Bill #{{ r.orderNumber }}: {{ r.lineName ?? 'whole bill' }}</p><p class="text-sm text-ink/80">{{ r.reason }}</p></div>
            <div class="flex gap-2"><button type="button" class="btn-outline px-2 py-1 text-sm" data-testid="void-reject" [disabled]="!authorizer()" (click)="decide(r, false)">Reject</button><button type="button" class="btn-primary px-2 py-1 text-sm" data-testid="void-approve" [disabled]="!authorizer()" (click)="decide(r, true)">Approve</button></div>
          </li>
        } @empty { <li class="text-ink/70">Nothing waiting.</li> }
      </ul>
      @if (splitError()) { <p class="sys-alert sys-alert-danger mt-2" role="alert">{{ splitError() }}</p> }
    </zp-dialog>

    <!-- Receipt: shown, then printed by itself or sent to the customer -->
    <zp-dialog [open]="dialog() === 'receipt'" title="Receipt" [wide]="true" (closed)="dialog.set(null)">
      @if (receipt(); as r) {
        <div class="grid gap-4 md:grid-cols-[20rem_minmax(0,1fr)]">
          <zp-receipt-view [receipt]="r" />
          <zp-receipt-share [receipt]="r" [phone]="store.current()?.customer?.phone ?? null" (print)="reprint()" />
        </div>
        @if (receiptError()) { <p class="sys-alert sys-alert-danger mt-2" role="alert">{{ receiptError() }}</p> }
      } @else { <p class="text-ink/70">{{ receiptError() ?? 'Loading...' }}</p> }
    </zp-dialog>

    <!-- Bar man method: a supervisor or administrator allows payment before the bar has confirmed -->
    <zp-dialog [open]="dialog() === 'unlock'" title="Take payment before the bar confirms" (closed)="dialog.set(null)">
      <form class="space-y-3" (submit)="$event.preventDefault(); submitUnlock()" data-testid="unlock-dialog">
        <p class="text-sm text-ink/80">Payment normally waits until the bar has marked the order ready. A supervisor or an administrator can allow it now for this bill, for example when the bar's device is down. It is recorded with who allowed it.</p>
        @if (!online()) { <p class="sys-alert sys-alert-warning" role="status">This needs a connection: the authoriser's details are checked by the server.</p> }
        @if (dialog() === 'unlock') { <zp-void-authoriser [clearSecret]="authAttempts()" (changed)="authorizer.set($event)" /> }
        @if (voidError()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="unlock-error">{{ voidError() }}</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Cancel</button><button type="submit" class="btn-primary touch-target" data-testid="unlock-confirm" [disabled]="voiding() || !online() || !authorizer()">{{ voiding() ? 'Checking...' : 'Allow payment' }}</button></div>
      </form>
    </zp-dialog>
  `
})
export class PosBillingComponent implements OnInit {
  protected readonly store = inject(PosStore);
  protected readonly branches = inject(BranchContextService);
  private readonly auth = inject(AuthService);
  private readonly ordersApi = inject(OrdersApi);
  private readonly toast = inject(ToastService);
  protected readonly syncAgent = inject(SyncAgentService);
  private readonly bar = inject(BarStore);

  protected readonly perms = SCREEN_PERMISSIONS;
  protected readonly dialog = signal<Dialog>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly search = signal('');
  protected readonly barcode = signal('');
  protected readonly categoryId = signal<string | null>(null);

  protected readonly form = signal({ kind: 'Tab' as OrderKind, label: '', table: '' });
  protected readonly pending = signal<ProductDto | null>(null);
  protected readonly chosenMods = signal<readonly string[]>([]);
  protected readonly serialText = signal('');
  private serialChosen: string | null = null;

  // ---- Layby: the bill, with its customer, becomes a layby; its items are then fixed and it is paid in parts ----
  private readonly laybysApi = inject(LaybysApi);
  protected readonly canLayby = computed(() => this.auth.hasPermission(this.perms.POS_LAYBY_MANAGE) && this.mine());
  protected readonly laybyBusy = signal(false);
  protected readonly laybyError = signal<string | null>(null);

  protected async startLayby(): Promise<void> {
    this.laybyBusy.set(true);
    this.laybyError.set(null);
    try {
      await this.store.serverAction(async (id) => {
        await firstValueFrom(this.laybysApi.start(id));
        return firstValueFrom(this.ordersApi.get(id));
      }, 'Laybys');
    } catch (err) { this.laybyError.set(toApiError(err).message); }
    finally { this.laybyBusy.set(false); }
  }

  // ---- The customer record on the bill ----
  private readonly customersApi = inject(CustomersApi);
  protected readonly canCustomers = computed(() => this.auth.hasPermission(this.perms.CUSTOMERS_USE) && this.mine());
  protected readonly custSearch = signal('');
  protected readonly custResults = signal<readonly CustomerDto[]>([]);
  protected readonly custLooking = signal(false);
  protected readonly custName = signal('');
  protected readonly custPhone = signal('');
  protected readonly custBusy = signal(false);
  protected readonly custError = signal<string | null>(null);
  private custSeq = 0;

  protected openCustomer(): void {
    this.custSearch.set('');
    this.custResults.set([]);
    this.custName.set('');
    this.custPhone.set('');
    this.custError.set(null);
    this.dialog.set('customer');
  }

  protected findCustomers(text: string): void {
    this.custSearch.set(text);
    const mine = ++this.custSeq;
    if (text.trim().length < 2) { this.custResults.set([]); return; }
    this.custLooking.set(true);
    void firstValueFrom(this.customersApi.list({ search: text.trim(), pageSize: 8 }))
      .then((r) => { if (mine === this.custSeq) this.custResults.set(r.items); })
      .catch((err) => this.custError.set(toApiError(err).message))
      .finally(() => { if (mine === this.custSeq) this.custLooking.set(false); });
  }

  /** Puts a customer on the bill (or takes them off). The bill must have reached the server first, so this needs a connection. */
  protected async setCustomer(customerId: string | null): Promise<void> {
    this.custBusy.set(true);
    this.custError.set(null);
    try {
      await this.store.serverAction((id) => firstValueFrom(this.customersApi.setOnOrder(id, customerId)), 'Customers');
      this.dialog.set(null);
    } catch (err) { this.custError.set(toApiError(err).message); }
    finally { this.custBusy.set(false); }
  }

  protected async addCustomer(): Promise<void> {
    this.custBusy.set(true);
    this.custError.set(null);
    try {
      const made = await firstValueFrom(this.customersApi.create({ name: this.custName().trim(), phone: this.custPhone().trim(), isActive: true }));
      await this.store.serverAction((id) => firstValueFrom(this.customersApi.setOnOrder(id, made.id)), 'Customers');
      this.dialog.set(null);
    } catch (err) {
      const e = toApiError(err);
      this.custError.set(Object.values(e.fieldErrors ?? {})[0]?.[0] ?? e.message);
    } finally { this.custBusy.set(false); }
  }
  private unitChosen: SellingUnitDto | null = null;

  protected readonly payMethod = signal<PaymentMethod>('Cash');
  protected readonly payAmount = signal(0);
  protected readonly payTip = signal(0);
  protected readonly tendered = signal(0);
  protected readonly token = signal('tok_ok');
  protected readonly paying = signal(false);
  protected readonly payError = signal<string | null>(null);
  protected readonly shares = signal<readonly number[]>([]);

  protected readonly voidLineId = signal<string | null>(null);
  protected readonly voidReason = signal('');
  protected readonly voidWasted = signal(false);
  protected readonly voidError = signal<string | null>(null);
  protected readonly voiding = signal(false);
  /** What the authoriser typed, for the void in hand only; cleared when the dialog opens and after it succeeds. */
  protected readonly authorizer = signal<VoidAuthorizer | null>(null);
  protected readonly authAttempts = signal(0);
  protected readonly discPercent = signal(0);
  protected readonly discAmount = signal(0);
  protected readonly discReason = signal('');
  protected readonly tipAmount = signal(0);
  protected readonly splitIds = signal<readonly string[]>([]);
  protected readonly splitError = signal<string | null>(null);
  protected readonly transferTable = signal('');
  protected readonly approvals = signal<readonly VoidRequestDto[]>([]);
  protected readonly receipt = signal<ReceiptDto | null>(null);
  protected readonly receiptError = signal<string | null>(null);

  protected readonly online = this.syncAgent.online;
  protected readonly readOnly = computed(() => this.auth.accessModeFor(FEATURES.CORE_POS) === 'readonly');
  protected readonly isOpen = computed(() => ['Open', 'PartiallyPaid'].includes(this.store.current()?.status ?? ''));
  protected readonly canCreate = computed(() => this.auth.hasPermission(this.perms.POS_ORDER_CREATE));
  /** The bill on screen is this person's to work on: they opened it (or it was handed to them), or they are a supervisor or manager. */
  protected readonly mine = computed(() => {
    const o = this.store.current();
    return !o || !o.ownerMembershipId || o.ownerMembershipId === this.auth.membership()?.id || this.auth.hasPermission(this.perms.POS_VOID_APPROVE);
  });
  protected readonly canEdit = computed(() => this.auth.hasPermission(this.perms.POS_ORDER_EDIT) && this.mine());
  /** Laybys and consignment bills are paid by anyone with the payment right; every other bill by its owner, a supervisor or a manager. */
  protected readonly canPay = computed(() => this.auth.hasPermission(this.perms.POS_PAYMENT_PROCESS) && (this.mine() || !!this.store.current()?.layby || !!this.store.current()?.consignmentSaleId));
  protected readonly canDiscount = computed(() => this.auth.hasPermission(this.perms.POS_DISCOUNT_APPLY));
  protected readonly canSplit = computed(() => this.auth.hasPermission(this.perms.POS_TAB_SPLIT) && this.mine());
  protected readonly canVoid = computed(() => this.auth.hasAnyPermission([this.perms.POS_VOID_REQUEST, this.perms.POS_VOID_APPROVE]) && this.mine());

  /**
   * Bar man method: why payment cannot be taken yet, or null when it can. Payment waits until the bar has marked everything ready,
   * unless a supervisor allowed it for this bill. UX only: the server refuses the payment for the same reasons.
   */
  protected readonly barLock = computed<string | null>(() => {
    const o = this.store.current();
    if (!o || !this.bar.enabled() || o.layby || o.consignmentSaleId || o.paymentUnlocked) return null;
    const lines = this.activeLines();
    if (lines.some((l) => !l.confirmed)) return 'Send this bill to the bar first. Payment is taken once the bar has marked the order ready.';
    const refused = lines.filter((l) => l.barState === 'CantMake').map((l) => l.productName);
    if (refused.length) return `The bar could not make ${[...new Set(refused)].join(', ')}. Change its quantity or take it off before taking payment.`;
    if (lines.some((l) => l.barState === 'Waiting' || l.barState === 'Preparing')) return 'Waiting for the bar: payment is taken once it marks this order ready.';
    return null;
  });
  protected readonly canUnlock = computed(() => this.online() && this.activeLines().length > 0);
  protected readonly transferOwner = signal('');
  protected readonly handOverTargets = signal<readonly { id: string; name: string }[]>([]);
  protected readonly canApproveVoid = computed(() => this.auth.hasPermission(this.perms.POS_VOID_APPROVE));

  protected readonly hasUnsent = computed(() => !!this.store.current()?.lines.some((l) => l.status === 'Active' && !l.confirmed));
  protected readonly activeLines = computed(() => this.store.current()?.lines.filter((l) => l.status === 'Active') ?? []);

  /** The bill as the person sees it: one row per item, in the order each was first added. */
  protected readonly rows = computed<readonly BillRow[]>(() => {
    const groups = new Map<string, OrderLineDto[]>();
    for (const l of this.activeLines()) {
      const key = l.barState === 'CantMake' ? `back:${l.id}` : lineKey(l);   // what the bar handed back is a row of its own
      const list = groups.get(key);
      if (list) list.push(l); else groups.set(key, [l]);
    }
    const products = this.store.products();
    return [...groups.entries()].map(([key, lines]) => {
      const first = lines[0]!;
      const sent = lines.filter((l) => l.confirmed);
      const unsent = lines.filter((l) => !l.confirmed);
      const sum = (list: readonly OrderLineDto[], pick: (l: OrderLineDto) => number) => list.reduce((s, l) => s + pick(l), 0);
      return {
        key, name: first.productName, first, sent, unsent,
        quantity: q3(sum(lines, (l) => l.quantity)), sentQty: q3(sum(sent, (l) => l.quantity)), unsentQty: q3(sum(unsent, (l) => l.quantity)),
        plainSentQty: q3(sum(sent.filter((l) => !l.barState), (l) => l.quantity)),
        total: Math.round(sum(lines, (l) => l.lineTotal) * 100) / 100, discount: Math.round(sum(lines, (l) => l.discountAmount) * 100) / 100,
        voidPending: lines.some((l) => l.voidPending),
        locked: !!first.serialNumber || products.find((p) => p.id === first.productId)?.editQtyOnSales === false,
        back: first.barState === 'CantMake' ? first : null
      };
    });
  });
  protected readonly mergeCandidates = computed(() => this.store.bills().filter((b) => b.id !== this.store.current()?.id && !b.numberPending));
  protected readonly change = computed(() => Math.max(0, Math.round((this.tendered() - this.payAmount()) * 100) / 100));
  protected readonly shareText = computed(() => this.shares().map((s) => s.toFixed(2)).join(' + '));

  protected readonly methods = computed(() => {
    const s = this.store.settings();
    const all: { method: PaymentMethod; label: string; on: boolean }[] = [
      { method: 'Cash', label: 'Cash', on: s?.allowCashPayments ?? true },
      { method: 'Card', label: 'Card', on: s?.allowCardPayments ?? true },
      { method: 'Transfer', label: 'Transfer', on: s?.allowTransferPayments ?? true }
    ];
    return all.filter((m) => m.on);
  });

  protected readonly visibleProducts = computed(() => {
    const q = this.search().trim().toLowerCase();
    const c = this.categoryId();
    return this.store.products().filter((p) => (!c || p.categoryId === c) && (!q || p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q)));
  });

  protected readonly settingsApprovalNote = computed(() => {
    const t = this.store.settings()?.discountApprovalPercent ?? 0;
    return t > 0 ? `Discounts above ${t}% need a manager's approval.` : '';
  });

  constructor() {
    // Reload everything when the branch changes.
    effect(() => {
      const id = this.branches.activeId();
      if (id) untracked(() => void this.reloadBranch(id));
    });

    // A till that was already signed in when the bar man method was switched on learns it here, so its bell and prompts appear.
    effect(() => {
      const s = this.store.settings();
      if (s) untracked(() => this.bar.follow(s.barManMethodEnabled));
    }, { allowSignalWrites: true });

    // Bar man method: when something changes at the bar, re-read the open bill so each line shows where it is (waiting, preparing, ready).
    // A bill with changes not yet synced keeps its local figures (PosStore.open), so nothing the person typed is lost.
    effect(() => {
      if (this.bar.changes() === 0) return;
      untracked(() => {
        const open = this.store.current();
        if (open && this.bar.enabled() && this.online()) void this.store.open(open.id).catch(() => undefined);
      });
    }, { allowSignalWrites: true });
  }

  protected barLabel(state: BarLineState): string {
    return { Waiting: 'waiting at the bar', Preparing: 'being prepared', Ready: 'ready to collect', Collected: 'served', CantMake: "bar can't make this" }[state];
  }

  protected barTone(state: BarLineState): string {
    return state === 'CantMake' ? 'app-badge-danger' : state === 'Waiting' ? 'app-badge-warning' : state === 'Preparing' ? 'app-badge-primary' : 'app-badge-success';
  }

  ngOnInit(): void {
    void this.branches.load();
  }

  private async reloadBranch(branchId: string): Promise<void> {
    this.store.close();
    await this.store.loadCatalog(branchId);
    await this.store.refreshBills();
    if (this.canApproveVoid()) void this.loadApprovals();
  }

  protected patch(p: Partial<{ kind: OrderKind; label: string; table: string }>): void {
    this.form.update((f) => ({ ...f, ...p }));
  }

  protected async select(id: string): Promise<void> {
    this.error.set(null);
    try { await this.store.open(id); } catch (err) { this.error.set(toApiError(err).message); }
  }

  protected openNew(): void {
    this.form.set({ kind: 'Tab', label: '', table: '' });
    this.dialog.set('new');
  }

  protected async createBill(): Promise<void> {
    const f = this.form();
    await this.run(() => this.store.create(f.kind, f.label.trim() || null, f.kind === 'Table' ? f.table.trim() || null : null));
    this.dialog.set(null);
  }

  protected pick(p: ProductDto): void {
    if (this.store.current()?.layby) { this.laybyError.set('This bill is on layby: its items are fixed. Start a new bill for anything else.'); return; }
    if (this.store.current()?.consignmentSaleId) { this.laybyError.set('This bill is for consignment goods an agent sold: its items and prices are fixed. Start a new bill for anything else.'); return; }
    this.serialChosen = null;
    if (p.tracksSerials) {
      this.pending.set(p);
      this.serialText.set('');
      this.dialog.set('serial');
      return;
    }
    this.continuePick(p);
  }

  /** A product with selling units asks first how it is being sold; `unit` is given when a case barcode already answered that. */
  private continuePick(p: ProductDto, unit?: SellingUnitDto | null): void {
    if (unit === undefined && (p.sellingUnits?.length ?? 0) > 0) {
      this.pending.set(p);
      this.dialog.set('unit');
      return;
    }
    this.unitChosen = unit ?? null;
    if (p.modifiers.some((m) => m.isActive)) {
      this.pending.set(p);
      this.chosenMods.set([]);
      this.dialog.set('modifiers');
    } else void this.run(() => this.store.addProduct(p, 1, [], null, this.serialChosen, this.unitChosen));
  }

  protected chooseUnit(unit: SellingUnitDto | null): void {
    const p = this.pending();
    this.dialog.set(null);
    if (p) this.continuePick(p, unit);
  }

  protected confirmSerial(): void {
    const p = this.pending();
    const serial = this.serialText().trim();
    if (!p || !serial) return;
    this.serialChosen = serial;
    this.dialog.set(null);
    this.continuePick(p);
  }

  protected toggleMod(id: string): void {
    this.chosenMods.update((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  }

  protected async addPending(): Promise<void> {
    const p = this.pending();
    if (p) await this.run(() => this.store.addProduct(p, 1, [...this.chosenMods()], null, this.serialChosen, this.unitChosen));
    this.dialog.set(null);
  }

  protected sendOrder(): void {
    void this.run(() => this.store.confirm());
  }

  /**
   * Sets how many of a row are on the bill, from the box or the minus / plus buttons. What has been sent stays sent: more goes on as
   * units still to send, and the number cannot go below what was sent (that is a void, which a supervisor authorises).
   */
  protected setRow(r: BillRow, value: unknown, box: HTMLInputElement | null): void {
    const typed = typeof value === 'string' ? value.trim() : value;
    const wanted = typed === '' || typed === null ? NaN : q3(Number(typed));
    const putBack = () => { if (box) box.value = String(r.quantity); };
    if (!Number.isFinite(wanted) || wanted < 0) { putBack(); return; }
    if (wanted < r.sentQty) {
      putBack();
      this.error.set(`${r.sentQty} of ${r.name} ${r.sentQty === 1 ? 'has' : 'have'} already been sent, so the quantity cannot go below that. To take sent items off, void them.`);
      return;
    }
    const unsentWanted = q3(wanted - r.sentQty);
    if (unsentWanted === r.unsentQty) { putBack(); return; }
    void this.run(async () => {
      if (unsentWanted === 0) { for (const l of r.unsent) await this.store.removeLine(l.id); return; }
      const [keep, ...extra] = r.unsent;
      if (!keep) { await this.store.addMore(r.first, unsentWanted); return; }
      for (const l of extra) await this.store.removeLine(l.id);
      await this.store.setQuantity(keep.id, unsentWanted);
    }).then(() => { if (this.error()) putBack(); });
  }

  /** A line the bar handed back gets a new quantity: the server closes the old line with the bar's reason and enters it again, to be sent. */
  protected changeBack(line: OrderLineDto, value: unknown, box: HTMLInputElement): void {
    const wanted = q3(Number(typeof value === 'string' ? value.trim() : value));
    if (!Number.isFinite(wanted) || wanted < 0 || value === '') { box.value = String(line.quantity); return; }
    if (wanted === line.quantity) return;
    void this.run(async () => {
      await this.store.serverAction((id) => firstValueFrom(wanted === 0 ? this.ordersApi.removeLine(id, line.id) : this.ordersApi.updateLine(id, line.id, wanted)), 'Changing what the bar handed back');
    }).then(() => { if (this.error()) box.value = String(line.quantity); });
  }

  protected removeBack(line: OrderLineDto): void {
    void this.run(async () => { await this.store.serverAction((id) => firstValueFrom(this.ordersApi.removeLine(id, line.id)), 'Changing what the bar handed back'); });
  }

  /** Takes off what has not been sent yet. For an item sold one per line that is one unit at a time, the last added first. */
  protected removeUnsent(r: BillRow): void {
    const lines = r.locked ? r.unsent.slice(-1) : r.unsent;
    void this.run(async () => { for (const l of lines) await this.store.removeLine(l.id); });
  }

  /** A barcode already in the cached catalogue is added at once, so scanning works offline. */
  protected async scan(): Promise<void> {
    const code = this.barcode().trim();
    if (!code) return;
    const hit = this.store.products().find((p) => p.barcode === code);
    this.barcode.set('');
    if (hit) { this.pick(hit); return; }
    // The barcode printed on a case sells that case.
    for (const p of this.store.products()) {
      const unit = p.sellingUnits?.find((u) => u.barcode === code);
      if (unit) { this.serialChosen = null; this.continuePick(p, unit); return; }
    }
    this.toast.error(`No product has the barcode ${code}.`);
  }

  protected async run(action: () => Promise<void>): Promise<void> {
    this.error.set(null);
    try { await action(); } catch (err) { this.error.set(toApiError(err).message); }
  }

  // ---- payment ----
  protected async openPay(): Promise<void> {
    await this.store.settled();   // an item tapped a moment ago is on the bill before the amount due is read
    const o = this.store.current();
    if (!o) return;
    this.payMethod.set('Cash');
    this.payAmount.set(o.balance);
    this.payTip.set(0);
    this.tendered.set(o.balance);
    this.token.set('tok_ok');
    this.payError.set(null);
    this.shares.set([]);
    this.dialog.set('pay');
  }

  protected applyShare(n: number): void {
    const o = this.store.current();
    if (!o) return;
    const s = splitEvenly(o.balance, n);
    this.shares.set(s);
    this.payAmount.set(s[0]!);
    this.tendered.set(s[0]!);
  }

  protected async submitPay(): Promise<void> {
    const o = this.store.current();
    if (!o) return;
    this.paying.set(true);
    this.payError.set(null);
    try {
      if (this.payMethod() === 'Cash') {
        if (this.tendered() < this.payAmount()) throw new Error('The cash handed over is less than the payment.');
        await this.store.payCash(this.payAmount(), this.tendered(), this.payTip());
      } else {
        await this.store.payOnline({ method: this.payMethod(), amount: this.payAmount(), tip: this.payTip(), token: this.token().trim() || null });
      }
      this.dialog.set(null);
      this.toast.success('Payment recorded.');
    } catch (err) {
      this.payError.set(err instanceof Error && !('status' in err) ? err.message : toApiError(err).message);
    } finally {
      this.paying.set(false);
    }
  }

  // ---- void / discount / tip ----
  /** A line id voids that item; null voids the whole bill. */
  protected openVoid(lineId: string | null): void {
    this.voidLineId.set(lineId);
    this.voidReason.set('');
    this.voidWasted.set(false);
    this.voidError.set(null);
    this.authorizer.set(null);
    this.dialog.set('void');
  }

  /** The server checks the authoriser for this void. A refusal keeps the dialog open with the reason and wipes the PIN / password box. */
  protected async submitVoid(): Promise<void> {
    const authorizer = this.authorizer();
    if (!authorizer || this.voiding()) return;
    const whole = this.voidLineId() === null;
    this.voiding.set(true);
    this.voidError.set(null);
    try {
      await this.store.voidWithAuthoriser(this.voidLineId(), this.voidReason().trim(), this.voidWasted(), authorizer);
      this.dialog.set(null);
      this.authorizer.set(null);
      if (whole) this.store.close();
      this.toast.success(whole ? 'Bill voided.' : 'Item voided.');
    } catch (err) {
      this.voidError.set(toApiError(err).message);
      this.authAttempts.update((n) => n + 1);
    } finally { this.voiding.set(false); }
  }

  protected async submitDiscount(): Promise<void> {
    await this.run(() => this.store.setOrderDiscount({
      percent: this.discPercent() > 0 ? this.discPercent() : undefined,
      amount: this.discPercent() > 0 ? undefined : this.discAmount(),
      reason: this.discReason().trim()
    }));
    this.dialog.set(null);
  }

  protected async submitTip(): Promise<void> {
    await this.run(() => this.store.setTip(this.tipAmount()));
    this.dialog.set(null);
  }

  // ---- structure (needs the server) ----
  protected toggleSplit(id: string): void {
    this.splitIds.update((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  }

  protected async submitSplit(_orderId: string): Promise<void> {
    this.splitError.set(null);
    const lineIds = [...this.splitIds()];
    try {
      const created = await this.store.serverAction((id) => firstValueFrom(this.ordersApi.split(id, { mode: 'Items', lineIds, seat: null, newOrderId: crypto.randomUUID() })), 'Splitting a bill');
      this.splitIds.set([]);
      this.dialog.set(null);
      this.toast.success(`Split into bill #${created.number}.`);
      await this.store.refreshBills();
    } catch (err) { this.splitError.set(toApiError(err).message); }
  }

  protected openMerge(): void {
    this.splitError.set(null);
    this.dialog.set('merge');
  }

  protected async submitMerge(sourceId: string): Promise<void> {
    this.splitError.set(null);
    try {
      await this.store.serverAction((id) => firstValueFrom(this.ordersApi.merge(id, sourceId)), 'Merging bills');
      this.dialog.set(null);
      this.toast.success('Bills merged.');
      await this.store.refreshBills();
    } catch (err) { this.splitError.set(toApiError(err).message); }
  }

  protected openTransfer(): void {
    this.splitError.set(null);
    this.transferOwner.set('');
    this.transferTable.set(this.store.current()?.tableLabel ?? '');
    this.dialog.set('transfer');
    const branch = this.branches.activeId();
    if (branch) void firstValueFrom(this.ordersApi.handOverTargets(branch)).then((l) => this.handOverTargets.set(l)).catch(() => this.handOverTargets.set([]));
  }

  protected async submitTransfer(): Promise<void> {
    this.splitError.set(null);
    const to = this.transferOwner() || null;
    try {
      await this.store.serverAction((id) => firstValueFrom(this.ordersApi.transfer(id, { tableLabel: this.transferTable().trim() || null, newOwnerMembershipId: to })), 'Moving a bill');
      this.dialog.set(null);
      if (to) this.toast.success(`Handed over to ${this.handOverTargets().find((p) => p.id === to)?.name ?? 'your colleague'}.`);
      await this.store.refreshBills();
    } catch (err) { this.splitError.set(toApiError(err).message); }
  }

  // ---- bar man method: payment before the bar has confirmed ----
  protected openUnlock(): void {
    this.voidError.set(null);
    this.authorizer.set(null);
    this.dialog.set('unlock');
  }

  protected async submitUnlock(): Promise<void> {
    const authorizer = this.authorizer();
    if (!authorizer || this.voiding()) return;
    this.voiding.set(true);
    this.voidError.set(null);
    try {
      await this.store.serverAction((id) => firstValueFrom(this.ordersApi.unlockPayment(id, authorizer)), 'Allowing payment');
      this.dialog.set(null);
      this.authorizer.set(null);
      this.toast.success('Payment allowed on this bill.');
    } catch (err) {
      this.voidError.set(toApiError(err).message);
      this.authAttempts.update((n) => n + 1);
    } finally { this.voiding.set(false); }
  }

  // ---- approvals ----
  protected async openApprovals(): Promise<void> {
    this.splitError.set(null);
    this.authorizer.set(null);
    await this.loadApprovals();
    this.dialog.set('approvals');
  }

  private async loadApprovals(): Promise<void> {
    const branchId = this.branches.activeId();
    if (!branchId) return;
    try { this.approvals.set(await firstValueFrom(this.ordersApi.voidRequests({ branchId, status: 'Pending' }))); } catch { /* offline: leave the list */ }
  }

  protected async decide(r: VoidRequestDto, approve: boolean): Promise<void> {
    const authorizer = this.authorizer();
    if (!authorizer) return;
    this.splitError.set(null);
    try {
      await firstValueFrom(this.ordersApi.decideVoid(r.id, approve, null, authorizer));
      await this.loadApprovals();
      if (this.approvals().length === 0) this.dialog.set(null);
      if (this.store.current()?.id === r.orderId) await this.store.reload(r.orderId);
      await this.store.refreshBills();
    } catch (err) {
      this.splitError.set(toApiError(err).message);
      this.authAttempts.update((n) => n + 1);
    }
  }

  // ---- receipt ----
  protected async openReceipt(): Promise<void> {
    const o = this.store.current();
    if (!o) return;
    this.receipt.set(null);
    this.receiptError.set(null);
    this.dialog.set('receipt');
    try {
      await this.syncAgent.flush();
      this.receipt.set(await firstValueFrom(this.ordersApi.receipt(o.id)));
    } catch (err) { this.receiptError.set(toApiError(err).message); }
  }

  protected async reprint(): Promise<void> {
    const o = this.store.current();
    if (!o) return;
    try {
      const printed = await firstValueFrom(this.ordersApi.reprint(o.id));
      this.receipt.set(printed);
      printReceipt(printed);   // the receipt by itself, not the screen around it
    } catch (err) { this.receiptError.set(toApiError(err).message); }
  }
}
