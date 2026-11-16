import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CashMovementRequest, CloseShiftRequest, OpenShiftRequest, ShiftDto } from '../models/nav-ops.model';
import { toApiError } from './api.util';
import { AuthService } from './auth.service';
import { BranchContextService } from './branch-context.service';
import { ShiftApi } from './nav-ops.services';
import { OfflineDbService } from './offline-db.service';
import { SyncAgentService } from './sync-agent.service';

/**
 * The person's own shift, offline-first. Online it calls the API; offline (or while earlier shift changes are still waiting to sync, so
 * order is kept) it saves the change in the same durable queue the till uses and shows it at once. Cash sales taken meanwhile attach to
 * the shift when they sync, and the server then works out the real expected cash: until then the screen says so and shows only what
 * this device knows.
 */
@Injectable({ providedIn: 'root' })
export class ShiftStore {
  private readonly api = inject(ShiftApi);
  private readonly auth = inject(AuthService);
  private readonly db = inject(OfflineDbService);
  private readonly sync = inject(SyncAgentService);
  private readonly branches = inject(BranchContextService);

  private readonly _current = signal<ShiftDto | null>(null);
  private readonly _waiting = signal(false);
  private readonly _local = signal(false);

  readonly current = this._current.asReadonly();

  /** True while this view comes from the device because shift changes are waiting to sync. */
  readonly waitingToSync = this._waiting.asReadonly();

  /** The expected-cash figure only knows what this device knows; the server recalculates when the queue is sent. */
  readonly figuresIncomplete = computed(() => this._waiting() && this._local());

  constructor() {
    this.sync.flushed.subscribe(() => { if (this._waiting()) void this.load(); });
  }

  private key(): string | null {
    const t = this.auth.tenantId();
    const m = this.auth.membership()?.id;
    return t && m ? `${t}:${m}:shift` : null;
  }

  private async pendingShiftOps(): Promise<boolean> {
    const t = this.auth.tenantId();
    const m = this.auth.membership()?.id;
    if (!t || !m) return false;
    return (await this.db.pendingFor(t, m)).some((q) => q.kind.startsWith('shift.'));
  }

  private async save(shift: ShiftDto | null): Promise<void> {
    const k = this.key();
    if (k) await this.db.cache(k, shift);
  }

  /** Loads the current shift from the server, or from this device when offline or when shift changes are still queued. */
  async load(): Promise<void> {
    const k = this.key();
    const queued = await this.pendingShiftOps();
    if (!queued) {
      try {
        const s = await firstValueFrom(this.api.current());
        this._current.set(s);
        this._waiting.set(false);
        this._local.set(false);
        await this.save(s);
        return;
      } catch (err) {
        if (toApiError(err).status !== 0) throw err;
      }
    }
    // Offline, or earlier shift changes are not on the server yet: show what this device recorded.
    this._current.set(k ? await this.db.cached<ShiftDto | null>(k) : null);
    this._waiting.set(true);
    this._local.set(true);
  }

  async open(req: OpenShiftRequest): Promise<ShiftDto> {
    if (!(await this.pendingShiftOps())) {
      try {
        const s = await firstValueFrom(this.api.open(req));
        this._current.set(s); this._waiting.set(false); this._local.set(false);
        await this.save(s);
        return s;
      } catch (err) {
        if (toApiError(err).status !== 0) throw err;
      }
    }
    const branch = this.branches.branches().find((b) => b.id === req.branchId);
    const now = new Date().toISOString();
    const local: ShiftDto = {
      id: req.id, number: 0, branchId: req.branchId, branchName: branch?.name ?? '', terminalId: '' /* assigned by the server when this open syncs */, membershipId: this.auth.membership()?.id ?? '',
      staffName: this.auth.membership()?.displayName ?? '', status: 'Open', businessDate: now.slice(0, 10), openedAtUtc: now, openingFloat: req.openingFloat, closedAtUtc: null,
      expectedCash: null, countedCash: null, variance: null, closingNotes: null, reviewedByName: null, reviewedAtUtc: null, reviewNote: null,
      currencyCode: this.auth.tenant()?.currencyCode ?? '', rowVersion: '',
      cash: { openingFloat: req.openingFloat, cashSales: 0, cashRefunds: 0, cashIn: 0, cashOut: 0, expectedCash: req.openingFloat, cardSales: 0, transferSales: 0, otherSales: 0, pointsSales: 0, giftCardSales: 0, paymentCount: 0 },
      movements: []
    };
    await this.sync.enqueue('shift.open', { ...req, clientAtUtc: now }, `Start shift at ${branch?.name ?? 'this branch'}`);
    this._current.set(local); this._waiting.set(true); this._local.set(true);
    await this.save(local);
    return local;
  }

  async addMovement(shift: ShiftDto, req: CashMovementRequest): Promise<ShiftDto> {
    if (!this._waiting() && !(await this.pendingShiftOps())) {
      try {
        const s = await firstValueFrom(this.api.cashMovement(shift.id, req));
        this._current.set(s);
        await this.save(s);
        return s;
      } catch (err) {
        if (toApiError(err).status !== 0) throw err;
      }
    }
    const now = new Date().toISOString();
    const isIn = req.kind === 'CashIn';
    const cash = { ...shift.cash, cashIn: shift.cash.cashIn + (isIn ? req.amount : 0), cashOut: shift.cash.cashOut + (isIn ? 0 : req.amount) };
    cash.expectedCash = Math.round((cash.openingFloat + cash.cashSales - cash.cashRefunds + cash.cashIn - cash.cashOut) * 100) / 100;
    const updated: ShiftDto = { ...shift, cash, movements: [...shift.movements, { id: req.id, kind: req.kind, amount: req.amount, reason: req.reason, staffName: this.auth.membership()?.displayName ?? null, occurredAtUtc: now }] };
    await this.sync.enqueue('shift.cash_movement', { ...req, shiftId: shift.id, clientAtUtc: now }, `${isIn ? 'Add' : 'Remove'} cash: ${req.reason}`);
    this._current.set(updated); this._waiting.set(true); this._local.set(true);
    await this.save(updated);
    return updated;
  }

  /** Returns the closed shift when the server answered, or null when the close was queued (the screen then says it is waiting). */
  async close(shift: ShiftDto, req: CloseShiftRequest): Promise<ShiftDto | null> {
    if (!this._waiting() && !(await this.pendingShiftOps())) {
      try {
        const s = await firstValueFrom(this.api.close(shift.id, req));
        this._current.set(s.status === 'Closed' ? null : s);
        await this.save(s.status === 'Closed' ? null : s);
        return s;
      } catch (err) {
        if (toApiError(err).status !== 0) throw err;
      }
    }
    await this.sync.enqueue('shift.close', { ...req, shiftId: shift.id, rowVersion: null, clientAtUtc: new Date().toISOString() }, `Close shift (counted ${req.countedCash.toFixed(2)})`);
    this._current.set(null);
    this._waiting.set(true);
    this._local.set(false);
    await this.save(null);
    return null;
  }
}
