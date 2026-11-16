import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { FEATURES, SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { UsageRowDto, VarianceDto, VarianceSummaryRowDto } from '../../core/models/ops.model';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { BranchContextService } from '../../core/services/branch-context.service';
import { AuditsApi, InventoryApi } from '../../core/services/ops.services';
import { DialogComponent } from '../../shared/ui/feedback';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';

const TONE = { None: 'success', Warning: 'warning', Investigate: 'warning', Escalate: 'danger' } as const;

/** Usage and days-of-stock forecasts for everyone with inventory access; pour-variance analytics for those with the weigh-audit module. */
@Component({
    selector: 'zp-insights-tab',
    imports: [DecimalPipe, FormsModule, DialogComponent, StatusBadgeComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    @if (error()) { <p class="sys-alert sys-alert-danger mb-3" role="alert">{{ error() }}</p> }

    <h2 class="mb-2 text-lg font-semibold">Usage and stock cover (last 14 days)</h2>
    <div class="app-card mb-6 overflow-x-auto p-0">
      <table class="app-table" data-testid="usage-table"><thead><tr><th>Item</th><th class="text-right">On hand</th><th class="text-right">Used (sales)</th><th class="text-right">Total depletion</th><th class="text-right">Per day</th><th class="text-right">Days left</th></tr></thead>
        <tbody>@for (u of usage(); track u.inventoryItemId) { <tr [class]="u.low ? 'bg-danger/5' : ''"><td>{{ u.itemName }}</td><td class="text-right">{{ u.onHand | number: '1.0-2' }}</td><td class="text-right">{{ u.expectedConsumption | number: '1.0-2' }}</td>
          <td class="text-right">{{ u.actualDepletion | number: '1.0-2' }}</td><td class="text-right">{{ u.averageDailyUsage | number: '1.0-2' }}</td>
          <td class="text-right">@if (u.daysRemaining !== null) { <zp-status-badge [tone]="u.daysRemaining < 3 ? 'danger' : u.daysRemaining < 7 ? 'warning' : 'success'">{{ u.daysRemaining | number: '1.0-1' }}</zp-status-badge> } @else { <span class="text-ink/50">no sales</span> }</td></tr> }
          @empty { <tr><td colspan="6" class="py-6 text-center text-ink/70">No usage recorded yet.</td></tr> }</tbody></table>
    </div>

    @if (canVariance()) {
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2"><h2 class="text-lg font-semibold">Pour variance</h2>
        <div class="flex items-center gap-2 text-sm"><label for="vf">Show at least</label>
          <select id="vf" class="app-input w-auto py-1" data-testid="variance-filter" [ngModel]="minSeverity()" (ngModelChange)="minSeverity.set($event); loadVariances()"><option value="">Everything</option><option value="Warning">Warning</option><option value="Investigate">Investigate</option><option value="Escalate">Escalate</option></select>
          <label for="vg">Summarise by</label>
          <select id="vg" class="app-input w-auto py-1" [ngModel]="groupBy()" (ngModelChange)="groupBy.set($event); loadSummary()"><option value="item">Item</option><option value="operator">Person</option><option value="station">Station</option><option value="shift">Shift</option></select></div></div>
      <p class="mb-2 text-sm text-ink/70">Variance is measured minus expected. Negative means less stock than expected. It is a reason to look closer, not proof that anyone did anything wrong.</p>

      <div class="app-card mb-4 overflow-x-auto p-0"><table class="app-table" data-testid="variance-summary"><thead><tr><th>{{ groupBy() }}</th><th class="text-right">Readings</th><th class="text-right">Total variance</th><th class="text-right">Average %</th><th class="text-right">Escalations</th></tr></thead>
        <tbody>@for (s of summary(); track s.key) { <tr><td>{{ s.key }}</td><td class="text-right">{{ s.count }}</td><td class="text-right">{{ s.totalVariance | number: '1.0-2' }}</td><td class="text-right">{{ s.averagePercent | number: '1.0-1' }}%</td><td class="text-right">{{ s.escalations }}</td></tr> }
          @empty { <tr><td colspan="5" class="py-6 text-center text-ink/70">No variance data yet.</td></tr> }</tbody></table></div>

      <div class="app-card overflow-x-auto p-0"><table class="app-table" data-testid="variance-table"><thead><tr><th>When</th><th>Item</th><th>Source</th><th class="text-right">Expected</th><th class="text-right">Measured</th><th class="text-right">Variance</th><th class="text-right">%</th><th>Severity</th><th>Station / shift</th><th></th></tr></thead>
        <tbody>@for (v of variances(); track v.id) { <tr [attr.data-testid]="'variance-' + v.itemName">
          <td class="whitespace-nowrap text-xs">{{ v.measuredAtUtc.slice(0, 16).replace('T', ' ') }}</td><td>{{ v.itemName }}</td>
          <td><zp-status-badge [tone]="v.source === 'Scale' ? 'success' : v.source === 'Demo' ? 'warning' : 'primary'">{{ v.source }}</zp-status-badge></td>
          <td class="text-right">{{ v.expectedQuantity | number: '1.0-2' }}</td><td class="text-right">{{ v.measuredQuantity | number: '1.0-2' }}</td><td class="text-right" [class.text-danger]="v.variance < 0">{{ v.variance | number: '1.0-2' }}</td>
          <td class="text-right">{{ v.variancePercent === null ? 'n/a' : (v.variancePercent | number: '1.0-1') + '%' }}</td>
          <td><zp-status-badge [tone]="tone(v)">{{ v.severity }}</zp-status-badge></td><td class="text-xs">{{ v.stationId }} {{ v.shiftLabel }}</td>
          <td class="text-right">@if (v.reviewed) { <zp-status-badge tone="success">Reviewed</zp-status-badge> } @else { <button type="button" class="btn-outline px-2 py-1 text-sm" (click)="openReview(v)">Review</button> }</td></tr> }
          @empty { <tr><td colspan="10" class="py-6 text-center text-ink/70">No variances recorded.</td></tr> }</tbody></table></div>
    } @else {
      <p class="sys-alert sys-alert-info" role="status">Pour-variance analytics are not part of your current plan or your role.</p>
    }

    <zp-dialog [open]="reviewing() !== null" title="Review variance" (closed)="reviewing.set(null)">
      <form class="space-y-3" (submit)="$event.preventDefault(); review()">
        <div><label class="app-label" for="rv-note">What did you find?</label><input id="rv-note" class="app-input" data-testid="review-note" [ngModel]="note()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="note.set($event)" /></div>
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="reviewing.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="review-save" [disabled]="note().trim().length < 3">Mark reviewed</button></div>
      </form>
    </zp-dialog>
  `
})
export class InsightsTabComponent {
  private readonly audits = inject(AuditsApi);
  private readonly inventory = inject(InventoryApi);
  private readonly auth = inject(AuthService);
  protected readonly branches = inject(BranchContextService);

  protected readonly usage = signal<readonly UsageRowDto[]>([]);
  protected readonly variances = signal<readonly VarianceDto[]>([]);
  protected readonly summary = signal<readonly VarianceSummaryRowDto[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly minSeverity = signal('');
  protected readonly groupBy = signal('item');
  protected readonly reviewing = signal<VarianceDto | null>(null);
  protected readonly note = signal('');

  protected readonly canVariance = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.INVENTORY_VARIANCE_VIEW) && this.auth.accessModeFor(FEATURES.ADVANCED_POUR_ANALYTICS) !== 'locked');

  constructor() {
    effect(() => {
      if (this.branches.activeId()) untracked(() => void this.loadAll());
    });
  }

  protected tone = (v: VarianceDto) => TONE[v.severity];

  private async loadAll(): Promise<void> {
    const branchId = this.branches.activeId();
    if (!branchId) return;
    try { this.usage.set(await firstValueFrom(this.inventory.usage(branchId, 14))); } catch (err) { this.error.set(toApiError(err).message); }
    if (this.canVariance()) { await this.loadVariances(); await this.loadSummary(); }
  }

  protected async loadVariances(): Promise<void> {
    try { this.variances.set((await firstValueFrom(this.audits.variances({ branchId: this.branches.activeId() ?? undefined, minSeverity: this.minSeverity() || undefined, pageSize: 100 }))).items); }
    catch (err) { this.error.set(toApiError(err).message); }
  }

  protected async loadSummary(): Promise<void> {
    try { this.summary.set(await firstValueFrom(this.inventory.varianceSummary({ branchId: this.branches.activeId() ?? undefined, groupBy: this.groupBy() }))); }
    catch (err) { this.error.set(toApiError(err).message); }
  }

  protected openReview(v: VarianceDto): void { this.reviewing.set(v); this.note.set(''); }

  protected async review(): Promise<void> {
    const v = this.reviewing();
    if (!v) return;
    try {
      await firstValueFrom(this.audits.review(v.id, this.note().trim()));
      this.reviewing.set(null);
      await this.loadVariances();
    } catch (err) { this.error.set(toApiError(err).message); }
  }
}
