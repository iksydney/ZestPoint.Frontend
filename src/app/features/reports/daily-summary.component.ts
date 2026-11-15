import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { DailySummaryDto, DailySummaryHeadDto } from '../../core/models/daily-summary.model';
import { SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { BranchContextService } from '../../core/services/branch-context.service';
import { DailySummaryApi } from '../../core/services/daily-summary.service';
import { NoticesStore } from '../../core/services/notices.store';
import { TenantTimePipe } from '../../core/pipes/tenant-time.pipe';

/**
 * Daily Summary: yesterday and every earlier day, built once each morning and kept as built, for the company or one branch. The figures are the sales
 * reports' own (same formulas); the server decides which branches a person may read and refuses the rest.
 */
@Component({
  selector: 'zp-daily-summary',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, DecimalPipe, RouterLink, TenantTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold" data-testid="sum-title">Daily Summary</h1>
        <p class="mt-1 max-w-3xl text-sm text-ink/80">How each day went: sales, money, shifts, anything unusual, stock and what sold best. Built once each morning and kept as it was.</p>
      </div>
      @if (canSetUp()) { <a class="btn-outline" routerLink="/app/settings/daily-summary" data-testid="sum-setup-link">Set up who gets it</a> }
    </div>

    @if (branches.branches().length > 1) {
      <div class="mb-3 max-w-xs"><label class="app-label" for="sum-branch">Branch</label>
        <select id="sum-branch" class="app-input" data-testid="sum-branch" (change)="pick($any($event.target).value)">
          <option value="" [selected]="!branchId()">All branches</option>
          @for (b of branches.branches(); track b.id) { <option [value]="b.id" [selected]="branchId() === b.id">{{ b.name }}</option> }
        </select></div>
    }

    @if (error()) { <div class="sys-alert sys-alert-danger mb-3" role="alert" data-testid="sum-error">{{ error() }}</div> }

    @if (!loading() && days().length === 0 && !error()) {
      <p class="sys-alert sys-alert-info" role="status" data-testid="sum-empty">No day has been summarised yet. The summary is built each morning once it is switched on in its set-up.</p>
    }

    <div class="grid gap-4 lg:grid-cols-[18rem_1fr]">
      @if (days().length > 0) {
        <nav class="app-card h-fit p-0" aria-label="Days" data-testid="sum-days">
          <ul class="m-0 list-none p-0">
            @for (d of days(); track d.date) {
              <li><button type="button" class="block w-full border-b border-ink/10 px-3 py-2 text-left hover:bg-ink/5" [class.bg-primary]="d.date === date()" [class.bg-opacity-10]="d.date === date()" [attr.data-testid]="'sum-day-' + d.date" [attr.aria-current]="d.date === date() ? 'date' : null" (click)="open(d.date)">
                <span class="flex items-baseline justify-between gap-2"><span class="text-sm font-semibold">{{ d.date | date: 'EEE d MMM' }}</span><span class="font-data text-sm">{{ d.net | number: '1.0-0' }}</span></span>
                <span class="block text-xs text-ink/70">{{ d.bills }} bills@if (d.changePercent !== null) { , {{ d.changePercent > 0 ? '+' : '' }}{{ d.changePercent }}% on last week }@if (d.voids) { , {{ d.voids }} void(s) }</span>
              </button></li>
            }
          </ul>
        </nav>
      }

      @if (summary(); as s) {
        @if (s.content; as c) {
        <div class="flex flex-col gap-3" data-testid="sum-detail">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-lg font-bold">{{ c.date | date: 'EEEE d MMMM yyyy' }}@if (c.branchName) { <span class="font-normal text-ink/70"> · {{ c.branchName }}</span> }</h2>
            <span class="flex items-center gap-2"><span class="text-xs text-ink/60">Built {{ s.builtAtUtc | tenantTime }}</span>
              <button type="button" class="btn-outline px-2 py-1 text-sm" data-testid="sum-send-me" [disabled]="sending()" (click)="sendToMe()">{{ sending() ? 'Sending...' : 'Send this day to me' }}</button></span>
          </div>
          @if (sentNote()) { <p class="sys-alert sys-alert-info" role="status" data-testid="sum-sent">{{ sentNote() }}</p> }

          <section class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Sales" data-testid="sum-sales">
            <div class="app-card"><p class="text-xs font-medium uppercase tracking-wide text-ink/70">Net sales</p><p class="mt-1 text-xl font-bold">{{ c.sales.net | currency: c.currencyCode : 'symbol-narrow' : '1.2-2' }}</p>
              @if (c.sales.changePercent !== null) { <p class="text-xs text-ink/70">{{ c.sales.changePercent > 0 ? 'Up' : c.sales.changePercent < 0 ? 'Down' : 'Level' }} {{ (c.sales.changePercent < 0 ? -c.sales.changePercent : c.sales.changePercent) }}% on the same day last week ({{ c.sales.sameDayLastWeekNet | currency: c.currencyCode : 'symbol-narrow' : '1.2-2' }})</p> }
              @else { <p class="text-xs text-ink/70">Nothing last week to compare with.</p> }</div>
            <div class="app-card"><p class="text-xs font-medium uppercase tracking-wide text-ink/70">Bills</p><p class="mt-1 text-xl font-bold">{{ c.sales.bills | number }}</p></div>
            <div class="app-card"><p class="text-xs font-medium uppercase tracking-wide text-ink/70">Average bill</p><p class="mt-1 text-xl font-bold">{{ c.sales.average | currency: c.currencyCode : 'symbol-narrow' : '1.2-2' }}</p></div>
            <div class="app-card"><p class="text-xs font-medium uppercase tracking-wide text-ink/70">Cash difference</p><p class="mt-1 text-xl font-bold" [class.text-danger]="c.shifts.cashDifference < 0">{{ c.shifts.cashDifference | currency: c.currencyCode : 'symbol-narrow' : '1.2-2' }}</p><p class="text-xs text-ink/70">Counted minus expected, of the shifts closed.</p></div>
          </section>

          <section class="app-card" aria-label="Money" data-testid="sum-money">
            <h3 class="mb-2 text-base font-semibold">Money taken</h3>
            <dl class="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              <div class="flex justify-between"><dt>Cash</dt><dd class="font-data">{{ c.money.cash | currency: c.currencyCode : 'symbol-narrow' : '1.2-2' }}</dd></div>
              <div class="flex justify-between"><dt>Card</dt><dd class="font-data">{{ c.money.card | currency: c.currencyCode : 'symbol-narrow' : '1.2-2' }}</dd></div>
              <div class="flex justify-between"><dt>Transfer</dt><dd class="font-data">{{ c.money.transfer | currency: c.currencyCode : 'symbol-narrow' : '1.2-2' }}</dd></div>
              @if (c.money.other) { <div class="flex justify-between"><dt>Other</dt><dd class="font-data">{{ c.money.other | currency: c.currencyCode : 'symbol-narrow' : '1.2-2' }}</dd></div> }
              <div class="flex justify-between"><dt>Tips</dt><dd class="font-data">{{ c.money.tips | currency: c.currencyCode : 'symbol-narrow' : '1.2-2' }}</dd></div>
              <div class="flex justify-between"><dt>Refunds</dt><dd class="font-data">{{ c.money.refunds | currency: c.currencyCode : 'symbol-narrow' : '1.2-2' }}</dd></div>
            </dl>
          </section>

          <section class="app-card" aria-label="Shifts" data-testid="sum-shifts">
            <h3 class="mb-2 text-base font-semibold">Shifts</h3>
            <p class="text-sm">{{ c.shifts.opened }} opened, {{ c.shifts.closed }} closed, <strong>{{ c.shifts.stillOpen }}</strong> still open, <strong>{{ c.shifts.ranLong }}</strong> ran longer than 12 hours.</p>
            @if (c.shifts.lines.length) {
              <div class="mt-2 overflow-x-auto"><table class="app-table"><caption class="sr-only">Shifts</caption>
                <thead><tr><th>Who</th><th>Branch</th><th>Opened</th><th>Closed</th><th class="text-right">Difference</th></tr></thead>
                <tbody>@for (l of c.shifts.lines; track $index) { <tr><td>{{ l.who }}@if (l.ranLong) { <span class="app-badge app-badge-warning ml-1">long</span> }</td><td>{{ l.branch }}</td><td>{{ l.openedAtUtc | tenantTime }}</td><td>{{ l.closedAtUtc ? (l.closedAtUtc | tenantTime) : 'still open' }}</td>
                  <td class="text-right font-data" [class.text-danger]="(l.difference ?? 0) < 0">{{ l.difference === null ? '' : (l.difference | currency: c.currencyCode : 'symbol-narrow' : '1.2-2') }}</td></tr> }</tbody></table></div>
            }
          </section>

          <div class="grid gap-3 md:grid-cols-2">
            <section class="app-card" aria-label="Exceptions" data-testid="sum-exceptions">
              <h3 class="mb-2 text-base font-semibold">Anything unusual</h3>
              <dl class="grid gap-y-1 text-sm">
                <div class="flex justify-between"><dt>Voids</dt><dd class="font-data">{{ c.exceptions.voids }} worth {{ c.exceptions.voidedValue | currency: c.currencyCode : 'symbol-narrow' : '1.2-2' }}</dd></div>
                <div class="flex justify-between"><dt>Discounts given</dt><dd class="font-data">{{ c.exceptions.discounts | currency: c.currencyCode : 'symbol-narrow' : '1.2-2' }}</dd></div>
                @if (c.exceptions.paymentUnlocks !== null) { <div class="flex justify-between"><dt>Payments unlocked before the bar was ready</dt><dd class="font-data">{{ c.exceptions.paymentUnlocks }}</dd></div> }
                @if (c.exceptions.receiptsReprinted !== null) { <div class="flex justify-between"><dt>Receipts printed again</dt><dd class="font-data">{{ c.exceptions.receiptsReprinted }}</dd></div> }
              </dl>
            </section>
            <section class="app-card" aria-label="Stock" data-testid="sum-stock">
              <h3 class="mb-2 text-base font-semibold">Stock</h3>
              <dl class="grid gap-y-1 text-sm">
                <div class="flex justify-between"><dt>Items low now</dt><dd class="font-data">{{ c.stock.lowItems }}</dd></div>
                <div class="flex justify-between"><dt>Corrections</dt><dd class="font-data">{{ c.stock.corrections }}</dd></div>
                <div class="flex justify-between"><dt>Waste, spillage and breakage</dt><dd class="font-data">{{ c.stock.losses }}</dd></div>
                <div class="flex justify-between"><dt>Delivery lines received</dt><dd class="font-data">{{ c.stock.deliveries }}</dd></div>
              </dl>
            </section>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <section class="app-card" aria-label="Top items" data-testid="sum-top-items">
              <h3 class="mb-2 text-base font-semibold">Top items</h3>
              @if (c.topItems.length === 0) { <p class="text-sm text-ink/70">Nothing sold.</p> } @else {
                <table class="app-table"><caption class="sr-only">Top items</caption><thead><tr><th>Item</th><th class="text-right">Quantity</th><th class="text-right">Net sales</th></tr></thead>
                  <tbody>@for (t of c.topItems; track t.name) { <tr><td>{{ t.name }}</td><td class="text-right font-data">{{ t.quantity | number: '1.0-2' }}</td><td class="text-right font-data">{{ t.net | currency: c.currencyCode : 'symbol-narrow' : '1.2-2' }}</td></tr> }</tbody></table>
              }
            </section>
            <section class="app-card" aria-label="Top groups" data-testid="sum-top-groups">
              <h3 class="mb-2 text-base font-semibold">Top stock groups</h3>
              @if (c.topGroups.length === 0) { <p class="text-sm text-ink/70">Nothing sold.</p> } @else {
                <table class="app-table"><caption class="sr-only">Top groups</caption><thead><tr><th>Group</th><th class="text-right">Net sales</th></tr></thead>
                  <tbody>@for (t of c.topGroups; track t.name) { <tr><td>{{ t.name }}</td><td class="text-right font-data">{{ t.net | currency: c.currencyCode : 'symbol-narrow' : '1.2-2' }}</td></tr> }</tbody></table>
              }
            </section>
          </div>

          <ul class="m-0 list-disc space-y-1 pl-5 text-xs text-ink/70" data-testid="sum-notes">@for (n of c.notes; track n) { <li>{{ n }}</li> }</ul>
        </div>
        }
      }
    </div>
  `
})
export class DailySummaryComponent implements OnInit {
  private readonly api = inject(DailySummaryApi);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly notices = inject(NoticesStore);
  protected readonly branches = inject(BranchContextService);

  protected readonly branchId = signal<string | null>(null);
  protected readonly days = signal<readonly DailySummaryHeadDto[]>([]);
  protected readonly date = signal<string | null>(null);
  protected readonly summary = signal<DailySummaryDto | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly sending = signal(false);
  protected readonly sentNote = signal<string | null>(null);

  protected readonly canSetUp = computed(() => this.auth.hasPermission('settings.daily_summary.manage'));

  ngOnInit(): void { void this.load(this.route.snapshot.queryParamMap.get('date')); }

  protected async pick(id: string): Promise<void> {
    this.branchId.set(id || null);
    this.summary.set(null);
    await this.load(this.date());
  }

  protected async open(date: string): Promise<void> {
    this.date.set(date);
    this.sentNote.set(null);
    try {
      this.summary.set(await firstValueFrom(this.api.get(date, this.branchId())));
      this.error.set(null);
    } catch (err) {
      this.summary.set(null);
      this.error.set(toApiError(err).message);
    }
  }

  private async load(wanted: string | null): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      let list: DailySummaryHeadDto[];
      try { list = await firstValueFrom(this.api.list(this.branchId())); }
      catch (err) {
        // Someone with some branches (not all) has to choose one: offer the first of theirs.
        const first = this.branches.branches()[0];
        if (toApiError(err).status === 400 && first && !this.branchId()) { this.branchId.set(first.id); list = await firstValueFrom(this.api.list(first.id)); }
        else throw err;
      }
      this.days.set(list);
      const pick = wanted && list.some((d) => d.date === wanted) ? wanted : list[0]?.date ?? null;
      if (pick) await this.open(pick); else { this.date.set(null); this.summary.set(null); }
    } catch (err) {
      this.error.set(toApiError(err).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected async sendToMe(): Promise<void> {
    const d = this.date();
    if (!d) return;
    this.sending.set(true);
    try {
      const sent = await firstValueFrom(this.api.sendToMe(d));
      const failed = sent.find((m) => m.status === 'Failed');
      this.sentNote.set(failed ? `Sent in the app. By e-mail it could not go: ${failed.error ?? 'see the Messages screen'}.` : 'Sent: look in the notices bell, and in your e-mail.');
      void this.notices.refresh();
    } catch (err) {
      this.sentNote.set(toApiError(err).message);
    } finally {
      this.sending.set(false);
    }
  }
}
