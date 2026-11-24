import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { SaveStockGroupRequest, StockGroupDto } from '../../core/models/nav-ops.model';
import { FEATURES, SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { toApiError, ApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { StationsService } from '../../core/services/stations.service';
import { LedgerAccountOptionDto, LedgerApi } from '../../core/services/ledger.services';
import { StockGroupApi } from '../../core/services/nav-ops.services';
import { ConfirmService, DialogComponent, ToastService } from '../../shared/ui/feedback';
import { SearchSelectComponent, SelectOption } from '../../shared/ui/search-select.component';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';
import { EntitledActionDirective } from '../../shared/directives/entitled-action.directive';

const blank = (): SaveStockGroupRequest => ({ name: '', code: null, description: null, parentId: null, sortOrder: 0, isActive: true, stationId: null, salesAccountId: null, purchaseAccountId: null });

/**
 * Stock groups are the one grouping used by the POS menu, stock items and the sales-by-group reports. A group that is referenced by
 * products, stock items, sales or sub-groups can only be deactivated, or its members reassigned; it is never deleted from under history.
 */
@Component({
    selector: 'zp-stock-groups',
    imports: [EntitledActionDirective, FormsModule, DialogComponent, SearchSelectComponent, StatusBadgeComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-bold">Stock Group Maintenance</h1>
      <div class="flex items-center gap-3">
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" data-testid="groups-inactive" [checked]="showInactive()" (change)="showInactive.set(!showInactive()); load()" /> Show inactive</label>
        @if (canManage()) { <button type="button" class="btn-primary" data-testid="group-new" zpAction="inventory.groups.manage" [disabled]="readOnly()" (click)="openEdit(null)">New group</button> }
      </div>
    </div>
    @if (readOnly()) { <p class="sys-alert sys-alert-warning mb-3" role="status">Read-only: your subscription limits this screen.</p> }
    @if (error()) { <p class="sys-alert sys-alert-danger mb-3" role="alert" data-testid="groups-error">{{ error() }}</p> }

    <div class="app-card overflow-x-auto p-0" data-testid="groups-table">
      <table class="app-table">
        <caption class="sr-only">Stock groups</caption>
        <thead><tr><th>Group</th><th>Code</th><th>Parent</th><th class="text-right">Products</th><th class="text-right">Stock items</th><th>Status</th><th></th></tr></thead>
        <tbody>
          @for (g of groups(); track g.id) {
            <tr [attr.data-testid]="'group-' + g.name">
              <td class="font-medium">{{ g.name }} @if (g.description) { <span class="block text-xs font-normal text-ink/60">{{ g.description }}</span> }</td>
              <td class="font-mono text-xs">{{ g.code }}</td><td>{{ g.parentName }}</td><td class="text-right">{{ g.productCount }}</td><td class="text-right">{{ g.itemCount }}</td>
              <td><zp-status-badge [tone]="g.isActive ? 'success' : 'danger'">{{ g.isActive ? 'Active' : 'Inactive' }}</zp-status-badge> @if (g.inUse) { <span class="ml-1 text-xs text-ink/60">in use</span> }</td>
              <td class="whitespace-nowrap text-right">
                @if (canManage() && !readOnly()) {
                  <button type="button" class="btn-ghost px-2 py-1 text-sm" [attr.data-testid]="'group-edit-' + g.name" (click)="openEdit(g)">Edit</button>
                  @if (g.inUse && g.isActive) { <button type="button" class="btn-ghost px-2 py-1 text-sm" (click)="openReassign(g)">Reassign...</button> }
                  @if (!g.inUse) { <button type="button" class="btn-ghost px-2 py-1 text-sm text-danger" [attr.data-testid]="'group-delete-' + g.name" (click)="remove(g)">Delete</button> }
                  @else { <span class="px-2 text-xs text-ink/60" title="Used by products, items, sales or sub-groups. Deactivate it instead.">cannot delete</span> }
                }
              </td>
            </tr>
          } @empty { <tr><td colspan="7" class="py-8 text-center text-ink/70">{{ loading() ? 'Loading...' : 'No stock groups yet.' }}</td></tr> }
        </tbody>
      </table>
    </div>

    <zp-dialog [open]="dialog() === 'edit'" [title]="editingId() ? 'Edit stock group' : 'New stock group'" (closed)="dialog.set(null)">
      <form class="space-y-3" (submit)="$event.preventDefault(); save()">
        <div><label class="app-label" for="g-name">Name</label><input id="g-name" class="app-input" data-testid="group-name" maxlength="80" [ngModel]="form().name" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ name: $event })" />
          @if (fe('name')) { <p class="app-error" role="alert">{{ fe('name') }}</p> }</div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div><label class="app-label" for="g-code">Code</label><input id="g-code" class="app-input" data-testid="group-code" maxlength="20" [ngModel]="form().code" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ code: $event || null })" />
            @if (fe('code')) { <p class="app-error" role="alert">{{ fe('code') }}</p> }</div>
          <div><label class="app-label" for="g-sort">Sort order</label><input id="g-sort" type="number" class="app-input" [ngModel]="form().sortOrder" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ sortOrder: +$event })" /></div>
        </div>
        <div><label class="app-label" for="g-parent">Parent group</label>
          <zp-search-select inputId="g-parent" testId="group-parent" emptyLabel="None (top level)" noun="group" placeholder="Search groups" [options]="parentOptions()" [value]="form().parentId"
                            [error]="fe('parentId')" (valueChange)="patch({ parentId: $event || null })" /></div>
        <div><label class="app-label" for="g-station">Prepared at</label>
          <zp-search-select inputId="g-station" testId="group-station" [emptyLabel]="stationEmpty()" noun="station" placeholder="Search stations" [options]="stationOptions()" [value]="form().stationId"
                            [error]="fe('stationId')" (valueChange)="patch({ stationId: $event || null })" />
          <p class="mt-1 text-xs text-ink/70">Where the items of this group are prepared when a bill is sent. A group with no station of its own follows its parent group's. An item can name its own station on its stock card.</p></div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div><label class="app-label" for="g-sales-ac">Sales account</label>
            <zp-search-select inputId="g-sales-ac" testId="group-sales-ac" emptyLabel="The company's Sales account" noun="account" placeholder="Search accounts" [options]="salesAccountOptions()" [value]="form().salesAccountId"
                              [error]="fe('salesAccountId')" (valueChange)="patch({ salesAccountId: $event || null })" /></div>
          <div><label class="app-label" for="g-purchase-ac">Stock (purchase) account</label>
            <zp-search-select inputId="g-purchase-ac" testId="group-purchase-ac" emptyLabel="The company's Stock account" noun="account" placeholder="Search accounts" [options]="stockAccountOptions()" [value]="form().purchaseAccountId"
                              [error]="fe('purchaseAccountId')" (valueChange)="patch({ purchaseAccountId: $event || null })" /></div>
        </div>
        <p class="text-xs text-ink/70">In the ledger, the sales and the stock of every item in this group go to these accounts, unless the item's own stock card names another.</p>
        <div><label class="app-label" for="g-desc">Description</label><input id="g-desc" class="app-input" maxlength="300" [ngModel]="form().description" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ description: $event || null })" /></div>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" [checked]="form().isActive" (change)="patch({ isActive: !form().isActive })" /> Active</label>
        @if (dialogError()) { <p class="sys-alert sys-alert-danger" role="alert">{{ dialogError() }}</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="group-save" zpAction="inventory.groups.manage" [disabled]="saving() || !form().name.trim()">Save group</button></div>
      </form>
    </zp-dialog>

    <zp-dialog [open]="dialog() === 'reassign'" [title]="'Reassign members of ' + (reassigning()?.name ?? '')" (closed)="dialog.set(null)">
      <p class="mb-3 text-sm text-ink/80">Every product, stock item and sub-group in this group moves to the group you choose. Sales already made keep the group they were sold under, so past reports do not change.</p>
      <label class="app-label" for="g-target">Move them to</label>
      <zp-search-select inputId="g-target" testId="group-target" emptyLabel="Choose a group..." noun="group" placeholder="Search groups" [options]="targetOptions()" [value]="target()" (valueChange)="target.set($event)" />
      @if (dialogError()) { <p class="sys-alert sys-alert-danger mt-3" role="alert">{{ dialogError() }}</p> }
      <div class="mt-4 flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Cancel</button><button type="button" class="btn-primary" data-testid="group-reassign" [disabled]="saving() || !target()" (click)="reassign()">Move members</button></div>
    </zp-dialog>
  `
})
export class StockGroupsComponent implements OnInit {
  private readonly api = inject(StockGroupApi);
  private readonly ledgerApi = inject(LedgerApi);
  protected readonly stations = inject(StationsService);
  protected readonly defaultStation = computed(() => this.stations.list().find((s) => s.isDefault)?.name ?? null);
  private readonly accountOptions = signal<readonly LedgerAccountOptionDto[]>([]);
  /** Sales go to an income account; stock is held on an asset account (or, for a company that prefers it, an expense). */
  protected readonly salesAccounts = computed(() => this.accountOptions().filter((a) => a.type === 'Income'));
  protected readonly stockAccounts = computed(() => this.accountOptions().filter((a) => a.type === 'Asset' || a.type === 'Expense'));
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly groups = signal<readonly StockGroupDto[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly dialogError = signal<string | null>(null);
  protected readonly showInactive = signal(false);
  protected readonly dialog = signal<'edit' | 'reassign' | null>(null);
  protected readonly editingId = signal<string | null>(null);
  protected readonly form = signal<SaveStockGroupRequest>(blank());
  protected readonly reassigning = signal<StockGroupDto | null>(null);
  protected readonly target = signal('');
  private readonly fieldErrors = signal<Readonly<Record<string, readonly string[]>>>({});

  protected readonly readOnly = computed(() => this.auth.accessModeFor(FEATURES.INVENTORY) === 'readonly');
  protected readonly canManage = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.INVENTORY_GROUPS_MANAGE));
  protected readonly parents = computed(() => this.groups().filter((g) => g.id !== this.editingId() && g.isActive));
  protected readonly targets = computed(() => this.groups().filter((g) => g.id !== this.reassigning()?.id && g.isActive));
  protected readonly parentOptions = computed<readonly SelectOption[]>(() => this.parents().map((p) => ({ value: p.id, label: p.name })));
  protected readonly targetOptions = computed<readonly SelectOption[]>(() => this.targets().map((p) => ({ value: p.id, label: p.name })));
  protected readonly stationOptions = computed<readonly SelectOption[]>(() => this.stations.list().map((s) => ({ value: s.id, label: s.name })));
  /** The parent group chosen in the form: a group that names no station of its own follows the nearest parent's. */
  private readonly chosenParent = computed(() => this.groups().find((g) => g.id === this.form().parentId) ?? null);
  protected readonly stationEmpty = computed(() => {
    const viaParent = this.chosenParent()?.effectiveStationName;
    if (viaParent) return 'As the parent group says (' + viaParent + ')';
    return this.defaultStation() ? 'The default station (' + this.defaultStation() + ')' : 'Nowhere: confirmed when the bill is sent';
  });
  protected readonly salesAccountOptions = computed<readonly SelectOption[]>(() => this.salesAccounts().map((a) => ({ value: a.id, label: `${a.code} ${a.name}` })));
  protected readonly stockAccountOptions = computed<readonly SelectOption[]>(() => this.stockAccounts().map((a) => ({ value: a.id, label: `${a.code} ${a.name}` })));

  ngOnInit(): void {
    void this.load();
    void firstValueFrom(this.ledgerApi.options()).then((a) => this.accountOptions.set(a)).catch(() => undefined);
    void this.stations.load();
  }

  protected fe = (name: string): string | null => this.fieldErrors()[name]?.[0] ?? null;
  protected patch(p: Partial<SaveStockGroupRequest>): void { this.form.update((f) => ({ ...f, ...p })); }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try { this.groups.set(await firstValueFrom(this.api.list(this.showInactive()))); }
    catch (err) { this.error.set(toApiError(err).message); }
    finally { this.loading.set(false); }
  }

  protected openEdit(g: StockGroupDto | null): void {
    this.editingId.set(g?.id ?? null);
    this.form.set(g ? { name: g.name, code: g.code, description: g.description, parentId: g.parentId, sortOrder: g.sortOrder, isActive: g.isActive, stationId: g.stationId ?? null, salesAccountId: g.salesAccountId ?? null, purchaseAccountId: g.purchaseAccountId ?? null } : blank());
    this.fieldErrors.set({});
    this.dialogError.set(null);
    this.dialog.set('edit');
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    this.fieldErrors.set({});
    this.dialogError.set(null);
    try {
      await firstValueFrom(this.api.save(this.editingId(), { ...this.form(), name: this.form().name.trim() }));
      this.dialog.set(null);
      this.toast.success('Group saved.');
      await this.load();
    } catch (err) {
      const e = toApiError(err) as ApiError;
      this.fieldErrors.set(e.fieldErrors);
      this.dialogError.set(Object.keys(e.fieldErrors).length === 0 ? e.message : null);
    } finally { this.saving.set(false); }
  }

  protected async remove(g: StockGroupDto): Promise<void> {
    if (!(await this.confirm.ask({ title: `Delete ${g.name}?`, message: 'This group is not used anywhere, so it can be removed.', confirmLabel: 'Delete', danger: true }))) return;
    try { await firstValueFrom(this.api.remove(g.id)); this.toast.success('Group deleted.'); await this.load(); }
    catch (err) { this.error.set(toApiError(err).message); }
  }

  protected openReassign(g: StockGroupDto): void {
    this.reassigning.set(g);
    this.target.set('');
    this.dialogError.set(null);
    this.dialog.set('reassign');
  }

  protected async reassign(): Promise<void> {
    const g = this.reassigning();
    if (!g) return;
    this.saving.set(true);
    this.dialogError.set(null);
    try {
      await firstValueFrom(this.api.reassign(g.id, this.target()));
      this.dialog.set(null);
      this.toast.success('Members moved.');
      await this.load();
    } catch (err) { this.dialogError.set(toApiError(err).message); } finally { this.saving.set(false); }
  }
}
