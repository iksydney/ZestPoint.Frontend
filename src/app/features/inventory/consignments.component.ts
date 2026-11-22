import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import { ApiEnvelope } from '../../core/models/api.model';
import { InventoryItemDto, OrderStatus, PagedResult } from '../../core/models/ops.model';
import { FEATURES, SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { ApiError, toApiError, unwrap } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { BranchContextService } from '../../core/services/branch-context.service';
import { InventoryApi } from '../../core/services/ops.services';
import { DialogComponent, ToastService } from '../../shared/ui/feedback';
import { SearchSelectComponent, SelectOption } from '../../shared/ui/search-select.component';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';

export interface ConsignmentAgentDto { id: string; number: number; name: string; phone: string | null; address: string | null; notes: string | null; isActive: boolean; openConsignments: number; valueHeld: number; rowVersion: string }
export interface ConsignmentLineDto { id: string; inventoryItemId: string; itemName: string; quantity: number; unitPrice: number; quantitySold: number; quantityReturned: number; outstanding: number }
export interface ConsignmentSaleDto { id: string; orderId: string; orderNumber: number; orderStatus: OrderStatus; status: 'Billed' | 'Cancelled'; reportedAtUtc: string; total: number; balance: number; items: string; cancelReason: string | null }
export interface ConsignmentDto {
  id: string; number: number; branchId: string; agentId: string; agentName: string; status: 'Open' | 'Closed'; sentAtUtc: string; note: string | null; valueOutstanding: number;
  lines: ConsignmentLineDto[]; sales: ConsignmentSaleDto[]; rowVersion: string;
}

@Injectable({ providedIn: 'root' })
export class ConsignmentsApi {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/consignments';

  agents(includeInactive = false): Observable<ConsignmentAgentDto[]> {
    return this.http.get<ApiEnvelope<ConsignmentAgentDto[]>>(`${this.base}/agents`, { params: { includeInactive } }).pipe(unwrap());
  }

  saveAgent(id: string | null, body: { name: string; phone: string | null; address: string | null; notes: string | null; isActive: boolean; rowVersion?: string | null }): Observable<ConsignmentAgentDto> {
    return id ? this.http.put<ApiEnvelope<ConsignmentAgentDto>>(`${this.base}/agents/${id}`, body).pipe(unwrap()) : this.http.post<ApiEnvelope<ConsignmentAgentDto>>(`${this.base}/agents`, body).pipe(unwrap());
  }

  list(filter: { branchId: string; status?: string; search?: string }): Observable<PagedResult<ConsignmentDto>> {
    let params = new HttpParams().set('branchId', filter.branchId).set('pageSize', '200');
    if (filter.status) params = params.set('status', filter.status);
    if (filter.search) params = params.set('search', filter.search);
    return this.http.get<ApiEnvelope<PagedResult<ConsignmentDto>>>(this.base, { params }).pipe(unwrap());
  }

  /** Sends goods to an agent at agreed prices: they leave the shelf at once. Needs the right to manage prices as well. */
  send(body: { branchId: string; agentId: string; note: string | null; lines: { inventoryItemId: string; quantity: number; unitPrice: number }[] }): Observable<ConsignmentDto> {
    return this.http.post<ApiEnvelope<ConsignmentDto>>(this.base, body).pipe(unwrap());
  }

  /** What the agent reports sold goes on a new bill for them. */
  sold(id: string, lines: { lineId: string; quantity: number }[]): Observable<ConsignmentDto> {
    return this.http.post<ApiEnvelope<ConsignmentDto>>(`${this.base}/${id}/sold`, { lines }).pipe(unwrap());
  }

  cancelSold(id: string, saleId: string, reason: string): Observable<ConsignmentDto> {
    return this.http.post<ApiEnvelope<ConsignmentDto>>(`${this.base}/${id}/sold/${saleId}/cancel`, { reason }).pipe(unwrap());
  }

  returned(id: string, lines: { lineId: string; quantity: number }[]): Observable<ConsignmentDto> {
    return this.http.post<ApiEnvelope<ConsignmentDto>>(`${this.base}/${id}/returned`, { lines }).pipe(unwrap());
  }
}

interface DraftLine { item: InventoryItemDto; quantity: number; unitPrice: number }

/**
 * Consignment out: goods sent from this branch to an agent to sell for the company. They leave the shelf but stay the company's.
 * What the agent reports sold goes on a bill for the agent at the price agreed here, paid at the till; what comes back returns to
 * the shelf. Nothing is sold on credit.
 */
@Component({
    selector: 'zp-consignments',
    imports: [DatePipe, DecimalPipe, FormsModule, RouterLink, DialogComponent, SearchSelectComponent, StatusBadgeComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-bold">Consignment Out</h1>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn-outline" data-testid="agents-open" (click)="openAgents()">Agents</button>
        <button type="button" class="btn-primary" data-testid="cons-new" [disabled]="readOnly() || !branchId() || !canPrice()" [attr.title]="canPrice() ? null : 'Sending goods at agreed prices needs the right to manage products and prices.'" (click)="openNew()">Send goods out</button>
      </div>
    </div>
    <div class="mb-3 flex flex-wrap items-center gap-3">
      <label class="text-sm" for="cons-status">Show</label>
      <select id="cons-status" class="app-input max-w-[14rem]" data-testid="cons-status" [ngModel]="status()" (ngModelChange)="status.set($event); load()">
        <option value="Open">Goods still out</option><option value="Closed">Closed</option><option value="">All</option>
      </select>
      <input class="app-input max-w-sm" placeholder="Agent, item or consignment number" aria-label="Search consignments" data-testid="cons-search" [ngModel]="search()" (ngModelChange)="search.set($event)" (keydown.enter)="load()" />
      <button type="button" class="btn-outline" (click)="load()">Search</button>
    </div>
    @if (!branchId()) { <p class="sys-alert sys-alert-warning mb-3" role="status">Choose a branch at the top of the page.</p> }
    @if (readOnly()) { <p class="sys-alert sys-alert-warning mb-3" role="status">Read-only: your subscription limits this screen.</p> }
    @if (error()) { <p class="sys-alert sys-alert-danger mb-3" role="alert" data-testid="cons-error">{{ error() }}</p> }
    @if (notice()) { <p class="sys-alert sys-alert-success mb-3" role="status" data-testid="cons-notice">{{ notice() }} @if (noticeToTill()) { <a class="font-semibold underline" routerLink="/app/pos">Open Point of Sale</a> to take payment. }</p> }

    <div class="space-y-3" data-testid="cons-list">
      @for (c of rows(); track c.id) {
        <section class="app-card" [attr.data-testid]="'cons-' + c.agentName + '-' + c.number">
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 class="font-semibold">#{{ c.number }} {{ c.agentName }} <span class="text-sm font-normal text-ink/70">sent {{ c.sentAtUtc | date: 'mediumDate' }}@if (c.note) { , {{ c.note }} }</span></h2>
            <span class="flex items-center gap-2"><zp-status-badge [tone]="c.status === 'Open' ? 'primary' : 'success'">{{ c.status === 'Open' ? 'Goods still out' : 'Closed' }}</zp-status-badge>
              @if (c.status === 'Open') { <span class="text-sm">Still out: <strong [attr.data-testid]="'cons-value-' + c.number">{{ c.valueOutstanding | number: '1.2-2' }}</strong></span> }</span>
          </div>
          <div class="overflow-x-auto">
            <table class="app-table">
              <thead><tr><th>Item</th><th class="text-right">Agreed price</th><th class="text-right">Sent</th><th class="text-right">Sold</th><th class="text-right">Returned</th><th class="text-right">Still out</th></tr></thead>
              <tbody>
                @for (l of c.lines; track l.id) {
                  <tr><td class="font-medium">{{ l.itemName }}</td><td class="text-right font-mono">{{ l.unitPrice | number: '1.2-2' }}</td><td class="text-right font-mono">{{ l.quantity | number: '1.0-3' }}</td>
                    <td class="text-right font-mono">{{ l.quantitySold | number: '1.0-3' }}</td><td class="text-right font-mono">{{ l.quantityReturned | number: '1.0-3' }}</td>
                    <td class="text-right font-mono font-semibold" [attr.data-testid]="'cons-out-' + c.number + '-' + l.itemName">{{ l.outstanding | number: '1.0-3' }}</td></tr>
                }
              </tbody>
            </table>
          </div>
          @if (c.sales.length) {
            <ul class="mt-2 space-y-1 text-sm" [attr.data-testid]="'cons-sales-' + c.number">
              @for (s of c.sales; track s.id) {
                <li class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink/10 px-3 py-1.5">
                  <span>{{ s.reportedAtUtc | date: 'mediumDate' }}: {{ s.items }} on bill #{{ s.orderNumber }}, {{ s.total | number: '1.2-2' }}</span>
                  <span class="flex items-center gap-2">
                    @if (s.status === 'Cancelled') { <zp-status-badge tone="danger">Taken back</zp-status-badge> <span class="text-xs text-ink/70">{{ s.cancelReason }}</span> }
                    @else if (s.orderStatus === 'Paid' || s.orderStatus === 'Refunded') { <zp-status-badge tone="success">Paid</zp-status-badge> }
                    @else {
                      <zp-status-badge tone="warning">To pay: {{ s.balance | number: '1.2-2' }}</zp-status-badge>
                      @if (!readOnly() && s.orderStatus === 'Open') { <button type="button" class="btn-ghost px-2 py-0.5 text-sm text-danger" [attr.data-testid]="'cons-undo-' + s.orderNumber" (click)="openUndo(c, s)">Take back</button> }
                    }
                  </span>
                </li>
              }
            </ul>
          }
          @if (c.status === 'Open' && !readOnly()) {
            <div class="mt-3 flex flex-wrap gap-2">
              <button type="button" class="btn-outline" [attr.data-testid]="'cons-sold-' + c.number" (click)="openQuantities(c, 'sold')">Record sold</button>
              <button type="button" class="btn-outline" [attr.data-testid]="'cons-returned-' + c.number" (click)="openQuantities(c, 'returned')">Record returned</button>
            </div>
          }
        </section>
      } @empty { <p class="app-card py-8 text-center text-ink/70">{{ loading() ? 'Loading...' : 'Nothing here.' }}</p> }
    </div>

    <!-- Send goods out -->
    <zp-dialog [open]="dialog() === 'new'" title="Send goods out on consignment" (closed)="dialog.set(null)">
      <form class="space-y-3" autocomplete="off" (submit)="$event.preventDefault(); send()">
        <div><label class="app-label" for="cn-agent">Agent</label>
          <zp-search-select inputId="cn-agent" testId="cn-agent" emptyLabel="Choose an agent..." noun="agent" placeholder="Search agents" [options]="agentOptions()" [value]="agentId()" [error]="fe('agentId')" (valueChange)="agentId.set($event || null)" />
          @if (!activeAgents().length) { <p class="mt-1 text-xs text-ink/70">No agents yet. Close this and press Agents to add one.</p> }</div>
        <div><label class="app-label" for="cn-item">Add an item</label>
          <input id="cn-item" class="app-input" placeholder="Name or part number" autocomplete="off" data-testid="cn-item-search" [ngModel]="itemSearch()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="findItems($event)" />
          @if (itemResults().length) {
            <ul class="mt-1 divide-y divide-ink/10 rounded-lg border border-ink/15">
              @for (i of itemResults(); track i.id) { <li><button type="button" class="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-ink/10" [attr.data-testid]="'cn-item-' + i.name" (click)="addDraft(i)"><span>{{ i.name }}</span><span class="font-mono text-xs">{{ i.sellingPrice ?? '' }}</span></button></li> }
            </ul>
          }</div>
        @if (draft().length) {
          <table class="app-table" data-testid="cn-lines">
            <thead><tr><th>Item</th><th class="text-right">Quantity</th><th class="text-right">Agreed price each</th><th></th></tr></thead>
            <tbody>
              @for (d of draft(); track d.item.id) {
                <tr><td class="font-medium">{{ d.item.name }}</td>
                  <td class="text-right"><input type="number" min="0" step="any" class="app-input ml-auto w-24 px-2 py-1 text-right" [attr.aria-label]="'Quantity of ' + d.item.name" [attr.data-testid]="'cn-qty-' + d.item.name" [ngModel]="d.quantity" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchDraft(d.item.id, { quantity: +$event })" /></td>
                  <td class="text-right"><input type="number" min="0" step="0.01" class="app-input ml-auto w-32 px-2 py-1 text-right" [attr.aria-label]="'Agreed price of ' + d.item.name" [attr.data-testid]="'cn-price-' + d.item.name" [ngModel]="d.unitPrice" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchDraft(d.item.id, { unitPrice: +$event })" /></td>
                  <td class="text-right"><button type="button" class="btn-ghost px-2 py-0.5 text-sm text-danger" (click)="removeDraft(d.item.id)">Remove</button></td></tr>
              }
            </tbody>
          </table>
        }
        <div><label class="app-label" for="cn-note">Note (optional)</label><input id="cn-note" class="app-input" maxlength="300" [ngModel]="note()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="note.set($event)" /></div>
        <p class="text-xs text-ink/70">The goods leave this branch's shelf at once and stay the company's. The agreed price is what the agent is billed when they report a sale.</p>
        @if (fe('lines')) { <p class="app-error" role="alert" data-testid="cn-lines-error">{{ fe('lines') }}</p> }
        @if (dialogError()) { <p class="sys-alert sys-alert-danger" role="alert">{{ dialogError() }}</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Close</button><button type="submit" class="btn-primary" data-testid="cn-send" [disabled]="busy() || !agentId() || !draftValid()">Send out</button></div>
      </form>
    </zp-dialog>

    <!-- Sold / returned quantities -->
    <zp-dialog [open]="dialog() === 'sold' || dialog() === 'returned'" [title]="(dialog() === 'sold' ? 'Sold by ' : 'Returned by ') + (current()?.agentName ?? '')" (closed)="dialog.set(null)">
      @if (current(); as c) {
        <form class="space-y-3" (submit)="$event.preventDefault(); saveQuantities()">
          <p class="text-sm text-ink/80">{{ dialog() === 'sold' ? 'Enter how many of each the agent has sold. They go on one bill for the agent at the agreed prices, to be paid at the till.' : 'Enter how many of each have come back. They return to this branch\\'s shelf.' }}</p>
          <table class="app-table">
            <thead><tr><th>Item</th><th class="text-right">Still out</th><th class="text-right">{{ dialog() === 'sold' ? 'Sold' : 'Returned' }}</th></tr></thead>
            <tbody>
              @for (l of c.lines; track l.id) {
                @if (l.outstanding > 0) {
                  <tr><td class="font-medium">{{ l.itemName }}</td><td class="text-right font-mono">{{ l.outstanding | number: '1.0-3' }}</td>
                    <td class="text-right"><input type="number" min="0" step="any" class="app-input ml-auto w-24 px-2 py-1 text-right" [attr.aria-label]="'Quantity of ' + l.itemName" [attr.data-testid]="'cq-' + l.itemName" [ngModel]="quantities()[l.id]" [ngModelOptions]="{ standalone: true }" (ngModelChange)="setQuantity(l.id, $event)" /></td></tr>
                }
              }
            </tbody>
          </table>
          @if (dialogError()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="cq-error">{{ dialogError() }}</p> }
          <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Close</button><button type="submit" class="btn-primary" data-testid="cq-save" [disabled]="busy() || !anyQuantity()">{{ dialog() === 'sold' ? 'Open the bill' : 'Put back on the shelf' }}</button></div>
        </form>
      }
    </zp-dialog>

    <!-- Take a report back -->
    <zp-dialog [open]="dialog() === 'undo'" [title]="'Take back bill #' + (undoing()?.orderNumber ?? '')" (closed)="dialog.set(null)">
      <p class="mb-2 text-sm text-ink/80">The unpaid bill is closed and the goods count as still with the agent.</p>
      <label class="app-label" for="cu-reason">Why?</label><input id="cu-reason" class="app-input" maxlength="200" data-testid="undo-reason" [ngModel]="reason()" (ngModelChange)="reason.set($event)" />
      @if (dialogError()) { <p class="sys-alert sys-alert-danger mt-3" role="alert">{{ dialogError() }}</p> }
      <div class="mt-4 flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Close</button><button type="button" class="btn-primary" data-testid="undo-confirm" [disabled]="busy() || reason().trim().length < 3" (click)="undo()">Take it back</button></div>
    </zp-dialog>

    <!-- Agents -->
    <zp-dialog [open]="dialog() === 'agents'" title="Consignment agents" (closed)="dialog.set(null)">
      <table class="app-table" data-testid="agents-table">
        <thead><tr><th>Agent</th><th>Phone</th><th class="text-right">Value held</th><th></th></tr></thead>
        <tbody>
          @for (a of agents(); track a.id) {
            <tr [attr.data-testid]="'agent-' + a.name"><td class="font-medium">{{ a.name }} @if (!a.isActive) { <span class="app-badge bg-ink/10 text-ink/80">inactive</span> }</td><td class="font-mono text-sm">{{ a.phone }}</td>
              <td class="text-right font-mono">{{ a.valueHeld | number: '1.2-2' }}</td>
              <td class="text-right">@if (!readOnly()) { <button type="button" class="btn-ghost px-2 py-0.5 text-sm" (click)="editAgent(a)">Edit</button> }</td></tr>
          } @empty { <tr><td colspan="4" class="py-4 text-center text-ink/70">No agents yet.</td></tr> }
        </tbody>
      </table>
      @if (!readOnly()) {
        <form class="mt-3 space-y-2 rounded-lg border border-ink/15 p-3" autocomplete="off" (submit)="$event.preventDefault(); saveAgent()">
          <p class="text-sm font-semibold">{{ agentEditing() ? 'Edit agent' : 'New agent' }}</p>
          <div class="grid gap-2 sm:grid-cols-2">
            <div><label class="app-label" for="ag-name">Name</label><input id="ag-name" class="app-input" maxlength="120" autocomplete="off" data-testid="agent-name" [ngModel]="agentForm().name" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchAgent({ name: $event })" />
              @if (fe('name')) { <p class="app-error" role="alert" data-testid="agent-name-error">{{ fe('name') }}</p> }</div>
            <div><label class="app-label" for="ag-phone">Phone (optional)</label><input id="ag-phone" class="app-input font-mono" maxlength="30" autocomplete="off" data-testid="agent-phone" [ngModel]="agentForm().phone" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchAgent({ phone: $event || null })" /></div>
          </div>
          <div><label class="app-label" for="ag-address">Address (optional)</label><input id="ag-address" class="app-input" maxlength="300" autocomplete="off" [ngModel]="agentForm().address" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchAgent({ address: $event || null })" /></div>
          @if (agentEditing()) { <label class="flex items-center gap-2 text-sm"><input type="checkbox" [checked]="agentForm().isActive" (change)="patchAgent({ isActive: !agentForm().isActive })" /> Active</label>
            @if (fe('isActive')) { <p class="app-error" role="alert">{{ fe('isActive') }}</p> } }
          @if (dialogError()) { <p class="sys-alert sys-alert-danger" role="alert">{{ dialogError() }}</p> }
          <div class="flex justify-end gap-2">@if (agentEditing()) { <button type="button" class="btn-ghost" (click)="editAgent(null)">New instead</button> }
            <button type="submit" class="btn-primary" data-testid="agent-save" [disabled]="busy() || !agentForm().name.trim()">Save agent</button></div>
        </form>
      }
    </zp-dialog>
  `
})
export class ConsignmentsComponent {
  private readonly api = inject(ConsignmentsApi);
  private readonly inventory = inject(InventoryApi);
  private readonly auth = inject(AuthService);
  private readonly branches = inject(BranchContextService);
  private readonly toast = inject(ToastService);

  protected readonly branchId = this.branches.activeId;
  protected readonly rows = signal<readonly ConsignmentDto[]>([]);
  protected readonly agents = signal<readonly ConsignmentAgentDto[]>([]);
  protected readonly status = signal<'Open' | 'Closed' | ''>('Open');
  protected readonly search = signal('');
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly noticeToTill = signal(false);
  protected readonly dialog = signal<'new' | 'sold' | 'returned' | 'undo' | 'agents' | null>(null);
  protected readonly dialogError = signal<string | null>(null);
  private readonly fieldErrors = signal<Readonly<Record<string, readonly string[]>>>({});

  protected readonly agentId = signal<string | null>(null);
  protected readonly note = signal('');
  protected readonly draft = signal<readonly DraftLine[]>([]);
  protected readonly itemSearch = signal('');
  protected readonly itemResults = signal<readonly InventoryItemDto[]>([]);
  protected readonly current = signal<ConsignmentDto | null>(null);
  protected readonly quantities = signal<Readonly<Record<string, number>>>({});
  protected readonly undoing = signal<ConsignmentSaleDto | null>(null);
  protected readonly reason = signal('');
  protected readonly agentEditing = signal<ConsignmentAgentDto | null>(null);
  protected readonly agentForm = signal<{ name: string; phone: string | null; address: string | null; notes: string | null; isActive: boolean }>({ name: '', phone: null, address: null, notes: null, isActive: true });
  private seq = 0;

  protected readonly readOnly = computed(() => this.auth.accessModeFor(FEATURES.INVENTORY) === 'readonly');
  protected readonly canPrice = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.PRODUCTS_MANAGE));
  protected readonly activeAgents = computed(() => this.agents().filter((a) => a.isActive));
  protected readonly agentOptions = computed<readonly SelectOption[]>(() => this.activeAgents().map((a) => ({ value: a.id, label: a.name })));
  protected readonly draftValid = computed(() => this.draft().length > 0 && this.draft().every((d) => d.quantity > 0 && d.unitPrice > 0));
  protected readonly anyQuantity = computed(() => Object.values(this.quantities()).some((q) => q > 0));

  constructor() {
    void this.branches.load();
    void this.loadAgents();
    effect(() => { this.branchId(); untracked(() => void this.load()); }, { allowSignalWrites: true });
  }

  protected fe = (name: string): string | null => this.fieldErrors()[name]?.[0] ?? null;

  protected async load(): Promise<void> {
    const branchId = this.branchId();
    if (!branchId) { this.rows.set([]); return; }
    this.loading.set(true);
    this.error.set(null);
    try { this.rows.set((await firstValueFrom(this.api.list({ branchId, status: this.status(), search: this.search().trim() }))).items); }
    catch (err) { this.error.set(toApiError(err).message); }
    finally { this.loading.set(false); }
  }

  private async loadAgents(): Promise<void> {
    try { this.agents.set(await firstValueFrom(this.api.agents(true))); }
    catch (err) { this.error.set(toApiError(err).message); }
  }

  private fail(err: unknown): void {
    const e = toApiError(err) as ApiError;
    this.fieldErrors.set(e.fieldErrors);
    this.dialogError.set(Object.keys(e.fieldErrors).length === 0 ? e.message : null);
  }

  private reset(): void {
    this.fieldErrors.set({});
    this.dialogError.set(null);
    this.notice.set(null);
    this.noticeToTill.set(false);
  }

  // ---- Send out ----

  protected openNew(): void {
    this.reset();
    this.agentId.set(null);
    this.note.set('');
    this.draft.set([]);
    this.itemSearch.set('');
    this.itemResults.set([]);
    this.dialog.set('new');
  }

  protected findItems(text: string): void {
    this.itemSearch.set(text);
    const mine = ++this.seq;
    if (text.trim().length < 2) { this.itemResults.set([]); return; }
    void firstValueFrom(this.inventory.items({ search: text.trim(), active: true, pageSize: 8 }))
      .then((r) => { if (mine === this.seq) this.itemResults.set(r.items.filter((i) => !this.draft().some((d) => d.item.id === i.id))); })
      .catch((err) => this.dialogError.set(toApiError(err).message));
  }

  protected addDraft(item: InventoryItemDto): void {
    this.draft.update((d) => [...d, { item, quantity: 1, unitPrice: item.sellingPrice ?? 0 }]);
    this.itemResults.set([]);
    this.itemSearch.set('');
  }

  protected patchDraft(itemId: string, p: Partial<DraftLine>): void { this.draft.update((d) => d.map((x) => (x.item.id === itemId ? { ...x, ...p } : x))); }
  protected removeDraft(itemId: string): void { this.draft.update((d) => d.filter((x) => x.item.id !== itemId)); }

  protected async send(): Promise<void> {
    const branchId = this.branchId();
    const agentId = this.agentId();
    if (!branchId || !agentId) return;
    this.busy.set(true);
    this.reset();
    try {
      const c = await firstValueFrom(this.api.send({ branchId, agentId, note: this.note().trim() || null, lines: this.draft().map((d) => ({ inventoryItemId: d.item.id, quantity: d.quantity, unitPrice: d.unitPrice })) }));
      this.dialog.set(null);
      this.notice.set(`Consignment #${c.number} sent to ${c.agentName}. The goods are off this branch's shelf.`);
      this.status.set('Open');
      await Promise.all([this.load(), this.loadAgents()]);
    } catch (err) { this.fail(err); }
    finally { this.busy.set(false); }
  }

  // ---- Sold / returned ----

  protected openQuantities(c: ConsignmentDto, what: 'sold' | 'returned'): void {
    this.reset();
    this.current.set(c);
    this.quantities.set({});
    this.dialog.set(what);
  }

  protected setQuantity(lineId: string, value: unknown): void {
    const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
    this.quantities.update((q) => ({ ...q, [lineId]: Number.isFinite(n) ? n : 0 }));
  }

  protected async saveQuantities(): Promise<void> {
    const c = this.current();
    const what = this.dialog();
    if (!c || (what !== 'sold' && what !== 'returned')) return;
    const lines = Object.entries(this.quantities()).filter(([, q]) => q > 0).map(([lineId, quantity]) => ({ lineId, quantity }));
    this.busy.set(true);
    this.reset();
    try {
      const after = await firstValueFrom(what === 'sold' ? this.api.sold(c.id, lines) : this.api.returned(c.id, lines));
      this.dialog.set(null);
      if (what === 'sold') {
        const bill = after.sales[after.sales.length - 1];
        this.notice.set(`Bill #${bill?.orderNumber} opened for ${c.agentName}: ${bill?.total} to pay.`);
        this.noticeToTill.set(true);
      } else this.notice.set('Returned goods are back on the shelf.');
      await Promise.all([this.load(), this.loadAgents()]);
    } catch (err) {
      const e = toApiError(err);
      this.dialogError.set(Object.values(e.fieldErrors ?? {})[0]?.[0] ?? e.message);
    } finally { this.busy.set(false); }
  }

  protected openUndo(c: ConsignmentDto, s: ConsignmentSaleDto): void {
    this.reset();
    this.current.set(c);
    this.undoing.set(s);
    this.reason.set('');
    this.dialog.set('undo');
  }

  protected async undo(): Promise<void> {
    const c = this.current();
    const s = this.undoing();
    if (!c || !s) return;
    this.busy.set(true);
    this.dialogError.set(null);
    try {
      await firstValueFrom(this.api.cancelSold(c.id, s.id, this.reason().trim()));
      this.dialog.set(null);
      this.notice.set(`Bill #${s.orderNumber} is closed; the goods count as still with ${c.agentName}.`);
      await Promise.all([this.load(), this.loadAgents()]);
    } catch (err) { this.dialogError.set(toApiError(err).message); }
    finally { this.busy.set(false); }
  }

  // ---- Agents ----

  protected openAgents(): void {
    this.reset();
    this.editAgent(null);
    this.dialog.set('agents');
    void this.loadAgents();
  }

  protected editAgent(a: ConsignmentAgentDto | null): void {
    this.agentEditing.set(a);
    this.agentForm.set(a ? { name: a.name, phone: a.phone, address: a.address, notes: a.notes, isActive: a.isActive } : { name: '', phone: null, address: null, notes: null, isActive: true });
    this.fieldErrors.set({});
    this.dialogError.set(null);
  }

  protected patchAgent(p: Partial<{ name: string; phone: string | null; address: string | null; notes: string | null; isActive: boolean }>): void { this.agentForm.update((f) => ({ ...f, ...p })); }

  protected async saveAgent(): Promise<void> {
    this.busy.set(true);
    this.fieldErrors.set({});
    this.dialogError.set(null);
    const editing = this.agentEditing();
    try {
      await firstValueFrom(this.api.saveAgent(editing?.id ?? null, { ...this.agentForm(), name: this.agentForm().name.trim(), rowVersion: editing?.rowVersion ?? null }));
      this.toast.success('Agent saved.');
      this.editAgent(null);
      await this.loadAgents();
    } catch (err) { this.fail(err); }
    finally { this.busy.set(false); }
  }
}
