import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { InventoryItemDto, ProductDto, RecipeDto, SaveProductRequest } from '../../core/models/ops.model';
import { FEATURES, SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { CatalogApi, InventoryApi } from '../../core/services/ops.services';

interface IngredientRow { inventoryItemId: string; quantity: number; substituteItemId: string | null; substituteRatio: number | null }
type OptionRow = SaveProductRequest['modifiers'][number];

/**
 * The stock card's "Recipe and options" tab (it replaced the Catalogue screen on 2026-11-14).
 *
 * Recipe: what one sale of this item uses. With a recipe, selling the item takes the ingredients from stock and the item itself holds
 * none (a cocktail, a plate of food). Saving makes a new version; past sales keep what they used then.
 * Options: add-ons the till offers when the item is picked (a double shot), each with its extra price and the stock it uses.
 *
 * Both belong to the item's product, so the item must have a retail price and be saved first. They need the product-management right;
 * recipes also need the plan to include recipe depletion. The server checks both again.
 */
@Component({
    selector: 'zp-item-recipe',
    imports: [DecimalPipe, FormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="space-y-4" data-testid="recipe-tab">
      @if (!productId()) {
        <p class="text-sm text-ink/80" data-testid="recipe-needs-price">Only an item that is sold can have a recipe or options. Give it a Retail price on the Details tab, set its type to "Stock item (sold as is)", and save.</p>
      } @else if (!canManage()) {
        <p class="text-sm text-ink/80">Recipes and options are set by people with the product-management permission.</p>
      } @else {
        @if (error()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="recipe-error">{{ error() }}</p> }

        <fieldset class="rounded-lg border border-ink/15 p-3" data-testid="recipe-editor"><legend class="px-1 text-sm font-semibold">Recipe (what one sale uses)</legend>
          @if (!recipesEnabled()) {
            <p class="sys-alert sys-alert-info text-sm" role="status">Recipes with automatic ingredient depletion are not part of your current plan.</p>
          } @else {
            <p class="mb-2 text-xs text-ink/70">With a recipe, each sale takes these ingredients from stock and this item itself holds no stock. Saving creates a new version; past sales keep what they used then.
              @if (current(); as c) { <span data-testid="recipe-current">Current: version {{ c.version }}, cost per sale {{ c.costPerUnit | number: '1.2-2' }}.</span> } @else { No recipe yet: the item is sold as it is. }</p>
            @for (r of rows(); track $index) {
              <div class="mb-2 grid grid-cols-[1fr_6rem_1fr_5rem_auto] items-end gap-2">
                <select class="app-input" aria-label="Ingredient" [attr.data-testid]="'ing-item-' + $index" [ngModel]="r.inventoryItemId" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchIng($index, { inventoryItemId: $event })"><option value="">Ingredient...</option>@for (i of items(); track i.id) { <option [value]="i.id">{{ i.name }}</option> }</select>
                <input type="number" min="0" step="any" class="app-input" aria-label="Quantity per sale" [attr.data-testid]="'ing-qty-' + $index" [ngModel]="r.quantity" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchIng($index, { quantity: +$event })" />
                <select class="app-input" aria-label="Allowed substitute" [ngModel]="r.substituteItemId" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchIng($index, { substituteItemId: $event || null, substituteRatio: $event ? 1 : null })"><option [ngValue]="null">No substitute</option>@for (i of items(); track i.id) { <option [ngValue]="i.id">{{ i.name }}</option> }</select>
                <input type="number" min="0" step="any" class="app-input" aria-label="Substitute ratio" [disabled]="!r.substituteItemId" [ngModel]="r.substituteRatio" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchIng($index, { substituteRatio: $event ? +$event : null })" />
                <button type="button" class="btn-ghost px-2" aria-label="Remove ingredient" (click)="removeIng($index)">x</button>
              </div>
            }
            <p class="mb-2 text-xs text-ink/70">Ingredient, quantity per sale (in the ingredient's own unit), an allowed substitute and how much of it replaces one unit.</p>
            <div class="flex gap-2"><button type="button" class="btn-outline text-sm" data-testid="add-ingredient" [disabled]="!loaded()" (click)="addIng()">Add ingredient</button>
              <button type="button" class="btn-primary text-sm" data-testid="save-recipe" [disabled]="busy() || !loaded() || validIngredients().length === 0" (click)="saveRecipe()">Save recipe</button></div>
            @if (recipeMsg()) { <p class="mt-2 text-sm" role="status" data-testid="recipe-msg">{{ recipeMsg() }}</p> }
          }
        </fieldset>

        <fieldset class="rounded-lg border border-ink/15 p-3" data-testid="options-editor"><legend class="px-1 text-sm font-semibold">Options and add-ons</legend>
          <p class="mb-2 text-xs text-ink/70">Offered at the till when this item is picked. Each has a name, an extra price, and the stock item and quantity it uses (if any).</p>
          @for (m of options(); track $index) {
            <div class="mb-2 grid grid-cols-[1fr_6rem_1fr_6rem_auto] items-end gap-2">
              <input class="app-input" aria-label="Option name" placeholder="e.g. Double shot" [attr.data-testid]="'mod-name-' + $index" [ngModel]="m.name" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchOpt($index, { name: $event })" />
              <input type="number" step="0.01" class="app-input" aria-label="Extra price" [attr.data-testid]="'mod-price-' + $index" [ngModel]="m.priceDelta" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchOpt($index, { priceDelta: +$event })" />
              <select class="app-input" aria-label="Uses stock item" [ngModel]="m.inventoryItemId" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchOpt($index, { inventoryItemId: $event || null })"><option [ngValue]="null">No stock</option>@for (i of items(); track i.id) { <option [ngValue]="i.id">{{ i.name }}</option> }</select>
              <input type="number" min="0" step="any" class="app-input" aria-label="Stock used" [ngModel]="m.quantity" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchOpt($index, { quantity: +$event })" />
              <button type="button" class="btn-ghost px-2" aria-label="Remove option" (click)="removeOpt($index)">x</button>
            </div>
          } @empty { <p class="mb-2 text-sm text-ink/70">No options.</p> }
          <div class="flex gap-2"><button type="button" class="btn-outline text-sm" data-testid="add-modifier" [disabled]="!loaded()" (click)="addOpt()">Add option</button>
            <button type="button" class="btn-primary text-sm" data-testid="save-options" [disabled]="busy() || !loaded() || !product() || !optionsValid()" (click)="saveOptions()">Save options</button></div>
          @if (optionsMsg()) { <p class="mt-2 text-sm" role="status" data-testid="options-msg">{{ optionsMsg() }}</p> }
        </fieldset>
      }
    </div>
  `
})
export class ItemRecipeComponent {
  private readonly catalog = inject(CatalogApi);
  private readonly inventory = inject(InventoryApi);
  private readonly auth = inject(AuthService);

  /** The product the item is sold as; null while the item has no price (it is not sold yet). */
  readonly productId = input<string | null>(null);

  protected readonly canManage = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.PRODUCTS_MANAGE));
  protected readonly recipesEnabled = computed(() => this.auth.accessModeFor(FEATURES.RECIPE_DEPLETION) === 'full');

  protected readonly product = signal<ProductDto | null>(null);
  protected readonly items = signal<readonly InventoryItemDto[]>([]);
  protected readonly current = signal<RecipeDto | null>(null);
  protected readonly rows = signal<readonly IngredientRow[]>([]);
  protected readonly options = signal<readonly OptionRow[]>([]);
  protected readonly busy = signal(false);
  /** Nothing can be added until what is already saved has been read, or the read would wipe it. */
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly recipeMsg = signal<string | null>(null);
  protected readonly optionsMsg = signal<string | null>(null);

  protected readonly validIngredients = computed(() => this.rows().filter((r) => r.inventoryItemId && r.quantity > 0));
  protected readonly optionsValid = computed(() => this.options().every((m) => m.name.trim().length > 0));

  constructor() {
    effect(() => {
      const id = this.productId();
      untracked(() => void this.load(id));
    }, { allowSignalWrites: true });
  }

  private async load(productId: string | null): Promise<void> {
    this.product.set(null);
    this.current.set(null);
    this.rows.set([]);
    this.options.set([]);
    this.error.set(null);
    this.recipeMsg.set(null);
    this.optionsMsg.set(null);
    this.loaded.set(false);
    if (!productId || !this.canManage()) return;
    try {
      const [product, items] = await Promise.all([firstValueFrom(this.catalog.product(productId)), firstValueFrom(this.inventory.items({ pageSize: 500 }))]);
      if (this.productId() !== productId) return;
      this.product.set(product);
      this.items.set(items.items.filter((i) => i.id !== product.inventoryItemId));
      this.options.set(product.modifiers.map((m) => ({ id: m.id, name: m.name, priceDelta: m.priceDelta, inventoryItemId: m.inventoryItemId, quantity: m.quantity, isActive: m.isActive })));
      if (this.recipesEnabled()) {
        const cur = (await firstValueFrom(this.catalog.recipes(productId))).find((v) => v.isCurrent) ?? null;
        if (this.productId() !== productId) return;
        this.current.set(cur);
        this.rows.set(cur?.ingredients.map((i) => ({ inventoryItemId: i.inventoryItemId, quantity: i.quantity, substituteItemId: i.substituteItemId, substituteRatio: i.substituteRatio })) ?? []);
      }
      this.loaded.set(true);
    } catch (err) { this.error.set(toApiError(err).message); }
  }

  // ---- recipe ----
  protected addIng(): void { this.rows.update((r) => [...r, { inventoryItemId: '', quantity: 0, substituteItemId: null, substituteRatio: null }]); }
  protected removeIng(i: number): void { this.rows.update((r) => r.filter((_, x) => x !== i)); }
  protected patchIng(i: number, p: Partial<IngredientRow>): void { this.rows.update((r) => r.map((x, n) => (n === i ? { ...x, ...p } : x))); }

  protected async saveRecipe(): Promise<void> {
    const id = this.productId();
    if (!id) return;
    this.busy.set(true);
    this.recipeMsg.set(null);
    try {
      const saved = await firstValueFrom(this.catalog.saveRecipe(id, { notes: null, ingredients: this.validIngredients().map((r) => ({ ...r })) }));
      this.current.set(saved);
      this.recipeMsg.set(`Saved as version ${saved.version}.`);
    } catch (err) { this.recipeMsg.set(toApiError(err).message); } finally { this.busy.set(false); }
  }

  // ---- options ----
  protected addOpt(): void { this.options.update((l) => [...l, { id: null, name: '', priceDelta: 0, inventoryItemId: null, quantity: 0, isActive: true }]); }
  protected removeOpt(i: number): void { this.options.update((l) => l.filter((_, x) => x !== i)); }
  protected patchOpt(i: number, p: Partial<OptionRow>): void { this.options.update((l) => l.map((m, x) => (x === i ? { ...m, ...p } : m))); }

  /** The options are saved with the product they belong to; everything else about the product goes back exactly as it was read. */
  protected async saveOptions(): Promise<void> {
    const p = this.product();
    if (!p) return;
    this.busy.set(true);
    this.optionsMsg.set(null);
    try {
      const saved = await firstValueFrom(this.catalog.saveProduct(p.id, {
        categoryId: p.categoryId, name: p.name, sku: p.sku, barcode: p.barcode, description: p.description, price: p.regularPrice ?? p.price, isActive: p.isActive, isFavorite: p.isFavorite,
        inventoryItemId: p.inventoryItemId, stockPerSale: p.stockPerSale, rowVersion: p.rowVersion, modifiers: this.options().map((m) => ({ ...m, name: m.name.trim() }))
      }));
      this.product.set(saved);
      this.options.set(saved.modifiers.map((m) => ({ id: m.id, name: m.name, priceDelta: m.priceDelta, inventoryItemId: m.inventoryItemId, quantity: m.quantity, isActive: m.isActive })));
      this.optionsMsg.set('Options saved.');
    } catch (err) { this.optionsMsg.set(toApiError(err).message); } finally { this.busy.set(false); }
  }
}
