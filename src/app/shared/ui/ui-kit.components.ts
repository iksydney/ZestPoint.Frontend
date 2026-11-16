import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { BrandMarkComponent } from './brand-mark.component';

/**
 * Reusable, token-driven components. They use ONLY app design tokens (bg-primary, bg-panel, text-ink, ...), so they render
 * in the active tenant theme on real screens AND in the branding editor's preview frame, where the draft theme's variables
 * are scoped onto a wrapper element. There is no separate "preview version" of any of them.
 */

// ---- Product tile (POS grid) ----------------------------------------------------------------

@Component({
    selector: 'zp-product-tile',
    imports: [CurrencyPipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <button type="button" class="app-focus touch-target flex w-full flex-col items-start gap-1 rounded-xl border p-3 text-left transition"
            [class]="selected() ? 'border-primary bg-primary text-on-primary' : 'border-ink/15 bg-panel text-ink hover:border-primary/60'"
            [attr.aria-pressed]="selected()" [disabled]="disabled()">
      <span class="text-sm font-semibold leading-tight">{{ name() }}</span>
      <span class="text-xs" [class]="selected() ? 'text-on-primary/80' : 'text-ink/70'">{{ subtitle() }}</span>
      <span class="mt-1 flex w-full items-end justify-between">
        <span class="text-base font-bold">{{ price() | currency: currency() : 'symbol-narrow' : '1.2-2' }}</span>
        @if (stock() !== null) {
          <span class="app-badge" [class]="selected() ? 'bg-on-primary/20 text-on-primary' : stock()! > 5 ? 'app-badge-success' : stock()! > 0 ? 'app-badge-warning' : 'app-badge-danger'">
            {{ stock()! > 0 ? stock() + ' left' : 'Out' }}
          </span>
        }
      </span>
    </button>
  `
})
export class ProductTileComponent {
  readonly name = input.required<string>();
  readonly subtitle = input('');
  readonly price = input.required<number>();
  readonly currency = input('NGN');
  readonly stock = input<number | null>(null);
  readonly selected = input(false);
  readonly disabled = input(false);
}

// ---- Status badge ----------------------------------------------------------------------------

@Component({
  selector: 'zp-status-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="app-badge" [class]="'app-badge-' + tone()"><ng-content /></span>`
})
export class StatusBadgeComponent {
  readonly tone = input<'success' | 'warning' | 'danger' | 'primary'>('primary');
}

// ---- Stat card -------------------------------------------------------------------------------

@Component({
  selector: 'zp-stat-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app-card">
      <p class="text-xs font-medium uppercase tracking-wide text-ink/70">{{ label() }}</p>
      <p class="mt-1 text-2xl font-bold text-ink">{{ value() }}</p>
      @if (hint()) { <p class="mt-1 text-xs text-ink/70">{{ hint() }}</p> }
    </div>
  `
})
export class StatCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly hint = input('');
}

// ---- Receipt ---------------------------------------------------------------------------------

export interface ReceiptLine {
  readonly name: string;
  readonly quantity: number;
  readonly unitPrice: number;
}

@Component({
    selector: 'zp-receipt',
    imports: [CurrencyPipe, BrandMarkComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <article class="mx-auto w-full max-w-[18rem] rounded-md bg-white p-4 font-mono text-[11px] leading-5 text-slate-900 shadow-md" aria-label="Sample receipt">
      <header class="flex flex-col items-center gap-1 text-center">
        <zp-brand-mark [logoUrl]="logoUrl()" [initials]="initials()" [name]="shortName()" [size]="40" />
        <p class="text-sm font-bold">{{ shortName() }}</p>
        @if (tagline()) { <p class="text-[10px] text-slate-600">{{ tagline() }}</p> }
        @if (header()) { <p class="whitespace-pre-line text-[10px] text-slate-600">{{ header() }}</p> }
      </header>
      <hr class="my-2 border-dashed border-slate-400" />
      <ul>
        @for (l of lines(); track l.name) {
          <li class="flex justify-between gap-2">
            <span>{{ l.quantity }} x {{ l.name }}</span>
            <span>{{ l.quantity * l.unitPrice | currency: currency() : 'symbol-narrow' : '1.2-2' }}</span>
          </li>
        }
      </ul>
      <hr class="my-2 border-dashed border-slate-400" />
      <p class="flex justify-between font-bold"><span>TOTAL</span><span>{{ total() | currency: currency() : 'symbol-narrow' : '1.2-2' }}</span></p>
      <p class="mt-1 text-center text-[10px] text-slate-500">SAMPLE RECEIPT. NOT A SALE.</p>
      @if (footer()) { <p class="mt-2 whitespace-pre-line text-center text-[10px] text-slate-600">{{ footer() }}</p> }
    </article>
  `
})
export class ReceiptComponent {
  readonly shortName = input.required<string>();
  readonly initials = input.required<string>();
  readonly logoUrl = input<string | null>(null);
  readonly tagline = input<string | null>(null);
  readonly header = input<string | null>(null);
  readonly footer = input<string | null>(null);
  readonly lines = input.required<readonly ReceiptLine[]>();
  readonly currency = input('NGN');

  protected readonly total = computed(() => this.lines().reduce((sum, l) => sum + l.quantity * l.unitPrice, 0));
}

// ---- Sidebar navigation ----------------------------------------------------------------------

export interface NavItem {
  readonly key: string;
  readonly label: string;
  /** Router link. Omitted in the preview, where the sidebar is purely illustrative of the live tokens. */
  readonly route?: string;
}

@Component({
    selector: 'zp-sidebar',
    imports: [RouterLink, RouterLinkActive, BrandMarkComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <nav class="flex h-full flex-col gap-1 border-r border-ink/10 bg-panel p-3 text-ink" aria-label="Main">
      <div class="mb-3 flex items-center gap-2 px-1">
        <zp-brand-mark [logoUrl]="logoUrl()" [initials]="initials()" [name]="name()" [size]="32" />
        <span class="truncate text-sm font-bold">{{ name() }}</span>
      </div>
      @for (item of items(); track item.key) {
        @if (item.route) {
          <a [routerLink]="item.route" routerLinkActive="bg-primary text-on-primary" class="app-focus rounded-lg px-3 py-2 text-sm font-medium text-ink/80 hover:bg-ink/10">
            {{ item.label }}
          </a>
        } @else {
          <span class="rounded-lg px-3 py-2 text-sm font-medium"
                [class]="item.key === activeKey() ? 'bg-primary text-on-primary' : 'text-ink/80'">{{ item.label }}</span>
        }
      }
    </nav>
  `
})
export class SidebarComponent {
  readonly items = input.required<readonly NavItem[]>();
  readonly name = input.required<string>();
  readonly initials = input.required<string>();
  readonly logoUrl = input<string | null>(null);
  readonly activeKey = input('');
}
