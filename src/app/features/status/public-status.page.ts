import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { IMPACT_LABEL, INCIDENT_STATUS_LABEL, LEVEL_LABEL, PublicStatusDto, StatusDayDto, StatusIncidentDto, StatusLevel, StatusPartDto } from '../../core/models/status.model';
import { toApiError } from '../../core/services/api.util';
import { StatusApi } from '../../core/services/status.services';

/**
 * The public status page: each part of the service as working, slow or not working, from the checks the server makes every minute; the last 90 days as a strip of days; the share of
 * checks that worked over the last 30 days, with how long that has been measured for; and the incidents ZestPoint has posted. Anonymous and carries nothing about any company.
 *
 * Colour is never the only signal: every state has a symbol and a word beside it, and every strip has a text summary.
 */
@Component({
    selector: 'zp-public-status',
    imports: [DatePipe, DecimalPipe, NgTemplateOutlet, RouterLink],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <main class="min-h-screen bg-slate-100 px-4 py-8 text-slate-900" data-testid="public-status">
      <div class="mx-auto max-w-3xl space-y-5">
        <header class="flex flex-wrap items-baseline justify-between gap-2">
          <h1 class="text-2xl font-bold">ZestPoint status</h1>
          <a routerLink="/" class="text-sm underline">Back to ZestPoint</a>
        </header>

        @if (error()) { <p class="rounded-lg bg-white p-4 shadow" role="alert" data-testid="status-error">{{ error() }}</p> }

        @if (data(); as d) {
          <section class="rounded-lg p-4 shadow" [class]="overallClass(d.overall)" aria-live="polite" data-testid="status-overall" [attr.data-level]="d.overall">
            <p class="flex items-center gap-2 text-lg font-bold"><span aria-hidden="true" class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-base" [class]="markClass(d.overall)">{{ mark(d.overall) }}</span><span data-testid="status-overall-text">{{ d.overallText }}</span></p>
            <p class="mt-1 text-sm">Checked {{ d.generatedAtUtc | date: 'medium' }}. This page refreshes by itself every minute.</p>
          </section>

          @for (i of d.open; track i.id) { <ng-container [ngTemplateOutlet]="incident" [ngTemplateOutletContext]="{ $implicit: i, open: true }" /> }

          <section class="space-y-3" aria-label="Parts of the service">
            @for (p of d.parts; track p.key) {
              <article class="rounded-lg bg-white p-4 shadow" [attr.data-testid]="'status-part-' + p.key">
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div class="min-w-0"><h2 class="font-semibold">{{ p.name }}</h2><p class="text-sm text-slate-600">{{ p.checked }}</p></div>
                  <p class="flex items-center gap-1.5 whitespace-nowrap font-semibold" [attr.data-testid]="'status-level-' + p.key" [attr.data-level]="p.level">
                    <span aria-hidden="true" class="inline-flex h-6 w-6 items-center justify-center rounded-full text-sm text-white" [class]="dotClass(p.level)">{{ mark(p.level) }}</span>{{ label(p.level) }}</p>
                </div>
                @if (p.detail && p.level !== 'Working') { <p class="mt-1 text-sm text-slate-700" [attr.data-testid]="'status-detail-' + p.key">{{ p.detail }}</p> }
                <div class="mt-3 flex h-8 items-stretch gap-px" role="img" [attr.aria-label]="strip(p)" [attr.data-testid]="'status-bars-' + p.key">
                  @for (day of p.history; track day.day) { <span class="min-w-[2px] flex-1 rounded-[1px]" [class]="dayClass(day)" [attr.title]="dayTitle(day)"></span> }
                </div>
                <div class="mt-1 flex justify-between text-xs text-slate-600"><span>90 days ago</span><span>Today</span></div>
                <p class="mt-1 text-sm" [attr.data-testid]="'status-availability-' + p.key">
                  @if (p.availability30 !== null) { <span class="font-semibold">{{ p.availability30 | number: '1.2-2' }}%</span> of checks worked in the last 30 days ({{ p.checks30 | number }} checks). }
                  @else { No figure yet: nothing has been measured. }
                </p>
              </article>
            }
          </section>

          <section class="rounded-lg bg-white p-4 text-sm text-slate-700 shadow" data-testid="status-method">
            <p>These figures come from checks ZestPoint's own servers make every minute: signing in, saving an order, recording a payment, working out a report, the live screens, sending messages and the background jobs.
              A day shows the worst thing that happened that day. "Slow" counts as working; "not working" does not.</p>
            @if (d.monitoringSinceUtc) { <p class="mt-2">Measured since {{ d.monitoringSinceUtc | date: 'longDate' }}; before that there are no figures, and none are guessed.</p> }
            <p class="mt-2">If this page cannot be reached at all, the service is down.</p>
          </section>

          <section class="space-y-3" aria-label="Earlier problems" data-testid="status-recent">
            <h2 class="font-semibold">Problems in the last 30 days</h2>
            @for (i of d.recent; track i.id) { <ng-container [ngTemplateOutlet]="incident" [ngTemplateOutletContext]="{ $implicit: i, open: false }" /> }
            @empty { <p class="rounded-lg bg-white p-4 text-sm shadow" data-testid="status-none-recent">Nothing has been posted in the last 30 days.</p> }
          </section>
        } @else if (!error()) { <p class="rounded-lg bg-white p-4 text-center shadow">Loading...</p> }
      </div>
    </main>

    <ng-template #incident let-i let-open="open">
      <article class="rounded-lg bg-white p-4 shadow" [class.border-l-4]="open" [class.border-red-600]="open && i.impact === 'Down'" [class.border-amber-500]="open && i.impact === 'Slow'" [attr.data-testid]="open ? 'status-open-incident' : 'status-past-incident'">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <h3 class="font-semibold">{{ i.title }}</h3>
          <span class="text-sm font-semibold">{{ incidentStatus(i) }}</span>
        </div>
        <p class="text-sm text-slate-600">{{ impact(i) }}: {{ i.parts.join(', ') }}. Started {{ i.startedAtUtc | date: 'medium' }}@if (i.resolvedAtUtc) { , resolved {{ i.resolvedAtUtc | date: 'medium' }} }.</p>
        <ol class="mt-2 space-y-1.5 border-t border-slate-200 pt-2 text-sm">
          @for (u of reversed(i); track u.atUtc + u.status) { <li><span class="font-semibold">{{ statusLabel(u.status) }}</span> <span class="text-slate-600">{{ u.atUtc | date: 'medium' }}</span><br />{{ u.message }}</li> }
        </ol>
      </article>
    </ng-template>
  `
})
export class PublicStatusPageComponent implements OnInit {
  private readonly api = inject(StatusApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly data = signal<PublicStatusDto | null>(null);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    void this.load();
    const timer = setInterval(() => void this.load(), 60_000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  private async load(): Promise<void> {
    try {
      this.data.set(await firstValueFrom(this.api.status()));
      this.error.set(null);
    } catch (err) {
      const e = toApiError(err);
      // Keep the last good answer on screen while a refresh fails, and say so.
      // This page is served apart from the service, so when the service does not answer the page can still say so: that is the one thing the service's own checks cannot report.
      this.error.set(e.status === 429
        ? 'Too many requests. This page will try again in a minute.'
        : e.status === 0 || e.status >= 500
          ? 'We cannot reach the service just now. The problem may be on our side or with your connection. This page will try again in a minute.'
          : 'The status could not be read just now. This page will try again in a minute.');
    }
  }

  protected label(level: StatusLevel): string { return LEVEL_LABEL[level]; }
  protected impact(i: StatusIncidentDto): string { return IMPACT_LABEL[i.impact]; }
  protected incidentStatus(i: StatusIncidentDto): string { return INCIDENT_STATUS_LABEL[i.status]; }
  protected statusLabel(s: StatusIncidentDto['status']): string { return INCIDENT_STATUS_LABEL[s]; }
  protected reversed(i: StatusIncidentDto) { return [...i.updates].reverse(); }

  /** A symbol for every state, so the colour is never the only signal. */
  protected mark(level: StatusLevel): string { return level === 'Working' ? '✓' : level === 'Slow' ? '!' : level === 'Down' ? '✕' : '?'; }

  protected overallClass(level: StatusLevel): string {
    return level === 'Working' ? 'bg-emerald-100 text-emerald-950' : level === 'Slow' ? 'bg-amber-100 text-amber-950' : level === 'Down' ? 'bg-red-100 text-red-950' : 'bg-slate-200 text-slate-900';
  }

  protected markClass(level: StatusLevel): string {
    return level === 'Working' ? 'text-emerald-700' : level === 'Slow' ? 'text-amber-700' : level === 'Down' ? 'text-red-700' : 'text-slate-700';
  }

  protected dotClass(level: StatusLevel): string {
    return level === 'Working' ? 'bg-emerald-700' : level === 'Slow' ? 'bg-amber-700' : level === 'Down' ? 'bg-red-700' : 'bg-slate-600';
  }

  protected dayClass(d: StatusDayDto): string {
    return d.level === 'Working' ? 'bg-emerald-600' : d.level === 'Slow' ? 'bg-amber-500' : d.level === 'Down' ? 'bg-red-600' : 'bg-slate-300';
  }

  protected dayTitle(d: StatusDayDto): string {
    return d.checks === 0 ? `${d.day}: no checks` : `${d.day}: ${LEVEL_LABEL[d.level].toLowerCase()} (${d.working} working, ${d.slow} slow, ${d.down} not working of ${d.checks} checks)`;
  }

  /** The strip in words, for anyone who cannot see colours. */
  protected strip(p: StatusPartDto): string {
    const count = (l: StatusLevel) => p.history.filter((d) => d.level === l).length;
    return `${p.name}, last 90 days: ${count('Working')} days working, ${count('Slow')} days with slow moments, ${count('Down')} days with a problem, ${count('None')} days with no checks.`;
  }
}
