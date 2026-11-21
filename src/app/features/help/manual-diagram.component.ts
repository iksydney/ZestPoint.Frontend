import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DiagramId } from './manual.types';

interface Box { readonly title: string; readonly lines: readonly string[]; readonly link?: string }
interface Placed extends Box { readonly y: number; readonly h: number; readonly n: number; readonly arrowY: number | null }

let nextMarker = 0;
const WIDTH = 360;
const GAP = 38;

const CONNECT: readonly Box[] = [
  { title: 'Buying', lines: ['Purchase orders, with a supplier', 'Market runs, with cash at a market', 'Goods without an order, returns, transfers'], link: 'goods arrive' },
  { title: 'The store', lines: ['Goods Receiving: checked against the order', 'Bins, lots and expiry dates', 'A second person for secure bins'], link: 'stock is asked for' },
  { title: 'The kitchen and the bar', lines: ['Stations ask the store for stock', 'Recipes, with the usable part of each', 'Batches recorded on Production'], link: 'orders are sent' },
  { title: 'The till and the receipt', lines: ['Send: one ticket for each station', 'Pay: cash, card, transfer, points or gift card', 'The receipt: print, link or QR code'], link: 'every step is recorded' },
  { title: 'Stock, cost and the ledger', lines: ['Every stock movement is written down', 'Average cost and food cost', 'The ledger posts by itself'] }
];

const JOURNEY: readonly Box[] = [
  { title: 'Open a bill', lines: ['A table, a tab, a walk-up or a takeaway'] },
  { title: 'Add items', lines: ['Prices come from the stock card'] },
  { title: 'Send', lines: ['One ticket for each station'] },
  { title: 'The station makes it', lines: ['Take it, tick off, mark it ready', 'Stock leaves when sent or when ready'] },
  { title: 'Collect and serve', lines: ['The waiter is told it is ready'] },
  { title: 'Hand the bill to a cashier', lines: ['A waiter does not take payment'] },
  { title: 'Pay and receipt', lines: ['Cash, card, transfer, points or a gift card'] }
];

/**
 * The two pictures of the manual, drawn as inline SVG so they stay sharp, print well and follow the light and dark themes through the app's
 * colour tokens. Both run top to bottom and are narrow (360 wide) so the writing stays readable on a phone. `alt` says the same thing in words.
 */
@Component({
  selector: 'zp-manual-diagram',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg class="diagram" [attr.viewBox]="'0 0 ' + width + ' ' + height()" role="img" [attr.aria-label]="alt()" [attr.data-testid]="'diagram-' + id()" focusable="false">
      <defs>
        <marker [attr.id]="markerId" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="arrow-head" /></marker>
      </defs>
      @for (b of placed(); track b.title) {
        <g [attr.transform]="'translate(10,' + b.y + ')'">
          <rect class="box" x="0" y="0" [attr.width]="width - 20" [attr.height]="b.h" rx="10" />
          <rect class="band" x="0" y="0" [attr.width]="width - 20" height="34" rx="10" />
          <rect class="band" x="0" y="20" [attr.width]="width - 20" height="14" />
          <circle class="num-dot" cx="22" cy="17" r="11" />
          <text class="num" x="22" y="22" text-anchor="middle">{{ b.n }}</text>
          <text class="title" x="42" y="22">{{ b.title }}</text>
          @for (l of b.lines; track l; let i = $index) { <text class="line" x="16" [attr.y]="54 + i * 21">{{ l }}</text> }
        </g>
        @if (b.arrowY !== null) {
          <line class="arrow" x1="180" [attr.y1]="b.arrowY" x2="180" [attr.y2]="b.arrowY + gap - 6" [attr.marker-end]="'url(#' + markerId + ')'" />
          @if (b.link) { <text class="link" x="192" [attr.y]="b.arrowY + gap / 2 + 4">{{ b.link }}</text> }
        }
      }
      @if (id() === 'connect') {
        <g [attr.transform]="'translate(10,' + (height() - 50) + ')'">
          <rect class="told" x="0" y="0" [attr.width]="width - 20" height="42" rx="10" />
          <text class="line" x="16" y="18">At every step the bell and the phone tell</text>
          <text class="line" x="16" y="35">the right person (see Who is told what)</text>
        </g>
      }
    </svg>
  `,
  styles: [`
    :host { display: block; }
    .diagram { display: block; width: 100%; max-width: 30rem; height: auto; margin: 0 auto; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
    @media print { .diagram { max-width: 80mm; } }
    .box { fill: rgb(var(--panel-rgb)); stroke: rgb(var(--ink-rgb) / .45); stroke-width: 1.2; }
    .band { fill: rgb(var(--primary-rgb) / .16); }
    .num-dot { fill: rgb(var(--primary-rgb)); }
    .num { fill: rgb(var(--on-primary-rgb)); font-size: 13px; font-weight: 700; }
    .title { fill: rgb(var(--ink-rgb)); font-size: 15px; font-weight: 700; }
    .line { fill: rgb(var(--ink-rgb)); font-size: 13px; }
    .link { fill: rgb(var(--ink-rgb) / .85); font-size: 12px; font-style: italic; }
    .arrow { stroke: rgb(var(--ink-rgb) / .75); stroke-width: 2; }
    .arrow-head { fill: rgb(var(--ink-rgb) / .75); }
    .told { fill: rgb(var(--primary-rgb) / .08); stroke: rgb(var(--ink-rgb) / .45); stroke-width: 1.2; stroke-dasharray: 5 4; }
  `]
})
export class ManualDiagramComponent {
  readonly id = input.required<DiagramId>();
  readonly alt = input.required<string>();

  /** Each picture on a page needs its own arrow-head id, or two pictures would share (and could lose) one. */
  protected readonly markerId = `zp-arrow-${nextMarker++}`;
  protected readonly width = WIDTH;
  protected readonly gap = GAP;

  protected readonly placed = computed<readonly Placed[]>(() => {
    const boxes = this.id() === 'connect' ? CONNECT : JOURNEY;
    let y = 8;
    return boxes.map((b, i) => {
      const h = 46 + b.lines.length * 21;
      const last = i === boxes.length - 1;
      const placed: Placed = { ...b, y, h, n: i + 1, arrowY: last ? null : y + h + 3 };
      y += h + GAP;
      return placed;
    });
  });

  protected readonly height = computed(() => {
    const p = this.placed();
    const last = p[p.length - 1];
    return last ? last.y + last.h + 8 + (this.id() === 'connect' ? 58 : 0) : 0;
  });
}
