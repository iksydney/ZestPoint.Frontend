import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ReportRow } from '../../core/models/nav-ops.model';
import { FEATURES, SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { ReportDefinition } from '../../core/navigation/report-definitions';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { InventoryApi } from '../../core/services/ops.services';
import { ConfirmService, ToastService } from '../../shared/ui/feedback';
import { ReportViewComponent } from '../reports/report-view.component';

interface Group { readonly key: string; readonly supplierId: string; readonly branchId: string; readonly supplier: string; readonly lines: { inventoryItemId: string; quantity: number; unitCost: number; name: string }[]; readonly noCost: boolean }

/**
 * Re-order report. Looking at it orders nothing. Tick the items you want and create purchase-order DRAFTS (one per supplier and branch):
 * a draft still has to be submitted and then approved by somebody else in Purchasing before anything is committed.
 */
@Component({
    selector: 'zp-reorder',
    imports: [RouterLink, ReportViewComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <zp-report-view [definition]="definition" title="Stock Re-Order Report" description="What to order, how much, and why." (selection)="selected.set($event)" />

    @if (canOrder() && !readOnly()) {
      <section class="no-print app-card mt-4" aria-label="Create purchase orders" data-testid="reorder-actions">
        <h2 class="font-semibold">Purchase order drafts</h2>
        <p class="mt-1 text-sm text-ink/80">{{ selectedCount() }} item(s) ticked. Drafts are created per supplier and branch; nothing is sent to a supplier and nothing is approved here.</p>
        @if (skipped() > 0) { <p class="mt-1 text-sm text-danger" role="status" data-testid="reorder-skipped">{{ skipped() }} ticked item(s) cannot be ordered: they have no supplier or no suggested quantity. Set a supplier in Add / Modify Stock.</p> }
        @if (groups().length > 0) {
          <ul class="mt-2 space-y-1 text-sm" data-testid="reorder-groups">@for (g of groups(); track g.key) { <li>{{ g.supplier }}: {{ g.lines.length }} item(s){{ g.noCost ? ' (costs are blank; add them on the draft)' : '' }}</li> }</ul>
        }
        <button type="button" class="btn-primary mt-3" data-testid="reorder-create" [disabled]="busy() || groups().length === 0 || created().length > 0" (click)="create()">Create draft purchase order(s)</button>
        @if (error()) { <p class="sys-alert sys-alert-danger mt-2" role="alert">{{ error() }}</p> }
        @if (created().length > 0) { <p class="sys-alert sys-alert-success mt-2" role="status" data-testid="reorder-created">Created {{ created().length }} draft(s): {{ created().join(', ') }}. Open <a class="underline" routerLink="/app/purchasing/orders">Purchasing / Purchase Orders</a> to review, submit and approve them.</p> }
      </section>
    }
  `
})
export class ReorderComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly inventory = inject(InventoryApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly definition = this.route.snapshot.data['report'] as ReportDefinition;
  protected readonly selected = signal<readonly ReportRow[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly created = signal<readonly string[]>([]);
  /** One key per supplier/branch group, kept for the life of the screen so a retry never makes a second draft. */
  private readonly keys = new Map<string, string>();

  protected readonly readOnly = computed(() => this.auth.accessModeFor(FEATURES.INVENTORY) === 'readonly');
  protected readonly canOrder = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.INVENTORY_PURCHASE_MANAGE));
  protected readonly selectedCount = computed(() => this.selected().length);

  /** Ticked rows that can become order lines, grouped by supplier and branch. */
  protected readonly groups = computed<readonly Group[]>(() => {
    const map = new Map<string, Group>();
    for (const r of this.selected()) {
      const supplierId = r['supplierId'] ? String(r['supplierId']) : '';
      const qty = typeof r['suggested'] === 'number' ? r['suggested'] : 0;
      if (!supplierId || qty <= 0) continue;
      const branchId = String(r['branchId']);
      const key = `${supplierId}|${branchId}`;
      const est = typeof r['estimate'] === 'number' ? r['estimate'] : null;
      const unitCost = est !== null && qty > 0 ? Math.round((est / qty) * 10000) / 10000 : 0;
      const g = map.get(key) ?? { key, supplierId, branchId, supplier: String(r['supplier'] ?? 'Supplier'), lines: [], noCost: false };
      g.lines.push({ inventoryItemId: String(r['itemId']), quantity: qty, unitCost, name: String(r['name']) });
      map.set(key, { ...g, noCost: g.noCost || est === null });
    }
    return [...map.values()];
  });

  protected readonly skipped = computed(() => this.selected().length - this.groups().reduce((n, g) => n + g.lines.length, 0));

  protected async create(): Promise<void> {
    const gs = this.groups();
    if (!(await this.confirm.ask({ title: 'Create purchase order drafts?', message: `${gs.length} draft(s) will be created. They are not sent or approved.`, confirmLabel: 'Create drafts' }))) return;
    this.busy.set(true);
    this.error.set(null);
    const numbers: string[] = [];
    try {
      for (const g of gs) {
        const po = await firstValueFrom(this.inventory.savePurchaseOrder(null, {
          branchId: g.branchId, supplierId: g.supplierId, notes: 'From the re-order report', rowVersion: null,
          idempotencyKey: this.keys.get(g.key) ?? (this.keys.set(g.key, `reorder-${crypto.randomUUID()}`), this.keys.get(g.key)!),
          lines: g.lines.map((l) => ({ inventoryItemId: l.inventoryItemId, quantity: l.quantity, unitCost: l.unitCost }))
        }));
        numbers.push(`#${po.number}`);
      }
      this.created.set(numbers);
      this.toast.success(`Created ${numbers.length} draft purchase order(s).`);
    } catch (err) {
      this.created.set(numbers); // never hide drafts that did get created before a failure
      this.error.set(`${toApiError(err).message}${numbers.length ? ` Already created: ${numbers.join(', ')}.` : ''}`);
    } finally { this.busy.set(false); }
  }
}
