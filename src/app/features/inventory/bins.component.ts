import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { InventoryItemDto, StockUnit } from '../../core/models/ops.model';
import { BinDto, BinStockRowDto, ItemBinDefaultDto } from '../../core/models/purchasing.model';
import { SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { BranchContextService } from '../../core/services/branch-context.service';
import { InventoryApi } from '../../core/services/ops.services';
import { BinApi } from '../../core/services/purchasing.services';
import { ConfirmService, DialogComponent, ToastService } from '../../shared/ui/feedback';
import { BranchPickerComponent } from '../../shared/ui/ops-chrome.components';
import { ZpIconComponent } from '../../shared/ui/zp-icon.component';

const UNIT: Record<StockUnit, string> = { Milliliter: 'ml', Gram: 'g', Each: 'each' };

interface BinForm { id: string | null; code: string; name: string; isHighSecurity: boolean; isActive: boolean; sortOrder: number; rowVersion: string | null }

/**
 * Bin locations: the named places inside a branch's store (a shelf, a cage, a cellar). Stock is counted per bin; what is not in any bin is the
 * "unassigned" remainder. High-security bins hold goods that need a second person's confirmation when they arrive.
 */
@Component({
  selector: 'zp-bins',
  standalone: true,
  imports: [DecimalPipe, FormsModule, BranchPickerComponent, DialogComponent, ZpIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4 font-jakarta" data-testid="bins">
      <div class="flex flex-wrap items-center justify-between gap-3"><div><h1 class="font-syne text-2xl font-bold">Bin Locations</h1><p class="text-sm text-ink/70">Where things sit in the store. Receiving asks which bin each delivery goes into, and sales draw from ordinary bins before the secure ones.</p></div><zp-branch-picker /></div>
      @if (error()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="bins-error">{{ error() }}</p> }
      @if (!branches.activeId()) { <p class="sys-alert sys-alert-warning" role="status">You are not assigned to a branch yet.</p> }

      <section class="app-card overflow-hidden p-0" aria-label="Bins">
        <div class="flex items-center justify-between bg-ink/5 px-4 py-2"><h2 class="font-syne text-lg font-semibold">Bins at this branch</h2>@if (canManage()) { <button type="button" class="btn-primary" data-testid="bin-new" (click)="openForm(null)"><zp-icon name="plus" [size]="16" /> New bin</button> }</div>
        <div class="overflow-x-auto"><table class="app-table min-w-[36rem]" data-testid="bin-table"><thead><tr><th>Code</th><th>Name</th><th>Security</th><th class="text-right">Items held</th><th>Status</th><th></th></tr></thead>
          <tbody>@for (b of bins(); track b.id) {
            <tr [attr.data-testid]="'bin-row-' + b.code"><td class="font-data font-semibold">{{ b.code }}</td><td>{{ b.name }}</td>
              <td>@if (b.isHighSecurity) { <span class="app-badge app-badge-warning"><zp-icon name="lock" [size]="12" /> Second key needed</span> } @else { <span class="text-ink/60">Ordinary</span> }</td>
              <td class="text-right font-data">{{ b.itemCount }}</td><td>{{ b.isActive ? 'In use' : 'Switched off' }}</td>
              <td class="text-right"><button type="button" class="btn-ghost text-sm" [attr.data-testid]="'bin-filter-' + b.code" (click)="showBin(b.id)">Show stock</button>@if (canManage()) { <button type="button" class="btn-ghost text-sm" [attr.data-testid]="'bin-edit-' + b.code" (click)="openForm(b)">Edit</button> }</td></tr> }
            @empty { <tr><td colspan="6" class="py-8 text-center text-ink/70">{{ loading() ? 'Loading...' : 'No bins yet. Without bins, receiving puts stock straight into the branch.' }}</td></tr> }</tbody></table></div>
      </section>

      <section class="app-card overflow-hidden p-0" aria-label="Stock by bin">
        <div class="flex flex-wrap items-end justify-between gap-3 bg-ink/5 px-4 py-2">
          <h2 class="font-syne text-lg font-semibold">Stock by bin</h2>
          <div class="flex flex-wrap items-end gap-2">
            <div><label class="app-label" for="bs-bin">Bin</label><select id="bs-bin" class="app-input py-1" data-testid="stock-bin" [ngModel]="stockBin()" (ngModelChange)="stockBin.set($event); loadStock()"><option value="">All bins</option><option value="00000000-0000-0000-0000-000000000000">Not in any bin</option>@for (b of bins(); track b.id) { <option [value]="b.id">{{ b.code }}</option> }</select></div>
            <div><label class="app-label" for="bs-search">Item</label><input id="bs-search" type="search" class="app-input py-1" placeholder="Name, SKU or barcode" data-testid="stock-search" [ngModel]="stockSearch()" (ngModelChange)="stockSearch.set($event)" (keydown.enter)="loadStock()" /></div>
            <button type="button" class="btn-outline" data-testid="stock-find" (click)="loadStock()">Find</button>
          </div>
        </div>
        <div class="overflow-x-auto"><table class="app-table min-w-[40rem]" data-testid="bin-stock"><thead><tr><th>Item</th><th>Bin</th><th class="text-right">Quantity</th>@if (canMove()) { <th></th> }</tr></thead>
          <tbody>@for (r of stock(); track $index) {
            <tr [attr.data-testid]="'stock-row-' + r.binCode + '-' + (r.sku ?? r.itemName)"><td><span class="font-semibold">{{ r.itemName }}</span> <span class="font-data text-[11px] text-ink/60">{{ r.sku }}</span></td>
              <td class="font-data text-xs" [class]="r.isHighSecurity ? 'text-primary font-semibold' : r.binId ? '' : 'text-ink/60'">{{ r.binCode }}{{ r.isHighSecurity ? ' (secure)' : '' }}</td><td class="text-right font-data font-bold">{{ r.quantity | number: '1.0-4' }} {{ unit(r.unit) }}</td>
              @if (canMove()) { <td class="text-right"><button type="button" class="btn-ghost text-sm" [attr.data-testid]="'move-' + r.binCode + '-' + (r.sku ?? r.itemName)" (click)="openMove(r)">Move</button></td> }</tr> }
            @empty { <tr><td colspan="4" class="py-8 text-center text-ink/70">{{ loadingStock() ? 'Loading...' : 'Nothing found.' }}</td></tr> }</tbody></table></div>
      </section>

      @if (canManage()) {
        <section class="app-card flex flex-col gap-3" aria-label="Default bins">
          <h2 class="font-syne text-lg font-semibold">Where each item normally goes</h2>
          <p class="text-sm text-ink/70">Receiving pre-selects the default bin, so the receiver only changes it when something is different.</p>
          <div class="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <div><label class="app-label" for="df-item">Item</label><select id="df-item" class="app-input" data-testid="default-item" [ngModel]="defaultItem()" (ngModelChange)="defaultItem.set($event)"><option value="">Choose an item</option>@for (i of items(); track i.id) { <option [value]="i.id">{{ i.name }}</option> }</select></div>
            <div><label class="app-label" for="df-bin">Bin</label><select id="df-bin" class="app-input" data-testid="default-bin" [ngModel]="defaultBin()" (ngModelChange)="defaultBin.set($event)"><option value="">Choose a bin</option>@for (b of activeBins(); track b.id) { <option [value]="b.id">{{ b.code }}</option> }</select></div>
            <button type="button" class="btn-primary" data-testid="default-save" [disabled]="!defaultItem() || !defaultBin() || busy()" (click)="saveDefault()">Set default</button>
          </div>
          <ul class="divide-y divide-ink/10 text-sm" data-testid="default-list">@for (d of defaults(); track d.inventoryItemId) {
            <li class="flex items-center justify-between py-1.5"><span>{{ itemName(d.inventoryItemId) }} &rarr; <strong class="font-data">{{ binCode(d.binId) }}</strong></span><button type="button" class="text-xs underline" (click)="clearDefault(d)">Clear</button></li> }
            @empty { <li class="py-2 text-ink/70">No defaults set.</li> }</ul>
        </section>
      }
    </div>

    <zp-dialog [open]="form() !== null" [title]="form()?.id ? 'Edit bin' : 'New bin'" (closed)="form.set(null)">
      @if (form(); as f) {
        <form class="space-y-3" (submit)="$event.preventDefault(); saveBin()">
          <div><label class="app-label" for="bf-code">Code (shown on labels and screens)</label><input id="bf-code" class="app-input font-data uppercase" maxlength="30" data-testid="bin-code" [ngModel]="f.code" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchForm({ code: $event })" /></div>
          <div><label class="app-label" for="bf-name">Name</label><input id="bf-name" class="app-input" maxlength="120" data-testid="bin-name" [ngModel]="f.name" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchForm({ name: $event })" /></div>
          <label class="flex items-start gap-2 text-sm"><input type="checkbox" class="mt-1" data-testid="bin-secure" [ngModel]="f.isHighSecurity" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchForm({ isHighSecurity: $event })" /> <span><strong>High security</strong><span class="block text-ink/70">Goods going in need a second person, signed in on their own device, to confirm them before they count as stock.</span></span></label>
          @if (f.id) { <label class="flex items-center gap-2 text-sm"><input type="checkbox" [ngModel]="f.isActive" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchForm({ isActive: $event })" /> In use</label> }
          @if (formError()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="bin-form-error">{{ formError() }}</p> }
          <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="form.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="bin-save" [disabled]="busy() || f.code.trim().length === 0 || f.name.trim().length === 0">Save bin</button></div>
        </form>
      }
    </zp-dialog>

    <zp-dialog [open]="move() !== null" title="Move stock between bins" (closed)="move.set(null)">
      @if (move(); as mv) {
        <form class="space-y-3" (submit)="$event.preventDefault(); doMove()">
          <p class="text-sm"><strong>{{ mv.row.itemName }}</strong> from <span class="font-data">{{ mv.row.binCode }}</span> ({{ mv.row.quantity | number: '1.0-4' }} {{ unit(mv.row.unit) }} here). The branch total does not change.</p>
          <div><label class="app-label" for="mv-to">Move to</label><select id="mv-to" class="app-input" data-testid="move-to" [ngModel]="mv.to" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchMove({ to: $event })"><option value="">Choose a bin</option>@if (mv.row.binId) { <option value="none">Not in any bin</option> }@for (b of activeBins(); track b.id) { @if (b.id !== mv.row.binId) { <option [value]="b.id">{{ b.code }}{{ b.isHighSecurity ? ' (secure)' : '' }}</option> } }</select></div>
          <div><label class="app-label" for="mv-qty">Quantity</label><input id="mv-qty" type="number" min="0" step="any" class="app-input font-data" data-testid="move-qty" [ngModel]="mv.qty" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchMove({ qty: +$event })" /></div>
          <div><label class="app-label" for="mv-why">Reason (optional)</label><input id="mv-why" class="app-input" maxlength="300" data-testid="move-reason" [ngModel]="mv.reason" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchMove({ reason: $event })" /></div>
          @if (moveError()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="move-error">{{ moveError() }}</p> }
          <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="move.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="move-confirm" [disabled]="busy() || !mv.to || mv.qty <= 0">Move</button></div>
        </form>
      }
    </zp-dialog>
  `
})
export class BinsComponent implements OnInit {
  private readonly api = inject(BinApi);
  private readonly inventory = inject(InventoryApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  protected readonly branches = inject(BranchContextService);

  protected readonly bins = signal<readonly BinDto[]>([]);
  protected readonly stock = signal<readonly BinStockRowDto[]>([]);
  protected readonly items = signal<readonly InventoryItemDto[]>([]);
  protected readonly defaults = signal<readonly ItemBinDefaultDto[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadingStock = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly stockBin = signal('');
  protected readonly stockSearch = signal('');
  protected readonly form = signal<BinForm | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly move = signal<{ row: BinStockRowDto; to: string; qty: number; reason: string; key: string } | null>(null);
  protected readonly moveError = signal<string | null>(null);
  protected readonly defaultItem = signal('');
  protected readonly defaultBin = signal('');

  protected readonly canManage = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.INVENTORY_BINS_MANAGE));
  protected readonly canMove = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.INVENTORY_STOCK_ADJUST));
  protected readonly activeBins = computed(() => this.bins().filter((b) => b.isActive));

  constructor() {
    effect(() => { this.branches.activeId(); untracked(() => void this.reload()); }, { allowSignalWrites: true });
  }

  async ngOnInit(): Promise<void> {
    await this.branches.load();
    try { this.items.set((await firstValueFrom(this.inventory.items({ pageSize: 500, active: true }))).items); } catch { /* the names fall back to ids */ }
  }

  protected unit = (u: StockUnit): string => UNIT[u];
  protected itemName(id: string): string { return this.items().find((i) => i.id === id)?.name ?? id; }
  protected binCode(id: string | null): string { return this.bins().find((b) => b.id === id)?.code ?? '-'; }

  private async reload(): Promise<void> {
    const branch = this.branches.activeId();
    if (!branch) { this.bins.set([]); this.stock.set([]); return; }
    this.loading.set(true);
    this.error.set(null);
    try {
      this.bins.set(await firstValueFrom(this.api.list({ branchId: branch, includeInactive: true })));
      this.defaults.set(await firstValueFrom(this.api.defaults(branch)));
    } catch (err) { this.error.set(toApiError(err).message); } finally { this.loading.set(false); }
    await this.loadStock();
  }

  protected showBin(id: string): void { this.stockBin.set(id); void this.loadStock(); }

  protected async loadStock(): Promise<void> {
    const branch = this.branches.activeId();
    if (!branch) return;
    this.loadingStock.set(true);
    try { this.stock.set(await firstValueFrom(this.api.stock({ branchId: branch, binId: this.stockBin() || undefined, search: this.stockSearch().trim() || undefined }))); }
    catch (err) { this.error.set(toApiError(err).message); } finally { this.loadingStock.set(false); }
  }

  protected openForm(b: BinDto | null): void {
    this.formError.set(null);
    this.form.set(b ? { id: b.id, code: b.code, name: b.name, isHighSecurity: b.isHighSecurity, isActive: b.isActive, sortOrder: b.sortOrder, rowVersion: b.rowVersion } : { id: null, code: '', name: '', isHighSecurity: false, isActive: true, sortOrder: this.bins().length + 1, rowVersion: null });
  }

  protected patchForm(p: Partial<BinForm>): void { this.form.update((f) => (f ? { ...f, ...p } : f)); }

  protected async saveBin(): Promise<void> {
    const f = this.form();
    const branch = this.branches.activeId();
    if (!f || !branch) return;
    this.busy.set(true);
    this.formError.set(null);
    try {
      await firstValueFrom(this.api.save(f.id, { branchId: branch, code: f.code.trim(), name: f.name.trim(), isHighSecurity: f.isHighSecurity, isActive: f.isActive, sortOrder: f.sortOrder, rowVersion: f.rowVersion }));
      this.form.set(null);
      this.toast.success('Bin saved.');
      await this.reload();
    } catch (err) { this.formError.set(toApiError(err).message); } finally { this.busy.set(false); }
  }

  protected openMove(row: BinStockRowDto): void {
    this.moveError.set(null);
    this.move.set({ row, to: '', qty: row.quantity, reason: '', key: `mv-${crypto.randomUUID()}` });
  }

  protected patchMove(p: Partial<{ to: string; qty: number; reason: string }>): void { this.move.update((m) => (m ? { ...m, ...p } : m)); }

  protected async doMove(): Promise<void> {
    const m = this.move();
    const branch = this.branches.activeId();
    if (!m || !branch) return;
    this.busy.set(true);
    this.moveError.set(null);
    try {
      await firstValueFrom(this.api.move({ branchId: branch, inventoryItemId: m.row.inventoryItemId, fromBinId: m.row.binId, toBinId: m.to === 'none' ? null : m.to, quantity: m.qty, reason: m.reason.trim() || null, idempotencyKey: m.key }));
      this.move.set(null);
      this.toast.success('Moved.');
      await this.reload();
    } catch (err) { this.moveError.set(toApiError(err).message); } finally { this.busy.set(false); }
  }

  protected async saveDefault(): Promise<void> {
    const branch = this.branches.activeId();
    if (!branch) return;
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.setDefault(this.defaultItem(), branch, this.defaultBin()));
      this.defaultItem.set('');
      this.defaultBin.set('');
      this.defaults.set(await firstValueFrom(this.api.defaults(branch)));
      this.toast.success('Default bin set.');
    } catch (err) { this.error.set(toApiError(err).message); } finally { this.busy.set(false); }
  }

  protected async clearDefault(d: ItemBinDefaultDto): Promise<void> {
    const branch = this.branches.activeId();
    if (!branch || !(await this.confirm.ask({ title: 'Clear the default bin?', message: `${this.itemName(d.inventoryItemId)} will no longer be pre-assigned.`, confirmLabel: 'Clear' }))) return;
    try {
      await firstValueFrom(this.api.setDefault(d.inventoryItemId, branch, null));
      this.defaults.set(await firstValueFrom(this.api.defaults(branch)));
    } catch (err) { this.error.set(toApiError(err).message); }
  }
}
