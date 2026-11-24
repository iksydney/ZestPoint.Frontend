import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { BarOrderDto } from '../../core/models/ops.model';
import { SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { BarOrdersApi, BarStore, chime, placeOf } from '../../core/services/bar.services';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { BranchContextService } from '../../core/services/branch-context.service';
import { StationsService } from '../../core/services/stations.service';
import { onKitchenScreen } from '../../core/station-screens';
import { BranchPickerComponent } from '../../shared/ui/ops-chrome.components';
import { SearchSelectComponent, SelectOption } from '../../shared/ui/search-select.component';
import { KitchenTicketComponent } from './kitchen-ticket.component';

const STATION_KEY = 'zp.kds.station';

/**
 * The kitchen display (the Kitchen Display module): the tickets of the stations that are shown on it, on a wall screen or tablet. Each station
 * is shown on one screen only (Admin, Set-up, Stations, "Shown on"), so this screen lists the tickets the Bar Orders screen leaves out and the
 * reverse. It reads its own feed (the kitchen board, `screen=kitchen`) whenever the live connection says something changed, and sounds
 * for a new ticket itself, because the bell and the floating panel are the Bar Orders side. The display adds the clock colours, ticking items
 * off, an all-day count and calling back the last ticket made. Every action goes through the API, which checks who may do it.
 */
@Component({
    selector: 'zp-kitchen-display',
    imports: [RouterLink, BranchPickerComponent, KitchenTicketComponent, SearchSelectComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="flex flex-col gap-4" data-testid="kitchen">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-3">
          <h1 class="text-2xl font-bold">Kitchen display</h1>
          <div>
            <label class="sr-only" for="kds-station">Station</label>
            <zp-search-select class="w-64" inputId="kds-station" testId="kds-station" inputClass="app-input py-1 text-lg font-semibold" emptyLabel="All stations" noun="station" placeholder="Search stations"
                              [options]="stationOptions()" [value]="shown()" (valueChange)="choose($event)" />
          </div>
        </div>
        <div class="flex items-center gap-3">
          @if (bar.enabled()) { <span class="app-badge" [class]="bar.liveState() === 'live' ? 'app-badge-success' : 'app-badge-warning'" data-testid="kitchen-live">{{ bar.liveState() === 'live' ? 'Live' : 'Reconnecting' }}</span> }
          <zp-branch-picker />
        </div>
      </div>

      @if (!bar.enabled()) {
        <section class="app-card" data-testid="kitchen-off">
          <h2 class="font-semibold">Preparation stations are switched off</h2>
          <p class="mt-1 text-sm text-ink/80">While they are off, pressing Send deducts stock straight away and no tickets are made.</p>
          <a class="btn-outline mt-3" routerLink="/app/settings/operations">Open settings</a>
        </section>
      } @else {
        @if (bar.error() || error() || feedError()) { <p class="sys-alert sys-alert-warning" role="alert" data-testid="kitchen-error">{{ error() ?? feedError() ?? bar.error() }}</p> }

        <section aria-label="All day" class="app-card" data-testid="kitchen-allday">
          <h2 class="mb-2 font-semibold">All day <span class="font-normal text-ink/70">(still to make)</span></h2>
          @if (allDay().length) {
            <ul class="m-0 flex list-none flex-wrap gap-2 p-0">
              @for (a of allDay(); track a.name) { <li class="rounded-lg bg-ink/10 px-3 py-1 text-lg font-bold" [attr.data-testid]="'allday-' + a.name">{{ a.quantity }} x {{ a.name }}</li> }
            </ul>
          } @else { <p class="text-sm text-ink/70" data-testid="allday-empty">Nothing is waiting.</p> }
        </section>

        <section aria-label="Tickets">
          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="kitchen-tickets">
            @for (o of tickets(); track o.id) {
              <zp-kitchen-ticket [order]="o" [me]="bar.myId()" [now]="bar.now()" [amber]="minutesOf(o).amber" [red]="minutesOf(o).red" [busy]="busy()" [showStation]="!shown()"
                                 (take)="run(bar.take($event))" (release)="run(bar.release($event))" (bump)="bump($event)" (tick)="tickItems($event)"
                                 (cantMake)="run(bar.cantMake($event.id, $event.itemIds, $event.reason, $event.parts))" />
            } @empty {
              @if (noStationHere()) {
                <section class="app-card col-span-full" data-testid="kitchen-no-station">
                  <h2 class="font-semibold">No station is shown on the Kitchen Display</h2>
                  <p class="mt-1 text-sm text-ink/80">Each station's tickets are worked on one screen, Bar Orders or the Kitchen Display, and no station is set to this one. To show one here, open Admin, Set-up, Stations, edit the station and set <strong>Shown on</strong> to Kitchen Display.</p>
                  @if (canSetUp()) { <a class="btn-outline mt-3" routerLink="/app/settings/stations" data-testid="kitchen-open-stations">Open Stations</a> }
                  @else { <p class="mt-2 text-sm text-ink/80">Someone who sets up stations can change it.</p> }
                </section>
              } @else { <p class="app-card col-span-full py-10 text-center text-lg text-ink/70" data-testid="kitchen-empty">No tickets are waiting. New ones appear here by themselves.</p> }
            }
          </div>
        </section>

        @if (recentShown().length) {
          <section aria-label="Just made" class="app-card" data-testid="kitchen-recent">
            <h2 class="mb-2 font-semibold">Just made <span class="font-normal text-ink/70">(call one back if it was a mistake)</span></h2>
            <ul class="m-0 flex list-none flex-col gap-2 p-0">
              @for (o of recentShown(); track o.id) {
                <li class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink/15 px-3 py-2" [attr.data-testid]="'kitchen-recent-' + place(o)">
                  <span class="font-semibold">{{ place(o) }} <span class="font-normal text-ink/70">{{ summary(o) }}</span></span>
                  <button type="button" class="btn-outline px-3 py-1 text-sm" data-testid="kitchen-recall" [disabled]="busy()" (click)="recall(o.id)">Recall</button>
                </li>
              }
            </ul>
          </section>
        }
      }
    </div>
  `
})
export class KitchenDisplayComponent implements OnInit {
  protected readonly bar = inject(BarStore);
  protected readonly stations = inject(StationsService);
  private readonly api = inject(BarOrdersApi);
  private readonly auth = inject(AuthService);
  private readonly branches = inject(BranchContextService);

  /** The station chosen on this device: an id, or '' for every station. Remembered on the device. */
  protected readonly station = signal<string>(this.saved());
  /** Only the stations shown on this screen are offered: another screen's station would show nothing here. */
  protected readonly stationOptions = computed<readonly SelectOption[]>(() => this.stations.list().filter((x) => x.screenInEffect === 'KitchenDisplay').map((x) => ({ value: x.id, label: x.name })));
  /** The remembered station, unless it has since been moved to the Bar Orders screen (or switched off): then every station of this screen. */
  protected readonly shown = computed(() => {
    const id = this.station();
    if (!id || !this.stations.loaded()) return id;
    return this.stationOptions().some((o) => o.value === id) ? id : '';
  });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly feedError = signal<string | null>(null);
  private readonly queue = signal<readonly BarOrderDto[]>([]);
  private readonly recent = signal<readonly BarOrderDto[]>([]);

  /** No station is shown here: say where to change that, instead of an empty board that looks as if nothing is ordered. */
  protected readonly noStationHere = computed(() => this.stations.loaded() && this.stationOptions().length === 0);
  protected readonly canSetUp = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.POS_STATIONS_MANAGE));

  protected readonly tickets = computed(() => this.queue().filter((o) => !this.shown() || o.stationId === this.shown()));
  protected readonly recentShown = computed(() => this.recent().filter((o) => !this.shown() || o.stationId === this.shown()));
  protected readonly allDay = computed(() => {
    const totals = new Map<string, number>();
    for (const o of this.tickets()) for (const i of o.items) if (i.status === 'Pending') totals.set(i.productName, (totals.get(i.productName) ?? 0) + i.quantity);
    return [...totals.entries()].map(([name, quantity]) => ({ name, quantity: Math.round(quantity * 1000) / 1000 })).sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));
  });

  /** Tickets already known to this screen, so only a genuinely new one sounds; the first read after opening (or a branch change) is quiet. */
  private readonly seen = new Set<string>();
  private primedFor: string | null = null;
  private reads = 0;

  constructor() {
    // The board follows the live connection: whenever anything changes at the branch (the store has just re-read) the display reads its own tickets again.
    effect(() => {
      this.bar.changes();
      this.branches.activeId();
      const on = this.bar.enabled();
      untracked(() => { if (on) void this.loadBoard(); });
    }, { allowSignalWrites: true });
  }

  async ngOnInit(): Promise<void> {
    void this.stations.load(true);
    await this.branches.load();
    await this.bar.start();
    void this.bar.refresh();
    if (this.bar.enabled()) void this.loadBoard();
  }

  protected place = (o: BarOrderDto): string => placeOf(o);
  protected summary = (o: BarOrderDto): string => o.items.filter((i) => i.status === 'Done').map((i) => `${i.quantity} x ${i.productName}`).join(', ');

  /** A ticket's own station decides its colours; without one (a ticket from before stations) the defaults apply. */
  protected minutesOf(o: BarOrderDto): { amber: number; red: number } {
    const s = this.stations.list().find((x) => x.id === o.stationId);
    return { amber: s?.amberMinutes ?? 10, red: s?.redMinutes ?? 20 };
  }

  protected choose(id: string): void {
    this.station.set(id);
    try { localStorage.setItem(STATION_KEY, id); } catch { /* storage may be blocked: it just asks again next time */ }
  }

  private saved(): string {
    try { return localStorage.getItem(STATION_KEY) ?? ''; } catch { return ''; }
  }

  protected async run(call: Promise<string | null>): Promise<void> {
    this.busy.set(true);
    try { this.error.set(await call); } finally { this.busy.set(false); }
  }

  protected bump(id: string): Promise<void> { return this.run(this.bar.ready(id)); }

  /** Ticks (or unticks) every item behind a line, one after another, then reads the tickets again. */
  protected async tickItems(e: { id: string; itemIds: string[]; prepared: boolean }): Promise<void> {
    this.busy.set(true);
    try {
      for (const itemId of e.itemIds) await firstValueFrom(this.api.prepared(e.id, itemId, e.prepared));
      this.error.set(null);
      await this.bar.refresh();
    } catch (err) {
      this.error.set(toApiError(err).message);
      void this.bar.refresh();
    } finally { this.busy.set(false); }
  }

  protected async recall(id: string): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.recall(id));
      this.error.set(null);
      await this.bar.refresh();
      await this.loadBoard();
    } catch (err) {
      this.error.set(toApiError(err).message);
    } finally { this.busy.set(false); }
  }

  /** Reads the tickets of every station shown on this screen (those the person works at) and the ones just made; the chosen station only narrows what is drawn. */
  private async loadBoard(): Promise<void> {
    const branch = this.branches.activeId();
    if (!branch) return;
    const read = ++this.reads;
    try {
      const board = await firstValueFrom(this.api.board(branch, null, 'kitchen'));
      if (read !== this.reads || branch !== this.branches.activeId()) return;   // a newer read, or another branch, has taken over
      const queue = board.queue.filter(onKitchenScreen);
      if (this.primedFor !== branch) this.seen.clear();
      const arrived = queue.filter((o) => o.status === 'New' && !this.seen.has(o.id) && (!this.shown() || o.stationId === this.shown()));
      queue.forEach((o) => this.seen.add(o.id));
      this.queue.set(queue);
      this.recent.set(board.recent.filter(onKitchenScreen));
      this.feedError.set(null);
      if (this.primedFor === branch && arrived.length > 0 && !this.bar.muted()) chime(false);
      this.primedFor = branch;
    } catch (err) {
      if (read !== this.reads) return;
      const e = toApiError(err);
      this.feedError.set(e.status === 0 ? 'Offline: tickets are not up to date. They refresh when the connection returns.' : e.message);
    }
  }
}
