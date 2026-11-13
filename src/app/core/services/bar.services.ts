import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { Observable, Subject, firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiEnvelope } from '../models/api.model';
import { BarOrderDto, BarOrderNotice } from '../models/ops.model';
import { SCREEN_PERMISSIONS } from '../models/rbac.model';
import { AccessService } from './access.service';
import { toApiError, unwrap } from './api.util';
import { AuthService } from './auth.service';
import { BranchContextService } from './branch-context.service';
import { OperationSettingsApi } from './ops.services';

/**
 * The bar man method. The bar man's calls need `pos.bar_order.fulfil`; the attendant's (`mine`, `acknowledge`) need `pos.order.edit`.
 * All of them need a connection: an order cannot be taken or dispatched offline.
 */
@Injectable({ providedIn: 'root' })
export class BarOrdersApi {
  private readonly http = inject(HttpClient);

  /** The branch's queue (waiting and being prepared, oldest first), or everything sent in the last 24 hours. */
  list(branchId: string, history = false): Observable<BarOrderDto[]> {
    return this.http.get<ApiEnvelope<BarOrderDto[]>>('/api/v1/bar-orders', { params: new HttpParams().set('branchId', branchId).set('history', String(history)) }).pipe(unwrap());
  }

  take(id: string): Observable<BarOrderDto> { return this.post(`/api/v1/bar-orders/${id}/take`); }
  release(id: string): Observable<BarOrderDto> { return this.post(`/api/v1/bar-orders/${id}/release`); }
  ready(id: string): Observable<BarOrderDto> { return this.post(`/api/v1/bar-orders/${id}/ready`); }

  /** No item ids means every item still waiting on the order. */
  cantMake(id: string, itemIds: string[], reason: string): Observable<BarOrderDto> { return this.post(`/api/v1/bar-orders/${id}/cant-make`, { itemIds, reason }); }

  /** What I sent to the bar that is still in progress or needs me. */
  mine(branchId: string): Observable<BarOrderDto[]> {
    return this.http.get<ApiEnvelope<BarOrderDto[]>>('/api/v1/orders/bar-requests', { params: new HttpParams().set('branchId', branchId) }).pipe(unwrap());
  }

  /** A ready order becomes Collected; "can't make" items are marked as seen. */
  acknowledge(id: string): Observable<BarOrderDto> { return this.post(`/api/v1/orders/bar-requests/${id}/acknowledge`); }

  private post(url: string, body: unknown = null): Observable<BarOrderDto> {
    return this.http.post<ApiEnvelope<BarOrderDto>>(url, body).pipe(unwrap());
  }
}

export type LiveState = 'off' | 'connecting' | 'live' | 'reconnecting';

/**
 * The live connection to the API (SignalR). It only RECEIVES "a bar order changed" notices carrying ids; everything shown on screen is
 * then read through the normal API, which checks tenant, branch and permission as always. The server closes the connection when the
 * access token expires and this reconnects with the current one, so the person's right to listen is checked again every few minutes.
 */
@Injectable({ providedIn: 'root' })
export class FloorLiveService {
  private readonly auth = inject(AuthService);
  private connection: HubConnection | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;

  private readonly _state = signal<LiveState>('off');
  readonly state = this._state.asReadonly();

  /** A bar order changed. */
  readonly notices = new Subject<BarOrderNotice>();
  /** The connection is (back) up: anything that happened while it was down must be re-read. */
  readonly connected = new Subject<void>();

  constructor() {
    // Signing out ends the connection; nothing is left listening for the next person on this device.
    effect(() => { if (!this.auth.isAuthenticated()) untracked(() => void this.stop()); });
  }

  /** Starts the connection once; safe to call again. A failed start (no network) is retried quietly. */
  start(): void {
    if (this.connection || !this.auth.isAuthenticated()) return;

    const url = (environment.apiBaseUrl ? environment.apiBaseUrl : '/api') + '/v1/hubs/floor';
    const connection = new HubConnectionBuilder()
      .withUrl(url, { accessTokenFactory: () => this.currentToken() })
      .withAutomaticReconnect({ nextRetryDelayInMilliseconds: (ctx) => [0, 2000, 5000, 10_000][ctx.previousRetryCount] ?? 15_000 })
      .configureLogging(LogLevel.Error)
      .build();

    connection.on('barOrderChanged', (notice: BarOrderNotice) => this.notices.next(notice));
    connection.onreconnecting(() => this._state.set('reconnecting'));
    connection.onreconnected(() => { this._state.set('live'); this.connected.next(); });
    // Automatic reconnect only gives up when a reconnect is refused outright (signed out, switched off); keep trying while signed in.
    connection.onclose(() => { if (this.connection === connection) { this._state.set('reconnecting'); this.scheduleStart(connection); } });

    this.connection = connection;
    void this.begin(connection);
  }

  async stop(): Promise<void> {
    const connection = this.connection;
    this.connection = null;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    this._state.set('off');
    if (connection) await connection.stop().catch(() => undefined);
  }

  private async begin(connection: HubConnection): Promise<void> {
    if (this.connection !== connection || connection.state !== HubConnectionState.Disconnected) return;
    this._state.update((s) => (s === 'off' ? 'connecting' : s));
    try {
      await connection.start();
      if (this.connection !== connection) return void connection.stop().catch(() => undefined);
      this._state.set('live');
      this.connected.next();
    } catch {
      // No network or the API is restarting: the screens keep their last data and say they are not live; try again shortly.
      if (this.connection === connection) { this._state.set('reconnecting'); this.scheduleStart(connection); }
    }
  }

  private scheduleStart(connection: HubConnection): void {
    if (this.retry) clearTimeout(this.retry);
    this.retry = setTimeout(() => void this.begin(connection), 10_000);
  }

  /** The access token for a (re)connect, refreshed first when it is about to run out. */
  private async currentToken(): Promise<string> {
    const expires = Date.parse(this.auth.session()?.accessTokenExpiresAtUtc ?? '');
    if (!Number.isNaN(expires) && expires - Date.now() < 10_000) await this.auth.refresh();
    return this.auth.token() ?? '';
  }
}

/**
 * State of the bar man method on this device: whether the company uses it, the bar's queue (for a bar man), the orders this person
 * sent (for an attendant), and which of them just arrived or just need attention. Started by the application shell.
 */
@Injectable({ providedIn: 'root' })
export class BarStore {
  private readonly api = inject(BarOrdersApi);
  private readonly settingsApi = inject(OperationSettingsApi);
  private readonly auth = inject(AuthService);
  private readonly access = inject(AccessService);
  private readonly branches = inject(BranchContextService);
  private readonly live = inject(FloorLiveService);

  private readonly _enabled = signal(false);
  private readonly _queue = signal<readonly BarOrderDto[]>([]);
  private readonly _mine = signal<readonly BarOrderDto[]>([]);
  private readonly _arrivals = signal<readonly BarOrderDto[]>([]);
  private readonly _error = signal<string | null>(null);
  private readonly _now = signal(Date.now());
  private readonly _changes = signal(0);

  private startedFor: string | null = null;
  private loadedBranch: string | null = null;
  private refreshing: Promise<void> | null = null;
  private again = false;
  /** Orders already known to this device, so only a genuinely new one pops up and sounds. */
  private readonly seenQueue = new Set<string>();
  private readonly seenAttention = new Set<string>();

  /** The company uses the bar man method. */
  readonly enabled = this._enabled.asReadonly();
  /** UX only: the server re-checks the permission and the plan on every call. */
  readonly isBarMan = computed(() => this._enabled() && this.auth.hasPermission(SCREEN_PERMISSIONS.POS_BAR_ORDER_FULFIL)
    && this.access.actionAllowed(SCREEN_PERMISSIONS.POS_BAR_ORDER_FULFIL) && this.access.screenAllowed('pos.bar') && this.auth.accessModeFor('core_pos') === 'full');
  readonly isAttendant = computed(() => this._enabled() && this.auth.hasPermission(SCREEN_PERMISSIONS.POS_ORDER_EDIT) && this.auth.accessModeFor('core_pos') !== 'locked');
  /** A locked workspace keeps only its subscription screens, so nothing of the bar is offered there. */
  readonly active = computed(() => !this.auth.locked() && (this.isBarMan() || this.isAttendant()));

  /** Waiting and being prepared at the branch, oldest first. */
  readonly queue = this._queue.asReadonly();
  readonly waiting = computed(() => this._queue().filter((o) => o.status === 'New'));
  /** What I sent that is still in progress or needs me. */
  readonly mine = this._mine.asReadonly();
  readonly attention = computed(() => this._mine().filter((o) => o.needsAttention));
  /** Orders that reached the bar since this device last looked: shown as pop-up prompts until opened or dismissed. */
  readonly arrivals = this._arrivals.asReadonly();
  readonly error = this._error.asReadonly();
  readonly liveState = this.live.state;
  /** Ticks every 30 seconds so "4 min ago" stays true without a reload. */
  readonly now = this._now.asReadonly();
  /** Increases whenever anything about bar orders changed; screens that keep their own list (history) reload on it. */
  readonly changes = this._changes.asReadonly();
  readonly myId = computed(() => this.auth.membership()?.id ?? null);

  private readonly _muted = signal(readMuted());
  readonly muted = this._muted.asReadonly();

  constructor() {
    this.live.notices.subscribe((n) => { if (n.branchId === this.branches.activeId()) void this.refresh(); });
    this.live.connected.subscribe(() => void this.refresh());
    setInterval(() => this._now.set(Date.now()), 30_000);

    // Another branch has another bar: forget what was seen and read that branch's orders.
    effect(() => {
      const branch = this.branches.activeId();
      const active = this.active();
      untracked(() => { if (active && branch && branch !== this.loadedBranch) void this.refresh(); });
    }, { allowSignalWrites: true });

    // Signed out: nothing of the previous person stays on screen.
    effect(() => { if (!this.auth.isAuthenticated()) untracked(() => this.reset()); }, { allowSignalWrites: true });
  }

  /** Called by the shell once the person is signed in: finds out whether the company uses the method and, if so, starts listening. */
  async start(): Promise<void> {
    const tenant = this.auth.tenantId();
    if (!tenant || this.startedFor === tenant) return;
    this.startedFor = tenant;
    try {
      this.setEnabled((await firstValueFrom(this.settingsApi.get())).barManMethodEnabled);
    } catch {
      this.startedFor = null; // offline at sign-in: try again when the shell is next shown
    }
  }

  /** The operations settings screen calls this after saving, so the owner's own device follows the switch at once. */
  setEnabled(enabled: boolean): void {
    this._enabled.set(enabled);
    if (enabled && this.active()) {
      this.live.start();
      void this.branches.load().then(() => this.refresh());
    } else if (!enabled) {
      void this.live.stop();
      this.clearLists();
    }
  }

  /** Re-reads both lists. Calls made while one is running are folded into a single follow-up read. */
  refresh(): Promise<void> {
    if (this.refreshing) { this.again = true; return this.refreshing; }
    this.refreshing = this.load().finally(() => {
      this.refreshing = null;
      if (this.again) { this.again = false; void this.refresh(); }
    });
    return this.refreshing;
  }

  dismissArrival(id: string): void { this._arrivals.update((list) => list.filter((o) => o.id !== id)); }

  toggleMute(): void {
    this._muted.update((m) => !m);
    try { localStorage.setItem(MUTE_KEY, this._muted() ? '1' : '0'); } catch { /* storage may be blocked */ }
  }

  // ---- Actions: each returns null on success or the message to show ---------------------------

  take(id: string): Promise<string | null> { return this.act(this.api.take(id), id); }
  release(id: string): Promise<string | null> { return this.act(this.api.release(id)); }
  ready(id: string): Promise<string | null> { return this.act(this.api.ready(id)); }
  cantMake(id: string, itemIds: string[], reason: string): Promise<string | null> { return this.act(this.api.cantMake(id, itemIds, reason)); }
  acknowledge(id: string): Promise<string | null> { return this.act(this.api.acknowledge(id)); }

  private async act(call: Observable<BarOrderDto>, dismiss?: string): Promise<string | null> {
    try {
      await firstValueFrom(call);
      if (dismiss) this.dismissArrival(dismiss);
      await this.refresh();
      return null;
    } catch (err) {
      const e = toApiError(err);
      if (e.code === 'not_entitled') this.access.noteRefusal();
      void this.refresh(); // someone else may have got there first: show what is true now
      return e.message;
    }
  }

  private async load(): Promise<void> {
    const branch = this.branches.activeId();
    if (!branch || !this.active()) return;
    if (branch !== this.loadedBranch) {
      this.seenQueue.clear();
      this.seenAttention.clear();
      this._arrivals.set([]);
    }
    const first = branch !== this.loadedBranch;

    try {
      const [queue, mine] = await Promise.all([
        this.isBarMan() ? firstValueFrom(this.api.list(branch)) : Promise.resolve<BarOrderDto[]>([]),
        this.isAttendant() ? firstValueFrom(this.api.mine(branch)) : Promise.resolve<BarOrderDto[]>([])
      ]);
      if (branch !== this.branches.activeId()) return; // the branch changed while this was loading
      this.loadedBranch = branch;
      this._error.set(null);

      // Pop up (and sound) only for what is new since the last look. The first look after sign-in shows what is already there quietly.
      const arrived = queue.filter((o) => o.status === 'New' && !this.seenQueue.has(o.id));
      queue.forEach((o) => this.seenQueue.add(o.id));
      const calling = mine.filter((o) => o.needsAttention && !this.seenAttention.has(attentionKey(o)));
      mine.filter((o) => o.needsAttention).forEach((o) => this.seenAttention.add(attentionKey(o)));

      this._queue.set(queue);
      this._mine.set(mine);
      const open = new Set(queue.filter((o) => o.status === 'New').map((o) => o.id));
      this._arrivals.update((list) => [...list.filter((o) => open.has(o.id)), ...(first ? [] : arrived)]);
      this._changes.update((n) => n + 1);
      if (!first && (arrived.length > 0 || calling.length > 0) && !this._muted()) chime(calling.length > 0 && arrived.length === 0);
    } catch (err) {
      const e = toApiError(err);
      if (e.code === 'not_entitled') this.access.noteRefusal();
      this._error.set(e.status === 0 ? 'Offline: bar orders are not up to date. They refresh when the connection returns.' : e.message);
    }
  }

  private clearLists(): void {
    this._queue.set([]);
    this._mine.set([]);
    this._arrivals.set([]);
    this._error.set(null);
    this.loadedBranch = null;
    this.seenQueue.clear();
    this.seenAttention.clear();
  }

  private reset(): void {
    this._enabled.set(false);
    this.startedFor = null;
    this.clearLists();
  }
}

/** One key per thing that calls the attendant: the order becoming ready, and each item that cannot be made. */
function attentionKey(o: BarOrderDto): string {
  return `${o.id}:${o.status}:${o.items.filter((i) => i.status === 'CantMake' && !i.acknowledged).map((i) => i.id).join(',')}`;
}

const MUTE_KEY = 'zp.bar.muted';

function readMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

/**
 * A short two-note sound made in the browser (no audio file to load, so it also works offline): rising for a new order at the bar,
 * falling for "your order is ready". Browsers only allow sound after the person has touched the page; a refusal is simply silent.
 */
function chime(falling: boolean): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes = falling ? [880, 660] : [660, 880];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const at = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      osc.start(at);
      osc.stop(at + 0.17);
    });
    setTimeout(() => void ctx.close().catch(() => undefined), 800);
  } catch { /* sound is a convenience; the prompt on screen is what matters */ }
}

/** "just now", "4 min", "1 h 20 min": how long ago something happened, for a queue where minutes matter. */
export function elapsed(fromUtc: string | null, now: number): string {
  if (!fromUtc) return '';
  const start = Date.parse(fromUtc.endsWith('Z') || /[+-]\d\d:\d\d$/.test(fromUtc) ? fromUtc : `${fromUtc}Z`);
  if (Number.isNaN(start)) return '';
  const minutes = Math.max(0, Math.floor((now - start) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/** Where to take it: "Table 12", else the tab or guest name, else the bill number. */
export function placeOf(o: BarOrderDto): string {
  if (o.tableLabel) return `Table ${o.tableLabel}`;
  return o.label ?? o.customerName ?? `Bill #${o.orderNumber}`;
}
