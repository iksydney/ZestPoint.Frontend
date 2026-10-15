import { Injectable, computed, inject, signal } from '@angular/core';
import { Subject, firstValueFrom } from 'rxjs';
import { SyncOperationDto, SyncOperationResultDto } from '../models/ops.model';
import { toApiError } from './api.util';
import { AuthService } from './auth.service';
import { OfflineDbService, QueuedOperation } from './offline-db.service';
import { SyncApi } from './ops.services';

const BATCH = 50;
const MAX_ATTEMPTS = 5;
const RETRY_MS = 15_000;
/** Server codes that may resolve themselves, so the operation stays queued instead of being rejected for good. */
const TRANSIENT = new Set(['conflict', 'failed']);

/**
 * Replays the operations queued on this device, in order, through POST /api/v1/sync.
 *
 *  - Every operation has a client id and the server remembers the answer, so a dropped connection or a double flush can never
 *    apply a change twice.
 *  - Only the signed-in member's own operations are sent: the server authorises them as the sender.
 *  - "Applied" and "duplicate" operations leave the queue; "rejected" ones stay visible as sync issues with the server's reason
 *    and are never silently dropped.
 */
@Injectable({ providedIn: 'root' })
export class SyncAgentService {
  private readonly db = inject(OfflineDbService);
  private readonly api = inject(SyncApi);
  private readonly auth = inject(AuthService);

  private readonly _online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  private readonly _pending = signal(0);
  private readonly _issues = signal<readonly QueuedOperation[]>([]);
  private readonly _syncing = signal(false);
  private flushing: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly online = this._online.asReadonly();
  readonly pending = this._pending.asReadonly();
  readonly issues = this._issues.asReadonly();
  readonly syncing = this._syncing.asReadonly();
  readonly hasWork = computed(() => this._pending() > 0);

  /** Emits the ids of orders the server has just confirmed or changed, so open screens can refresh them. */
  readonly orderTouched = new Subject<string>();
  /** Emits after any flush that removed operations from the queue. */
  readonly flushed = new Subject<void>();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this._online.set(true);
        void this.flush();
      });
      window.addEventListener('offline', () => this._online.set(false));
      this.timer = setInterval(() => { if (this._pending() > 0) void this.flush(); }, RETRY_MS);
    }
  }

  /** The browser's own signal is unreliable on captive or flaky networks, so a failed request also marks us offline. */
  markOffline(): void {
    this._online.set(false);
  }

  /** Adds an operation to the durable queue and tries to send it straight away. */
  async enqueue(kind: QueuedOperation['kind'], payload: unknown, summary: string, orderId?: string): Promise<void> {
    const tenantId = this.auth.tenantId();
    const membershipId = this.auth.membership()?.id;
    if (!tenantId || !membershipId) throw new Error('Sign in first.');

    await this.db.enqueue({
      clientOperationId: crypto.randomUUID(), tenantId, membershipId, kind, payload, orderId, summary, createdAtUtc: new Date().toISOString()
    });
    await this.refreshCounts();
    if (this._online()) void this.flush();
  }

  async refreshCounts(): Promise<void> {
    const tenantId = this.auth.tenantId();
    const membershipId = this.auth.membership()?.id;
    if (!tenantId || !membershipId) {
      this._pending.set(0);
      this._issues.set([]);
      return;
    }
    this._pending.set((await this.db.pendingFor(tenantId, membershipId)).length);
    this._issues.set(await this.db.rejectedFor(tenantId, membershipId));
  }

  /** Removes a rejected operation the user has read and acknowledged. */
  async dismissIssue(clientOperationId: string): Promise<void> {
    await this.db.queue.delete(clientOperationId);
    await this.refreshCounts();
  }

  /** Sends everything pending. Concurrent callers share the run in progress. */
  flush(): Promise<void> {
    return (this.flushing ??= this.run().finally(() => (this.flushing = null)));
  }

  private async run(): Promise<void> {
    const tenantId = this.auth.tenantId();
    const membershipId = this.auth.membership()?.id;
    if (!tenantId || !membershipId) return;

    this._syncing.set(true);
    try {
      for (;;) {
        const batch = (await this.db.pendingFor(tenantId, membershipId)).slice(0, BATCH);
        if (batch.length === 0) break;

        let results: SyncOperationResultDto[];
        try {
          const operations: SyncOperationDto[] = batch.map((q) => ({
            clientOperationId: q.clientOperationId, kind: q.kind, payload: q.payload, createdAtUtc: q.createdAtUtc
          }));
          results = (await firstValueFrom(this.api.send(operations))).results;
          this._online.set(true);
        } catch (err) {
          const e = toApiError(err);
          if (e.status === 0) this._online.set(false); // keep everything queued; try again when back online
          break;
        }

        let progressed = false;
        for (const r of results) {
          const queued = batch.find((q) => q.clientOperationId === r.clientOperationId);
          if (!queued) continue;
          if (r.outcome === 'applied' || r.outcome === 'duplicate') {
            await this.db.queue.delete(queued.clientOperationId);
            progressed = true;
          } else if (TRANSIENT.has(r.code ?? '') && queued.attempts + 1 < MAX_ATTEMPTS) {
            await this.db.queue.update(queued.clientOperationId, { attempts: queued.attempts + 1 });
          } else {
            await this.db.queue.update(queued.clientOperationId, {
              status: 'rejected', attempts: queued.attempts + 1,
              rejection: { code: r.code, message: r.message ?? 'The server did not accept this change.' }
            });
            progressed = true;
          }
          if (queued.orderId) this.orderTouched.next(queued.orderId);
        }
        // Nothing left the pending set (every result was transient): stop and wait for the next timer tick instead of spinning.
        if (!progressed) break;
      }
    } finally {
      this._syncing.set(false);
      await this.refreshCounts();
      this.flushed.next();
    }
  }
}
