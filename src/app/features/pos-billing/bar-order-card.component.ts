import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BarOrderDto, BarOrderStatus } from '../../core/models/ops.model';
import { elapsed, placeOf } from '../../core/services/bar.services';

const STATUS_LABEL: Record<BarOrderStatus, string> = {
  New: 'Waiting', Taken: 'Preparing', Ready: 'Ready', Collected: 'Collected', CantMake: "Can't make", Cancelled: 'Cancelled'
};

/**
 * One bar order, as a card. `side="bar"` is the bar man's view (take, can't make, ready, hand back); `side="mine"` is the attendant's
 * view of an order they sent (where it is, collect it, confirm an item that could not be made). The card only asks; the parent calls the
 * API, and the server decides whether the person may.
 */
@Component({
  selector: 'zp-bar-order-card',
  standalone: true,
  imports: [DecimalPipe, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (order(); as o) {
      <article class="rounded-xl border bg-panel p-3 text-ink" [class]="o.needsAttention && side() === 'mine' ? 'border-primary' : 'border-ink/15'" [attr.data-testid]="'bar-order-' + place()" [attr.data-status]="o.status">
        <header class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <h3 class="truncate text-lg font-bold leading-tight" data-testid="bar-place">{{ place() }}</h3>
            <p class="text-xs text-ink/70">
              Bill #{{ o.orderNumber }}
              @if (side() === 'bar') { &middot; from <span class="font-semibold text-ink" data-testid="bar-from">{{ o.requestedByName }}</span> }
              &middot; sent {{ age() }}{{ age() === 'just now' ? '' : ' ago' }}
            </p>
          </div>
          <span class="app-badge shrink-0" [class]="badge()" data-testid="bar-status">{{ statusLabel() }}</span>
        </header>

        @if (o.orderNotes) { <p class="mt-2 rounded-lg bg-ink/5 px-2 py-1 text-sm">Note: {{ o.orderNotes }}</p> }

        <ul class="mt-2 space-y-1.5" data-testid="bar-items">
          <!-- The same thing in the same state is one line with its total, however many times it was added: "3 x Beer", not three lines. -->
          @for (i of collated(); track i.key) {
            <li class="flex items-start justify-between gap-2 text-sm" [class.opacity-60]="i.status === 'Cancelled'" [attr.data-testid]="'bar-item-' + i.productName" [attr.data-quantity]="i.quantity">
              <div class="min-w-0">
                <p class="font-medium" [class.line-through]="i.status === 'Cancelled'"><span class="font-bold">{{ i.quantity | number: '1.0-3' }} x</span> {{ i.productName }}@if (i.seat) { <span class="text-ink/70"> (seat {{ i.seat }})</span> }</p>
                @for (m of i.modifiers; track m) { <p class="text-xs text-ink/70">+ {{ m }}</p> }
                @if (i.notes) { <p class="text-xs text-ink/80">"{{ i.notes }}"</p> }
                @if (i.status === 'CantMake') { <p class="text-xs font-semibold text-danger" role="status" data-testid="bar-cant-reason">Can't make: {{ i.cantMakeReason }}</p> }
              </div>
              @if (i.status === 'Cancelled') { <span class="app-badge bg-ink/10 text-ink/80">voided</span> }
              @else if (i.status === 'Done') { <span class="app-badge app-badge-success">made</span> }
            </li>
          }
        </ul>

        @if (side() === 'bar') {
          @if (o.status === 'New') {
            <button type="button" class="btn-primary touch-target mt-3 w-full" data-testid="bar-take" [disabled]="busy()" (click)="take.emit(o.id)">Take order</button>
          } @else if (o.status === 'Taken' && isMine()) {
            @if (refusing()) {
              <form class="mt-3 space-y-2 rounded-lg border border-ink/15 p-2" (submit)="$event.preventDefault(); submitCantMake()" data-testid="bar-cant-form">
                <fieldset>
                  <legend class="app-label">How many of each can't be made?</legend>
                  @for (g of pendingGroups(); track g.key) {
                    <div class="flex min-h-11 items-center gap-2 text-sm">
                      <input type="number" inputmode="decimal" min="0" [max]="g.quantity" step="any" class="app-input h-10 w-20 px-1 py-0 text-center" [attr.aria-label]="'How many ' + g.productName + ' cannot be made'" [attr.data-testid]="'bar-cant-qty-' + g.productName"
                             [value]="cant()[g.key] || 0" (change)="setCant(g.key, $any($event.target).value, g.quantity, $any($event.target))" />
                      <span class="min-w-0 flex-1">of {{ g.quantity | number: '1.0-3' }} x {{ g.productName }}@for (m of g.modifiers; track m) { <span class="text-ink/70"> + {{ m }}</span> }</span>
                      <button type="button" class="btn-ghost px-2 py-1 text-xs" (click)="setCant(g.key, 0, g.quantity, null)">None</button>
                      <button type="button" class="btn-ghost px-2 py-1 text-xs" (click)="setCant(g.key, g.quantity, g.quantity, null)">All</button>
                    </div>
                  }
                </fieldset>
                <div>
                  <label class="app-label" [attr.for]="'reason-' + o.id">Why? (the attendant sees this)</label>
                  <input class="app-input" [id]="'reason-' + o.id" maxlength="200" placeholder="e.g. Out of tonic" data-testid="bar-cant-reason-input" [ngModel]="reason()" (ngModelChange)="reason.set($event)" [ngModelOptions]="{ standalone: true }" />
                </div>
                <div class="flex justify-end gap-2">
                  <button type="button" class="btn-ghost" (click)="refusing.set(false)">Back</button>
                  <button type="submit" class="btn-outline" data-testid="bar-cant-confirm" [disabled]="busy() || cantTotal() === 0 || reason().trim().length < 3">Tell the attendant</button>
                </div>
              </form>
            } @else {
              <div class="mt-3 grid grid-cols-2 gap-2">
                <button type="button" class="btn-primary touch-target col-span-2" data-testid="bar-ready" [disabled]="busy() || pending().length === 0" (click)="ready.emit(o.id)">Ready: tell {{ o.requestedByName }}</button>
                <button type="button" class="btn-outline min-h-11" data-testid="bar-cant" [disabled]="busy() || pending().length === 0" (click)="startRefusing()">Can't make</button>
                <button type="button" class="btn-ghost min-h-11" data-testid="bar-release" [disabled]="busy()" (click)="release.emit(o.id)">Hand back</button>
              </div>
            }
          } @else if (o.status === 'Taken') {
            <p class="mt-3 text-sm text-ink/80" data-testid="bar-taken-by">{{ o.takenByName }} is preparing this.</p>
          }
        } @else {
          <p class="mt-2 text-sm text-ink/80" data-testid="bar-progress">{{ progress() }}</p>
          @if (o.needsAttention) {
            <button type="button" class="btn-primary touch-target mt-2 w-full" data-testid="bar-acknowledge" [disabled]="busy()" (click)="acknowledge.emit(o.id)">{{ o.status === 'Ready' ? 'Collected' : 'OK, seen' }}</button>
          }
        }
      </article>
    }
  `
})
export class BarOrderCardComponent {
  readonly order = input.required<BarOrderDto>();
  readonly side = input<'bar' | 'mine'>('bar');
  /** The signed-in person's membership id: only the bar man who took an order gets its buttons. */
  readonly me = input<string | null>(null);
  readonly now = input(Date.now());
  readonly busy = input(false);

  readonly take = output<string>();
  readonly release = output<string>();
  readonly ready = output<string>();
  readonly cantMake = output<{ id: string; itemIds: string[]; parts: { itemId: string; quantity: number }[]; reason: string }>();
  readonly acknowledge = output<string>();

  protected readonly refusing = signal(false);
  /** How many of each collated line cannot be made, by the line's key. */
  protected readonly cant = signal<Readonly<Record<string, number>>>({});
  protected readonly cantTotal = computed(() => Object.values(this.cant()).reduce((sum, n) => sum + n, 0));
  protected readonly reason = signal('');

  protected readonly place = computed(() => placeOf(this.order()));
  protected readonly age = computed(() => elapsed(this.order().sentAtUtc, this.now()));
  protected readonly isMine = computed(() => this.order().takenByMembershipId === this.me());
  protected readonly pending = computed(() => this.order().items.filter((i) => i.status === 'Pending'));

  /** The items as the bar reads them: the same product, options, note, seat and state together, with the total. */
  protected readonly collated = computed(() => {
    const groups = new Map<string, { key: string; productName: string; quantity: number; seat: number | null; modifiers: readonly string[]; notes: string | null; status: string; cantMakeReason: string | null; ids: { id: string; quantity: number }[] }>();
    for (const i of this.order().items) {
      const key = [i.productName, (i.modifiers ?? []).join('+'), i.notes ?? '', i.seat ?? '', i.status, i.cantMakeReason ?? ''].join('|');
      const g = groups.get(key);
      if (g) { g.quantity = Math.round((g.quantity + i.quantity) * 1000) / 1000; g.ids.push({ id: i.id, quantity: i.quantity }); }
      else groups.set(key, { key, productName: i.productName, quantity: i.quantity, seat: i.seat ?? null, modifiers: i.modifiers ?? [], notes: i.notes ?? null, status: i.status, cantMakeReason: i.cantMakeReason ?? null, ids: [{ id: i.id, quantity: i.quantity }] });
    }
    return [...groups.values()];
  });
  protected readonly pendingGroups = computed(() => this.collated().filter((g) => g.status === 'Pending'));
  protected readonly statusLabel = computed(() => STATUS_LABEL[this.order().status]);

  protected readonly badge = computed(() => {
    switch (this.order().status) {
      case 'New': return 'app-badge-warning';
      case 'Taken': return 'app-badge-primary';
      case 'Ready': case 'Collected': return 'app-badge-success';
      case 'CantMake': return 'app-badge-danger';
      default: return 'bg-ink/10 text-ink/80';
    }
  });

  /** What the attendant is told about an order they sent. */
  protected readonly progress = computed(() => {
    const o = this.order();
    switch (o.status) {
      case 'New': return 'Waiting for a bar man.';
      case 'Taken': return `${o.takenByName ?? 'A bar man'} is preparing it.`;
      case 'Ready': return `Ready to collect from ${o.takenByName ?? 'the bar'}.`;
      case 'CantMake': return 'The bar could not make this. Void the item(s) on the bill or offer something else.';
      case 'Collected': return 'Collected.';
      default: return 'Every item was voided.';
    }
  });

  /** Starts with everything marked, as most often nothing of the order can be made; the bar man lowers the numbers for what it can. */
  protected startRefusing(): void {
    this.cant.set(Object.fromEntries(this.pendingGroups().map((g) => [g.key, g.quantity])));
    this.reason.set('');
    this.refusing.set(true);
  }

  protected setCant(key: string, value: unknown, most: number, box: HTMLInputElement | null): void {
    const typed = Number(value);
    const quantity = Number.isFinite(typed) ? Math.max(0, Math.min(most, Math.round(typed * 1000) / 1000)) : 0;
    this.cant.update((c) => ({ ...c, [key]: quantity }));
    if (box) box.value = String(quantity);
  }

  /** The numbers typed are shared out over the bill lines behind each collated line: whole lines where they fit, part of one for the rest. */
  protected submitCantMake(): void {
    const reason = this.reason().trim();
    if (reason.length < 3 || this.cantTotal() === 0) return;
    const itemIds: string[] = [];
    const parts: { itemId: string; quantity: number }[] = [];
    for (const g of this.pendingGroups()) {
      let left = this.cant()[g.key] ?? 0;
      for (const i of g.ids) {
        if (left <= 0) break;
        if (left >= i.quantity) itemIds.push(i.id); else parts.push({ itemId: i.id, quantity: Math.round(left * 1000) / 1000 });
        left = Math.round((left - i.quantity) * 1000) / 1000;
      }
    }
    this.cantMake.emit({ id: this.order().id, itemIds, parts, reason });
    this.refusing.set(false);
  }
}
