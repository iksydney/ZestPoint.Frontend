import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { BarOrderDto, BarOrderStatus } from '../../core/models/ops.model';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { BarOrdersApi, BarStore, placeOf } from '../../core/services/bar.services';
import { BranchContextService } from '../../core/services/branch-context.service';
import { StationsService } from '../../core/services/stations.service';
import { onBarScreen } from '../../core/station-screens';
import { TenantTimePipe } from '../../core/pipes/tenant-time.pipe';
import { SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { ToastService } from '../../shared/ui/feedback';
import { BranchPickerComponent } from '../../shared/ui/ops-chrome.components';
import { BarOrderCardComponent } from './bar-order-card.component';

const STATUS_LABEL: Record<BarOrderStatus, string> = {
  New: 'Waiting', Taken: 'Preparing', Ready: 'Ready', Collected: 'Collected', CantMake: "Can't make", Cancelled: 'Cancelled'
};

/**
 * The bar's own screen: the live queue (waiting and being prepared) and everything sent to the bar in the last 24 hours with how long
 * each step took. It is the same data as the floating panel, with room to work. Times shown are what the server recorded. It lists the tickets of
 * the stations shown on Bar Orders and nothing else: a station shown on the Kitchen Display has its tickets there (Admin, Set-up, Stations).
 */
@Component({
    selector: 'zp-bar-orders',
    imports: [RouterLink, BranchPickerComponent, BarOrderCardComponent, TenantTimePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="flex flex-col gap-4" data-testid="bar-orders-screen">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold">Bar orders</h1>
          <p class="text-sm text-ink/80">Orders attendants send arrive here. Take one, make it, then tell the attendant it is ready. Stock is deducted when you mark it ready. Stations set to the Kitchen Display are not listed here.</p>
        </div>
        <div class="flex items-center gap-3">
          @if (bar.enabled()) { <span class="app-badge" [class]="bar.liveState() === 'live' ? 'app-badge-success' : 'app-badge-warning'" data-testid="bar-screen-live">{{ bar.liveState() === 'live' ? 'Live' : 'Reconnecting' }}</span> }
          <zp-branch-picker />
        </div>
      </div>

      @if (!bar.enabled()) {
        <section class="app-card" data-testid="bar-off">
          <h2 class="font-semibold">The bar man method is switched off</h2>
          <p class="mt-1 text-sm text-ink/80">While it is off, pressing Send on a bill deducts stock straight away and nothing is sent to a bar man.</p>
          @if (canConfigure()) { <a class="btn-outline mt-3" routerLink="/app/settings/operations">Open operations settings</a> }
          @else { <p class="mt-2 text-sm text-ink/80">Someone who manages company settings can switch it on.</p> }
        </section>
      } @else {
        @if (bar.error()) { <p class="sys-alert sys-alert-warning" role="alert">{{ bar.error() }}</p> }

        @if (stationNames().length > 1) {
          <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Station" data-testid="bar-stations">
            <span class="text-sm text-ink/70">Show</span>
            <button type="button" class="btn-outline px-3 py-1 text-sm" [class.ring-2]="!station()" [attr.aria-pressed]="!station()" data-testid="bar-station-all" (click)="station.set(null)">All stations</button>
            @for (n of stationNames(); track n) { <button type="button" class="btn-outline px-3 py-1 text-sm" [class.ring-2]="station() === n" [attr.aria-pressed]="station() === n" [attr.data-testid]="'bar-station-' + n" (click)="station.set(n)">{{ n }}</button> }
          </div>
        }

        <section aria-label="Queue">
          <h2 class="mb-2 font-semibold">Queue <span class="font-normal text-ink/70">({{ bar.waiting().length }} waiting, {{ bar.queue().length - bar.waiting().length }} being prepared)</span></h2>
          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="bar-queue">
            @for (o of shownQueue(); track o.id) {
              <zp-bar-order-card [order]="o" side="bar" [me]="bar.myId()" [now]="bar.now()" [busy]="busy()" [showStation]="stationNames().length > 1"
                                 (take)="run(bar.take($event))" (release)="run(bar.release($event))" (ready)="run(bar.ready($event), 'Dispatched. The attendant has been told.')"
                                 (cantMake)="run(bar.cantMake($event.id, $event.itemIds, $event.reason, $event.parts), 'The attendant has been told.')" />
            } @empty {
              @if (noStationHere()) {
                <section class="app-card col-span-full" data-testid="bar-no-station">
                  <h2 class="font-semibold">No station is shown on Bar Orders</h2>
                  <p class="mt-1 text-sm text-ink/80">Each station's tickets are worked on one screen, Bar Orders or the Kitchen Display, and no station is set to this one. To show one here, open Admin, Set-up, Stations, edit the station and set <strong>Shown on</strong> to Bar Orders.</p>
                  @if (canSetUp()) { <a class="btn-outline mt-3" routerLink="/app/settings/stations" data-testid="bar-open-stations">Open Stations</a> }
                  @else { <p class="mt-2 text-sm text-ink/80">Someone who sets up stations can change it.</p> }
                </section>
              } @else { <p class="app-card col-span-full py-8 text-center text-ink/70" data-testid="bar-queue-empty">No orders are waiting. New ones appear here by themselves.</p> }
            }
          </div>
        </section>

        <section class="app-card overflow-hidden p-0" aria-label="Last 24 hours">
          <div class="flex items-center justify-between gap-2 px-4 py-3">
            <h2 class="font-semibold">Last 24 hours</h2>
            <button type="button" class="btn-ghost px-2 py-1 text-sm" (click)="loadHistory()">Refresh</button>
          </div>
          @if (historyError()) { <p class="sys-alert sys-alert-danger mx-4 mb-3" role="alert">{{ historyError() }}</p> }
          <div class="overflow-x-auto">
            <table class="w-full min-w-[46rem] text-left text-sm" data-testid="bar-history">
              <thead class="border-y border-ink/10 text-xs uppercase tracking-wide text-ink/70">
                <tr><th class="px-4 py-2">Sent</th><th class="px-2 py-2">Where</th>@if (stationNames().length > 1) { <th class="px-2 py-2">Station</th> }<th class="px-2 py-2">Items</th><th class="px-2 py-2">Attendant</th><th class="px-2 py-2">Bar man</th><th class="px-2 py-2">Waited</th><th class="px-2 py-2">Made in</th><th class="px-4 py-2">Status</th></tr>
              </thead>
              <tbody>
                @for (o of shownHistory(); track o.id) {
                  <tr class="border-b border-ink/10" [attr.data-testid]="'bar-history-' + place(o)">
                    <td class="whitespace-nowrap px-4 py-2">{{ o.sentAtUtc | tenantTime }}</td>
                    <td class="px-2 py-2 font-medium">{{ place(o) }} <span class="font-normal text-ink/70">#{{ o.orderNumber }}</span></td>
                    @if (stationNames().length > 1) { <td class="px-2 py-2">{{ o.stationName ?? '' }}</td> }
                    <td class="px-2 py-2">{{ itemsOf(o) }}</td>
                    <td class="px-2 py-2">{{ o.requestedByName }}</td>
                    <td class="px-2 py-2">{{ o.takenByName ?? '' }}</td>
                    <td class="whitespace-nowrap px-2 py-2">{{ span(o.sentAtUtc, o.takenAtUtc) }}</td>
                    <td class="whitespace-nowrap px-2 py-2">{{ span(o.takenAtUtc, o.readyAtUtc) }}</td>
                    <td class="px-4 py-2"><span class="app-badge" [class]="tone(o.status)">{{ label(o.status) }}</span></td>
                  </tr>
                } @empty { <tr><td colspan="8" class="px-4 py-8 text-center text-ink/70">{{ loading() ? 'Loading...' : 'Nothing was sent here in the last 24 hours.' }}</td></tr> }
              </tbody>
            </table>
          </div>
        </section>
      }
    </div>
  `
})
export class BarOrdersComponent implements OnInit {
  protected readonly bar = inject(BarStore);
  private readonly api = inject(BarOrdersApi);
  private readonly stations = inject(StationsService);
  private readonly auth = inject(AuthService);
  private readonly branches = inject(BranchContextService);
  private readonly toast = inject(ToastService);

  protected readonly history = signal<readonly BarOrderDto[]>([]);
  protected readonly historyError = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  /** The station shown, by name; null shows them all. The filter appears when more than one station has sent a ticket. */
  protected readonly station = signal<string | null>(null);
  protected readonly stationNames = computed(() => [...new Set([...this.bar.queue(), ...this.history()].map((o) => o.stationName).filter((n): n is string => !!n))].sort());
  protected readonly shownQueue = computed(() => this.bar.queue().filter((o) => !this.station() || o.stationName === this.station()));
  protected readonly shownHistory = computed(() => this.history().filter((o) => !this.station() || o.stationName === this.station()));
  protected readonly canConfigure = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.SETTINGS_COMPANY_MANAGE));
  protected readonly canSetUp = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.POS_STATIONS_MANAGE));
  /** No station is shown on this screen: say where to change that, instead of a queue that looks as if nothing is ordered. */
  protected readonly noStationHere = computed(() => this.stations.loaded() && !this.stations.list().some((s) => s.screenInEffect === 'BarOrders'));

  constructor() {
    // The history follows the queue: whenever anything changes at the bar (or the branch changes) it is read again.
    effect(() => {
      this.bar.changes();
      this.branches.activeId();
      const on = this.bar.enabled();
      untracked(() => { if (on) void this.loadHistory(); });
    }, { allowSignalWrites: true });
  }

  async ngOnInit(): Promise<void> {
    void this.stations.load(true);
    await this.branches.load();
    await this.bar.start();
    void this.bar.refresh();
  }

  protected async loadHistory(): Promise<void> {
    const branch = this.branches.activeId();
    if (!branch) return;
    this.loading.set(true);
    try {
      this.history.set((await firstValueFrom(this.api.list(branch, true, 'bar'))).filter(onBarScreen));
      this.historyError.set(null);
    } catch (err) { this.historyError.set(toApiError(err).message); } finally { this.loading.set(false); }
  }

  protected async run(action: Promise<string | null>, done?: string): Promise<void> {
    this.busy.set(true);
    try {
      const problem = await action;
      if (problem) this.toast.error(problem);
      else if (done) this.toast.success(done);
    } finally { this.busy.set(false); }
  }

  protected place(o: BarOrderDto): string { return placeOf(o); }
  protected label(s: BarOrderStatus): string { return STATUS_LABEL[s]; }

  protected itemsOf(o: BarOrderDto): string {
    return o.items.map((i) => `${i.quantity} x ${i.productName}${i.status === 'CantMake' ? " (can't make)" : i.status === 'Cancelled' ? ' (voided)' : ''}`).join(', ');
  }

  protected tone(s: BarOrderStatus): string {
    return s === 'New' ? 'app-badge-warning' : s === 'Taken' ? 'app-badge-primary' : s === 'Ready' || s === 'Collected' ? 'app-badge-success' : s === 'CantMake' ? 'app-badge-danger' : 'bg-ink/10 text-ink/80';
  }

  /** Minutes and seconds between two recorded moments; blank while the later one has not happened. */
  protected span(fromUtc: string | null, toUtc: string | null): string {
    if (!fromUtc || !toUtc) return '';
    const iso = (v: string) => Date.parse(v.endsWith('Z') || /[+-]\d\d:\d\d$/.test(v) ? v : `${v}Z`);
    const seconds = Math.max(0, Math.round((iso(toUtc) - iso(fromUtc)) / 1000));
    return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
  }
}
