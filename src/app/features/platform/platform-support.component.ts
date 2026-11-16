import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PLATFORM_PERMISSIONS, STATUS_LABEL, SupportSummaryDto, TicketListItemDto, TicketPriority, TicketStatus } from '../../core/models/support.model';
import { toApiError } from '../../core/services/api.util';
import { PlatformSupportApi } from '../../core/services/support.services';
import { PlatformAuthService } from '../../core/services/subscription.services';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';

/** The support queue across every company: filter, find, and open a ticket. */
@Component({
    selector: 'zp-platform-support',
    imports: [DatePipe, FormsModule, RouterLink, StatusBadgeComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="flex flex-wrap items-center justify-between gap-2"><h1 class="text-2xl font-bold">Support tickets</h1>
      @if (platform.can(perms.TICKETS_MANAGE)) { <a routerLink="/platform/support/report" class="btn-outline text-sm" data-testid="open-response-report">Reply times</a> }</div>
    @if (summary(); as s) {
      <div class="my-3 grid grid-cols-2 gap-3 sm:grid-cols-5" data-testid="support-summary">
        <button type="button" class="app-card text-left" (click)="quick('Open', '')"><span class="block text-2xl font-bold" data-testid="sum-open">{{ s.open }}</span><span class="text-xs text-ink/70">Waiting for us</span></button>
        <button type="button" class="app-card text-left" (click)="quick('AwaitingCustomer', '')"><span class="block text-2xl font-bold">{{ s.awaitingCustomer }}</span><span class="text-xs text-ink/70">Waiting for customer</span></button>
        <button type="button" class="app-card text-left" (click)="quick('', 'unassigned')"><span class="block text-2xl font-bold" data-testid="sum-unassigned">{{ s.unassigned }}</span><span class="text-xs text-ink/70">Unassigned</span></button>
        <button type="button" class="app-card text-left" (click)="quickPriority('Urgent')"><span class="block text-2xl font-bold">{{ s.urgent }}</span><span class="text-xs text-ink/70">Urgent</span></button>
        <button type="button" class="app-card text-left" (click)="quick('', 'me')"><span class="block text-2xl font-bold">{{ s.myOpen }}</span><span class="text-xs text-ink/70">Mine, waiting for us</span></button>
      </div>
      @if (!s.emailConfigured) { <p class="sys-alert sys-alert-warning mb-3" role="status" data-testid="email-warning">E-mail is not configured, so replies are saved and shown inside the customer's app but are not e-mailed. Set the Email section in the server settings.</p> }
    }

    <div class="my-3 flex flex-wrap items-end gap-3">
      <div><label class="app-label" for="q">Search</label><input id="q" type="search" class="app-input w-64" placeholder="Number, subject, person or company" data-testid="ticket-search" [ngModel]="search()" (ngModelChange)="search.set($event)" (keydown.enter)="load()" /></div>
      <div><label class="app-label" for="st">Status</label><select id="st" class="app-input" data-testid="ticket-status" [ngModel]="status()" (ngModelChange)="status.set($event); load()">
        <option value="">Any</option><option value="Open">Open</option><option value="AwaitingCustomer">Waiting for customer</option><option value="Resolved">Resolved</option><option value="Closed">Closed</option></select></div>
      <div><label class="app-label" for="pr">Priority</label><select id="pr" class="app-input" data-testid="ticket-priority" [ngModel]="priority()" (ngModelChange)="priority.set($event); load()">
        <option value="">Any</option><option value="Urgent">Urgent</option><option value="High">High</option><option value="Normal">Normal</option><option value="Low">Low</option></select></div>
      <div><label class="app-label" for="as">Assigned to</label><select id="as" class="app-input" data-testid="ticket-assignee" [ngModel]="assignee()" (ngModelChange)="assignee.set($event); load()">
        <option value="">Anyone</option><option value="me">Me</option><option value="unassigned">Nobody</option></select></div>
      <label class="flex items-center gap-2 text-sm"><input type="checkbox" [ngModel]="oldest()" (ngModelChange)="oldest.set($event); load()" /> Due soonest first, then oldest waiting</label>
      <button type="button" class="btn-outline" data-testid="ticket-find" (click)="load()">Find</button>
    </div>
    @if (error()) { <p class="sys-alert sys-alert-danger mb-3" role="alert">{{ error() }}</p> }

    <div class="app-card overflow-x-auto p-0"><table class="app-table" data-testid="ticket-table"><thead><tr><th>#</th><th>Subject</th><th>Company</th><th>Status</th><th>Priority</th><th>Assigned</th><th>Reply due</th><th>Last activity</th></tr></thead>
      <tbody>@for (t of items(); track t.id) {
        <tr [attr.data-testid]="'row-' + t.number"><td>{{ t.number }}</td>
          <td><a class="font-medium underline" [routerLink]="['/platform/support', t.id]">{{ t.subject }}</a><span class="block text-xs text-ink/60">{{ t.requesterName }}</span></td>
          <td>{{ t.companyName }}</td><td><zp-status-badge [tone]="tone(t.status)">{{ label(t.status) }}</zp-status-badge></td>
          <td><zp-status-badge [tone]="t.priority === 'Urgent' ? 'danger' : t.priority === 'High' ? 'warning' : 'primary'">{{ t.priority }}</zp-status-badge></td>
          <td>{{ t.assignedToName ?? 'Nobody' }}</td>
          <td class="whitespace-nowrap text-sm" [attr.data-testid]="'due-' + t.number">
            @if (t.respondByUtc) {
              <span [class]="t.late ? 'font-semibold text-danger' : ''">{{ t.respondByUtc | date: 'short' }}</span>
              @if (t.late) { <zp-status-badge tone="danger">Late</zp-status-badge> } @else if (t.answeredOnTime === true) { <zp-status-badge tone="success">On time</zp-status-badge> } @else if (t.answeredOnTime === false) { <zp-status-badge tone="warning">Answered late</zp-status-badge> }
            } @else { <span class="text-ink/50">None promised</span> }
          </td>
          <td class="whitespace-nowrap">{{ t.lastActivityAtUtc | date: 'medium' }}</td></tr> }
        @empty { <tr><td colspan="8" class="py-8 text-center text-ink/70">{{ loading() ? 'Loading...' : 'No tickets match.' }}</td></tr> }</tbody></table></div>
    <p class="mt-2 text-sm text-ink/70" data-testid="ticket-total">{{ total() }} ticket(s)</p>
  `
})
export class PlatformSupportComponent implements OnInit {
  private readonly api = inject(PlatformSupportApi);
  private readonly route = inject(ActivatedRoute);
  protected readonly platform = inject(PlatformAuthService);
  protected readonly perms = PLATFORM_PERMISSIONS;

  protected readonly items = signal<readonly TicketListItemDto[]>([]);
  protected readonly summary = signal<SupportSummaryDto | null>(null);
  protected readonly total = signal(0);
  protected readonly search = signal('');
  protected readonly status = signal<TicketStatus | ''>('');
  protected readonly priority = signal<TicketPriority | ''>('');
  protected readonly assignee = signal('');
  protected readonly oldest = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    const tenant = this.route.snapshot.queryParamMap.get('tenantId');
    if (tenant) this.tenantId = tenant;
    void this.load();
  }

  private tenantId = '';

  protected label(s: TicketStatus): string { return STATUS_LABEL[s]; }
  protected tone(s: TicketStatus): 'success' | 'warning' | 'danger' | 'primary' { return s === 'Open' ? 'primary' : s === 'AwaitingCustomer' ? 'warning' : s === 'Resolved' ? 'success' : 'danger'; }

  protected quick(status: TicketStatus | '', assignee: string): void {
    this.status.set(status);
    this.assignee.set(assignee);
    this.priority.set('');
    void this.load();
  }

  protected quickPriority(p: TicketPriority): void {
    this.status.set('');
    this.assignee.set('');
    this.priority.set(p);
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [page, sum] = await Promise.all([
        firstValueFrom(this.api.tickets({ search: this.search().trim() || undefined, status: this.status(), priority: this.priority(), assignee: this.assignee() || undefined, tenantId: this.tenantId || undefined, oldestFirst: this.oldest() || undefined, pageSize: 100 })),
        firstValueFrom(this.api.summary())
      ]);
      this.items.set(page.items);
      this.total.set(page.total);
      this.summary.set(sum);
    } catch (err) { this.error.set(toApiError(err).message); } finally { this.loading.set(false); }
  }
}
