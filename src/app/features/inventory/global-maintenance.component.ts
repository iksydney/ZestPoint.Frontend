import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { BulkChangeResultDto, BulkField, BulkStockChangeRequest, StockGroupDto } from '../../core/models/nav-ops.model';
import { FEATURES } from '../../core/models/rbac.model';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { GlobalStockApi, StockGroupApi } from '../../core/services/nav-ops.services';
import { ConfirmService, ToastService } from '../../shared/ui/feedback';

interface FieldSpec { readonly key: BulkField; readonly label: string; readonly kind: 'number' | 'bool' | 'group'; readonly help: string }

const FIELDS: readonly FieldSpec[] = [
  { key: 'group', label: 'Stock group', kind: 'group', help: 'Moves the chosen items into another group. Sales already made keep the group they were sold under.' },
  { key: 'reorder_level', label: 'Reorder threshold', kind: 'number', help: 'Must stay at or above each item\'s minimum level and at or below its target stock.' },
  { key: 'minimum_level', label: 'Minimum level', kind: 'number', help: 'Must stay at or below each item\'s reorder threshold.' },
  { key: 'reorder_quantity', label: 'Reorder quantity', kind: 'number', help: 'How much to order when below the threshold.' },
  { key: 'target_stock', label: 'Target stock', kind: 'number', help: 'Must not be below each item\'s reorder threshold.' },
  { key: 'active', label: 'Active / inactive', kind: 'bool', help: 'Deactivating keeps all history. An item that still has stock on hand cannot be deactivated.' },
  { key: 'web_store', label: 'Flagged for web store', kind: 'bool', help: 'Only sets the marker; nothing is published.' }
];

/**
 * Company-wide stock maintenance: change one property for many items at once. The change is previewed first (with the records it will touch
 * and any that cannot take it), then applied all-or-nothing, with the before and after of every item written to the activity log.
 * It works only inside this company; there is no cross-company reach here.
 */
@Component({
  selector: 'zp-global-maintenance',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-2xl font-bold">Global Stock Maintenance</h1>
    <p class="mt-1 max-w-3xl text-sm text-ink/80">Change one property for many stock items at once. Preview first: nothing is saved until you apply, and a change that any item cannot take is not applied to any.</p>
    @if (readOnly()) { <p class="sys-alert sys-alert-warning my-3" role="status">Read-only: your subscription limits this screen.</p> }
    @if (error()) { <p class="sys-alert sys-alert-danger my-3" role="alert" data-testid="global-error">{{ error() }}</p> }

    <section class="app-card mt-4 grid gap-4 lg:grid-cols-2" aria-label="What to change">
      <div class="space-y-3"><h2 class="font-semibold">1. What to change</h2>
        <div><label class="app-label" for="g-field">Property</label><select id="g-field" class="app-input" data-testid="global-field" [ngModel]="field()" (ngModelChange)="setField($event)">@for (f of fields; track f.key) { <option [value]="f.key">{{ f.label }}</option> }</select>
          <p class="mt-1 text-xs text-ink/70">{{ spec().help }}</p></div>
        <div><label class="app-label" for="g-value">New value</label>
          @switch (spec().kind) {
            @case ('group') { <select id="g-value" class="app-input" data-testid="global-value" [ngModel]="value()" (ngModelChange)="value.set($event); dirty()"><option value="">Choose a group...</option>@for (g of activeGroups(); track g.id) { <option [value]="g.id">{{ g.name }}</option> }</select> }
            @case ('bool') { <select id="g-value" class="app-input" data-testid="global-value" [ngModel]="value()" (ngModelChange)="value.set($event); dirty()"><option value="">Choose...</option><option value="true">Yes</option><option value="false">No</option></select> }
            @default { <input id="g-value" type="number" min="0" step="any" class="app-input" data-testid="global-value" [ngModel]="value()" (ngModelChange)="value.set($event === null ? '' : '' + $event); dirty()" /> }
          }</div>
      </div>
      <div class="space-y-3"><h2 class="font-semibold">2. Which items</h2>
        <div><label class="app-label" for="g-group">In stock group</label><select id="g-group" class="app-input" data-testid="global-scope-group" [ngModel]="scopeGroup()" (ngModelChange)="scopeGroup.set($event); dirty()"><option value="">Any group</option>@for (g of groups(); track g.id) { <option [value]="g.id">{{ g.name }}</option> }</select></div>
        <div><label class="app-label" for="g-search">Name or SKU contains</label><input id="g-search" class="app-input" data-testid="global-scope-search" [ngModel]="scopeSearch()" (ngModelChange)="scopeSearch.set($event); dirty()" /></div>
        <div><label class="app-label" for="g-active">Status</label><select id="g-active" class="app-input" [ngModel]="scopeActive()" (ngModelChange)="scopeActive.set($event); dirty()"><option value="">Any</option><option value="true">Active only</option><option value="false">Inactive only</option></select></div>
        <p class="text-xs text-ink/70">Choose at least one of these so you never change the whole catalogue by accident.</p>
      </div>
      <div class="lg:col-span-2"><button type="button" class="btn-primary" data-testid="global-preview" [disabled]="busy() || !canPreview()" (click)="preview()">Preview change</button></div>
    </section>

    @if (result(); as r) {
      <section class="mt-6" data-testid="global-result" aria-label="Preview">
        <h2 class="mb-2 text-lg font-semibold">3. Preview</h2>
        <p class="mb-2 text-sm" data-testid="global-summary">{{ r.affectedCount }} item(s) would change. @if (r.problemCount > 0) { <span class="text-danger">{{ r.problemCount }} cannot take this change, so nothing can be applied until you narrow the selection or change the value.</span> }
          @if (r.truncated) { <span class="text-danger">More items match than one change may cover; narrow the selection.</span> }</p>
        <div class="app-card max-h-96 overflow-auto p-0"><table class="app-table"><thead><tr><th>Item</th><th>SKU</th><th>Now</th><th>After</th><th>Problem</th></tr></thead>
          <tbody>@for (row of shown(); track row.itemId) { <tr><td>{{ row.itemName }}</td><td>{{ row.sku }}</td><td>{{ row.before ?? '-' }}</td><td>{{ row.after }}</td><td class="text-danger">{{ row.problem }}</td></tr> }
            @empty { <tr><td colspan="5" class="py-6 text-center text-ink/70">No items match.</td></tr> }</tbody></table></div>
        @if (r.rows.length > 200) { <p class="mt-1 text-xs text-ink/70">Showing the first 200 of {{ r.rows.length }}. All of them are covered by the change.</p> }

        @if (r.problemCount === 0 && r.affectedCount > 0 && !r.truncated && !r.applied) {
          <div class="app-card mt-4 max-w-xl space-y-3">
            <label class="app-label" for="g-reason">Reason for this company-wide change (recorded)</label>
            <input id="g-reason" class="app-input" data-testid="global-reason" maxlength="300" [ngModel]="reason()" (ngModelChange)="reason.set($event)" />
            <button type="button" class="btn-primary" data-testid="global-apply" [disabled]="busy() || readOnly() || reason().trim().length < 3" (click)="apply()">Apply to {{ r.affectedCount }} item(s)</button>
          </div>
        }
        @if (r.applied) { <p class="sys-alert sys-alert-success mt-4" role="status" data-testid="global-done">Applied to {{ r.affectedCount }} item(s). Before and after values were recorded in the activity log.</p> }
      </section>
    }
  `
})
export class GlobalMaintenanceComponent implements OnInit {
  private readonly api = inject(GlobalStockApi);
  private readonly groupApi = inject(StockGroupApi);
  private readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  protected readonly fields = FIELDS;
  protected readonly field = signal<BulkField>('reorder_level');
  protected readonly value = signal('');
  protected readonly scopeGroup = signal('');
  protected readonly scopeSearch = signal('');
  protected readonly scopeActive = signal('');
  protected readonly reason = signal('');
  protected readonly groups = signal<readonly StockGroupDto[]>([]);
  protected readonly result = signal<BulkChangeResultDto | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly spec = computed(() => FIELDS.find((f) => f.key === this.field())!);
  protected readonly readOnly = computed(() => this.auth.accessModeFor(FEATURES.INVENTORY) === 'readonly');
  protected readonly activeGroups = computed(() => this.groups().filter((g) => g.isActive));
  protected readonly shown = computed(() => this.result()?.rows.slice(0, 200) ?? []);
  protected readonly canPreview = computed(() => this.value() !== '' && (this.scopeGroup() !== '' || this.scopeSearch().trim() !== '' || this.scopeActive() !== ''));

  ngOnInit(): void {
    void firstValueFrom(this.groupApi.list(true)).then((g) => this.groups.set(g)).catch(() => undefined);
  }

  protected setField(f: BulkField): void {
    this.field.set(f);
    this.value.set('');
    this.dirty();
  }

  /** Any change to the inputs invalidates a preview: what was shown is no longer what would be applied. */
  protected dirty(): void {
    this.result.set(null);
    this.error.set(null);
  }

  private body(): BulkStockChangeRequest {
    return {
      field: this.field(), value: this.value(), groupId: this.scopeGroup() || null, search: this.scopeSearch().trim() || null, itemIds: null,
      activeOnly: this.scopeActive() === '' ? null : this.scopeActive() === 'true', expectedCount: null, reason: null
    };
  }

  protected async preview(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try { this.result.set(await firstValueFrom(this.api.preview(this.body()))); }
    catch (err) { this.result.set(null); this.error.set(toApiError(err).message); }
    finally { this.busy.set(false); }
  }

  protected async apply(): Promise<void> {
    const r = this.result();
    if (!r) return;
    const ok = await this.confirm.ask({ title: 'Apply this change?', message: `${r.affectedCount} stock item(s) will be changed company-wide. Every before and after value is recorded.`, confirmLabel: 'Apply change' });
    if (!ok) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      this.result.set(await firstValueFrom(this.api.apply({ ...this.body(), expectedCount: r.affectedCount, reason: this.reason().trim() })));
      this.toast.success('Change applied.');
      this.reason.set('');
    } catch (err) { this.error.set(toApiError(err).message); }
    finally { this.busy.set(false); }
  }
}
