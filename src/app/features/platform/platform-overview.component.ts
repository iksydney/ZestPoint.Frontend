import { CurrencyPipe, DatePipe, KeyValuePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PlatformOverviewDto } from '../../core/models/subscription.model';
import { toApiError } from '../../core/services/api.util';
import { PlatformApi } from '../../core/services/subscription.services';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';

@Component({
  selector: 'zp-platform-overview',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, KeyValuePipe, RouterLink, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-2xl font-bold">Overview</h1>
    @if (error()) { <p class="sys-alert sys-alert-danger my-3" role="alert">{{ error() }}</p> }
    @if (o(); as v) {
      <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div class="app-card"><p class="text-xs uppercase tracking-wide text-ink/70">Companies</p><p class="text-2xl font-bold" data-testid="total-tenants">{{ v.totalTenants }}</p></div>
        @for (s of v.byStatus | keyvalue; track s.key) { <div class="app-card"><p class="text-xs uppercase tracking-wide text-ink/70">{{ s.key }}</p><p class="text-2xl font-bold">{{ s.value }}</p></div> }
        @for (m of v.mrrMinorByCurrency | keyvalue; track m.key) { <div class="app-card"><p class="text-xs uppercase tracking-wide text-ink/70">Monthly recurring ({{ m.key }})</p><p class="text-2xl font-bold">{{ m.value / 100 | currency: m.key }}</p></div> }
      </div>
      <h2 class="mb-2 mt-6 text-lg font-semibold">Needing attention</h2>
      <div class="app-card overflow-x-auto p-0"><table class="app-table" data-testid="attention"><thead><tr><th>Company</th><th>Plan</th><th>Status</th><th>Period ends</th></tr></thead>
        <tbody>@for (t of v.needingAttention; track t.id) { <tr><td><a class="font-medium underline" [routerLink]="['/platform/tenants', t.id]">{{ t.name }}</a></td><td>{{ t.planCode }}</td>
          <td><zp-status-badge [tone]="t.status === 'PastDue' ? 'warning' : 'danger'">{{ t.status }}</zp-status-badge></td><td>{{ t.currentPeriodEndUtc | date: 'mediumDate' : 'UTC' }}</td></tr> }
          @empty { <tr><td colspan="4" class="py-6 text-center text-ink/70">Every company is in good standing.</td></tr> }</tbody></table></div>
    }
  `
})
export class PlatformOverviewComponent implements OnInit {
  private readonly api = inject(PlatformApi);
  protected readonly o = signal<PlatformOverviewDto | null>(null);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try { this.o.set(await firstValueFrom(this.api.overview())); } catch (err) { this.error.set(toApiError(err).message); }
  }
}
