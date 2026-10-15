import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CRM_STAGES, CrmListItemDto, CrmStage, STAGE_LABEL } from '../../core/models/support.model';
import { toApiError } from '../../core/services/api.util';
import { PlatformSupportApi } from '../../core/services/support.services';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';

/** ZestPoint's own customer list: stage, owner, tags and follow-ups. Companies never see this. */
@Component({
  selector: 'zp-platform-customers',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-2xl font-bold">Customers</h1>
    <p class="text-sm text-ink/70">A company with no saved record shows the stage its subscription implies; saving a record fixes the stage.</p>
    <div class="my-3 flex flex-wrap items-end gap-3">
      <div><label class="app-label" for="c-search">Search</label><input id="c-search" type="search" class="app-input w-64" placeholder="Name, subdomain or email" data-testid="customer-search" [ngModel]="search()" (ngModelChange)="search.set($event)" (keydown.enter)="load()" /></div>
      <div><label class="app-label" for="c-stage">Stage</label>
        <select id="c-stage" class="app-input" data-testid="customer-stage" [ngModel]="stage()" (ngModelChange)="stage.set($event); load()"><option value="">Any</option>@for (s of stages; track s) { <option [value]="s">{{ stageLabel(s) }}</option> }</select></div>
      <label class="flex items-center gap-2 text-sm"><input type="checkbox" data-testid="customer-due" [ngModel]="due()" (ngModelChange)="due.set($event); load()" /> Follow-up due</label>
      <button type="button" class="btn-outline" data-testid="customer-find" (click)="load()">Find</button>
    </div>
    @if (error()) { <p class="sys-alert sys-alert-danger mb-3" role="alert">{{ error() }}</p> }
    <div class="app-card overflow-x-auto p-0"><table class="app-table" data-testid="customer-table"><thead><tr><th>Company</th><th>Stage</th><th>Owner</th><th>Tags</th><th>Open tickets</th><th>Follow-up</th></tr></thead>
      <tbody>@for (c of items(); track c.tenantId) {
        <tr [attr.data-testid]="'customer-' + c.slug"><td><a class="font-medium underline" [routerLink]="['/platform/customers', c.tenantId]">{{ c.name }}</a><span class="block text-xs text-ink/60">{{ c.slug }} &middot; {{ c.planCode }} {{ c.subscriptionStatus }}</span></td>
          <td><zp-status-badge [tone]="tone(c.stage)">{{ stageLabel(c.stage) }}</zp-status-badge></td><td>{{ c.ownerName ?? 'Nobody' }}</td>
          <td>@for (t of c.tags; track t) { <span class="app-badge app-badge-primary mr-1">{{ t }}</span> }</td><td>{{ c.openTickets }}</td>
          <td class="whitespace-nowrap">{{ c.nextFollowUpUtc ? (c.nextFollowUpUtc | date: 'mediumDate' : 'UTC') : '' }}</td></tr> }
        @empty { <tr><td colspan="6" class="py-8 text-center text-ink/70">{{ loading() ? 'Loading...' : 'No companies match.' }}</td></tr> }</tbody></table></div>
    <p class="mt-2 text-sm text-ink/70" data-testid="customer-total">{{ total() }} company(ies)</p>
  `
})
export class PlatformCustomersComponent implements OnInit {
  private readonly api = inject(PlatformSupportApi);
  protected readonly stages = CRM_STAGES;
  protected readonly items = signal<readonly CrmListItemDto[]>([]);
  protected readonly total = signal(0);
  protected readonly search = signal('');
  protected readonly stage = signal<CrmStage | ''>('');
  protected readonly due = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void { void this.load(); }

  protected stageLabel(s: CrmStage): string { return STAGE_LABEL[s]; }
  protected tone(s: CrmStage): 'success' | 'warning' | 'danger' | 'primary' { return s === 'Active' ? 'success' : s === 'AtRisk' ? 'warning' : s === 'Churned' ? 'danger' : 'primary'; }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const page = await firstValueFrom(this.api.customers({ search: this.search().trim() || undefined, stage: this.stage(), followUpDue: this.due() || undefined, pageSize: 100 }));
      this.items.set(page.items);
      this.total.set(page.total);
    } catch (err) { this.error.set(toApiError(err).message); } finally { this.loading.set(false); }
  }
}
