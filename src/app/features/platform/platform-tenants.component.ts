import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PlatformTenantListItemDto, SubscriptionStatus } from '../../core/models/subscription.model';
import { toApiError } from '../../core/services/api.util';
import { PlatformApi } from '../../core/services/subscription.services';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';

@Component({
  selector: 'zp-platform-tenants',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-2xl font-bold">Companies</h1>
    <div class="my-3 flex flex-wrap items-end gap-3">
      <div><label class="app-label" for="t-search">Search</label><input id="t-search" type="search" class="app-input w-64" placeholder="Name, subdomain or email" data-testid="tenant-search" [ngModel]="search()" (ngModelChange)="search.set($event)" (keydown.enter)="load()" /></div>
      <div><label class="app-label" for="t-status">Status</label>
        <select id="t-status" class="app-input" data-testid="tenant-status" [ngModel]="status()" (ngModelChange)="status.set($event); load()"><option value="">Any</option><option value="Trialing">Trial</option><option value="Active">Active</option><option value="PastDue">Past due</option><option value="Restricted">Restricted</option><option value="Cancelled">Cancelled</option></select></div>
      <button type="button" class="btn-outline" data-testid="tenant-find" (click)="load()">Find</button>
    </div>
    @if (error()) { <p class="sys-alert sys-alert-danger mb-3" role="alert">{{ error() }}</p> }
    <div class="app-card overflow-x-auto p-0"><table class="app-table" data-testid="tenant-table"><thead><tr><th>Company</th><th>Type</th><th>Plan</th><th>Status</th><th>Period ends</th><th>Joined</th></tr></thead>
      <tbody>@for (t of items(); track t.id) {
        <tr [attr.data-testid]="'tenant-' + t.slug"><td><a class="font-medium underline" [routerLink]="['/platform/tenants', t.id]">{{ t.name }}</a><span class="block text-xs text-ink/60">{{ t.slug }} &middot; {{ t.businessEmail }}</span></td>
          <td>{{ t.enterpriseType }}</td><td>{{ t.planCode }}</td>
          <td>@if (t.status) { <zp-status-badge [tone]="tone(t.status)">{{ t.status }}</zp-status-badge> }</td><td class="whitespace-nowrap">{{ t.currentPeriodEndUtc | date: 'mediumDate' : 'UTC' }}</td><td class="whitespace-nowrap">{{ t.dateCreated | date: 'mediumDate' : 'UTC' }}</td></tr> }
        @empty { <tr><td colspan="6" class="py-8 text-center text-ink/70">{{ loading() ? 'Loading...' : 'No companies match.' }}</td></tr> }</tbody></table></div>
    <p class="mt-2 text-sm text-ink/70" data-testid="tenant-total">{{ total() }} company(ies)</p>
  `
})
export class PlatformTenantsComponent implements OnInit {
  private readonly api = inject(PlatformApi);
  protected readonly items = signal<readonly PlatformTenantListItemDto[]>([]);
  protected readonly total = signal(0);
  protected readonly search = signal('');
  protected readonly status = signal<SubscriptionStatus | ''>('');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  protected tone(s: SubscriptionStatus): 'success' | 'warning' | 'danger' | 'primary' {
    return s === 'Active' ? 'success' : s === 'Trialing' ? 'primary' : s === 'PastDue' ? 'warning' : 'danger';
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const page = await firstValueFrom(this.api.tenants({ search: this.search().trim() || undefined, status: this.status() || undefined, pageSize: 100 }));
      this.items.set(page.items);
      this.total.set(page.total);
    } catch (err) { this.error.set(toApiError(err).message); } finally { this.loading.set(false); }
  }
}
