import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ProductionItemDto, ProductionRunDto } from '../../core/models/kitchen.model';
import { FEATURES } from '../../core/models/rbac.model';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { BranchContextService } from '../../core/services/branch-context.service';
import { KitchenApi } from '../../core/services/kitchen.services';
import { ToastService } from '../../shared/ui/feedback';

/**
 * Production (owner's decisions, 2026-11-21): the kitchen records a batch it made (a cake baked once, a pot of stew) and says how many portions actually came out. The ingredients leave
 * stock by the item's batch recipe, allowing for what is lost in trimming; the portions are added as stock of the item that is sold, with a cost and an expiry date; the difference from the
 * number the recipe expects is kept as variance. The cook records it without anyone approving it; every batch is audited. A batch sent twice (a lost answer) is recorded once, because
 * the screen keeps the batch's own id until the server has answered.
 */
@Component({
    selector: 'zp-production',
    imports: [DatePipe, DecimalPipe, FormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="flex flex-col gap-4" data-testid="production">
      <div>
        <h1 class="text-2xl font-bold">Production</h1>
        <p class="text-sm text-ink/70">Record a batch the kitchen made. The ingredients leave stock, the portions you got are added, and the cost of a portion is worked out. Selling a portion then takes it from these.</p>
      </div>
      @if (error()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="production-error">{{ error() }}</p> }
      @if (readOnly()) { <p class="sys-alert sys-alert-info" role="status">Your subscription is read-only: batches can be seen but not recorded.</p> }
      @if (!branches.activeId()) { <p class="sys-alert sys-alert-warning" role="status">You are not assigned to a branch yet.</p> }

      <section class="app-card space-y-3" aria-label="Record a batch" data-testid="production-form">
        <h2 class="text-lg font-semibold">Record a batch</h2>
        @if (!loading() && items().length === 0) {
          <p class="text-sm text-ink/80" data-testid="production-none">Nothing is made in batches yet. On an item's stock card, put how many portions one batch gives (Details tab), then say what a batch takes (Recipe and options tab).</p>
        } @else {
          <form class="grid gap-3 sm:grid-cols-2" (submit)="$event.preventDefault(); record()" data-testid="production-fields">
            <div class="sm:col-span-2"><label class="app-label" for="pr-item">What was made</label>
              <select id="pr-item" class="app-input" data-testid="production-item" [ngModel]="itemId()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="pick($event)">
                <option value="">Choose an item</option>@for (i of items(); track i.itemId) { <option [value]="i.itemId">{{ i.name }}</option> }</select></div>
            @if (picked(); as p) {
              <p class="text-sm text-ink/80 sm:col-span-2" data-testid="production-summary">One batch gives {{ p.portionsPerBatch | number: '1.0-3' }} portion{{ p.portionsPerBatch === 1 ? '' : 's' }} and takes {{ p.ingredientCount }} ingredient{{ p.ingredientCount === 1 ? '' : 's' }}.
                {{ p.onHand | number: '1.0-3' }} on hand now.@if (p.costPerPortion !== null) { A portion costs {{ p.costPerPortion | number: '1.2-2' }}. }@if (p.stationName) { Made at the {{ p.stationName }}. }@if (p.shelfLifeDays) { Keeps {{ p.shelfLifeDays }} days. }</p>
            }
            <div><label class="app-label" for="pr-batches">Batches made</label><input id="pr-batches" type="number" min="0" step="any" class="app-input" data-testid="production-batches" [ngModel]="batches()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="batches.set(+$event)" /></div>
            <div><label class="app-label" for="pr-actual">Portions that came out</label><input id="pr-actual" type="number" min="0" step="any" class="app-input" data-testid="production-actual" [ngModel]="actual()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="typed.set(+$event)" /></div>
            @if (picked()) { <p class="text-sm sm:col-span-2" [class.text-danger]="variance() < 0" data-testid="production-variance">{{ varianceText() }}</p> }
            <div class="sm:col-span-2"><label class="app-label" for="pr-note">Note (optional)</label><input id="pr-note" class="app-input" maxlength="500" data-testid="production-note" [ngModel]="note()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="note.set($event)" /></div>
            <div class="sm:col-span-2"><button type="submit" class="btn-primary touch-target" data-testid="production-record" [disabled]="busy() || readOnly() || !itemId() || batches() <= 0">{{ busy() ? 'Recording...' : 'Record the batch' }}</button></div>
          </form>
        }
      </section>

      <section class="app-card overflow-hidden p-0" aria-label="Recent batches">
        <div class="bg-ink/5 px-4 py-2"><h2 class="text-lg font-semibold">Recent batches</h2></div>
        <div class="overflow-x-auto">
          <table class="app-table min-w-[44rem]" data-testid="production-runs">
            <caption class="sr-only">Batches recorded in the last two weeks</caption>
            <thead><tr><th>No.</th><th>When</th><th>Item</th><th class="text-right">Batches</th><th class="text-right">Expected</th><th class="text-right">Made</th><th class="text-right">Difference</th><th class="text-right">Cost of a portion</th><th>By</th></tr></thead>
            <tbody>
              @for (r of runs(); track r.id) {
                <tr [attr.data-testid]="'run-row-' + r.number">
                  <td>{{ r.number }}</td><td class="whitespace-nowrap">{{ r.recordedAtUtc | date: 'd MMM, HH:mm' }}</td><td class="font-semibold">{{ r.outputItemName }}</td>
                  <td class="text-right">{{ r.batches | number: '1.0-3' }}</td><td class="text-right">{{ r.expectedPortions | number: '1.0-3' }}</td><td class="text-right">{{ r.actualPortions | number: '1.0-3' }}</td>
                  <td class="text-right" [class.text-danger]="r.variance < 0">{{ r.variance | number: '1.0-3' }}@if (r.variancePercent !== null) { <span class="text-xs text-ink/60"> ({{ r.variancePercent | number: '1.0-1' }}%)</span> }</td>
                  <td class="text-right">{{ r.costPerPortion === null ? '' : (r.costPerPortion | number: '1.2-2') }}</td><td>{{ r.recordedByName }}</td>
                </tr>
              } @empty { <tr><td colspan="9" class="py-8 text-center text-ink/70">{{ loading() ? 'Loading...' : 'No batches recorded in the last two weeks.' }}</td></tr> }
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `
})
export class ProductionComponent {
  private readonly api = inject(KitchenApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  protected readonly branches = inject(BranchContextService);

  protected readonly items = signal<readonly ProductionItemDto[]>([]);
  protected readonly runs = signal<readonly ProductionRunDto[]>([]);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly itemId = signal('');
  protected readonly batches = signal(1);
  protected readonly typed = signal<number | null>(null);
  protected readonly note = signal('');

  /** The batch's own id, kept until the server has answered: sending the same batch again records it once. */
  private pendingId: string | null = null;

  protected readonly readOnly = computed(() => this.auth.accessModeFor(FEATURES.INVENTORY) === 'readonly');
  protected readonly picked = computed(() => this.items().find((i) => i.itemId === this.itemId()) ?? null);
  protected readonly expected = computed(() => Math.round((this.picked()?.portionsPerBatch ?? 0) * this.batches() * 10000) / 10000);
  protected readonly actual = computed(() => this.typed() ?? this.expected());
  protected readonly variance = computed(() => Math.round((this.actual() - this.expected()) * 10000) / 10000);
  protected readonly varianceText = computed(() => {
    const e = this.expected(); const a = this.actual(); const v = this.variance();
    if (v === 0) return `Expected ${e} and made ${a}: as the recipe says.`;
    const percent = e > 0 ? ` (${Math.abs(Math.round(v / e * 1000) / 10)}%)` : '';
    return `Expected ${e} and made ${a}: ${Math.abs(v)} ${v < 0 ? 'fewer' : 'more'}${percent}. The difference is kept and reported.`;
  });

  constructor() {
    effect(() => { this.branches.activeId(); untracked(() => void this.reload()); }, { allowSignalWrites: true });
  }

  protected pick(id: string): void { this.itemId.set(id); this.typed.set(null); this.pendingId = null; }

  private async reload(): Promise<void> {
    const branch = this.branches.activeId();
    if (!branch) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const [items, runs] = await Promise.all([firstValueFrom(this.api.productionItems(branch)), firstValueFrom(this.api.productionRuns(branch))]);
      this.items.set(items);
      this.runs.set(runs);
    } catch (err) { this.error.set(toApiError(err).message); } finally { this.loading.set(false); }
  }

  protected async record(): Promise<void> {
    const branch = this.branches.activeId();
    if (!branch || !this.itemId() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.pendingId ??= crypto.randomUUID();
    try {
      const run = await firstValueFrom(this.api.recordRun({ id: this.pendingId, branchId: branch, outputItemId: this.itemId(), batches: this.batches(), actualPortions: this.actual(), note: this.note().trim() || null }));
      this.pendingId = null;
      this.toast.success(`Batch ${run.number} recorded: ${run.actualPortions} ${run.outputItemName}.`);
      this.typed.set(null);
      this.note.set('');
      await this.reload();
    } catch (err) { this.error.set(toApiError(err).message); } finally { this.busy.set(false); }
  }
}
