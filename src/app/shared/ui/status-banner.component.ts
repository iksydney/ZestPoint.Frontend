import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { IMPACT_LABEL, INCIDENT_STATUS_LABEL, StatusSummaryDto } from '../../core/models/status.model';
import { StatusApi } from '../../core/services/status.services';

/**
 * Tells everyone inside the application when ZestPoint has posted an incident, in the same place as the account banner, so a company that is having trouble is told it is not them.
 * It asks the server every couple of minutes; when the connection is down (a till working offline) or the answer does not come it simply stays quiet, never an error, never a pop-up.
 */
@Component({
  selector: 'zp-status-banner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (incident(); as i) {
      <section class="sys-alert mt-3 flex flex-wrap items-start justify-between gap-3" [class]="summary()?.overall === 'Down' ? 'sys-alert-danger' : 'sys-alert-warning'" role="status" data-testid="status-banner" [attr.data-level]="summary()?.overall">
        <div class="min-w-0 flex-1">
          <p class="font-bold" data-testid="status-banner-title">{{ i.title }}</p>
          <p class="mt-0.5 font-normal"><span class="font-semibold">{{ impact() }}:</span> {{ i.parts.join(', ') }}. {{ latest() }}</p>
          @if (more() > 0) { <p class="mt-1 text-sm font-normal">And {{ more() }} other {{ more() === 1 ? 'problem' : 'problems' }}.</p> }
        </div>
        <a href="/status" target="_blank" rel="noopener" class="btn-outline text-sm" data-testid="status-banner-link">See the status page</a>
      </section>
    }
  `
})
export class StatusBannerComponent implements OnInit {
  private readonly api = inject(StatusApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly summary = signal<StatusSummaryDto | null>(null);
  protected readonly incident = computed(() => this.summary()?.open[0] ?? null);
  protected readonly more = computed(() => Math.max(0, (this.summary()?.open.length ?? 0) - 1));
  protected readonly impact = computed(() => { const i = this.incident(); return i ? IMPACT_LABEL[i.impact] : ''; });
  protected readonly latest = computed(() => {
    const i = this.incident();
    const u = i?.updates[i.updates.length - 1];
    return u ? `${INCIDENT_STATUS_LABEL[u.status]}: ${u.message}` : '';
  });

  ngOnInit(): void {
    void this.load();
    const timer = setInterval(() => void this.load(), 120_000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  private async load(): Promise<void> {
    try { this.summary.set(await firstValueFrom(this.api.summary())); } catch { /* offline or busy: say nothing, keep what was shown */ }
  }
}
