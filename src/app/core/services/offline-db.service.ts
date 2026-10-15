import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { LocalOrder, SyncKind } from '../models/ops.model';

/**
 * A change made on this device that the server has not confirmed yet. It is tied to the TENANT and the signed-in MEMBER who made
 * it: the server authorises every queued operation as whoever sends it, so another person signing in on the same device must never
 * replay someone else's queue.
 */
export interface QueuedOperation {
  clientOperationId: string;
  tenantId: string;
  membershipId: string;
  kind: SyncKind;
  payload: unknown;
  createdAtUtc: string;
  createdAt: number;
  attempts: number;
  status: 'pending' | 'rejected';
  rejection?: { code: string | null; message: string };
  /** The order this operation touches, so the POS can refresh it after a sync. */
  orderId?: string;
  /** Short human label ("Add Gin Shot x2") for the sync-issues list. */
  summary: string;
}

export interface LocalOrderRow {
  id: string;
  tenantId: string;
  branchId: string;
  order: LocalOrder;
  /** True while the stored order contains changes not yet confirmed by the server. */
  dirty: boolean;
}

export interface CachedLookup {
  key: string; // `${tenantId}:products` etc.
  data: unknown;
  cachedAt: number;
}

/** IndexedDB wrapper (Dexie). Every key includes the tenant id, so one browser can serve several companies safely. */
@Injectable({ providedIn: 'root' })
export class OfflineDbService extends Dexie {
  readonly queue!: Table<QueuedOperation, string>;
  readonly orders!: Table<LocalOrderRow, string>;
  readonly lookups!: Table<CachedLookup, string>;

  constructor() {
    super('zestpoint');
    this.version(1).stores({ outbox: 'id, tenantId, kind, createdAt', lookups: 'key' });
    // v2: the placeholder outbox is replaced by the real operation queue and a local order store.
    this.version(2).stores({
      outbox: null,
      queue: 'clientOperationId, tenantId, membershipId, createdAt, status, orderId',
      orders: 'id, tenantId, branchId, dirty',
      lookups: 'key'
    });
  }

  enqueue(op: Omit<QueuedOperation, 'createdAt' | 'attempts' | 'status'>): Promise<string> {
    return this.queue.add({ ...op, createdAt: Date.now(), attempts: 0, status: 'pending' });
  }

  pendingFor(tenantId: string, membershipId: string): Promise<QueuedOperation[]> {
    return this.queue
      .where('tenantId').equals(tenantId)
      .filter((q) => q.membershipId === membershipId && q.status === 'pending')
      .sortBy('createdAt');
  }

  rejectedFor(tenantId: string, membershipId: string): Promise<QueuedOperation[]> {
    return this.queue
      .where('tenantId').equals(tenantId)
      .filter((q) => q.membershipId === membershipId && q.status === 'rejected')
      .sortBy('createdAt');
  }

  async cache<T>(key: string, data: T): Promise<void> {
    await this.lookups.put({ key, data, cachedAt: Date.now() });
  }

  async cached<T>(key: string): Promise<T | null> {
    return ((await this.lookups.get(key))?.data as T | undefined) ?? null;
  }
}
