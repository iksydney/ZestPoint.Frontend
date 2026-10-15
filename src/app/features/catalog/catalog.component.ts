import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { FEATURES } from '../../core/models/rbac.model';
import { CategoryDto, InventoryItemDto, ProductDto, RecipeDto, SaveProductRequest } from '../../core/models/ops.model';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { CatalogApi, InventoryApi } from '../../core/services/ops.services';
import { DialogComponent, ToastService } from '../../shared/ui/feedback';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';

interface IngredientRow { inventoryItemId: string; quantity: number; substituteItemId: string | null; substituteRatio: number | null }

const blank = (): SaveProductRequest => ({
  categoryId: null, name: '', sku: null, barcode: null, description: null, price: 0, isActive: true, isFavorite: false, inventoryItemId: null, stockPerSale: 1,
  modifiers: [], rowVersion: null
});

/** Products, categories, add-on options and versioned recipes. Everything that changes what a sale costs or depletes lives here. */
@Component({
  selector: 'zp-catalog',
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe, FormsModule, DialogComponent, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
      <div><h1 class="text-2xl font-bold">Catalogue</h1><p class="mt-1 text-sm text-ink/80">What you sell, what it costs and which stock each sale uses.</p></div>
      <div class="flex gap-2"><button type="button" class="btn-outline" data-testid="new-category" (click)="catDialog.set(true)">Add category</button>
        <button type="button" class="btn-primary" data-testid="new-product" [disabled]="readOnly()" (click)="openProduct(null)">New product</button></div>
    </div>
    @if (error()) { <p class="sys-alert sys-alert-danger mb-3" role="alert">{{ error() }}</p> }
    @if (readOnly()) { <p class="sys-alert sys-alert-warning mb-3" role="status">Read-only: your subscription limits this screen.</p> }

    <div class="app-card overflow-x-auto p-0">
      <table class="app-table"><caption class="sr-only">Products</caption>
        <thead><tr><th>Product</th><th>Category</th><th class="text-right">Price</th><th>Stock</th><th>Status</th><th></th></tr></thead>
        <tbody>
          @for (p of products(); track p.id) {
            <tr [attr.data-testid]="'prod-' + p.name">
              <td class="font-medium">{{ p.name }} @if (p.isDemo) { <zp-status-badge tone="warning">Demo</zp-status-badge> }<span class="block text-xs font-normal text-ink/60">{{ p.barcode }}</span></td>
              <td>{{ p.categoryName }}</td><td class="text-right">{{ p.price | currency: currency() : 'symbol-narrow' : '1.2-2' }}</td>
              <td class="text-sm">@if (p.hasRecipe) { Recipe } @else if (p.inventoryItemId) { Linked item } @else { <span class="text-ink/50">not tracked</span> }</td>
              <td><zp-status-badge [tone]="p.isActive ? 'success' : 'danger'">{{ p.isActive ? 'Active' : 'Archived' }}</zp-status-badge></td>
              <td class="text-right"><button type="button" class="btn-outline px-2 py-1 text-sm" [attr.data-testid]="'edit-' + p.name" [disabled]="readOnly()" (click)="openProduct(p)">Edit</button></td>
            </tr>
          } @empty { <tr><td colspan="6" class="py-8 text-center text-ink/70">{{ loading() ? 'Loading...' : 'No products yet. Add one to start selling.' }}</td></tr> }
        </tbody>
      </table>
    </div>

    <zp-dialog [open]="dialog()" [title]="editingId() ? 'Edit product' : 'New product'" [wide]="true" (closed)="dialog.set(false)">
      <form class="space-y-4" (submit)="$event.preventDefault(); save()">
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="sm:col-span-2"><label class="app-label" for="pr-name">Name</label><input id="pr-name" class="app-input" data-testid="product-name" [ngModel]="form().name" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ name: $event })" />
            @if (fe()['name']) { <p class="app-error" role="alert">{{ fe()['name'] }}</p> }</div>
          <div><label class="app-label" for="pr-price">Price</label><input id="pr-price" type="number" min="0" step="0.01" class="app-input" data-testid="product-price" [ngModel]="form().price" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ price: +$event })" /></div>
          <div><label class="app-label" for="pr-cat">Category</label>
            <select id="pr-cat" class="app-input" [ngModel]="form().categoryId" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ categoryId: $event || null })"><option [ngValue]="null">None</option>@for (c of categories(); track c.id) { <option [ngValue]="c.id">{{ c.name }}</option> }</select></div>
          <div><label class="app-label" for="pr-bar">Barcode</label><input id="pr-bar" class="app-input" data-testid="product-barcode" [ngModel]="form().barcode" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ barcode: $event || null })" />
            @if (fe()['barcode']) { <p class="app-error" role="alert">{{ fe()['barcode'] }}</p> }</div>
          <div><label class="app-label" for="pr-sku">SKU</label><input id="pr-sku" class="app-input" [ngModel]="form().sku" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ sku: $event || null })" /></div>
          <div><label class="app-label" for="pr-item">Resold stock item (for finished goods)</label>
            <select id="pr-item" class="app-input" data-testid="product-item" [ngModel]="form().inventoryItemId" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ inventoryItemId: $event || null })"><option [ngValue]="null">None</option>@for (i of items(); track i.id) { <option [ngValue]="i.id">{{ i.name }}</option> }</select></div>
          <div><label class="app-label" for="pr-sps">Stock used per sale</label><input id="pr-sps" type="number" min="0" step="any" class="app-input" [ngModel]="form().stockPerSale" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ stockPerSale: +$event })" /></div>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" [checked]="form().isFavorite" (change)="patch({ isFavorite: !form().isFavorite })" /> Favourite</label>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" [checked]="form().isActive" (change)="patch({ isActive: !form().isActive })" /> Active (can be sold)</label>
        </div>

        <fieldset class="rounded-lg border border-ink/15 p-3"><legend class="px-1 text-sm font-semibold">Options and add-ons</legend>
          @for (m of form().modifiers; track $index) {
            <div class="mb-2 grid grid-cols-[1fr_6rem_1fr_6rem_auto] items-end gap-2">
              <input class="app-input" aria-label="Option name" placeholder="e.g. Double shot" [attr.data-testid]="'mod-name-' + $index" [ngModel]="m.name" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchMod($index, { name: $event })" />
              <input type="number" step="0.01" class="app-input" aria-label="Extra price" [attr.data-testid]="'mod-price-' + $index" [ngModel]="m.priceDelta" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchMod($index, { priceDelta: +$event })" />
              <select class="app-input" aria-label="Uses stock item" [ngModel]="m.inventoryItemId" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchMod($index, { inventoryItemId: $event || null })"><option [ngValue]="null">No stock</option>@for (i of items(); track i.id) { <option [ngValue]="i.id">{{ i.name }}</option> }</select>
              <input type="number" min="0" step="any" class="app-input" aria-label="Stock used" [ngModel]="m.quantity" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchMod($index, { quantity: +$event })" />
              <button type="button" class="btn-ghost px-2" aria-label="Remove option" (click)="removeMod($index)">x</button>
            </div>
          }
          <button type="button" class="btn-outline text-sm" data-testid="add-modifier" (click)="addMod()">Add option</button>
        </fieldset>

        @if (editingId() && recipesEnabled()) {
          <fieldset class="rounded-lg border border-ink/15 p-3" data-testid="recipe-editor"><legend class="px-1 text-sm font-semibold">Recipe (what one sale uses)</legend>
            <p class="mb-2 text-xs text-ink/70">Saving creates a new version. Past sales keep what they used then.@if (currentRecipe()) { Current: version {{ currentRecipe()!.version }}, cost per sale {{ currentRecipe()!.costPerUnit | number: '1.2-2' }}. }</p>
            @for (r of recipeRows(); track $index) {
              <div class="mb-2 grid grid-cols-[1fr_6rem_1fr_5rem_auto] items-end gap-2">
                <select class="app-input" aria-label="Ingredient" [attr.data-testid]="'ing-item-' + $index" [ngModel]="r.inventoryItemId" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchIng($index, { inventoryItemId: $event })"><option value="">Ingredient...</option>@for (i of items(); track i.id) { <option [value]="i.id">{{ i.name }}</option> }</select>
                <input type="number" min="0" step="any" class="app-input" aria-label="Quantity per sale" [attr.data-testid]="'ing-qty-' + $index" [ngModel]="r.quantity" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchIng($index, { quantity: +$event })" />
                <select class="app-input" aria-label="Allowed substitute" [ngModel]="r.substituteItemId" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchIng($index, { substituteItemId: $event || null, substituteRatio: $event ? 1 : null })"><option [ngValue]="null">No substitute</option>@for (i of items(); track i.id) { <option [ngValue]="i.id">{{ i.name }}</option> }</select>
                <input type="number" min="0" step="any" class="app-input" aria-label="Substitute ratio" [disabled]="!r.substituteItemId" [ngModel]="r.substituteRatio" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchIng($index, { substituteRatio: $event ? +$event : null })" />
                <button type="button" class="btn-ghost px-2" aria-label="Remove ingredient" (click)="removeIng($index)">x</button>
              </div>
            }
            <div class="flex gap-2"><button type="button" class="btn-outline text-sm" data-testid="add-ingredient" (click)="addIng()">Add ingredient</button>
              <button type="button" class="btn-primary text-sm" data-testid="save-recipe" [disabled]="saving() || validIngredients().length === 0" (click)="saveRecipe()">Save recipe</button></div>
            @if (recipeMsg()) { <p class="mt-2 text-sm" role="status" data-testid="recipe-msg">{{ recipeMsg() }}</p> }
          </fieldset>
        } @else if (editingId() && !recipesEnabled()) {
          <p class="sys-alert sys-alert-info text-sm" role="status">Recipes with automatic ingredient depletion are not part of your current plan.</p>
        }

        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(false)">Close</button><button type="submit" class="btn-primary" data-testid="product-save" [disabled]="saving()">Save product</button></div>
      </form>
    </zp-dialog>

    <zp-dialog [open]="catDialog()" title="Add category" (closed)="catDialog.set(false)">
      <form class="space-y-3" (submit)="$event.preventDefault(); saveCategory()">
        <div><label class="app-label" for="cat-name">Name</label><input id="cat-name" class="app-input" data-testid="category-name" [ngModel]="catName()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="catName.set($event)" /></div>
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="catDialog.set(false)">Cancel</button><button type="submit" class="btn-primary" data-testid="category-save" [disabled]="!catName().trim()">Save</button></div>
      </form>
    </zp-dialog>
  `
})
export class CatalogComponent implements OnInit {
  private readonly catalog = inject(CatalogApi);
  private readonly inventory = inject(InventoryApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly products = signal<readonly ProductDto[]>([]);
  protected readonly categories = signal<readonly CategoryDto[]>([]);
  protected readonly items = signal<readonly InventoryItemDto[]>([]);
  protected readonly dialog = signal(false);
  protected readonly catDialog = signal(false);
  protected readonly catName = signal('');
  protected readonly editingId = signal<string | null>(null);
  protected readonly form = signal<SaveProductRequest>(blank());
  protected readonly recipeRows = signal<readonly IngredientRow[]>([]);
  protected readonly currentRecipe = signal<RecipeDto | null>(null);
  protected readonly recipeMsg = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly fe = signal<Readonly<Record<string, string>>>({});

  protected readonly readOnly = computed(() => this.auth.accessModeFor(FEATURES.CORE_POS) === 'readonly');
  protected readonly recipesEnabled = computed(() => this.auth.accessModeFor(FEATURES.RECIPE_DEPLETION) === 'full');
  protected readonly currency = computed(() => this.auth.tenant()?.currencyCode ?? 'USD');
  protected readonly validIngredients = computed(() => this.recipeRows().filter((r) => r.inventoryItemId && r.quantity > 0));

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [p, c] = await Promise.all([firstValueFrom(this.catalog.products({ pageSize: 500 })), firstValueFrom(this.catalog.categories())]);
      this.products.set(p.items);
      this.categories.set(c);
      // Stock items are optional here: a role without inventory access still manages the catalogue.
      try { this.items.set((await firstValueFrom(this.inventory.items({ pageSize: 200 }))).items); } catch { this.items.set([]); }
    } catch (err) { this.error.set(toApiError(err).message); } finally { this.loading.set(false); }
  }

  protected patch(p: Partial<SaveProductRequest>): void { this.form.update((f) => ({ ...f, ...p })); }
  protected addMod(): void { this.form.update((f) => ({ ...f, modifiers: [...f.modifiers, { id: null, name: '', priceDelta: 0, inventoryItemId: null, quantity: 0, isActive: true }] })); }
  protected removeMod(i: number): void { this.form.update((f) => ({ ...f, modifiers: f.modifiers.filter((_, x) => x !== i) })); }
  protected patchMod(i: number, p: Partial<SaveProductRequest['modifiers'][number]>): void { this.form.update((f) => ({ ...f, modifiers: f.modifiers.map((m, x) => (x === i ? { ...m, ...p } : m)) })); }

  protected async openProduct(p: ProductDto | null): Promise<void> {
    this.fe.set({});
    this.recipeMsg.set(null);
    this.editingId.set(p?.id ?? null);
    this.recipeRows.set([]);
    this.currentRecipe.set(null);
    this.form.set(p
      ? { categoryId: p.categoryId, name: p.name, sku: p.sku, barcode: p.barcode, description: p.description, price: p.price, isActive: p.isActive, isFavorite: p.isFavorite,
          inventoryItemId: p.inventoryItemId, stockPerSale: p.stockPerSale, rowVersion: p.rowVersion,
          modifiers: p.modifiers.map((m) => ({ id: m.id, name: m.name, priceDelta: m.priceDelta, inventoryItemId: m.inventoryItemId, quantity: m.quantity, isActive: m.isActive })) }
      : blank());
    this.dialog.set(true);
    if (p && this.recipesEnabled()) {
      try {
        const versions = await firstValueFrom(this.catalog.recipes(p.id));
        const cur = versions.find((v) => v.isCurrent) ?? null;
        this.currentRecipe.set(cur);
        this.recipeRows.set(cur?.ingredients.map((i) => ({ inventoryItemId: i.inventoryItemId, quantity: i.quantity, substituteItemId: i.substituteItemId, substituteRatio: i.substituteRatio })) ?? []);
      } catch { /* the product can still be edited without its recipe */ }
    }
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    this.fe.set({});
    try {
      const saved = await firstValueFrom(this.catalog.saveProduct(this.editingId(), this.form()));
      this.toast.success('Product saved.');
      if (!this.editingId()) { this.editingId.set(saved.id); this.form.update((f) => ({ ...f, rowVersion: saved.rowVersion })); }
      else this.dialog.set(false);
      await this.load();
    } catch (err) {
      const e = toApiError(err);
      this.fe.set(Object.fromEntries(Object.entries(e.fieldErrors).map(([k, v]) => [k, v[0] ?? ''])));
      if (Object.keys(e.fieldErrors).length === 0) this.toast.error(e.message);
    } finally { this.saving.set(false); }
  }

  // ---- recipe ----
  protected addIng(): void { this.recipeRows.update((r) => [...r, { inventoryItemId: '', quantity: 0, substituteItemId: null, substituteRatio: null }]); }
  protected removeIng(i: number): void { this.recipeRows.update((r) => r.filter((_, x) => x !== i)); }
  protected patchIng(i: number, p: Partial<IngredientRow>): void { this.recipeRows.update((r) => r.map((x, n) => (n === i ? { ...x, ...p } : x))); }

  protected async saveRecipe(): Promise<void> {
    const id = this.editingId();
    if (!id) return;
    this.saving.set(true);
    this.recipeMsg.set(null);
    try {
      const saved = await firstValueFrom(this.catalog.saveRecipe(id, { notes: null, ingredients: this.validIngredients().map((r) => ({ ...r })) }));
      this.currentRecipe.set(saved);
      this.recipeMsg.set(`Saved as version ${saved.version}.`);
      await this.load();
    } catch (err) { this.recipeMsg.set(toApiError(err).message); } finally { this.saving.set(false); }
  }

  protected async saveCategory(): Promise<void> {
    try {
      await firstValueFrom(this.catalog.saveCategory(null, { name: this.catName().trim(), sortOrder: this.categories().length, isActive: true }));
      this.catName.set('');
      this.catDialog.set(false);
      await this.load();
    } catch (err) { this.error.set(toApiError(err).message); this.catDialog.set(false); }
  }
}
