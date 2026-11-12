import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AccessCatalogModuleDto, BulkAccessOperation, BulkAccessResultDto, MAX_APPLICATION_GRANT_DAYS } from '../../core/models/access.model';
import { PlatformTenantListItemDto, SubscriptionStatus } from '../../core/models/subscription.model';
import { PLATFORM_PERMISSIONS } from '../../core/models/support.model';
import { toApiError } from '../../core/services/api.util';
import { PlatformApi, PlatformAuthService } from '../../core/services/subscription.services';
import { DialogComponent } from '../../shared/ui/feedback';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';

const dayKey = (d: Date): string => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * 86_400_000);

@Component({
  selector: 'zp-platform-tenants',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, DialogComponent, StatusBadgeComponent],
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

    @if (canBulk() && selected().size > 0) {
      <div class="sys-alert sys-alert-info mb-3 flex flex-wrap items-center justify-between gap-2" role="status" data-testid="bulk-bar">
        <span><strong>{{ selected().size }}</strong> company(ies) selected</span>
        <span class="flex gap-2"><button type="button" class="btn-primary px-3 py-1" data-testid="bulk-open" (click)="openBulk()">Change access...</button>
          <button type="button" class="btn-ghost px-3 py-1" (click)="selected.set(empty)">Clear</button></span>
      </div>
    }

    <div class="app-card overflow-x-auto p-0"><table class="app-table" data-testid="tenant-table"><thead><tr>
      @if (canBulk()) { <th class="w-8"><input type="checkbox" aria-label="Select all companies shown" data-testid="select-all" [checked]="allSelected()" (change)="toggleAll()" /></th> }
      <th>Company</th><th>Type</th><th>Plan</th><th>Status</th><th>Period ends</th><th>Joined</th></tr></thead>
      <tbody>@for (t of items(); track t.id) {
        <tr [attr.data-testid]="'tenant-' + t.slug">
          @if (canBulk()) { <td><input type="checkbox" [attr.aria-label]="'Select ' + t.name" [attr.data-testid]="'select-' + t.slug" [checked]="selected().has(t.id)" (change)="toggle(t.id)" /></td> }
          <td><a class="font-medium underline" [routerLink]="['/platform/tenants', t.id]">{{ t.name }}</a><span class="block text-xs text-ink/60">{{ t.slug }} &middot; {{ t.businessEmail }}</span></td>
          <td>{{ t.enterpriseType }}</td><td>{{ t.planCode }}</td>
          <td>@if (t.status) { <zp-status-badge [tone]="tone(t.status)">{{ t.status }}</zp-status-badge> }</td><td class="whitespace-nowrap">{{ t.currentPeriodEndUtc | date: 'mediumDate' : 'UTC' }}</td><td class="whitespace-nowrap">{{ t.dateCreated | date: 'mediumDate' : 'UTC' }}</td></tr> }
        @empty { <tr><td [attr.colspan]="canBulk() ? 7 : 6" class="py-8 text-center text-ink/70">{{ loading() ? 'Loading...' : 'No companies match.' }}</td></tr> }</tbody></table></div>
    <p class="mt-2 text-sm text-ink/70" data-testid="tenant-total">{{ total() }} company(ies)</p>

    <zp-dialog [open]="bulkOpen()" title="Change access for several companies" [wide]="true" (closed)="closeBulk()">
      @if (results(); as r) {
        <div data-testid="bulk-results" aria-live="polite">
          <p class="text-sm"><strong>{{ r.applied }}</strong> applied, <strong>{{ r.unchanged }}</strong> already applied, <strong>{{ r.rejected }}</strong> not applied.</p>
          <ul class="mt-2 divide-y divide-ink/10 text-sm">
            @for (i of r.items; track i.tenantId) {
              <li class="flex flex-wrap items-center justify-between gap-2 py-1.5"><span>{{ i.name }}</span>
                <span><zp-status-badge [tone]="i.outcome === 'applied' ? 'success' : i.outcome === 'unchanged' ? 'primary' : 'danger'">{{ i.outcome === 'applied' ? 'Applied' : i.outcome === 'unchanged' ? 'Already applied' : 'Not applied' }}</zp-status-badge>
                  @if (i.message) { <span class="ml-2 text-xs text-ink/70">{{ i.message }}</span> }</span></li>
            }
          </ul>
          <div class="mt-3 flex justify-end"><button type="button" class="btn-primary" (click)="closeBulk()">Done</button></div>
        </div>
      } @else {
        <form class="space-y-3" (submit)="$event.preventDefault(); runBulk()">
          <p class="text-sm" data-testid="bulk-who"><strong>{{ selected().size }}</strong> company(ies): {{ names() }}. Each is changed on its own and reported separately; nothing else is touched.</p>
          <div class="grid gap-3 sm:grid-cols-2">
            <div><label class="app-label" for="b-op">What to do</label>
              <select id="b-op" class="app-input" data-testid="bulk-operation" [ngModel]="operation()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="operation.set($event)">
                <option value="GrantModule">Grant a whole module</option><option value="RevertModule">Return a module to the plan</option>
                <option value="GrantApplication">Grant the whole application</option><option value="RevertApplication">Revert the whole-application grant</option></select></div>
            @if (needsModule()) {
              <div><label class="app-label" for="b-mod">Module</label>
                <select id="b-mod" class="app-input" data-testid="bulk-module" [ngModel]="moduleKey()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="moduleKey.set($event)">
                  @for (m of modules(); track m.key) { <option [value]="m.key">{{ m.name }}</option> }</select></div>
            }
            @if (operation() === 'GrantApplication') {
              <div><label class="app-label" for="b-until">Ends on (required, at most {{ maxDays }} days away)</label>
                <input id="b-until" type="date" class="app-input" data-testid="bulk-until" [min]="tomorrow" [max]="latest" [ngModel]="until()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="until.set($event)" /></div>
            } @else if (operation() === 'GrantModule') {
              <div><label class="app-label" for="b-until2">Until (optional)</label>
                <input id="b-until2" type="date" class="app-input" data-testid="bulk-until" [min]="tomorrow" [ngModel]="until()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="until.set($event)" /></div>
            }
          </div>
          @if (operation() === 'GrantApplication') { <p class="text-xs text-ink/70">Modules with nothing built behind them are skipped. Plans, limits and billing are not changed.</p> }
          <div><label class="app-label" for="b-reason">Reason (kept in each company's ledger)</label>
            <input id="b-reason" class="app-input" data-testid="bulk-reason" [ngModel]="reason()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="reason.set($event)" /></div>
          @if (bulkError()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="bulk-error">{{ bulkError() }}</p> }
          <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="closeBulk()">Cancel</button>
            <button type="submit" class="btn-primary" data-testid="bulk-confirm" [disabled]="!canRun()">Apply to {{ selected().size }} company(ies)</button></div>
        </form>
      }
    </zp-dialog>
  `
})
export class PlatformTenantsComponent implements OnInit {
  private readonly api = inject(PlatformApi);
  private readonly platform = inject(PlatformAuthService);
  protected readonly items = signal<readonly PlatformTenantListItemDto[]>([]);
  protected readonly total = signal(0);
  protected readonly search = signal('');
  protected readonly status = signal<SubscriptionStatus | ''>('');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  // ---- Bulk access -----------------------------------------------------------------------------------------
  protected readonly empty: ReadonlySet<string> = new Set();
  protected readonly selected = signal<ReadonlySet<string>>(this.empty);
  protected readonly canBulk = computed(() => this.platform.can(PLATFORM_PERMISSIONS.BILLING_MANAGE));
  protected readonly allSelected = computed(() => this.items().length > 0 && this.items().every((t) => this.selected().has(t.id)));
  protected readonly names = computed(() => {
    const picked = this.items().filter((t) => this.selected().has(t.id)).map((t) => t.name);
    return picked.length <= 4 ? picked.join(', ') : `${picked.slice(0, 4).join(', ')} and ${picked.length - 4} more`;
  });

  protected readonly bulkOpen = signal(false);
  protected readonly modules = signal<readonly AccessCatalogModuleDto[]>([]);
  protected readonly operation = signal<BulkAccessOperation>('GrantModule');
  protected readonly moduleKey = signal('');
  protected readonly until = signal('');
  protected readonly reason = signal('');
  protected readonly bulkError = signal<string | null>(null);
  protected readonly results = signal<BulkAccessResultDto | null>(null);
  protected readonly busy = signal(false);
  private dialogId = '';

  protected readonly maxDays = MAX_APPLICATION_GRANT_DAYS;
  protected readonly tomorrow = dayKey(addDays(new Date(), 1));
  /** One day inside the 90-day cap: the form sends the END of the chosen day, so the last allowed date is never the boundary the server checks. */
  protected readonly latest = dayKey(addDays(new Date(), MAX_APPLICATION_GRANT_DAYS - 1));

  protected readonly needsModule = computed(() => this.operation() === 'GrantModule' || this.operation() === 'RevertModule');
  protected readonly canRun = computed(() => {
    if (this.busy() || this.reason().trim().length < 3) return false;
    if (this.needsModule() && !this.moduleKey()) return false;
    if (this.operation() === 'GrantApplication') return this.until() >= this.tomorrow && this.until() <= this.latest;
    return true;
  });

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
      // A selection only ever holds companies that are on screen, so "Apply to N" can never include one the operator cannot see.
      const visible = new Set(page.items.map((t) => t.id));
      this.selected.update((s) => new Set([...s].filter((id) => visible.has(id))));
    } catch (err) { this.error.set(toApiError(err).message); } finally { this.loading.set(false); }
  }

  protected toggle(id: string): void {
    this.selected.update((s) => { const next = new Set(s); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  protected toggleAll(): void {
    this.selected.set(this.allSelected() ? this.empty : new Set(this.items().map((t) => t.id)));
  }

  protected async openBulk(): Promise<void> {
    this.reason.set('');
    this.until.set(dayKey(addDays(new Date(), 30)));
    this.bulkError.set(null);
    this.results.set(null);
    this.dialogId = crypto.randomUUID();
    this.bulkOpen.set(true);
    try {
      const catalog = await firstValueFrom(this.api.accessCatalog());
      const available = catalog.modules.filter((m) => m.available);
      this.modules.set(available);
      if (!this.moduleKey() || !available.some((m) => m.key === this.moduleKey())) this.moduleKey.set(available[0]?.key ?? '');
    } catch (err) { this.bulkError.set(toApiError(err).message); }
  }

  /**
   * One key per distinct REQUEST: pressing Apply again (or retrying after a lost answer) sends the same key and so applies nothing twice, while
   * changing the operation, module, date, reason or companies sends a new key so the new request is never mistaken for the old one.
   */
  private idempotencyKey(): string {
    const text = JSON.stringify([this.operation(), this.needsModule() ? this.moduleKey() : null, this.until(), this.reason().trim(), [...this.selected()].sort()]);
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    return `bulk-${this.dialogId}-${(h >>> 0).toString(16)}`;
  }

  protected closeBulk(): void {
    if (!this.busy()) this.bulkOpen.set(false);
  }

  protected async runBulk(): Promise<void> {
    if (!this.canRun()) return;
    this.busy.set(true);
    this.bulkError.set(null);
    const op = this.operation();
    try {
      const result = await firstValueFrom(this.api.bulkAccess({
        tenantIds: [...this.selected()],
        operation: op,
        moduleKey: this.needsModule() ? this.moduleKey() : null,
        validUntilUtc: this.until() && (op === 'GrantApplication' || op === 'GrantModule') ? new Date(this.until() + 'T23:59:59Z').toISOString() : null,
        reason: this.reason().trim(),
        idempotencyKey: this.idempotencyKey()
      }));
      this.results.set(result);
    } catch (err) { this.bulkError.set(toApiError(err).message); } finally { this.busy.set(false); }
  }
}
