import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { FEATURES, SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { CustomerDto, CustomersApi, LaybysApi } from '../../core/services/customer.services';
import { GiftCardBalanceDto, IssuedGiftCardDto } from '../../core/models/gift-card.model';
import { GiftCardsApi } from '../../core/services/gift-cards.service';
import { GiftCardIssuedComponent } from '../customers/gift-card-issued.component';
import { TableRequestsComponent } from './table-requests.component';
import { BarLineState, OrderKind, OrderLineDto, PaymentMethod, ProductDto, ReceiptDto, SellingUnitDto, VoidAuthorizer, VoidRequestDto, TableDto } from '../../core/models/ops.model';
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
  /** No quantity box: a serial-numbered unit. */
  readonly locked: boolean;
  /** Where the sent units are at the bar, one entry per state with its total. */
  readonly states: readonly { readonly state: BarLineState; readonly station: string | null; readonly quantity: number }[];
  /** The bar handed this line back (it could not make it): the attendant may change its quantity or take it off, with nobody's PIN. */
  readonly back: OrderLineDto | null;
}

const q3 = (value: number): number => Math.round(value * 1000) / 1000;

/** One mark per state and station with its total: "5 waiting at the bar", "2 ready to collect". */
function stateMarks(sent: readonly OrderLineDto[]): readonly { readonly state: BarLineState; readonly station: string | null; readonly quantity: number }[] {
  const order = ['Waiting', 'Preparing', 'Ready', 'Collected', 'CantMake'];
  const marks = new Map<string, { state: BarLineState; station: string | null; quantity: number }>();
  for (const l of sent) {
    if (!l.barState) continue;
    const key = `${l.barState}|${l.stationName ?? ''}`;
    const m = marks.get(key);
    if (m) m.quantity += l.quantity; else marks.set(key, { state: l.barState, station: l.stationName ?? null, quantity: l.quantity });
  }
  return [...marks.values()].sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state)).map((m) => ({ ...m, quantity: q3(m.quantity) })).filter((m) => m.quantity > 0);
}

/** One part of a split payment: how it is paid, how much, and (cash) what was handed over or (card, transfer) its reference. */
interface PayPart { readonly method: PaymentMethod; readonly amount: number; readonly tendered: number; readonly reference: string }

const cents = (value: number): number => Math.round(value * 100) / 100;

type Dialog = 'unlock' | 'new' | 'serial' | 'unit' | 'customer' | 'modifiers' | 'pay' | 'void' | 'discount' | 'split' | 'merge' | 'transfer' | 'receipt' | 'approvals' | 'tip' | 'giftsale' | 'giftissued' | null;

/**
 * Three-panel point of sale: open bills | catalogue | the bill being built. Works offline for everything except card/transfer
 * payments and the bill-structure actions (split, merge, transfer), which need the server and say so.
 * All buttons are UX only; the API re-checks permission, branch and subscription on every call.
 */
@Component({
  selector: 'zp-pos-billing',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, DecimalPipe, FormsModule, DialogComponent, GiftCardIssuedComponent, TableRequestsComponent, StatusBadgeComponent, BranchPickerComponent, SyncStatusComponent, VoidAuthoriserComponent, ReceiptViewComponent, ReceiptShareComponent],
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
          @if (canCreate()) { <zp-table-requests [branchId]="branches.activeId()" [online]="online()" [currency]="store.currency()" (billChanged)="tableBillAccepted($event)" /> }
          @if (giftCardsOn() && canCreate()) { <button type="button" class="btn-outline px-3 py-1.5 text-sm" data-testid="sell-gift-card" [disabled]="readOnly() || !online()" [attr.title]="online() ? null : 'Gift cards need a connection'" (click)="openGiftSale()">Gift card</button> }
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
                    [attr.data-testid]="'product-' + p.name" [disabled]="!store.current() || readOnly() || !canEdit() || giftSale()" (click)="pick(p)">
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
              @if (o.giftCardAmount) {
                <p class="mt-1 text-sm" data-testid="bill-gift">Gift card{{ o.giftCard?.recipientName ? ' for ' + o.giftCard?.recipientName : '' }}: <strong>{{ o.giftCardAmount | currency: store.currency() : 'symbol-narrow' : '1.2-2' }}</strong>{{ o.giftCard?.last4 ? ', card ends ' + o.giftCard?.last4 : '' }}. This bill holds the card and nothing else; the card is made when it is paid in full.
                  @if (o.status === 'Paid' && o.giftCard?.status === 'Pending') { <button type="button" class="btn-outline ml-1 px-2 py-0 text-sm" data-testid="gift-issue" [disabled]="giftBusy()" (click)="issueGiftCard()">Issue the card</button> }</p>
                @if (giftError()) { <p class="app-error" role="alert">{{ giftError() }}</p> }
              }
              <p class="mt-1 text-sm" data-testid="bill-customer">
                @if (o.customer; as c) { <span class="font-medium">{{ c.name }}</span> <span class="text-ink/70">{{ c.pointsBalance }} points@if (o.pointsEarned) { , {{ o.pointsEarned }} from this bill } @else if (o.pointsOnBill) { , {{ o.pointsOnBill }} more when paid }@if (o.pointsSpent) { , {{ o.pointsSpent }} used on this bill }</span> }
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
                    <!-- One mark per state with its total ("5 waiting at the bar"), however many times the item was sent. -->
                    @for (s of r.states; track s.state + '|' + s.station) {
                      <span class="app-badge" [class]="barTone(s.state)" [attr.data-testid]="'bar-state-' + r.name" [attr.data-quantity]="s.quantity">{{ s.quantity !== 1 || s.quantity !== r.quantity || r.states.length > 1 ? (s.quantity | number: '1.0-3') + ' ' : '' }}{{ barLabel(s.state, s.station) }}</span>
                    }
                    @for (l of r.sent; track l.id) {
                      @if (l.barState) {
                        @if (l.barState === 'CantMake' && l.stockDeducted) { <p class="text-xs font-semibold text-danger" role="status" [attr.data-testid]="'cant-make-' + r.name">The {{ stationWord(l) }} cannot make this: {{ l.barNote }}. Void it to take it off the bill and give the stock back.</p> }
                        @else if (l.barState === 'CantMake') { <p class="text-xs font-semibold text-danger" role="status" [attr.data-testid]="'handed-back-' + r.name">The {{ stationWord(l) }} handed this back: {{ l.barNote }}. Change the quantity or take it off, then Send again.</p> }
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
                    <!-- Only a serial-numbered unit has no quantity box: each unit has its own serial, so it is added again for another one. -->
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
                      @if (canVoid() && r.sentQty > 0 && !r.voidPending) { <button type="button" class="btn-ghost px-2 py-1 text-sm" [attr.data-testid]="'void-' + r.name" (click)="openVoidRow(r)">Void</button> }
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
        @if (form().kind === 'Table') {
          <div><label class="app-label" for="nb-table">Table</label><input id="nb-table" class="app-input" data-testid="nb-table" [placeholder]="tillTables().length ? 'Choose below, or type a name' : ''" [ngModel]="form().table" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ table: $event })" />
            <!-- The branch's own tables: one tap fills the box. A table with a bill running says so; a second bill there is allowed (people who pay separately). -->
            @if (tillTables().length) {
              <div class="mt-2 max-h-48 overflow-y-auto" role="group" aria-label="Tables at this branch" data-testid="nb-tables">
                @for (g of tillTableGroups(); track g.area) {
                  @if (g.area) { <p class="mt-1 text-xs font-semibold text-ink/70">{{ g.area }}</p> }
                  <div class="flex flex-wrap gap-1.5 py-1">
                    @for (t of g.tables; track t.id) {
                      <button type="button" class="btn-outline min-h-11 px-3 py-1 text-sm" [class.ring-2]="form().table.trim().toLowerCase() === t.name.toLowerCase()" [attr.aria-pressed]="form().table.trim().toLowerCase() === t.name.toLowerCase()" [attr.data-testid]="'nb-table-' + t.name" [attr.data-open]="t.openBills" (click)="patch({ table: t.name })">{{ t.name }}@if (t.openBills) { <span class="ml-1 text-xs text-warning">&bull; bill open</span> }</button>
                    }
                  </div>
                }
              </div>
            }
          </div>
        }
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

    <!-- Payment: one payment, or split into parts (each with its own payment type) that must add up to what is due -->
    <zp-dialog [open]="dialog() === 'pay'" title="Take payment" [wide]="true" (closed)="dialog.set(null)">
      @if (store.current(); as o) {
        <div class="space-y-4">
          <p class="text-lg">Balance due: <strong data-testid="pay-due">{{ o.balance | currency: store.currency() : 'symbol-narrow' : '1.2-2' }}</strong>
            @if (payTip() > 0) { <span class="text-sm text-ink/80" data-testid="pay-with-tip"> + tip = {{ toAllocate() | currency: store.currency() : 'symbol-narrow' : '1.2-2' }}</span> }</p>

          @if (!parts().length) {
            <div class="flex flex-wrap gap-2" role="group" aria-label="Payment method">
              @for (m of methods(); track m.method) {
                <button type="button" class="btn-outline" [class.ring-2]="payMethod() === m.method" [attr.data-testid]="'method-' + m.method" (click)="payMethod.set(m.method)">{{ m.label }}</button>
              }
            </div>
          }

          <div class="grid gap-3 sm:grid-cols-2">
            @if (!parts().length) {
              <div><label class="app-label" for="pay-amount">Amount</label><input id="pay-amount" type="number" step="0.01" min="0" class="app-input" data-testid="pay-amount" [ngModel]="payAmount()" (ngModelChange)="payAmount.set(+$event)" /></div>
            }
            <div><label class="app-label" for="pay-tip">Tip (optional)</label><input id="pay-tip" type="number" step="0.01" min="0" class="app-input" data-testid="pay-tip" [ngModel]="payTip()" (ngModelChange)="setPayTip(+$event)" />
              @if (payTip() > 0) { <p class="mt-1 text-xs text-ink/70" data-testid="pay-tip-note">The tip is added to the amount to collect. It is kept for {{ store.current()?.ownerName ?? 'whoever served this bill' }}.</p> }</div>
          </div>

          <div class="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Split the payment">
            <span>Split into:</span>
            @for (n of [2, 3, 4, 5]; track n) { <button type="button" class="btn-ghost px-2 py-1" [class.ring-2]="parts().length === n" [attr.data-testid]="'split-' + n" (click)="startSplit(n)">{{ n }} parts</button> }
            @if (parts().length) { <button type="button" class="btn-ghost px-2 py-1 underline" data-testid="split-off" (click)="parts.set([])">One payment</button> }
          </div>

          @if (parts().length) {
            <div class="space-y-2" data-testid="split-parts">
              <p class="text-sm text-ink/80">Each part can be paid a different way (cash, card, transfer). Change the amounts as the customers are paying; the parts must add up to what is due. <span data-testid="shares">Shares: {{ shareText() }}</span></p>
              @for (p of parts(); track $index) {
                <div class="grid items-end gap-2 rounded-lg border border-ink/15 p-2 sm:grid-cols-[2rem_8rem_1fr_1fr_auto]" [attr.data-testid]="'part-' + $index">
                  <span class="pb-2 text-sm font-semibold" aria-hidden="true">{{ $index + 1 }}</span>
                  <div><label class="app-label" [for]="'pp-m-' + $index">Paid by</label>
                    <select class="app-input" [id]="'pp-m-' + $index" [attr.data-testid]="'part-method-' + $index" [ngModel]="p.method" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchPart($index, { method: $event })">
                      @for (m of methods(); track m.method) { <option [value]="m.method">{{ m.label }}</option> }</select></div>
                  <div><label class="app-label" [for]="'pp-a-' + $index">Amount</label><input type="number" step="0.01" min="0" class="app-input" [id]="'pp-a-' + $index" [attr.data-testid]="'part-amount-' + $index" [ngModel]="p.amount" [ngModelOptions]="{ standalone: true }" (ngModelChange)="setPartAmount($index, +$event)" /></div>
                  @if (p.method === 'Cash') {
                    <div><label class="app-label" [for]="'pp-t-' + $index">Cash handed over</label><input type="number" step="0.01" min="0" class="app-input" [id]="'pp-t-' + $index" [attr.data-testid]="'part-tendered-' + $index" [ngModel]="p.tendered" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchPart($index, { tendered: +$event })" />
                      @if (p.tendered > p.amount) { <p class="mt-0.5 text-xs" [attr.data-testid]="'part-change-' + $index">Change: {{ p.tendered - p.amount | currency: store.currency() : 'symbol-narrow' : '1.2-2' }}</p> }
                      @if (p.tendered < p.amount) { <p class="mt-0.5 text-xs text-danger">Less than the amount.</p> }</div>
                  } @else {
                    <div><label class="app-label" [for]="'pp-r-' + $index">{{ store.settings()?.paymentProviderIsDemo ? 'Payment token' : p.method === 'Card' ? 'Slip or approval number (optional)' : 'Transfer reference (optional)' }}</label>
                      <input class="app-input font-mono" maxlength="60" autocomplete="off" [id]="'pp-r-' + $index" [attr.data-testid]="'part-reference-' + $index" [ngModel]="p.reference" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchPart($index, { reference: $event })" /></div>
                  }
                  <button type="button" class="btn-ghost px-2" [attr.aria-label]="'Remove part ' + ($index + 1)" [attr.data-testid]="'part-remove-' + $index" [disabled]="parts().length <= 2" (click)="removePart($index)">x</button>
                </div>
              }
              <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
                <button type="button" class="btn-outline px-2 py-1" data-testid="part-add" [disabled]="parts().length >= 8" (click)="addPart()">Add a part</button>
                <span [class]="splitLeft() === 0 ? 'font-semibold' : 'font-semibold text-danger'" role="status" data-testid="split-left">
                  @if (splitLeft() === 0) { The parts add up to {{ toAllocate() | currency: store.currency() : 'symbol-narrow' : '1.2-2' }}. }
                  @else if (splitLeft() > 0) { {{ splitLeft() | currency: store.currency() : 'symbol-narrow' : '1.2-2' }} still to share out. }
                  @else { {{ -splitLeft() | currency: store.currency() : 'symbol-narrow' : '1.2-2' }} too much. }
                </span>
              </div>
              @if (splitNeedsOnline() && !online()) { <p class="sys-alert sys-alert-warning" role="status">You are offline. Card and transfer parts need a connection; make them cash or wait until you are back online.</p> }
              @if (!store.settings()?.paymentProviderIsDemo && splitNeedsOnline()) { <p class="text-xs text-ink/70">Take the card and transfer parts on your machine or bank first; confirming here records them, it does not move the money.</p> }
            </div>
          } @else if (payMethod() === 'Cash') {
            <div><label class="app-label" for="pay-tendered">Cash handed over</label><input id="pay-tendered" type="number" step="0.01" min="0" class="app-input" data-testid="pay-tendered" [ngModel]="tendered()" (ngModelChange)="tendered.set(+$event)" />
              <p class="mt-1 text-sm" data-testid="pay-change">Change: {{ change() | currency: store.currency() : 'symbol-narrow' : '1.2-2' }}</p></div>
          } @else if (payMethod() === 'Points') {
            <!-- the points box below says what is needed -->
          } @else if (payMethod() === 'GiftCard') {
            <!-- the gift card box below says what is needed -->
          } @else {
            @if (store.settings()?.paymentProviderIsDemo) {
              <!-- Only when the API runs with the development stub (the automated tests). A business never sees this. -->
              <p class="sys-alert sys-alert-warning" role="status" data-testid="demo-payment-note">Development payment stub: no real money moves. Use token tok_ok (approve), tok_decline or tok_pending.</p>
              <div><label class="app-label" for="pay-token">Payment token</label><input id="pay-token" class="app-input" data-testid="pay-token" [ngModel]="token()" (ngModelChange)="token.set($event)" /></div>
            } @else {
              <p class="text-sm text-ink/80" role="note" data-testid="pay-outside-note">Take this {{ payMethod() === 'Card' ? 'on your card machine' : 'as a bank transfer' }} first. Confirm here once {{ payMethod() === 'Card' ? 'the machine shows it was approved' : 'you have seen the money arrive' }}: this records the payment, it does not move the money.</p>
              <div><label class="app-label" for="pay-reference">{{ payMethod() === 'Card' ? 'Slip or approval number' : 'Transfer reference' }} (optional)</label><input id="pay-reference" class="app-input font-mono" maxlength="60" autocomplete="off" data-testid="pay-reference" [ngModel]="token()" (ngModelChange)="token.set($event)" /></div>
            }
            @if (!online()) { <p class="sys-alert sys-alert-warning" role="status">You are offline. Card and transfer payments need a connection; take cash or wait until you are back online.</p> }
          }

          @if (usesPoints()) {
            <section class="space-y-3 rounded-lg border border-ink/15 p-3" data-testid="points-panel" aria-label="Paying with points">
              @if (o.customer; as c) {
                <p class="text-sm" data-testid="points-balance"><strong>{{ c.name }}</strong> has {{ pointsBalance() | number: '1.0-2' }} points, worth {{ pointsWorth() | currency: store.currency() : 'symbol-narrow' : '1.2-2' }}.
                  One point is worth {{ pointValue() | currency: store.currency() : 'symbol-narrow' : '1.2-4' }}.
                  @if ((store.settings()?.minRedeemPoints ?? 0) > 0) { At least {{ store.settings()?.minRedeemPoints | number: '1.0-2' }} points at a time. }
                  @if ((store.settings()?.maxRedeemPercent ?? 100) < 100) { Points may pay for at most {{ store.settings()?.maxRedeemPercent }}% of a bill. }</p>
                <p class="text-sm" data-testid="points-using">Using {{ pointsToSpend() | number: '1.0-2' }} points ({{ pointsAmount() | currency: store.currency() : 'symbol-narrow' : '1.2-2' }}).</p>
                @if (pointsShort()) { <p class="app-error" role="alert" data-testid="points-short">That is more than the customer has.</p> }
                @if (pointsTipBlocked()) { <p class="app-error" role="alert" data-testid="points-tip-note">A tip cannot be paid with points. Take the tip in cash or by card.</p> }
                @if (c.hasRedemptionCode) {
                  <div class="max-w-xs"><label class="app-label" for="points-code">Customer's own code (4 digits)</label>
                    <input id="points-code" type="password" inputmode="numeric" maxlength="4" autocomplete="one-time-code" data-1p-ignore data-lpignore="true" class="app-input font-mono" data-testid="points-code" [ngModel]="pointsCode()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="pointsCode.set($event)" /></div>
                } @else {
                  <p class="text-sm text-ink/80" data-testid="points-no-code">{{ c.name }} has no code of their own yet. A supervisor can allow this payment with their PIN, or set the customer's code now so the customer allows it themselves next time.</p>
                  <zp-void-authoriser [clearSecret]="pointsAuthAttempts()" (changed)="pointsAuth.set($event)" />
                }
                <button type="button" class="btn-ghost px-1 py-0 text-sm underline" data-testid="points-code-toggle" (click)="codeFormOpen.set(!codeFormOpen())">{{ c.hasRedemptionCode ? "Change the customer's code" : "Set the customer's code" }}</button>
                @if (codeFormOpen()) {
                  <form class="space-y-2 rounded-lg bg-ink/5 p-3" data-testid="points-code-form" (submit)="$event.preventDefault(); saveCode()">
                    <p class="text-sm text-ink/80">The customer types a four-digit code, twice. It is never shown or kept: only a scrambled form of it, so nobody can read it back.</p>
                    <div class="grid gap-2 sm:grid-cols-2">
                      <div><label class="app-label" for="points-new-code">New code</label><input id="points-new-code" type="password" inputmode="numeric" maxlength="4" autocomplete="one-time-code" data-1p-ignore data-lpignore="true" class="app-input font-mono" data-testid="points-new-code" [ngModel]="newCode()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="newCode.set($event)" /></div>
                      <div><label class="app-label" for="points-new-code-again">The same code again</label><input id="points-new-code-again" type="password" inputmode="numeric" maxlength="4" autocomplete="one-time-code" data-1p-ignore data-lpignore="true" class="app-input font-mono" data-testid="points-new-code-again" [ngModel]="newCodeAgain()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="newCodeAgain.set($event)" /></div>
                    </div>
                    @if (c.hasRedemptionCode) {
                      <p class="text-sm text-ink/80">Changing a code that is already set needs a supervisor.</p>
                      <zp-void-authoriser [clearSecret]="codeAuthAttempts()" (changed)="codeAuth.set($event)" />
                    }
                    @if (codeError()) { <p class="app-error" role="alert" data-testid="points-code-error">{{ codeError() }}</p> }
                    <div class="flex justify-end"><button type="submit" class="btn-outline" data-testid="points-code-save" [disabled]="codeBusy() || !online()">{{ codeBusy() ? 'Saving...' : 'Save the code' }}</button></div>
                  </form>
                }
              } @else {
                <p class="sys-alert sys-alert-warning" role="status" data-testid="points-no-customer">Put the customer on the bill (Add customer) to pay with their points.</p>
              }
              @if (!online()) { <p class="sys-alert sys-alert-warning" role="status">You are offline. Points can only be spent with a connection, because the balance has to be checked; take cash or wait until you are back online.</p> }
            </section>
          }

          @if (usesGiftCard()) {
            <section class="space-y-3 rounded-lg border border-ink/15 p-3" data-testid="gift-panel" aria-label="Paying with a gift card">
              <div class="max-w-md"><label class="app-label" for="gift-code">The gift card's code</label>
                <div class="flex gap-2">
                  <input id="gift-code" class="app-input font-mono uppercase tracking-wider" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="24" placeholder="XXXX-XXXX-XXXX-XXXX" data-1p-ignore data-lpignore="true"
                         data-testid="gift-code" [ngModel]="giftCode()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="giftCodeTyped($event)" />
                  <button type="button" class="btn-outline" data-testid="gift-check" [disabled]="giftChecking() || !giftCodeComplete() || !online()" (click)="checkGiftCard()">{{ giftChecking() ? 'Checking...' : 'Check' }}</button>
                </div>
                <p class="mt-1 text-xs text-ink/70">Type the code, or scan its QR code with a scanner that types what it reads.</p></div>
              @if (giftBalance(); as b) {
                <p class="text-sm" data-testid="gift-balance">Card {{ b.number }} (ends {{ b.last4 }}) has <strong>{{ b.balance | currency: b.currencyCode : 'symbol-narrow' : '1.2-2' }}</strong> left@if (b.expiresAtUtc) { , valid until {{ b.expiresAtUtc | date: 'mediumDate' }} }.
                  @if (b.state !== 'Active') { <span class="app-error" data-testid="gift-state"> This card is {{ b.state === 'Used' ? 'used up' : b.state.toLowerCase() }}.</span> }</p>
              }
              @if (giftCheckError()) { <p class="app-error" role="alert" data-testid="gift-check-error">{{ giftCheckError() }}</p> }
              <p class="text-sm" data-testid="gift-using">Taking {{ giftAmount() | currency: store.currency() : 'symbol-narrow' : '1.2-2' }} from the card.</p>
              @if (giftShort()) { <p class="app-error" role="alert" data-testid="gift-short">That is more than is left on the card.</p> }
              @if (giftTipBlocked()) { <p class="app-error" role="alert" data-testid="gift-tip-note">A tip cannot be paid with a gift card. Take the tip in cash or by card.</p> }
              @if (!online()) { <p class="sys-alert sys-alert-warning" role="status">You are offline. A gift card can only be spent with a connection, because its balance has to be checked; take cash or wait until you are back online.</p> }
            </section>
          }

          @if (payError()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="pay-error">{{ payError() }}</p> }
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-ghost" (click)="dialog.set(null)">Cancel</button>
            @if (parts().length) {
              <button type="button" class="btn-primary touch-target" data-testid="pay-confirm" [disabled]="paying() || !splitReady()" (click)="submitSplitPay()">{{ paying() ? 'Processing...' : 'Confirm ' + parts().length + ' payments' }}</button>
            } @else {
              <button type="button" class="btn-primary touch-target" data-testid="pay-confirm" [disabled]="paying() || payAmount() <= 0 || (payMethod() !== 'Cash' && !online()) || !pointsReady() || !giftReady()" (click)="submitPay()">{{ paying() ? 'Processing...' : 'Confirm payment' }}</button>
            }
          </div>
        </div>
      }
    </zp-dialog>

    <!-- Sell a gift card: a bill of its own, paid like any bill; the card and its code come when it is paid in full -->
    <zp-dialog [open]="dialog() === 'giftsale'" title="Sell a gift card" (closed)="dialog.set(null)">
      <form class="space-y-3" (submit)="$event.preventDefault(); startGiftSale()" data-testid="gift-sale-form">
        <p class="text-sm text-ink/80">The card goes on a bill of its own, which you take payment for as usual. When it is paid in full the card is made and its code is shown once, to print for the customer. The money is owed to whoever holds the card until it is spent: it is not a sale.</p>
        <div><label class="app-label" for="gift-amount">What is the card worth?</label><input id="gift-amount" type="number" min="0" step="0.01" class="app-input" data-testid="gift-amount" [ngModel]="giftAmountTyped()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="giftAmountTyped.set(+$event)" /></div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div><label class="app-label" for="gift-name">Given to (optional)</label><input id="gift-name" class="app-input" maxlength="120" data-testid="gift-name" [ngModel]="giftName()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="giftName.set($event)" /></div>
          <div><label class="app-label" for="gift-email">Their e-mail (optional)</label><input id="gift-email" type="email" class="app-input" maxlength="200" data-testid="gift-email" [ngModel]="giftEmail()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="giftEmail.set($event)" /></div>
        </div>
        <div><label class="app-label" for="gift-phone">Their phone (optional)</label><input id="gift-phone" class="app-input" maxlength="40" data-testid="gift-phone" [ngModel]="giftPhone()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="giftPhone.set($event)" />
          <p class="mt-1 text-xs text-ink/70">With an e-mail address the code is also sent to them when the card is issued. A phone number is kept with the card; sending by SMS or WhatsApp is not set up yet.</p></div>
        @if (giftError()) { <p class="app-error" role="alert" data-testid="gift-error">{{ giftError() }}</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Cancel</button><button type="submit" class="btn-primary touch-target" data-testid="gift-start" [disabled]="giftBusy() || giftAmountTyped() <= 0 || !online()">{{ giftBusy() ? 'Opening the bill...' : 'Take payment' }}</button></div>
      </form>
    </zp-dialog>

    <!-- The card that was just issued: the code, once -->
    <zp-dialog [open]="dialog() === 'giftissued'" title="Gift card issued" (closed)="closeGiftIssued()">
      @if (giftIssued(); as card) { <zp-gift-card-issued [card]="card" [companyName]="companyName()" (done)="closeGiftIssued()" /> }
    </zp-dialog>

    <!-- Void -->
    <zp-dialog [open]="dialog() === 'void'" [title]="voidLineId() ? 'Void item' : 'Void whole bill'" (closed)="dialog.set(null)">
      <form class="space-y-3" (submit)="$event.preventDefault(); submitVoid()" data-testid="void-dialog">
        <p class="text-sm text-ink/80">{{ voidLineId() ? 'The item is removed from the bill' : 'Every item is removed and the bill is closed as voided' }} as soon as a supervisor or an administrator authorises it. Stock is returned unless it was thrown away. The void is recorded with who asked and who authorised it.</p>
        @if (!online()) { <p class="sys-alert sys-alert-warning" role="status" data-testid="void-offline">A void needs a connection: the authoriser's details are checked by the server. Try again when this device is back online.</p> }
        @if (voidRow(); as vr) {
          @if (vr.sentQty > 1 && !vr.first.serialNumber) {
            <div><label class="app-label" for="void-qty">How many {{ vr.name }} to void?</label>
              <div class="flex items-center gap-2">
                <button type="button" class="btn-outline h-10 w-10 p-0" aria-label="Fewer" [disabled]="voidQty() <= 1" (click)="voidQty.set(voidQty() - 1 < 1 ? voidQty() : voidQty() - 1)">-</button>
                <input id="void-qty" type="number" inputmode="decimal" min="0" [max]="vr.sentQty" step="any" class="app-input h-10 w-24 text-center" data-testid="void-quantity" [ngModel]="voidQty()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="voidQty.set(+$event)" />
                <button type="button" class="btn-outline h-10 w-10 p-0" aria-label="More" [disabled]="voidQty() >= vr.sentQty" (click)="voidQty.set(voidQty() + 1 > vr.sentQty ? vr.sentQty : voidQty() + 1)">+</button>
                <span class="text-sm text-ink/80">of {{ vr.sentQty }} sent</span>
              </div>
              @if (voidQty() <= 0 || voidQty() > vr.sentQty) { <p class="app-error" role="alert">Between 1 and {{ vr.sentQty }}.</p> }
            </div>
          }
        }
        <div><label class="app-label" for="void-reason">Reason</label><input id="void-reason" class="app-input" data-testid="void-reason" [ngModel]="voidReason()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="voidReason.set($event)" /></div>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" data-testid="void-wasted" [checked]="voidWasted()" (change)="voidWasted.set(!voidWasted())" /> It was made and thrown away (keep the stock used)</label>
        @if (dialog() === 'void') { <zp-void-authoriser [clearSecret]="authAttempts()" (changed)="authorizer.set($event)" /> }
        @if (voidError()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="void-error">{{ voidError() }}</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Cancel</button><button type="submit" class="btn-primary touch-target" data-testid="void-confirm" [disabled]="voiding() || !online() || voidReason().trim().length < 3 || !authorizer() || (voidRow() !== null && (voidQty() <= 0 || voidQty() > voidRow()!.sentQty))">{{ voiding() ? 'Checking...' : voidLineId() ? 'Void item' : 'Void bill' }}</button></div>
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

  // Gift cards: sold on a bill of their own, spent with the card's code. The code is typed for this payment only and is never kept.
  protected readonly giftApi = inject(GiftCardsApi);
  protected readonly giftAmountTyped = signal(0);
  protected readonly giftName = signal('');
  protected readonly giftEmail = signal('');
  protected readonly giftPhone = signal('');
  protected readonly giftBusy = signal(false);
  protected readonly giftError = signal<string | null>(null);
  protected readonly giftIssued = signal<IssuedGiftCardDto | null>(null);
  protected readonly giftCode = signal('');
  protected readonly giftBalance = signal<GiftCardBalanceDto | null>(null);
  protected readonly giftChecking = signal(false);
  protected readonly giftCheckError = signal<string | null>(null);

  // Loyalty points as a way to pay: the customer's own code, or a supervisor, allows each spending. Kept only while the box is open.
  protected readonly pointsCode = signal('');
  protected readonly pointsAuth = signal<VoidAuthorizer | null>(null);
  protected readonly pointsAuthAttempts = signal(0);
  protected readonly codeFormOpen = signal(false);
  protected readonly newCode = signal('');
  protected readonly newCodeAgain = signal('');
  protected readonly codeAuth = signal<VoidAuthorizer | null>(null);
  protected readonly codeAuthAttempts = signal(0);
  protected readonly codeBusy = signal(false);
  protected readonly codeError = signal<string | null>(null);

  protected readonly voidLineId = signal<string | null>(null);
  /** The row being voided (so many of its sent units), or null for a single line or the whole bill. */
  protected readonly voidRow = signal<BillRow | null>(null);
  protected readonly voidQty = signal(1);
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
    // The server says which lines wait on a station that holds payment (holdsPayment); a kitchen's lines never do.
    const unsent = lines.find((l) => l.holdsPayment && !l.confirmed);
    if (unsent) return `Send this bill to the ${this.stationWord(unsent)} first. Payment is taken once the ${this.stationWord(unsent)} has marked the order ready.`;
    const refused = lines.filter((l) => l.barState === 'CantMake');
    if (refused.length) return `The ${this.stationWord(refused[0]!)} could not make ${[...new Set(refused.map((l) => l.productName))].join(', ')}. Change its quantity or take it off before taking payment.`;
    const waiting = lines.find((l) => l.holdsPayment && (l.barState === 'Waiting' || l.barState === 'Preparing'));
    if (waiting) return `Waiting for the ${this.stationWord(waiting)}: payment is taken once it marks this order ready.`;
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
      const key = l.barState === 'CantMake' && !l.stockDeducted ? `back:${l.id}` : lineKey(l);   // what a station handed back before any stock left is a row of its own
      const list = groups.get(key);
      if (list) list.push(l); else groups.set(key, [l]);
    }
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
        locked: !!first.serialNumber,
        states: stateMarks(sent),
        back: first.barState === 'CantMake' && !first.stockDeducted ? first : null
      };
    });
  });
  protected readonly mergeCandidates = computed(() => this.store.bills().filter((b) => b.id !== this.store.current()?.id && !b.numberPending));
  protected readonly change = computed(() => Math.max(0, Math.round((this.tendered() - this.payAmount()) * 100) / 100));
  /** A split payment in the making; empty when the bill is paid in one go. */
  protected readonly parts = signal<readonly PayPart[]>([]);
  protected readonly shareText = computed(() => this.parts().map((p) => p.amount.toFixed(2)).join(' + '));
  /** What the parts must add up to: the balance, and the tip when one was typed. */
  protected readonly toAllocate = computed(() => cents((this.store.current()?.balance ?? 0) + this.payTip()));
  /** Positive: still to share out. Negative: the parts are too much. Zero: they balance. */
  protected readonly splitLeft = computed(() => cents(this.toAllocate() - this.parts().reduce((sum, p) => sum + p.amount, 0)));
  protected readonly splitNeedsOnline = computed(() => this.parts().some((p) => p.method !== 'Cash'));
  protected readonly splitReady = computed(() => this.parts().length >= 2 && this.splitLeft() === 0 && this.parts().every((p) => p.amount > 0 && (p.method !== 'Cash' || p.tendered >= p.amount))
    && (!this.splitNeedsOnline() || this.online()) && this.pointsReady() && this.giftReady());

  // ---- gift cards ----
  protected readonly giftCardsOn = computed(() => this.auth.accessModeFor(FEATURES.LOYALTY_GIFT_CARDS) === 'full');
  protected readonly companyName = computed(() => this.auth.branding()?.companyName ?? '');
  /** The bill sells a gift card: it holds the card and nothing else, and it is paid through the server, which makes the card when it is paid in full. */
  protected readonly giftSale = computed(() => (this.store.current()?.giftCardAmount ?? 0) > 0);
  protected readonly usesGiftCard = computed(() => (this.parts().length ? this.parts().some((p) => p.method === 'GiftCard') : this.payMethod() === 'GiftCard'));
  protected readonly giftCodeComplete = computed(() => this.giftCode().replace(/[^A-Za-z0-9]/g, '').length === 16);
  protected readonly giftAmount = computed(() => cents(this.parts().length ? this.parts().filter((p) => p.method === 'GiftCard').reduce((sum, p) => sum + p.amount, 0) : this.payMethod() === 'GiftCard' ? this.payAmount() : 0));
  protected readonly giftShort = computed(() => { const b = this.giftBalance(); return b !== null && this.giftAmount() > b.balance; });
  protected readonly giftTipBlocked = computed(() => this.payTip() > 0 && (this.parts().length ? this.parts()[0]?.method === 'GiftCard' : this.payMethod() === 'GiftCard'));
  protected readonly giftReady = computed(() => !this.usesGiftCard() || (this.giftCodeComplete() && this.giftAmount() > 0 && !this.giftShort() && !this.giftTipBlocked()));

  // ---- paying with points ----
  protected readonly pointValue = computed(() => this.store.settings()?.pointValue ?? 0);
  /** Points can be spent when the company has said what a point is worth and its plan includes loyalty spending. */
  protected readonly pointsAvailable = computed(() => this.pointValue() > 0 && this.auth.accessModeFor(FEATURES.LOYALTY_GIFT_CARDS) === 'full');
  protected readonly usesPoints = computed(() => (this.parts().length ? this.parts().some((p) => p.method === 'Points') : this.payMethod() === 'Points'));
  protected readonly pointsBalance = computed(() => this.store.current()?.customer?.pointsBalance ?? 0);
  protected readonly pointsWorth = computed(() => cents(this.pointsBalance() * this.pointValue()));
  /** How much of this payment is to be paid with points (money), and how many points that is. */
  protected readonly pointsAmount = computed(() => cents(this.parts().length ? this.parts().filter((p) => p.method === 'Points').reduce((sum, p) => sum + p.amount, 0) : this.payMethod() === 'Points' ? this.payAmount() : 0));
  protected readonly pointsToSpend = computed(() => (this.pointValue() > 0 ? Math.round((this.pointsAmount() / this.pointValue()) * 100) / 100 : 0));
  protected readonly pointsShort = computed(() => this.pointsAmount() > this.pointsWorth());
  /** The tip goes with the first payment; it cannot be paid with points. */
  protected readonly pointsTipBlocked = computed(() => this.payTip() > 0 && (this.parts().length ? this.parts()[0]?.method === 'Points' : this.payMethod() === 'Points'));
  protected readonly pointsReady = computed(() => {
    if (!this.usesPoints()) return true;
    const c = this.store.current()?.customer;
    if (!c || this.pointsAmount() <= 0 || this.pointsShort() || this.pointsTipBlocked()) return false;
    return c.hasRedemptionCode ? /^\d{4}$/.test(this.pointsCode()) : this.pointsAuth() !== null;
  });


  protected readonly methods = computed(() => {
    const s = this.store.settings();
    const all: { method: PaymentMethod; label: string; on: boolean }[] = [
      { method: 'Cash', label: 'Cash', on: s?.allowCashPayments ?? true },
      { method: 'Card', label: 'Card', on: s?.allowCardPayments ?? true },
      { method: 'Transfer', label: 'Transfer', on: s?.allowTransferPayments ?? true },
      { method: 'Points', label: 'Points', on: this.pointsAvailable() && !this.giftSale() },
      { method: 'GiftCard', label: 'Gift card', on: this.giftCardsOn() && !this.giftSale() }
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

  protected barLabel(state: BarLineState, station: string | null = null): string {
    const where = (station ?? 'bar').toLowerCase();
    return { Waiting: `waiting at the ${where}`, Preparing: 'being prepared', Ready: 'ready to collect', Collected: 'served', CantMake: `${where} can't make this` }[state];
  }

  /** The station a line goes to, for a sentence ("the bar", "the kitchen"). */
  protected stationWord(l: OrderLineDto): string { return (l.stationName ?? 'bar').toLowerCase(); }

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

  /** The branch's tables, offered when a table bill is opened. Kept from the last time they were read, so the box still has them offline. */
  protected readonly tillTables = signal<readonly TableDto[]>([]);
  protected readonly tillTableGroups = computed(() => {
    const groups = new Map<string, TableDto[]>();
    for (const t of this.tillTables()) { const k = t.area ?? ''; const list = groups.get(k); if (list) list.push(t); else groups.set(k, [t]); }
    return [...groups.entries()].map(([area, tables]) => ({ area, tables }));
  });

  protected openNew(): void {
    this.form.set({ kind: 'Tab', label: '', table: '' });
    this.dialog.set('new');
    const branch = this.branches.activeId();
    // Read in the background: the box opens at once, and a failure (offline) simply leaves the last list.
    if (branch) void firstValueFrom(this.ordersApi.tables(branch)).then((list) => this.tillTables.set(list)).catch(() => undefined);
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
    const lines = r.locked ? r.unsent.slice(-1) : r.unsent;   // a serial-numbered unit comes off one at a time
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
    this.token.set(this.store.settings()?.paymentProviderIsDemo ? 'tok_ok' : '');
    this.payError.set(null);
    this.shares.set([]);
    this.parts.set([]);
    this.resetPoints();
    this.resetGift();
    this.dialog.set('pay');
  }

  /** A card's code and what was found out about it are gone as soon as the box opens afresh or the payment is done. */
  private resetGift(): void {
    this.giftCode.set('');
    this.giftBalance.set(null);
    this.giftCheckError.set(null);
  }

  protected giftCodeTyped(text: string): void {
    this.giftCode.set(text);
    this.giftBalance.set(null);
    this.giftCheckError.set(null);
  }

  protected async checkGiftCard(): Promise<void> {
    if (this.giftChecking() || !this.giftCodeComplete()) return;
    this.giftChecking.set(true);
    this.giftCheckError.set(null);
    this.giftBalance.set(null);
    try { this.giftBalance.set(await firstValueFrom(this.giftApi.balance(this.giftCode()))); }
    catch (err) { const e = toApiError(err); this.giftCheckError.set(e.status === 404 ? 'That code is not right. Check it and try again.' : e.message); }
    finally { this.giftChecking.set(false); }
  }

  /** Opens the bill for a gift card, then takes payment for it like any bill. Needs a connection: the server makes the card. */
  /** Items from a table were put on a bill: it is read again and opened, so the waiter sees them and can send them. */
  protected async tableBillAccepted(orderId: string): Promise<void> {
    await this.store.refreshBills();
    await this.select(orderId);
  }

  protected openGiftSale(): void {
    this.giftAmountTyped.set(0);
    this.giftName.set('');
    this.giftEmail.set('');
    this.giftPhone.set('');
    this.giftError.set(null);
    this.dialog.set('giftsale');
  }

  protected async startGiftSale(): Promise<void> {
    const branchId = this.branches.activeId();
    if (this.giftBusy() || !branchId || this.giftAmountTyped() <= 0) return;
    this.giftBusy.set(true);
    this.giftError.set(null);
    try {
      const server = await firstValueFrom(this.giftApi.startSale({
        orderId: crypto.randomUUID(), branchId, amount: this.giftAmountTyped(),
        recipientName: this.giftName().trim() || null, recipientEmail: this.giftEmail().trim() || null, recipientPhone: this.giftPhone().trim() || null
      }));
      await this.store.openServerBill(server);
      this.dialog.set(null);
      await this.openPay();
    } catch (err) { this.giftError.set(toApiError(err).message); }
    finally { this.giftBusy.set(false); }
  }

  /** For a gift card bill that was paid but whose card was not made with the payment: makes it now and shows the code once. */
  protected async issueGiftCard(): Promise<void> {
    const o = this.store.current();
    if (!o || this.giftBusy()) return;
    this.giftBusy.set(true);
    this.giftError.set(null);
    try {
      const server = await firstValueFrom(this.giftApi.issue(o.id));
      await this.store.reload(o.id);
      this.showIssued(server.issuedGiftCards);
    } catch (err) { this.giftError.set(toApiError(err).message); }
    finally { this.giftBusy.set(false); }
  }

  private showIssued(cards: readonly IssuedGiftCardDto[] | null | undefined): void {
    const card = cards?.[0];
    if (!card) { this.dialog.set(null); return; }
    this.giftIssued.set(card);
    this.dialog.set('giftissued');
  }

  /** Nothing of the code stays on the screen once the box is closed. */
  protected closeGiftIssued(): void {
    this.giftIssued.set(null);
    this.dialog.set(null);
  }

  /** Nothing typed for a points payment is kept once the box opens afresh or the payment is done. */
  private resetPoints(): void {
    this.pointsCode.set('');
    this.pointsAuth.set(null);
    this.pointsAuthAttempts.update((n) => n + 1);
    this.codeFormOpen.set(false);
    this.newCode.set('');
    this.newCodeAgain.set('');
    this.codeAuth.set(null);
    this.codeAuthAttempts.update((n) => n + 1);
    this.codeError.set(null);
  }

  /** What proves the customer agreed to spend points: their own code when they have one, otherwise a supervisor typing their details. */
  private pointsConsent(): { customerCode: string | null; authorizer: VoidAuthorizer | null } {
    return this.store.current()?.customer?.hasRedemptionCode ? { customerCode: this.pointsCode(), authorizer: null } : { customerCode: null, authorizer: this.pointsAuth() };
  }

  /** The customer's own code is set (or, with a supervisor, changed) at the till; the bill is read again so the till knows it exists. */
  protected async saveCode(): Promise<void> {
    const o = this.store.current();
    const c = o?.customer;
    if (!o || !c || this.codeBusy()) return;
    if (!/^\d{4}$/.test(this.newCode())) { this.codeError.set('The code is four digits.'); return; }
    if (this.newCode() !== this.newCodeAgain()) { this.codeError.set('The two codes are not the same.'); return; }
    this.codeBusy.set(true);
    this.codeError.set(null);
    try {
      await firstValueFrom(this.customersApi.setRedemptionCode(c.id, { code: this.newCode(), branchId: o.branchId, authorizer: c.hasRedemptionCode ? this.codeAuth() : null }));
      await this.store.reload(o.id);
      this.resetPoints();
      this.toast.success("The customer's code is set.");
    } catch (err) {
      this.codeError.set(toApiError(err).message);
      this.codeAuthAttempts.update((n) => n + 1);
    } finally { this.codeBusy.set(false); }
  }

  /** A tip is collected with the payment, so the amount to take (and the cash expected) goes up by it. */
  protected setPayTip(tip: number): void {
    const o = this.store.current();
    if (!o) return;
    const clean = Number.isFinite(tip) && tip > 0 ? Math.round(tip * 100) / 100 : 0;
    if (this.parts().length) {
      // In a split, the tip is one more thing to share out: the last part takes it.
      const change = clean - this.payTip();
      this.payTip.set(clean);
      this.parts.update((list) => list.map((x, n) => (n === list.length - 1 ? { ...x, amount: Math.max(0, cents(x.amount + change)), tendered: x.method === 'Cash' ? Math.max(0, cents(x.amount + change)) : x.tendered } : x)));
      return;
    }
    const before = this.payAmount() - this.payTip();
    this.payTip.set(clean);
    const amount = Math.round((Math.max(0, before) + clean) * 100) / 100;
    this.payAmount.set(amount);
    this.tendered.set(amount);
  }

  private blankReference(): string { return this.store.settings()?.paymentProviderIsDemo ? 'tok_ok' : ''; }

  /** Splits what is due into equal parts that add up exactly; each starts as the method chosen above and can then be changed. */
  protected startSplit(n: number): void {
    if (!this.store.current()) return;
    const method = this.methods().some((m) => m.method === this.payMethod()) ? this.payMethod() : this.methods()[0]?.method ?? 'Cash';
    this.payError.set(null);
    this.parts.set(splitEvenly(this.toAllocate(), n).map((amount) => ({ method, amount, tendered: amount, reference: this.blankReference() })));
  }

  protected patchPart(i: number, p: Partial<PayPart>): void {
    this.parts.update((list) => list.map((x, n) => (n === i ? { ...x, ...p } : x)));
  }

  /**
   * A part's amount is typed: the last part takes up the difference so the parts keep adding up (unless it is the last part being
   * typed, or that would make it negative; then the line under the parts says how much is over or still to share).
   */
  protected setPartAmount(i: number, value: number): void {
    const amount = Number.isFinite(value) && value > 0 ? cents(value) : 0;
    this.parts.update((list) => {
      const next = list.map((x, n) => (n === i ? { ...x, amount, tendered: x.method === 'Cash' ? amount : x.tendered } : x));
      const last = next.length - 1;
      if (i === last) return next;
      const rest = cents(this.toAllocate() - next.slice(0, last).reduce((sum, x) => sum + x.amount, 0));
      return rest < 0 ? next : next.map((x, n) => (n === last ? { ...x, amount: rest, tendered: x.method === 'Cash' ? rest : x.tendered } : x));
    });
  }

  protected addPart(): void {
    const left = Math.max(0, this.splitLeft());
    this.parts.update((list) => [...list, { method: list[list.length - 1]?.method ?? 'Cash', amount: left, tendered: left, reference: this.blankReference() }]);
  }

  protected removePart(i: number): void {
    this.parts.update((list) => {
      const gone = list[i]!.amount;
      const next = list.filter((_, n) => n !== i);
      const last = next.length - 1;
      return next.map((x, n) => (n === last ? { ...x, amount: cents(x.amount + gone), tendered: x.method === 'Cash' ? cents(x.amount + gone) : x.tendered } : x));
    });
  }

  /**
   * Records every part, one after another. A part that is recorded is taken off the list at once, so if a later one fails (a card
   * declined, the connection lost) the box stays open with exactly what is still to pay and nothing is taken twice.
   */
  protected async submitSplitPay(): Promise<void> {
    if (!this.store.current() || !this.splitReady() || this.paying()) return;
    this.paying.set(true);
    this.payError.set(null);
    const count = this.parts().length;
    let done = 0;
    let issued: readonly IssuedGiftCardDto[] | null | undefined = null;
    try {
      while (this.parts().length > 0) {
        const part = this.parts()[0]!;
        const tip = this.payTip();   // the tip goes with the first part; after that it is part of the balance
        if (part.method === 'Cash' && !this.giftSale()) await this.store.payCash(part.amount, part.tendered, tip);
        else {
          const server = await this.store.payOnline({
            method: part.method, amount: part.amount, tip, token: part.reference.trim() || null, cashTendered: part.method === 'Cash' ? part.tendered : null,
            ...(part.method === 'Points' ? this.pointsConsent() : {}), ...(part.method === 'GiftCard' ? { giftCardCode: this.giftCode() } : {})
          });
          if (server.issuedGiftCards?.length) issued = server.issuedGiftCards;
        }
        done++;
        this.payTip.set(0);
        this.parts.update((list) => list.slice(1));
      }
      this.resetPoints();
      this.resetGift();
      this.toast.success(`${count} payments recorded.`);
      this.showIssued(issued);
    } catch (err) {
      this.refusedPoints();
      this.refusedGift();
      const why = err instanceof Error && !('status' in err) ? err.message : toApiError(err).message;
      this.payError.set(done > 0 ? `${done} of ${count} payments were recorded. The next one was not: ${why} What is listed below is still to pay.` : why);
    } finally {
      this.paying.set(false);
    }
  }

  /** A refused gift card payment leaves no code sitting in the box: it is typed again. */
  private refusedGift(): void {
    if (this.usesGiftCard()) this.giftCode.set('');
  }

  /** A refused points payment leaves no code or PIN sitting in the boxes: they are typed again. */
  private refusedPoints(): void {
    if (!this.usesPoints()) return;
    this.pointsCode.set('');
    this.pointsAuthAttempts.update((n) => n + 1);
  }

  protected async submitPay(): Promise<void> {
    const o = this.store.current();
    if (!o) return;
    this.paying.set(true);
    this.payError.set(null);
    try {
      let issued: readonly IssuedGiftCardDto[] | null | undefined = null;
      if (this.payMethod() === 'Cash' && !this.giftSale()) {
        if (this.tendered() < this.payAmount()) throw new Error('The cash handed over is less than the payment.');
        await this.store.payCash(this.payAmount(), this.tendered(), this.payTip());
      } else {
        if (this.payMethod() === 'Cash' && this.tendered() < this.payAmount()) throw new Error('The cash handed over is less than the payment.');
        const server = await this.store.payOnline({
          method: this.payMethod(), amount: this.payAmount(), tip: this.payTip(), token: this.token().trim() || null, cashTendered: this.payMethod() === 'Cash' ? this.tendered() : null,
          ...(this.payMethod() === 'Points' ? this.pointsConsent() : {}), ...(this.payMethod() === 'GiftCard' ? { giftCardCode: this.giftCode() } : {})
        });
        issued = server.issuedGiftCards;
      }
      this.resetPoints();
      this.resetGift();
      this.toast.success('Payment recorded.');
      if (issued?.length) this.showIssued(issued); else this.dialog.set(null);
    } catch (err) {
      this.refusedPoints();
      this.refusedGift();
      this.payError.set(err instanceof Error && !('status' in err) ? err.message : toApiError(err).message);
    } finally {
      this.paying.set(false);
    }
  }

  // ---- void / discount / tip ----
  /** A line id voids that item; null voids the whole bill. */
  /** Void on a row: asks how many of what was sent (one, when only one was). */
  protected openVoidRow(r: BillRow): void {
    this.openVoid(r.sent[r.sent.length - 1]?.id ?? null);
    this.voidRow.set(r);
    this.voidQty.set(r.sentQty > 1 ? 1 : r.sentQty);
  }

  protected openVoid(lineId: string | null): void {
    this.voidRow.set(null);
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
      const row = this.voidRow();
      if (row) await this.store.voidUnits(row.sent, this.voidQty(), this.voidReason().trim(), this.voidWasted(), authorizer);
      else await this.store.voidWithAuthoriser(this.voidLineId(), this.voidReason().trim(), this.voidWasted(), authorizer);
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
