import { HttpClient } from '@angular/common/http';
import { ApiEnvelope } from '../../core/models/api.model';
import { unwrap } from '../../core/services/api.util';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, TemplateRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ReportColumn, ReportDto, ReportQuery, ReportRow } from '../../core/models/nav-ops.model';
import { SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { InventoryItemDto, SupplierDto } from '../../core/models/ops.model';
import { ReportDefinition } from '../../core/navigation/report-definitions';
import { TenantTimePipe } from '../../core/pipes/tenant-time.pipe';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { BranchContextService } from '../../core/services/branch-context.service';
import { ReportApi, StockGroupApi } from '../../core/services/nav-ops.services';
import { InventoryApi } from '../../core/services/ops.services';
import { ToastService } from '../../shared/ui/feedback';
import { SearchSelectComponent, SelectOption } from '../../shared/ui/search-select.component';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';
import { badgeTone, downloadBlob, formatCell, formatDateOnly, isNumeric } from './report-format';

const PAGE_SIZES = [25, 50, 100, 200] as const;

/**
 * The shared report screen: filters (only the ones that report supports), summary figures, a server-sorted and server-paged table,
 * the calculation notes, CSV export and print. The server does all the calculating, scoping and permission checks; this only presents.
 * Filters live in the URL, so a refresh, the back button and drill-downs keep them.
 */
@Component({
    selector: 'zp-report-view',
    imports: [NgTemplateOutlet, RouterLink, TenantTimePipe, StatusBadgeComponent, SearchSelectComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold" data-testid="report-title">{{ title() }}</h1>
        @if (description()) { <p class="mt-1 max-w-3xl text-sm text-ink/80">{{ description() }}</p> }
      </div>
      <div class="no-print flex flex-wrap gap-2">
        <button type="button" class="btn-outline" data-testid="report-refresh" [disabled]="loading()" (click)="load()">Refresh</button>
        @if (canExport()) { <button type="button" class="btn-outline" data-testid="report-export" [disabled]="exporting() || !report()" (click)="exportCsv()">{{ exporting() ? 'Preparing...' : 'Export CSV' }}</button> }
        <button type="button" class="btn-outline" data-testid="report-print" [disabled]="!report()" (click)="print()">Print</button>
      </div>
    </div>

    <form class="no-print app-card mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" (submit)="$event.preventDefault(); apply()" data-testid="report-filters" aria-label="Report filters">
      @if (definition().period === 'range') {
        <div><label class="app-label" for="rf-from">From</label><input id="rf-from" type="date" class="app-input" data-testid="filter-from" [value]="draft().from ?? ''" (input)="set('from', $any($event.target).value)" /></div>
        <div><label class="app-label" for="rf-to">To</label><input id="rf-to" type="date" class="app-input" data-testid="filter-to" [value]="draft().to ?? ''" (input)="set('to', $any($event.target).value)" /></div>
      } @else if (definition().period === 'asof') {
        <div><label class="app-label" for="rf-asof">As at</label><input id="rf-asof" type="date" class="app-input" data-testid="filter-asof" [value]="draft().asOf ?? ''" (input)="set('asOf', $any($event.target).value)" /></div>
      }
      @if (definition().branch && branches.branches().length > 0) {
        <div><label class="app-label" for="rf-branch">Branch</label>
          <select id="rf-branch" class="app-input" data-testid="filter-branch" (change)="set('branchId', $any($event.target).value)">
            <option value="" [selected]="!draft().branchId">{{ branches.branches().length > 1 ? 'All my branches' : branches.branches()[0].name }}</option>
            @if (branches.branches().length > 1) { @for (b of branches.branches(); track b.id) { <option [value]="b.id" [selected]="draft().branchId === b.id">{{ b.name }}</option> } }
          </select></div>
      }
      @if (definition().group && groups().length > 0) {
        <div><label class="app-label" for="rf-group">Stock group</label>
          <select id="rf-group" class="app-input" data-testid="filter-group" (change)="set('groupId', $any($event.target).value)">
            <option value="" [selected]="!draft().groupId">All groups</option>@for (g of groups(); track g.value) { <option [value]="g.value" [selected]="draft().groupId === g.value">{{ g.label }}</option> }</select></div>
      }
      @if (definition().supplier) {
        <div><label class="app-label" for="rf-sup">Supplier</label>
          <select id="rf-sup" class="app-input" data-testid="filter-supplier" (change)="set('supplierId', $any($event.target).value)">
            <option value="" [selected]="!draft().supplierId">{{ definition().supplierRequired ? 'Choose a supplier...' : 'All suppliers' }}</option>@for (s of suppliers(); track s.id) { <option [value]="s.id" [selected]="draft().supplierId === s.id">{{ s.name }}</option> }</select></div>
      }
      @if (definition().staff; as staffLabel) {
        <div><label class="app-label" for="rf-staff">{{ staffLabel }}</label>
          <select id="rf-staff" class="app-input" data-testid="filter-staff" (change)="set('staffId', $any($event.target).value)">
            <option value="" [selected]="!draft().staffId">Everyone</option>@for (p of staff(); track p.id) { <option [value]="p.id" [selected]="draft().staffId === p.id">{{ p.name }}</option> }</select></div>
      }
      @if (definition().item && itemOptions().length > 0) {
        <zp-search-select label="Item" [options]="itemOptions()" [value]="draft().itemId ?? null" placeholder="Search items" testId="filter-item" (valueChange)="set('itemId', $event)" />
      }
      @if (definition().view; as v) {
        <div><label class="app-label" for="rf-view">{{ v.label }}</label>
          <select id="rf-view" class="app-input" data-testid="filter-view" (change)="set('type', $any($event.target).value)">
            @for (o of v.options; track o.value) { <option [value]="o.value" [selected]="(draft().type ?? v.default) === o.value">{{ o.label }}</option> }</select></div>
      }
      @if (definition().status; as st) {
        <div><label class="app-label" for="rf-status">{{ st.label }}</label>
          <select id="rf-status" class="app-input" data-testid="filter-status" (change)="set('status', $any($event.target).value)">
            @for (o of st.options; track o.value) { <option [value]="o.value" [selected]="(draft().status ?? st.options[0].value) === o.value">{{ o.label }}</option> }</select></div>
      }
      @if (definition().method; as md) {
        <div><label class="app-label" for="rf-method">{{ md.label }}</label>
          <select id="rf-method" class="app-input" data-testid="filter-method" (change)="set('method', $any($event.target).value)">
            @for (o of md.options; track o.value) { <option [value]="o.value" [selected]="(draft().method ?? '') === o.value">{{ o.label }}</option> }</select></div>
      }
      @if (definition().flag; as fl) {
        <div><label class="app-label" for="rf-flag">{{ fl.label }}</label>
          <select id="rf-flag" class="app-input" data-testid="filter-flag" (change)="set('flag', $any($event.target).value)">
            @for (o of fl.options; track o.value) { <option [value]="o.value" [selected]="(draft().flag ?? '') === o.value">{{ o.label }}</option> }</select></div>
      }
      @if (definition().amount) {
        <div><label class="app-label" for="rf-min">Amount from</label><input id="rf-min" type="number" min="0" step="0.01" class="app-input" data-testid="filter-min-amount" [value]="draft().minAmount ?? ''" (input)="set('minAmount', $any($event.target).value)" /></div>
        <div><label class="app-label" for="rf-max">Amount to</label><input id="rf-max" type="number" min="0" step="0.01" class="app-input" data-testid="filter-max-amount" [value]="draft().maxAmount ?? ''" (input)="set('maxAmount', $any($event.target).value)" /></div>
      }
      @if (definition().warningDays; as w) {
        <div><label class="app-label" for="rf-warn">{{ w.label }}</label><input id="rf-warn" type="number" min="1" max="730" class="app-input" data-testid="filter-warning" [value]="draft().warningDays ?? ''" [placeholder]="'' + w.default" (input)="set('warningDays', $any($event.target).value)" /></div>
      }
      @if (definition().buckets) {
        <div><label class="app-label" for="rf-buckets">Age buckets (days)</label><input id="rf-buckets" class="app-input" data-testid="filter-buckets" placeholder="30,60,90,180" [value]="draft().buckets ?? ''" (input)="set('buckets', $any($event.target).value)" /></div>
      }
      @if (definition().search) {
        <div class="sm:col-span-2"><label class="app-label" for="rf-search">Search</label><input id="rf-search" type="search" class="app-input" data-testid="filter-search" [placeholder]="definition().search!" [value]="draft().search ?? ''" (input)="set('search', $any($event.target).value)" /></div>
      }
      @if (definition().compare) {
        <label class="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" data-testid="filter-compare" [checked]="!!draft().compare" (change)="set('compare', $any($event.target).checked)" /> Compare with the previous period</label>
      }
      <div class="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
        <button type="submit" class="btn-primary" data-testid="filter-apply" [disabled]="loading()">Apply</button>
        <button type="button" class="btn-ghost" data-testid="filter-reset" (click)="reset()">Reset</button>
      </div>
    </form>

    @if (needsInput()) {
      <p class="sys-alert sys-alert-info" role="status" data-testid="report-needs-input">{{ needsInput() }}</p>
    } @else if (error()) {
      <div class="sys-alert sys-alert-danger flex flex-wrap items-center justify-between gap-2" role="alert" data-testid="report-error">
        <span>{{ error() }}</span><button type="button" class="btn-outline px-2 py-1 text-sm" (click)="load()">Try again</button></div>
    } @else if (loading() && !report()) {
      <p class="py-10 text-center text-ink/70" role="status" data-testid="report-loading">Loading report...</p>
    }

    @if (visibleReport(); as r) {
      @if (r.integrationStatus === 'not_configured') {
        <p class="sys-alert sys-alert-warning mb-3" role="status" data-testid="report-integration">No integration is configured, so online figures are blank. Nothing is estimated or assumed.</p>
      }
      @if (r.truncated) { <p class="sys-alert sys-alert-warning mb-3" role="status">The result was cut at its limit. Narrow the filters to see everything.</p> }

      <div class="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink/70" data-testid="report-applied">
        <span>Generated {{ r.generatedAtUtc | tenantTime }} ({{ r.timeZoneId }})</span>
        @if (r.from) { <span>Period {{ date(r.from) }} to {{ date(r.to!) }}</span> }
        <span>Currency {{ r.currencyCode }}</span>
        @if (definition().branch && branches.branches().length > 0) { <span class="app-badge app-badge-primary" data-testid="report-scope">{{ branchScope(r) }}</span> }
        @for (f of filterChips(r); track f.key) { <span class="app-badge app-badge-primary">{{ f.key }}: {{ f.value }}</span> }
      </div>

      @if (r.summary.length > 0) {
        <div class="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="report-summary">
          @for (m of r.summary; track m.label) {
            <div class="app-card"><p class="text-xs font-medium uppercase tracking-wide text-ink/70">{{ m.label }}</p>
              <p class="mt-1 text-xl font-bold">{{ metric(m, r) }}</p>@if (m.hint) { <p class="mt-1 text-xs text-ink/70">{{ m.hint }}</p> }</div>
          }
        </div>
      }

      <div class="no-print mb-2 flex flex-wrap items-center justify-between gap-2">
        <p class="text-sm text-ink/80" data-testid="report-count">{{ r.total === 0 ? 'No rows' : 'Showing ' + first() + '-' + last() + ' of ' + r.total }}</p>
        <details class="relative text-sm"><summary class="btn-ghost cursor-pointer px-2 py-1">Columns</summary>
          <div class="absolute right-0 z-10 mt-1 max-h-72 w-56 overflow-auto rounded-lg border border-ink/20 bg-panel p-2 shadow-lg">
            @for (c of allColumns(); track c.key) { <label class="flex items-center gap-2 py-1"><input type="checkbox" [checked]="!hidden().has(c.key)" (change)="toggleColumn(c.key)" /> {{ c.label }}</label> }
          </div></details>
      </div>

      <div class="app-card overflow-x-auto p-0" data-testid="report-table">
        <table class="app-table">
          <caption class="sr-only">{{ title() }}</caption>
          <thead><tr>
            @if (definition().selectable) { <th class="no-print w-8"><input type="checkbox" aria-label="Select all rows" [checked]="allSelected()" (change)="toggleAll()" /></th> }
            @for (c of columns(); track c.key) {
              <th [class.text-right]="numeric(c)" [attr.aria-sort]="sortAria(c)">
                @if (c.sortable) { <button type="button" class="inline-flex items-center gap-1 font-semibold hover:underline" (click)="sortBy(c.key)">{{ c.label }}{{ c.unit ? ' (' + c.unit + ')' : '' }} <span aria-hidden="true">{{ arrow(c.key) }}</span></button> }
                @else { {{ c.label }}{{ c.unit ? ' (' + c.unit + ')' : '' }} }
              </th>
            }
            @if (hasItemLink()) { <th class="no-print"></th> }
            @if (rowActions()) { <th class="no-print"></th> }
          </tr></thead>
          <tbody>
            @for (row of r.rows; track $index) {
              <tr>
                @if (definition().selectable) { <td class="no-print"><input type="checkbox" [attr.aria-label]="'Select row ' + ($index + 1)" [checked]="isSelected(row)" (change)="toggleRow(row)" /></td> }
                @for (c of columns(); track c.key) {
                  <td [class.text-right]="numeric(c)" [class.whitespace-nowrap]="numeric(c)">
                    @switch (c.type) {
                      @case ('datetime') { {{ str(row[c.key]) | tenantTime }} }
                      @case ('badge') { @if (row[c.key]) { <zp-status-badge [tone]="tone(str(row[c.key]) ?? '')">{{ row[c.key] }}</zp-status-badge> } }
                      @default { {{ cell(row[c.key], c, r.currencyCode) }} }
                    }
                  </td>
                }
                @if (hasItemLink()) { <td class="no-print whitespace-nowrap text-right">@if (row[definition().itemIdColumn!]; as id) { <a class="btn-ghost px-2 py-1 text-sm" [routerLink]="'/app/inventory/reports/items-history'" [queryParams]="historyParams(id)">History</a> }</td> }
                @if (rowActions(); as tpl) { <td class="no-print whitespace-nowrap text-right"><ng-container [ngTemplateOutlet]="tpl" [ngTemplateOutletContext]="{ $implicit: row }" /></td> }
              </tr>
            } @empty {
              <tr><td [attr.colspan]="columns().length + 3" class="py-8 text-center text-ink/70" data-testid="report-empty">Nothing matches these filters.</td></tr>
            }
            @if (r.totals; as t) {
              <tr class="font-bold" data-testid="report-totals">
                @if (definition().selectable) { <td></td> }
                @for (c of columns(); track c.key) { <td [class.text-right]="numeric(c)">{{ cell(t[c.key], c, r.currencyCode) }}</td> }
                @if (hasItemLink()) { <td></td> }
                @if (rowActions()) { <td></td> }
              </tr>
            }
          </tbody>
        </table>
      </div>

      <nav class="no-print mt-3 flex flex-wrap items-center justify-between gap-2" aria-label="Pages">
        <label class="flex items-center gap-2 text-sm">Rows per page
          <select class="app-input w-auto py-1" data-testid="page-size" (change)="setPageSize(+$any($event.target).value)">@for (n of pageSizes; track n) { <option [value]="n" [selected]="r.pageSize === n">{{ n }}</option> }</select></label>
        <div class="flex items-center gap-2 text-sm">
          <button type="button" class="btn-outline px-3 py-1" data-testid="page-prev" [disabled]="r.page <= 1 || loading()" (click)="goTo(r.page - 1)">Previous</button>
          <span>Page {{ r.page }} of {{ pages() }}</span>
          <button type="button" class="btn-outline px-3 py-1" data-testid="page-next" [disabled]="r.page >= pages() || loading()" (click)="goTo(r.page + 1)">Next</button>
        </div>
      </nav>

      @if (r.notes.length > 0) {
        <section class="mt-6 rounded-xl border border-ink/10 bg-panel p-4" aria-label="How this report is calculated" data-testid="report-notes">
          <h2 class="mb-2 text-sm font-semibold">How to read this report</h2>
          <ul class="list-disc space-y-1 pl-5 text-sm text-ink/85">@for (n of r.notes; track $index) { <li>{{ n }}</li> }</ul>
        </section>
      }
    }
  `
})
export class ReportViewComponent implements OnInit {
  readonly definition = input.required<ReportDefinition>();
  readonly title = input.required<string>();
  readonly description = input('');
  /** Filters fixed by the host screen (not shown, always sent). */
  readonly fixed = input<ReportQuery>({});
  /** Keep the filters in the address bar (the route screens do; an embedded report does not). */
  readonly syncUrl = input(true);
  /** A template rendered in a last column of every row (the host supplies the buttons; the row is its context). */
  readonly rowActions = input<TemplateRef<{ $implicit: ReportRow }> | null>(null);
  readonly selection = output<readonly ReportRow[]>();
  readonly loaded = output<ReportDto>();

  protected readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  protected readonly branches = inject(BranchContextService);
  private readonly api = inject(ReportApi);
  private readonly groupApi = inject(StockGroupApi);
  private readonly inventory = inject(InventoryApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly destroyed = inject(DestroyRef);

  protected readonly pageSizes = PAGE_SIZES;
  protected readonly draft = signal<ReportQuery>({});
  private readonly applied = signal<ReportQuery>({});
  protected readonly report = signal<ReportDto | null>(null);
  protected readonly loading = signal(false);
  protected readonly exporting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly groups = signal<readonly SelectOption[]>([]);
  protected readonly suppliers = signal<readonly SupplierDto[]>([]);
  protected readonly staff = signal<readonly { id: string; name: string }[]>([]);
  protected readonly itemOptions = signal<readonly SelectOption[]>([]);
  protected readonly hidden = signal<ReadonlySet<string>>(new Set());
  private readonly selected = signal<ReadonlyMap<string, ReportRow>>(new Map());
  private seq = 0;

  protected readonly canExport = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.REPORTS_EXPORT));
  /** The report to show: none while an input is still missing or the last run failed. */
  protected readonly visibleReport = computed(() => (this.needsInput() || this.error() ? null : this.report()));
  protected readonly allColumns = computed<readonly ReportColumn[]>(() => (this.report()?.columns ?? []).filter((c) => c.type !== 'id'));
  protected readonly columns = computed(() => this.allColumns().filter((c) => !this.hidden().has(c.key)));
  protected readonly pages = computed(() => { const r = this.report(); return r ? Math.max(1, Math.ceil(r.total / r.pageSize)) : 1; });
  protected readonly hasItemLink = computed(() => !!this.definition().itemIdColumn && this.auth.hasPermission(SCREEN_PERMISSIONS.INVENTORY_REPORT_HISTORY));
  protected readonly allSelected = computed(() => { const r = this.report(); return !!r && r.rows.length > 0 && r.rows.every((x) => this.selected().has(this.rowKey(x))); });

  /** What the person must still choose before this report can run. */
  protected readonly needsInput = computed(() => {
    const d = this.definition();
    const q = { ...this.applied(), ...this.fixed() };
    if (d.itemRequired && !q.itemId) return 'Choose an item to see its history.';
    if (d.supplierRequired && !q.supplierId) return 'Choose a supplier to see their statement.';
    return null;
  });

  constructor() {
    // Run whenever the applied filters change (including from the address bar).
    effect(() => {
      const q = this.applied();
      const need = untracked(() => this.needsInput());
      if (!need) untracked(() => void this.load(q));
    });
  }

  ngOnInit(): void {
    void this.branches.load();
    const fromUrl = this.queryFromUrl();
    this.draft.set(fromUrl);
    this.applied.set(fromUrl);
    void this.loadLookups();
    if (this.syncUrl()) {
      const sub = this.route.queryParamMap.subscribe(() => {
        const next = this.queryFromUrl();
        if (JSON.stringify(next) !== JSON.stringify(this.applied())) { this.draft.set(next); this.applied.set(next); }
      });
      this.destroyed.onDestroy(() => sub.unsubscribe());
    }
  }

  // ---- filter handling -----------------------------------------------------------------------

  protected set(key: keyof ReportQuery, raw: unknown): void {
    const value = raw === '' || raw === null || raw === undefined || raw === false ? undefined : key === 'warningDays' ? Number(raw) || undefined : raw;
    this.draft.update((d) => ({ ...d, [key]: value as never, page: undefined }));
  }

  protected apply(): void {
    const q = { ...this.draft(), page: 1 };
    this.applied.set(q);
    this.pushUrl(q);
  }

  protected reset(): void {
    this.draft.set({});
    this.applied.set({});
    this.pushUrl({});
  }

  protected sortBy(key: string): void {
    const cur = this.applied();
    const q = { ...cur, sort: key, desc: cur.sort === key ? !cur.desc : false, page: 1 };
    this.draft.update((d) => ({ ...d, sort: q.sort, desc: q.desc }));
    this.applied.set(q);
    this.pushUrl(q);
  }

  protected goTo(page: number): void {
    const q = { ...this.applied(), page };
    this.applied.set(q);
    this.pushUrl(q);
  }

  protected setPageSize(size: number): void {
    const q = { ...this.applied(), pageSize: size, page: 1 };
    this.applied.set(q);
    this.pushUrl(q);
  }

  protected arrow(key: string): string {
    const q = this.applied();
    return q.sort === key ? (q.desc ? '▼' : '▲') : '';
  }

  protected sortAria(c: ReportColumn): string | null {
    const q = this.applied();
    return q.sort === c.key ? (q.desc ? 'descending' : 'ascending') : c.sortable ? 'none' : null;
  }

  // ---- data ----------------------------------------------------------------------------------

  /** Re-runs the report (a host calls this after an action changed the data). */
  async load(query?: ReportQuery): Promise<void> {
    const q = this.effectiveQuery(query ?? this.applied());
    const mine = ++this.seq;
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(this.api.run(this.definition().path, q));
      if (mine !== this.seq) return;
      this.report.set(result);
      this.loaded.emit(result);
      // Fill empty date boxes with the period the server actually used, so what is shown is what was run.
      this.draft.update((d) => ({ ...d, from: d.from ?? result.from ?? undefined, to: d.to ?? result.to ?? undefined }));
    } catch (err) {
      if (mine !== this.seq) return;
      this.report.set(null);
      this.error.set(toApiError(err).message);
    } finally {
      if (mine === this.seq) this.loading.set(false);
    }
  }

  protected async exportCsv(): Promise<void> {
    this.exporting.set(true);
    try {
      const blob = await firstValueFrom(this.api.exportCsv(this.definition().path, this.effectiveQuery(this.applied())));
      downloadBlob(blob, `${this.report()?.key ?? 'report'}.csv`);
      this.toast.success('Export ready. It was recorded in the activity log.');
    } catch (err) {
      this.toast.error(toApiError(err).status === 403 ? 'You can view this report but you are not allowed to export it.' : 'The export failed. Try again.');
    } finally { this.exporting.set(false); }
  }

  protected print(): void {
    window.print();
  }

  private effectiveQuery(q: ReportQuery): ReportQuery {
    const d = this.definition();
    const merged: ReportQuery = { ...q, ...this.fixed() };
    if (!merged.type && d.view?.default) merged.type = d.view.default;
    if (!merged.sort && d.sort) { merged.sort = d.sort; merged.desc = d.desc; }
    if (!merged.page) merged.page = 1;
    if (!merged.pageSize) merged.pageSize = 50;
    return merged;
  }

  private async loadLookups(): Promise<void> {
    const d = this.definition();
    const tasks: Promise<void>[] = [];
    if (d.group) tasks.push(firstValueFrom(this.groupApi.list(true)).then((l) => this.groups.set(l.map((g) => ({ value: g.id, label: g.name + (g.isActive ? '' : ' (inactive)') })))).catch(() => undefined));
    if (d.staff) tasks.push(firstValueFrom(this.http.get<ApiEnvelope<{ id: string; name: string }[]>>('/api/v1/me/colleagues').pipe(unwrap())).then((l) => this.staff.set(l)).catch(() => undefined));
    if (d.supplier) tasks.push(firstValueFrom(this.inventory.suppliers()).then((l) => this.suppliers.set(l)).catch(() => undefined));
    if (d.item) tasks.push(firstValueFrom(this.inventory.items({ pageSize: 500 })).then((p) => this.itemOptions.set(p.items.map((i: InventoryItemDto) => ({ value: i.id, label: i.name, description: i.sku ?? undefined })))).catch(() => undefined));
    await Promise.all(tasks);
  }

  // ---- selection (re-order) ------------------------------------------------------------------

  private rowKey = (r: ReportRow): string => `${r['itemId']}|${r['branchId']}|${r['name'] ?? ''}`;
  protected isSelected = (r: ReportRow): boolean => this.selected().has(this.rowKey(r));

  protected toggleRow(r: ReportRow): void {
    this.selected.update((m) => { const n = new Map(m); const k = this.rowKey(r); n.has(k) ? n.delete(k) : n.set(k, r); return n; });
    this.selection.emit([...this.selected().values()]);
  }

  protected toggleAll(): void {
    const rows = this.report()?.rows ?? [];
    const all = this.allSelected();
    this.selected.update((m) => { const n = new Map(m); for (const r of rows) all ? n.delete(this.rowKey(r)) : n.set(this.rowKey(r), r); return n; });
    this.selection.emit([...this.selected().values()]);
  }

  // ---- display helpers -----------------------------------------------------------------------

  protected numeric = (c: ReportColumn): boolean => isNumeric(c.type);
  protected str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
  protected tone = badgeTone;
  protected date = formatDateOnly;
  protected cell = formatCell;
  protected first = (): number => { const r = this.report(); return r ? (r.page - 1) * r.pageSize + 1 : 0; };
  protected last = (): number => { const r = this.report(); return r ? Math.min(r.total, (r.page - 1) * r.pageSize + r.rows.length) : 0; };

  protected metric(m: { value: string | number | boolean | null; type: string }, r: ReportDto): string {
    return formatCell(m.value, { key: '', label: '', type: m.type as ReportColumn['type'], unit: null, sortable: false }, r.currencyCode) || '-';
  }

  protected filterChips(r: ReportDto): { key: string; value: string }[] {
    return Object.entries(r.filters).filter(([k]) => k !== 'view' && k !== 'branch').map(([key, value]) => ({ key, value }));
  }

  /** Which branches the figures cover, in words: one branch by name, or all of the ones this person may see. */
  protected branchScope(r: ReportDto): string {
    const list = this.branches.branches();
    const one = r.filters['branch'];
    if (one) return list.find((b) => b.id === one)?.name ?? 'One branch';
    return list.length > 1 ? 'All my branches' : list[0]?.name ?? 'All branches';
  }

  protected toggleColumn(key: string): void {
    this.hidden.update((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  protected historyParams(id: string | number | boolean): Record<string, string> {
    const a = this.applied();
    return { itemId: String(id), ...(a.branchId ? { branchId: a.branchId } : {}) };
  }

  // ---- url -----------------------------------------------------------------------------------

  private pushUrl(q: ReportQuery): void {
    if (!this.syncUrl()) return;
    const params: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '') params[k] = v as string | number | boolean;
    void this.router.navigate([], { relativeTo: this.route, queryParams: params, replaceUrl: true });
  }

  private queryFromUrl(): ReportQuery {
    if (!this.syncUrl()) return {};
    const m = this.route.snapshot.queryParamMap;
    const q: Record<string, unknown> = {};
    for (const key of ['from', 'to', 'asOf', 'branchId', 'groupId', 'itemId', 'staffId', 'supplierId', 'search', 'status', 'type', 'buckets', 'sort', 'method', 'flag', 'minAmount', 'maxAmount']) { const v = m.get(key); if (v) q[key] = v; }
    for (const key of ['warningDays', 'page', 'pageSize']) { const v = m.get(key); if (v && !Number.isNaN(Number(v))) q[key] = Number(v); }
    for (const key of ['compare', 'desc']) if (m.get(key) === 'true') q[key] = true;
    return q as ReportQuery;
  }
}
