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
          @for (i of o.items; track i.id) {
            <li class="flex items-start justify-between gap-2 text-sm" [class.opacity-60]="i.status === 'Cancelled'">
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
                  <legend class="app-label">Which items can't be made?</legend>
                  @for (i of pending(); track i.id) {
                    <label class="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" [checked]="chosen().includes(i.id)" (change)="toggle(i.id)" /> {{ i.quantity | number: '1.0-3' }} x {{ i.productName }}</label>
                  }
                </fieldset>
                <div>
                  <label class="app-label" [attr.for]="'reason-' + o.id">Why? (the attendant sees this)</label>
                  <input class="app-input" [id]="'reason-' + o.id" maxlength="200" placeholder="e.g. Out of tonic" data-testid="bar-cant-reason-input" [ngModel]="reason()" (ngModelChange)="reason.set($event)" [ngModelOptions]="{ standalone: true }" />
                </div>
                <div class="flex justify-end gap-2">
                  <button type="button" class="btn-ghost" (click)="refusing.set(false)">Back</button>
                  <button type="submit" class="btn-outline" data-testid="bar-cant-confirm" [disabled]="busy() || chosen().length === 0 || reason().trim().length < 3">Tell the attendant</button>
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
  readonly cantMake = output<{ id: string; itemIds: string[]; reason: string }>();
  readonly acknowledge = output<string>();

  protected readonly refusing = signal(false);
  protected readonly chosen = signal<readonly string[]>([]);
  protected readonly reason = signal('');

  protected readonly place = computed(() => placeOf(this.order()));
  protected readonly age = computed(() => elapsed(this.order().sentAtUtc, this.now()));
  protected readonly isMine = computed(() => this.order().takenByMembershipId === this.me());
  protected readonly pending = computed(() => this.order().items.filter((i) => i.status === 'Pending'));
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

  protected startRefusing(): void {
    this.chosen.set(this.pending().map((i) => i.id));
    this.reason.set('');
    this.refusing.set(true);
  }

  protected toggle(id: string): void {
    this.chosen.update((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }

  protected submitCantMake(): void {
    const reason = this.reason().trim();
    if (reason.length < 3 || this.chosen().length === 0) return;
    this.cantMake.emit({ id: this.order().id, itemIds: [...this.chosen()], reason });
    this.refusing.set(false);
  }
}
