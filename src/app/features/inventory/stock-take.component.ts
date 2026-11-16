import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { StockGroupDto, StockTakeDto, StockTakeLineDto, StockTakeStatus } from '../../core/models/nav-ops.model';
import { FEATURES, SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { InventoryItemDto } from '../../core/models/ops.model';
import { ReportDefinition } from '../../core/navigation/report-definitions';
import { TenantTimePipe } from '../../core/pipes/tenant-time.pipe';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { BranchContextService } from '../../core/services/branch-context.service';
import { StockGroupApi, StockTakeApi } from '../../core/services/nav-ops.services';
import { InventoryApi } from '../../core/services/ops.services';
import { CameraScannerComponent, type ScanFeedback } from '../../shared/ui/camera-scanner.component';
import { ConfirmService, DialogComponent, ToastService } from '../../shared/ui/feedback';
import { BranchPickerComponent } from '../../shared/ui/ops-chrome.components';
import { SearchSelectComponent, SelectOption } from '../../shared/ui/search-select.component';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';
import { ReportViewComponent } from '../reports/report-view.component';

interface Edit { counted: string; explanation: string }

/**
 * Stock take: physical counts reconciled against a snapshot of expected stock. States: Draft, Counting, Submitted, Approved or Rejected,
 * Reconciled, Cancelled. The correction is counted minus the SNAPSHOT, so sales during the count are preserved; it is booked once,
 * through the stock ledger, after somebody other than the counter approves it. The second tab is the variance report.
 */
@Component({
    selector: 'zp-stock-take',
    imports: [DecimalPipe, FormsModule, TenantTimePipe, DialogComponent, StatusBadgeComponent, BranchPickerComponent, SearchSelectComponent, ReportViewComponent, CameraScannerComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-bold">Stock Take Report</h1>
      <zp-branch-picker />
    </div>
    @if (readOnly()) { <p class="sys-alert sys-alert-warning mb-3" role="status">Read-only: your subscription limits this screen.</p> }
    <div class="mb-4 flex gap-1 border-b border-ink/15" role="tablist">
      <button type="button" role="tab" class="px-4 py-2 font-medium" data-testid="tab-counts" [attr.aria-selected]="tab() === 'counts'" [class]="tab() === 'counts' ? 'border-b-2 border-primary text-ink' : 'text-ink/70'" (click)="tab.set('counts')">Counts</button>
      <button type="button" role="tab" class="px-4 py-2 font-medium" data-testid="tab-report" [attr.aria-selected]="tab() === 'report'" [class]="tab() === 'report' ? 'border-b-2 border-primary text-ink' : 'text-ink/70'" (click)="tab.set('report')">Variance report</button>
    </div>

    @if (tab() === 'report') {
      <zp-report-view [definition]="definition" title="Stock take variances" description="Sessions and the differences found, from the saved counts." [syncUrl]="false" [fixed]="{ type: 'variances' }" />
    } @else {
      @if (error()) { <p class="sys-alert sys-alert-danger mb-3" role="alert" data-testid="take-error">{{ error() }}</p> }
      @if (!branches.activeId()) { <p class="sys-alert sys-alert-warning" role="status">You are not assigned to a branch yet.</p> }
      @else if (!open()) {
        <div class="mb-3 flex items-center justify-between"><h2 class="text-lg font-semibold">Stock takes at {{ branches.active()?.name }}</h2>
          @if (canPerform() && !readOnly()) { <button type="button" class="btn-primary" data-testid="take-new" (click)="newOpen.set(true)">New stock take</button> }</div>
        <div class="app-card overflow-x-auto p-0"><table class="app-table" data-testid="take-list">
          <thead><tr><th>#</th><th>Created</th><th>Status</th><th>Counted</th><th>Blind</th><th>By</th><th></th></tr></thead>
          <tbody>@for (t of takes(); track t.id) {
            <tr [attr.data-testid]="'take-' + t.number"><td>{{ t.number }}</td><td class="text-xs">{{ t.dateCreated | tenantTime }}</td><td><zp-status-badge [tone]="tone(t.status)">{{ t.status }}</zp-status-badge></td>
              <td>{{ t.countedCount }} / {{ t.lineCount }}</td><td>{{ t.isBlind ? 'Yes' : 'No' }}</td><td>{{ t.createdByName }}</td>
              <td class="text-right"><button type="button" class="btn-outline px-2 py-1 text-sm" [attr.data-testid]="'take-open-' + t.number" (click)="select(t.id)">Open</button></td></tr>
          } @empty { <tr><td colspan="7" class="py-8 text-center text-ink/70">{{ loading() ? 'Loading...' : 'No stock takes yet.' }}</td></tr> }</tbody></table></div>
      } @else {
        @let t = open()!;
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <button type="button" class="btn-ghost" (click)="close()">&larr; All stock takes</button>
          <div class="flex flex-wrap items-center gap-2" data-testid="take-actions">
            <zp-status-badge [tone]="tone(t.status)" data-testid="take-status">{{ t.status }}</zp-status-badge>
            @if (!readOnly()) {
              @if (t.status === 'Draft' && canPerform()) { <button type="button" class="btn-primary" data-testid="take-start" [disabled]="busy()" (click)="act('start')">Start counting</button> }
              @if (t.status === 'Counting' && canPerform()) {
                <button type="button" class="btn-outline" data-testid="take-save" [disabled]="busy() || dirtyCount() === 0" (click)="saveCounts()">Save counts ({{ dirtyCount() }})</button>
                <button type="button" class="btn-primary" data-testid="take-submit" [disabled]="busy()" (click)="submit()">Submit for review</button> }
              @if (t.status === 'Submitted' && canApprove()) {
                <button type="button" class="btn-primary" data-testid="take-approve" [disabled]="busy()" (click)="decision(true)">Approve</button>
                <button type="button" class="btn-outline" data-testid="take-reject" [disabled]="busy()" (click)="decision(false)">Reject</button> }
              @if (t.status === 'Approved' && canApprove()) { <button type="button" class="btn-primary" data-testid="take-reconcile" [disabled]="busy()" (click)="reconcile()">Reconcile (book corrections)</button> }
              @if (['Draft','Counting','Submitted','Approved'].includes(t.status) && canPerform()) { <button type="button" class="btn-ghost text-danger" data-testid="take-cancel" [disabled]="busy()" (click)="cancel()">Cancel</button> }
            }
          </div>
        </div>
        <p class="mb-2 text-sm text-ink/80" data-testid="take-meta">Stock take #{{ t.number }} &middot; {{ t.branchName }} @if (t.snapshotAtUtc) { &middot; expected quantities snapshotted {{ t.snapshotAtUtc | tenantTime }} } @if (t.isBlind) { &middot; blind count } @if (t.decidedByName) { &middot; {{ t.decidedByName }}: {{ t.decisionNote }} }</p>
        @if (t.status === 'Draft') { <p class="sys-alert sys-alert-info" role="status">Start counting to snapshot the expected quantities. Sales and receipts that happen during the count are kept: the correction is the counted quantity minus the snapshot.</p> }
        @if (t.isBlind && t.status === 'Counting' && !canApprove()) { <p class="sys-alert sys-alert-info mb-2" role="status">Blind count: expected quantities are hidden until the count is submitted.</p> }

        @if (t.lines && t.lines.length > 0) {
          <div class="mb-2 flex flex-wrap items-center gap-3"><input type="search" class="app-input max-w-xs" aria-label="Filter lines" placeholder="Filter items" data-testid="take-filter" [ngModel]="filter()" (ngModelChange)="filter.set($event)" />
            @if (editable()) {
              <div class="flex items-center gap-1">
                <input class="app-input w-44 max-md:min-h-11" placeholder="Scan or type a code" aria-label="Barcode or part number" data-testid="take-scan" [ngModel]="scanText()" (ngModelChange)="scanText.set($event)" (keydown.enter)="jumpFromBox(); $event.preventDefault()" />
                <button type="button" class="btn-outline max-md:min-h-11" aria-label="Scan with the camera" data-testid="take-scan-camera" (click)="openCamera()">Camera</button>
              </div>
            }
            @if (t.status === 'Counting' && canPerform()) { <div class="w-72"><zp-search-select label="Add an item not on the list" [options]="extraOptions()" [value]="null" placeholder="Search items" testId="take-extra" (valueChange)="addExtra($event)" /></div> }
            <label class="flex items-center gap-2 text-sm"><input type="checkbox" [checked]="onlyDiff()" (change)="onlyDiff.set(!onlyDiff())" /> Only differences</label></div>
          @if (scanNote(); as n) { <p class="mb-2 text-sm font-semibold" role="status" data-testid="take-scan-note" [class]="n.ok ? '' : 'text-danger'">{{ n.ok ? 'Found: ' : '' }}{{ n.text }}</p> }
          @if (unlisted(); as u) {
            <p class="sys-alert sys-alert-warning mb-2" role="status" data-testid="take-unlisted">{{ u.name }} is not on this count. <button type="button" class="btn-outline ml-2 px-2 py-0.5 text-sm max-md:min-h-11" data-testid="take-unlisted-add" (click)="addUnlisted(u)">Add it</button></p>
          }
          <div class="app-card overflow-x-auto p-0" [class]="editable() ? 'max-md:hidden' : ''"><table class="app-table" data-testid="take-lines">
            <thead><tr><th>Item</th><th class="text-right">Expected</th><th class="text-right">Counted</th><th class="text-right">Difference</th>@if (showValue()) { <th class="text-right">Value</th> }<th>Explanation</th></tr></thead>
            <tbody>@for (l of lines(); track l.id) {
              <tr [attr.data-testid]="'line-' + l.itemName">
                <td class="font-medium">{{ l.itemName }} <span class="text-xs text-ink/60">{{ unitText(l) }}</span>@if (l.isUnexpected) { <zp-status-badge tone="warning">Not on snapshot</zp-status-badge> } @if (l.isMissing) { <zp-status-badge tone="danger">Not counted</zp-status-badge> }</td>
                <td class="text-right">{{ l.expectedQuantity === null ? 'hidden' : (l.expectedQuantity | number: '1.0-4') }}</td>
                <td class="text-right">@if (editable()) { <input type="number" min="0" step="any" class="app-input w-28 py-1 text-right" [attr.aria-label]="'Counted ' + l.itemName" [attr.data-testid]="'count-' + l.itemName" [ngModel]="valueOf(l)" (ngModelChange)="setCount(l, $event)" /> } @else { {{ l.countedQuantity === null ? '' : (l.countedQuantity | number: '1.0-4') }} }</td>
                <td class="text-right" [class.text-danger]="(diff(l) ?? 0) !== 0">{{ diff(l) === null ? '' : (diff(l) | number: '1.0-4') }}</td>
                @if (showValue()) { <td class="text-right">{{ l.varianceValue === null ? '' : (l.varianceValue | number: '1.2-2') }}</td> }
                <td>@if (editable()) { <input class="app-input py-1" maxlength="300" [attr.aria-label]="'Explanation for ' + l.itemName" [attr.data-testid]="'explain-' + l.itemName" [ngModel]="explainOf(l)" (ngModelChange)="setExplain(l, $event)" /> } @else { {{ l.explanation }} }</td>
              </tr> }</tbody></table></div>
          @if (editable() && card(); as c) {
            <!-- A phone: one item at a time with a big number pad (the table is for wider screens). -->
            <section class="app-card md:hidden" aria-label="Count one item at a time" data-testid="take-card">
              <div class="mb-3">
                <div class="flex items-center justify-between text-sm"><span data-testid="card-position">Item {{ cardPosition() }} of {{ lines().length }}</span><span data-testid="card-progress">{{ countedLines() }} counted</span></div>
                <div class="mt-1 h-2 rounded-full bg-ink/10" role="progressbar" aria-label="Items counted" aria-valuemin="0" [attr.aria-valuemax]="totalLines()" [attr.aria-valuenow]="countedLines()"><div class="h-2 rounded-full bg-primary" [style.width.%]="totalLines() ? countedLines() * 100 / totalLines() : 0"></div></div>
              </div>
              <h2 class="text-xl font-bold leading-tight" data-testid="card-name">{{ c.itemName }}</h2>
              <p class="text-sm text-ink/70">{{ unitText(c) }}@if (c.sku) { &middot; {{ c.sku }} } @if (c.isUnexpected) { <zp-status-badge tone="warning">Not on snapshot</zp-status-badge> }</p>
              <dl class="my-3 grid grid-cols-2 gap-3 text-center">
                <div class="rounded-lg bg-ink/5 p-2"><dt class="text-xs text-ink/70">Expected</dt><dd class="text-lg font-semibold" data-testid="card-expected">{{ c.expectedQuantity === null ? 'hidden' : (c.expectedQuantity | number: '1.0-4') }}</dd></div>
                <div class="rounded-lg bg-ink/5 p-2"><dt class="text-xs text-ink/70">Difference</dt><dd class="text-lg font-semibold" [class.text-danger]="(diff(c) ?? 0) !== 0" data-testid="card-diff">{{ diff(c) === null ? '-' : (diff(c) | number: '1.0-4') }}</dd></div>
              </dl>
              <output class="mb-3 block rounded-xl border-2 border-primary/50 bg-panel py-3 text-center text-4xl font-bold tabular-nums" aria-live="polite" aria-label="Counted" data-testid="card-counted">{{ valueOf(c) || '-' }}</output>
              <div class="mb-2 grid grid-cols-2 gap-2">
                <button type="button" class="btn-outline min-h-12 text-lg font-semibold" aria-label="One fewer" data-testid="pad-minus" (click)="bump(-1)">-1</button>
                <button type="button" class="btn-outline min-h-12 text-lg font-semibold" aria-label="One more" data-testid="pad-plus" (click)="bump(1)">+1</button>
              </div>
              <div class="grid grid-cols-3 gap-2" role="group" aria-label="Number pad">
                @for (k of padKeys; track k) { <button type="button" class="btn-outline min-h-14 text-2xl font-semibold" [attr.data-testid]="'pad-' + k" [attr.aria-label]="k === 'back' ? 'Delete the last digit' : null" (click)="press(k)">{{ k === 'back' ? 'Del' : k }}</button> }
              </div>
              <details class="mt-3"><summary class="cursor-pointer text-sm underline">Add a note</summary>
                <input class="app-input mt-1" maxlength="300" aria-label="Note about this item" data-testid="card-note" [ngModel]="explainOf(c)" (ngModelChange)="setExplain(c, $event)" /></details>
              <div class="mt-3 grid grid-cols-2 gap-2">
                <button type="button" class="btn-outline min-h-14" data-testid="card-prev" [disabled]="cardPosition() <= 1" (click)="step(-1)">Previous</button>
                <button type="button" class="btn-primary min-h-14" data-testid="card-next" [disabled]="cardPosition() >= lines().length" (click)="step(1)">Next</button>
              </div>
              <button type="button" class="btn-ghost mt-2 min-h-12 w-full" data-testid="card-next-open" (click)="nextToCount()">Next not counted</button>
              <button type="button" class="btn-outline mt-2 min-h-12 w-full" data-testid="card-save" [disabled]="busy() || dirtyCount() === 0" (click)="saveCounts()">Save counts ({{ dirtyCount() }})</button>
            </section>
          }
        }
      }
    }

    <zp-camera-scanner [open]="cameraOpen()" title="Scan an item to count" [feedback]="cameraFeedback()" (scanned)="cameraScanned($event)" (closed)="closeCamera()" />

    <zp-dialog [open]="newOpen()" title="New stock take" (closed)="newOpen.set(false)">
      <form class="space-y-3" (submit)="$event.preventDefault(); create()">
        <p class="text-sm">Branch: <strong>{{ branches.active()?.name }}</strong></p>
        <div><label class="app-label" for="n-group">Limit to a stock group</label><select id="n-group" class="app-input" data-testid="take-group" [ngModel]="newGroup()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="newGroup.set($event)"><option value="">Every item</option>@for (g of groups(); track g.id) { <option [value]="g.id">{{ g.name }}</option> }</select></div>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" data-testid="take-blind" [checked]="newBlind()" (change)="newBlind.set(!newBlind())" /> Blind count (counters do not see expected quantities)</label>
        <div><label class="app-label" for="n-notes">Notes</label><input id="n-notes" class="app-input" maxlength="500" [ngModel]="newNotes()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="newNotes.set($event)" /></div>
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="newOpen.set(false)">Cancel</button><button type="submit" class="btn-primary" data-testid="take-create" [disabled]="busy()">Create</button></div>
      </form>
    </zp-dialog>

    <zp-dialog [open]="!!deciding()" [title]="deciding() === 'approve' ? 'Approve stock take' : 'Reject stock take'" (closed)="deciding.set(null)">
      <label class="app-label" for="d-note">Note @if (deciding() === 'reject') { (required) }</label><input id="d-note" class="app-input" data-testid="take-decision-note" maxlength="500" [ngModel]="decisionNote()" (ngModelChange)="decisionNote.set($event)" />
      <div class="mt-3 flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="deciding.set(null)">Cancel</button>
        <button type="button" class="btn-primary" data-testid="take-decision-confirm" [disabled]="busy() || (deciding() === 'reject' && decisionNote().trim().length < 3)" (click)="confirmDecision()">{{ deciding() === 'approve' ? 'Approve' : 'Reject' }}</button></div>
    </zp-dialog>
  `
})
export class StockTakeComponent implements OnInit {
  private readonly api = inject(StockTakeApi);
  private readonly groupApi = inject(StockGroupApi);
  private readonly inventory = inject(InventoryApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly route = inject(ActivatedRoute);
  protected readonly branches = inject(BranchContextService);

  protected readonly definition = this.route.snapshot.data['report'] as ReportDefinition;
  protected readonly tab = signal<'counts' | 'report'>('counts');
  protected readonly takes = signal<readonly StockTakeDto[]>([]);
  protected readonly open = signal<StockTakeDto | null>(null);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly groups = signal<readonly StockGroupDto[]>([]);
  protected readonly items = signal<readonly InventoryItemDto[]>([]);
  protected readonly edits = signal<ReadonlyMap<string, Edit>>(new Map());
  protected readonly filter = signal('');
  protected readonly onlyDiff = signal(false);
  protected readonly newOpen = signal(false);
  protected readonly newGroup = signal('');
  protected readonly newBlind = signal(false);
  protected readonly newNotes = signal('');
  protected readonly deciding = signal<'approve' | 'reject' | null>(null);
  protected readonly decisionNote = signal('');
  protected readonly scanText = signal('');
  protected readonly scanNote = signal<ScanFeedback | null>(null);
  protected readonly cameraOpen = signal(false);
  protected readonly cameraFeedback = signal<ScanFeedback | null>(null);
  /** A scanned item that exists but is not on this count, waiting for the person to add it. */
  protected readonly unlisted = signal<InventoryItemDto | null>(null);
  /** Where the phone's one-item card is in the list. */
  protected readonly cardIndex = signal(0);

  protected readonly readOnly = computed(() => this.auth.accessModeFor(FEATURES.INVENTORY) === 'readonly');
  protected readonly canPerform = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.INVENTORY_STOCKTAKE_PERFORM));
  protected readonly canApprove = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.INVENTORY_STOCKTAKE_APPROVE));
  protected readonly editable = computed(() => this.open()?.status === 'Counting' && this.canPerform() && !this.readOnly());
  protected readonly showValue = computed(() => (this.open()?.lines ?? []).some((l) => l.varianceValue !== null));
  protected readonly dirtyCount = computed(() => [...this.edits().values()].filter((e) => e.counted !== '').length);
  protected readonly lines = computed(() => {
    const q = this.filter().trim().toLowerCase();
    return (this.open()?.lines ?? []).filter((l) => (!q || l.itemName.toLowerCase().includes(q) || (l.sku ?? '').toLowerCase().includes(q)) && (!this.onlyDiff() || (this.diff(l) ?? 0) !== 0));
  });
  protected readonly extraOptions = computed<readonly SelectOption[]>(() => {
    const have = new Set((this.open()?.lines ?? []).map((l) => l.inventoryItemId));
    return this.items().filter((i) => !have.has(i.id) && i.isActive).map((i) => ({ value: i.id, label: i.name, description: i.sku ?? undefined }));
  });

  constructor() {
    effect(() => { this.branches.activeId(); untracked(() => { this.open.set(null); void this.loadList(); }); });
  }

  ngOnInit(): void {
    void this.branches.load();
    void firstValueFrom(this.groupApi.list(false)).then((g) => this.groups.set(g)).catch(() => undefined);
  }

  protected tone = (s: StockTakeStatus): 'success' | 'warning' | 'danger' | 'primary' => (s === 'Reconciled' || s === 'Approved' ? 'success' : s === 'Rejected' || s === 'Cancelled' ? 'danger' : s === 'Draft' ? 'primary' : 'warning');
  protected unitText = (l: StockTakeLineDto): string => (l.unit === 'Milliliter' ? 'ml' : l.unit === 'Gram' ? 'g' : 'each');

  protected diff(l: StockTakeLineDto): number | null {
    const e = this.edits().get(l.inventoryItemId);
    if (e && e.counted !== '' && l.expectedQuantity !== null) return Math.round((+e.counted - l.expectedQuantity) * 10000) / 10000;
    return l.variance;
  }

  protected valueOf = (l: StockTakeLineDto): string => this.edits().get(l.inventoryItemId)?.counted ?? (l.countedQuantity === null ? '' : String(l.countedQuantity));
  protected explainOf = (l: StockTakeLineDto): string => this.edits().get(l.inventoryItemId)?.explanation ?? l.explanation ?? '';

  protected setCount(l: StockTakeLineDto, v: unknown): void {
    this.edits.update((m) => { const n = new Map(m); const cur = n.get(l.inventoryItemId) ?? { counted: '', explanation: l.explanation ?? '' }; n.set(l.inventoryItemId, { ...cur, counted: v === null || v === '' ? '' : String(v) }); return n; });
  }

  protected setExplain(l: StockTakeLineDto, v: string): void {
    this.edits.update((m) => { const n = new Map(m); const cur = n.get(l.inventoryItemId) ?? { counted: l.countedQuantity === null ? '' : String(l.countedQuantity), explanation: '' }; n.set(l.inventoryItemId, { ...cur, explanation: v }); return n; });
  }

  // ---- scan to jump, and the phone's one-item-at-a-time card -----------------------------------------------------------------

  protected readonly padKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'] as const;

  /** The line the phone card shows: its place in the (filtered) list, never past the end. */
  protected readonly card = computed(() => { const ls = this.lines(); return ls.length === 0 ? null : ls[Math.min(this.cardIndex(), ls.length - 1)]!; });
  protected readonly cardPosition = computed(() => { const n = this.lines().length; return n === 0 ? 0 : Math.min(this.cardIndex(), n - 1) + 1; });
  protected readonly totalLines = computed(() => this.open()?.lines?.length ?? 0);
  protected readonly countedLines = computed(() => (this.open()?.lines ?? []).filter((l) => this.valueOf(l) !== '').length);

  /** A key of the number pad: digits, one decimal point, delete. The count is a text until saved, so "0." and "12" are both fine while typing. */
  protected press(key: (typeof this.padKeys)[number]): void {
    const l = this.card();
    if (!l) return;
    let v = this.valueOf(l);
    if (key === 'back') v = v.slice(0, -1);
    else if (key === '.') { if (v.includes('.')) return; v = v === '' ? '0.' : v + '.'; }
    else v = v === '0' ? key : v + key;
    if (v.length > 10) return;
    this.setCount(l, v);
  }

  /** +1 and -1: counting a shelf one by one. */
  protected bump(by: number): void {
    const l = this.card();
    if (!l) return;
    const now = Number(this.valueOf(l)) || 0;
    this.setCount(l, String(Math.max(0, Math.round((now + by) * 10000) / 10000)));
  }

  protected step(by: 1 | -1): void {
    const n = this.lines().length;
    if (n === 0) return;
    this.cardIndex.set(Math.max(0, Math.min(n - 1, Math.min(this.cardIndex(), n - 1) + by)));
  }

  /** The next item, after this one, that has no count yet (round to the start when the end is reached). */
  protected nextToCount(): void {
    const ls = this.lines();
    if (ls.length === 0) return;
    const from = Math.min(this.cardIndex(), ls.length - 1);
    for (let i = 1; i <= ls.length; i++) {
      const at = (from + i) % ls.length;
      if (this.valueOf(ls[at]!) === '') { this.cardIndex.set(at); return; }
    }
    this.toast.success('Every item on the list has a count.');
  }

  protected openCamera(): void { this.cameraFeedback.set(null); this.cameraOpen.set(true); }
  protected closeCamera(): void { this.cameraOpen.set(false); }

  protected async cameraScanned(code: string): Promise<void> {
    const result = await this.jump(code);
    this.cameraFeedback.set(result);
    this.scanNote.set(result);
  }

  protected async jumpFromBox(): Promise<void> {
    const code = this.scanText().trim();
    if (!code) return;
    this.scanText.set('');
    this.scanNote.set(await this.jump(code));
  }

  /**
   * Finds the line for a barcode or part number and goes to it: the card on a phone, the count box in the table on a wide screen. An item that exists but is not
   * on this count is offered for adding (counted as found on the shelf); the item list on the screen is the first 500, so anything else is asked of the server.
   */
  private async jump(raw: string): Promise<ScanFeedback> {
    const code = raw.trim();
    const t = this.open();
    this.unlisted.set(null);
    if (!code || !t?.lines) return { text: 'Nothing to look for.', ok: false };
    let item = this.items().find((i) => i.barcode === code || i.sku === code);
    if (!item) {
      try {
        const found = (await firstValueFrom(this.inventory.items({ branchId: this.branches.activeId() ?? undefined, search: code, pageSize: 10, active: true }))).items;
        item = found.find((i) => i.barcode === code || i.sku === code) ?? (found.length === 1 ? found[0] : undefined);   // one result is an alias or part of a code the person meant
      } catch { /* offline: only what is already on the screen can be found */ }
    }
    const line = t.lines.find((l) => (item !== undefined && l.inventoryItemId === item.id) || (l.sku !== null && l.sku === code));
    if (line) { this.goTo(line); return { text: line.itemName, ok: true }; }
    if (item) { this.unlisted.set(item); return { text: `${item.name} is not on this count.`, ok: false }; }
    return { text: `No item has the code ${code}.`, ok: false };
  }

  private goTo(line: StockTakeLineDto): void {
    this.filter.set('');
    this.onlyDiff.set(false);
    const at = this.lines().findIndex((l) => l.id === line.id);
    this.cardIndex.set(Math.max(0, at));
    // A wide screen: bring the count box into view and select it, so the number can just be typed.
    setTimeout(() => {
      const box = Array.from(document.querySelectorAll<HTMLInputElement>('[data-testid^="count-"]')).find((e) => e.getAttribute('data-testid') === `count-${line.itemName}` && e.offsetParent !== null);
      if (box) { box.scrollIntoView({ block: 'center' }); box.focus(); box.select(); }
    }, 0);
  }

  protected async addUnlisted(item: InventoryItemDto): Promise<void> {
    this.unlisted.set(null);
    await this.addExtra(item.id);
  }

  protected async loadList(): Promise<void> {
    const branchId = this.branches.activeId();
    if (!branchId) return;
    this.loading.set(true);
    this.error.set(null);
    try { this.takes.set((await firstValueFrom(this.api.list({ branchId, pageSize: 50 }))).items); }
    catch (err) { this.error.set(toApiError(err).message); } finally { this.loading.set(false); }
  }

  protected async select(id: string): Promise<void> {
    this.error.set(null);
    this.edits.set(new Map());
    this.cardIndex.set(0);
    this.scanNote.set(null);
    this.unlisted.set(null);
    try {
      this.open.set(await firstValueFrom(this.api.get(id)));
      if (this.canPerform() && this.items().length === 0) void firstValueFrom(this.inventory.items({ branchId: this.branches.activeId() ?? undefined, pageSize: 500, active: true })).then((p) => this.items.set(p.items)).catch(() => undefined);
    } catch (err) { this.error.set(toApiError(err).message); }
  }

  protected close(): void { this.open.set(null); void this.loadList(); }

  protected async create(): Promise<void> {
    const branchId = this.branches.activeId();
    if (!branchId) return;
    this.busy.set(true);
    try {
      const t = await firstValueFrom(this.api.create({ branchId, groupId: this.newGroup() || null, isBlind: this.newBlind(), notes: this.newNotes().trim() || null }));
      this.newOpen.set(false);
      this.newNotes.set('');
      await this.loadList();
      this.open.set(t);
    } catch (err) { this.newOpen.set(false); this.error.set(toApiError(err).message); } finally { this.busy.set(false); }
  }

  private async run(call: () => Promise<StockTakeDto>, ok: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try { this.open.set(await call()); this.toast.success(ok); this.edits.set(new Map()); }
    catch (err) { this.error.set(toApiError(err).message); } finally { this.busy.set(false); }
  }

  protected act(action: 'start' | 'cancel'): Promise<void> {
    const id = this.open()!.id;
    return this.run(() => firstValueFrom(this.api.action(id, action)), action === 'start' ? 'Counting started.' : 'Stock take cancelled.');
  }

  protected async cancel(): Promise<void> {
    if (!(await this.confirm.ask({ title: 'Cancel this stock take?', message: 'Stock is not changed. The counts already saved are kept for the record.', confirmLabel: 'Cancel stock take', danger: true }))) return;
    await this.act('cancel');
  }

  protected async saveCounts(): Promise<void> {
    const t = this.open();
    if (!t) return;
    const lines = [...this.edits().entries()].filter(([, e]) => e.counted !== '').map(([id, e]) => ({ inventoryItemId: id, countedQuantity: +e.counted, explanation: e.explanation.trim() || null }));
    await this.run(() => firstValueFrom(this.api.counts(t.id, { lines })), 'Counts saved.');
  }

  protected async addExtra(itemId: string): Promise<void> {
    const t = this.open();
    if (!t) return;
    // An item found that was not on the snapshot is recorded with a count of 0 to register it, then counted in the table.
    // The counts typed so far are not saved yet and `run` forgets unsaved edits: they are put back, so adding an item never costs anyone their work.
    const pending = this.edits();
    await this.run(() => firstValueFrom(this.api.counts(t.id, { lines: [{ inventoryItemId: itemId, countedQuantity: 0, explanation: 'Found on the shelf; not on the snapshot' }] })), 'Item added. Enter its count.');
    if (!this.error()) this.edits.set(pending);
  }

  protected async submit(): Promise<void> {
    if (this.dirtyCount() > 0) await this.saveCounts();
    if (this.error()) return;
    const t = this.open();
    if (!t) return;
    await this.run(() => firstValueFrom(this.api.action(t.id, 'submit')), 'Submitted for review.');
  }

  protected decision(approve: boolean): void {
    this.decisionNote.set('');
    this.deciding.set(approve ? 'approve' : 'reject');
  }

  protected async confirmDecision(): Promise<void> {
    const t = this.open();
    const d = this.deciding();
    if (!t || !d) return;
    this.deciding.set(null);
    await this.run(() => firstValueFrom(this.api.decide(t.id, d === 'approve', this.decisionNote().trim() || null)), d === 'approve' ? 'Approved. Reconcile to book the corrections.' : 'Rejected.');
  }

  protected async reconcile(): Promise<void> {
    const t = this.open();
    if (!t) return;
    if (!(await this.confirm.ask({ title: 'Book the corrections?', message: 'Each difference is written to the stock ledger as a correction. This can only be done once.', confirmLabel: 'Reconcile' }))) return;
    await this.run(() => firstValueFrom(this.api.action(t.id, 'reconcile')), 'Reconciled. Corrections were booked to stock.');
  }
}
