import { ChangeDetectionStrategy, Component, HostListener, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BarOrderDto } from '../../core/models/ops.model';
import { BarStore, elapsed, placeOf } from '../../core/services/bar.services';
import { ToastService } from '../../shared/ui/feedback';
import { BarOrderCardComponent } from './bar-order-card.component';

/**
 * The bar man method on every signed-in screen: a floating button with what is waiting, pop-up prompts when an order reaches the bar
 * (for a bar man) or is ready / cannot be made (for the attendant who sent it), and a panel that expands to work on the orders.
 * Shown only for a company that uses the method and a person who takes part in it. Nothing here decides access: the API does.
 */
@Component({
    selector: 'zp-bar-dock',
    imports: [RouterLink, BarOrderCardComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    @if (bar.active()) {
      <div class="pointer-events-none fixed bottom-20 right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2 print:hidden" data-testid="bar-dock">

        <!-- Prompts: what just happened and needs this person. They stay until opened, confirmed or dismissed. -->
        @if (!open()) {
          <div class="flex w-80 max-w-full flex-col gap-2" aria-live="assertive" aria-atomic="false">
            @for (o of bar.attention(); track o.id) {
              <div class="pointer-events-auto rounded-xl border-2 border-primary bg-panel p-3 text-ink shadow-xl" role="alert" [attr.data-testid]="'bar-prompt-mine-' + place(o)">
                @if (o.status === 'Ready') {
                  <p class="text-base font-bold">{{ place(o) }} is ready</p>
                  <p class="text-sm text-ink/80">Collect from {{ o.takenByName ?? 'the bar' }}.@if (refused(o); as r) { <span class="font-semibold text-danger"> Could not make: {{ r }}.</span> }</p>
                } @else {
                  <p class="text-base font-bold">{{ place(o) }}: the bar can't make something</p>
                  <p class="text-sm font-semibold text-danger">{{ refused(o) }}</p>
                }
                <div class="mt-2 flex gap-2">
                  <button type="button" class="btn-primary touch-target flex-1" data-testid="bar-prompt-acknowledge" [disabled]="busy()" (click)="acknowledge(o.id)">{{ o.status === 'Ready' ? 'Collected' : 'OK, seen' }}</button>
                  <button type="button" class="btn-outline min-h-11" (click)="show('mine')">Details</button>
                </div>
              </div>
            }
            @for (o of bar.arrivals(); track o.id) {
              <div class="pointer-events-auto rounded-xl border-2 border-primary bg-panel text-ink shadow-xl" role="alert" [attr.data-testid]="'bar-prompt-' + place(o)">
                <button type="button" class="app-focus block w-full rounded-t-xl p-3 text-left" data-testid="bar-prompt-open" (click)="expand(o.id)">
                  <span class="block text-xs font-semibold uppercase tracking-wide text-ink/70">New bar order</span>
                  <span class="block text-base font-bold">{{ place(o) }}</span>
                  <span class="block text-sm text-ink/80">from {{ o.requestedByName }} &middot; {{ summary(o) }}</span>
                  <span class="mt-1 block text-sm font-semibold underline">Tap to open</span>
                </button>
                <button type="button" class="btn-ghost w-full rounded-t-none border-t border-ink/10 py-1 text-xs" (click)="bar.dismissArrival(o.id)">Later</button>
              </div>
            }
          </div>
        }

        <!-- The expanded panel -->
        @if (open()) {
          <section class="pointer-events-auto flex max-h-[70vh] w-[26rem] max-w-full flex-col rounded-2xl border border-ink/15 bg-canvas text-ink shadow-2xl" role="dialog" aria-label="Bar orders" data-testid="bar-panel">
            <header class="flex items-center justify-between gap-2 border-b border-ink/10 px-3 py-2">
              <h2 class="text-base font-bold">Bar orders</h2>
              <div class="flex items-center gap-1">
                <span class="app-badge" [class]="bar.liveState() === 'live' ? 'app-badge-success' : 'app-badge-warning'" data-testid="bar-live" [attr.data-state]="bar.liveState()">{{ bar.liveState() === 'live' ? 'Live' : 'Reconnecting' }}</span>
                <button type="button" class="btn-ghost px-2 py-1 text-xs" [attr.aria-pressed]="bar.muted()" data-testid="bar-mute" (click)="bar.toggleMute()">{{ bar.muted() ? 'Sound off' : 'Sound on' }}</button>
                <button type="button" class="btn-ghost px-2" aria-label="Close bar orders" data-testid="bar-panel-close" (click)="open.set(false)">x</button>
              </div>
            </header>

            @if (bar.isBarMan() && bar.isAttendant()) {
              <div class="flex gap-1 border-b border-ink/10 px-3 py-1.5" role="tablist" aria-label="Which orders">
                <button type="button" role="tab" class="app-badge cursor-pointer px-3 py-1" [class]="tab() === 'bar' ? 'bg-primary text-on-primary' : 'bg-ink/10'" [attr.aria-selected]="tab() === 'bar'" data-testid="bar-tab-bar" (click)="tab.set('bar')">At the bar ({{ bar.queue().length }})</button>
                <button type="button" role="tab" class="app-badge cursor-pointer px-3 py-1" [class]="tab() === 'mine' ? 'bg-primary text-on-primary' : 'bg-ink/10'" [attr.aria-selected]="tab() === 'mine'" data-testid="bar-tab-mine" (click)="tab.set('mine')">Sent by me ({{ bar.mine().length }})</button>
              </div>
            }

            <div class="flex-1 space-y-2 overflow-auto p-3">
              @if (bar.error()) { <p class="sys-alert sys-alert-warning" role="alert" data-testid="bar-error">{{ bar.error() }}</p> }
              @if (view() === 'bar') {
                @for (o of ordered(); track o.id) {
                  <zp-bar-order-card [order]="o" side="bar" [me]="bar.myId()" [now]="bar.now()" [busy]="busy()"
                                     (take)="run(bar.take($event))" (release)="run(bar.release($event))" (ready)="run(bar.ready($event), 'Dispatched. The attendant has been told.')"
                                     (cantMake)="run(bar.cantMake($event.id, $event.itemIds, $event.reason, $event.parts), 'The attendant has been told.')" />
                } @empty { <p class="py-6 text-center text-sm text-ink/70" data-testid="bar-empty">No orders are waiting at the bar.</p> }
              } @else {
                @for (o of bar.mine(); track o.id) {
                  <zp-bar-order-card [order]="o" side="mine" [me]="bar.myId()" [now]="bar.now()" [busy]="busy()" (acknowledge)="acknowledge($event)" />
                } @empty { <p class="py-6 text-center text-sm text-ink/70" data-testid="bar-mine-empty">Nothing you sent is with the bar.</p> }
              }
            </div>

            @if (bar.isBarMan()) {
              <footer class="border-t border-ink/10 px-3 py-2 text-right"><a class="text-sm font-semibold underline" routerLink="/app/pos/bar-orders" data-testid="bar-open-screen" (click)="open.set(false)">Open the Bar Orders screen</a></footer>
            }
          </section>
        }

        <!-- The floating button -->
        <button type="button" class="pointer-events-auto relative grid h-14 w-14 place-items-center rounded-full bg-primary text-on-primary shadow-xl ring-2 ring-canvas transition hover:brightness-110 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/50"
                [attr.aria-label]="label()" [attr.aria-expanded]="open()" data-testid="bar-dock-button" (click)="toggle()">
          <svg class="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h14l-7 8zM12 12v7M8 20h8" /></svg>
          @if (count() > 0) {
            <span class="absolute -right-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-danger px-1 text-xs font-bold text-white ring-2 ring-canvas" data-testid="bar-dock-count">{{ count() }}</span>
          }
        </button>
      </div>
    }
  `
})
export class BarDockComponent {
  protected readonly bar = inject(BarStore);
  private readonly toast = inject(ToastService);

  protected readonly open = signal(false);
  protected readonly tab = signal<'bar' | 'mine'>('bar');

  constructor() {
    // The bell in the header opens the panel: on what is calling this person if anything is, otherwise on the bar's queue.
    effect(() => {
      if (this.bar.panelRequests() === 0) return;
      untracked(() => {
        this.show(this.bar.attention().length > 0 || !this.bar.isBarMan() ? 'mine' : 'bar');
        void this.bar.refresh();
      });
    }, { allowSignalWrites: true });
  }
  protected readonly busy = signal(false);
  private readonly focusId = signal<string | null>(null);

  /** A person who only sends sees their own orders; a bar man sees the bar. Someone who does both chooses with the tabs. */
  protected readonly view = computed<'bar' | 'mine'>(() => (this.bar.isBarMan() && this.bar.isAttendant() ? this.tab() : this.bar.isBarMan() ? 'bar' : 'mine'));

  /** The number on the button: what is waiting for a bar man to take, plus what is calling this person as an attendant. */
  protected readonly count = computed(() => (this.bar.isBarMan() ? this.bar.waiting().length : 0) + this.bar.attention().length);

  protected readonly label = computed(() => {
    const waiting = this.bar.isBarMan() ? this.bar.waiting().length : 0;
    const calling = this.bar.attention().length;
    return `Bar orders: ${waiting} waiting${calling ? `, ${calling} need you` : ''}`;
  });

  /** The order just opened from a prompt comes first; otherwise oldest first, as the server sent them. */
  protected readonly ordered = computed(() => {
    const focus = this.focusId();
    const list = this.bar.queue();
    return focus ? [...list.filter((o) => o.id === focus), ...list.filter((o) => o.id !== focus)] : list;
  });

  protected place(o: BarOrderDto): string { return placeOf(o); }

  protected summary(o: BarOrderDto): string {
    const units = o.items.reduce((sum, i) => sum + i.quantity, 0);
    const kinds = new Set(o.items.map((i) => i.productName)).size;   // the same thing added twice is one item of two
    return `${kinds} item${kinds === 1 ? '' : 's'} (${units}) · ${elapsed(o.sentAtUtc, this.bar.now())}`;
  }

  /** The items the bar could not make and the attendant has not confirmed, with the reasons. */
  protected refused(o: BarOrderDto): string {
    return o.items.filter((i) => i.status === 'CantMake' && !i.acknowledged).map((i) => `${i.productName} (${i.cantMakeReason})`).join(', ');
  }

  protected toggle(): void {
    this.open.update((v) => !v);
    if (this.open()) void this.bar.refresh();
  }

  protected show(tab: 'bar' | 'mine'): void {
    this.tab.set(tab);
    this.open.set(true);
  }

  /** Opening a prompt expands the panel with that order on top. */
  protected expand(id: string): void {
    this.focusId.set(id);
    this.bar.dismissArrival(id);
    this.show('bar');
  }

  protected acknowledge(id: string): void { void this.run(this.bar.acknowledge(id)); }

  protected async run(action: Promise<string | null>, done?: string): Promise<void> {
    this.busy.set(true);
    try {
      const problem = await action;
      if (problem) this.toast.error(problem);
      else if (done) this.toast.success(done);
    } finally { this.busy.set(false); }
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void { this.open.set(false); }
}
