import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ModeName, PlanDto, PlatformTenantDetailDto } from '../../core/models/subscription.model';
import { toApiError } from '../../core/services/api.util';
import { PlatformApi, PlatformAuthService } from '../../core/services/subscription.services';
import { PLATFORM_PERMISSIONS } from '../../core/models/support.model';
import { DialogComponent, ToastService } from '../../shared/ui/feedback';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';

type Action = 'plan' | 'extend' | 'reconcile' | 'restrict' | 'override' | null;

/**
 * One company as the operator sees it: subscription, access per module, usage, billing and the full entitlement ledger, with the
 * administrative actions. Every action needs a written reason; the reason and the operator's name go to the company's ledger and audit log.
 */
@Component({
  selector: 'zp-platform-tenant-detail',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, FormsModule, RouterLink, DialogComponent, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/platform/tenants" class="text-sm underline">&larr; Companies</a>
    @if (error()) { <p class="sys-alert sys-alert-danger my-3" role="alert" data-testid="platform-detail-error">{{ error() }}</p> }

    @if (d(); as v) {
      <div class="mb-4 mt-2 flex flex-wrap items-start justify-between gap-3">
        <div><h1 class="text-2xl font-bold" data-testid="tenant-name">{{ v.tenant.name }}</h1>
          <p class="text-sm text-ink/70">{{ v.tenant.slug }} &middot; {{ v.tenant.enterpriseType }} &middot; {{ v.tenant.businessEmail }}</p>
          @if (platform.can(perms.CRM_VIEW)) { <p class="text-sm"><a class="underline" [routerLink]="['/platform/customers', v.tenant.id]" data-testid="open-customer">Customer record</a></p> }</div>
        @if (v.subscription) { <zp-status-badge [tone]="tone(v.subscription.status)"><span data-testid="detail-status">{{ v.subscription.status }}</span></zp-status-badge> }
      </div>

      @if (v.subscription; as s) {
        <section class="app-card mb-4" data-testid="detail-subscription">
          <div class="grid gap-3 sm:grid-cols-4">
            <div><p class="text-xs uppercase tracking-wide text-ink/70">Plan</p><p class="font-semibold" data-testid="detail-plan">{{ s.plan.name }}</p><p class="text-sm">{{ s.plan.priceMinor / 100 | currency: s.plan.currencyCode }}</p></div>
            <div><p class="text-xs uppercase tracking-wide text-ink/70">Period ends</p><p class="font-semibold">{{ s.currentPeriodEndUtc | date: 'medium' : 'UTC' }} UTC</p></div>
            <div><p class="text-xs uppercase tracking-wide text-ink/70">Payment method</p><p class="font-semibold">{{ s.hasPaymentMethod ? s.paymentMethodLabel : 'None' }}</p></div>
            <div><p class="text-xs uppercase tracking-wide text-ink/70">Usage</p><p class="text-sm">{{ v.branches }} branches, {{ v.staff }} staff, {{ v.ordersThisMonth }} orders this month</p></div>
          </div>
          @if (platform.can(perms.BILLING_MANAGE)) {
          <div class="mt-4 flex flex-wrap gap-2">
            <button type="button" class="btn-outline" data-testid="act-plan" (click)="open('plan')">Set plan</button>
            <button type="button" class="btn-outline" data-testid="act-extend" (click)="open('extend')">Extend period</button>
            <button type="button" class="btn-outline" data-testid="act-reconcile" [disabled]="s.status === 'Active'" (click)="open('reconcile')">Reconcile payment</button>
            <button type="button" class="btn-outline" data-testid="act-restrict" [disabled]="s.status === 'Restricted'" (click)="open('restrict')">Restrict</button>
          </div>
          } @else { <p class="mt-3 text-xs text-ink/60" data-testid="billing-readonly">Plan, period and restriction changes need an administrator.</p> }
        </section>
      }

      @if (v.entitlements; as e) {
        <section class="app-card mb-4"><h2 class="font-semibold">Modules</h2>
          <ul class="mt-2 divide-y divide-ink/10 text-sm" data-testid="detail-modules">
            @for (m of e.modules; track m.key) {
              <li class="flex flex-wrap items-center justify-between gap-2 py-2" [attr.data-testid]="'mod-' + m.key">
                <div><p class="font-medium">{{ m.name }}</p>@if (m.source === 'Override') { <p class="text-xs text-ink/70">Override by {{ m.reason }}</p> }</div>
                <div class="flex items-center gap-2"><zp-status-badge [tone]="m.mode === 'Full' ? 'success' : m.mode === 'ReadOnly' ? 'warning' : 'danger'">{{ m.mode }}</zp-status-badge>
                  @if (platform.can(perms.BILLING_MANAGE)) {
                    @if (m.source === 'Override') { <button type="button" class="btn-ghost px-2 py-0.5 text-xs" [attr.data-testid]="'clear-' + m.key" (click)="openOverride(m.key, true)">Clear override</button> }
                    <button type="button" class="btn-outline px-2 py-0.5 text-xs" [attr.data-testid]="'override-' + m.key" (click)="openOverride(m.key, false)">Override</button>
                  }</div>
              </li>
            }
          </ul></section>
      }

      <section class="mb-4"><h2 class="mb-2 text-lg font-semibold">Billing</h2>
        <div class="app-card overflow-x-auto p-0"><table class="app-table"><thead><tr><th>Date (UTC)</th><th>Description</th><th class="text-right">Amount</th><th>Status</th><th>Provider</th></tr></thead>
          <tbody>@for (b of v.billing; track b.id) { <tr><td class="whitespace-nowrap">{{ b.occurredAtUtc | date: 'medium' : 'UTC' }}</td><td>{{ b.description }}@if (b.failureReason) { <span class="block text-xs text-danger">{{ b.failureReason }}</span> }</td>
            <td class="text-right">{{ b.amountMinor / 100 | currency: b.currencyCode }}</td><td>{{ b.status }}</td><td>{{ b.provider }}{{ b.isDemo ? ' (demo)' : '' }}</td></tr> }
            @empty { <tr><td colspan="5" class="py-5 text-center text-ink/70">No billing activity.</td></tr> }</tbody></table></div></section>

      <section><h2 class="mb-2 text-lg font-semibold">Entitlement ledger</h2>
        <div class="app-card overflow-x-auto p-0"><table class="app-table" data-testid="detail-ledger"><thead><tr><th>When (UTC)</th><th>Event</th><th>Detail</th><th>By</th></tr></thead>
          <tbody>@for (l of v.ledger; track l.id) { <tr><td class="whitespace-nowrap">{{ l.occurredAtUtc | date: 'medium' : 'UTC' }}</td><td>{{ l.type }}{{ l.featureKey ? ': ' + l.featureKey : '' }}</td><td class="text-sm">{{ l.reason }}</td><td class="text-xs">{{ l.actorLabel }}</td></tr> }</tbody></table></div></section>
    } @else if (!error()) { <p class="mt-4 text-ink/70">Loading...</p> }

    <zp-dialog [open]="action() !== null" [title]="actionTitle()" (closed)="action.set(null)">
      <form class="space-y-3" (submit)="$event.preventDefault(); run()">
        @switch (action()) {
          @case ('plan') { <div><label class="app-label" for="a-plan">Plan</label><select id="a-plan" class="app-input" data-testid="action-plan" [ngModel]="planCode()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="planCode.set($event)">@for (p of plans(); track p.id) { <option [value]="p.code">{{ p.name }}</option> }</select>
            <p class="mt-1 text-xs text-ink/70">Assigning a plan puts the company in good standing. No payment is taken.</p></div> }
          @case ('extend') { <div><label class="app-label" for="a-days">Days to add</label><input id="a-days" type="number" min="1" max="365" class="app-input" data-testid="action-days" [ngModel]="days()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="days.set(+$event)" /></div> }
          @case ('override') {
            <div class="grid grid-cols-2 gap-3"><div><label class="app-label" for="a-mode">Access</label><select id="a-mode" class="app-input" data-testid="action-mode" [ngModel]="mode()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="mode.set($event)"><option value="Full">Full</option><option value="ReadOnly">Read-only</option><option value="None">None (withdraw)</option></select></div>
              <div><label class="app-label" for="a-until">Until (optional)</label><input id="a-until" type="date" class="app-input" data-testid="action-until" [ngModel]="until()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="until.set($event)" /></div></div>
            <p class="text-sm">Module: <strong>{{ overrideKey() }}</strong></p>
          }
        }
        <div><label class="app-label" for="a-reason">Reason (kept in the company's ledger)</label><input id="a-reason" class="app-input" data-testid="action-reason" [ngModel]="reason()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="reason.set($event)" /></div>
        @if (actionError()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="action-error">{{ actionError() }}</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="action.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="action-confirm" [disabled]="busy() || reason().trim().length < 3">{{ clearing() ? 'Remove override' : 'Apply' }}</button></div>
      </form>
    </zp-dialog>
  `
})
export class PlatformTenantDetailComponent implements OnInit {
  private readonly api = inject(PlatformApi);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  protected readonly platform = inject(PlatformAuthService);
  protected readonly perms = PLATFORM_PERMISSIONS;

  protected readonly d = signal<PlatformTenantDetailDto | null>(null);
  protected readonly plans = signal<readonly PlanDto[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly action = signal<Action>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly reason = signal('');
  protected readonly planCode = signal('');
  protected readonly days = signal(7);
  protected readonly mode = signal<ModeName>('Full');
  protected readonly until = signal('');
  protected readonly overrideKey = signal('');
  protected readonly clearing = signal(false);

  protected readonly actionTitle = computed(() => ({
    plan: 'Set plan', extend: 'Extend the period', reconcile: 'Reconcile a payment', restrict: 'Restrict the company', override: this.clearing() ? 'Remove module override' : 'Override a module', null: ''
  } as Record<string, string>)[String(this.action())]);

  private get id(): string { return this.route.snapshot.paramMap.get('id')!; }

  async ngOnInit(): Promise<void> {
    await this.load();
    try { this.plans.set(await firstValueFrom(this.api.plans())); } catch { /* the page works without the list */ }
  }

  protected tone(s: string): 'success' | 'warning' | 'danger' | 'primary' {
    return s === 'Active' ? 'success' : s === 'Trialing' ? 'primary' : s === 'PastDue' ? 'warning' : 'danger';
  }

  private async load(): Promise<void> {
    try { this.d.set(await firstValueFrom(this.api.tenant(this.id))); } catch (err) { this.error.set(toApiError(err).message); }
  }

  protected open(a: Exclude<Action, null | 'override'>): void {
    this.reason.set('');
    this.actionError.set(null);
    this.clearing.set(false);
    this.planCode.set(this.d()?.subscription?.plan.code ?? '');
    this.action.set(a);
  }

  protected openOverride(key: string, clear: boolean): void {
    this.reason.set('');
    this.actionError.set(null);
    this.overrideKey.set(key);
    this.clearing.set(clear);
    this.mode.set('Full');
    this.until.set('');
    this.action.set('override');
  }

  protected async run(): Promise<void> {
    const a = this.action();
    if (!a) return;
    this.busy.set(true);
    this.actionError.set(null);
    const id = this.id;
    const reason = this.reason().trim();
    try {
      switch (a) {
        case 'plan': await firstValueFrom(this.api.setPlan(id, this.planCode(), reason)); break;
        case 'extend': await firstValueFrom(this.api.extend(id, this.days(), reason)); break;
        case 'reconcile': await firstValueFrom(this.api.reconcile(id, reason)); break;
        case 'restrict': await firstValueFrom(this.api.restrict(id, reason)); break;
        case 'override':
          if (this.clearing()) await firstValueFrom(this.api.clearOverride(id, this.overrideKey(), reason));
          else await firstValueFrom(this.api.setOverride(id, this.overrideKey(), this.mode(), this.until() ? new Date(this.until() + 'T23:59:59Z').toISOString() : null, reason));
          break;
      }
      this.action.set(null);
      this.toast.success('Done. The change is in the company\'s ledger.');
      await this.load();
    } catch (err) {
      this.actionError.set(toApiError(err).message);
    } finally { this.busy.set(false); }
  }
}
