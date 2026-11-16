import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { TenantTimePipe } from '../../core/pipes/tenant-time.pipe';
import {
  CATEGORY_LABEL, STATUS_LABEL, SupportPromiseDto, TICKET_CATEGORIES, TicketCategory, TicketDetailDto, TicketListItemDto, TicketPriority, TicketStatus
} from '../../core/models/support.model';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { SupportApi } from '../../core/services/support.services';
import { ConfirmService, DialogComponent, ToastService } from '../../shared/ui/feedback';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';

/**
 * A company's line to ZestPoint support: raise a request, follow the thread, answer, close. It stays reachable when the workspace is
 * locked for non-payment, because that is exactly when a company needs to write to us. Only the public part of a thread is shown here.
 */
@Component({
    selector: 'zp-support',
    imports: [DatePipe, FormsModule, DialogComponent, StatusBadgeComponent, TenantTimePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold">Support</h1>
        <p class="text-sm text-ink/70">Ask ZestPoint for help. Replies appear here and, when e-mail is set up, in your inbox.</p>
      </div>
      @if (canCreate()) { <button type="button" class="btn-primary" data-testid="new-ticket" (click)="openNew()">New request</button> }
    </div>

    @if (promise(); as p) {
      <section class="app-card my-3 space-y-1 text-sm" data-testid="support-promise" aria-label="What your plan promises">
        <h2 class="font-semibold">What your {{ p.planName }} plan promises</h2>
        @if (p.normalMinutes) {
          <p data-testid="promise-times">We aim to reply to a normal request within {{ minutes(p.normalMinutes) }}@if (p.urgentMinutes && p.urgentMinutes !== p.normalMinutes) { , and to an urgent one within {{ minutes(p.urgentMinutes) }} }. The time is counted only in our support hours: {{ p.hours }}.</p>
        } @else if (p.urgentMinutes) {
          <p data-testid="promise-times">We aim to reply to an urgent request within {{ minutes(p.urgentMinutes) }}, counted in our support hours: {{ p.hours }}. Other requests are answered as soon as we can.</p>
        } @else { <p data-testid="promise-none">Your plan does not promise a reply time. We answer as soon as we can.</p> }
        @if (p.contact; as c) {
          <p data-testid="promise-contact">Your contact at ZestPoint: <span class="font-semibold">{{ c.name }}</span>@if (c.email) { , <a class="underline" [href]="'mailto:' + c.email">{{ c.email }}</a> }@if (c.phone) { , {{ c.phone }} }.</p>
        } @else if (p.hasNamedContact) { <p data-testid="promise-contact-pending">Your plan includes a named contact at ZestPoint, but one has not been assigned yet. Mention it in a request and we will sort it out.</p> }
      </section>
    }

    <div class="my-3 flex flex-wrap items-end gap-3">
      <div><label class="app-label" for="sup-status">Show</label>
        <select id="sup-status" class="app-input" data-testid="ticket-filter" [ngModel]="filter()" (ngModelChange)="filter.set($event); load()">
          <option value="">All requests</option><option value="Open">Open</option><option value="AwaitingCustomer">Waiting for you</option><option value="Resolved">Resolved</option><option value="Closed">Closed</option>
        </select></div>
    </div>
    @if (error()) { <p class="sys-alert sys-alert-danger mb-3" role="alert" data-testid="support-error">{{ error() }}</p> }

    <div class="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <section class="app-card p-0" aria-label="Your requests">
        <ul class="divide-y divide-ink/10" data-testid="ticket-list">
          @for (t of items(); track t.id) {
            <li>
              <button type="button" class="app-focus w-full px-4 py-3 text-left hover:bg-primary/5" [attr.aria-current]="t.id === openId() ? 'true' : null" [class]="t.id === openId() ? 'bg-primary/10' : ''" [attr.data-testid]="'ticket-' + t.number" (click)="open(t.id)">
                <span class="flex items-start justify-between gap-2"><span class="font-medium">#{{ t.number }} {{ t.subject }}</span>
                  <zp-status-badge [tone]="tone(t.status)">{{ label(t.status) }}</zp-status-badge></span>
                <span class="block text-xs text-ink/60">{{ t.requesterName }} &middot; {{ t.lastActivityAtUtc | date: 'medium' }}</span>
              </button>
            </li>
          } @empty { <li class="px-4 py-8 text-center text-ink/70">{{ loading() ? 'Loading...' : 'No requests yet.' }}</li> }
        </ul>
      </section>

      <section class="app-card" aria-live="polite" data-testid="ticket-thread">
        @if (detail(); as d) {
          <header class="flex flex-wrap items-start justify-between gap-2">
            <div><h2 class="text-lg font-semibold" data-testid="thread-subject">#{{ d.ticket.number }} {{ d.ticket.subject }}</h2>
              <p class="text-xs text-ink/60">{{ categoryLabel(d.ticket.category) }} &middot; {{ d.ticket.priority }} priority &middot; opened by {{ d.ticket.requesterName }}</p></div>
            <zp-status-badge [tone]="tone(d.ticket.status)"><span data-testid="thread-status">{{ label(d.ticket.status) }}</span></zp-status-badge>
          </header>
          @if (d.ticket.respondByUtc && d.ticket.answeredOnTime === null && d.ticket.status !== 'Closed' && d.ticket.status !== 'Resolved') {
            <p class="mt-1 text-sm" data-testid="thread-due">@if (d.ticket.late) { We have not replied yet within the time we aimed for. We are sorry. } @else { We aim to reply by {{ d.ticket.respondByUtc | tenantTime: 'datetime' }}. }</p>
          }
          <ol class="mt-3 space-y-3">
            @for (m of d.messages; track m.id) {
              <li class="rounded-lg border p-3" [class]="m.authorKind === 'Customer' ? 'border-ink/15 bg-panel' : m.authorKind === 'Operator' ? 'border-primary/40 bg-primary/5' : 'border-ink/10 bg-canvas text-ink/70'">
                <p class="text-xs text-ink/60"><span class="font-medium text-ink">{{ m.authorKind === 'Operator' ? 'ZestPoint Support' : m.authorName }}</span> &middot; {{ m.createdAtUtc | date: 'medium' }}</p>
                <p class="mt-1 whitespace-pre-wrap text-sm" data-testid="thread-message">{{ m.body }}</p>
              </li>
            }
          </ol>
          @if (d.ticket.status === 'Closed') {
            <p class="mt-3 text-sm text-ink/70">This request is closed. Start a new request if you still need help.</p>
          } @else if (canCreate()) {
            <form class="mt-4 space-y-2" (submit)="$event.preventDefault(); send()">
              <label class="app-label" for="reply-body">Your reply</label>
              <textarea id="reply-body" rows="3" maxlength="5000" class="app-input" data-testid="reply-body" [ngModel]="reply()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="reply.set($event)"></textarea>
              <div class="flex flex-wrap gap-2">
                <button type="submit" class="btn-primary" data-testid="reply-send" [disabled]="busy() || !reply().trim()">Send reply</button>
                <button type="button" class="btn-outline" data-testid="ticket-close" [disabled]="busy()" (click)="closeTicket()">Close this request</button>
              </div>
            </form>
          }
        } @else { <p class="py-8 text-center text-ink/70">Choose a request to read it, or start a new one.</p> }
      </section>
    </div>

    <zp-dialog [open]="creating()" title="New support request" (closed)="creating.set(false)">
      <form class="space-y-3" (submit)="$event.preventDefault(); create()">
        <div><label class="app-label" for="nt-subject">What do you need help with?</label>
          <input id="nt-subject" class="app-input" maxlength="200" data-testid="new-subject" [ngModel]="draft().subject" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ subject: $event })" /></div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div><label class="app-label" for="nt-cat">Topic</label>
            <select id="nt-cat" class="app-input" data-testid="new-category" [ngModel]="draft().category" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ category: $event })">
              @for (c of categories; track c) { <option [value]="c">{{ categoryLabel(c) }}</option> }</select></div>
          <div><label class="app-label" for="nt-pri">How urgent is it?</label>
            <select id="nt-pri" class="app-input" data-testid="new-priority" [ngModel]="draft().priority" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ priority: $event })">
              <option value="Low">Low: when you can</option><option value="Normal">Normal</option><option value="High">High: it is stopping us trading</option></select></div>
        </div>
        <div><label class="app-label" for="nt-body">Tell us what happened</label>
          <textarea id="nt-body" rows="5" maxlength="5000" class="app-input" data-testid="new-body" [ngModel]="draft().body" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ body: $event })"></textarea>
          <p class="mt-1 text-xs text-ink/60">Never include passwords or PINs. ZestPoint will never ask for them.</p></div>
        @if (createError()) { <p class="sys-alert sys-alert-danger" role="alert">{{ createError() }}</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="creating.set(false)">Cancel</button>
          <button type="submit" class="btn-primary" data-testid="new-send" [disabled]="busy() || draft().subject.trim().length < 3 || draft().body.trim().length < 3">Send request</button></div>
      </form>
    </zp-dialog>
  `
})
export class SupportComponent implements OnInit {
  private readonly api = inject(SupportApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly categories = TICKET_CATEGORIES;
  protected readonly items = signal<readonly TicketListItemDto[]>([]);
  protected readonly detail = signal<TicketDetailDto | null>(null);
  protected readonly promise = signal<SupportPromiseDto | null>(null);
  protected readonly openId = computed(() => this.detail()?.ticket.id ?? null);
  protected readonly filter = signal<TicketStatus | ''>('');
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly reply = signal('');
  protected readonly creating = signal(false);
  protected readonly createError = signal<string | null>(null);
  protected readonly draft = signal<{ subject: string; category: TicketCategory; priority: TicketPriority; body: string }>({ subject: '', category: 'Other', priority: 'Normal', body: '' });
  protected readonly canCreate = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.SUPPORT_CREATE));

  /** One key per form fill: pressing Send twice, or a retry after a dropped connection, never opens two requests. */
  private newKey = `tk-${crypto.randomUUID()}`;
  private replyKey = `rp-${crypto.randomUUID()}`;

  ngOnInit(): void {
    void this.load();
    // The plan's promise is a nicety: if it cannot be read the screen simply works without it.
    void firstValueFrom(this.api.promise()).then((p) => this.promise.set(p), () => { /* no panel */ });
  }

  /** 240 as "4 hours", 90 as "1 hour 30 minutes", 45 as "45 minutes". */
  protected minutes(n: number): string {
    const h = Math.floor(n / 60);
    const m = n % 60;
    const hours = h > 0 ? `${h} ${h === 1 ? 'hour' : 'hours'}` : '';
    const mins = m > 0 ? `${m} ${m === 1 ? 'minute' : 'minutes'}` : '';
    return [hours, mins].filter(Boolean).join(' ');
  }

  protected label(s: TicketStatus): string { return STATUS_LABEL[s]; }
  protected categoryLabel(c: TicketCategory): string { return CATEGORY_LABEL[c]; }
  protected tone(s: TicketStatus): 'success' | 'warning' | 'danger' | 'primary' { return s === 'Open' ? 'primary' : s === 'AwaitingCustomer' ? 'warning' : s === 'Resolved' ? 'success' : 'danger'; }

  protected patch(p: Partial<ReturnType<typeof this.draft>>): void { this.draft.update((d) => ({ ...d, ...p })); }

  protected openNew(): void {
    this.draft.set({ subject: '', category: 'Other', priority: 'Normal', body: '' });
    this.createError.set(null);
    this.newKey = `tk-${crypto.randomUUID()}`;
    this.creating.set(true);
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.items.set((await firstValueFrom(this.api.list({ status: this.filter(), pageSize: 100 }))).items);
    } catch (err) { this.error.set(toApiError(err).message); } finally { this.loading.set(false); }
  }

  protected async open(id: string): Promise<void> {
    this.error.set(null);
    try {
      this.detail.set(await firstValueFrom(this.api.get(id)));
      this.reply.set('');
      this.replyKey = `rp-${crypto.randomUUID()}`;
    } catch (err) { this.error.set(toApiError(err).message); }
  }

  protected async create(): Promise<void> {
    const d = this.draft();
    this.busy.set(true);
    this.createError.set(null);
    try {
      const made = await firstValueFrom(this.api.create({ subject: d.subject.trim(), category: d.category, priority: d.priority, body: d.body.trim(), idempotencyKey: this.newKey }));
      this.creating.set(false);
      this.toast.success('Your request was sent to ZestPoint support.');
      this.detail.set(made);
      await this.load();
    } catch (err) { this.createError.set(toApiError(err).message); } finally { this.busy.set(false); }
  }

  protected async send(): Promise<void> {
    const d = this.detail();
    if (!d || !this.reply().trim()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      this.detail.set(await firstValueFrom(this.api.reply(d.ticket.id, { body: this.reply().trim(), idempotencyKey: this.replyKey })));
      this.reply.set('');
      this.replyKey = `rp-${crypto.randomUUID()}`;
      await this.load();
    } catch (err) { this.error.set(toApiError(err).message); } finally { this.busy.set(false); }
  }

  protected async closeTicket(): Promise<void> {
    const d = this.detail();
    if (!d || !(await this.confirm.ask({ title: 'Close this request?', message: 'You can open a new request later if the problem comes back.', confirmLabel: 'Close request' }))) return;
    this.busy.set(true);
    try {
      this.detail.set(await firstValueFrom(this.api.close(d.ticket.id)));
      await this.load();
    } catch (err) { this.error.set(toApiError(err).message); } finally { this.busy.set(false); }
  }
}
