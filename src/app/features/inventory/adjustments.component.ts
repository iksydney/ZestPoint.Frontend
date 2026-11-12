import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AdjustmentDto, AdjustmentReasonDto, AdjustmentStatus, StockMovementKind } from '../../core/models/nav-ops.model';
import { FEATURES, SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { InventoryItemDto, StockUnit } from '../../core/models/ops.model';
import { TenantTimePipe } from '../../core/pipes/tenant-time.pipe';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { BranchContextService } from '../../core/services/branch-context.service';
import { AdjustmentApi } from '../../core/services/nav-ops.services';
import { InventoryApi } from '../../core/services/ops.services';
import { DialogComponent, ToastService } from '../../shared/ui/feedback';
import { BranchPickerComponent } from '../../shared/ui/ops-chrome.components';
import { SearchSelectComponent, SelectOption } from '../../shared/ui/search-select.component';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';
import { EntitledActionDirective } from '../../shared/directives/entitled-action.directive';

const UNIT: Record<StockUnit, string> = { Milliliter: 'ml', Gram: 'g', Each: 'each' };

/**
 * Stock quantity adjustments: a request (a change or a counted quantity, with a reason), approved by somebody else when the company's
 * approval rule applies, then written as ONE append-only stock movement. Nothing here edits a quantity directly.
 */
@Component({
  selector: 'zp-adjustments',
  standalone: true,
  imports: [EntitledActionDirective, DecimalPipe, FormsModule, TenantTimePipe, DialogComponent, StatusBadgeComponent, BranchPickerComponent, SearchSelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-bold">Stock Qty Adjustments</h1>
      <div class="flex items-center gap-4"><zp-branch-picker />@if (canManageReasons()) { <button type="button" class="btn-outline" data-testid="reasons-open" (click)="reasonsOpen.set(true)">Reasons</button> }</div>
    </div>
    @if (readOnly()) { <p class="sys-alert sys-alert-warning mb-3" role="status">Read-only: your subscription limits this screen. You can look, but not request or approve.</p> }
    @if (!branches.activeId()) { <p class="sys-alert sys-alert-warning" role="status">You are not assigned to a branch yet. Ask a manager to give you access.</p> }
    @else {
      @if (canRequest()) {
        <section class="app-card mb-6 max-w-3xl" aria-label="New adjustment" data-testid="adjust-form">
          <h2 class="mb-3 font-semibold">New adjustment at {{ branches.active()?.name }}</h2>
          <form class="grid gap-3 sm:grid-cols-2" (submit)="$event.preventDefault(); submit()">
            <div class="sm:col-span-2"><zp-search-select label="Stock item" [options]="itemOptions()" [value]="itemId()" placeholder="Search items" testId="adjust-item" (valueChange)="pickItem($event)" /></div>
            @if (item(); as it) {
              <p class="text-sm sm:col-span-2" data-testid="adjust-expected">Expected on hand: <strong>{{ it.onHand | number: '1.0-4' }} {{ unit(it.baseUnit) }}</strong></p>
              <fieldset class="flex gap-4 text-sm sm:col-span-2"><legend class="sr-only">How to enter the change</legend>
                <label class="flex items-center gap-2"><input type="radio" name="mode" value="delta" [checked]="mode() === 'delta'" (change)="mode.set('delta')" /> Change by (+ adds, - removes)</label>
                <label class="flex items-center gap-2"><input type="radio" name="mode" value="count" data-testid="adjust-mode-count" [checked]="mode() === 'count'" (change)="mode.set('count')" /> I counted</label></fieldset>
              <div><label class="app-label" for="a-qty">{{ mode() === 'delta' ? 'Change (' + unit(it.baseUnit) + ')' : 'Counted quantity (' + unit(it.baseUnit) + ')' }}</label>
                <input id="a-qty" type="number" step="any" class="app-input" data-testid="adjust-qty" [ngModel]="qty()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="qty.set($event === null || $event === '' ? null : +$event)" /></div>
              <p class="self-end pb-2 text-sm" data-testid="adjust-result">Resulting quantity: <strong [class.text-danger]="resulting() !== null && resulting()! < 0">{{ resulting() === null ? '-' : (resulting() | number: '1.0-4') }}</strong></p>
            }
            <div><label class="app-label" for="a-reason">Reason</label>
              <select id="a-reason" class="app-input" data-testid="adjust-reason" [ngModel]="reasonId()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="reasonId.set($event)"><option value="">Choose a reason...</option>@for (r of activeReasons(); track r.id) { <option [value]="r.id">{{ r.name }}</option> }</select></div>
            <div><label class="app-label" for="a-note">Notes</label><input id="a-note" class="app-input" maxlength="500" data-testid="adjust-note" [ngModel]="note()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="note.set($event)" /></div>
            @if (formError()) { <p class="sys-alert sys-alert-danger sm:col-span-2" role="alert" data-testid="adjust-error">{{ formError() }}</p> }
            @if (formMessage()) { <p class="sys-alert sys-alert-success sm:col-span-2" role="status" data-testid="adjust-message">{{ formMessage() }}</p> }
            <div class="sm:col-span-2"><button type="submit" class="btn-primary" data-testid="adjust-submit" zpAction="inventory.stock.adjust" [disabled]="saving() || readOnly() || !canSubmit()">Submit adjustment</button></div>
          </form>
        </section>
      }

      <section aria-label="Adjustment history">
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2"><h2 class="text-lg font-semibold">History</h2>
          <label class="flex items-center gap-2 text-sm">Show <select class="app-input w-auto py-1" data-testid="adjust-filter" [ngModel]="statusFilter()" (ngModelChange)="statusFilter.set($event); loadHistory()"><option value="">All</option><option value="Pending">Waiting for approval</option><option value="Approved">Approved</option><option value="Rejected">Rejected</option><option value="Cancelled">Cancelled</option></select></label></div>
        @if (error()) { <p class="sys-alert sys-alert-danger mb-2" role="alert">{{ error() }}</p> }
        <div class="app-card overflow-x-auto p-0"><table class="app-table" data-testid="adjust-history">
          <thead><tr><th>#</th><th>When</th><th>Item</th><th>Reason</th><th class="text-right">Change</th><th class="text-right">Result</th>@if (showValue()) { <th class="text-right">Value</th> }<th>Status</th><th>By</th><th></th></tr></thead>
          <tbody>@for (a of history(); track a.id) {
            <tr [attr.data-testid]="'adj-' + a.number">
              <td>{{ a.number }}</td><td class="whitespace-nowrap text-xs">{{ a.dateCreated | tenantTime }}</td>
              <td class="font-medium">{{ a.itemName }}<span class="block text-xs font-normal text-ink/60">{{ a.note }}</span></td><td>{{ a.reasonName }}</td>
              <td class="text-right" [class.text-danger]="a.quantityDelta < 0">{{ a.quantityDelta | number: '1.0-4' }} {{ a.unit }}</td><td class="text-right">{{ a.resultingQuantity | number: '1.0-4' }}</td>
              @if (showValue()) { <td class="text-right">{{ a.estimatedValue === null ? '' : (a.estimatedValue | number: '1.2-2') }}</td> }
              <td><zp-status-badge [tone]="tone(a.status)">{{ a.status === 'Pending' ? 'Waiting for approval' : a.status }}</zp-status-badge>@if (a.decisionNote) { <span class="block text-xs text-ink/60">{{ a.decisionNote }}</span> }</td>
              <td class="text-xs">{{ a.requestedByName }}@if (a.decidedByName) { <span class="block text-ink/60">decided: {{ a.decidedByName }}</span> }</td>
              <td class="whitespace-nowrap text-right">
                @if (a.status === 'Pending' && !readOnly()) {
                  @if (canApprove() && a.requestedByMembershipId !== me()) { <button type="button" class="btn-outline px-2 py-1 text-sm" [attr.data-testid]="'adj-approve-' + a.number" (click)="startDecision(a, true)">Approve</button><button type="button" class="btn-ghost px-2 py-1 text-sm" [attr.data-testid]="'adj-reject-' + a.number" (click)="startDecision(a, false)">Reject</button> }
                  @if (a.requestedByMembershipId === me()) { <button type="button" class="btn-ghost px-2 py-1 text-sm" (click)="cancel(a)">Cancel</button> }
                }
              </td></tr>
          } @empty { <tr><td colspan="10" class="py-6 text-center text-ink/70">{{ loading() ? 'Loading...' : 'No adjustments yet.' }}</td></tr> }</tbody></table></div>
      </section>
    }

    <zp-dialog [open]="!!deciding()" [title]="(deciding()?.approve ? 'Approve' : 'Reject') + ' adjustment #' + (deciding()?.adj?.number ?? '')" (closed)="deciding.set(null)">
      @if (deciding(); as d) {
        <p class="mb-2 text-sm">{{ d.adj.itemName }}: {{ d.adj.quantityDelta | number: '1.0-4' }} {{ d.adj.unit }} ({{ d.adj.reasonName }}). {{ d.approve ? 'Stock changes as soon as you approve.' : 'Stock stays as it is.' }}</p>
        <label class="app-label" for="dec-note">Note @if (!d.approve) { (required) }</label><input id="dec-note" class="app-input" data-testid="decision-note" maxlength="500" [ngModel]="decisionNote()" (ngModelChange)="decisionNote.set($event)" />
        <div class="mt-3 flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="deciding.set(null)">Cancel</button>
          <button type="button" class="btn-primary" data-testid="decision-confirm" [disabled]="saving() || (!d.approve && decisionNote().trim().length < 3)" (click)="decide()">{{ d.approve ? 'Approve' : 'Reject' }}</button></div>
      }
    </zp-dialog>

    <zp-dialog [open]="reasonsOpen()" title="Adjustment reasons" (closed)="reasonsOpen.set(false)">
      <ul class="mb-3 space-y-1 text-sm">@for (r of allReasons(); track r.id) { <li class="flex items-center justify-between gap-2"><span>{{ r.name }} <span class="text-xs text-ink/60">({{ r.movementType }})</span></span>
        <button type="button" class="btn-ghost px-2 py-0.5 text-sm" (click)="toggleReason(r)">{{ r.isActive ? 'Deactivate' : 'Activate' }}</button></li> }</ul>
      <div class="grid gap-2 sm:grid-cols-[1fr_9rem_auto]">
        <input class="app-input" aria-label="Reason name" placeholder="New reason" maxlength="80" data-testid="reason-name" [ngModel]="newReason()" (ngModelChange)="newReason.set($event)" />
        <select class="app-input" aria-label="Effect" [ngModel]="newReasonType()" (ngModelChange)="newReasonType.set($event)"><option value="Adjustment">Adjustment</option><option value="Waste">Waste</option><option value="Spillage">Spillage</option><option value="Breakage">Breakage</option></select>
        <button type="button" class="btn-outline" data-testid="reason-add" [disabled]="newReason().trim().length < 2" (click)="addReason()">Add</button></div>
      <p class="mt-2 text-xs text-ink/70">Waste, spillage and breakage can only remove stock; "Adjustment" can add or remove.</p>
      @if (reasonError()) { <p class="app-error" role="alert">{{ reasonError() }}</p> }
    </zp-dialog>
  `
})
export class AdjustmentsComponent implements OnInit {
  private readonly api = inject(AdjustmentApi);
  private readonly inventory = inject(InventoryApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  protected readonly branches = inject(BranchContextService);

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly formMessage = signal<string | null>(null);
  protected readonly history = signal<readonly AdjustmentDto[]>([]);
  protected readonly allReasons = signal<readonly AdjustmentReasonDto[]>([]);
  protected readonly items = signal<readonly InventoryItemDto[]>([]);
  protected readonly statusFilter = signal<AdjustmentStatus | ''>('');
  protected readonly itemId = signal<string | null>(null);
  protected readonly mode = signal<'delta' | 'count'>('delta');
  protected readonly qty = signal<number | null>(null);
  protected readonly reasonId = signal('');
  protected readonly note = signal('');
  protected readonly deciding = signal<{ adj: AdjustmentDto; approve: boolean } | null>(null);
  protected readonly decisionNote = signal('');
  protected readonly reasonsOpen = signal(false);
  protected readonly newReason = signal('');
  protected readonly newReasonType = signal<StockMovementKind>('Adjustment');
  protected readonly reasonError = signal<string | null>(null);
  /** One key per form submission: a retry or double tap is the same adjustment, never two. */
  private key = crypto.randomUUID();

  protected readonly me = computed(() => this.auth.membership()?.id ?? '');
  protected readonly readOnly = computed(() => this.auth.accessModeFor(FEATURES.INVENTORY) === 'readonly');
  protected readonly canRequest = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.INVENTORY_STOCK_ADJUST));
  protected readonly canApprove = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.INVENTORY_STOCK_ADJUST_APPROVE));
  protected readonly canManageReasons = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.INVENTORY_ITEMS_MANAGE));
  protected readonly showValue = computed(() => this.history().some((a) => a.estimatedValue !== null));
  protected readonly activeReasons = computed(() => this.allReasons().filter((r) => r.isActive));
  protected readonly item = computed(() => this.items().find((i) => i.id === this.itemId()) ?? null);
  protected readonly itemOptions = computed<readonly SelectOption[]>(() => this.items().filter((i) => i.isActive).map((i) => ({ value: i.id, label: i.name, description: `${i.sku ?? ''} on hand ${i.onHand} ${UNIT[i.baseUnit]}`.trim() })));
  protected readonly resulting = computed(() => {
    const it = this.item();
    const q = this.qty();
    return it && q !== null ? (this.mode() === 'delta' ? it.onHand + q : q) : null;
  });
  protected readonly canSubmit = computed(() => !!this.item() && this.qty() !== null && this.qty() !== (this.mode() === 'delta' ? 0 : this.item()!.onHand) && !!this.reasonId());

  constructor() {
    // Reload when the person switches branch.
    effect(() => { this.branches.activeId(); untracked(() => void this.reload()); });
  }

  ngOnInit(): void { void this.branches.load(); }

  protected unit = (u: StockUnit): string => UNIT[u];
  protected tone = (s: AdjustmentStatus): 'success' | 'warning' | 'danger' | 'primary' => (s === 'Approved' ? 'success' : s === 'Pending' ? 'warning' : s === 'Rejected' ? 'danger' : 'primary');
  protected pickItem(id: string): void { this.itemId.set(id); this.qty.set(null); this.formMessage.set(null); }

  private async reload(): Promise<void> {
    const branchId = this.branches.activeId();
    if (!branchId) return;
    try {
      const [reasons, items] = await Promise.all([
        this.canRequest() || this.canManageReasons() ? firstValueFrom(this.api.reasons(true)) : Promise.resolve([] as AdjustmentReasonDto[]),
        this.canRequest() ? firstValueFrom(this.inventory.items({ branchId, pageSize: 500, active: true })).then((p) => p.items) : Promise.resolve([] as InventoryItemDto[])
      ]);
      this.allReasons.set(reasons);
      this.items.set(items);
    } catch (err) { this.error.set(toApiError(err).message); }
    await this.loadHistory();
  }

  protected async loadHistory(): Promise<void> {
    const branchId = this.branches.activeId();
    if (!branchId) return;
    this.loading.set(true);
    this.error.set(null);
    try { this.history.set((await firstValueFrom(this.api.list({ branchId, status: this.statusFilter() || undefined, pageSize: 50 }))).items); }
    catch (err) { this.error.set(toApiError(err).message); } finally { this.loading.set(false); }
  }

  protected async submit(): Promise<void> {
    const it = this.item();
    const branchId = this.branches.activeId();
    if (!it || !branchId || this.qty() === null) return;
    this.saving.set(true);
    this.formError.set(null);
    this.formMessage.set(null);
    try {
      const result = await firstValueFrom(this.api.request({
        branchId, inventoryItemId: it.id, reasonId: this.reasonId(), quantityDelta: this.mode() === 'delta' ? this.qty() : null,
        countedQuantity: this.mode() === 'count' ? this.qty() : null, note: this.note().trim() || null, idempotencyKey: this.key
      }));
      this.key = crypto.randomUUID();
      this.formMessage.set(result.status === 'Approved' ? 'Done. Stock was updated.' : 'Submitted. Stock changes only once somebody else approves it.');
      this.qty.set(null); this.note.set('');
      await this.reload();
    } catch (err) { this.formError.set(toApiError(err).message); } finally { this.saving.set(false); }
  }

  protected startDecision(adj: AdjustmentDto, approve: boolean): void {
    this.decisionNote.set('');
    this.deciding.set({ adj, approve });
  }

  protected async decide(): Promise<void> {
    const d = this.deciding();
    if (!d) return;
    this.saving.set(true);
    try {
      await firstValueFrom(this.api.decide(d.adj.id, d.approve, this.decisionNote().trim() || null));
      this.deciding.set(null);
      this.toast.success(d.approve ? 'Approved. Stock updated.' : 'Rejected. Stock unchanged.');
      await this.reload();
    } catch (err) { this.error.set(toApiError(err).message); this.deciding.set(null); } finally { this.saving.set(false); }
  }

  protected async cancel(a: AdjustmentDto): Promise<void> {
    try { await firstValueFrom(this.api.cancel(a.id)); this.toast.success('Request cancelled.'); await this.loadHistory(); }
    catch (err) { this.error.set(toApiError(err).message); }
  }

  protected async addReason(): Promise<void> {
    this.reasonError.set(null);
    const name = this.newReason().trim();
    try {
      await firstValueFrom(this.api.saveReason(null, { code: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'reason', name, movementType: this.newReasonType(), isActive: true }));
      this.newReason.set('');
      this.allReasons.set(await firstValueFrom(this.api.reasons(true)));
    } catch (err) { this.reasonError.set(toApiError(err).message); }
  }

  protected async toggleReason(r: AdjustmentReasonDto): Promise<void> {
    try {
      await firstValueFrom(this.api.saveReason(r.id, { code: r.code, name: r.name, movementType: r.movementType as StockMovementKind, isActive: !r.isActive }));
      this.allReasons.set(await firstValueFrom(this.api.reasons(true)));
    } catch (err) { this.reasonError.set(toApiError(err).message); }
  }
}
