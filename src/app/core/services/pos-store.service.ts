import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { recalculate, round2 } from '../offline/order-calc';
import {
  CategoryDto, CompanySettingsDto, LocalOrder, OrderDto, OrderKind, OrderLineDto, PayRequest, PaymentMethod, ProductDto, SellingUnitDto, VoidAuthorizer
} from '../models/ops.model';
import { ApiError, toApiError } from './api.util';
import { AuthService } from './auth.service';
import { LocalOrderRow, OfflineDbService } from './offline-db.service';
import { CatalogApi, OperationSettingsApi, OrdersApi } from './ops.services';
import { SyncAgentService } from './sync-agent.service';

/** One row of the open-bills list: server bills plus bills that only exist on this device so far. */
export interface OpenBill {
  id: string;
  number: number;
  numberPending: boolean;
  label: string | null;
  tableLabel: string | null;
  kind: OrderKind;
  status: string;
  total: number;
  balance: number;
  itemCount: number;
  pendingSync: boolean;
}

const fromServer = (o: OrderDto): LocalOrder => ({ ...o, pendingSync: false, numberPending: false });

/**
 * Offline-first POS state. Every sale-floor change (open a bill, add or change items, send, discount, tip, take cash, request a
 * void) is applied to the bill on screen immediately AND appended to a durable queue that syncs idempotently. The server then
 * recomputes the totals and its answer replaces the local figures. Card and transfer payments, splits, merges, refunds and
 * receipts need the server and say so.
 */
@Injectable({ providedIn: 'root' })
export class PosStore {
  private readonly auth = inject(AuthService);
  private readonly db = inject(OfflineDbService);
  private readonly sync = inject(SyncAgentService);
  private readonly catalogApi = inject(CatalogApi);
  private readonly ordersApi = inject(OrdersApi);
  private readonly settingsApi = inject(OperationSettingsApi);

  private readonly _products = signal<readonly ProductDto[]>([]);
  private readonly _categories = signal<readonly CategoryDto[]>([]);
  private readonly _settings = signal<CompanySettingsDto | null>(null);
  private readonly _bills = signal<readonly OpenBill[]>([]);
  private readonly _current = signal<LocalOrder | null>(null);
  private readonly _catalogOffline = signal(false);

  readonly products = this._products.asReadonly();
  readonly categories = this._categories.asReadonly();
  readonly settings = this._settings.asReadonly();
  readonly bills = this._bills.asReadonly();
  readonly current = this._current.asReadonly();
  /** True when the catalogue on screen came from the device cache, not the server. */
  readonly catalogFromCache = this._catalogOffline.asReadonly();
  readonly currency = computed(() => this._current()?.currencyCode ?? this._settings()?.currencyCode ?? 'USD');

  private branchId: string | null = null;

  constructor() {
    // When the server confirms changes to an order, take its figures.
    this.sync.orderTouched.subscribe((id) => void this.reconcile(id));
    this.sync.flushed.subscribe(() => void this.refreshBills());
  }

  private get tenantId(): string {
    const t = this.auth.tenantId();
    if (!t) throw new Error('Sign in first.');
    return t;
  }

  // ---- Catalogue and settings --------------------------------------------------------------------

  async loadCatalog(branchId: string): Promise<void> {
    this.branchId = branchId;
    const tenant = this.tenantId;
    try {
      const [products, categories, settings] = await Promise.all([
        firstValueFrom(this.catalogApi.products({ branchId, activeOnly: true, pageSize: 500 })),
        firstValueFrom(this.catalogApi.categories()),
        firstValueFrom(this.settingsApi.get())
      ]);
      this._products.set(products.items);
      this._categories.set(categories.filter((c) => c.isActive));
      this._settings.set(settings);
      this._catalogOffline.set(false);
      await Promise.all([
        this.db.cache(`${tenant}:products`, products.items),
        this.db.cache(`${tenant}:categories`, categories),
        this.db.cache(`${tenant}:settings`, settings)
      ]);
    } catch (err) {
      if (toApiError(err).status === 0) this.sync.markOffline();
      this._products.set((await this.db.cached<ProductDto[]>(`${tenant}:products`)) ?? []);
      this._categories.set(((await this.db.cached<CategoryDto[]>(`${tenant}:categories`)) ?? []).filter((c) => c.isActive));
      this._settings.set(await this.db.cached<CompanySettingsDto>(`${tenant}:settings`));
      this._catalogOffline.set(true);
    }
  }

  // ---- Bills --------------------------------------------------------------------------------------

  async refreshBills(): Promise<void> {
    if (!this.auth.tenantId() || !this.branchId) return;
    const branchId = this.branchId;
    const tenant = this.tenantId;

    const local = await this.db.orders.where('tenantId').equals(tenant).filter((r) => r.branchId === branchId).toArray();
    const localById = new Map(local.map((r) => [r.id, r]));
    const rows = new Map<string, OpenBill>();

    try {
      const page = await firstValueFrom(this.ordersApi.list({ branchId, openOnly: true, pageSize: 100 }));
      for (const s of page.items) {
        // A bill with unsynced local changes shows the local figures until the server has caught up.
        const l = localById.get(s.id);
        rows.set(s.id, l?.dirty ? this.billOf(l.order) : { ...s, numberPending: false, pendingSync: false });
      }
    } catch (err) {
      if (toApiError(err).status === 0) this.sync.markOffline();
    }

    for (const r of local) {
      const editable = r.order.status === 'Open' || r.order.status === 'PartiallyPaid';
      if ((r.dirty && editable) || (!rows.has(r.id) && editable && !this.sync.online())) rows.set(r.id, this.billOf(r.order));
    }
    this._bills.set([...rows.values()].sort((a, b) => b.number - a.number || a.label?.localeCompare(b.label ?? '') || 0));
  }

  private billOf(o: LocalOrder): OpenBill {
    return {
      id: o.id, number: o.number, numberPending: o.numberPending, label: o.label, tableLabel: o.tableLabel, kind: o.kind, status: o.status,
      total: o.total, balance: o.balance, itemCount: o.lines.filter((l) => l.status === 'Active').length, pendingSync: o.pendingSync
    };
  }

  async open(id: string): Promise<void> {
    const row = await this.db.orders.get(id);
    if (row?.dirty) {
      this._current.set(row.order);
      return;
    }
    try {
      const server = fromServer(await firstValueFrom(this.ordersApi.get(id)));
      await this.save(server, false);
      this._current.set(server);
    } catch (err) {
      if (row) this._current.set(row.order);
      else throw toApiError(err);
    }
  }

  close(): void {
    this._current.set(null);
  }

  async create(kind: OrderKind, label: string | null, tableLabel: string | null): Promise<void> {
    if (!this.branchId) throw new Error('Choose a branch first.');
    const s = this._settings();
    const me = this.auth.membership();
    const order: LocalOrder = recalculate({
      id: crypto.randomUUID(), branchId: this.branchId, number: 0, kind, status: 'Open', label, tableLabel, customerName: null, notes: null,
      ownerMembershipId: me?.id ?? '', ownerName: me?.displayName ?? null, taxName: s?.taxName ?? 'Tax', taxRatePercent: s?.taxRatePercent ?? 0,
      taxInclusive: s?.taxInclusive ?? false, currencyCode: s?.currencyCode ?? this.auth.tenant()?.currencyCode ?? 'USD', subtotal: 0,
      discountTotal: 0, orderDiscount: 0, taxTotal: 0, tipAmount: 0, total: 0, amountPaid: 0, refundedTotal: 0, balance: 0,
      openedAtUtc: new Date().toISOString(), closedAtUtc: null, mergedIntoOrderId: null, lines: [], payments: [], hasPendingVoids: false,
      rowVersion: '', pendingSync: true, numberPending: true
    });
    await this.commit(order, 'order.create', { id: order.id, branchId: order.branchId, kind, label, tableLabel }, `Open ${label ?? 'bill'}`);
  }

  // ---- Editing (offline-first) ----------------------------------------------------------------------

  /** `unit` sells one of the product's selling units (a case): its price is the item's price times what it holds, as the server will set it. */
  async addProduct(product: ProductDto, quantity: number, modifierIds: string[] = [], seat: number | null = null, serialNumber: string | null = null, unit: SellingUnitDto | null = null): Promise<void> {
    const o = this.requireEditable();
    const mods = product.modifiers.filter((m) => modifierIds.includes(m.id) && m.isActive);
    const line: OrderLineDto = {
      id: crypto.randomUUID(), productId: product.id, productName: unit ? `${product.name} (${unit.name} of ${unit.size})` : product.name,
      unitPrice: unit ? round2(product.price * unit.size) : product.price, sellingUnitId: unit?.id ?? null, unitSize: unit?.size ?? null, quantity, seat, serialNumber, notes: null,
      modifiers: mods.map((m) => ({ id: m.id, name: m.name, priceDelta: m.priceDelta })), modifierTotal: round2(mods.reduce((s, m) => s + m.priceDelta, 0)),
      discountAmount: 0, lineTotal: 0, status: 'Active', confirmed: false, voidReason: null, voidPending: false,
      taxExempt: product.taxExempt ?? false, onSpecial: product.onSpecial ?? false, blockDiscount: product.blockDiscount ?? false
    };
    await this.commit(
      recalculate({ ...o, lines: [...o.lines, line] }), 'order.line.add',
      { orderId: o.id, id: line.id, productId: product.id, quantity, seat, notes: null, modifierIds, serialNumber, sellingUnitId: unit?.id ?? null }, `Add ${line.productName}${serialNumber ? ' (' + serialNumber + ')' : ''} x${quantity}`
    );
  }

  async setQuantity(lineId: string, quantity: number): Promise<void> {
    const o = this.requireEditable();
    const line = o.lines.find((l) => l.id === lineId);
    if (!line || line.confirmed) return;
    await this.commit(
      recalculate({ ...o, lines: o.lines.map((l) => (l.id === lineId ? { ...l, quantity } : l)) }), 'order.line.update',
      { orderId: o.id, lineId, quantity, seat: line.seat, notes: line.notes }, `Change ${line.productName} to x${quantity}`
    );
  }

  async removeLine(lineId: string): Promise<void> {
    const o = this.requireEditable();
    const line = o.lines.find((l) => l.id === lineId);
    if (!line || line.confirmed) return;
    await this.commit(
      recalculate({ ...o, lines: o.lines.map((l) => (l.id === lineId ? { ...l, status: 'Voided' as const, voidReason: 'Removed before sending' } : l)) }),
      'order.line.remove', { orderId: o.id, lineId }, `Remove ${line.productName}`
    );
  }

  async confirm(): Promise<void> {
    const o = this.requireEditable();
    if (!o.lines.some((l) => l.status === 'Active' && !l.confirmed)) return;
    await this.commit(
      { ...o, lines: o.lines.map((l) => (l.status === 'Active' ? { ...l, confirmed: true } : l)) }, 'order.confirm', { orderId: o.id }, 'Send order'
    );
  }

  async setTip(amount: number): Promise<void> {
    const o = this.requireEditable();
    await this.commit(recalculate({ ...o, tipAmount: round2(amount) }), 'order.tip', { orderId: o.id, amount: round2(amount) }, 'Set tip');
  }

  async setOrderDiscount(input: { amount?: number; percent?: number; reason: string }): Promise<void> {
    const o = this.requireEditable();
    const basis = o.subtotal - o.discountTotal;
    const amount = input.amount ?? round2((basis * (input.percent ?? 0)) / 100);
    await this.commit(
      recalculate({ ...o, orderDiscount: amount }), 'order.discount',
      { orderId: o.id, amount: input.amount ?? null, percent: input.percent ?? null, reason: input.reason }, 'Apply discount'
    );
  }

  /** Cash is single-phase and works offline; the change is the tendered amount minus what was due. */
  async payCash(amount: number, tendered: number, tip: number): Promise<void> {
    const o = this.requireEditable();
    const key = `pay-${crypto.randomUUID()}`;
    const withTip = tip > 0 ? { ...o, tipAmount: round2(o.tipAmount + tip) } : o;
    const payment = {
      id: crypto.randomUUID(), method: 'Cash' as PaymentMethod, status: 'Succeeded' as const, amount, tipAmount: tip, cashTendered: tendered,
      changeGiven: round2(tendered - amount), provider: 'cash', providerReference: null, failureReason: null, isDemo: false,
      completedAtUtc: new Date().toISOString(), refunded: 0
    };
    const next = recalculate({
      ...withTip, amountPaid: round2(o.amountPaid + amount), payments: [...o.payments, payment],
      lines: o.lines.map((l) => (l.status === 'Active' ? { ...l, confirmed: true } : l))
    });
    await this.commit(next, 'payment.cash', { orderId: o.id, method: 'Cash', amount, tip, cashTendered: tendered, idempotencyKey: key }, `Cash payment ${amount.toFixed(2)}`);
  }

  /**
   * Voids a sent item, or the whole bill when no line is given. Never queued: a supervisor's or an administrator's credentials are checked
   * by the server for this void, so it needs a connection and a bill the server already has. The credentials are passed straight through.
   */
  async voidWithAuthoriser(lineId: string | null, reason: string, wasted: boolean, authorizer: VoidAuthorizer): Promise<void> {
    this.requireEditable();
    const body = { reason, wasted, authorizer };
    await this.serverAction((id) => firstValueFrom(lineId ? this.ordersApi.voidLine(id, lineId, body) : this.ordersApi.voidOrder(id, body)), 'Voids');
    await this.refreshBills();
  }

  // ---- Server-only actions ----------------------------------------------------------------------------

  /** Card / transfer: needs the network and a bill the server already knows. Throws an ApiError with a plain message otherwise. */
  async payOnline(input: { method: PaymentMethod; amount: number; tip: number; token: string | null }): Promise<OrderDto> {
    const o = this.requireEditable();
    await this.ensureSynced(o.id, 'Card and transfer payments');
    const body: PayRequest = {
      method: input.method, amount: input.amount, tip: input.tip, cashTendered: null, token: input.token, idempotencyKey: `pay-${crypto.randomUUID()}`, rowVersion: null
    };
    try {
      const server = await firstValueFrom(this.ordersApi.pay(o.id, body));
      await this.adopt(server);
      return server;
    } catch (err) {
      const e = toApiError(err);
      if (e.status === 0) this.sync.markOffline();
      // A declined card still leaves a failed payment on the bill; show it.
      await this.reload(o.id);
      throw e;
    }
  }

  /** Runs a server action (split, merge, transfer, void bill, refund) on a synced bill and adopts the result. */
  async serverAction(run: (id: string) => Promise<OrderDto>, what: string): Promise<OrderDto> {
    const o = this._current();
    if (!o) throw new Error('Open a bill first.');
    await this.ensureSynced(o.id, what);
    try {
      const server = await run(o.id);
      await this.adopt(server);
      return server;
    } catch (err) {
      const e = toApiError(err);
      if (e.status === 0) this.sync.markOffline();
      throw e;
    }
  }

  async reload(id: string): Promise<void> {
    try {
      await this.adopt(await firstValueFrom(this.ordersApi.get(id)));
    } catch { /* keep what we have */ }
  }

  // ---- internals ----------------------------------------------------------------------------------------

  private requireEditable(): LocalOrder {
    const o = this._current();
    if (!o) throw new Error('Open or start a bill first.');
    if (o.status !== 'Open' && o.status !== 'PartiallyPaid') throw new ApiError(`This bill is ${o.status.toLowerCase()} and cannot be changed.`, 409, 'conflict', {});
    return o;
  }

  /** Applies a change locally, stores it, and queues the matching operation. */
  private async commit(order: LocalOrder, kind: Parameters<SyncAgentService['enqueue']>[0], payload: unknown, summary: string): Promise<void> {
    const next = { ...order, pendingSync: true };
    await this.save(next, true);
    this._current.set(next);
    await this.sync.enqueue(kind, payload, summary, order.id);
    await this.refreshBills();
  }

  private async save(order: LocalOrder, dirty: boolean): Promise<void> {
    const row: LocalOrderRow = { id: order.id, tenantId: this.tenantId, branchId: order.branchId, order, dirty };
    await this.db.orders.put(row);
  }

  private async hasQueued(orderId: string): Promise<boolean> {
    const me = this.auth.membership()?.id;
    return (await this.db.queue.where('orderId').equals(orderId).filter((q) => q.membershipId === me).count()) > 0;
  }

  private async ensureSynced(orderId: string, what: string): Promise<void> {
    if (await this.hasQueued(orderId)) {
      await this.sync.flush();
      if (await this.hasQueued(orderId))
        throw new ApiError(`${what} need a connection and this bill to be fully synced first. Try again in a moment.`, 0, 'offline', {});
    }
  }

  /** Replaces the local bill with the server's version once nothing is waiting to sync for it. */
  private async reconcile(orderId: string): Promise<void> {
    if (!this.auth.tenantId()) return;
    if (await this.hasQueued(orderId)) return;
    await this.reload(orderId);
  }

  private async adopt(server: OrderDto): Promise<void> {
    const local = fromServer(server);
    if (await this.hasQueued(server.id)) return; // newer local edits are still waiting; the next sync will bring the server's answer
    await this.save(local, false);
    if (this._current()?.id === server.id) this._current.set(local);
    await this.refreshBills();
  }
}
