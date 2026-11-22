import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { MARKET_EXPENSE_LABELS, MarketExpenseCategory, MarketRunDto, MarketRunStatus } from '../../core/models/kitchen.model';
import { InventoryItemDto } from '../../core/models/ops.model';
import { BinDto } from '../../core/models/purchasing.model';
import { FEATURES, SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { BranchContextService } from '../../core/services/branch-context.service';
import { KitchenApi } from '../../core/services/kitchen.services';
import { InventoryApi } from '../../core/services/ops.services';
import { BinApi } from '../../core/services/purchasing.services';
import { DialogComponent, ToastService } from '../../shared/ui/feedback';
import { SearchSelectComponent, SelectOption } from '../../shared/ui/search-select.component';

interface LineForm { inventoryItemId: string; quantity: number; amountPaid: number }
interface ExpenseForm { category: MarketExpenseCategory; amount: number; justification: string }
interface RunForm { marketName: string; cashGiven: number; changeReturned: number; binId: string | null; note: string; lines: LineForm[]; expenses: ExpenseForm[]; receipts: string[] }

/**
 * Market runs (owner's decisions, 2026-11-21): cash buying at a market with no supplier or order. The stock goes in at once so the kitchen can cook; a manager who is not the buyer
 * confirms it afterwards or queries it. The cash is reconciled on the run: given = goods + expenses + change handed back, and any difference is kept and shown. Money spent that is not
 * stock (transport, loaders and carriers, local levies and security, water and small things) is a line of its own with a reason, and never changes what an ingredient costs.
 */
@Component({
    selector: 'zp-market-runs',
    imports: [DatePipe, DecimalPipe, FormsModule, DialogComponent, SearchSelectComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="flex flex-col gap-4" data-testid="market-runs">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 class="text-2xl font-bold">Market runs</h1>
          <p class="text-sm text-ink/70">Cash buying at a market. The stock is counted in as soon as you record it; a manager confirms the run afterwards.</p>
        </div>
        @if (canRecord()) { <button type="button" class="btn-primary" data-testid="run-new" [disabled]="readOnly() || !branches.activeId()" (click)="open()">Record a market run</button> }
      </div>
      @if (error()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="runs-error">{{ error() }}</p> }
      @if (readOnly()) { <p class="sys-alert sys-alert-info" role="status">Your subscription is read-only: runs can be seen but not recorded or confirmed.</p> }
      @if (!branches.activeId()) { <p class="sys-alert sys-alert-warning" role="status">You are not assigned to a branch yet.</p> }

      <div class="flex items-center gap-2"><label class="text-sm font-semibold" for="mr-status">Show</label>
        <select id="mr-status" class="app-input w-56" data-testid="runs-status" [ngModel]="status()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="status.set($event); reload()">
          <option value="">Every run</option><option value="ToConfirm">Waiting to be confirmed</option><option value="Queried">Queried</option><option value="Confirmed">Confirmed</option></select></div>

      <div class="space-y-3" data-testid="runs-list">
        @for (r of runs(); track r.id) {
          <article class="app-card space-y-2" [attr.data-testid]="'run-row-' + r.number">
            <header class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="text-lg font-semibold">#{{ r.number }} at {{ r.marketName }}</h2>
              <span class="flex gap-1"><span class="app-badge" [class]="badge(r.status)" [attr.data-testid]="'run-status-' + r.number">{{ label(r.status) }}</span>@if (r.hasFlaggedExpense) { <span class="app-badge app-badge-warning" title="Includes local levies or security">Levies</span> }</span>
            </header>
            <p class="text-xs text-ink/70">{{ r.buyerName }}, {{ r.ranOnUtc | date: 'd MMM yyyy, HH:mm' }}@if (r.note) { . "{{ r.note }}" }</p>
            <div class="grid gap-2 text-sm sm:grid-cols-5">
              <div>Cash given<strong class="block">{{ r.cashGiven | number: '1.2-2' }}</strong></div>
              <div>Goods<strong class="block">{{ r.goodsTotal | number: '1.2-2' }}</strong></div>
              <div>Expenses<strong class="block">{{ r.expensesTotal | number: '1.2-2' }}</strong></div>
              <div>Change back<strong class="block">{{ r.changeReturned | number: '1.2-2' }}</strong></div>
              <div [class.text-danger]="r.difference !== 0">Not accounted for<strong class="block" [attr.data-testid]="'run-difference-' + r.number">{{ r.difference | number: '1.2-2' }}</strong></div>
            </div>
            <details><summary class="cursor-pointer text-sm font-semibold">What was bought and spent</summary>
              <ul class="mt-1 text-sm">@for (l of r.lines; track l.id) { <li>{{ l.quantity | number: '1.0-3' }} {{ l.itemName }}: {{ l.amountPaid | number: '1.2-2' }}</li> }
                @for (e of r.expenses; track e.id) { <li [class.font-semibold]="e.flagged">{{ label2(e.category) }} {{ e.amount | number: '1.2-2' }}: {{ e.justification }}</li> }</ul></details>
            @if (r.confirmedByName) { <p class="text-sm">{{ r.status === 'Confirmed' ? 'Confirmed' : 'Queried' }} by {{ r.confirmedByName }}@if (r.confirmNote) { : {{ r.confirmNote }} }</p> }
            @if (canConfirm() && r.status !== 'Confirmed' && !readOnly()) {
              <div class="flex flex-wrap gap-2">
                <button type="button" class="btn-primary" [attr.data-testid]="'run-confirm-' + r.number" (click)="decide(r, 'confirm')">Confirm</button>
                @if (r.status === 'ToConfirm') { <button type="button" class="btn-outline" [attr.data-testid]="'run-query-' + r.number" (click)="decide(r, 'query')">Query</button> }
              </div>
            }
          </article>
        } @empty { <p class="app-card py-8 text-center text-ink/70" data-testid="runs-empty">{{ loading() ? 'Loading...' : 'No market runs.' }}</p> }
      </div>
    </div>

    <zp-dialog [open]="!!form()" title="Record a market run" (closed)="form.set(null)">
      @if (form(); as f) {
        <form class="space-y-3" (submit)="$event.preventDefault(); save()" data-testid="run-form">
          <div class="grid gap-3 sm:grid-cols-3">
            <div class="sm:col-span-3"><label class="app-label" for="mr-market">Which market</label><input id="mr-market" class="app-input" maxlength="120" data-testid="run-market" [ngModel]="f.marketName" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ marketName: $event })" /></div>
            <div><label class="app-label" for="mr-given">Cash you were given</label><input id="mr-given" type="number" min="0" step="any" class="app-input" data-testid="run-given" [ngModel]="f.cashGiven" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ cashGiven: +$event })" /></div>
            <div><label class="app-label" for="mr-change">Change you hand back</label><input id="mr-change" type="number" min="0" step="any" class="app-input" data-testid="run-change" [ngModel]="f.changeReturned" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ changeReturned: +$event })" /></div>
            <div><label class="app-label" for="mr-bin">Put it in</label><zp-search-select inputId="mr-bin" testId="run-bin" emptyLabel="No bin" noun="bin" placeholder="Search bins" [options]="binOptions()" [value]="f.binId" (valueChange)="patch({ binId: $event || null })" /></div>
          </div>

          <fieldset class="rounded-lg border border-ink/15 p-3"><legend class="px-1 text-sm font-semibold">What was bought</legend>
            @for (l of f.lines; track $index) {
              <div class="mb-2 grid grid-cols-[1fr_6rem_7rem_auto] items-end gap-2">
                <zp-search-select ariaLabel="Item" [testId]="'run-item-' + $index" emptyLabel="Choose an item" noun="item" placeholder="Search items" [options]="itemOptions()" [value]="l.inventoryItemId" (valueChange)="patchLine($index, { inventoryItemId: $event })" />
                <input type="number" min="0" step="any" class="app-input" aria-label="How much" placeholder="How much" [attr.data-testid]="'run-qty-' + $index" [ngModel]="l.quantity" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchLine($index, { quantity: +$event })" />
                <input type="number" min="0" step="any" class="app-input" aria-label="Paid for all of it" placeholder="Paid" [attr.data-testid]="'run-paid-' + $index" [ngModel]="l.amountPaid" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchLine($index, { amountPaid: +$event })" />
                <button type="button" class="btn-ghost px-2" aria-label="Remove" (click)="removeLine($index)">x</button>
              </div>
            }
            <button type="button" class="btn-outline text-sm" data-testid="run-add-line" (click)="addLine()">Add an item</button>
            <p class="mt-1 text-xs text-ink/70">The quantity is in the item's own unit (grams, millilitres, each); "Paid" is what all of it cost. Items with a shelf life get their expiry date by themselves.</p>
          </fieldset>

          <fieldset class="rounded-lg border border-ink/15 p-3"><legend class="px-1 text-sm font-semibold">Other money spent (not stock)</legend>
            @for (e of f.expenses; track $index) {
              <div class="mb-2 grid grid-cols-[10rem_6rem_1fr_auto] items-end gap-2">
                <select class="app-input" aria-label="What it was for" [attr.data-testid]="'run-exp-cat-' + $index" [ngModel]="e.category" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchExpense($index, { category: $event })">@for (c of categories; track c) { <option [value]="c">{{ label2(c) }}</option> }</select>
                <input type="number" min="0" step="any" class="app-input" aria-label="Amount" placeholder="Amount" [attr.data-testid]="'run-exp-amount-' + $index" [ngModel]="e.amount" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchExpense($index, { amount: +$event })" />
                <input class="app-input" aria-label="Why" maxlength="300" placeholder="Why it was spent (required)" [attr.data-testid]="'run-exp-why-' + $index" [ngModel]="e.justification" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchExpense($index, { justification: $event })" />
                <button type="button" class="btn-ghost px-2" aria-label="Remove" (click)="removeExpense($index)">x</button>
              </div>
            }
            <button type="button" class="btn-outline text-sm" data-testid="run-add-expense" (click)="addExpense()">Add an expense</button>
            <p class="mt-1 text-xs text-ink/70">Transport, loaders and carriers, local levies and security, water and small things bought on the day. Each needs a reason; levies are flagged for the manager. These never change what an ingredient costs.</p>
          </fieldset>

          <div><label class="app-label" for="mr-photo">Photos of the receipts</label><input id="mr-photo" type="file" accept="image/*" class="app-input" data-testid="run-photo" (change)="addPhoto($event)" />
            <p class="app-hint" data-testid="run-photo-count">{{ f.receipts.length }} photo{{ f.receipts.length === 1 ? '' : 's' }} added.</p></div>
          <div><label class="app-label" for="mr-note">Note (optional)</label><input id="mr-note" class="app-input" maxlength="500" data-testid="run-note" [ngModel]="f.note" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ note: $event })" /></div>

          <p class="rounded-lg bg-ink/5 p-2 text-sm" data-testid="run-sum">Given {{ f.cashGiven | number: '1.2-2' }} - goods {{ goods() | number: '1.2-2' }} - expenses {{ spent() | number: '1.2-2' }} - change {{ f.changeReturned | number: '1.2-2' }} =
            <strong [class.text-danger]="difference() !== 0" data-testid="run-diff">{{ difference() | number: '1.2-2' }}</strong> not accounted for.</p>
          @if (dialogError()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="run-error">{{ dialogError() }}</p> }
          <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="form.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="run-save" [disabled]="busy() || validLines().length === 0 || !f.marketName.trim()">{{ busy() ? 'Saving...' : 'Record the run' }}</button></div>
        </form>
      }
    </zp-dialog>

    <zp-dialog [open]="!!deciding()" [title]="deciding() ? (deciding()!.mode === 'confirm' ? 'Confirm #' : 'Query #') + deciding()!.run.number : ''" (closed)="deciding.set(null)">
      <form class="space-y-3" (submit)="$event.preventDefault(); sendDecision()" data-testid="decide-form">
        <div><label class="app-label" for="dc-note">{{ deciding()?.mode === 'query' ? 'What needs explaining' : 'A note (optional)' }}</label><input id="dc-note" class="app-input" maxlength="500" data-testid="decide-note" [ngModel]="note()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="note.set($event)" /></div>
        @if (dialogError()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="decide-error">{{ dialogError() }}</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="deciding.set(null)">Back</button><button type="submit" class="btn-primary" data-testid="decide-send" [disabled]="busy() || (deciding()?.mode === 'query' && note().trim().length < 3)">{{ deciding()?.mode === 'confirm' ? 'Confirm the run' : 'Send the query' }}</button></div>
      </form>
    </zp-dialog>
  `
})
export class MarketRunsComponent {
  private readonly api = inject(KitchenApi);
  private readonly inventory = inject(InventoryApi);
  private readonly binApi = inject(BinApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  protected readonly branches = inject(BranchContextService);

  protected readonly categories: readonly MarketExpenseCategory[] = ['Transport', 'LoadersAndCarriers', 'LocalLeviesAndSecurity', 'WaterAndSmallItems'];
  protected readonly runs = signal<readonly MarketRunDto[]>([]);
  protected readonly items = signal<readonly InventoryItemDto[]>([]);
  protected readonly bins = signal<readonly BinDto[]>([]);
  protected readonly itemOptions = computed<readonly SelectOption[]>(() => this.items().map((i) => ({ value: i.id, label: `${i.name} (${this.unit(i)})` })));
  protected readonly binOptions = computed<readonly SelectOption[]>(() => this.bins().map((b) => ({ value: b.id, label: b.code })));
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly dialogError = signal<string | null>(null);
  protected readonly status = signal<MarketRunStatus | ''>('');
  protected readonly form = signal<RunForm | null>(null);
  protected readonly deciding = signal<{ run: MarketRunDto; mode: 'confirm' | 'query' } | null>(null);
  protected readonly note = signal('');
  private pendingId: string | null = null;

  protected readonly readOnly = computed(() => this.auth.accessModeFor(FEATURES.INVENTORY) === 'readonly');
  protected readonly canRecord = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.PURCHASING_MARKETRUN_RECORD));
  protected readonly canConfirm = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.PURCHASING_MARKETRUN_CONFIRM));
  protected readonly validLines = computed(() => (this.form()?.lines ?? []).filter((l) => l.inventoryItemId && l.quantity > 0));
  protected readonly goods = computed(() => this.validLines().reduce((s, l) => s + (l.amountPaid || 0), 0));
  protected readonly spent = computed(() => (this.form()?.expenses ?? []).reduce((s, e) => s + (e.amount || 0), 0));
  protected readonly difference = computed(() => Math.round(((this.form()?.cashGiven ?? 0) - this.goods() - this.spent() - (this.form()?.changeReturned ?? 0)) * 100) / 100);

  constructor() {
    effect(() => { this.branches.activeId(); untracked(() => void this.reload()); }, { allowSignalWrites: true });
  }

  protected label(s: MarketRunStatus): string { return s === 'ToConfirm' ? 'Waiting to be confirmed' : s === 'Queried' ? 'Queried' : 'Confirmed'; }
  protected badge(s: MarketRunStatus): string { return s === 'Confirmed' ? 'app-badge-success' : 'app-badge-warning'; }
  protected label2(c: MarketExpenseCategory): string { return MARKET_EXPENSE_LABELS[c]; }
  protected unit(i: InventoryItemDto): string { return i.baseUnit === 'Milliliter' ? 'ml' : i.baseUnit === 'Gram' ? 'g' : 'each'; }

  protected async reload(): Promise<void> {
    const branch = this.branches.activeId();
    if (!branch) return;
    this.loading.set(true);
    this.error.set(null);
    try { this.runs.set(await firstValueFrom(this.api.marketRuns(branch, this.status() || null))); }
    catch (err) { this.error.set(toApiError(err).message); } finally { this.loading.set(false); }
  }

  protected async open(): Promise<void> {
    const branch = this.branches.activeId();
    if (!branch) return;
    this.dialogError.set(null);
    this.pendingId = null;
    this.form.set({ marketName: '', cashGiven: 0, changeReturned: 0, binId: null, note: '', lines: [{ inventoryItemId: '', quantity: 0, amountPaid: 0 }], expenses: [], receipts: [] });
    try {
      if (this.items().length === 0) this.items.set((await firstValueFrom(this.inventory.items({ pageSize: 500 }))).items);
      this.bins.set((await firstValueFrom(this.binApi.list({ branchId: branch, includeInactive: false }))).filter((b) => !b.isHighSecurity));
    } catch (err) { this.dialogError.set(toApiError(err).message); }
  }

  protected patch(p: Partial<RunForm>): void { this.form.update((f) => (f ? { ...f, ...p } : f)); }
  protected addLine(): void { this.form.update((f) => (f ? { ...f, lines: [...f.lines, { inventoryItemId: '', quantity: 0, amountPaid: 0 }] } : f)); }
  protected removeLine(i: number): void { this.form.update((f) => (f ? { ...f, lines: f.lines.filter((_, n) => n !== i) } : f)); }
  protected patchLine(i: number, p: Partial<LineForm>): void { this.form.update((f) => (f ? { ...f, lines: f.lines.map((l, n) => (n === i ? { ...l, ...p } : l)) } : f)); }
  protected addExpense(): void { this.form.update((f) => (f ? { ...f, expenses: [...f.expenses, { category: 'Transport', amount: 0, justification: '' }] } : f)); }
  protected removeExpense(i: number): void { this.form.update((f) => (f ? { ...f, expenses: f.expenses.filter((_, n) => n !== i) } : f)); }
  protected patchExpense(i: number, p: Partial<ExpenseForm>): void { this.form.update((f) => (f ? { ...f, expenses: f.expenses.map((e, n) => (n === i ? { ...e, ...p } : e)) } : f)); }

  protected async addPhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.dialogError.set(null);
    try {
      const saved = await firstValueFrom(this.api.uploadReceipt(file));
      this.form.update((f) => (f ? { ...f, receipts: [...f.receipts, saved.id] } : f));
    } catch (err) { this.dialogError.set(toApiError(err).message); }
    input.value = '';
  }

  protected async save(): Promise<void> {
    const f = this.form(); const branch = this.branches.activeId();
    if (!f || !branch || this.busy()) return;
    this.busy.set(true);
    this.dialogError.set(null);
    this.pendingId ??= crypto.randomUUID();
    try {
      const run = await firstValueFrom(this.api.recordMarketRun({
        id: this.pendingId, branchId: branch, marketName: f.marketName.trim(), cashGiven: f.cashGiven, changeReturned: f.changeReturned, binId: f.binId, note: f.note.trim() || null, receiptMediaIds: f.receipts,
        lines: this.validLines().map((l) => ({ inventoryItemId: l.inventoryItemId, quantity: l.quantity, amountPaid: l.amountPaid, lotCode: null, expiryDate: null })),
        expenses: f.expenses.filter((e) => e.amount > 0 || e.justification.trim()).map((e) => ({ category: e.category, amount: e.amount, justification: e.justification.trim() }))
      }));
      this.pendingId = null;
      this.form.set(null);
      this.toast.success(`Run #${run.number} recorded. The stock is in; a manager will confirm it.`);
      await this.reload();
    } catch (err) {
      const e = toApiError(err);
      this.dialogError.set(e.fieldErrors['expenses']?.[0] ?? e.fieldErrors['lines']?.[0] ?? e.fieldErrors['changeReturned']?.[0] ?? e.message);
    } finally { this.busy.set(false); }
  }

  protected decide(run: MarketRunDto, mode: 'confirm' | 'query'): void { this.dialogError.set(null); this.note.set(''); this.deciding.set({ run, mode }); }

  protected async sendDecision(): Promise<void> {
    const d = this.deciding();
    if (!d || this.busy()) return;
    this.busy.set(true);
    this.dialogError.set(null);
    try {
      await firstValueFrom(d.mode === 'confirm' ? this.api.confirmMarketRun(d.run.id, this.note().trim() || null, d.run.rowVersion) : this.api.queryMarketRun(d.run.id, this.note().trim(), d.run.rowVersion));
      this.deciding.set(null);
      this.toast.success(d.mode === 'confirm' ? 'Confirmed.' : 'Queried. The buyer is told.');
      await this.reload();
    } catch (err) { this.dialogError.set(toApiError(err).message); } finally { this.busy.set(false); }
  }
}
