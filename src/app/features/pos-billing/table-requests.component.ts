import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { FEATURES } from '../../core/models/rbac.model';
import { TableRequestDto } from '../../core/models/table-ordering.model';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { chime } from '../../core/services/bar.services';
import { TableOrdersApi } from '../../core/services/table-ordering.service';
import { DialogComponent, ToastService } from '../../shared/ui/feedback';

/**
 * What customers have sent from their tables, for the till: a button with a count, a sound when something new arrives, and a list where staff accept an order onto the
 * table's bill (changing or removing items first if they need to) or decline it with a reason the customer will see, and mark a call for a waiter or the bill as done.
 * Accepting puts the items on the bill as lines still to send, in the accepter's name; nothing reaches a kitchen or the bar until they press Send as usual.
 */
@Component({
  selector: 'zp-table-requests',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, DialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (on()) {
      <button type="button" class="btn-outline px-3 py-1.5 text-sm" data-testid="table-requests-btn" [class.ring-2]="requests().length > 0" (click)="show()">
        Table requests@if (requests().length) { <span class="app-badge app-badge-warning ml-1" data-testid="table-requests-count">{{ requests().length }}</span> }
      </button>
      <zp-dialog [open]="open()" title="From the tables" [wide]="true" (closed)="open.set(false)">
        <div class="space-y-3" data-testid="table-requests">
          @if (error()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="tr-error">{{ error() }}</p> }
          @for (r of requests(); track r.id) {
            <article class="rounded-lg border border-ink/15 p-3" [attr.data-testid]="'tr-' + r.number">
              <div class="flex flex-wrap items-baseline justify-between gap-2">
                <h3 class="font-semibold">Table {{ r.tableName }}@if (r.customerName) { <span class="font-normal text-ink/70">, {{ r.customerName }}</span> }</h3>
                <span class="text-xs text-ink/70">{{ minutes(r) }} min ago</span>
              </div>
              @if (r.kind === 'waiter') { <p class="mt-1 text-sm" [attr.data-testid]="'tr-what-' + r.number">Is asking for a waiter.</p> }
              @else if (r.kind === 'bill') { <p class="mt-1 text-sm" [attr.data-testid]="'tr-what-' + r.number">Is asking for the bill.</p> }
              @else {
                <ul class="mt-2 space-y-1 text-sm">
                  @for (i of r.items; track i.id) {
                    <li class="flex items-center justify-between gap-2">
                      <span class="min-w-0 flex-1">{{ i.name }}@if (i.options) { <span class="text-ink/70"> ({{ i.options }})</span> }@if (i.note) { <span class="text-ink/70"> - {{ i.note }}</span> }</span>
                      <span class="flex items-center gap-1">
                        <button type="button" class="btn-outline h-8 w-8 p-0" [attr.aria-label]="'Fewer ' + i.name" (click)="step(r, i.id, i.quantity, -1)">-</button>
                        <span class="w-7 text-center font-mono" [attr.data-testid]="'tr-qty-' + r.number + '-' + i.name">{{ quantityOf(r, i.id, i.quantity) }}</span>
                        <button type="button" class="btn-outline h-8 w-8 p-0" [attr.aria-label]="'More ' + i.name" (click)="step(r, i.id, i.quantity, 1)">+</button>
                      </span>
                    </li>
                  }
                </ul>
                @if (r.note) { <p class="mt-2 text-sm text-ink/80">Note: {{ r.note }}</p> }
                <p class="mt-1 text-sm text-ink/70">The customer was shown {{ r.total | currency: currency() : 'symbol-narrow' : '1.2-2' }}; the bill is priced by the till.</p>
              }

              @if (declining() === r.id) {
                <div class="mt-2 flex flex-wrap items-end gap-2">
                  <div class="min-w-[12rem] flex-1"><label class="app-label" [for]="'tr-r-' + r.number">What the customer will see</label>
                    <input class="app-input" [id]="'tr-r-' + r.number" maxlength="200" [attr.data-testid]="'tr-reason-' + r.number" [ngModel]="reason()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="reason.set($event)" placeholder="For example: we have run out of that" /></div>
                  <button type="button" class="btn-ghost" (click)="declining.set(null)">Back</button>
                  <button type="button" class="btn-primary" [attr.data-testid]="'tr-decline-confirm-' + r.number" [disabled]="busy() || reason().trim().length < 3" (click)="decline(r)">Decline</button>
                </div>
              } @else {
                <div class="mt-3 flex flex-wrap justify-end gap-2">
                  @if (r.kind === 'order') {
                    <button type="button" class="btn-ghost" [attr.data-testid]="'tr-decline-' + r.number" [disabled]="busy()" (click)="askDecline(r)">Decline</button>
                    <button type="button" class="btn-primary" [attr.data-testid]="'tr-accept-' + r.number" [disabled]="busy()" (click)="accept(r)">Accept onto the bill</button>
                  } @else {
                    <button type="button" class="btn-primary" [attr.data-testid]="'tr-done-' + r.number" [disabled]="busy()" (click)="done(r)">Done</button>
                  }
                </div>
              }
            </article>
          } @empty { <p class="py-6 text-center text-ink/70" data-testid="tr-none">Nothing is waiting from the tables.</p> }
        </div>
      </zp-dialog>
    }
  `
})
export class TableRequestsComponent {
  private readonly api = inject(TableOrdersApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  /** The branch whose tables are shown. */
  readonly branchId = input<string | null>(null);
  readonly online = input(true);
  readonly currency = input('NGN');

  /** A bill that received items: the till opens it. */
  readonly billChanged = output<string>();

  protected readonly requests = signal<readonly TableRequestDto[]>([]);
  protected readonly open = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly declining = signal<string | null>(null);
  protected readonly reason = signal('');
  protected readonly edits = signal<Readonly<Record<string, number>>>({});

  private first = true;
  private seen = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;

  protected on = (): boolean => this.auth.accessModeFor(FEATURES.TABLE_ORDERING) === 'full' && !!this.branchId();

  constructor() {
    // Looked at when the branch changes, and then every few seconds while the till is open and online.
    effect(() => {
      const branch = this.branchId();
      const online = this.online();
      untracked(() => {
        this.stop();
        this.first = true;
        this.seen = new Set();
        this.requests.set([]);
        if (branch && online && this.on()) { void this.load(); this.timer = setInterval(() => void this.load(), 8000); }
      });
    }, { allowSignalWrites: true });
    this.destroyRef.onDestroy(() => this.stop());
  }

  private stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  protected minutes(r: TableRequestDto): number {
    const at = new Date(r.createdAtUtc.endsWith('Z') ? r.createdAtUtc : r.createdAtUtc + 'Z').getTime();
    return Math.max(0, Math.floor((Date.now() - at) / 60000));
  }

  private async load(): Promise<void> {
    const branch = this.branchId();
    if (!branch) return;
    try {
      const list = await firstValueFrom(this.api.list(branch));
      const arrived = list.filter((r) => !this.seen.has(r.id));
      list.forEach((r) => this.seen.add(r.id));
      if (!this.first && arrived.length > 0) chime(false);                  // something new: a sound, then it is on the list
      this.first = false;
      this.requests.set(list);
    } catch { /* the list is read again in a few seconds; a till that cannot reach the server shows what it had */ }
  }

  protected show(): void {
    this.error.set(null);
    this.declining.set(null);
    this.open.set(true);
    void this.load();
  }

  protected quantityOf(r: TableRequestDto, itemId: string, asked: number): number { return this.edits()[`${r.id}:${itemId}`] ?? asked; }

  protected step(r: TableRequestDto, itemId: string, asked: number, delta: number): void {
    const next = Math.max(0, Math.min(200, this.quantityOf(r, itemId, asked) + delta));
    this.edits.update((e) => ({ ...e, [`${r.id}:${itemId}`]: next }));
  }

  protected async accept(r: TableRequestDto): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const quantities: Record<string, number> = {};
      for (const i of r.items) { const q = this.quantityOf(r, i.id, i.quantity); if (q !== i.quantity) quantities[i.id] = q; }
      const done = await firstValueFrom(this.api.accept(r.id, { quantities }));
      this.toast.success(`Accepted: the items are on table ${r.tableName}'s bill, ready to send.`);
      await this.load();
      if (done.acceptedOrderId) this.billChanged.emit(done.acceptedOrderId);
      if (this.requests().length === 0) this.open.set(false);
    } catch (err) { this.error.set(toApiError(err).message); }
    finally { this.busy.set(false); }
  }

  protected askDecline(r: TableRequestDto): void {
    this.reason.set('');
    this.declining.set(r.id);
  }

  protected async decline(r: TableRequestDto): Promise<void> {
    if (this.busy() || this.reason().trim().length < 3) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.decline(r.id, this.reason().trim()));
      this.declining.set(null);
      this.toast.success('Declined. The customer sees your reason.');
      await this.load();
    } catch (err) { this.error.set(toApiError(err).message); }
    finally { this.busy.set(false); }
  }

  protected async done(r: TableRequestDto): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try { await firstValueFrom(this.api.done(r.id)); await this.load(); }
    catch (err) { this.error.set(toApiError(err).message); }
    finally { this.busy.set(false); }
  }
}
