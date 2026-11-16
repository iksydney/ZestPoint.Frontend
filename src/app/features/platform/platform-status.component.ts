import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { PLATFORM_PERMISSIONS } from '../../core/models/support.model';
import {
  IMPACT_LABEL, INCIDENT_IMPACTS, INCIDENT_STATUSES, INCIDENT_STATUS_LABEL, IncidentImpact, IncidentStatus, LEVEL_LABEL, PublicStatusDto, StatusIncidentDto, StatusLevel
} from '../../core/models/status.model';
import { toApiError } from '../../core/services/api.util';
import { PlatformStatusApi } from '../../core/services/status.services';
import { PlatformAuthService } from '../../core/services/subscription.services';
import { ToastService } from '../../shared/ui/feedback';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';

/**
 * The operator's side of the status page: what each check says right now (the same answers the public page shows), and posting, updating and resolving incidents. Anyone who can see
 * support can look; posting needs a support lead or an administrator. Every post and update is recorded in ZestPoint's own audit log with who made it.
 */
@Component({
    selector: 'zp-platform-status',
    imports: [DatePipe, DecimalPipe, FormsModule, StatusBadgeComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h1 class="text-2xl font-bold">Status page</h1>
      <a href="/status" target="_blank" rel="noopener" class="btn-outline text-sm" data-testid="open-public-status">Open the public page</a>
    </div>
    @if (error()) { <p class="sys-alert sys-alert-danger my-3" role="alert" data-testid="status-error">{{ error() }}</p> }

    @if (overview(); as o) {
      <section class="app-card my-3 overflow-x-auto p-0" aria-label="What the checks say">
        <table class="app-table" data-testid="checks-table"><thead><tr><th>Part</th><th>Now</th><th class="text-right">Took</th><th>What it said</th><th>Checked</th><th class="text-right">Worked, 30 days</th></tr></thead>
          <tbody>@for (p of o.parts; track p.key) {
            <tr [attr.data-testid]="'check-' + p.key"><td class="font-medium">{{ p.name }}</td>
              <td><zp-status-badge [tone]="tone(p.level)"><span [attr.data-testid]="'check-level-' + p.key">{{ label(p.level) }}</span></zp-status-badge></td>
              <td class="text-right">{{ p.latencyMs | number }} ms</td><td class="text-sm">{{ p.detail ?? '' }}</td>
              <td class="whitespace-nowrap text-sm">{{ p.checkedAtUtc ? (p.checkedAtUtc | date: 'mediumTime') : 'never' }}</td>
              <td class="text-right">{{ p.availability30 === null ? 'no figure' : (p.availability30 | number: '1.2-2') + '%' }}</td></tr> }</tbody></table>
        <p class="p-3 text-xs text-ink/70">The checks run on the server every minute. They cannot say when the server itself is down: for that, an outside monitor has to ping the server's /health address.@if (o.monitoringSinceUtc) { <span> Measured since {{ o.monitoringSinceUtc | date: 'longDate' }}.</span> }</p>
      </section>
    }

    @if (canPost()) {
      <section class="app-card my-3 space-y-3" aria-label="Post an incident">
        <h2 class="font-semibold">Post an incident</h2>
        <p class="text-sm text-ink/70">It appears on the public page and as a banner inside every company's application until it is resolved.</p>
        <form class="space-y-3" (submit)="$event.preventDefault(); post()">
          <div><label class="app-label" for="inc-title">What is wrong, in a few words</label><input id="inc-title" class="app-input" maxlength="160" data-testid="incident-title" [ngModel]="title()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="title.set($event)" /></div>
          <fieldset><legend class="app-label">Which parts</legend>
            <div class="flex flex-wrap gap-x-4 gap-y-1">@for (p of partsList(); track p.key) {
              <label class="flex items-center gap-2 text-sm"><input type="checkbox" [attr.data-testid]="'incident-part-' + p.key" [checked]="chosen().includes(p.key)" (change)="togglePart(p.key)" /> {{ p.name }}</label> }</div></fieldset>
          <div class="grid gap-3 sm:grid-cols-[14rem_minmax(0,1fr)]">
            <div><label class="app-label" for="inc-impact">How bad</label><select id="inc-impact" class="app-input" data-testid="incident-impact" [ngModel]="impact()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="impact.set($event)">
              @for (i of impacts; track i) { <option [value]="i">{{ impactLabel(i) }}</option> }</select></div>
            <div><label class="app-label" for="inc-msg">What customers should know</label><textarea id="inc-msg" rows="2" maxlength="1000" class="app-input" data-testid="incident-message" [ngModel]="message()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="message.set($event)"></textarea></div>
          </div>
          @if (postError()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="incident-error">{{ postError() }}</p> }
          <div class="flex justify-end"><button type="submit" class="btn-primary" data-testid="incident-post" [disabled]="busy() || title().trim().length < 3 || message().trim().length < 3 || chosen().length === 0">Post to the status page</button></div>
        </form>
      </section>
    } @else { <p class="sys-alert sys-alert-info my-3" role="status">Posting to the status page needs a support lead or an administrator.</p> }

    <section class="space-y-3" aria-label="Incidents">
      <h2 class="font-semibold">Incidents</h2>
      @for (i of incidents(); track i.id) {
        <article class="app-card" [attr.data-testid]="'incident-' + i.id">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div><h3 class="font-semibold" data-testid="incident-row-title">{{ i.title }}</h3>
              <p class="text-sm text-ink/70">{{ impactLabel(i.impact) }}: {{ i.parts.join(', ') }}. Started {{ i.startedAtUtc | date: 'medium' }}@if (i.resolvedAtUtc) { , resolved {{ i.resolvedAtUtc | date: 'medium' }} }</p></div>
            <zp-status-badge [tone]="i.status === 'Resolved' ? 'success' : i.impact === 'Down' ? 'danger' : 'warning'"><span data-testid="incident-row-status">{{ statusLabel(i.status) }}</span></zp-status-badge>
          </div>
          <ol class="mt-2 space-y-1 border-t border-ink/10 pt-2 text-sm">@for (u of i.updates; track u.atUtc + u.status) { <li><span class="font-medium">{{ statusLabel(u.status) }}</span> <span class="text-ink/60">{{ u.atUtc | date: 'medium' }} &middot; {{ u.byName }}</span><br />{{ u.message }}</li> }</ol>
          @if (canPost() && i.status !== 'Resolved') {
            @if (updatingId() === i.id) {
              <form class="mt-3 space-y-2 border-t border-ink/10 pt-3" (submit)="$event.preventDefault(); sendUpdate(i)">
                <div class="grid gap-3 sm:grid-cols-[14rem_minmax(0,1fr)]">
                  <div><label class="app-label" [for]="'upd-status-' + i.id">New state</label><select class="app-input" [id]="'upd-status-' + i.id" data-testid="update-status" [ngModel]="updStatus()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="updStatus.set($event)">
                    @for (s of statuses; track s) { <option [value]="s">{{ statusLabel(s) }}</option> }</select></div>
                  <div><label class="app-label" [for]="'upd-msg-' + i.id">Update for customers</label><input class="app-input" [id]="'upd-msg-' + i.id" maxlength="1000" data-testid="update-message" [ngModel]="updMessage()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="updMessage.set($event)" /></div>
                </div>
                @if (updError()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="update-error">{{ updError() }}</p> }
                <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="updatingId.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="update-send" [disabled]="busy() || updMessage().trim().length < 3">Post update</button></div>
              </form>
            } @else { <div class="mt-3 flex justify-end"><button type="button" class="btn-outline text-sm" data-testid="update-open" (click)="startUpdate(i)">Post an update or resolve</button></div> }
          }
        </article>
      } @empty { <p class="app-card text-sm text-ink/70" data-testid="no-incidents">{{ loading() ? 'Loading...' : 'No incidents have been posted.' }}</p> }
    </section>
  `
})
export class PlatformStatusComponent implements OnInit {
  private readonly api = inject(PlatformStatusApi);
  private readonly platform = inject(PlatformAuthService);
  private readonly toast = inject(ToastService);

  protected readonly impacts = INCIDENT_IMPACTS;
  protected readonly statuses = INCIDENT_STATUSES;
  protected readonly overview = signal<PublicStatusDto | null>(null);
  protected readonly incidents = signal<readonly StatusIncidentDto[]>([]);
  protected readonly partsList = computed(() => this.overview()?.parts.map((p) => ({ key: p.key, name: p.name })) ?? []);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly title = signal('');
  protected readonly chosen = signal<readonly string[]>([]);
  protected readonly impact = signal<IncidentImpact>('Down');
  protected readonly message = signal('');
  protected readonly postError = signal<string | null>(null);

  protected readonly updatingId = signal<string | null>(null);
  protected readonly updStatus = signal<IncidentStatus>('Identified');
  protected readonly updMessage = signal('');
  protected readonly updError = signal<string | null>(null);

  protected readonly canPost = computed(() => this.platform.can(PLATFORM_PERMISSIONS.STATUS_MANAGE));

  ngOnInit(): void { void this.load(); }

  protected label(l: StatusLevel): string { return LEVEL_LABEL[l]; }
  protected tone(l: StatusLevel): 'success' | 'warning' | 'danger' | 'primary' { return l === 'Working' ? 'success' : l === 'Slow' ? 'warning' : l === 'Down' ? 'danger' : 'primary'; }
  protected impactLabel(i: IncidentImpact): string { return IMPACT_LABEL[i]; }
  protected statusLabel(s: IncidentStatus): string { return INCIDENT_STATUS_LABEL[s]; }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [o, i] = await Promise.all([firstValueFrom(this.api.overview()), firstValueFrom(this.api.incidents())]);
      this.overview.set(o);
      this.incidents.set(i);
    } catch (err) { this.error.set(toApiError(err).message); } finally { this.loading.set(false); }
  }

  protected togglePart(key: string): void { this.chosen.update((c) => (c.includes(key) ? c.filter((k) => k !== key) : [...c, key])); }

  protected async post(): Promise<void> {
    this.busy.set(true);
    this.postError.set(null);
    try {
      await firstValueFrom(this.api.open({ title: this.title().trim(), parts: [...this.chosen()], impact: this.impact(), message: this.message().trim() }));
      this.title.set('');
      this.message.set('');
      this.chosen.set([]);
      this.toast.success('The incident is on the status page.');
      await this.load();
    } catch (err) { this.postError.set(toApiError(err).message); } finally { this.busy.set(false); }
  }

  protected startUpdate(i: StatusIncidentDto): void {
    this.updatingId.set(i.id);
    this.updStatus.set(i.status === 'Investigating' ? 'Identified' : i.status === 'Identified' ? 'Monitoring' : 'Resolved');
    this.updMessage.set('');
    this.updError.set(null);
  }

  protected async sendUpdate(i: StatusIncidentDto): Promise<void> {
    this.busy.set(true);
    this.updError.set(null);
    try {
      await firstValueFrom(this.api.update(i.id, { status: this.updStatus(), message: this.updMessage().trim() }));
      this.updatingId.set(null);
      this.toast.success(this.updStatus() === 'Resolved' ? 'Resolved.' : 'Updated.');
      await this.load();
    } catch (err) { this.updError.set(toApiError(err).message); } finally { this.busy.set(false); }
  }
}
