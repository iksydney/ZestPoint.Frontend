import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { RiskAlertDto, RiskAlertState, RiskOutcome, RiskOverviewDto, RiskRuleDto, RiskScoreDto } from '../../core/models/loss-prevention.model';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { BranchContextService } from '../../core/services/branch-context.service';
import { LossPreventionApi } from '../../core/services/loss-prevention.service';
import { SearchSelectComponent, SelectOption } from '../../shared/ui/search-select.component';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';

type Tab = 'overview' | 'alerts' | 'rules';
const PAGE = 25;

/**
 * Loss Prevention: unusual events the system found in what is already recorded, how they add up for each person and branch, the alerts one by one with their
 * review, and the rules behind them. It points; it never proves, and the screen says so. The server decides who may see what: the people being measured
 * have no access, a person never sees themselves here, and nobody can review an alert about themselves.
 */
@Component({
    selector: 'zp-loss-prevention',
    imports: [DatePipe, DecimalPipe, FormsModule, StatusBadgeComponent, SearchSelectComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="mb-3">
      <h1 class="text-2xl font-bold" data-testid="lp-title">Loss Prevention</h1>
      <p class="mt-1 max-w-3xl text-sm text-ink/80">Unusual things found in what is already recorded: voids, discounts, refunds, cash, receipts, stock, tips, prices and bills. Each is a pointer for you to look at, never proof of anything.</p>
    </div>

    <div class="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Loss prevention">
      <button type="button" role="tab" class="btn-outline px-3 py-1.5" [class.ring-2]="tab() === 'overview'" [attr.aria-selected]="tab() === 'overview'" data-testid="lp-tab-overview" (click)="show('overview')">Overview</button>
      <button type="button" role="tab" class="btn-outline px-3 py-1.5" [class.ring-2]="tab() === 'alerts'" [attr.aria-selected]="tab() === 'alerts'" data-testid="lp-tab-alerts" (click)="show('alerts')">Alerts@if (open() > 0) { <span class="app-badge app-badge-warning ml-2" data-testid="lp-open-count">{{ open() }}</span> }</button>
      <button type="button" role="tab" class="btn-outline px-3 py-1.5" [class.ring-2]="tab() === 'rules'" [attr.aria-selected]="tab() === 'rules'" data-testid="lp-tab-rules" (click)="show('rules')">Rules</button>
    </div>

    @if (error()) { <div class="sys-alert sys-alert-danger mb-3" role="alert" data-testid="lp-error">{{ error() }}</div> }

    @switch (tab()) {
      @case ('overview') {
        <form class="app-card mb-4 flex flex-wrap items-end gap-3" (submit)="$event.preventDefault(); loadOverview()" aria-label="Period">
          <div><label class="app-label" for="lp-from">From</label><input id="lp-from" type="date" class="app-input" data-testid="lp-from" [value]="from()" (input)="from.set($any($event.target).value)" /></div>
          <div><label class="app-label" for="lp-to">To</label><input id="lp-to" type="date" class="app-input" data-testid="lp-to" [value]="to()" (input)="to.set($any($event.target).value)" /></div>
          @if (branches.branches().length > 1) {
            <div><label class="app-label" for="lp-branch">Branch</label>
              <zp-search-select inputId="lp-branch" testId="lp-branch" emptyLabel="All my branches" noun="branch" placeholder="Search branches"
                                [options]="branchOptions()" [value]="branchId()" (valueChange)="branchId.set($event)" /></div>
          }
          <button type="submit" class="btn-primary" data-testid="lp-apply" [disabled]="loading()">Apply</button>
        </form>

        @if (overview(); as o) {
          <div class="mb-4 grid gap-3 sm:grid-cols-3" data-testid="lp-summary">
            <div class="app-card"><p class="text-xs font-medium uppercase tracking-wide text-ink/70">Waiting to be looked at</p><p class="mt-1 text-xl font-bold" data-testid="lp-open">{{ o.openAlerts }}</p></div>
            <div class="app-card"><p class="text-xs font-medium uppercase tracking-wide text-ink/70">Looked at</p><p class="mt-1 text-xl font-bold">{{ o.reviewedAlerts }}</p></div>
            <div class="app-card"><p class="text-xs font-medium uppercase tracking-wide text-ink/70">Period</p><p class="mt-1 text-sm">{{ o.from }} to {{ o.to }}</p></div>
          </div>

          <section class="app-card mb-4 p-0" aria-label="People" data-testid="lp-people">
            <h2 class="px-4 pt-3 text-base font-semibold">People</h2>
            <div class="overflow-x-auto"><table class="app-table"><caption class="sr-only">Score for each person</caption>
              <thead><tr><th>#</th><th>Who</th><th class="text-right">Points</th><th class="text-right">Events</th><th class="text-right">Per 100 bills</th><th>What it is made of</th><th></th></tr></thead>
              <tbody>
                @for (p of o.people; track p.id) { <tr [attr.data-testid]="'lp-person-' + p.name"><td>{{ p.rank }}</td><td class="font-medium">{{ p.name }}</td><td class="text-right font-data">{{ p.points }}</td><td class="text-right font-data">{{ p.events }}</td>
                  <td class="text-right font-data">{{ p.perHundredBills === null ? 'too few bills' : (p.perHundredBills | number: '1.0-1') }}</td><td class="text-sm">{{ p.why }}</td>
                  <td class="text-right"><button type="button" class="btn-ghost px-2 py-1 text-sm" [attr.data-testid]="'lp-look-' + p.name" (click)="lookAt(p)">Look at their alerts</button></td></tr> }
                @empty { <tr><td colspan="7" class="py-6 text-center text-ink/70" data-testid="lp-no-people">Nothing unusual found for anyone in this period.</td></tr> }
              </tbody></table></div>
          </section>

          @if (o.branches.length > 0) {
            <section class="app-card mb-4 p-0" aria-label="Branches" data-testid="lp-branches">
              <h2 class="px-4 pt-3 text-base font-semibold">Branches</h2>
              <div class="overflow-x-auto"><table class="app-table"><caption class="sr-only">Score for each branch</caption>
                <thead><tr><th>#</th><th>Branch</th><th class="text-right">Points</th><th class="text-right">Events</th><th class="text-right">Per 100 bills</th><th>What it is made of</th></tr></thead>
                <tbody>@for (b of o.branches; track b.id) { <tr><td>{{ b.rank }}</td><td class="font-medium">{{ b.name }}</td><td class="text-right font-data">{{ b.points }}</td><td class="text-right font-data">{{ b.events }}</td>
                  <td class="text-right font-data">{{ b.perHundredBills === null ? 'too few bills' : (b.perHundredBills | number: '1.0-1') }}</td><td class="text-sm">{{ b.why }}</td></tr> }</tbody></table></div>
            </section>
          }

          <ul class="m-0 list-disc space-y-1 pl-5 text-xs text-ink/70" data-testid="lp-notes">@for (n of o.notes; track n) { <li>{{ n }}</li> }</ul>
        }
      }

      @case ('alerts') {
        <form class="app-card mb-3 flex flex-wrap items-end gap-3" (submit)="$event.preventDefault(); loadAlerts(1)" aria-label="Filter alerts">
          <div><label class="app-label" for="lp-state">Show</label>
            <select id="lp-state" class="app-input" data-testid="lp-state" (change)="state.set($any($event.target).value)"><option value="Open" [selected]="state() === 'Open'">Waiting to be looked at</option><option value="Reviewed" [selected]="state() === 'Reviewed'">Looked at</option><option value="" [selected]="state() === ''">All</option></select></div>
          <div><label class="app-label" for="lp-rule">Rule</label>
            <select id="lp-rule" class="app-input" data-testid="lp-rule-filter" (change)="ruleKey.set($any($event.target).value)"><option value="">All rules</option>@for (r of rules(); track r.key) { <option [value]="r.key" [selected]="ruleKey() === r.key">{{ r.title }}</option> }</select></div>
          @if (personId()) { <span class="pb-2 text-sm">For {{ personName() }} <button type="button" class="btn-ghost px-2 py-0.5 text-xs" data-testid="lp-clear-person" (click)="clearPerson()">Show everyone</button></span> }
          <button type="submit" class="btn-primary" data-testid="lp-alerts-apply" [disabled]="loading()">Apply</button>
        </form>

        <div class="app-card p-0"><div class="overflow-x-auto"><table class="app-table" data-testid="lp-alerts-table"><caption class="sr-only">Alerts</caption>
          <thead><tr><th>When</th><th>Who</th><th>Where</th><th>What was found</th><th class="text-right">Weight</th><th>State</th><th></th></tr></thead>
          <tbody>
            @for (a of alerts(); track a.id) {
              <tr [attr.data-testid]="'lp-alert-' + a.ruleKey" [attr.data-state]="a.state">
                <td class="whitespace-nowrap text-sm">{{ a.occurredAtUtc | date: 'd MMM, HH:mm' }}</td>
                <td class="text-sm">{{ a.personName ?? 'No one named' }}</td>
                <td class="text-sm">{{ a.branchName ?? 'Whole company' }}</td>
                <td class="text-sm"><span class="font-semibold">{{ a.ruleTitle }}</span><span class="block max-w-md text-xs text-ink/80">{{ a.summary }}</span>@if (a.reviewNote) { <span class="block max-w-md text-xs text-ink/70">{{ a.reviewedByName }}: {{ a.reviewNote }}</span> }</td>
                <td class="text-right font-data">{{ a.weight }}</td>
                <td class="text-sm"><zp-status-badge [tone]="a.state === 'Open' ? 'warning' : 'success'">{{ a.state === 'Open' ? 'Waiting' : a.outcome === 'FollowedUp' ? 'Followed up' : 'No concern' }}</zp-status-badge></td>
                <td class="text-right">@if (a.state === 'Open' && canReview()) { <button type="button" class="btn-outline px-2 py-1 text-sm" [attr.data-testid]="'lp-review-' + a.ruleKey" (click)="startReview(a)">Review</button> }</td>
              </tr>
            } @empty { <tr><td colspan="7" class="py-8 text-center text-ink/70" data-testid="lp-no-alerts">{{ loading() ? 'Loading...' : 'No alerts here.' }}</td></tr> }
          </tbody></table></div></div>
        <div class="mt-3 flex items-center justify-between text-sm text-ink/80"><span data-testid="lp-count">{{ total() === 0 ? '' : total() + ' alert(s)' }}</span>
          <span class="flex gap-2"><button type="button" class="btn-outline px-2 py-1" [disabled]="page() <= 1 || loading()" (click)="loadAlerts(page() - 1)">Previous</button><button type="button" class="btn-outline px-2 py-1" [disabled]="page() * 25 >= total() || loading()" (click)="loadAlerts(page() + 1)">Next</button></span></div>

        @if (reviewing(); as r) {
          <section class="app-card mt-4" aria-label="Review" data-testid="lp-review-form">
            <h2 class="mb-1 text-base font-semibold">Review: {{ r.ruleTitle }}</h2>
            <p class="mb-3 text-sm text-ink/80">{{ r.summary }}</p>
            <div class="flex flex-wrap gap-4 text-sm">
              <label class="flex items-center gap-2"><input type="radio" name="outcome" data-testid="lp-outcome-NoConcern" [checked]="outcome() === 'NoConcern'" (change)="outcome.set('NoConcern')" /> No concern</label>
              <label class="flex items-center gap-2"><input type="radio" name="outcome" data-testid="lp-outcome-FollowedUp" [checked]="outcome() === 'FollowedUp'" (change)="outcome.set('FollowedUp')" /> Followed up</label>
            </div>
            <div class="mt-3"><label class="app-label" for="lp-note">{{ outcome() === 'FollowedUp' ? 'What was done' : 'A note (optional)' }}</label><textarea id="lp-note" rows="2" class="app-input" data-testid="lp-note" maxlength="500" [ngModel]="note()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="note.set($event)"></textarea></div>
            @if (reviewError()) { <p class="sys-alert sys-alert-danger mt-3" role="alert" data-testid="lp-review-error">{{ reviewError() }}</p> }
            <div class="mt-3 flex gap-2"><button type="button" class="btn-primary" data-testid="lp-review-save" [disabled]="saving()" (click)="saveReview()">Mark as reviewed</button><button type="button" class="btn-ghost" (click)="reviewing.set(null)">Cancel</button></div>
          </section>
        }
      }

      @case ('rules') {
        <div class="mb-3 flex flex-wrap items-center gap-3">
          <p class="max-w-2xl text-sm text-ink/80">Each rule looks at what is already recorded. Change the number it looks for, how much an event weighs, or switch it off. {{ canChangeRules() ? '' : 'You can read the rules but not change them.' }}</p>
          @if (canChangeRules()) { <button type="button" class="btn-outline" data-testid="lp-check-now" [disabled]="checking()" (click)="checkNow()">{{ checking() ? 'Looking...' : 'Look now' }}</button> }
        </div>
        @if (note2()) { <p class="sys-alert sys-alert-info mb-3" role="status" data-testid="lp-rules-note">{{ note2() }}</p> }
        <div class="app-card p-0"><div class="overflow-x-auto"><table class="app-table" data-testid="lp-rules-table"><caption class="sr-only">Rules</caption>
          <thead><tr><th>On</th><th>Rule</th><th>Looks for</th><th>Weight</th><th></th></tr></thead>
          <tbody>
            @for (r of rules(); track r.key) {
              <tr [attr.data-testid]="'lp-rule-' + r.key">
                <td><input type="checkbox" [attr.aria-label]="'Use ' + r.title" [checked]="r.enabled" [disabled]="!canChangeRules()" (change)="edit(r, { enabled: !r.enabled })" [attr.data-testid]="'lp-rule-on-' + r.key" /></td>
                <td class="text-sm"><span class="font-semibold">{{ r.title }}</span>@if (r.changed) { <span class="app-badge app-badge-primary ml-1">changed</span> }<span class="block max-w-md text-xs text-ink/70">{{ r.explanation }}</span></td>
                <td class="text-sm">@if (r.unit === 'any') { <span class="text-ink/70">any one</span> } @else { <input type="number" min="0" class="app-input w-24" [attr.aria-label]="'Number for ' + r.title" [value]="r.threshold" [disabled]="!canChangeRules()" (input)="edit(r, { threshold: +$any($event.target).value })" [attr.data-testid]="'lp-rule-number-' + r.key" /> <span class="text-xs text-ink/70">{{ unit(r.unit) }}</span> }</td>
                <td><input type="number" min="0" max="100" class="app-input w-20" [attr.aria-label]="'Weight of ' + r.title" [value]="r.weight" [disabled]="!canChangeRules()" (input)="edit(r, { weight: +$any($event.target).value })" [attr.data-testid]="'lp-rule-weight-' + r.key" /></td>
                <td class="text-right">@if (canChangeRules()) { <button type="button" class="btn-outline px-2 py-1 text-sm" [attr.data-testid]="'lp-rule-save-' + r.key" (click)="saveRule(r)">Save</button> }</td>
              </tr>
            }
          </tbody></table></div></div>
      }
    }
  `
})
export class LossPreventionComponent implements OnInit {
  private readonly api = inject(LossPreventionApi);
  private readonly auth = inject(AuthService);
  protected readonly branches = inject(BranchContextService);

  protected readonly tab = signal<Tab>('overview');
  protected readonly overview = signal<RiskOverviewDto | null>(null);
  protected readonly alerts = signal<readonly RiskAlertDto[]>([]);
  protected readonly rules = signal<readonly RiskRuleDto[]>([]);
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly branchId = signal('');
  protected readonly branchOptions = computed<readonly SelectOption[]>(() => this.branches.branches().map((b) => ({ value: b.id, label: b.name })));
  protected readonly state = signal<RiskAlertState | ''>('Open');
  protected readonly ruleKey = signal('');
  protected readonly personId = signal('');
  protected readonly personName = signal('');
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly open = signal(0);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly checking = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly reviewing = signal<RiskAlertDto | null>(null);
  protected readonly outcome = signal<RiskOutcome>('NoConcern');
  protected readonly note = signal('');
  protected readonly reviewError = signal<string | null>(null);
  protected readonly note2 = signal<string | null>(null);

  protected readonly canReview = computed(() => this.auth.hasPermission('lossprevention.review'));
  protected readonly canChangeRules = computed(() => this.auth.hasPermission('lossprevention.rules'));

  ngOnInit(): void {
    void this.loadOverview();
    void this.loadRules();
  }

  protected show(tab: Tab): void {
    this.tab.set(tab);
    this.error.set(null);
    if (tab === 'overview') void this.loadOverview();
    if (tab === 'alerts') void this.loadAlerts(1);
    // The rules are loaded once: reading them again could replace a number being typed with the old one.
    if (tab === 'rules' && this.rules().length === 0) void this.loadRules();
  }

  protected unit(u: string): string {
    return u === 'count' ? 'times' : u === 'percent' ? '%' : u === 'minutes' ? 'minutes' : u === 'hours' ? 'hours' : u === 'amount' ? 'in money' : '';
  }

  protected async loadOverview(): Promise<void> {
    this.loading.set(true);
    try {
      const o = await firstValueFrom(this.api.overview(this.from(), this.to(), this.branchId()));
      this.overview.set(o);
      this.open.set(o.openAlerts);
      this.error.set(null);
    } catch (err) { this.error.set(toApiError(err).message); }
    finally { this.loading.set(false); }
  }

  protected async loadAlerts(page: number): Promise<void> {
    this.loading.set(true);
    try {
      const r = await firstValueFrom(this.api.alerts({ state: this.state(), ruleKey: this.ruleKey(), membershipId: this.personId(), page, pageSize: PAGE }));
      this.alerts.set(r.items);
      this.total.set(r.total);
      this.page.set(r.page);
      this.error.set(null);
    } catch (err) { this.error.set(toApiError(err).message); }
    finally { this.loading.set(false); }
  }

  protected async loadRules(): Promise<void> {
    try { this.rules.set(await firstValueFrom(this.api.rules())); } catch (err) { this.error.set(toApiError(err).message); }
  }

  protected lookAt(p: RiskScoreDto): void {
    if (!p.id) return;
    this.personId.set(p.id);
    this.personName.set(p.name);
    this.state.set('');
    this.tab.set('alerts');
    void this.loadAlerts(1);
  }

  protected clearPerson(): void {
    this.personId.set('');
    this.personName.set('');
    void this.loadAlerts(1);
  }

  protected startReview(a: RiskAlertDto): void {
    this.reviewError.set(null);
    this.outcome.set('NoConcern');
    this.note.set('');
    this.reviewing.set(a);
  }

  protected async saveReview(): Promise<void> {
    const a = this.reviewing();
    if (!a) return;
    this.saving.set(true);
    try {
      await firstValueFrom(this.api.review(a.id, this.outcome(), this.note().trim() || null));
      this.reviewing.set(null);
      await Promise.all([this.loadAlerts(this.page()), this.loadOverview()]);
    } catch (err) { this.reviewError.set(toApiError(err).message); }
    finally { this.saving.set(false); }
  }

  protected edit(r: RiskRuleDto, patch: Partial<Pick<RiskRuleDto, 'enabled' | 'threshold' | 'weight'>>): void {
    this.rules.update((list) => list.map((x) => (x.key === r.key ? { ...x, ...patch } : x)));
  }

  protected async saveRule(r: RiskRuleDto): Promise<void> {
    const current = this.rules().find((x) => x.key === r.key) ?? r;
    try {
      const saved = await firstValueFrom(this.api.saveRule(r.key, { enabled: current.enabled, threshold: current.threshold, weight: current.weight }));
      this.rules.update((list) => list.map((x) => (x.key === saved.key ? saved : x)));
      this.note2.set(`Saved: ${saved.title}.`);
      this.error.set(null);
    } catch (err) { this.error.set(toApiError(err).message); }
  }

  protected async checkNow(): Promise<void> {
    this.checking.set(true);
    try {
      const n = await firstValueFrom(this.api.evaluate());
      this.note2.set(n === 0 ? 'Nothing new was found.' : `${n} new alert(s) were found. Look at them under Alerts.`);
      await this.loadOverview();
    } catch (err) { this.error.set(toApiError(err).message); }
    finally { this.checking.set(false); }
  }
}
