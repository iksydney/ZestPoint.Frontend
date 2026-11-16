import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ResponseReportDto } from '../../core/models/support.model';
import { toApiError } from '../../core/services/api.util';
import { PlatformSupportApi } from '../../core/services/support.services';

/**
 * How well support keeps its promise, for a month: for each plan and each operator, the tickets that had a promised first-reply time, how many were answered on time, answered late or
 * are still unanswered past the time, and the average time to the first reply. Tickets are counted by when they were opened. For support leads and administrators.
 */
@Component({
  selector: 'zp-platform-response-report',
  standalone: true,
  imports: [DecimalPipe, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/platform/support" class="text-sm underline">&larr; All tickets</a>
    <div class="mt-2 flex flex-wrap items-end justify-between gap-3">
      <h1 class="text-2xl font-bold">Reply times</h1>
      <div><label class="app-label" for="rr-month">Month</label><input id="rr-month" type="month" class="app-input" data-testid="report-month" [ngModel]="month()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="month.set($event); load()" /></div>
    </div>
    @if (error()) { <p class="sys-alert sys-alert-danger my-3" role="alert" data-testid="report-error">{{ error() }}</p> }

    @if (report(); as r) {
      <div class="my-3 grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="report-summary">
        <div class="app-card"><span class="block text-2xl font-bold" data-testid="sum-tickets">{{ r.tickets }}</span><span class="text-xs text-ink/70">Tickets with a promised time</span></div>
        <div class="app-card"><span class="block text-2xl font-bold" data-testid="sum-ontime">{{ r.answeredOnTime }}</span><span class="text-xs text-ink/70">Answered on time</span></div>
        <div class="app-card"><span class="block text-2xl font-bold" data-testid="sum-late">{{ r.answeredLate }}</span><span class="text-xs text-ink/70">Answered late</span></div>
        <div class="app-card"><span class="block text-2xl font-bold" data-testid="sum-stilllate">{{ r.stillLate }}</span><span class="text-xs text-ink/70">Still unanswered and late</span></div>
      </div>
      <div class="app-card overflow-x-auto p-0"><table class="app-table" data-testid="report-table"><thead><tr><th>Plan</th><th>Operator</th><th class="text-right">Tickets</th><th class="text-right">On time</th><th class="text-right">Late</th><th class="text-right">Still late</th><th class="text-right">Average first reply</th></tr></thead>
        <tbody>@for (row of r.rows; track row.plan + row.operator) {
          <tr><td class="font-medium">{{ row.plan }}</td><td>{{ row.operator }}</td><td class="text-right">{{ row.tickets }}</td><td class="text-right">{{ row.answeredOnTime }}</td><td class="text-right">{{ row.answeredLate }}</td>
            <td class="text-right">{{ row.stillLate }}</td><td class="text-right">{{ row.averageFirstResponseMinutes === null ? 'no answers yet' : (row.averageFirstResponseMinutes | number: '1.0-0') + ' min' }}</td></tr> }
          @empty { <tr><td colspan="7" class="py-8 text-center text-ink/70">{{ loading() ? 'Loading...' : 'No ticket this month had a promised time.' }}</td></tr> }</tbody></table></div>
      <p class="mt-2 text-sm text-ink/70" data-testid="report-without">{{ r.withoutPromise }} ticket(s) this month were on plans that promise no reply time and are not counted above. The average is the real time from opening to the first reply, not counting support hours.</p>
    }
  `
})
export class PlatformResponseReportComponent implements OnInit {
  private readonly api = inject(PlatformSupportApi);

  protected readonly month = signal(new Date().toISOString().slice(0, 7));
  protected readonly report = signal<ResponseReportDto | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void { void this.load(); }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try { this.report.set(await firstValueFrom(this.api.responseReport(this.month() || undefined))); }
    catch (err) { this.error.set(toApiError(err).message); } finally { this.loading.set(false); }
  }
}
