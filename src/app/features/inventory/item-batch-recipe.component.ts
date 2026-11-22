import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { BatchRecipeDto } from '../../core/models/kitchen.model';
import { InventoryItemDto } from '../../core/models/ops.model';
import { SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { KitchenApi } from '../../core/services/kitchen.services';
import { InventoryApi } from '../../core/services/ops.services';
import { SearchSelectComponent, SelectOption } from '../../shared/ui/search-select.component';

interface BatchRow { inventoryItemId: string; quantity: number; usablePercent: number }

/**
 * "Made in batches" on the stock card's Recipe and options tab (owner's decision, 2026-11-21): a cake is baked once and sold by the slice, a pot of stew by the plate.
 * Say how many portions one batch gives (Details tab) and what one batch takes here. The cook then records each batch on the Production screen: the ingredients leave stock
 * (allowing for what is lost in trimming), the portions are added, and the cost of a portion is worked out. Needs the right to manage items; the server checks it again.
 */
@Component({
    selector: 'zp-item-batch-recipe',
    imports: [DecimalPipe, FormsModule, SearchSelectComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <fieldset class="mb-4 rounded-lg border border-ink/15 p-3" data-testid="batch-editor"><legend class="px-1 text-sm font-semibold">Made in batches (what one batch takes)</legend>
      @if (!itemId()) {
        <p class="text-sm text-ink/80">Save the item first.</p>
      } @else if (!portions()) {
        <p class="text-sm text-ink/80" data-testid="batch-needs-portions">Something baked or cooked once and sold in portions is made in batches. Put how many portions one batch gives in "Portions per batch" on the Details tab and save; then say here what one batch takes.</p>
      } @else if (!canManage()) {
        <p class="text-sm text-ink/80">The batch recipe is set by people with the right to manage items.</p>
      } @else {
        @if (error()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="batch-error">{{ error() }}</p> }
        <p class="mb-2 text-xs text-ink/70">One batch gives {{ portions() }} portion{{ portions() === 1 ? '' : 's' }}. The cook records each batch on the Production screen: these ingredients leave stock and the portions are added, so selling a portion takes it from them.</p>
        @for (r of rows(); track $index) {
          <div class="mb-2 grid grid-cols-[1fr_7rem_5rem_auto] items-end gap-2">
            <zp-search-select ariaLabel="Ingredient" [testId]="'batch-item-' + $index" emptyLabel="Choose an ingredient" noun="ingredient" placeholder="Search ingredients" [options]="itemOptions()" [value]="r.inventoryItemId" (valueChange)="patch($index, { inventoryItemId: $event })" />
            <input type="number" min="0" step="any" class="app-input" aria-label="Quantity per batch" [attr.data-testid]="'batch-qty-' + $index" [ngModel]="r.quantity" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch($index, { quantity: +$event })" />
            <input type="number" min="1" max="100" step="any" class="app-input" aria-label="Usable percent" title="How much of what you buy is usable once trimmed" [attr.data-testid]="'batch-usable-' + $index" [ngModel]="r.usablePercent" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch($index, { usablePercent: +$event || 100 })" />
            <button type="button" class="btn-ghost px-2" aria-label="Remove ingredient" (click)="remove($index)">x</button>
          </div>
        }
        <p class="mb-2 text-xs text-ink/70">Ingredient, the usable quantity one batch needs (in the ingredient's own unit), and how much of it is usable once trimmed (100 when all of it is).</p>
        @if (recipe(); as c) {
          @if (c.costPerBatch !== null) { <p class="mb-2 text-sm" data-testid="batch-cost">One batch costs {{ c.costPerBatch | number: '1.2-2' }}@if (c.costPerPortion !== null) { , so one portion {{ c.costPerPortion | number: '1.2-2' }} }. </p> }
        }
        <div class="flex gap-2"><button type="button" class="btn-outline text-sm" data-testid="batch-add" [disabled]="!loaded()" (click)="add()">Add ingredient</button>
          <button type="button" class="btn-primary text-sm" data-testid="batch-save" [disabled]="busy() || !loaded() || valid().length === 0" (click)="save()">Save batch recipe</button></div>
        @if (message()) { <p class="mt-2 text-sm" role="status" data-testid="batch-msg">{{ message() }}</p> }
      }
    </fieldset>
  `
})
export class ItemBatchRecipeComponent {
  private readonly kitchen = inject(KitchenApi);
  private readonly inventory = inject(InventoryApi);
  private readonly auth = inject(AuthService);

  readonly itemId = input<string | null>(null);
  readonly portions = input<number | null>(null);

  protected readonly items = signal<readonly InventoryItemDto[]>([]);
  protected readonly itemOptions = computed<readonly SelectOption[]>(() => this.items().map((i) => ({ value: i.id, label: `${i.name} (${this.unit(i)})` })));
  protected readonly rows = signal<BatchRow[]>([]);
  protected readonly recipe = signal<BatchRecipeDto | null>(null);
  protected readonly loaded = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);

  protected readonly canManage = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.INVENTORY_ITEMS_MANAGE));
  protected readonly valid = computed(() => this.rows().filter((r) => r.inventoryItemId && r.quantity > 0));

  constructor() {
    effect(() => {
      const id = this.itemId();
      this.portions();
      untracked(() => void this.load(id));
    }, { allowSignalWrites: true });
  }

  protected unit(i: InventoryItemDto): string { return i.baseUnit === 'Milliliter' ? 'ml' : i.baseUnit === 'Gram' ? 'g' : 'each'; }

  private async load(id: string | null): Promise<void> {
    this.rows.set([]);
    this.recipe.set(null);
    this.error.set(null);
    this.message.set(null);
    this.loaded.set(false);
    if (!id || !this.canManage() || !this.portions()) return;
    try {
      const [recipe, items] = await Promise.all([firstValueFrom(this.kitchen.batchRecipe(id)), firstValueFrom(this.inventory.items({ pageSize: 500 }))]);
      if (this.itemId() !== id) return;
      this.items.set(items.items.filter((i) => i.id !== id));
      this.recipe.set(recipe);
      this.rows.set(recipe.ingredients.map((i) => ({ inventoryItemId: i.inventoryItemId, quantity: i.quantity, usablePercent: i.usablePercent })));
      this.loaded.set(true);
    } catch (err) { this.error.set(toApiError(err).message); }
  }

  protected add(): void { this.rows.update((r) => [...r, { inventoryItemId: '', quantity: 0, usablePercent: 100 }]); }
  protected remove(i: number): void { this.rows.update((r) => r.filter((_, x) => x !== i)); }
  protected patch(i: number, p: Partial<BatchRow>): void { this.rows.update((r) => r.map((x, n) => (n === i ? { ...x, ...p } : x))); }

  protected async save(): Promise<void> {
    const id = this.itemId();
    const portions = this.portions();
    if (!id || !portions) return;
    this.busy.set(true);
    this.message.set(null);
    try {
      const saved = await firstValueFrom(this.kitchen.saveBatchRecipe(id, { portionsPerBatch: portions, ingredients: this.valid().map((r) => ({ inventoryItemId: r.inventoryItemId, quantity: r.quantity, usablePercent: r.usablePercent })) }));
      this.recipe.set(saved);
      this.message.set('Batch recipe saved.');
    } catch (err) {
      const e = toApiError(err);
      this.message.set(e.fieldErrors['ingredients']?.[0] ?? e.message);
    } finally { this.busy.set(false); }
  }
}
