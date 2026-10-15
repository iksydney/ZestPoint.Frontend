import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CATEGORY_LABEL, PLATFORM_PERMISSIONS, PlatformOperatorDto, STATUS_LABEL, TICKET_PRIORITIES, TICKET_STATUSES, TicketDetailDto, TicketPriority, TicketStatus } from '../../core/models/support.model';
import { toApiError } from '../../core/services/api.util';
import { PlatformSupportApi } from '../../core/services/support.services';
import { PlatformAuthService } from '../../core/services/subscription.services';
import { ConfirmService, ToastService } from '../../shared/ui/feedback';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';

/** One ticket for an operator: the whole thread (internal notes marked), a reply box, and the controls their role allows. */
@Component({
  selector: 'zp-platform-ticket',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/platform/support" class="text-sm underline">&larr; All tickets</a>
    @if (error()) { <p class="sys-alert sys-alert-danger my-3" role="alert" data-testid="ticket-error">{{ error() }}</p> }
    @if (detail(); as d) {
      <div class="mt-2 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section>
          <h1 class="text-2xl font-bold" data-testid="ticket-title">#{{ d.ticket.number }} {{ d.ticket.subject }}</h1>
          <p class="text-sm text-ink/70">
            <a class="underline" [routerLink]="['/platform/customers', d.ticket.tenantId]" data-testid="ticket-company">{{ d.ticket.companyName }}</a>
            &middot; {{ d.ticket.requesterName }}@if (d.requesterEmail) { <span> &lt;{{ d.requesterEmail }}&gt;</span> } &middot; {{ categoryLabel(d.ticket.category) }}
          </p>

          <ol class="mt-3 space-y-3" data-testid="ticket-thread">
            @for (m of d.messages; track m.id) {
              <li class="rounded-lg border p-3" [attr.data-testid]="m.isInternal ? 'msg-internal' : 'msg-' + m.authorKind.toLowerCase()"
                  [class]="m.isInternal ? 'border-warning/60 bg-warning/10' : m.authorKind === 'Customer' ? 'border-ink/15 bg-panel' : m.authorKind === 'Operator' ? 'border-primary/40 bg-primary/5' : 'border-ink/10 bg-canvas text-ink/70'">
                <p class="text-xs text-ink/60"><span class="font-medium text-ink">{{ m.authorName }}</span>
                  @if (m.isInternal) { <span class="ml-1 font-semibold text-warning">Internal note: the company cannot see this</span> }
                  &middot; {{ m.createdAtUtc | date: 'medium' }}
                  @if (m.emailStatus) { <span class="ml-1" data-testid="msg-email">&middot; {{ m.emailStatus }}</span> }</p>
                <p class="mt-1 whitespace-pre-wrap text-sm">{{ m.body }}</p>
              </li>
            }
          </ol>

          @if (canReply() && d.ticket.status !== 'Closed') {
            <form class="mt-4 space-y-2" (submit)="$event.preventDefault(); send()">
              <label class="app-label" for="rb">{{ internal() ? 'Internal note (not sent to the company)' : 'Reply to the company' }}</label>
              <textarea id="rb" rows="4" maxlength="5000" class="app-input" data-testid="reply-body" [ngModel]="body()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="body.set($event)"></textarea>
              <div class="flex flex-wrap items-center gap-3">
                <label class="flex items-center gap-2 text-sm"><input type="checkbox" data-testid="reply-internal" [ngModel]="internal()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="internal.set($event)" /> Internal note</label>
                @if (!internal()) {
                  <label class="flex items-center gap-2 text-sm">Then mark as
                    <select class="app-input w-auto" data-testid="reply-status" [ngModel]="afterStatus()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="afterStatus.set($event)">
                      <option value="AwaitingCustomer">Waiting for customer</option><option value="Open">Still open</option><option value="Resolved">Resolved</option></select></label>
                }
                <button type="submit" class="btn-primary" data-testid="reply-send" [disabled]="busy() || !body().trim()">{{ internal() ? 'Add note' : 'Send reply' }}</button>
              </div>
            </form>
          } @else if (d.ticket.status === 'Closed') { <p class="mt-3 text-sm text-ink/70">This ticket is closed.@if (canManage()) { <span> Reopen it to reply.</span> }</p> }
        </section>

        <aside class="space-y-3" aria-label="Ticket details">
          <div class="app-card space-y-2 text-sm">
            <p><span class="text-ink/60">Status</span> <zp-status-badge [tone]="tone(d.ticket.status)"><span data-testid="ticket-status">{{ label(d.ticket.status) }}</span></zp-status-badge></p>
            <p><span class="text-ink/60">Priority</span> <span data-testid="ticket-priority-value">{{ d.ticket.priority }}</span></p>
            <p><span class="text-ink/60">Assigned to</span> <span data-testid="ticket-assigned">{{ d.ticket.assignedToName ?? 'Nobody' }}</span></p>
            <p class="text-xs text-ink/60">Opened {{ d.ticket.createdAtUtc | date: 'medium' }}@if (d.firstResponseAtUtc) { <br />First reply {{ d.firstResponseAtUtc | date: 'medium' }} }</p>
          </div>
          @if (canReply()) {
            <div class="app-card space-y-2 text-sm">
              <h2 class="font-semibold">Assign</h2>
              @if (canManage()) {
                <select class="app-input" aria-label="Assign to" data-testid="assign-select" [ngModel]="assignTo()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="assignTo.set($event)">
                  <option value="">Nobody</option>@for (a of assignees(); track a.id) { <option [value]="a.id">{{ a.displayName }}</option> }</select>
                <button type="button" class="btn-outline" data-testid="assign-save" [disabled]="busy()" (click)="assign(assignTo() || null)">Save assignment</button>
              } @else { <button type="button" class="btn-outline" data-testid="assign-me" [disabled]="busy() || d.ticket.assignedToAdminId === myId()" (click)="assign(myId())">Assign to me</button> }
            </div>
          }
          @if (canManage()) {
            <div class="app-card space-y-2 text-sm">
              <h2 class="font-semibold">Status and priority</h2>
              <label class="app-label" for="ns">Status</label>
              <select id="ns" class="app-input" data-testid="status-select" [ngModel]="newStatus()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="newStatus.set($event)">
                @for (s of statuses; track s) { <option [value]="s">{{ label(s) }}</option> }</select>
              <label class="app-label" for="sn">Internal note (optional)</label>
              <input id="sn" class="app-input" maxlength="400" data-testid="status-note" [ngModel]="statusNote()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="statusNote.set($event)" />
              <button type="button" class="btn-outline" data-testid="status-save" [disabled]="busy() || newStatus() === d.ticket.status" (click)="saveStatus()">Change status</button>
              <label class="app-label" for="np">Priority</label>
              <select id="np" class="app-input" data-testid="priority-select" [ngModel]="d.ticket.priority" [ngModelOptions]="{ standalone: true }" (ngModelChange)="savePriority($event)">
                @for (p of priorities; track p) { <option [value]="p">{{ p }}</option> }</select>
            </div>
          }
        </aside>
      </div>
    } @else if (!error()) { <p class="py-8 text-center text-ink/70">Loading...</p> }
  `
})
export class PlatformTicketComponent implements OnInit {
  private readonly api = inject(PlatformSupportApi);
  private readonly route = inject(ActivatedRoute);
  private readonly platform = inject(PlatformAuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly statuses = TICKET_STATUSES;
  protected readonly priorities = TICKET_PRIORITIES;
  protected readonly detail = signal<TicketDetailDto | null>(null);
  protected readonly assignees = signal<readonly PlatformOperatorDto[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly body = signal('');
  protected readonly internal = signal(false);
  protected readonly afterStatus = signal<TicketStatus>('AwaitingCustomer');
  protected readonly assignTo = signal('');
  protected readonly newStatus = signal<TicketStatus>('Open');
  protected readonly statusNote = signal('');

  protected readonly canReply = computed(() => this.platform.can(PLATFORM_PERMISSIONS.TICKETS_REPLY));
  protected readonly canManage = computed(() => this.platform.can(PLATFORM_PERMISSIONS.TICKETS_MANAGE));
  protected readonly myId = computed(() => this.platform.session()?.id ?? null);

  private replyKey = `pr-${crypto.randomUUID()}`;
  private id = '';

  async ngOnInit(): Promise<void> {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    try { this.assignees.set(await firstValueFrom(this.api.assignees())); } catch (err) { this.error.set(toApiError(err).message); }
    await this.load();
  }

  protected label(s: TicketStatus): string { return STATUS_LABEL[s]; }
  protected categoryLabel(c: keyof typeof CATEGORY_LABEL): string { return CATEGORY_LABEL[c]; }
  protected tone(s: TicketStatus): 'success' | 'warning' | 'danger' | 'primary' { return s === 'Open' ? 'primary' : s === 'AwaitingCustomer' ? 'warning' : s === 'Resolved' ? 'success' : 'danger'; }

  private show(d: TicketDetailDto): void {
    this.detail.set(d);
    this.assignTo.set(d.ticket.assignedToAdminId ?? '');
    this.newStatus.set(d.ticket.status);
  }

  private async load(): Promise<void> {
    this.error.set(null);
    try { this.show(await firstValueFrom(this.api.ticket(this.id))); } catch (err) { this.error.set(toApiError(err).message); }
  }

  private async run(action: () => Promise<TicketDetailDto>, done: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try { this.show(await action()); this.toast.success(done); } catch (err) { this.error.set(toApiError(err).message); } finally { this.busy.set(false); }
  }

  protected async send(): Promise<void> {
    const text = this.body().trim();
    if (!text) return;
    const internal = this.internal();
    await this.run(() => firstValueFrom(this.api.reply(this.id, { body: text, internal, setStatus: internal ? null : this.afterStatus(), idempotencyKey: this.replyKey })), internal ? 'Note added.' : 'Reply sent.');
    if (!this.error()) {
      this.body.set('');
      this.replyKey = `pr-${crypto.randomUUID()}`;
    }
  }

  protected async assign(adminId: string | null): Promise<void> {
    await this.run(() => firstValueFrom(this.api.assign(this.id, { adminId })), 'Assignment saved.');
  }

  protected async saveStatus(): Promise<void> {
    const status = this.newStatus();
    if (status === 'Closed' && !(await this.confirm.ask({ title: 'Close this ticket?', message: 'The company is told it was closed and can no longer reply to it.', confirmLabel: 'Close ticket' }))) return;
    await this.run(() => firstValueFrom(this.api.setStatus(this.id, status, this.statusNote().trim() || null)), 'Status changed.');
    this.statusNote.set('');
  }

  protected async savePriority(p: TicketPriority): Promise<void> {
    await this.run(() => firstValueFrom(this.api.setPriority(this.id, p)), 'Priority saved.');
  }
}
