import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MessageChannel, MessageChannelStateDto, MessageLogDto, MessageStatus, MessageUsageDto } from '../../core/models/messaging.model';
import { toApiError } from '../../core/services/api.util';
import { MessagesApi } from '../../core/services/messages.service';
import { NoticesStore } from '../../core/services/notices.store';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';

const PAGE = 25;

/**
 * Messages (the Messaging module): what the system has sent to people and how each message went, which ways of sending work on this server today, what is
 * left of the plan's paid messages (SMS and WhatsApp), a test to yourself on any channel, and another try for a message that failed. Nothing here is
 * pretended: a channel that is not set up says so, and a message that cannot go stays in the list with its reason.
 */
@Component({
  selector: 'zp-messages',
  standalone: true,
  imports: [DatePipe, DecimalPipe, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-3">
      <h1 class="text-2xl font-bold" data-testid="msg-title">Messages</h1>
      <p class="mt-1 max-w-3xl text-sm text-ink/80">What the system has sent to your people, in the app and by e-mail, SMS or WhatsApp, and whether it arrived. A message that could not be sent stays here with the reason.</p>
    </div>

    @if (error()) {
      <div class="sys-alert sys-alert-danger mb-3 flex flex-wrap items-center justify-between gap-2" role="alert" data-testid="msg-error"><span>{{ error() }}</span><button type="button" class="btn-outline px-2 py-1 text-sm" (click)="reload()">Try again</button></div>
    }

    @if (usage(); as u) {
      <section class="app-card mb-4" aria-label="Paid messages" data-testid="msg-usage">
        <h2 class="mb-1 text-base font-semibold">Paid messages this month</h2>
        @if (u.allowance !== null) {
          <p class="text-sm" data-testid="msg-usage-text"><strong>{{ u.used | number }}</strong> of {{ u.allowance | number }} SMS and WhatsApp messages used, <strong>{{ u.remaining | number }}</strong> left. Beyond that they go by e-mail, and you are told once.</p>
          <div class="mt-2 h-2 max-w-md rounded bg-ink/10" aria-hidden="true"><div class="h-2 rounded bg-primary" [style.width.%]="usedPercent()"></div></div>
        } @else {
          <p class="text-sm" data-testid="msg-usage-text">Your plan includes no SMS or WhatsApp messages, so anything meant for them goes by e-mail instead. Ask your ZestPoint contact if you want them.</p>
        }
      </section>

      <section class="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Ways of sending" data-testid="msg-channels">
        @for (c of u.channels; track c.channel) {
          <div class="app-card" [attr.data-testid]="'msg-channel-' + c.label">
            <div class="flex items-start justify-between gap-2">
              <h3 class="text-sm font-semibold">{{ c.label }}</h3>
              <zp-status-badge [tone]="c.configured ? 'success' : 'warning'">{{ c.configured ? 'Ready' : 'Not set up' }}</zp-status-badge>
            </div>
            <p class="mt-1 min-h-[2.5rem] text-xs text-ink/70">{{ c.configured ? (c.paid ? 'Counts against the paid messages of your plan.' : 'Free with your plan.') : c.note }}</p>
            <button type="button" class="btn-outline mt-2 w-full px-2 py-1 text-sm" [attr.data-testid]="'msg-test-' + c.channel" [disabled]="testing() !== null" (click)="test(c)">{{ testing() === c.channel ? 'Sending...' : 'Send a test to me' }}</button>
          </div>
        }
      </section>
    }

    @if (result(); as r) {
      <p class="sys-alert mb-4" [class.sys-alert-info]="r.status !== 'Failed'" [class.sys-alert-danger]="r.status === 'Failed'" role="status" data-testid="msg-test-result">
        <strong>{{ r.status === 'Failed' ? 'The test did not go: ' : r.status === 'Queued' ? 'The test is on its way. ' : 'The test went. ' }}</strong>{{ r.error ?? r.note ?? (r.channel === 'InApp' ? 'Look in the notices bell at the top.' : 'Check the inbox of the address on file.') }}
      </p>
    }

    <form class="app-card mb-3 flex flex-wrap items-end gap-3" (submit)="$event.preventDefault(); reload(1)" aria-label="Filter messages">
      <div><label class="app-label" for="msg-channel">Way of sending</label>
        <select id="msg-channel" class="app-input" data-testid="msg-filter-channel" (change)="channel.set($any($event.target).value)">
          <option value="" [selected]="!channel()">All</option><option value="InApp" [selected]="channel() === 'InApp'">In the app</option><option value="Email" [selected]="channel() === 'Email'">E-mail</option>
          <option value="Sms" [selected]="channel() === 'Sms'">SMS</option><option value="WhatsApp" [selected]="channel() === 'WhatsApp'">WhatsApp</option></select></div>
      <div><label class="app-label" for="msg-status">How it went</label>
        <select id="msg-status" class="app-input" data-testid="msg-filter-status" (change)="status.set($any($event.target).value)">
          <option value="" [selected]="!status()">All</option><option value="Sent" [selected]="status() === 'Sent'">Sent</option><option value="Queued" [selected]="status() === 'Queued'">Waiting to be sent</option>
          <option value="Failed" [selected]="status() === 'Failed'">Failed</option></select></div>
      <button type="submit" class="btn-primary" data-testid="msg-apply" [disabled]="loading()">Apply</button>
    </form>

    <div class="app-card overflow-x-auto p-0">
      <table class="app-table" data-testid="msg-table">
        <caption class="sr-only">Messages</caption>
        <thead><tr><th>When</th><th>Way</th><th>To</th><th>About</th><th>How it went</th><th></th></tr></thead>
        <tbody>
          @for (m of rows(); track m.id) {
            <tr [attr.data-testid]="'msg-row-' + m.subject" [attr.data-status]="m.status">
              <td class="whitespace-nowrap text-sm">{{ m.createdAtUtc | date: 'd MMM, HH:mm' }}</td>
              <td class="text-sm">{{ label(m.channel) }}@if (m.paid) { <span class="app-badge app-badge-primary ml-1">paid</span> }</td>
              <td class="text-sm">{{ m.toName ?? '' }}@if (m.to) { <span class="block text-xs text-ink/60">{{ m.to }}</span> }</td>
              <td class="text-sm">{{ m.subject }}</td>
              <td class="text-sm">
                <zp-status-badge [tone]="m.status === 'Sent' ? 'success' : m.status === 'Failed' ? 'danger' : 'warning'">{{ m.status === 'Queued' ? 'Waiting' : m.status }}</zp-status-badge>
                @if (m.error) { <span class="mt-1 block max-w-xs text-xs text-ink/80" data-testid="msg-error-text">{{ m.error }}</span> }
                @if (m.note) { <span class="mt-1 block max-w-xs text-xs text-ink/70">{{ m.note }}</span> }
              </td>
              <td class="text-right">@if (m.status === 'Failed' && m.to) { <button type="button" class="btn-outline px-2 py-1 text-sm" [attr.data-testid]="'msg-retry-' + m.subject" [disabled]="retrying() === m.id" (click)="retry(m)">Try again</button> }</td>
            </tr>
          } @empty { <tr><td colspan="6" class="py-8 text-center text-ink/70" data-testid="msg-empty">{{ loading() ? 'Loading...' : 'No messages yet.' }}</td></tr> }
        </tbody>
      </table>
    </div>
    <div class="mt-3 flex items-center justify-between text-sm text-ink/80">
      <span data-testid="msg-count">{{ total() === 0 ? '' : 'Showing ' + first() + '-' + last() + ' of ' + total() }}</span>
      <span class="flex gap-2"><button type="button" class="btn-outline px-2 py-1" [disabled]="page() <= 1 || loading()" (click)="reload(page() - 1)">Previous</button><button type="button" class="btn-outline px-2 py-1" [disabled]="last() >= total() || loading()" (click)="reload(page() + 1)">Next</button></span>
    </div>
  `
})
export class MessagesComponent implements OnInit {
  private readonly api = inject(MessagesApi);
  private readonly notices = inject(NoticesStore);

  protected readonly usage = signal<MessageUsageDto | null>(null);
  protected readonly rows = signal<readonly MessageLogDto[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly channel = signal<MessageChannel | ''>('');
  protected readonly status = signal<MessageStatus | ''>('');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly testing = signal<MessageChannel | null>(null);
  protected readonly retrying = signal<string | null>(null);
  protected readonly result = signal<MessageLogDto | null>(null);

  protected readonly first = computed(() => (this.total() === 0 ? 0 : (this.page() - 1) * PAGE + 1));
  protected readonly last = computed(() => Math.min(this.total(), this.page() * PAGE));
  protected readonly usedPercent = computed(() => {
    const u = this.usage();
    return u?.allowance ? Math.min(100, Math.round((u.used / u.allowance) * 100)) : 0;
  });

  ngOnInit(): void { void this.reload(1); }

  protected label(c: MessageChannel): string { return c === 'InApp' ? 'In the app' : c === 'Email' ? 'E-mail' : c === 'Sms' ? 'SMS' : 'WhatsApp'; }

  protected async reload(page = this.page()): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [usage, list] = await Promise.all([
        firstValueFrom(this.api.usage()),
        firstValueFrom(this.api.list({ channel: this.channel(), status: this.status(), page, pageSize: PAGE }))
      ]);
      this.usage.set(usage);
      this.rows.set(list.items);
      this.total.set(list.total);
      this.page.set(list.page);
    } catch (err) {
      this.error.set(toApiError(err).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected async test(c: MessageChannelStateDto): Promise<void> {
    this.testing.set(c.channel);
    this.result.set(null);
    try {
      this.result.set(await firstValueFrom(this.api.test(c.channel)));
      void this.notices.refresh();
    } catch (err) {
      this.error.set(toApiError(err).message);
    } finally {
      this.testing.set(null);
    }
    await this.reload(1);
  }

  protected async retry(m: MessageLogDto): Promise<void> {
    this.retrying.set(m.id);
    try {
      this.result.set(await firstValueFrom(this.api.retry(m.id)));
    } catch (err) {
      this.error.set(toApiError(err).message);
    } finally {
      this.retrying.set(null);
    }
    await this.reload();
  }
}
