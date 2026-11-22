import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { BarOrderDto } from '../../core/models/ops.model';
import { BarOrdersApi, BarStore, placeOf } from '../../core/services/bar.services';
import { toApiError } from '../../core/services/api.util';
import { BranchContextService } from '../../core/services/branch-context.service';
import { StationsService } from '../../core/services/stations.service';
import { BranchPickerComponent } from '../../shared/ui/ops-chrome.components';
import { SearchSelectComponent, SelectOption } from '../../shared/ui/search-select.component';
import { KitchenTicketComponent } from './kitchen-ticket.component';

const STATION_KEY = 'zp.kds.station';

/**
 * The kitchen display (the Kitchen Display module): one station's tickets on a wall screen or tablet. Tickets are drawn from the same live
 * list as the Bar Orders screen; the display adds the clock colours, ticking items off, an all-day count and calling back the last
 * ticket made. Every action goes through the API, which checks who may do it.
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
                              [options]="stationOptions()" [value]="station()" (valueChange)="choose($event)" />
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
        @if (bar.error() || error()) { <p class="sys-alert sys-alert-warning" role="alert" data-testid="kitchen-error">{{ error() ?? bar.error() }}</p> }

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
              <zp-kitchen-ticket [order]="o" [me]="bar.myId()" [now]="bar.now()" [amber]="minutesOf(o).amber" [red]="minutesOf(o).red" [busy]="busy()" [showStation]="!station()"
                                 (take)="run(bar.take($event))" (release)="run(bar.release($event))" (bump)="bump($event)" (tick)="tickItems($event)"
                                 (cantMake)="run(bar.cantMake($event.id, $event.itemIds, $event.reason, $event.parts))" />
            } @empty { <p class="app-card col-span-full py-10 text-center text-lg text-ink/70" data-testid="kitchen-empty">No tickets are waiting. New ones appear here by themselves.</p> }
          </div>
        </section>

        @if (recent().length) {
          <section aria-label="Just made" class="app-card" data-testid="kitchen-recent">
            <h2 class="mb-2 font-semibold">Just made <span class="font-normal text-ink/70">(call one back if it was a mistake)</span></h2>
            <ul class="m-0 flex list-none flex-col gap-2 p-0">
              @for (o of recent(); track o.id) {
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
  private readonly branches = inject(BranchContextService);

  /** The station shown on this device: an id, or '' for every station. Remembered on the device. */
  protected readonly station = signal<string>(this.saved());
  protected readonly stationOptions = computed<readonly SelectOption[]>(() => this.stations.list().map((x) => ({ value: x.id, label: x.name })));
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly recent = signal<readonly BarOrderDto[]>([]);

  protected readonly tickets = computed(() => this.bar.queue().filter((o) => !this.station() || o.stationId === this.station()));
  protected readonly allDay = computed(() => {
    const totals = new Map<string, number>();
    for (const o of this.tickets()) for (const i of o.items) if (i.status === 'Pending') totals.set(i.productName, (totals.get(i.productName) ?? 0) + i.quantity);
    return [...totals.entries()].map(([name, quantity]) => ({ name, quantity: Math.round(quantity * 1000) / 1000 })).sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));
  });

  constructor() {
    // The "just made" list follows the live tickets: whenever anything changes (or the station or branch does) it is read again.
    effect(() => {
      this.bar.changes();
      this.station();
      this.branches.activeId();
      const on = this.bar.enabled();
      untracked(() => { if (on) void this.loadRecent(); });
    }, { allowSignalWrites: true });
  }

  async ngOnInit(): Promise<void> {
    void this.stations.load();
    await this.branches.load();
    await this.bar.start();
    void this.bar.refresh();
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
      await this.loadRecent();
    } catch (err) {
      this.error.set(toApiError(err).message);
    } finally { this.busy.set(false); }
  }

  private async loadRecent(): Promise<void> {
    const branch = this.branches.activeId();
    if (!branch) return;
    try { this.recent.set((await firstValueFrom(this.api.board(branch, this.station() || null))).recent); }
    catch { this.recent.set([]); }
  }
}
