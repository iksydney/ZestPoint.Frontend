import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import {
  BillingEventDto, EntitlementStateDto, FeatureModuleDto, LedgerEntryDto, ModeName, NotificationDto, PlanDto, SubscriptionDto
} from '../../core/models/subscription.model';
import { TenantTimePipe } from '../../core/pipes/tenant-time.pipe';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { SubscriptionApi } from '../../core/services/subscription.services';
import { ConfirmService, ToastService } from '../../shared/ui/feedback';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';

const LEDGER_LABEL: Record<string, string> = {
  TrialStarted: 'Trial started', TrialEnded: 'Trial ended', FeatureActivated: 'Module activated', PlanUpgraded: 'Plan upgraded', PlanDowngraded: 'Plan downgraded',
  PlanDowngradeScheduled: 'Downgrade scheduled', WarningIssued: 'Reminder issued', GraceStarted: 'Grace period started', GraceExpired: 'Grace period ended',
  ModuleRestricted: 'Module restricted', PaymentReconciled: 'Payment reconciled', AccessRestored: 'Access restored', AdministrativeOverride: 'Platform override',
  SubscriptionCancelled: 'Cancellation', SubscriptionResumed: 'Resumed', RenewalFailed: 'Renewal failed', Renewed: 'Renewed', PeriodExtended: 'Period extended'
};

/**
 * Subscription, billing and access for the company: plan and status, what each module is doing and why, usage against the plan's limits,
 * payment method, plan changes, billing history and the entitlement ledger. Reachable while the workspace is restricted, so a company can
 * always pay its way out. Every figure comes from the server; nothing here decides what a company may do.
 */
@Component({
  selector: 'zp-subscription',
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe, FormsModule, StatusBadgeComponent, TenantTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-4"><h1 class="text-2xl font-bold">Subscription</h1><p class="mt-1 text-sm text-ink/80">Your plan, what it includes, and how to pay for it. Times are shown in your company's time zone.</p></div>
    @if (error()) { <p class="sys-alert sys-alert-danger mb-3" role="alert" data-testid="sub-error">{{ error() }}</p> }

    @if (sub(); as s) {
      <section class="app-card mb-4" aria-label="Current plan" data-testid="current-plan">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="text-xs font-medium uppercase tracking-wide text-ink/70">Current plan</p>
            <h2 class="text-xl font-bold" data-testid="plan-name">{{ s.plan.name }}</h2>
            <p class="text-sm text-ink/80">{{ s.plan.priceMinor / 100 | currency: s.plan.currencyCode }} per {{ s.plan.interval === 'Yearly' ? 'year' : 'month' }}</p>
          </div>
          <zp-status-badge [tone]="tone(s.status)"><span data-testid="sub-status">{{ statusLabel(s.status) }}</span></zp-status-badge>
        </div>
        <p class="mt-3 text-sm" data-testid="period-line">{{ periodLine(s) }}</p>
        @if (s.pendingPlan) { <p class="mt-1 text-sm" data-testid="pending-plan">Switching to <strong>{{ s.pendingPlan.name }}</strong> on {{ s.currentPeriodEndUtc | tenantTime: 'date' }}.</p> }
        @if (s.cancelAtPeriodEnd) { <p class="mt-1 text-sm">Set to end on {{ s.currentPeriodEndUtc | tenantTime: 'date' }}.</p> }

        @if (canManage()) {
          <div class="mt-4 flex flex-wrap gap-2">
            @if (s.status !== 'Active') { <button type="button" class="btn-primary" data-testid="pay-now" [disabled]="busy()" (click)="payNow()">{{ s.status === 'Trialing' ? 'Start paid plan now' : 'Pay now' }}</button> }
            @if (s.cancelAtPeriodEnd) { <button type="button" class="btn-outline" data-testid="resume" [disabled]="busy()" (click)="resume()">Keep my subscription</button> }
            @else if (s.status === 'Active' || s.status === 'Trialing' || s.status === 'PastDue') { <button type="button" class="btn-outline" data-testid="cancel-sub" [disabled]="busy()" (click)="cancel()">Cancel at the end of the period</button> }
          </div>
        }
      </section>

      <section id="payment" class="app-card mb-4" aria-label="Payment method">
        <h2 class="font-semibold">Payment method</h2>
        <!-- REAL MONEY FLOW COMES LATER (FND-027). Owner decision 2026-11-12: the development-billing wording is hidden for now. Four places on this
             screen: this caution note, the provider's own "Development test card" label (just below), the "Payment token" label, and the "Demo" tags in the
             billing history. Restore the commented originals when the real provider is connected. The saving, paying and billing behaviour is unchanged.
        <p class="mt-1 text-sm" data-testid="payment-method">{{ s.hasPaymentMethod ? s.paymentMethodLabel : 'No payment method saved.' }}</p>
        @if (s.billingIsDemo) {
          <p class="sys-alert sys-alert-warning mt-2" role="status" data-testid="billing-demo-note">Development billing adapter: no real money moves and no card details are handled. Use the token <code>tok_ok</code> for a method that works or <code>tok_fail</code> for one that always declines.</p>
        }
        -->
        <p class="mt-1 text-sm" data-testid="payment-method">{{ s.hasPaymentMethod ? (s.billingIsDemo ? 'Payment method saved.' : s.paymentMethodLabel) : 'No payment method saved.' }}</p>
        @if (canManage()) {
          <form class="mt-3 flex flex-wrap items-end gap-2" (submit)="$event.preventDefault(); saveMethod()">
            <!-- <div><label class="app-label" for="pm-token">{{ s.billingIsDemo ? 'Payment token' : 'Payment method' }}</label> (real money flow later, FND-027) -->
            <div><label class="app-label" for="pm-token">Payment method</label>
              <input id="pm-token" class="app-input w-64" data-testid="pm-token" autocomplete="off" [ngModel]="token()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="token.set($event)" /></div>
            <button type="submit" class="btn-outline" data-testid="pm-save" [disabled]="busy() || !token().trim()">Save payment method</button>
          </form>
        }
      </section>
    }

    @if (state(); as st) {
      <section class="mb-4 grid gap-4 lg:grid-cols-2">
        <div class="app-card" aria-label="Usage">
          <h2 class="font-semibold">Usage against your plan</h2>
          <ul class="mt-3 space-y-3" data-testid="usage">
            @for (l of st.limits; track l.kind) {
              <li>
                <div class="flex justify-between text-sm"><span>{{ limitLabel(l.kind) }}</span><span [class.text-danger]="l.exceeded">{{ l.used }} of {{ l.limit ?? 'unlimited' }}</span></div>
                @if (l.limit !== null) { <div class="mt-1 h-2 rounded-full bg-ink/10"><div class="h-2 rounded-full" [class]="l.exceeded ? 'bg-danger' : 'bg-primary'" [style.width.%]="percent(l.used, l.limit)"></div></div> }
              </li>
            }
          </ul>
        </div>
        <div class="app-card" aria-label="Modules">
          <h2 class="font-semibold">Modules</h2>
          <ul class="mt-3 divide-y divide-ink/10 text-sm" data-testid="modules">
            @for (m of st.modules; track m.key) {
              <li class="flex items-start justify-between gap-2 py-2" [attr.data-testid]="'module-' + m.key">
                <div class="min-w-0"><p class="font-medium">{{ m.name }}</p>
                  @if (!m.includedInPlan && m.mode === 'None') { <p class="text-xs text-ink/70" data-testid="module-upgrade">Not in your plan. {{ upgradeHint(m.key) }}</p> }
                  @if (m.source === 'Override') { <p class="text-xs text-ink/70">Set by the platform{{ m.validUntilUtc ? ' until ' : '' }}{{ m.validUntilUtc | tenantTime: 'date' }}. {{ m.reason }}</p> }
                  @if (m.includedInPlan && m.mode !== 'Full') { <p class="text-xs text-ink/70">{{ m.mode === 'ReadOnly' ? 'Read-only while your account is restricted.' : 'Locked while your account is restricted.' }}</p> }</div>
                <zp-status-badge [tone]="modeTone(m.mode)">{{ modeLabel(m.mode) }}</zp-status-badge>
              </li>
            }
          </ul>
        </div>
      </section>
    }

    <section id="plans" class="mb-6" aria-label="Plans">
      <h2 class="mb-2 text-lg font-semibold">Plans</h2>
      <div class="grid gap-3 md:grid-cols-3">
        @for (p of plans(); track p.id) {
          <article class="app-card flex flex-col" [class.ring-2]="p.code === sub()?.plan?.code" [class.ring-primary]="p.code === sub()?.plan?.code" [attr.data-testid]="'plan-' + p.code">
            <h3 class="text-lg font-bold">{{ p.name }}</h3>
            <p class="text-sm text-ink/80">{{ p.description }}</p>
            <p class="mt-2 text-2xl font-bold">{{ p.priceMinor / 100 | currency: p.currencyCode }}<span class="text-sm font-normal text-ink/70"> / {{ p.interval === 'Yearly' ? 'year' : 'month' }}</span></p>
            <ul class="mt-2 space-y-0.5 text-sm">
              <li>{{ p.maxBranches ?? 'Unlimited' }} branch(es)</li><li>{{ p.maxStaff ?? 'Unlimited' }} staff</li><li>{{ p.maxMonthlyOrders === null ? 'Unlimited' : (p.maxMonthlyOrders | number) }} orders a month</li>
            </ul>
            <ul class="mt-2 flex-1 space-y-0.5 text-sm">
              @for (f of p.features; track f.featureKey) { <li>&#10003; {{ moduleName(f.featureKey) }}</li> }
            </ul>
            @if (canManage()) {
              @if (p.code === sub()?.plan?.code && sub()?.status === 'Active' && !sub()?.pendingPlan) { <p class="mt-3 text-center text-sm font-semibold">Your plan</p> }
              @else { <button type="button" class="btn-primary mt-3" [attr.data-testid]="'choose-' + p.code" [disabled]="busy()" (click)="choose(p)">{{ actionLabel(p) }}</button> }
            }
          </article>
        }
      </div>
    </section>

    <section class="mb-6"><h2 class="mb-2 text-lg font-semibold">Billing history</h2>
      <div class="app-card overflow-x-auto p-0"><table class="app-table" data-testid="billing-table"><thead><tr><th>Date</th><th>Description</th><th class="text-right">Amount</th><th>Status</th></tr></thead>
        <tbody>@for (b of billing(); track b.id) { <tr><td class="whitespace-nowrap">{{ b.occurredAtUtc | tenantTime }}</td><td>{{ b.description }} <!-- @if (b.isDemo) { <zp-status-badge tone="warning">Demo</zp-status-badge> } (real money flow later, FND-027) -->@if (b.failureReason) { <span class="block text-xs text-danger">{{ b.failureReason }}</span> }</td>
          <td class="text-right">{{ b.amountMinor / 100 | currency: b.currencyCode }}</td><td><zp-status-badge [tone]="b.status === 'Paid' ? 'success' : b.status === 'Failed' ? 'danger' : 'primary'">{{ b.status }}</zp-status-badge></td></tr> }
          @empty { <tr><td colspan="4" class="py-6 text-center text-ink/70">No billing activity yet.</td></tr> }</tbody></table></div></section>

    <section class="mb-6"><h2 class="mb-2 text-lg font-semibold">Access history</h2>
      <p class="mb-2 text-sm text-ink/70">Every change to what your company can use, who or what caused it, and why.</p>
      <div class="app-card overflow-x-auto p-0"><table class="app-table" data-testid="ledger-table"><thead><tr><th>When</th><th>Event</th><th>Detail</th><th>By</th></tr></thead>
        <tbody>@for (e of ledger(); track e.id) { <tr><td class="whitespace-nowrap">{{ e.occurredAtUtc | tenantTime }}</td><td>{{ ledgerLabel(e) }}</td><td class="text-sm">{{ e.reason }}</td><td class="text-xs">{{ e.actorLabel }}</td></tr> }
          @empty { <tr><td colspan="4" class="py-6 text-center text-ink/70">Nothing yet.</td></tr> }</tbody></table></div></section>

    <section class="mb-6"><div class="mb-2 flex items-center justify-between"><h2 class="text-lg font-semibold">Notices</h2>
      @if (unread() > 0) { <button type="button" class="btn-ghost text-sm" (click)="markAll()">Mark all read</button> }</div>
      <ul class="space-y-2" data-testid="notices">@for (n of notices(); track n.id) {
        <li class="app-card" [class.opacity-60]="n.readAtUtc"><p class="font-medium">{{ n.title }}</p><p class="text-sm text-ink/80">{{ n.body }}</p><p class="text-xs text-ink/60">{{ n.dateCreated | tenantTime }}</p></li> }
        @empty { <li class="text-sm text-ink/70">No notices.</li> }</ul></section>
  `
})
export class SubscriptionComponent implements OnInit {
  private readonly api = inject(SubscriptionApi);
  private readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);

  protected readonly sub = signal<SubscriptionDto | null>(null);
  protected readonly state = signal<EntitlementStateDto | null>(null);
  protected readonly plans = signal<readonly PlanDto[]>([]);
  protected readonly modules = signal<readonly FeatureModuleDto[]>([]);
  protected readonly billing = signal<readonly BillingEventDto[]>([]);
  protected readonly ledger = signal<readonly LedgerEntryDto[]>([]);
  protected readonly notices = signal<readonly NotificationDto[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly token = signal('');

  protected readonly canManage = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.SUBSCRIPTIONS_MANAGE));
  protected readonly unread = computed(() => this.notices().filter((n) => !n.readAtUtc).length);

  ngOnInit(): void {
    void this.load();
    // Scroll to the section a banner button pointed at ("#payment", "#plans") once the page has content.
    const fragment = this.route.snapshot.fragment;
    if (fragment) setTimeout(() => document.getElementById(fragment)?.scrollIntoView({ behavior: 'smooth' }), 600);
  }

  private async load(): Promise<void> {
    try {
      const [sub, state, plans, modules, billing, ledger, notices] = await Promise.all([
        firstValueFrom(this.api.get()), firstValueFrom(this.api.state()), firstValueFrom(this.api.plans()), firstValueFrom(this.api.modules()),
        firstValueFrom(this.api.billing()), firstValueFrom(this.api.ledger()), firstValueFrom(this.api.notifications())
      ]);
      this.sub.set(sub);
      this.state.set(state);
      this.plans.set(plans);
      this.modules.set(modules);
      this.billing.set(billing.items);
      this.ledger.set(ledger.items);
      this.notices.set(notices);
    } catch (err) { this.error.set(toApiError(err).message); }
  }

  /** After any billing action the banner, nav and route guards must follow the new state, so the session snapshot is re-read. */
  private async refreshAll(): Promise<void> {
    await this.auth.reload();
    await this.load();
  }

  // ---- display helpers ----
  protected statusLabel(s: string): string {
    return ({ Trialing: 'Free trial', Active: 'Active', PastDue: 'Payment overdue', Restricted: 'Restricted', Cancelled: 'Ended' } as Record<string, string>)[s] ?? s;
  }

  protected tone(s: string): 'success' | 'warning' | 'danger' | 'primary' {
    return s === 'Active' ? 'success' : s === 'Trialing' ? 'primary' : s === 'PastDue' ? 'warning' : 'danger';
  }

  protected modeLabel(m: ModeName): string { return m === 'Full' ? 'Available' : m === 'ReadOnly' ? 'Read-only' : 'Locked'; }
  protected modeTone(m: ModeName): 'success' | 'warning' | 'danger' { return m === 'Full' ? 'success' : m === 'ReadOnly' ? 'warning' : 'danger'; }
  protected limitLabel(k: string): string { return ({ Branches: 'Active branches', Staff: 'Staff accounts', MonthlyOrders: 'Orders this month' } as Record<string, string>)[k] ?? k; }
  protected percent(used: number, limit: number): number { return Math.min(100, Math.round((used / Math.max(1, limit)) * 100)); }
  protected moduleName(key: string): string { return this.modules().find((m) => m.key === key)?.name ?? key; }
  protected ledgerLabel(e: LedgerEntryDto): string { return `${LEDGER_LABEL[e.type] ?? e.type}${e.featureKey ? ': ' + this.moduleName(e.featureKey) : ''}`; }

  protected periodLine(s: SubscriptionDto): string {
    const fmt = (d: string) => new Intl.DateTimeFormat('en-GB', { timeZone: this.auth.tenant()?.timeZoneId || 'UTC', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(d));
    switch (s.status) {
      case 'Trialing': return `Free trial until ${fmt(s.currentPeriodEndUtc)}.`;
      case 'Active': return s.cancelAtPeriodEnd ? `Ends on ${fmt(s.currentPeriodEndUtc)}.` : `Renews on ${fmt(s.currentPeriodEndUtc)}.`;
      case 'PastDue': return `Payment was due ${fmt(s.currentPeriodEndUtc)}. Full access continues until ${s.graceEndsAtUtc ? fmt(s.graceEndsAtUtc) : 'the grace period ends'}.`;
      case 'Restricted': return 'Payment is overdue and the grace period has ended. Nothing has been deleted.';
      default: return 'The subscription has ended. Nothing has been deleted.';
    }
  }

  protected upgradeHint(key: string): string {
    const current = this.sub()?.plan.code;
    const better = this.plans().filter((p) => p.code !== current && p.features.some((f) => f.featureKey === key)).map((p) => p.name);
    return better.length ? `Included in ${better.join(' and ')}.` : 'Ask us about adding it.';
  }

  protected actionLabel(p: PlanDto): string {
    const s = this.sub();
    if (!s) return 'Choose';
    if (s.status !== 'Active' && s.status !== 'Trialing') return `Subscribe to ${p.name}`;
    if (p.code === s.plan.code) return s.status === 'Trialing' ? 'Keep this plan' : 'Stay on this plan';
    return p.priceMinor > s.plan.priceMinor ? `Upgrade to ${p.name}` : `Switch to ${p.name}`;
  }

  // ---- actions ----
  private async act(run: () => Promise<unknown>, success: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await run();
      this.toast.success(success);
      await this.refreshAll();
    } catch (err) {
      this.error.set(toApiError(err).message);
      await this.refreshAll().catch(() => undefined);
    } finally { this.busy.set(false); }
  }

  protected async choose(p: PlanDto): Promise<void> {
    const s = this.sub();
    const paid = !!s && s.status !== 'Trialing' && p.priceMinor > 0;
    const ok = await this.confirm.ask({
      title: this.actionLabel(p),
      message: paid && p.priceMinor >= (s?.plan.priceMinor ?? 0)
        ? `${p.name} costs ${(p.priceMinor / 100).toFixed(2)} ${p.currencyCode} and starts now. It will be charged to your saved payment method.`
        : s?.status === 'Trialing' ? `You can try ${p.name} for the rest of your trial at no charge.` : `${p.name} will start at the end of your current period. Nothing is charged today.`,
      confirmLabel: 'Confirm'
    });
    if (ok) await this.act(() => firstValueFrom(this.api.changePlan(p.code)), `Plan: ${p.name}.`);
  }

  protected async saveMethod(): Promise<void> {
    const t = this.token().trim();
    if (!t) return;
    // Cleared only when it was accepted, and before the page re-reads its data, so a failed attempt keeps what was typed.
    await this.act(async () => { await firstValueFrom(this.api.setPaymentMethod(t)); this.token.set(''); }, 'Payment method saved.');
  }

  protected async payNow(): Promise<void> {
    await this.act(() => firstValueFrom(this.api.payNow()), 'Payment taken. Your access is up to date.');
  }

  protected async cancel(): Promise<void> {
    const ok = await this.confirm.ask({ title: 'Cancel the subscription?', message: 'It stays active until the end of the current period and then ends. Your records are kept and you can subscribe again at any time.', confirmLabel: 'Cancel at period end', danger: true });
    if (ok) await this.act(() => firstValueFrom(this.api.cancel()), 'Cancellation scheduled.');
  }

  protected async resume(): Promise<void> {
    await this.act(() => firstValueFrom(this.api.resume()), 'Your subscription will continue.');
  }

  protected async markAll(): Promise<void> {
    await firstValueFrom(this.api.markAllRead());
    this.notices.set(await firstValueFrom(this.api.notifications()));
  }
}
