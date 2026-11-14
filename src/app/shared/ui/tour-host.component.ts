import { ChangeDetectionStrategy, Component, ElementRef, HostListener, OnDestroy, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { TourService } from '../../core/tour/tour.service';
import { TourStep } from '../../core/tour/tours';

interface Box { readonly top: number; readonly left: number; readonly width: number; readonly height: number }

const CARD_WIDTH = 352;
const GAP = 14;

/**
 * Shows the guided tour that is running: the part of the screen a step is about is lit, everything else is dimmed and cannot be
 * clicked, and a card explains it with Back, Next and Leave. Escape leaves; the arrow keys move.
 *
 * A step whose target is not on screen is left out. If the step should have been there (it is not marked optional) its name is put in
 * data-tour-missing, which is what the automated test of the tours looks at: a tour that points at something that has moved fails it.
 */
@Component({
  selector: 'zp-tour-host',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (tour.active(); as a) {
      <div class="fixed inset-0 z-[80] print:hidden" data-testid="tour" [attr.data-tour-key]="a.tour.key" [attr.data-tour-step]="shown()?.id ?? ''" [attr.data-tour-missing]="tour.missing().join(',')" (keydown)="onKey($event)">
        <!-- Nothing behind the tour can be clicked while it runs. -->
        <div class="absolute inset-0" [class]="spot() ? '' : 'bg-black/55'" aria-hidden="true"></div>
        @if (spot(); as b) {
          <div class="tour-spot" aria-hidden="true" [style.top.px]="b.top" [style.left.px]="b.left" [style.width.px]="b.width" [style.height.px]="b.height"></div>
        }
        @if (shown(); as s) {
          <section #card class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body" [style.top.px]="cardAt().top" [style.bottom.px]="cardAt().bottom" [style.left.px]="cardAt().left" [style.width.px]="cardAt().width">
            <p class="mb-1 text-[11px] font-bold uppercase tracking-wider text-ink/60" data-testid="tour-name">{{ a.changesOnly ? 'What changed: ' : '' }}{{ a.tour.title }}</p>
            <h2 id="tour-title" class="m-0 text-lg font-bold leading-snug" data-testid="tour-title">{{ s.title }}</h2>
            <p id="tour-body" class="mt-1.5 text-sm leading-relaxed text-ink/85" data-testid="tour-body">{{ s.body }}</p>
            <div class="mt-4 flex items-center justify-between gap-3">
              <span class="text-xs font-semibold text-ink/60" data-testid="tour-progress" aria-live="polite">{{ a.index + 1 }} of {{ a.steps.length }}</span>
              <span class="flex items-center gap-2">
                <button type="button" class="btn-ghost px-2 py-1 text-sm" data-testid="tour-skip" (click)="tour.finish(true)">Leave</button>
                @if (a.index > 0) { <button type="button" class="btn-outline px-3 py-1 text-sm" data-testid="tour-back" (click)="go(-1)">Back</button> }
                <button #next type="button" class="btn-primary px-3 py-1 text-sm" data-testid="tour-next" (click)="go(1)">{{ a.index === a.steps.length - 1 ? 'Done' : 'Next' }}</button>
              </span>
            </div>
          </section>
        }
      </div>
    }
  `,
  styles: [`
    .tour-spot { position: fixed; border-radius: .75rem; box-shadow: 0 0 0 9999px rgb(0 0 0 / .55), 0 0 0 2px rgb(var(--primary-rgb)); pointer-events: none; transition: top .18s, left .18s, width .18s, height .18s; }
    .tour-card { position: fixed; border-radius: 1rem; border: 1px solid rgb(var(--ink-rgb) / .15); background: rgb(var(--panel-rgb, 255 255 255)); color: rgb(var(--ink-rgb)); padding: 1rem 1.125rem;
      box-shadow: 0 20px 45px -12px rgb(0 0 0 / .45); transition: top .18s, left .18s; }
    @media (prefers-reduced-motion: reduce) { .tour-spot, .tour-card { transition: none; } }
  `]
})
export class TourHostComponent implements OnDestroy {
  protected readonly tour = inject(TourService);
  private readonly next = viewChild<ElementRef<HTMLButtonElement>>('next');
  private readonly card = viewChild<ElementRef<HTMLElement>>('card');

  /** The step actually on show: set once its target has been found (or it has none). */
  protected readonly shown = signal<TourStep | null>(null);
  protected readonly spot = signal<Box | null>(null);
  private readonly view = signal({ width: window.innerWidth, height: window.innerHeight });
  /** The card's real height, read after it is drawn (the text of a step decides it). */
  private readonly cardHeight = signal(200);
  private target: HTMLElement | null = null;
  private direction: 1 | -1 = 1;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private run = 0;

  /** Where the card goes: beside the lit part when there is room, otherwise below or above it; along the bottom on a phone. */
  protected readonly cardAt = computed<{ left: number; top: number | null; bottom: number | null; width: number }>(() => {
    const { width: vw, height: vh } = this.view();
    const b = this.spot();
    const width = Math.min(CARD_WIDTH, vw - 24);
    const height = this.cardHeight();
    // On a phone the card sits along the bottom edge (held there by the browser, whatever its height), or along the top when the lit part is low down.
    if (vw < 640) return b && b.top + b.height / 2 > vh / 2 ? { left: (vw - width) / 2, top: 12, bottom: null, width } : { left: (vw - width) / 2, top: null, bottom: 12, width };
    if (!b) return { left: (vw - width) / 2, top: Math.max(24, (vh - height) / 2), bottom: null, width };
    const clampTop = (t: number) => Math.max(12, Math.min(vh - height - 12, t));
    const clampLeft = (l: number) => Math.max(12, Math.min(vw - width - 12, l));
    if (b.left + b.width + GAP + width <= vw - 12) return { left: b.left + b.width + GAP, top: clampTop(b.top), bottom: null, width };
    if (b.top + b.height + GAP + height <= vh - 12) return { left: clampLeft(b.left), top: b.top + b.height + GAP, bottom: null, width };
    if (b.top - GAP - height >= 12) return { left: clampLeft(b.left), top: b.top - GAP - height, bottom: null, width };
    if (b.left - GAP - width >= 12) return { left: b.left - GAP - width, top: clampTop(b.top), bottom: null, width };
    return { left: clampLeft(vw - width - 12), top: null, bottom: 12, width };
  });

  constructor() {
    effect(() => {
      const step = this.tour.step();
      untracked(() => this.present(step));
    }, { allowSignalWrites: true });
  }

  ngOnDestroy(): void { if (this.timer) clearTimeout(this.timer); }

  protected go(direction: 1 | -1): void {
    this.direction = direction;
    if (direction === 1) this.tour.next(); else this.tour.back();
  }

  /** Finds the step's target (it may still be drawing, or the menu may be opening) and lights it; gives up after a moment. */
  private present(step: TourStep | null): void {
    const run = ++this.run;
    if (this.timer) clearTimeout(this.timer);
    this.target = null;
    if (!step) { this.shown.set(null); this.spot.set(null); return; }
    if (!step.target) { this.spot.set(null); this.shown.set(step); this.settle(run); return; }

    // Something that should be there may still be drawing, so it is waited for. Something a person may simply not have (an area of the
    // menu their role does not include) is not: once the menu itself is on screen, it is there or it is not.
    const started = Date.now();
    const patience = step.menu ? 2500 : 1800;
    const menuUp = () => !step.menu || this.visible('[data-tour="nav"]') !== null;
    const look = () => {
      if (run !== this.run) return;
      const found = this.visible(step.target!);
      if (found) {
        this.target = found;
        found.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        this.shown.set(step);
        requestAnimationFrame(() => { if (run === this.run) { this.measure(); this.settle(run); } });
        return;
      }
      const waited = Date.now() - started;
      if (waited > patience || (step.optional && menuUp() && waited > 160)) { this.tour.skipStep(this.direction); return; }
      this.timer = setTimeout(look, 80);
    };
    look();
  }

  /** The first matching element that is really on screen (the menu exists twice: once for the desktop, once for the phone drawer). */
  private visible(selector: string): HTMLElement | null {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden') return el;
    }
    return null;
  }

  private measure(): void {
    this.view.set({ width: window.innerWidth, height: window.innerHeight });
    if (!this.target) return;
    const r = this.target.getBoundingClientRect();
    const pad = 6;
    const top = Math.max(4, r.top - pad);
    const left = Math.max(4, r.left - pad);
    this.spot.set({ top, left, width: Math.min(window.innerWidth - left - 4, r.width + pad * 2), height: Math.min(window.innerHeight - top - 4, r.height + pad * 2) });
  }

  /** Once the card is drawn: read its height (so it is placed fully on screen) and put the keyboard on Next. */
  private settle(run: number): void {
    requestAnimationFrame(() => {
      if (run !== this.run) return;
      const height = this.card()?.nativeElement.offsetHeight;
      if (height) this.cardHeight.set(height);
      this.next()?.nativeElement.focus({ preventScroll: true });
    });
  }

  @HostListener('window:resize')
  @HostListener('window:scroll')
  protected onMove(): void {
    if (this.tour.active()) this.measure();
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); this.tour.finish(true); return; }
    if (event.key === 'ArrowRight') { event.preventDefault(); this.go(1); return; }
    if (event.key === 'ArrowLeft') { event.preventDefault(); this.go(-1); return; }
    if (event.key !== 'Tab') return;
    // Focus stays inside the card while the tour runs.
    const buttons = Array.from(this.card()?.nativeElement.querySelectorAll<HTMLElement>('button') ?? []);
    if (buttons.length === 0) return;
    const i = buttons.indexOf(document.activeElement as HTMLElement);
    event.preventDefault();
    buttons[(i + (event.shiftKey ? buttons.length - 1 : 1) + buttons.length) % buttons.length]?.focus();
  }
}
