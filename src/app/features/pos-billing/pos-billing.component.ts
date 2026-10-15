import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { FEATURES, SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { OrderKind, PaymentMethod, ProductDto, ReceiptDto, VoidRequestDto } from '../../core/models/ops.model';
import { splitEvenly } from '../../core/offline/order-calc';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { BranchContextService } from '../../core/services/branch-context.service';
import { OrdersApi } from '../../core/services/ops.services';
import { PosStore } from '../../core/services/pos-store.service';
import { SyncAgentService } from '../../core/services/sync-agent.service';
import { DialogComponent, ToastService } from '../../shared/ui/feedback';
import { BranchPickerComponent, SyncStatusComponent } from '../../shared/ui/ops-chrome.components';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';

type Dialog = 'new' | 'serial' | 'modifiers' | 'pay' | 'void' | 'discount' | 'split' | 'merge' | 'transfer' | 'receipt' | 'approvals' | 'tip' | null;

/**
 * Three-panel point of sale: open bills | catalogue | the bill being built. Works offline for everything except card/transfer
 * payments and the bill-structure actions (split, merge, transfer), which need the server and say so.
 * All buttons are UX only; the API re-checks permission, branch and subscription on every call.
 */
@Component({
  selector: 'zp-pos-billing',
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe, FormsModule, DialogComponent, StatusBadgeComponent, BranchPickerComponent, SyncStatusComponent],
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
        @if (canApproveVoid()) {
          <button type="button" class="btn-outline mt-2 text-sm" data-testid="open-approvals" (click)="openApprovals()">Void requests @if (approvals().length) { ({{ approvals().length }}) }</button>
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
            </div>
            <zp-status-badge [tone]="o.status === 'Paid' ? 'success' : o.status === 'Open' || o.status === 'PartiallyPaid' ? 'primary' : 'danger'"><span data-testid="bill-status">{{ o.status }}</span></zp-status-badge>
          </div>

          <ul class="mb-3 max-h-[22rem] flex-1 space-y-1 overflow-auto" data-testid="bill-lines">
            @for (l of o.lines; track l.id) {
              @if (l.status === 'Active') {
                <li class="rounded-lg border border-ink/10 p-2" [attr.data-testid]="'line-' + l.productName">
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <p class="font-medium">{{ l.productName }}</p>
                      @if (l.serialNumber) { <p class="font-mono text-xs text-ink/70">S/N {{ l.serialNumber }}</p> }
                      @for (m of l.modifiers; track m.id) { <p class="text-xs text-ink/70">+ {{ m.name }}</p> }
                      @if (l.confirmed) { <span class="app-badge app-badge-success">sent</span> }
                      @if (l.voidPending) { <span class="app-badge app-badge-warning">void awaiting approval</span> }
                    </div>
                    <span class="font-semibold">{{ l.lineTotal | currency: store.currency() : 'symbol-narrow' : '1.2-2' }}</span>
                  </div>
                  @if (canEdit() && !readOnly()) {
                    <div class="mt-1 flex items-center gap-1">
                      @if (!l.confirmed) {
                        <button type="button" class="btn-outline h-8 w-8 p-0" aria-label="Fewer" (click)="qty(l.id, l.quantity - 1)">-</button>
                        <span class="w-8 text-center" data-testid="line-qty">{{ l.quantity }}</span>
                        <button type="button" class="btn-outline h-8 w-8 p-0" aria-label="More" (click)="qty(l.id, l.quantity + 1)">+</button>
                        <button type="button" class="btn-ghost ml-auto px-2 py-1 text-sm" (click)="qty(l.id, 0)">Remove</button>
                      } @else {
                        <span class="w-8 text-center">x{{ l.quantity }}</span>
                        @if (canVoid() && !l.voidPending) { <button type="button" class="btn-ghost ml-auto px-2 py-1 text-sm" [attr.data-testid]="'void-' + l.productName" (click)="openVoid(l.id)">Void</button> }
                      }
                    </div>
                  }
                </li>
              }
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
              @if (canSplit()) { <button type="button" class="btn-outline" (click)="dialog.set('transfer')">Move / hand over</button> }
              @if (canPay() && o.balance > 0) { <button type="button" class="btn-primary col-span-2 touch-target" data-testid="pay" (click)="openPay()">Pay {{ o.balance | currency: store.currency() : 'symbol-narrow' : '1.2-2' }}</button> }
            }
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
    <zp-dialog [open]="dialog() === 'void'" title="Void item" (closed)="dialog.set(null)">
      <form class="space-y-3" (submit)="$event.preventDefault(); submitVoid()">
        <p class="text-sm text-ink/80">@if (canApproveVoid()) { The item is removed now and stock is returned unless it was wasted. } @else { A manager must approve this before it takes effect. }</p>
        <div><label class="app-label" for="void-reason">Reason</label><input id="void-reason" class="app-input" data-testid="void-reason" [ngModel]="voidReason()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="voidReason.set($event)" /></div>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" data-testid="void-wasted" [checked]="voidWasted()" (change)="voidWasted.set(!voidWasted())" /> It was made and thrown away (keep the stock used)</label>
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="void-confirm" [disabled]="voidReason().trim().length < 3">{{ canApproveVoid() ? 'Void item' : 'Request void' }}</button></div>
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
        @if (splitError()) { <p class="sys-alert sys-alert-danger" role="alert">{{ splitError() }}</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="transfer-save">Move</button></div>
      </form>
    </zp-dialog>

    <!-- Void approvals -->
    <zp-dialog [open]="dialog() === 'approvals'" title="Void requests waiting for approval" [wide]="true" (closed)="dialog.set(null)">
      <ul class="space-y-2">
        @for (r of approvals(); track r.id) {
          <li class="app-card flex items-start justify-between gap-3" [attr.data-testid]="'void-request-' + r.orderNumber">
            <div><p class="font-medium">Bill #{{ r.orderNumber }}: {{ r.lineName ?? 'whole bill' }}</p><p class="text-sm text-ink/80">{{ r.reason }}</p></div>
            <div class="flex gap-2"><button type="button" class="btn-outline px-2 py-1 text-sm" (click)="decide(r, false)">Reject</button><button type="button" class="btn-primary px-2 py-1 text-sm" data-testid="void-approve" (click)="decide(r, true)">Approve</button></div>
          </li>
        } @empty { <li class="text-ink/70">Nothing waiting.</li> }
      </ul>
      @if (splitError()) { <p class="sys-alert sys-alert-danger mt-2" role="alert">{{ splitError() }}</p> }
    </zp-dialog>

    <!-- Receipt -->
    <zp-dialog [open]="dialog() === 'receipt'" title="Receipt" (closed)="dialog.set(null)">
      @if (receipt(); as r) {
        <article class="mx-auto max-w-xs rounded-md bg-white p-4 font-mono text-xs leading-5 text-slate-900" data-testid="receipt-view" id="receipt-print">
          <p class="text-center text-sm font-bold">{{ r.companyName }}</p>
          @if (r.tagline) { <p class="text-center">{{ r.tagline }}</p> }
          @if (r.header) { <p class="whitespace-pre-line text-center">{{ r.header }}</p> }
          <p class="text-center">{{ r.branchName }}</p>
          <p class="text-center">Receipt #{{ r.number }}, bill #{{ r.orderNumber }}</p>
          <hr class="my-2 border-dashed border-slate-400" />
          @for (l of r.lines; track $index) { <p class="flex justify-between gap-2"><span>{{ l.quantity }} x {{ l.name }}</span><span>{{ l.lineTotal | currency: r.currencyCode : 'symbol-narrow' : '1.2-2' }}</span></p> }
          <hr class="my-2 border-dashed border-slate-400" />
          <p class="flex justify-between"><span>Subtotal</span><span>{{ r.subtotal | currency: r.currencyCode : 'symbol-narrow' : '1.2-2' }}</span></p>
          @if (r.discounts > 0) { <p class="flex justify-between"><span>Discounts</span><span>-{{ r.discounts | currency: r.currencyCode : 'symbol-narrow' : '1.2-2' }}</span></p> }
          <p class="flex justify-between"><span>{{ r.taxName }} {{ r.taxRatePercent }}%{{ r.taxInclusive ? ' (incl.)' : '' }}</span><span>{{ r.tax | currency: r.currencyCode : 'symbol-narrow' : '1.2-2' }}</span></p>
          @if (r.tip > 0) { <p class="flex justify-between"><span>Tip</span><span>{{ r.tip | currency: r.currencyCode : 'symbol-narrow' : '1.2-2' }}</span></p> }
          <p class="flex justify-between font-bold"><span>TOTAL</span><span data-testid="receipt-total">{{ r.total | currency: r.currencyCode : 'symbol-narrow' : '1.2-2' }}</span></p>
          @for (p of r.payments; track p.id) { <p class="flex justify-between"><span>{{ p.method }}{{ p.isDemo ? ' (DEMO)' : '' }}</span><span>{{ p.amount | currency: r.currencyCode : 'symbol-narrow' : '1.2-2' }}</span></p> }
          @if (r.change > 0) { <p class="flex justify-between"><span>Change</span><span>{{ r.change | currency: r.currencyCode : 'symbol-narrow' : '1.2-2' }}</span></p> }
          @if (r.isDemoPayment) { <p class="mt-1 text-center font-bold">DEMONSTRATION PAYMENT: NO REAL MONEY MOVED</p> }
          @if (r.footer) { <p class="mt-2 whitespace-pre-line text-center">{{ r.footer }}</p> }
          @if (r.printCount > 0) { <p class="mt-1 text-center">Reprint {{ r.printCount }}</p> }
        </article>
        <div class="mt-3 flex justify-end gap-2"><button type="button" class="btn-outline" data-testid="reprint" (click)="reprint()">Print</button></div>
      } @else { <p class="text-ink/70">{{ receiptError() ?? 'Loading...' }}</p> }
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
  protected readonly canEdit = computed(() => this.auth.hasPermission(this.perms.POS_ORDER_EDIT));
  protected readonly canPay = computed(() => this.auth.hasPermission(this.perms.POS_PAYMENT_PROCESS));
  protected readonly canDiscount = computed(() => this.auth.hasPermission(this.perms.POS_DISCOUNT_APPLY));
  protected readonly canSplit = computed(() => this.auth.hasPermission(this.perms.POS_TAB_SPLIT));
  protected readonly canVoid = computed(() => this.auth.hasAnyPermission([this.perms.POS_VOID_REQUEST, this.perms.POS_VOID_APPROVE]));
  protected readonly canApproveVoid = computed(() => this.auth.hasPermission(this.perms.POS_VOID_APPROVE));

  protected readonly hasUnsent = computed(() => !!this.store.current()?.lines.some((l) => l.status === 'Active' && !l.confirmed));
  protected readonly activeLines = computed(() => this.store.current()?.lines.filter((l) => l.status === 'Active') ?? []);
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
    this.serialChosen = null;
    if (p.tracksSerials) {
      this.pending.set(p);
      this.serialText.set('');
      this.dialog.set('serial');
      return;
    }
    this.continuePick(p);
  }

  private continuePick(p: ProductDto): void {
    if (p.modifiers.some((m) => m.isActive)) {
      this.pending.set(p);
      this.chosenMods.set([]);
      this.dialog.set('modifiers');
    } else void this.run(() => this.store.addProduct(p, 1, [], null, this.serialChosen));
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
    if (p) await this.run(() => this.store.addProduct(p, 1, [...this.chosenMods()], null, this.serialChosen));
    this.dialog.set(null);
  }

  protected sendOrder(): void {
    void this.run(() => this.store.confirm());
  }

  protected qty(lineId: string, q: number): void {
    if (q < 1) void this.run(() => this.store.removeLine(lineId));
    else void this.run(() => this.store.setQuantity(lineId, q));
  }

  /** A barcode already in the cached catalogue is added at once, so scanning works offline. */
  protected async scan(): Promise<void> {
    const code = this.barcode().trim();
    if (!code) return;
    const hit = this.store.products().find((p) => p.barcode === code);
    this.barcode.set('');
    if (hit) { this.pick(hit); return; }
    this.toast.error(`No product has the barcode ${code}.`);
  }

  protected async run(action: () => Promise<void>): Promise<void> {
    this.error.set(null);
    try { await action(); } catch (err) { this.error.set(toApiError(err).message); }
  }

  // ---- payment ----
  protected openPay(): void {
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
  protected openVoid(lineId: string): void {
    this.voidLineId.set(lineId);
    this.voidReason.set('');
    this.voidWasted.set(false);
    this.dialog.set('void');
  }

  protected async submitVoid(): Promise<void> {
    const id = this.voidLineId();
    if (!id) return;
    await this.run(() => this.store.voidLine(id, this.voidReason().trim(), this.voidWasted()));
    this.dialog.set(null);
    this.toast.info(this.canApproveVoid() ? 'Void sent.' : 'Void requested. A manager must approve it.');
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

  protected async submitTransfer(): Promise<void> {
    this.splitError.set(null);
    try {
      await this.store.serverAction((id) => firstValueFrom(this.ordersApi.transfer(id, { tableLabel: this.transferTable().trim() || null, newOwnerMembershipId: null })), 'Moving a bill');
      this.dialog.set(null);
    } catch (err) { this.splitError.set(toApiError(err).message); }
  }

  // ---- approvals ----
  protected async openApprovals(): Promise<void> {
    this.splitError.set(null);
    await this.loadApprovals();
    this.dialog.set('approvals');
  }

  private async loadApprovals(): Promise<void> {
    const branchId = this.branches.activeId();
    if (!branchId) return;
    try { this.approvals.set(await firstValueFrom(this.ordersApi.voidRequests({ branchId, status: 'Pending' }))); } catch { /* offline: leave the list */ }
  }

  protected async decide(r: VoidRequestDto, approve: boolean): Promise<void> {
    this.splitError.set(null);
    try {
      await firstValueFrom(this.ordersApi.decideVoid(r.id, approve, null));
      await this.loadApprovals();
      if (this.store.current()?.id === r.orderId) await this.store.reload(r.orderId);
      await this.store.refreshBills();
    } catch (err) { this.splitError.set(toApiError(err).message); }
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
      this.receipt.set(await firstValueFrom(this.ordersApi.reprint(o.id)));
      window.print();
    } catch (err) { this.receiptError.set(toApiError(err).message); }
  }
}
