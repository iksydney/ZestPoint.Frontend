import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { PriceBranchDto, PriceChangeDto, PriceListDto, PriceMatrixDto, PriceMode, PriceRowDto, PriceScopeName } from '../../core/models/prices.model';
import { toApiError } from '../../core/services/api.util';
import { PricesApi } from '../../core/services/prices.service';
import { DialogComponent, ToastService } from '../../shared/ui/feedback';

type Tab = 'prices' | 'lists' | 'pending';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

interface ChangeForm { scope: PriceScopeName; branchId: string; listId: string; mode: PriceMode; value: string; from: string; reason: string }
interface AssignRow { branchId: string; branchName: string; on: boolean; order: number; from: string; to: string; days: number; fromTime: string; toTime: string }

const pad = (n: number) => String(n).padStart(2, '0');
/** A datetime-local box shows the device's own time; it goes to the server as UTC. */
const toUtc = (local: string): string | null => (local ? new Date(local).toISOString() : null);
const toLocalInput = (utc: string | null): string => {
  if (!utc) return '';
  const d = new Date(utc);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const minutesOf = (time: string): number | null => (time ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) : null);
const timeOf = (minute: number | null): string => (minute === null ? '' : `${pad(Math.floor(minute / 60) % 24)}:${pad(minute % 60)}`);

/**
 * Prices and Menus (the Head office module): what every product costs at every branch and why, changes now or from a date, price lists
 * with the branches that use them (and when), what each branch sells, and the scheduled changes waiting. Head office changes anything;
 * a branch manager only their own branch, and only if the company allows it. The server decides all of that and refuses the rest.
 */
@Component({
    selector: 'zp-prices',
    imports: [FormsModule, CurrencyPipe, DatePipe, DialogComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="flex flex-col gap-4" data-testid="prices">
      <div>
        <h1 class="text-2xl font-bold">Prices and menus</h1>
        <p class="text-sm text-ink/70">What each item costs at each branch, and where that price comes from. A branch's own price wins, then a price list the branch uses, then the company price.</p>
      </div>
      @if (error()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="prices-error">{{ error() }}</p> }
      @if (matrix(); as m) {
        @if (!m.mayManageAll && !m.branchManagersMaySet) {
          <p class="sys-alert sys-alert-info" role="status" data-testid="prices-readonly">Only head office changes prices. You can see them here. Your company can let branch managers set their own branch's prices in Settings.</p>
        }
      }

      <div class="flex flex-wrap gap-2" role="tablist" aria-label="Prices and menus">
        <button type="button" role="tab" class="btn-outline px-3 py-1.5" [class.ring-2]="tab() === 'prices'" [attr.aria-selected]="tab() === 'prices'" data-testid="prices-tab-prices" (click)="pick('prices')">Prices</button>
        <button type="button" role="tab" class="btn-outline px-3 py-1.5" [class.ring-2]="tab() === 'lists'" [attr.aria-selected]="tab() === 'lists'" data-testid="prices-tab-lists" (click)="pick('lists')">Price lists</button>
        <button type="button" role="tab" class="btn-outline px-3 py-1.5" [class.ring-2]="tab() === 'pending'" [attr.aria-selected]="tab() === 'pending'" data-testid="prices-tab-pending" (click)="pick('pending')">Scheduled changes@if (pending().length) { <span class="app-badge app-badge-warning ml-2">{{ pending().length }}</span> }</button>
      </div>

      @switch (tab()) {
        @case ('prices') {
          <section class="app-card overflow-hidden p-0" aria-label="Prices">
            <div class="flex flex-wrap items-end justify-between gap-3 bg-ink/5 px-4 py-3">
              <div><label class="app-label" for="pr-search">Find an item</label><input id="pr-search" type="search" class="app-input" placeholder="Name, part number or barcode" data-testid="prices-search" [ngModel]="search()" (ngModelChange)="search.set($event)" (keyup.enter)="reload(1)" /></div>
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-sm text-ink/70" data-testid="prices-selected">{{ selected().length }} selected</span>
                <button type="button" class="btn-primary" data-testid="prices-change" [disabled]="selected().length === 0" (click)="openChange()">Change prices</button>
                <button type="button" class="btn-outline" data-testid="prices-off" [disabled]="selected().length === 0 || !editableBranches().length" (click)="openSell(false)">Stop selling at...</button>
                <button type="button" class="btn-outline" data-testid="prices-on" [disabled]="selected().length === 0 || !editableBranches().length" (click)="openSell(true)">Sell again at...</button>
              </div>
            </div>
            <div class="overflow-x-auto">
              <table class="app-table min-w-[40rem]" data-testid="prices-table">
                <caption class="sr-only">Prices by branch</caption>
                <thead><tr><th class="w-8"><span class="sr-only">Select</span></th><th>Item</th><th class="text-right">Company</th>@for (b of matrix()?.branches ?? []; track b.id) { <th class="text-right">{{ b.name }}</th> }<th></th></tr></thead>
                <tbody>
                  @for (r of matrix()?.rows ?? []; track r.productId) {
                    <tr [attr.data-testid]="'price-row-' + r.name">
                      <td><input type="checkbox" [attr.aria-label]="'Select ' + r.name" [attr.data-testid]="'price-select-' + r.name" [checked]="isSelected(r.productId)" (change)="toggle(r.productId)" /></td>
                      <td><span class="font-semibold">{{ r.name }}</span> <span class="font-data text-[11px] text-ink/60">{{ r.sku }}</span>@if (r.groupName) { <span class="block text-xs text-ink/60">{{ r.groupName }}</span> }</td>
                      <td class="whitespace-nowrap text-right font-data">{{ r.companyPrice | currency: matrix()!.currencyCode : 'symbol-narrow' : '1.2-2' }}@if (r.pendingCompany) { <span class="app-badge app-badge-warning ml-1" title="A change is scheduled">{{ r.pendingCompany }}</span> }</td>
                      @for (b of matrix()!.branches; track b.id) {
                        @if (cell(r, b.id); as c) {
                          <td class="whitespace-nowrap text-right font-data" [class.opacity-50]="c.off" [attr.data-testid]="'price-cell-' + r.name + '-' + b.name" [attr.data-source]="c.source" [attr.data-off]="c.off">
                            {{ c.price | currency: matrix()!.currencyCode : 'symbol-narrow' : '1.2-2' }}
                            @if (c.source !== 'company') { <span class="block text-[11px] text-primary">{{ c.source === 'list' ? c.sourceName : 'own price' }}</span> }
                            @if (c.off) { <span class="app-badge ml-1 bg-ink/10 text-ink/80" data-testid="price-off">not sold</span> }
                            @if (c.pending) { <span class="app-badge app-badge-warning ml-1" title="A change is scheduled">{{ c.pending }}</span> }
                          </td>
                        }
                      }
                      <td class="text-right"><button type="button" class="btn-ghost px-2 py-1 text-sm" [attr.data-testid]="'price-history-' + r.name" (click)="openHistory(r)">History</button></td>
                    </tr>
                  } @empty { <tr><td [attr.colspan]="(matrix()?.branches?.length ?? 0) + 4" class="py-8 text-center text-ink/70">{{ loading() ? 'Loading...' : 'No items match.' }}</td></tr> }
                </tbody>
              </table>
            </div>
            @if (matrix(); as m) {
              <div class="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                <span data-testid="prices-count">{{ m.total }} item(s)</span>
                <span class="flex gap-2"><button type="button" class="btn-ghost px-2 py-1" [disabled]="m.page <= 1" (click)="reload(m.page - 1)">Previous</button><button type="button" class="btn-ghost px-2 py-1" [disabled]="m.page * m.pageSize >= m.total" (click)="reload(m.page + 1)">Next</button></span>
              </div>
            }
          </section>
        }
        @case ('lists') {
          <section class="app-card overflow-hidden p-0" aria-label="Price lists">
            <div class="flex items-center justify-between bg-ink/5 px-4 py-2">
              <h2 class="text-lg font-semibold">Price lists</h2>
              <button type="button" class="btn-primary" data-testid="list-new" [disabled]="!matrix()?.mayManageAll" (click)="openList(null)">Add a price list</button>
            </div>
            <ul class="m-0 list-none divide-y divide-ink/10 p-0" data-testid="list-list">
              @for (l of lists(); track l.id) {
                <li class="flex flex-wrap items-center justify-between gap-2 px-4 py-3" [attr.data-testid]="'list-row-' + l.name" [class.opacity-60]="!l.isActive">
                  <div class="min-w-0">
                    <p class="font-semibold">{{ l.name }} @if (!l.isActive) { <span class="app-badge ml-1">switched off</span> }</p>
                    <p class="text-sm text-ink/70">{{ l.description }} {{ l.productCount }} item(s) priced. @if (l.branches.length) { Used at {{ branchNames(l) }}. } @else { Not used by any branch yet. }</p>
                  </div>
                  <div class="flex gap-2">
                    <button type="button" class="btn-outline px-3 py-1 text-sm" [attr.data-testid]="'list-edit-' + l.name" [disabled]="!matrix()?.mayManageAll" (click)="openList(l)">Edit</button>
                    <button type="button" class="btn-outline px-3 py-1 text-sm" [attr.data-testid]="'list-branches-' + l.name" [disabled]="!matrix()?.mayManageAll" (click)="openAssign(l)">Branches and times</button>
                  </div>
                </li>
              } @empty { <li class="px-4 py-8 text-center text-ink/70" data-testid="lists-empty">No price lists yet. A list holds prices that some branches use, for example for an airport branch, or a happy hour.</li> }
            </ul>
            <p class="px-4 py-3 text-xs text-ink/70">To put prices in a list: on the Prices tab choose the items, press Change prices and choose "A price list".</p>
          </section>
        }
        @case ('pending') {
          <section class="app-card overflow-hidden p-0" aria-label="Scheduled changes">
            <div class="overflow-x-auto">
              <table class="app-table min-w-[36rem]" data-testid="pending-table">
                <caption class="sr-only">Changes that have not started</caption>
                <thead><tr><th>Item</th><th>Where</th><th class="text-right">New price</th><th>Starts</th><th>Set by</th><th></th></tr></thead>
                <tbody>
                  @for (p of pending(); track p.id; let i = $index) {
                    <tr [attr.data-testid]="'pending-row-' + p.productName">
                      <td class="font-semibold">{{ p.productName }}</td><td>{{ where(p) }}</td>
                      <td class="text-right font-data">{{ p.price === null ? 'no price of its own' : (p.price | currency: matrix()?.currencyCode ?? '' : 'symbol-narrow' : '1.2-2') }}</td>
                      <td class="whitespace-nowrap">{{ p.startsAtUtc | date: 'd MMM yyyy, HH:mm' }}</td><td>{{ p.setByName }}</td>
                      <td class="text-right"><button type="button" class="btn-ghost px-2 py-1 text-sm" [attr.data-testid]="'pending-cancel-' + p.productName" (click)="cancel(p)">Cancel</button></td>
                    </tr>
                  } @empty { <tr><td colspan="6" class="py-8 text-center text-ink/70" data-testid="pending-empty">No changes are waiting to start.</td></tr> }
                </tbody>
              </table>
            </div>
          </section>
        }
      }
    </div>

    <!-- Change prices -->
    <zp-dialog [open]="!!change()" title="Change prices" [wide]="true" (closed)="change.set(null)">
      @if (change(); as f) {
        <form class="space-y-3" (submit)="$event.preventDefault(); apply()" data-testid="change-form">
          <p class="text-sm text-ink/80" data-testid="change-items">{{ selected().length }} item(s): {{ selectedNames() }}</p>
          <div class="grid gap-3 sm:grid-cols-2">
            <div><label class="app-label" for="pd-scope">Change the price</label>
              <select id="pd-scope" class="app-input" data-testid="pd-scope" [ngModel]="f.scope" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ scope: $event })">
                <option value="branch">At one branch</option>
                @if (matrix()?.mayManageAll) { <option value="company">For the whole company</option><option value="list">In a price list</option> }
              </select></div>
            @if (f.scope === 'branch') {
              <div><label class="app-label" for="pd-branch">Branch</label>
                <select id="pd-branch" class="app-input" data-testid="pd-branch" [ngModel]="f.branchId" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ branchId: $event })">
                  @for (b of editableBranches(); track b.id) { <option [value]="b.id">{{ b.name }}</option> }
                </select></div>
            }
            @if (f.scope === 'list') {
              <div><label class="app-label" for="pd-list">Price list</label>
                <select id="pd-list" class="app-input" data-testid="pd-list" [ngModel]="f.listId" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ listId: $event })">
                  @for (l of activeLists(); track l.id) { <option [value]="l.id">{{ l.name }}</option> }
                </select>
                @if (!activeLists().length) { <p class="mt-1 text-xs text-warning">Make a price list first (Price lists tab).</p> }</div>
            }
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div><label class="app-label" for="pd-mode">How</label>
              <select id="pd-mode" class="app-input" data-testid="pd-mode" [ngModel]="f.mode" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ mode: $event })">
                <option value="absolute">Set the price to</option><option value="percent">Raise or lower by a percentage</option><option value="amount">Raise or lower by an amount</option>
                @if (f.scope !== 'company') { <option value="clear">Remove the price of its own (use the next one)</option> }
              </select></div>
            @if (f.mode !== 'clear') {
              <div><label class="app-label" for="pd-value">{{ f.mode === 'absolute' ? 'Price' : f.mode === 'percent' ? 'Percent (use minus to lower)' : 'Amount (use minus to lower)' }}</label>
                <input id="pd-value" type="number" step="0.01" class="app-input" data-testid="pd-value" [ngModel]="f.value" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ value: $event })" /></div>
            }
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div><label class="app-label" for="pd-from">From (empty = now)</label>
              <input id="pd-from" type="datetime-local" class="app-input" data-testid="pd-from" [ngModel]="f.from" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ from: $event })" />
              <p class="mt-1 text-xs text-ink/70">A later time schedules the change; it starts by itself.</p></div>
            <div><label class="app-label" for="pd-reason">Reason (optional)</label>
              <input id="pd-reason" class="app-input" maxlength="300" data-testid="pd-reason" [ngModel]="f.reason" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ reason: $event })" /></div>
          </div>
          @if (changeError()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="pd-error">{{ changeError() }}</p> }
          <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="change.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="pd-apply" [disabled]="busy()">{{ busy() ? 'Saving...' : 'Apply' }}</button></div>
        </form>
      }
    </zp-dialog>

    <!-- Sell or stop selling at a branch -->
    <zp-dialog [open]="sell() !== null" [title]="sell() ? 'Sell again at a branch' : 'Stop selling at a branch'" (closed)="sell.set(null)">
      <form class="space-y-3" (submit)="$event.preventDefault(); applySell()" data-testid="sell-form">
        <p class="text-sm text-ink/80">{{ selected().length }} item(s): {{ selectedNames() }}</p>
        <div><label class="app-label" for="sl-branch">Branch</label>
          <select id="sl-branch" class="app-input" data-testid="sell-branch" [ngModel]="sellBranch()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="sellBranch.set($event)">
            @for (b of editableBranches(); track b.id) { <option [value]="b.id">{{ b.name }}</option> }
          </select></div>
        <p class="text-xs text-ink/70">{{ sell() ? 'The branch will list and sell these items again.' : 'The branch will no longer list these items, and nobody can add them to a bill there. Bills already open keep them.' }}</p>
        @if (changeError()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="sell-error">{{ changeError() }}</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="sell.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="sell-apply" [disabled]="busy()">{{ sell() ? 'Sell again' : 'Stop selling' }}</button></div>
      </form>
    </zp-dialog>

    <!-- History of one item -->
    <zp-dialog [open]="!!historyOf()" [title]="'History: ' + (historyOf()?.name ?? '')" [wide]="true" (closed)="historyOf.set(null)">
      <div class="overflow-x-auto" data-testid="price-history">
        <table class="app-table min-w-[36rem]"><caption class="sr-only">Every price change of this item</caption>
          <thead><tr><th>Starts</th><th>Where</th><th class="text-right">Price</th><th>Status</th><th>Set by</th><th>Why</th></tr></thead>
          <tbody>
            @for (h of history(); track h.id) {
              <tr [attr.data-status]="h.status">
                <td class="whitespace-nowrap">{{ h.startsAtUtc | date: 'd MMM yyyy, HH:mm' }}</td><td>{{ where(h) }}</td>
                <td class="text-right font-data">{{ h.price === null ? 'none of its own' : (h.price | currency: matrix()?.currencyCode ?? '' : 'symbol-narrow' : '1.2-2') }}</td>
                <td>{{ h.status }}</td><td>{{ h.setByName }}</td><td>{{ h.reason }}</td>
              </tr>
            } @empty { <tr><td colspan="6" class="py-6 text-center text-ink/70">{{ historyLoading() ? 'Loading...' : 'No changes recorded yet.' }}</td></tr> }
          </tbody>
        </table>
      </div>
    </zp-dialog>

    <!-- A price list: name -->
    <zp-dialog [open]="!!listForm()" [title]="listForm()?.id ? 'Price list' : 'Add a price list'" (closed)="listForm.set(null)">
      @if (listForm(); as f) {
        <form class="space-y-3" (submit)="$event.preventDefault(); saveList()" data-testid="list-form">
          <div><label class="app-label" for="pl-name">Name</label><input id="pl-name" class="app-input" maxlength="60" data-testid="list-name" placeholder="e.g. Airport, Happy hour" [ngModel]="f.name" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchList({ name: $event })" /></div>
          <div><label class="app-label" for="pl-desc">Description (optional)</label><input id="pl-desc" class="app-input" maxlength="200" data-testid="list-description" [ngModel]="f.description" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchList({ description: $event })" /></div>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" data-testid="list-active" [checked]="f.isActive" (change)="patchList({ isActive: !f.isActive })" /> In use (untick to switch the list off without losing its prices)</label>
          @if (changeError()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="list-error">{{ changeError() }}</p> }
          <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="listForm.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="list-save" [disabled]="busy()">Save</button></div>
        </form>
      }
    </zp-dialog>

    <!-- A price list: which branches use it, and when -->
    <zp-dialog [open]="!!assignList()" [title]="'Branches that use ' + (assignList()?.name ?? '')" [wide]="true" (closed)="assignList.set(null)">
      <form class="space-y-3" (submit)="$event.preventDefault(); saveAssign()" data-testid="assign-form">
        <p class="text-sm text-ink/80">A branch uses the first list, in its order, that has a price for the item and is running. Leave the dates, days and times empty to use the list all the time. A happy hour is a list with days and times.</p>
        <div class="overflow-x-auto"><table class="app-table min-w-[44rem]"><caption class="sr-only">Branches and when the list applies</caption>
          <thead><tr><th>Use</th><th>Branch</th><th>Order</th><th>From</th><th>To</th><th>Days</th><th>Times</th></tr></thead>
          <tbody>
            @for (a of assignRows(); track a.branchId; let i = $index) {
              <tr [attr.data-testid]="'la-row-' + a.branchName">
                <td><input type="checkbox" [attr.aria-label]="'Use at ' + a.branchName" [attr.data-testid]="'la-use-' + a.branchName" [checked]="a.on" (change)="patchAssign(i, { on: !a.on })" /></td>
                <td class="font-semibold">{{ a.branchName }}</td>
                <td><input type="number" min="0" max="1000" class="app-input w-16 px-1 py-0" [attr.data-testid]="'la-order-' + a.branchName" [ngModel]="a.order" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchAssign(i, { order: +$event || 0 })" /></td>
                <td><input type="datetime-local" class="app-input px-1 py-0 text-xs" [attr.data-testid]="'la-from-' + a.branchName" [ngModel]="a.from" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchAssign(i, { from: $event })" /></td>
                <td><input type="datetime-local" class="app-input px-1 py-0 text-xs" [attr.data-testid]="'la-to-' + a.branchName" [ngModel]="a.to" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchAssign(i, { to: $event })" /></td>
                <td class="whitespace-nowrap">@for (d of days; track d; let di = $index) { <label class="mr-1 text-xs"><input type="checkbox" [checked]="dayOn(a.days, di)" (change)="patchAssign(i, { days: toggleDay(a.days, di) })" /> {{ d }}</label> }</td>
                <td class="whitespace-nowrap"><input type="time" class="app-input w-24 px-1 py-0 text-xs" [attr.data-testid]="'la-fromtime-' + a.branchName" [ngModel]="a.fromTime" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchAssign(i, { fromTime: $event })" /> to <input type="time" class="app-input w-24 px-1 py-0 text-xs" [attr.data-testid]="'la-totime-' + a.branchName" [ngModel]="a.toTime" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchAssign(i, { toTime: $event })" /></td>
              </tr>
            }
          </tbody></table></div>
        @if (changeError()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="assign-error">{{ changeError() }}</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="assignList.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="la-save" [disabled]="busy()">Save</button></div>
      </form>
    </zp-dialog>
  `
})
export class PricesComponent implements OnInit {
  private readonly api = inject(PricesApi);
  private readonly toast = inject(ToastService);

  protected readonly days = DAYS;
  protected readonly tab = signal<Tab>('prices');
  protected readonly matrix = signal<PriceMatrixDto | null>(null);
  protected readonly lists = signal<readonly PriceListDto[]>([]);
  protected readonly pending = signal<readonly PriceChangeDto[]>([]);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly changeError = signal<string | null>(null);
  protected readonly search = signal('');
  protected readonly selected = signal<readonly string[]>([]);

  protected readonly change = signal<ChangeForm | null>(null);
  protected readonly sell = signal<boolean | null>(null);
  protected readonly sellBranch = signal('');
  protected readonly historyOf = signal<PriceRowDto | null>(null);
  protected readonly history = signal<readonly PriceChangeDto[]>([]);
  protected readonly historyLoading = signal(false);
  protected readonly listForm = signal<{ id: string | null; name: string; description: string; isActive: boolean } | null>(null);
  protected readonly assignList = signal<PriceListDto | null>(null);
  protected readonly assignRows = signal<readonly AssignRow[]>([]);

  protected readonly editableBranches = computed<readonly PriceBranchDto[]>(() => (this.matrix()?.branches ?? []).filter((b) => b.mayChange));
  protected readonly activeLists = computed(() => this.lists().filter((l) => l.isActive));
  protected readonly selectedNames = computed(() => {
    const names = (this.matrix()?.rows ?? []).filter((r) => this.selected().includes(r.productId)).map((r) => r.name);
    return names.slice(0, 4).join(', ') + (names.length > 4 ? ` and ${names.length - 4} more` : '');
  });

  ngOnInit(): void { void this.reload(1); void this.loadLists(); void this.loadPending(); }

  protected pick(t: Tab): void {
    this.tab.set(t);
    if (t === 'lists') void this.loadLists();
    if (t === 'pending') void this.loadPending();
  }

  protected cell = (r: PriceRowDto, branchId: string) => r.cells.find((c) => c.branchId === branchId) ?? null;
  protected isSelected = (id: string): boolean => this.selected().includes(id);
  protected toggle(id: string): void { this.selected.update((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])); }
  protected branchNames = (l: PriceListDto): string => l.branches.map((b) => b.branchName).join(', ');
  protected where = (c: PriceChangeDto): string => (c.scope === 'company' ? 'Whole company' : c.scope === 'branch' ? (c.branchName ?? 'Branch') : `List: ${c.listName ?? ''}`);

  protected async reload(page: number): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try { this.matrix.set(await firstValueFrom(this.api.matrix({ search: this.search().trim() || undefined, page, pageSize: 25 }))); }
    catch (err) { this.error.set(toApiError(err).message); }
    finally { this.loading.set(false); }
  }

  private async loadLists(): Promise<void> {
    try { this.lists.set(await firstValueFrom(this.api.lists())); } catch (err) { this.error.set(toApiError(err).message); }
  }

  private async loadPending(): Promise<void> {
    try { this.pending.set(await firstValueFrom(this.api.pending())); } catch (err) { this.error.set(toApiError(err).message); }
  }

  // ---- change prices -----------------------------------------------------------------------------------

  protected openChange(): void {
    const m = this.matrix();
    this.changeError.set(null);
    this.change.set({ scope: m?.mayManageAll ? 'company' : 'branch', branchId: this.editableBranches()[0]?.id ?? '', listId: this.activeLists()[0]?.id ?? '', mode: 'absolute', value: '', from: '', reason: '' });
  }

  protected patch(p: Partial<ChangeForm>): void { this.change.update((f) => (f ? { ...f, ...p } : f)); }

  protected async apply(): Promise<void> {
    const f = this.change();
    if (!f || this.busy()) return;
    if (f.mode !== 'clear' && (f.value === '' || Number.isNaN(Number(f.value)))) { this.changeError.set('Type the price or the change.'); return; }
    this.busy.set(true);
    this.changeError.set(null);
    try {
      const r = await firstValueFrom(this.api.set({
        scope: f.scope, branchId: f.scope === 'branch' ? f.branchId : null, priceListId: f.scope === 'list' ? f.listId : null, productIds: [...this.selected()],
        mode: f.mode, value: f.mode === 'clear' ? null : Number(f.value), startsAtUtc: toUtc(f.from), reason: f.reason.trim() || null
      }));
      this.change.set(null);
      this.selected.set([]);
      this.toast.success(r.changed === 0 ? 'Nothing to change.' : r.scheduled ? `${r.changed} price(s) scheduled.` : `${r.changed} price(s) changed.`);
      await Promise.all([this.reload(this.matrix()?.page ?? 1), this.loadPending(), this.loadLists()]);
    } catch (err) { this.changeError.set(toApiError(err).message); }
    finally { this.busy.set(false); }
  }

  // ---- what a branch sells ---------------------------------------------------------------------------------

  protected openSell(available: boolean): void {
    this.changeError.set(null);
    this.sellBranch.set(this.editableBranches()[0]?.id ?? '');
    this.sell.set(available);
  }

  protected async applySell(): Promise<void> {
    const available = this.sell();
    if (available === null || !this.sellBranch() || this.busy()) return;
    this.busy.set(true);
    this.changeError.set(null);
    try {
      const n = await firstValueFrom(this.api.availability(this.sellBranch(), [...this.selected()], available, null));
      this.sell.set(null);
      this.selected.set([]);
      this.toast.success(n === 0 ? 'Nothing to change.' : available ? `${n} item(s) are sold there again.` : `${n} item(s) are no longer sold there.`);
      await this.reload(this.matrix()?.page ?? 1);
    } catch (err) { this.changeError.set(toApiError(err).message); }
    finally { this.busy.set(false); }
  }

  // ---- history and scheduled changes ------------------------------------------------------------------

  protected async openHistory(r: PriceRowDto): Promise<void> {
    this.historyOf.set(r);
    this.history.set([]);
    this.historyLoading.set(true);
    try { this.history.set(await firstValueFrom(this.api.history(r.productId))); }
    catch (err) { this.error.set(toApiError(err).message); }
    finally { this.historyLoading.set(false); }
  }

  protected async cancel(p: PriceChangeDto): Promise<void> {
    try {
      await firstValueFrom(this.api.cancel(p.id));
      this.toast.success('The scheduled change was cancelled.');
      await Promise.all([this.loadPending(), this.reload(this.matrix()?.page ?? 1)]);
    } catch (err) { this.error.set(toApiError(err).message); }
  }

  // ---- price lists ----------------------------------------------------------------------------------------------

  protected openList(l: PriceListDto | null): void {
    this.changeError.set(null);
    this.listForm.set({ id: l?.id ?? null, name: l?.name ?? '', description: l?.description ?? '', isActive: l?.isActive ?? true });
  }

  protected patchList(p: Partial<{ name: string; description: string; isActive: boolean }>): void { this.listForm.update((f) => (f ? { ...f, ...p } : f)); }

  protected async saveList(): Promise<void> {
    const f = this.listForm();
    if (!f || this.busy()) return;
    if (!f.name.trim()) { this.changeError.set('Type the price list\'s name.'); return; }
    this.busy.set(true);
    this.changeError.set(null);
    try {
      await firstValueFrom(this.api.saveList(f.id, { name: f.name.trim(), description: f.description.trim() || null, isActive: f.isActive }));
      this.listForm.set(null);
      this.toast.success(f.id ? 'Price list saved.' : 'Price list added.');
      await this.loadLists();
    } catch (err) { this.changeError.set(toApiError(err).message); }
    finally { this.busy.set(false); }
  }

  protected openAssign(l: PriceListDto): void {
    this.changeError.set(null);
    const branches = this.matrix()?.branches ?? [];
    this.assignRows.set(branches.map((b, i) => {
      const a = l.branches.find((x) => x.branchId === b.id);
      return { branchId: b.id, branchName: b.name, on: !!a, order: a?.sortOrder ?? i, from: toLocalInput(a?.validFromUtc ?? null), to: toLocalInput(a?.validToUtc ?? null), days: a?.daysOfWeek ?? 0, fromTime: timeOf(a?.fromMinute ?? null), toTime: timeOf(a?.toMinute ?? null) };
    }));
    this.assignList.set(l);
  }

  /** Days of the week are kept as bits: bit 0 = Sunday ... bit 6 = Saturday; no bit set means every day. */
  protected dayOn = (days: number, day: number): boolean => (days & (1 << day)) !== 0;
  protected toggleDay = (days: number, day: number): number => days ^ (1 << day);

  protected patchAssign(i: number, p: Partial<AssignRow>): void { this.assignRows.update((rows) => rows.map((r, n) => (n === i ? { ...r, ...p } : r))); }

  protected async saveAssign(): Promise<void> {
    const l = this.assignList();
    if (!l || this.busy()) return;
    this.busy.set(true);
    this.changeError.set(null);
    try {
      await firstValueFrom(this.api.setListBranches(l.id, this.assignRows().filter((r) => r.on).map((r) => ({
        branchId: r.branchId, sortOrder: r.order, validFromUtc: toUtc(r.from), validToUtc: toUtc(r.to), daysOfWeek: r.days, fromMinute: minutesOf(r.fromTime), toMinute: minutesOf(r.toTime)
      }))));
      this.assignList.set(null);
      this.toast.success('Saved.');
      await Promise.all([this.loadLists(), this.reload(this.matrix()?.page ?? 1)]);
    } catch (err) { this.changeError.set(toApiError(err).message); }
    finally { this.busy.set(false); }
  }
}
