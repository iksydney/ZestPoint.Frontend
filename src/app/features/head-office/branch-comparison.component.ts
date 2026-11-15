import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BranchComparisonDto, ComparisonBucket, ComparisonMeasure, ComparisonUnit } from '../../core/models/head-office.model';
import { toApiError } from '../../core/services/api.util';
import { HeadOfficeApi } from '../../core/services/head-office.service';

/**
 * Colours for the series, in a fixed order (the data-viz palette, checked against both surfaces). A branch keeps its colour whatever else is
 * drawn: the colour follows the branch's place in the list of branches the person may see, not its rank. Text never wears these colours:
 * a coloured mark beside the name carries identity, and the table view is there for anyone who cannot tell them apart.
 */
const DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c', '#9085e9', '#e66767'] as const;
const LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'] as const;

const W = 760;
const H = 320;
const LEFT = 64;
const TOP = 16;
const BOTTOM = 34;
const MARKER_LIMIT = 45;

const MEASURES: readonly { value: ComparisonMeasure; label: string }[] = [
  { value: 'net_sales', label: 'Net sales' },
  { value: 'bills', label: 'Bills' },
  { value: 'average_bill', label: 'Average bill' },
  { value: 'void_rate', label: 'Void rate' },
  { value: 'discount_rate', label: 'Discount rate' },
  { value: 'cash_difference', label: 'Cash difference' },
  { value: 'top_items', label: 'Top items' }
];

interface Dot { x: number; y: number; value: number; index: number }
interface Series { id: string; name: string; color: string; paths: string[]; dots: Dot[]; endLabel: { x: number; y: number } | null }

const niceStep = (range: number, count: number): number => {
  const rough = (range || 1) / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const r = rough / magnitude;
  return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10) * magnitude;
};

/** Is the app's own panel dark? The theme sets --panel-rgb, so the series colours follow it. */
const panelIsDark = (): boolean => {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--panel-rgb').trim().split(/\s+/).map(Number);
    if (raw.length < 3 || raw.some((n) => Number.isNaN(n))) return true;
    return (0.2126 * raw[0]! + 0.7152 * raw[1]! + 0.0722 * raw[2]!) / 255 < 0.5;
  } catch { return true; }
};

/**
 * Branch Comparison (head office): one measure for the branches side by side over time, a ranking, and each branch's best sellers. The server does
 * all the adding up, applies the person's own branches before anything is counted, and refuses what they may not see; this only draws it.
 */
@Component({
  selector: 'zp-branch-comparison',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-3">
      <h1 class="text-2xl font-bold" data-testid="cmp-title">Branch Comparison</h1>
      <p class="mt-1 max-w-3xl text-sm text-ink/80">One measure for your branches side by side over time, who comes first, and what each branch sells most.</p>
    </div>

    <form class="app-card mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" (submit)="$event.preventDefault(); apply()" data-testid="cmp-filters" aria-label="Comparison filters">
      <div><label class="app-label" for="cmp-measure">Measure</label>
        <select id="cmp-measure" class="app-input" data-testid="cmp-measure" (change)="measure.set($any($event.target).value)">
          @for (m of measures; track m.value) { <option [value]="m.value" [selected]="measure() === m.value">{{ m.label }}</option> }
        </select></div>
      <div><label class="app-label" for="cmp-from">From</label><input id="cmp-from" type="date" class="app-input" data-testid="cmp-from" [value]="from()" (input)="from.set($any($event.target).value)" /></div>
      <div><label class="app-label" for="cmp-to">To</label><input id="cmp-to" type="date" class="app-input" data-testid="cmp-to" [value]="to()" (input)="to.set($any($event.target).value)" /></div>
      @if (measure() !== 'top_items') {
        <div><label class="app-label" for="cmp-bucket">Each point is a</label>
          <select id="cmp-bucket" class="app-input" data-testid="cmp-bucket" (change)="bucket.set($any($event.target).value)">
            <option value="auto" [selected]="bucket() === 'auto'">Chosen for the period</option>
            <option value="day" [selected]="bucket() === 'day'">Day</option>
            <option value="week" [selected]="bucket() === 'week'">Week</option>
            <option value="month" [selected]="bucket() === 'month'">Month</option>
          </select></div>
      }
      @if ((data()?.availableBranches?.length ?? 0) > 1) {
        <fieldset class="sm:col-span-2 lg:col-span-4" data-testid="cmp-branches">
          <legend class="app-label">Branches to draw <span class="font-normal text-ink/70">(none ticked: every branch you may see, the eight with the most sales if there are more; at most eight)</span></legend>
          <div class="flex flex-wrap gap-x-4 gap-y-1">
            @for (b of data()!.availableBranches; track b.id) {
              <label class="flex items-center gap-2 text-sm"><input type="checkbox" [attr.data-testid]="'cmp-branch-' + b.name" [checked]="picked().has(b.id)" (change)="togglePick(b.id)" />
                <span class="inline-block h-0.5 w-4 rounded" [style.background]="colorOf(b.id)" aria-hidden="true"></span> {{ b.name }}</label>
            }
          </div>
        </fieldset>
      }
      <div class="flex items-end gap-2">
        <button type="submit" class="btn-primary" data-testid="cmp-apply" [disabled]="loading()">Apply</button>
        <button type="button" class="btn-ghost" data-testid="cmp-reset" (click)="reset()">Reset</button>
      </div>
    </form>

    @if (error()) {
      <div class="sys-alert sys-alert-danger flex flex-wrap items-center justify-between gap-2" role="alert" data-testid="cmp-error">
        <span>{{ error() }}</span><button type="button" class="btn-outline px-2 py-1 text-sm" (click)="apply()">Try again</button></div>
    } @else if (loading() && !data()) {
      <p class="py-10 text-center text-ink/70" role="status" data-testid="cmp-loading">Loading the comparison...</p>
    }

    @if (data(); as d) {
      <p class="mb-2 text-xs text-ink/70" data-testid="cmp-applied">Period {{ d.from }} to {{ d.to }} ({{ d.timeZoneId }}) · {{ d.label }}@if (d.measure !== 'top_items') { · one point per {{ d.bucket }} } · {{ d.branches.length }} {{ d.branches.length === 1 ? 'branch' : 'branches' }} drawn</p>

      @if (d.branches.length === 0) {
        <p class="sys-alert sys-alert-info" role="status" data-testid="cmp-none">There are no branches to compare.</p>
      } @else {
        @if (d.measure !== 'top_items') {
          <section class="app-card mb-4" aria-label="Chart">
            <h2 class="mb-1 text-base font-semibold" data-testid="cmp-chart-title">{{ d.label }} by branch</h2>
            @if (d.branches.length > 1) {
              <ul class="mb-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-sm" data-testid="cmp-legend" aria-label="Legend">
                @for (s of chart().series; track s.id) {
                  <li class="flex items-center gap-2"><span class="inline-block h-0.5 w-5 rounded" [style.background]="s.color" aria-hidden="true"></span><span data-testid="cmp-legend-item">{{ s.name }}</span></li>
                }
              </ul>
            }
            <div class="relative">
              <svg #svg [attr.viewBox]="'0 0 ' + W + ' ' + H" class="block h-auto w-full touch-none select-none" role="img" tabindex="0" data-testid="cmp-chart"
                   [attr.aria-label]="d.label + ' by branch, ' + d.from + ' to ' + d.to + '. Use the arrow keys to move along it, or open the table below.'"
                   (pointermove)="onMove($event, svg)" (pointerleave)="hover.set(null)" (keydown)="onKey($event)" (blur)="hover.set(null)">
                @for (t of chart().yTicks; track t.value) {
                  <line [attr.x1]="LEFT" [attr.x2]="chart().right" [attr.y1]="t.y" [attr.y2]="t.y" stroke-width="1" style="stroke: rgb(var(--ink-rgb) / 0.12)" />
                  <text [attr.x]="LEFT - 8" [attr.y]="t.y + 4" text-anchor="end" font-size="11" style="fill: rgb(var(--ink-rgb) / 0.65)">{{ t.label }}</text>
                }
                @if (chart().zeroY !== null) { <line [attr.x1]="LEFT" [attr.x2]="chart().right" [attr.y1]="chart().zeroY" [attr.y2]="chart().zeroY" stroke-width="1" style="stroke: rgb(var(--ink-rgb) / 0.45)" /> }
                @for (t of chart().xTicks; track t.x) {
                  <text [attr.x]="t.x" [attr.y]="H - 12" text-anchor="middle" font-size="11" style="fill: rgb(var(--ink-rgb) / 0.65)">{{ t.label }}</text>
                }
                @if (hoverX() !== null) { <line [attr.x1]="hoverX()" [attr.x2]="hoverX()" [attr.y1]="TOP" [attr.y2]="H - BOTTOM" stroke-width="1" style="stroke: rgb(var(--ink-rgb) / 0.5)" /> }
                @for (s of chart().series; track s.id) {
                  <g [attr.data-testid]="'cmp-line-' + s.name">
                    @for (p of s.paths; track $index) { <path [attr.d]="p" fill="none" [attr.stroke]="s.color" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" /> }
                    @for (dot of s.dots; track dot.index) {
                      @if (showMarkers() || hover() === dot.index) { <circle [attr.cx]="dot.x" [attr.cy]="dot.y" r="4" [attr.fill]="s.color" stroke-width="2" style="stroke: rgb(var(--panel-rgb))" /> }
                    }
                    @if (s.endLabel; as e) { <text [attr.x]="e.x" [attr.y]="e.y + 4" font-size="11" style="fill: rgb(var(--ink-rgb) / 0.8)">{{ s.name }}</text> }
                  </g>
                }
              </svg>
              @if (hoverPoint(); as hp) {
                <div class="pointer-events-none absolute z-10 rounded-lg border border-ink/20 bg-panel px-3 py-2 text-xs shadow-lg" data-testid="cmp-tooltip"
                     [style.top.px]="8" [style.left]="hoverLeft() < 55 ? hoverLeft() + '%' : null" [style.right]="hoverLeft() >= 55 ? (100 - hoverLeft()) + '%' : null">
                  <p class="mb-1 font-semibold">{{ hp.label }}</p>
                  @for (s of chart().series; track s.id) {
                    <p class="flex items-center gap-2"><span class="inline-block h-0.5 w-3 rounded" [style.background]="s.color" aria-hidden="true"></span><span>{{ s.name }}</span><span class="ml-auto pl-3 font-data">{{ fmt(hp.values[s.id] ?? null, d.unit, d.currencyCode, true) }}</span></p>
                  }
                </div>
              }
            </div>
            <p class="sr-only" role="status" aria-live="polite">{{ hoverText() }}</p>
          </section>

          <details class="app-card mb-4 p-0" data-testid="cmp-table-details">
            <summary class="cursor-pointer px-4 py-3 text-sm font-semibold">Show as a table</summary>
            <div class="overflow-x-auto">
              <table class="app-table" data-testid="cmp-table">
                <caption class="sr-only">{{ d.label }} by branch and {{ d.bucket }}</caption>
                <thead><tr><th>{{ d.bucket === 'month' ? 'Month' : d.bucket === 'week' ? 'Week from' : 'Day' }}</th>@for (b of d.branches; track b.id) { <th class="text-right">{{ b.name }}</th> }</tr></thead>
                <tbody>
                  @for (p of d.points; track p.start) {
                    <tr><td>{{ p.label }}</td>@for (b of d.branches; track b.id) { <td class="text-right font-data" [attr.data-testid]="'cmp-cell-' + b.name + '-' + p.start">{{ fmt(p.values[b.id] ?? null, d.unit, d.currencyCode, true) }}</td> }</tr>
                  }
                </tbody>
              </table>
            </div>
          </details>
        }

        <section class="app-card mb-4" aria-label="Ranking" data-testid="cmp-ranking">
          <h2 class="mb-2 text-base font-semibold">{{ d.measure === 'top_items' ? 'Ranked by net sales' : 'Ranking' }}</h2>
          <ol class="m-0 flex list-none flex-col gap-2 p-0">
            @for (r of d.ranking; track r.branchId) {
              <li class="grid grid-cols-[2rem_minmax(6rem,12rem)_1fr_auto] items-center gap-3 text-sm" [attr.data-testid]="'cmp-rank-' + r.name">
                <span class="font-data text-ink/70">{{ r.rank }}</span>
                <span class="flex items-center gap-2 truncate"><span class="inline-block h-0.5 w-3 shrink-0 rounded" [style.background]="colorOf(r.branchId)" aria-hidden="true"></span><span class="truncate">{{ r.name }}</span></span>
                <span class="h-2 rounded bg-ink/10" aria-hidden="true"><span class="block h-2 rounded" [style.width.%]="barWidth(r.value)" [style.background]="colorOf(r.branchId)"></span></span>
                <span class="font-data">{{ fmt(r.value, d.measure === 'top_items' ? 'money' : d.unit, d.currencyCode, true) }}</span>
              </li>
            }
          </ol>
        </section>

        @if (d.measure === 'top_items') {
          <div class="mb-4 grid gap-3 md:grid-cols-2" data-testid="cmp-top-items">
            @for (t of d.topItems; track t.branchId) {
              <section class="app-card" [attr.data-testid]="'cmp-top-' + t.name" [attr.aria-label]="'Top items at ' + t.name">
                <h2 class="mb-2 flex items-center gap-2 text-base font-semibold"><span class="inline-block h-0.5 w-4 rounded" [style.background]="colorOf(t.branchId)" aria-hidden="true"></span> {{ t.name }}</h2>
                @if (t.items.length === 0) { <p class="text-sm text-ink/70">Nothing sold in this period.</p> } @else {
                  <table class="app-table">
                    <caption class="sr-only">Top items at {{ t.name }}</caption>
                    <thead><tr><th>Item</th><th class="text-right">Quantity</th><th class="text-right">Net sales</th></tr></thead>
                    <tbody>@for (i of t.items; track i.name) { <tr><td>{{ i.name }}</td><td class="text-right font-data">{{ fmt(i.quantity, 'number', d.currencyCode, true) }}</td><td class="text-right font-data">{{ fmt(i.net, 'money', d.currencyCode, true) }}</td></tr> }</tbody>
                  </table>
                }
              </section>
            }
          </div>
        }
      }

      @if (d.notes.length) {
        <ul class="m-0 list-disc space-y-1 pl-5 text-xs text-ink/70" data-testid="cmp-notes">@for (n of d.notes; track n) { <li>{{ n }}</li> }</ul>
      }
    }
  `
})
export class BranchComparisonComponent implements OnInit {
  private readonly api = inject(HeadOfficeApi);

  protected readonly W = W;
  protected readonly H = H;
  protected readonly LEFT = LEFT;
  protected readonly TOP = TOP;
  protected readonly BOTTOM = BOTTOM;
  protected readonly measures = MEASURES;

  protected readonly measure = signal<ComparisonMeasure>('net_sales');
  protected readonly bucket = signal<ComparisonBucket>('auto');
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly picked = signal<ReadonlySet<string>>(new Set());
  protected readonly data = signal<BranchComparisonDto | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly hover = signal<number | null>(null);
  private readonly dark = panelIsDark();

  ngOnInit(): void { void this.load(); }

  protected apply(): void { void this.load(); }

  protected reset(): void {
    this.measure.set('net_sales');
    this.bucket.set('auto');
    this.from.set('');
    this.to.set('');
    this.picked.set(new Set());
    void this.load();
  }

  protected togglePick(id: string): void {
    this.picked.update((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const d = await firstValueFrom(this.api.comparison({
        from: this.from() || undefined, to: this.to() || undefined, measure: this.measure(), bucket: this.bucket(), branches: [...this.picked()]
      }));
      this.data.set(d);
      this.from.set(d.from);
      this.to.set(d.to);
      this.hover.set(null);
    } catch (err) {
      this.error.set(toApiError(err).message);
    } finally {
      this.loading.set(false);
    }
  }

  // ---- colour: follows the branch, not its rank --------------------------------------------------------

  private readonly colors = computed(() => {
    const d = this.data();
    const palette = this.dark ? DARK : LIGHT;
    const map = new Map<string, string>();
    if (!d) return map;
    // With up to eight branches in all, each keeps its place in the list whatever is drawn. With more, the drawn ones take the colours in turn.
    const order = d.availableBranches.length <= palette.length ? d.availableBranches : d.branches;
    order.forEach((b, i) => map.set(b.id, palette[i % palette.length]!));
    return map;
  });

  protected colorOf(id: string): string { return this.colors().get(id) ?? (this.dark ? DARK : LIGHT)[0]; }

  // ---- the chart ---------------------------------------------------------------------------------------

  protected readonly chart = computed(() => {
    const d = this.data();
    const empty = { series: [] as Series[], yTicks: [] as { value: number; y: number; label: string }[], xTicks: [] as { x: number; label: string }[], zeroY: null as number | null, right: W - 16, plotLeft: LEFT, plotWidth: 0, xs: [] as number[] };
    if (!d || d.measure === 'top_items' || d.points.length === 0) return empty;

    const values = d.points.flatMap((p) => d.branches.map((b) => p.values[b.id])).filter((v): v is number => v !== null && v !== undefined);
    const min = Math.min(0, ...values);
    const max = Math.max(0, ...values);
    const step = niceStep(max - min, 4);
    const lo = Math.floor(min / step) * step;
    let hi = Math.ceil(max / step) * step;
    if (hi === lo) hi = lo + step;

    const labelled = d.branches.length <= 4;
    const right = W - (labelled ? 110 : 16);
    const plotWidth = right - LEFT;
    const plotHeight = H - TOP - BOTTOM;
    const n = d.points.length;
    const xs = d.points.map((_, i) => (n === 1 ? LEFT + plotWidth / 2 : LEFT + (plotWidth * i) / (n - 1)));
    const y = (v: number) => TOP + plotHeight * (1 - (v - lo) / (hi - lo));

    const yTicks: { value: number; y: number; label: string }[] = [];
    for (let v = lo; v <= hi + step / 2; v += step) yTicks.push({ value: Math.round(v * 1e6) / 1e6, y: y(v), label: this.axis(v, d.unit) });

    const every = Math.max(1, Math.ceil(n / 8));
    const xTicks = d.points.map((p, i) => ({ x: xs[i]!, label: p.label, i })).filter((t) => t.i % every === 0).map(({ x, label }) => ({ x, label }));

    const series: Series[] = d.branches.map((b) => {
      const paths: string[] = [];
      const dots: Dot[] = [];
      let current = '';
      d.points.forEach((p, i) => {
        const v = p.values[b.id];
        if (v === null || v === undefined) { if (current) paths.push(current); current = ''; return; }
        const px = xs[i]!, py = y(v);
        current += `${current ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`;
        dots.push({ x: px, y: py, value: v, index: i });
      });
      if (current) paths.push(current);
      const last = dots[dots.length - 1];
      return { id: b.id, name: b.name, color: this.colorOf(b.id), paths, dots, endLabel: labelled && last ? { x: last.x + 10, y: last.y } : null };
    });

    // End labels that would sit on top of each other are not drawn at all: the legend and the tooltip name the lines instead.
    const ys = series.filter((s) => s.endLabel).map((s) => s.endLabel!.y).sort((a, b) => a - b);
    if (ys.some((v, i) => i > 0 && v - ys[i - 1]! < 14)) for (const s of series) s.endLabel = null;

    return { series, yTicks, xTicks, zeroY: lo < 0 ? y(0) : null, right, plotLeft: LEFT, plotWidth, xs };
  });

  protected showMarkers(): boolean { return (this.data()?.points.length ?? 0) <= MARKER_LIMIT; }

  protected hoverX(): number | null {
    const i = this.hover();
    return i === null ? null : this.chart().xs[i] ?? null;
  }

  protected hoverLeft(): number { return ((this.hoverX() ?? 0) / W) * 100; }

  protected hoverPoint() {
    const i = this.hover();
    const d = this.data();
    return i === null || !d ? null : d.points[i] ?? null;
  }

  protected hoverText(): string {
    const p = this.hoverPoint();
    const d = this.data();
    if (!p || !d) return '';
    return `${p.label}: ` + d.branches.map((b) => `${b.name} ${this.fmt(p.values[b.id] ?? null, d.unit, d.currencyCode, true)}`).join(', ');
  }

  protected onMove(ev: PointerEvent, svg: Element): void {
    const c = this.chart();
    if (c.xs.length === 0) return;
    const box = svg.getBoundingClientRect();
    const x = ((ev.clientX - box.left) * W) / box.width;
    let best = 0;
    for (let i = 1; i < c.xs.length; i++) if (Math.abs(c.xs[i]! - x) < Math.abs(c.xs[best]! - x)) best = i;
    this.hover.set(best);
  }

  protected onKey(ev: KeyboardEvent): void {
    const n = this.chart().xs.length;
    if (n === 0) return;
    const at = this.hover();
    const next = ev.key === 'ArrowRight' ? Math.min(n - 1, (at ?? -1) + 1) : ev.key === 'ArrowLeft' ? Math.max(0, (at ?? n) - 1) : ev.key === 'Home' ? 0 : ev.key === 'End' ? n - 1 : null;
    if (ev.key === 'Escape') { this.hover.set(null); return; }
    if (next === null) return;
    ev.preventDefault();
    this.hover.set(next);
  }

  // ---- numbers -----------------------------------------------------------------------------------------

  protected barWidth(value: number | null): number {
    const r = this.data()?.ranking ?? [];
    const top = Math.max(0, ...r.map((x) => Math.abs(x.value ?? 0)));
    return value === null || top === 0 ? 0 : Math.max(2, (Math.abs(value) / top) * 100);
  }

  /** Axis ticks: in full under 10,000, compact beyond; one style per axis. */
  private axis(v: number, unit: ComparisonUnit): string {
    if (unit === 'percent') return `${Math.round(v * 10) / 10}%`;
    return Math.abs(v) < 10000 ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(v);
  }

  protected fmt(v: number | null, unit: ComparisonUnit, currency: string, full: boolean): string {
    if (v === null || v === undefined) return 'no data';
    if (unit === 'percent') return `${v.toFixed(1)}%`;
    if (unit === 'money') {
      try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: full ? 2 : 0, maximumFractionDigits: full ? 2 : 0 }).format(v); }
      catch { return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    }
    return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
}
