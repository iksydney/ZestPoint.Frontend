import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { FoodCostDishDto, FoodCostDto } from '../../core/models/kitchen.model';
import { FEATURES } from '../../core/models/rbac.model';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { KitchenApi } from '../../core/services/kitchen.services';
import { ConfirmService, ToastService } from '../../shared/ui/feedback';

/**
 * Food cost (owner's decisions, 2026-11-21): what each dish costs against what it sells for. The cost of one portion comes from each ingredient's average cost (allowing for what is lost
 * in trimming) and, beside it, from the latest purchase cost, so a price rise is seen before the average catches up. The food cost % is worked out against the price with the tax in it
 * taken out. The business chooses the food cost it wants; each dish shows the price that would reach it, and one button applies it through the price service (so the right to manage
 * prices, the audit trail and any scheduled changes, price lists and branch prices all apply). Only people who may see costs reach this screen.
 */
@Component({
    selector: 'zp-food-cost',
    imports: [DecimalPipe, FormsModule],
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
        <button type="button" class="btn-outline" data-testid="foodcost-refresh" [disabled]="loading() || target() < 1 || target() > 99" (click)="load()">Work it out</button>
        @if (data(); as d) { <p class="text-sm text-ink/70">Prices {{ d.taxInclusive ? 'include' : 'do not include' }} tax; the food cost % is against the price without it. Amounts in {{ d.currencyCode }}.</p> }
      </section>

      <section class="app-card overflow-hidden p-0" aria-label="Dishes">
        <div class="overflow-x-auto">
          <table class="app-table min-w-[56rem]" data-testid="foodcost-table">
            <caption class="sr-only">What each dish costs against its price</caption>
            <thead><tr><th>Dish</th><th>Group</th><th class="text-right">Price</th><th class="text-right">Cost (average)</th><th class="text-right">Cost (last bought)</th><th class="text-right">Food cost</th><th class="text-right">Price for {{ target() }}%</th><th></th></tr></thead>
            <tbody>
              @for (d of dishes(); track d.productId) {
                <tr [attr.data-testid]="'dish-' + d.name">
                  <td class="font-semibold">{{ d.name }}<span class="block text-xs font-normal text-ink/60">{{ d.basis }}</span></td>
                  <td>{{ d.groupName }}</td>
                  <td class="text-right">{{ d.price | number: '1.2-2' }}</td>
                  <td class="text-right">{{ d.costAverage === null ? 'No cost yet' : (d.costAverage | number: '1.2-2') }}</td>
                  <td class="text-right" [class.text-danger]="costRose(d)" [attr.title]="costRose(d) ? 'What it cost on the latest delivery is more than the average: a price rise' : ''">{{ d.costLast === null ? '' : (d.costLast | number: '1.2-2') }}</td>
                  <td class="text-right font-semibold" [class.text-danger]="over(d)" [attr.data-testid]="'dish-percent-' + d.name">{{ d.foodCostPercent === null ? '' : (d.foodCostPercent | number: '1.0-1') + '%' }}</td>
                  <td class="text-right" [attr.data-testid]="'dish-suggested-' + d.name">{{ d.suggestedPrice === null ? '' : (d.suggestedPrice | number: '1.2-2') }}</td>
                  <td class="text-right">@if (data()?.canSetPrices && d.suggestedPrice !== null && d.suggestedPrice !== d.price) { <button type="button" class="btn-outline text-sm" [attr.data-testid]="'dish-apply-' + d.name" [disabled]="busy() || readOnly()" (click)="apply(d)">Use this price</button> }</td>
                </tr>
              } @empty { <tr><td colspan="8" class="py-8 text-center text-ink/70" data-testid="foodcost-empty">{{ loading() ? 'Loading...' : 'No dish has a recipe or a stocked item yet, so there is no cost to work from.' }}</td></tr> }
            </tbody>
          </table>
        </div>
      </section>
      <p class="text-xs text-ink/70">A dish with no cost shows "No cost yet": some ingredient has not been bought or costed. Options and add-ons are not in the cost. A price you apply is set for the whole company; price lists and branch prices are on the Prices screen.</p>
    </div>
  `
})
export class FoodCostComponent implements OnInit {
  private readonly api = inject(KitchenApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly data = signal<FoodCostDto | null>(null);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly target = signal(30);

  protected readonly readOnly = computed(() => this.auth.accessModeFor(FEATURES.INVENTORY) === 'readonly');
  protected readonly dishes = computed(() => this.data()?.dishes ?? []);

  ngOnInit(): void { void this.load(); }

  protected over(d: FoodCostDishDto): boolean { return d.foodCostPercent !== null && d.foodCostPercent > this.target(); }
  protected costRose(d: FoodCostDishDto): boolean { return d.costLast !== null && d.costAverage !== null && d.costLast > d.costAverage * 1.0001; }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try { this.data.set(await firstValueFrom(this.api.foodCost(this.target()))); }
    catch (err) { this.error.set(toApiError(err).message); } finally { this.loading.set(false); }
  }

  protected async apply(d: FoodCostDishDto): Promise<void> {
    if (d.suggestedPrice === null) return;
    if (!(await this.confirm.ask({ title: `Set ${d.name} to ${d.suggestedPrice.toFixed(2)}?`, message: `It is ${d.price.toFixed(2)} now. This sets the company price at once; the change is recorded with who made it.`, confirmLabel: 'Use this price' }))) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.applyPrice(d.productId, d.suggestedPrice, this.target()));
      this.toast.success(`${d.name} is now ${d.suggestedPrice.toFixed(2)}.`);
      await this.load();
    } catch (err) { this.error.set(toApiError(err).message); } finally { this.busy.set(false); }
  }
}
