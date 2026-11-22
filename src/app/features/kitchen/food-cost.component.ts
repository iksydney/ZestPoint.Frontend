import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { FoodCostChange, FoodCostDishDto, FoodCostDto, FoodCostFailure } from '../../core/models/kitchen.model';
import { FEATURES } from '../../core/models/rbac.model';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { KitchenApi } from '../../core/services/kitchen.services';
import { ConfirmService, ToastService } from '../../shared/ui/feedback';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';

/** What a person has typed for one dish, as typed: a field not touched is absent. Kept as text so a half-typed number is never rewritten under the cursor. */
interface DishEdit { price?: string; target?: string }

/** One dish as the table shows it: the server's figures, or, once the person has typed, the figures worked out from what was typed. */
interface DishRow {
  readonly d: FoodCostDishDto;
  readonly changed: boolean;
  readonly priceError: string | null;
  readonly targetError: string | null;
  readonly percent: number | null;
  readonly suggested: number | null;
  /** The target that applies to this dish: its own (saved or typed), else the one the figures were worked out for. */
  readonly target: number;
  readonly ownTarget: boolean;
  /** The own-target box has something in it (so there is something to clear). */
  readonly targetFilled: boolean;
  readonly over: boolean;
  /** What would be saved; null when nothing has changed or what was typed cannot be saved. */
  readonly change: FoodCostChange | null;
  readonly summary: string | null;
}

const MIN_PRICE = 0.01;
const text = (v: string): number => (v.trim() === '' ? Number.NaN : Number(v));
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const money = (n: number): string => n.toFixed(2);

/**
 * Food cost (owner's decisions, 2026-11-21): what each dish costs against what it sells for. The cost of one portion comes from each ingredient's average cost (allowing for what is lost
 * in trimming) and, beside it, from the latest purchase cost, so a price rise is seen before the average catches up. The food cost % is worked out against the price with the tax in it
 * taken out. The business chooses the food cost it wants; each dish shows the price that would reach it, and one button applies it through the price service (so the right to manage
 * prices, the audit trail and any scheduled changes, price lists and branch prices all apply). Only people who may see costs reach this screen.
 *
 * Single edits (owner's decisions, 2026-11-22): a person who may set prices can type a price for a dish, give one dish its own target %, and edit several dishes and save once. As they type, the
 * dish's food cost % and its price for the target follow at once, worked out in the page from the dish's average cost and tax factor so it is quick to try; saving sends the typed values to the
 * server, which checks them again (minimum price, rights), names any dish it cannot save and still saves the rest. The typed values of a dish that failed stay in the table.
 */
@Component({
    selector: 'zp-food-cost',
    imports: [DecimalPipe, FormsModule, StatusBadgeComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="flex flex-col gap-4" data-testid="food-cost">
      <div>
        <h1 class="text-2xl font-bold">Food cost</h1>
        <p class="text-sm text-ink/70">What each dish costs against its price. Choose the food cost you want and each dish shows the price that would reach it.</p>
      </div>
      @if (error()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="foodcost-error">{{ error() }}</p> }
      @if (readOnly()) { <p class="sys-alert sys-alert-info" role="status">Your subscription is read-only: figures can be seen but prices not changed.</p> }

      <section class="app-card flex flex-wrap items-end gap-3" aria-label="Target">
        <div><label class="app-label" for="fc-target">Food cost I want (%)</label><input id="fc-target" type="number" min="1" max="99" step="any" class="app-input w-32" data-testid="foodcost-target" [ngModel]="target()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="target.set(+$event)" /></div>
        <button type="button" class="btn-outline" data-testid="foodcost-refresh" [disabled]="loading() || busy() || target() < 1 || target() > 99" (click)="load()">Work it out</button>
        @if (data(); as d) { <p class="text-sm text-ink/70">Prices {{ d.taxInclusive ? 'include' : 'do not include' }} tax; the food cost % is against the price without it. Amounts in {{ d.currencyCode }}.</p> }
      </section>

      @if (canEdit()) {
        <section class="app-card flex flex-wrap items-center gap-3" aria-label="Changes" data-testid="foodcost-bar">
          <p class="text-sm" role="status" data-testid="foodcost-count">
            @if (changeCount() === 0) { No changes yet. Type a new price, or a food cost of its own for one dish, in the table, then save one dish or all your changes at once. }
            @else {
              <strong>{{ changeCount() }} {{ changeCount() === 1 ? 'change' : 'changes' }}</strong> not saved yet.
              @if (errorCount() > 0) { <span class="text-danger"> {{ errorCount() === 1 ? 'One dish needs' : errorCount() + ' dishes need' }} fixing first: they are marked below.</span> }
            }
          </p>
          <div class="ml-auto flex flex-wrap gap-2">
            <button type="button" class="btn-primary" data-testid="foodcost-save-all" [disabled]="busy() || changeCount() === 0 || errorCount() > 0" (click)="saveAll()">Save changes</button>
            <button type="button" class="btn-outline" data-testid="foodcost-discard" [disabled]="busy() || (changeCount() === 0 && !failed().length)" (click)="discard()">Discard</button>
          </div>
        </section>
      }

      @if (failed().length) {
        <div class="sys-alert sys-alert-danger" role="alert" data-testid="foodcost-failed">
          <p class="font-semibold">{{ failed().length === 1 ? 'This dish was not saved' : 'These dishes were not saved' }}. What you typed for {{ failed().length === 1 ? 'it' : 'them' }} is still in the table.</p>
          <ul class="ml-5 list-disc">@for (f of failed(); track f.productId) { <li [attr.data-testid]="'foodcost-failed-' + f.name">{{ f.name }}: {{ f.message }}</li> }</ul>
        </div>
      }

      <section class="app-card overflow-hidden p-0" aria-label="Dishes">
        <div class="overflow-x-auto">
          <table class="app-table min-w-[56rem]" data-testid="foodcost-table">
            <caption class="sr-only">What each dish costs against its price</caption>
            <thead><tr><th>Dish</th><th>Group</th><th class="text-right">Price</th><th class="text-right">Cost (average)</th><th class="text-right">Cost (last bought)</th><th class="text-right">Food cost</th><th class="text-right" title="Leave it empty and the dish follows the food cost you want, above">Its own target</th><th class="text-right">Price for target</th><th><span class="sr-only">Actions</span></th></tr></thead>
            <tbody>
              @for (r of rows(); track r.d.productId) {
                @let d = r.d;
                <tr [attr.data-testid]="'dish-' + d.name" [attr.data-changed]="r.changed ? 'true' : null">
                  <td class="font-semibold" [class]="r.changed ? 'border-l-4 border-l-primary' : ''">{{ d.name }}@if (r.changed) { <zp-status-badge tone="primary" class="ml-2 align-middle" [attr.data-testid]="'dish-changed-' + d.name">Changed</zp-status-badge> }<span class="block text-xs font-normal text-ink/60">{{ d.basis }}</span></td>
                  <td>{{ d.groupName }}</td>
                  <td class="text-right">
                    @if (canEdit()) {
                      <input type="number" min="0.01" step="any" inputmode="decimal" class="fc-box app-input ml-auto w-24 px-2 py-1 text-right" [attr.aria-label]="'Price of ' + d.name" [attr.data-testid]="'dish-price-' + d.name"
                             [value]="money(d.price)" [attr.value]="money(d.price)" [attr.aria-invalid]="r.priceError ? 'true' : null" [attr.aria-describedby]="r.priceError ? 'dish-price-err-' + d.productId : null" (input)="setPrice(d, $any($event.target).value)" />
                      @if (r.priceError) { <p class="app-error text-left" role="alert" [id]="'dish-price-err-' + d.productId" [attr.data-testid]="'dish-price-error-' + d.name">{{ r.priceError }}</p> }
                    } @else { {{ d.price | number: '1.2-2' }} }
                  </td>
                  <td class="text-right">{{ d.costAverage === null ? 'No cost yet' : (d.costAverage | number: '1.2-2') }}</td>
                  <td class="text-right" [class.text-danger]="costRose(d)" [attr.title]="costRose(d) ? 'What it cost on the latest delivery is more than the average: a price rise' : ''">{{ d.costLast === null ? '' : (d.costLast | number: '1.2-2') }}</td>
                  <td class="text-right font-semibold" [class.text-danger]="r.over" [attr.data-testid]="'dish-percent-' + d.name">{{ r.percent === null ? '' : (r.percent | number: '1.0-1') + '%' }}</td>
                  <td class="text-right">
                    @if (canEdit()) {
                      <div class="flex items-center justify-end gap-1">
                        <input #own type="number" min="1" max="99" step="any" inputmode="decimal" class="fc-box app-input w-16 px-2 py-1 text-right" [attr.aria-label]="'Food cost target of its own for ' + d.name" [attr.data-testid]="'dish-target-' + d.name"
                               [placeholder]="'' + loadedTarget()" [value]="d.targetPercent === null ? '' : '' + d.targetPercent" [attr.value]="d.targetPercent === null ? '' : '' + d.targetPercent" [attr.aria-invalid]="r.targetError ? 'true' : null" [attr.aria-describedby]="r.targetError ? 'dish-target-err-' + d.productId : null" (input)="setTarget(d, own.value)" />
                        @if (r.targetFilled) { <button type="button" class="btn-ghost px-2 py-1 text-sm" [attr.aria-label]="'Let ' + d.name + ' follow the food cost you want again'" [attr.data-testid]="'dish-target-clear-' + d.name" (click)="own.value = ''; setTarget(d, '')">x</button> }
                      </div>
                      @if (r.targetError) { <p class="app-error text-left" role="alert" [id]="'dish-target-err-' + d.productId" [attr.data-testid]="'dish-target-error-' + d.name">{{ r.targetError }}</p> }
                    } @else { {{ d.targetPercent === null ? '' : d.targetPercent + '%' }} }
                  </td>
                  <td class="text-right" [attr.data-testid]="'dish-suggested-' + d.name">{{ r.suggested === null ? '' : (r.suggested | number: '1.2-2') }}@if (r.suggested !== null && r.ownTarget) { <span class="block text-xs font-normal text-ink/60">at {{ r.target }}%</span> }</td>
                  <td class="whitespace-nowrap text-right">
                    @if (canEdit() && r.changed) { <button type="button" class="btn-primary px-3 py-1 text-sm" [attr.aria-label]="'Save ' + d.name" [attr.data-testid]="'dish-save-' + d.name" [disabled]="busy() || !r.change" (click)="saveRow(r)">Save</button> }
                    @else if (data()?.canSetPrices && d.suggestedPrice !== null && d.suggestedPrice !== d.price) { <button type="button" class="btn-outline text-sm" [attr.data-testid]="'dish-apply-' + d.name" [disabled]="busy() || readOnly()" (click)="apply(d)">Use this price</button> }
                  </td>
                </tr>
              } @empty { <tr><td colspan="9" class="py-8 text-center text-ink/70" data-testid="foodcost-empty">{{ loading() ? 'Loading...' : 'No dish has a recipe or a stocked item yet, so there is no cost to work from.' }}</td></tr> }
            </tbody>
          </table>
        </div>
      </section>
      <p class="text-xs text-ink/70">A dish with no cost shows "No cost yet": some ingredient has not been bought or costed. Options and add-ons are not in the cost. A price you save is set for the whole company; price lists and branch prices are on the Prices screen. A target of its own replaces the food cost you want for that dish only.</p>
    </div>
  `
})
export class FoodCostComponent implements OnInit {
  private readonly api = inject(KitchenApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly data = signal<FoodCostDto | null>(null);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly target = signal(30);
  /** What has been typed, by dish. */
  protected readonly edits = signal<Readonly<Record<string, DishEdit>>>({});
  /** Dishes the server could not save, in its words; their typed values stay in the table. */
  protected readonly failed = signal<readonly FoodCostFailure[]>([]);

  protected readonly readOnly = computed(() => this.auth.accessModeFor(FEATURES.INVENTORY) === 'readonly');
  protected readonly canEdit = computed(() => this.data()?.canSetPrices === true && !this.readOnly());
  /** The target the figures on screen were worked out for (the box may have been changed since, until Work it out is pressed). */
  protected readonly loadedTarget = computed(() => this.data()?.targetPercent ?? this.target());
  protected readonly money = money;

  /** Every dish with what is on screen for it. A dish nobody has typed in shows the server's figures untouched. */
  protected readonly rows = computed<readonly DishRow[]>(() => {
    const screenTarget = this.loadedTarget();
    const edits = this.edits();
    return (this.data()?.dishes ?? []).map((d) => this.rowFor(d, edits[d.productId], screenTarget));
  });
  protected readonly changedRows = computed(() => this.rows().filter((r) => r.changed));
  protected readonly changeCount = computed(() => this.changedRows().length);
  protected readonly errorCount = computed(() => this.rows().filter((r) => r.priceError || r.targetError).length);

  ngOnInit(): void { void this.load(); }

  protected costRose(d: FoodCostDishDto): boolean { return d.costLast !== null && d.costAverage !== null && d.costLast > d.costAverage * 1.0001; }

  /** Works out one row from what was typed. The page only follows the typing; the server checks and prices everything again when it is saved. */
  private rowFor(d: FoodCostDishDto, edit: DishEdit | undefined, screenTarget: number): DishRow {
    let price = d.price;
    let priceError: string | null = null;
    let priceChanged = false;
    if (edit?.price !== undefined) {
      const n = text(edit.price);
      if (!Number.isFinite(n) || n < MIN_PRICE) { priceError = 'The price must be above zero.'; price = Number.NaN; }
      else { price = n; priceChanged = Math.abs(n - d.price) > 0.00001; }
    }

    let own = d.targetPercent;
    let targetError: string | null = null;
    let targetChanged = false;
    let clear = false;
    let targetFilled = d.targetPercent !== null;
    if (edit?.target !== undefined) {
      targetFilled = edit.target.trim() !== '';
      if (!targetFilled) { own = null; clear = d.targetPercent !== null; targetChanged = clear; }
      else {
        const n = text(edit.target);
        if (!Number.isFinite(n) || n < 1 || n > 99) { targetError = 'The target must be from 1 to 99.'; own = d.targetPercent; }
        else { own = n; targetChanged = d.targetPercent === null || Math.abs(n - d.targetPercent) > 0.00001; }
      }
    }

    const hasError = priceError !== null || targetError !== null;
    const changed = priceChanged || targetChanged || hasError;
    const target = own ?? (targetError || !targetChanged ? d.effectiveTargetPercent : screenTarget);
    const worked = priceChanged || targetChanged;
    let percent = d.foodCostPercent;
    let suggested = d.suggestedPrice;
    if (priceError) percent = null;
    else if (priceChanged && d.costAverage !== null && price > 0) percent = d.costAverage / (price / d.taxFactor) * 100;
    if (worked && !targetError) suggested = d.costAverage !== null && d.costAverage > 0 ? round2(d.costAverage / (target / 100) * d.taxFactor) : null;

    let change: FoodCostChange | null = null;
    let summary: string | null = null;
    if (!hasError && (priceChanged || targetChanged)) {
      change = { productId: d.productId };
      const parts: string[] = [];
      if (priceChanged) { change.price = round2(price); parts.push(`price ${money(d.price)} to ${money(round2(price))}`); }
      if (clear) { change.clearTarget = true; parts.push(`its own target of ${d.targetPercent}% removed (it follows the ${screenTarget}% you want)`); }
      else if (targetChanged && own !== null) {
        change.targetPercent = own;
        parts.push(`its own target ${d.targetPercent === null ? `from the ${screenTarget}% you want` : `from ${d.targetPercent}%`} to ${own}%`);
      }
      summary = parts.join(', ');
    }

    const over = percent !== null && percent > target;
    return { d, changed, priceError, targetError, percent, suggested, target, ownTarget: own !== null && !targetError, targetFilled, over, change, summary };
  }

  protected setPrice(d: FoodCostDishDto, value: string): void { this.edits.update((e) => ({ ...e, [d.productId]: { ...e[d.productId], price: value } })); }
  protected setTarget(d: FoodCostDishDto, value: string): void { this.edits.update((e) => ({ ...e, [d.productId]: { ...e[d.productId], target: value } })); }

  protected discard(): void {
    this.edits.set({});
    this.failed.set([]);
    this.error.set(null);
    // The boxes hold what was typed (they are not bound back to it, so a half-typed number is never rewritten): put each back to the saved figure it was drawn with.
    this.host.nativeElement.querySelectorAll<HTMLInputElement>('input.fc-box').forEach((box) => { box.value = box.defaultValue; });
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try { this.data.set(await firstValueFrom(this.api.foodCost(this.target()))); }
    catch (err) { this.error.set(toApiError(err).message); } finally { this.loading.set(false); }
  }

  protected saveAll(): Promise<void> { return this.save(this.changedRows()); }
  protected saveRow(r: DishRow): Promise<void> { return this.save([r]); }

  /** Asks first, naming what will change, then sends the changes together. The server saves what it can and names what it cannot. */
  private async save(rows: readonly DishRow[]): Promise<void> {
    const ready = rows.filter((r) => r.change !== null);
    if (ready.length === 0 || this.busy()) return;
    const shown = ready.slice(0, 15).map((r) => `${r.d.name}: ${r.summary}`);
    if (ready.length > shown.length) shown.push(`and ${ready.length - shown.length} more`);
    const ok = await this.confirm.ask({
      title: ready.length === 1 ? `Save ${ready[0]!.d.name}?` : `Save changes to ${ready.length} dishes?`,
      message: `${shown.join('\n')}\n\nA price is set for the whole company at once, and every change is recorded with who made it.`,
      confirmLabel: ready.length === 1 ? 'Save' : 'Save changes'
    });
    if (!ok) return;
    this.busy.set(true);
    this.error.set(null);
    this.failed.set([]);
    try {
      const result = await firstValueFrom(this.api.saveFoodCost(ready.map((r) => r.change!), this.loadedTarget()));
      const done = new Set(result.saved);
      this.edits.update((e) => Object.fromEntries(Object.entries(e).filter(([id]) => !done.has(id))));
      this.data.set(result.cost);
      this.failed.set(result.failed);
      if (result.saved.length > 0) {
        const names = ready.filter((r) => done.has(r.d.productId)).map((r) => r.d.name);
        this.toast.success(names.length === 1 ? `${names[0]} saved.` : names.length <= 3 ? `Saved: ${names.join(', ')}.` : `Saved ${names.length} dishes.`);
      }
    } catch (err) { this.error.set(toApiError(err).message); } finally { this.busy.set(false); }
  }

  protected async apply(d: FoodCostDishDto): Promise<void> {
    if (d.suggestedPrice === null) return;
    if (!(await this.confirm.ask({ title: `Set ${d.name} to ${d.suggestedPrice.toFixed(2)}?`, message: `It is ${d.price.toFixed(2)} now. This sets the company price at once; the change is recorded with who made it.`, confirmLabel: 'Use this price' }))) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.applyPrice(d.productId, d.suggestedPrice, this.loadedTarget()));
      this.toast.success(`${d.name} is now ${d.suggestedPrice.toFixed(2)}.`);
      await this.load();
    } catch (err) { this.error.set(toApiError(err).message); } finally { this.busy.set(false); }
  }
}
