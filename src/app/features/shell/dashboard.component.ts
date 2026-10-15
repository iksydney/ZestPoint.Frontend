import { CurrencyPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiEnvelope } from '../../core/models/api.model';
import { SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { APP_NAV, NavDefinition, permissionsOf } from '../../core/navigation/app-nav';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';

interface DashboardSummary {
  currencyCode: string;
  openTabs: number;
  openTabsValue: number;
  ordersToday: number | null;
  salesToday: number | null;
  lowStockItems: number | null;
  includesDemoPayments: boolean;
}

/**
 * Landing screen after sign-in. Every figure is read from the server (open bills, today's sales, low-stock items) and is withheld by the
 * server for people who may not see it; setup progress comes from the company's real onboarding state. Nothing here is sample data.
 */
@Component({
  selector: 'zp-dashboard',
  standalone: true,
  imports: [RouterLink, CurrencyPipe, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-2xl font-bold">Welcome, {{ firstName() }}</h1>
    <p class="mt-1 text-ink/80">{{ auth.tenant()?.name }}</p>
    @if (error()) { <p class="sys-alert sys-alert-danger mt-3" role="alert">{{ error() }}</p> }

    @if (summary(); as s) {
      <div class="mt-4 grid gap-3 sm:grid-cols-3" data-testid="dashboard-cards">
        @if (s.salesToday !== null) {
          <div class="app-card" data-testid="card-sales">
            <p class="text-xs font-medium uppercase tracking-wide text-ink/70">Sales today</p>
            <p class="mt-1 text-2xl font-bold" data-testid="sales-today">{{ s.salesToday | currency: s.currencyCode : 'symbol-narrow' : '1.2-2' }}</p>
            <p class="mt-1 text-xs text-ink/70">{{ s.ordersToday }} bill(s) closed @if (s.includesDemoPayments) { <span class="app-badge app-badge-warning">includes demo payments</span> }</p>
          </div>
        }
        <div class="app-card" data-testid="card-tabs">
          <p class="text-xs font-medium uppercase tracking-wide text-ink/70">Open tabs</p>
          <p class="mt-1 text-2xl font-bold" data-testid="open-tabs">{{ s.openTabs }}</p>
          <p class="mt-1 text-xs text-ink/70">{{ s.openTabsValue | currency: s.currencyCode : 'symbol-narrow' : '1.2-2' }} still to collect</p>
        </div>
        @if (s.lowStockItems !== null) {
          <div class="app-card" data-testid="card-stock">
            <p class="text-xs font-medium uppercase tracking-wide text-ink/70">Low-stock items</p>
            <p class="mt-1 text-2xl font-bold" data-testid="low-stock">{{ s.lowStockItems }}</p>
            <p class="mt-1 text-xs text-ink/70"><a routerLink="/app/inventory" class="underline">See stock</a></p>
          </div>
        }
      </div>
    }

    @if (quickAccess().length > 0) {
      <section class="mt-6" aria-labelledby="quick-heading" data-testid="quick-access">
        <h2 id="quick-heading" class="mb-2 text-sm font-semibold uppercase tracking-wide text-ink/70">Quick access</h2>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          @for (q of quickAccess(); track q.key) {
            <a class="app-card app-focus block transition hover:border-primary/60" [routerLink]="q.route" [attr.data-testid]="'quick-' + q.key"><span class="font-semibold">{{ q.label }}</span>
              @if (q.description) { <span class="mt-1 block text-xs text-ink/70">{{ q.description }}</span> }</a>
          }
        </div>
      </section>
    }

    @if (canSetUp() && !progress()?.isComplete) {
      <section class="app-card mt-6" aria-labelledby="setup-heading" data-testid="setup-checklist">
        <div class="flex items-center justify-between gap-2">
          <h2 id="setup-heading" class="font-bold">Finish setting up ({{ progress()?.percent }}%)</h2>
        </div>
        <ul class="mt-3 space-y-2">
          @for (s of progress()?.steps ?? []; track s.step) {
            <li class="flex items-center justify-between gap-3 text-sm" [attr.data-testid]="'step-' + s.step">
              <span>{{ s.completed ? 'Done:' : 'To do:' }} {{ label(s.step) }}</span>
              @if (s.completed) { <zp-status-badge tone="success">Complete</zp-status-badge> }
              @else { <a [routerLink]="route(s.step)" class="btn-primary text-sm">Open</a> }
            </li>
          }
        </ul>
      </section>
    }
  `
})
export class DashboardComponent implements OnInit {
  private readonly http = inject(HttpClient);
  protected readonly auth = inject(AuthService);
  protected readonly summary = signal<DashboardSummary | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly progress = this.auth.onboarding;
  protected readonly firstName = computed(() => (this.auth.membership()?.displayName ?? '').split(' ')[0] || 'there');
  /** Screens flagged for quick access in the navigation list, limited to what this person may open (permission and module). */
  protected readonly quickAccess = computed<NavDefinition[]>(() => APP_NAV.filter((n) => n.quickAccess && this.auth.hasAnyPermission(permissionsOf(n))
    && (!n.feature || this.auth.accessModeFor(n.feature) !== 'locked') && !this.auth.locked()));
  protected readonly canSetUp = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.SETTINGS_COMPANY_MANAGE));

  async ngOnInit(): Promise<void> {
    try {
      this.summary.set((await firstValueFrom(this.http.get<ApiEnvelope<DashboardSummary>>('/api/v1/reports/dashboard'))).result);
    } catch (err) { this.error.set(toApiError(err).message); }
  }

  protected label(step: string): string {
    return ({ Company: 'Company details', Branding: 'Brand your workspace', Staff: 'Invite staff and set roles', Subscription: 'Choose a plan and payment method' } as Record<string, string>)[step] ?? step;
  }

  protected route(step: string): string {
    return ({ Branding: '/onboarding', Staff: '/app/staff', Subscription: '/app/subscription' } as Record<string, string>)[step] ?? '/app/dashboard';
  }
}
