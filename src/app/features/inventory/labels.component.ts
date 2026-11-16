import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LabelDto, LabelSheetDto } from '../../core/models/nav-ops.model';
import { InventoryItemDto } from '../../core/models/ops.model';
import { barcodeModules, modulesToPath } from '../../core/barcode';
import { toApiError } from '../../core/services/api.util';
import { StockExtrasApi } from '../../core/services/nav-ops.services';
import { InventoryApi } from '../../core/services/ops.services';
import { SearchSelectComponent, SelectOption } from '../../shared/ui/search-select.component';

interface Row { id: string; itemId: string; name: string; copies: number; lotCode: string; expiry: string; serial: string; tracksSerials: boolean }

const SIZES: readonly { readonly key: string; readonly label: string; readonly w: number; readonly h: number }[] = [
  { key: '50x30', label: '50 x 30 mm (shelf)', w: 50, h: 30 }, { key: '70x40', label: '70 x 40 mm', w: 70, h: 40 }, { key: '100x50', label: '100 x 50 mm (large)', w: 100, h: 50 }
];

/**
 * Stock labels: choose items and how many copies, preview the labels with a real barcode, then print. Printing is the BROWSER'S print
 * dialog: ZestPoint can open it but cannot know whether paper came out, so it never says a label was printed. Prices only appear for people
 * who may see selling prices; an item with nothing valid to encode is flagged instead of getting an invented code.
 */
@Component({
    selector: 'zp-labels',
    imports: [FormsModule, SearchSelectComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="no-print">
      <h1 class="text-2xl font-bold">Stock Labels Printing</h1>
      <p class="mt-1 max-w-3xl text-sm text-ink/80">Pick the items and how many labels each needs, preview them, then print from your browser. Labels use the item's barcode, or its SKU when it has no barcode.</p>
      @if (error()) { <p class="sys-alert sys-alert-danger my-3" role="alert" data-testid="labels-error">{{ error() }}</p> }

      <section class="app-card mt-4 grid max-w-4xl gap-3 sm:grid-cols-[1fr_6rem_8rem_auto]" aria-label="Add a label">
        <zp-search-select label="Item" [options]="options()" [value]="pick()" placeholder="Search items" testId="label-item" (valueChange)="pick.set($event)" />
        <div><label class="app-label" for="l-copies">Copies</label><input id="l-copies" type="number" min="1" max="500" class="app-input" data-testid="label-copies" [ngModel]="copies()" (ngModelChange)="copies.set(+$event)" /></div>
        <div><label class="app-label" for="l-lot">Batch (optional)</label><input id="l-lot" class="app-input" maxlength="60" [ngModel]="lot()" (ngModelChange)="lot.set($event)" /></div>
        <div class="flex items-end"><button type="button" class="btn-outline" data-testid="label-add" [disabled]="!pick()" (click)="add()">Add</button></div>
        <div><label class="app-label" for="l-exp">Expiry (optional)</label><input id="l-exp" type="date" class="app-input" [ngModel]="expiry()" (ngModelChange)="expiry.set($event)" /></div>
        <div class="sm:col-span-2"><label class="app-label" for="l-serial">Serial number (serial-tracked items)</label><input id="l-serial" class="app-input" maxlength="80" [ngModel]="serial()" (ngModelChange)="serial.set($event)" /></div>
      </section>

      @if (rows().length > 0) {
        <div class="app-card mt-4 max-w-4xl overflow-x-auto p-0"><table class="app-table" data-testid="label-rows">
          <thead><tr><th>Item</th><th>Copies</th><th>Batch</th><th>Expiry</th><th>Serial</th><th></th></tr></thead>
          <tbody>@for (r of rows(); track r.id) { <tr><td>{{ r.name }}</td><td>{{ r.copies }}</td><td>{{ r.lotCode }}</td><td>{{ r.expiry }}</td><td>{{ r.serial }}</td><td class="text-right"><button type="button" class="btn-ghost px-2 py-0.5 text-sm" (click)="remove(r.id)">Remove</button></td></tr> }</tbody></table></div>

        <section class="mt-4 flex flex-wrap items-end gap-4" aria-label="Label options">
          <div><label class="app-label" for="l-size">Label size</label><select id="l-size" class="app-input" data-testid="label-size" [ngModel]="size()" (ngModelChange)="size.set($event)">@for (s of sizes; track s.key) { <option [value]="s.key">{{ s.label }}</option> }</select></div>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" data-testid="label-price" [checked]="showPrice()" (change)="showPrice.set(!showPrice())" /> Show price</label>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" [checked]="showGroup()" (change)="showGroup.set(!showGroup())" /> Show stock group</label>
          <button type="button" class="btn-primary" data-testid="label-preview" [disabled]="busy()" (click)="preview()">Preview labels</button>
          <button type="button" class="btn-outline" data-testid="label-print" [disabled]="!printable()" (click)="print()">Open print dialog</button>
        </section>
      }
      @if (sheet()?.priceHidden) { <p class="sys-alert sys-alert-info mt-3" role="status">Prices are not shown: your role cannot see selling prices.</p> }
      @if (printed()) { <p class="sys-alert sys-alert-info mt-3" role="status" data-testid="label-printed-note">The print dialog was opened. ZestPoint cannot tell whether labels were actually printed; check the paper.</p> }
      @if (problems().length > 0) {
        <div class="sys-alert sys-alert-warning mt-3" role="alert" data-testid="label-problems"><p class="font-semibold">These labels will not be printed:</p>
          <ul class="list-disc pl-5">@for (p of problems(); track p.inventoryItemId) { <li>{{ p.name }}: {{ p.problem }}</li> }</ul></div>
      }
    </div>

    @if (sheet(); as s) {
      <section class="mt-4 flex flex-wrap gap-2 print:mt-0" data-testid="label-sheet" aria-label="Label preview">
        @for (l of expanded(); track $index) {
          <article class="label overflow-hidden border border-ink/30 bg-white p-1 text-black print:border-ink/20" [style.width.mm]="dim().w" [style.height.mm]="dim().h">
            <p class="truncate text-[10px] font-bold leading-tight">{{ l.name }}</p>
            <p class="truncate text-[8px] leading-tight">{{ l.sku }}@if (l.groupName) { &middot; {{ l.groupName }} }@if (l.lotCode) { &middot; Lot {{ l.lotCode }} }@if (l.expiryDate) { &middot; Exp {{ l.expiryDate.slice(0, 10) }} }@if (l.serialNumber) { &middot; S/N {{ l.serialNumber }} }</p>
            @if (path(l); as d) {
              <svg class="mt-0.5 w-full" style="height: 45%" [attr.viewBox]="'-10 0 ' + (len(l) + 20) + ' 40'" preserveAspectRatio="none" role="img" [attr.aria-label]="'Barcode ' + l.barcodeValue"><path [attr.d]="d" fill="#000" /></svg>
              <p class="text-center font-mono text-[8px] leading-none">{{ l.barcodeValue }}</p>
            }
            @if (l.price) { <p class="text-right text-[11px] font-bold leading-tight">{{ s.currencyCode }} {{ l.price }}</p> }
          </article>
        }
      </section>
    }
  `,
    styles: [`@media print { @page { margin: 6mm; } .label { break-inside: avoid; } }`]
})
export class LabelsComponent implements OnInit {
  private readonly inventory = inject(InventoryApi);
  private readonly extras = inject(StockExtrasApi);
  private readonly route = inject(ActivatedRoute);

  protected readonly sizes = SIZES;
  protected readonly items = signal<readonly InventoryItemDto[]>([]);
  protected readonly rows = signal<readonly Row[]>([]);
  protected readonly sheet = signal<LabelSheetDto | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly printed = signal(false);
  protected readonly pick = signal<string | null>(null);
  protected readonly copies = signal(1);
  protected readonly lot = signal('');
  protected readonly expiry = signal('');
  protected readonly serial = signal('');
  protected readonly size = signal('50x30');
  protected readonly showPrice = signal(false);
  protected readonly showGroup = signal(false);

  protected readonly options = computed<readonly SelectOption[]>(() => this.items().filter((i) => i.isActive).map((i) => ({ value: i.id, label: i.name, description: [i.sku, i.barcode].filter(Boolean).join(' / ') || undefined })));
  protected readonly dim = computed(() => SIZES.find((s) => s.key === this.size()) ?? SIZES[0]!);
  protected readonly problems = computed(() => (this.sheet()?.labels ?? []).filter((l) => l.problem));
  protected readonly printable = computed(() => (this.sheet()?.labels ?? []).some((l) => l.copies > 0 && !!barcodeModules(l.barcodeValue, l.barcodeFormat)));
  protected readonly expanded = computed<LabelDto[]>(() => (this.sheet()?.labels ?? []).filter((l) => !l.problem).flatMap((l) => Array.from({ length: l.copies }, () => l)));

  ngOnInit(): void {
    void firstValueFrom(this.inventory.items({ pageSize: 500, active: true })).then((p) => {
      this.items.set(p.items);
      this.preload(p.items);
    }).catch((e) => this.error.set(toApiError(e).message));
  }

  /** Shelf tags from a purchase order: `?items=<id>:<copies>,<id>:<copies>` puts those items on the sheet ready to preview. */
  private preload(items: readonly InventoryItemDto[]): void {
    const raw = this.route.snapshot.queryParamMap.get('items');
    if (!raw) return;
    const rows: Row[] = [];
    for (const part of raw.split(',')) {
      const [id, n] = part.split(':');
      const item = items.find((i) => i.id === id);
      if (!item) continue;
      rows.push({ id: crypto.randomUUID(), itemId: item.id, name: item.name, copies: Math.max(1, Math.min(500, Math.round(Number(n)) || 1)), lotCode: '', expiry: '', serial: '', tracksSerials: item.tracksSerials });
    }
    if (rows.length > 0) this.rows.set(rows);
  }

  protected add(): void {
    const item = this.items().find((i) => i.id === this.pick());
    if (!item) return;
    this.rows.update((r) => [...r, { id: crypto.randomUUID(), itemId: item.id, name: item.name, copies: Math.max(1, Math.min(500, this.copies() || 1)), lotCode: this.lot().trim(), expiry: this.expiry(), serial: this.serial().trim(), tracksSerials: item.tracksSerials }]);
    this.pick.set(null); this.lot.set(''); this.expiry.set(''); this.serial.set(''); this.copies.set(1);
    this.sheet.set(null);
  }

  protected remove(id: string): void {
    this.rows.update((r) => r.filter((x) => x.id !== id));
    this.sheet.set(null);
  }

  protected async preview(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.printed.set(false);
    try {
      this.sheet.set(await firstValueFrom(this.extras.labels({
        showPrice: this.showPrice(), showGroup: this.showGroup(),
        lines: this.rows().map((r) => ({ inventoryItemId: r.itemId, copies: r.copies, lotCode: r.lotCode || null, expiryDate: r.expiry || null, serialNumber: r.serial || null }))
      })));
    } catch (err) { this.sheet.set(null); this.error.set(toApiError(err).message); } finally { this.busy.set(false); }
  }

  protected print(): void {
    window.print();
    this.printed.set(true);
  }

  private modules(l: LabelDto): string | null { return barcodeModules(l.barcodeValue, l.barcodeFormat); }
  protected path(l: LabelDto): string | null { const m = this.modules(l); return m ? modulesToPath(m) : null; }
  protected len(l: LabelDto): number { return this.modules(l)?.length ?? 0; }
}
