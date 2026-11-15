import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiEnvelope } from '../../core/models/api.model';
import { toApiError, unwrap } from '../../core/services/api.util';
import { BranchContextService } from '../../core/services/branch-context.service';
import { DialogComponent } from '../../shared/ui/feedback';

/** The columns of an items file: the heading people see, the field it fills, and the other headings that mean the same. */
const COLUMNS: readonly { head: string; field: string; also: readonly string[]; hint: string }[] = [
  { head: 'Name', field: 'name', also: ['item', 'item name', 'product', 'description of goods'], hint: 'Required' },
  { head: 'SKU', field: 'sku', also: ['part number', 'code', 'item code'], hint: 'Your own code for the item' },
  { head: 'Barcode', field: 'barcode', also: ['ean', 'upc'], hint: '' },
  { head: 'Stock group', field: 'group', also: ['group', 'category'], hint: 'Made for you if it does not exist' },
  { head: 'Unit', field: 'unit', also: ['units', 'uom'], hint: 'each, ml or g (each if empty)' },
  { head: 'Type', field: 'type', also: ['kind'], hint: 'stock item or ingredient (stock item if empty)' },
  { head: 'Selling price', field: 'sellingPrice', also: ['price', 'retail', 'retail price', 'sell price'], hint: '' },
  { head: 'Cost', field: 'cost', also: ['cost price', 'unit cost'], hint: '' },
  { head: 'Minimum level', field: 'minimumLevel', also: ['minimum', 'min level'], hint: '' },
  { head: 'Reorder level', field: 'reorderLevel', also: ['reorder', 're-order level'], hint: '' },
  { head: 'Tax exempt', field: 'taxExempt', also: ['no tax'], hint: 'yes or no' },
  { head: 'Discount %', field: 'discountPercent', also: ['discount', 'discount percent'], hint: '0 to 100' },
  { head: 'Opening quantity', field: 'openingQuantity', also: ['opening stock', 'quantity', 'qty', 'stock'], hint: 'Stock you already hold' },
  { head: 'Description', field: 'description', also: ['other details', 'notes'], hint: '' }
];

type Row = Record<string, string>;
interface ImportResult { rows: number; imported: boolean; withOpeningStock: number; newGroups: string[]; errors: { row: number; column: string; message: string }[] }

/** Reads a CSV as people really save it: commas or semicolons, quoted cells with commas and line breaks inside, a byte-order mark. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ',';
  const rows: string[][] = [];
  let cell = '';
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]!;
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

/**
 * Many items at once from a file (owner's rule, 2026-11-15): download the template, fill it in a spreadsheet, choose the file. The file
 * is checked first and every problem is listed by row and column; it is imported only when there is none, all of it or nothing. A row
 * that matches an item already here refuses the file. The server does the checking and the importing; this only reads the file.
 */
@Component({
  selector: 'zp-item-import',
  standalone: true,
  imports: [FormsModule, DialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <zp-dialog [open]="true" title="Add many items from a file" [wide]="true" (closed)="closed.emit()">
      <div class="space-y-4" data-testid="import-dialog">
        <ol class="ml-5 list-decimal space-y-3 text-sm">
          <li>
            <p>Download the template, open it in Excel or Google Sheets, and put one item on each row. Only <strong>Name</strong> is required.</p>
            <button type="button" class="btn-outline mt-1" data-testid="import-template" (click)="template()">Download the template (CSV)</button>
            <details class="mt-1 text-xs text-ink/80"><summary class="cursor-pointer">What each column means</summary>
              <ul class="mt-1 grid gap-x-4 sm:grid-cols-2">@for (c of columns; track c.field) { <li><strong>{{ c.head }}</strong>@if (c.hint) { : {{ c.hint }} }</li> }</ul>
            </details>
          </li>
          <li>
            <p>Save it as CSV and choose it here.</p>
            <input type="file" accept=".csv,text/csv,text/plain" class="app-input mt-1" data-testid="import-file" (change)="choose($event)" />
          </li>
          @if (hasOpening()) {
            <li>
              <label class="app-label" for="imp-branch">Opening stock is at</label>
              <select id="imp-branch" class="app-input max-w-xs" data-testid="import-branch" [ngModel]="branchId()" (ngModelChange)="branchId.set($event); check()">
                @for (b of branches.branches(); track b.id) { <option [value]="b.id">{{ b.name }}</option> }
              </select>
            </li>
          }
        </ol>

        @if (fileError()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="import-file-error">{{ fileError() }}</p> }
        @if (checking()) { <p role="status">Checking the file...</p> }

        @if (result(); as r) {
          @if (r.imported) {
            <p class="sys-alert sys-alert-info" role="status" data-testid="import-done">{{ r.rows }} item(s) added.@if (r.withOpeningStock) { Opening stock recorded for {{ r.withOpeningStock }}. } @if (r.newGroups.length) { New stock groups: {{ r.newGroups.join(', ') }}. }</p>
          } @else if (r.errors.length) {
            <div class="sys-alert sys-alert-danger" role="alert" data-testid="import-errors">
              <p class="font-semibold">Nothing was imported. The file has {{ r.errors.length }} problem(s). Correct them in the file and choose it again.</p>
              <div class="mt-2 max-h-64 overflow-auto rounded bg-panel text-ink">
                <table class="app-table"><caption class="sr-only">Problems in the file</caption>
                  <thead><tr><th>Row</th><th>Column</th><th>What is wrong</th></tr></thead>
                  <tbody>@for (e of r.errors; track $index) { <tr><td>{{ e.row }}</td><td>{{ e.column }}</td><td>{{ e.message }}</td></tr> }</tbody>
                </table>
              </div>
            </div>
          } @else {
            <div class="sys-alert sys-alert-info" role="status" data-testid="import-ready">
              <p class="font-semibold">The file is good: {{ r.rows }} item(s) will be added.</p>
              @if (r.newGroups.length) { <p>These stock groups will be made: {{ r.newGroups.join(', ') }}.</p> }
              @if (r.withOpeningStock) { <p>Opening stock will be recorded for {{ r.withOpeningStock }} item(s).</p> }
            </div>
            <div class="max-h-56 overflow-auto rounded-lg border border-ink/10">
              <table class="app-table" data-testid="import-preview"><caption class="sr-only">The first rows of the file</caption>
                <thead><tr>@for (c of usedColumns(); track c.field) { <th>{{ c.head }}</th> }</tr></thead>
                <tbody>@for (row of rows().slice(0, 20); track $index) { <tr>@for (c of usedColumns(); track c.field) { <td>{{ row[c.field] }}</td> }</tr> }</tbody>
              </table>
            </div>
            @if (rows().length > 20) { <p class="text-xs text-ink/70">Showing the first 20 of {{ rows().length }} rows.</p> }
          }
        }

        <div class="flex justify-end gap-2">
          <button type="button" class="btn-ghost" data-testid="import-close" (click)="closed.emit()">{{ result()?.imported ? 'Done' : 'Cancel' }}</button>
          @if (!result()?.imported) { <button type="button" class="btn-primary" data-testid="import-confirm" [disabled]="!ready() || importing()" (click)="confirm()">{{ importing() ? 'Importing...' : 'Add ' + rows().length + ' item(s)' }}</button> }
        </div>
      </div>
    </zp-dialog>
  `
})
export class ItemImportComponent {
  private readonly http = inject(HttpClient);
  protected readonly branches = inject(BranchContextService);

  readonly closed = output<void>();
  /** Items were added: the list behind should be read again. */
  readonly imported = output<void>();

  protected readonly columns = COLUMNS;
  protected readonly rows = signal<readonly Row[]>([]);
  protected readonly branchId = signal<string>(this.branches.activeId() ?? '');
  protected readonly fileError = signal<string | null>(null);
  protected readonly checking = signal(false);
  protected readonly importing = signal(false);
  protected readonly result = signal<ImportResult | null>(null);

  protected readonly hasOpening = computed(() => this.rows().some((r) => (r['openingQuantity'] ?? '').trim() !== '' && Number(r['openingQuantity']) !== 0));
  protected readonly usedColumns = computed(() => COLUMNS.filter((c) => this.rows().some((r) => (r[c.field] ?? '').trim() !== '')));
  protected readonly ready = computed(() => { const r = this.result(); return !!r && !r.imported && r.errors.length === 0 && this.rows().length > 0 && !this.checking(); });

  constructor() { void this.branches.load().then(() => { if (!this.branchId()) this.branchId.set(this.branches.activeId() ?? ''); }); }

  protected template(): void {
    const example = [
      ['Coca-Cola 50cl', 'COK-50', '5449000000996', 'Soft drinks', 'each', 'stock item', '500', '350', '12', '24', 'no', '', '48', ''],
      ['Gin (per ml)', 'GIN-ML', '', 'Spirits', 'ml', 'ingredient', '', '6', '700', '1400', 'no', '', '2100', 'Poured into cocktails']
    ];
    const csv = [COLUMNS.map((c) => c.head), ...example].map((r) => r.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'zestpoint-items-template.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  protected async choose(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    this.result.set(null);
    this.rows.set([]);
    this.fileError.set(null);
    if (!file) return;
    if (file.size > 2_000_000) { this.fileError.set('That file is larger than 2 MB. Split it into smaller files of up to 1,000 items.'); return; }
    let table: string[][];
    try { table = parseCsv(await file.text()); } catch { this.fileError.set('That file could not be read. Save it from your spreadsheet as CSV and try again.'); return; }
    if (table.length < 2) { this.fileError.set('The file needs a heading row and at least one item under it.'); return; }

    // Which column is which, by its heading (in any letter case, and by the other names people use).
    const heads = table[0]!.map((h) => h.trim().toLowerCase());
    const map = heads.map((h) => COLUMNS.find((c) => c.head.toLowerCase() === h || c.also.includes(h))?.field ?? null);
    const unknown = table[0]!.filter((h, i) => h.trim() !== '' && map[i] === null);
    if (!map.includes('name')) { this.fileError.set('The file has no "Name" column. Use the template: its first row is the headings.'); return; }
    if (unknown.length) { this.fileError.set(`These columns are not recognised: ${unknown.join(', ')}. Use the headings of the template, or remove those columns.`); return; }
    if (new Set(map.filter(Boolean)).size !== map.filter(Boolean).length) { this.fileError.set('Two columns of the file mean the same thing. Keep one of each.'); return; }

    this.rows.set(table.slice(1).map((cells) => Object.fromEntries(map.map((field, i) => [field ?? `_${i}`, (cells[i] ?? '').trim()]).filter(([k]) => !String(k).startsWith('_'))) as Row));
    await this.check();
  }

  private body(dryRun: boolean) {
    return { dryRun, branchId: this.hasOpening() ? this.branchId() || null : null, rows: this.rows() };
  }

  /** Asks the server to check the file without saving anything. */
  protected async check(): Promise<void> {
    if (this.rows().length === 0) return;
    this.checking.set(true);
    this.fileError.set(null);
    try { this.result.set(await firstValueFrom(this.http.post<ApiEnvelope<ImportResult>>('/api/v1/inventory/items/import', this.body(true)).pipe(unwrap()))); }
    catch (err) { this.result.set(null); this.fileError.set(toApiError(err).message); }
    finally { this.checking.set(false); }
  }

  protected async confirm(): Promise<void> {
    if (!this.ready()) return;
    this.importing.set(true);
    this.fileError.set(null);
    try {
      this.result.set(await firstValueFrom(this.http.post<ApiEnvelope<ImportResult>>('/api/v1/inventory/items/import', this.body(false)).pipe(unwrap())));
      this.imported.emit();
    } catch (err) {
      const e = toApiError(err);
      const rows = e.fieldErrors['rows'] ?? [];
      this.fileError.set(rows.length ? `${e.message} ${rows.slice(0, 5).join(' ')}` : e.message);
      await this.check();
    } finally { this.importing.set(false); }
  }
}
