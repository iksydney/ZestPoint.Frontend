import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BarOrderDto } from '../../core/models/ops.model';
import { elapsed, placeOf } from '../../core/services/bar.services';
import { DialogComponent } from '../../shared/ui/feedback';

export type TicketAge = 'ok' | 'amber' | 'red';

interface Group {
  readonly key: string;
  readonly productName: string;
  readonly quantity: number;
  readonly seat: number | null;
  readonly modifiers: readonly string[];
  readonly notes: string | null;
  readonly status: string;
  readonly reason: string | null;
  readonly prepared: boolean;
  readonly ids: readonly { readonly id: string; readonly quantity: number }[];
}

const utc = (value: string): number => Date.parse(value.endsWith('Z') || /[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);

/**
 * One ticket on a kitchen display: big, readable from across a kitchen, with a clock that turns it amber and then red as it waits. The same
 * item on the ticket is one line with its total. Tapping a line ticks it off. The ticket only asks: the parent calls the API, and the
 * server decides who may (only the person who took a ticket works on it).
 */
@Component({
  selector: 'zp-kitchen-ticket',
  standalone: true,
  imports: [DecimalPipe, FormsModule, DialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (order(); as o) {
      <article class="flex h-full flex-col rounded-xl border-4 bg-panel p-3 text-ink shadow" [class]="frame()" [attr.data-age]="age()" [attr.data-testid]="'kitchen-ticket-' + place()" [attr.data-status]="o.status">
        <header class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <h3 class="truncate text-xl font-extrabold leading-tight">{{ place() }}@if (showStation() && o.stationName) { <span class="app-badge app-badge-primary ml-2 align-middle text-xs" data-testid="kitchen-station">{{ o.stationName }}</span> }</h3>
            <p class="text-xs text-ink/70">#{{ o.orderNumber }} &middot; {{ o.requestedByName }}</p>
          </div>
          <span class="shrink-0 rounded-lg px-2 py-1 text-lg font-bold" [class]="clockTone()" data-testid="kitchen-clock" [attr.aria-label]="'Waiting ' + wait()">{{ wait() }}</span>
        </header>
        @if (o.orderNotes) { <p class="mt-2 rounded-lg bg-ink/5 px-2 py-1 text-sm font-semibold">{{ o.orderNotes }}</p> }

        <ul class="mt-2 flex-1 space-y-1" data-testid="kitchen-items">
          @for (g of groups(); track g.key) {
            <li>
              @if (g.status === 'Pending') {
                <button type="button" class="flex min-h-12 w-full items-start gap-2 rounded-lg px-2 py-1 text-left text-lg hover:bg-ink/5 disabled:cursor-default disabled:hover:bg-transparent"
                        [disabled]="!canTick() || busy()" [attr.aria-pressed]="g.prepared" [attr.data-testid]="'kitchen-item-' + g.productName" [attr.data-prepared]="g.prepared" (click)="tick.emit({ id: o.id, itemIds: idsOf(g), prepared: !g.prepared })">
                  <span class="mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border-2 border-ink/40 text-sm font-bold" [class.bg-success]="g.prepared" [class.text-on-primary]="g.prepared" aria-hidden="true">{{ g.prepared ? '&#10003;' : '' }}</span>
                  <span class="min-w-0" [class.line-through]="g.prepared" [class.opacity-60]="g.prepared">
                    <span class="font-extrabold">{{ g.quantity | number: '1.0-3' }} x</span> {{ g.productName }}@if (g.seat) { <span class="text-sm text-ink/70"> (seat {{ g.seat }})</span> }
                    @for (m of g.modifiers; track m) { <span class="block text-sm font-normal text-ink/80">+ {{ m }}</span> }
                    @if (g.notes) { <span class="block text-sm font-semibold">"{{ g.notes }}"</span> }
                  </span>
                </button>
              } @else {
                <p class="flex min-h-10 items-start gap-2 px-2 py-1 text-base" [attr.data-testid]="'kitchen-item-' + g.productName">
                  <span class="font-bold">{{ g.quantity | number: '1.0-3' }} x</span>
                  <span class="min-w-0" [class.line-through]="g.status === 'Cancelled'">{{ g.productName }}
                    @if (g.status === 'CantMake') { <span class="block text-sm font-semibold text-danger" data-testid="kitchen-cant-reason">Can't make: {{ g.reason }}</span> }
                  </span>
                  @if (g.status === 'Done') { <span class="app-badge app-badge-success ml-auto">made</span> }
                  @else if (g.status === 'Cancelled') { <span class="app-badge ml-auto bg-ink/10 text-ink/80">voided</span> }
                </p>
              }
            </li>
          }
        </ul>

        <div class="mt-3">
          @if (o.status === 'New') {
            <button type="button" class="btn-primary touch-target w-full text-lg" data-testid="kitchen-take" [disabled]="busy()" (click)="take.emit(o.id)">Start</button>
          } @else if (o.status === 'Taken' && isMine()) {
            <div class="grid grid-cols-2 gap-2">
              <button type="button" class="btn-primary touch-target col-span-2 text-lg" data-testid="kitchen-bump" [disabled]="busy() || pending().length === 0" (click)="bump.emit(o.id)">Bump: ready</button>
              <button type="button" class="btn-outline min-h-11" data-testid="kitchen-cant" [disabled]="busy() || pending().length === 0" (click)="openCant()">Can't make</button>
              <button type="button" class="btn-ghost min-h-11" data-testid="kitchen-release" [disabled]="busy()" (click)="release.emit(o.id)">Hand back</button>
            </div>
          } @else if (o.status === 'Taken') {
            <p class="text-center text-sm text-ink/80" data-testid="kitchen-taken-by">{{ o.takenByName }} is making this.</p>
          }
        </div>
      </article>

      <zp-dialog [open]="cantOpen()" [title]="'Can\\'t make: ' + place()" (closed)="cantOpen.set(false)">
        <form class="space-y-3" (submit)="$event.preventDefault(); submitCant()" data-testid="kitchen-cant-form">
          <fieldset>
            <legend class="app-label">How many of each can't be made?</legend>
            @for (g of pendingGroups(); track g.key) {
              <div class="flex min-h-11 items-center gap-2 text-sm">
                <input type="number" inputmode="decimal" min="0" [max]="g.quantity" step="any" class="app-input h-10 w-20 px-1 py-0 text-center" [attr.aria-label]="'How many ' + g.productName + ' cannot be made'" [attr.data-testid]="'kitchen-cant-qty-' + g.productName"
                       [value]="cant()[g.key] || 0" (change)="setCant(g.key, $any($event.target).value, g.quantity, $any($event.target))" />
                <span class="min-w-0 flex-1">of {{ g.quantity | number: '1.0-3' }} x {{ g.productName }}</span>
                <button type="button" class="btn-ghost px-2 py-1 text-xs" (click)="setCant(g.key, 0, g.quantity, null)">None</button>
                <button type="button" class="btn-ghost px-2 py-1 text-xs" (click)="setCant(g.key, g.quantity, g.quantity, null)">All</button>
              </div>
            }
          </fieldset>
          <div><label class="app-label" for="kc-reason">Why? (the waiter sees this)</label>
            <input id="kc-reason" class="app-input" maxlength="200" placeholder="e.g. Out of buns" data-testid="kitchen-cant-reason-input" [ngModel]="reason()" (ngModelChange)="reason.set($event)" [ngModelOptions]="{ standalone: true }" /></div>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-ghost" (click)="cantOpen.set(false)">Back</button>
            <button type="submit" class="btn-primary" data-testid="kitchen-cant-confirm" [disabled]="busy() || cantTotal() === 0 || reason().trim().length < 3">Tell the waiter</button>
          </div>
        </form>
      </zp-dialog>
    }
  `
})
export class KitchenTicketComponent {
  readonly order = input.required<BarOrderDto>();
  readonly me = input<string | null>(null);
  readonly now = input(Date.now());
  readonly amber = input(10);
  readonly red = input(20);
  readonly busy = input(false);
  readonly showStation = input(false);

  readonly take = output<string>();
  readonly release = output<string>();
  readonly bump = output<string>();
  readonly tick = output<{ id: string; itemIds: string[]; prepared: boolean }>();
  readonly cantMake = output<{ id: string; itemIds: string[]; parts: { itemId: string; quantity: number }[]; reason: string }>();

  protected readonly cantOpen = signal(false);
  protected readonly cant = signal<Readonly<Record<string, number>>>({});
  protected readonly reason = signal('');

  protected readonly place = computed(() => placeOf(this.order()));
  protected readonly isMine = computed(() => this.order().takenByMembershipId === this.me());
  protected readonly canTick = computed(() => this.order().status === 'Taken' && this.isMine());
  protected readonly pending = computed(() => this.order().items.filter((i) => i.status === 'Pending'));
  protected readonly wait = computed(() => elapsed(this.order().sentAtUtc, this.now()));

  /** Minutes since the ticket was sent: the colour follows this against the station's amber and red. */
  private readonly minutes = computed(() => Math.max(0, Math.floor((this.now() - utc(this.order().sentAtUtc)) / 60_000)));
  readonly age = computed<TicketAge>(() => (this.minutes() >= this.red() ? 'red' : this.minutes() >= this.amber() ? 'amber' : 'ok'));
  protected readonly frame = computed(() => ({ ok: 'border-success/60', amber: 'border-warning', red: 'border-danger' })[this.age()]);
  protected readonly clockTone = computed(() => ({ ok: 'bg-ink/10', amber: 'bg-warning/20 text-warning', red: 'bg-danger text-on-primary' })[this.age()]);

  /** The items as a kitchen reads them: the same product, options, note, seat and state together, with the total. */
  protected readonly groups = computed<readonly Group[]>(() => {
    const map = new Map<string, { key: string; productName: string; quantity: number; seat: number | null; modifiers: readonly string[]; notes: string | null; status: string; reason: string | null; prepared: boolean; ids: { id: string; quantity: number }[] }>();
    for (const i of this.order().items) {
      const prepared = !!i.prepared;
      const key = [i.productName, (i.modifiers ?? []).join('+'), i.notes ?? '', i.seat ?? '', i.status, i.cantMakeReason ?? '', prepared].join('|');
      const g = map.get(key);
      if (g) { g.quantity = Math.round((g.quantity + i.quantity) * 1000) / 1000; g.ids.push({ id: i.id, quantity: i.quantity }); }
      else map.set(key, { key, productName: i.productName, quantity: i.quantity, seat: i.seat ?? null, modifiers: i.modifiers ?? [], notes: i.notes ?? null, status: i.status, reason: i.cantMakeReason ?? null, prepared, ids: [{ id: i.id, quantity: i.quantity }] });
    }
    return [...map.values()];
  });
  protected readonly pendingGroups = computed(() => this.groups().filter((g) => g.status === 'Pending'));
  protected readonly cantTotal = computed(() => Object.values(this.cant()).reduce((sum, n) => sum + n, 0));

  protected idsOf = (g: Group): string[] => g.ids.map((i) => i.id);

  protected openCant(): void {
    this.cant.set(Object.fromEntries(this.pendingGroups().map((g) => [g.key, g.quantity])));
    this.reason.set('');
    this.cantOpen.set(true);
  }

  protected setCant(key: string, value: unknown, most: number, box: HTMLInputElement | null): void {
    const typed = Number(value);
    const quantity = Number.isFinite(typed) ? Math.max(0, Math.min(most, Math.round(typed * 1000) / 1000)) : 0;
    this.cant.update((c) => ({ ...c, [key]: quantity }));
    if (box) box.value = String(quantity);
  }

  /** The numbers typed are shared over the bill lines behind each line: whole lines where they fit, part of one for the rest. */
  protected submitCant(): void {
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
    this.cantOpen.set(false);
  }
}
