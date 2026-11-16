import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { ThemeInput, themeVariables } from '../../core/theme/theme-tokens';
import {
  NavItem, ProductTileComponent, ReceiptComponent, ReceiptLine, SidebarComponent, StatCardComponent, StatusBadgeComponent
} from '../../shared/ui/ui-kit.components';

/** Everything the preview needs. A saved `BrandingDto` and the editor's unsaved draft both fit. */
export interface PreviewTheme extends ThemeInput {
  readonly shortName: string;
  readonly tagline: string | null;
  readonly initials: string;
  readonly logoUrl: string | null;
  readonly receiptHeader: string | null;
  readonly receiptFooter: string | null;
}

/** The same colours with light and dark surfaces swapped, so the accent colours can be judged on both. */
export function invertSurfaces(t: ThemeInput, currentIsDark: boolean): ThemeInput {
  return currentIsDark
    ? { ...t, backgroundColor: '#F8FAFC', surfaceColor: '#FFFFFF', textColor: '#0F172A' }
    : { ...t, backgroundColor: '#0B1220', surfaceColor: '#111A2E', textColor: '#F1F5F9' };
}

/**
 * Live brand preview. It renders the REAL shared components (sidebar, stat cards, product tiles, receipt, badges, inputs,
 * tables, dialog) inside a wrapper whose CSS variables come from `themeVariables(theme)`: the same function the app uses
 * for the saved theme. Changing any input updates the variables immediately (no save, no refresh), and because the
 * variables are scoped to this element, nothing outside the preview is affected.
 */
@Component({
    selector: 'zp-brand-preview',
    imports: [CurrencyPipe, ProductTileComponent, ReceiptComponent, SidebarComponent, StatCardComponent, StatusBadgeComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="space-y-3" data-testid="brand-preview">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-xs font-semibold uppercase tracking-wide text-ink/70">Live preview</p>
        <div role="group" aria-label="Preview surfaces" class="inline-flex rounded-lg border border-ink/20 p-0.5 text-xs">
          <button type="button" class="rounded-md px-2.5 py-1 font-medium" [attr.aria-pressed]="!inverted()" (click)="inverted.set(false)"
                  [class]="!inverted() ? 'bg-primary text-on-primary' : 'text-ink/80'">As configured</button>
          <button type="button" class="rounded-md px-2.5 py-1 font-medium" [attr.aria-pressed]="inverted()" (click)="inverted.set(true)"
                  [class]="inverted() ? 'bg-primary text-on-primary' : 'text-ink/80'">{{ isDark() ? 'On light' : 'On dark' }}</button>
        </div>
      </div>

      <div class="overflow-hidden rounded-xl border border-ink/15" [style]="vars()" data-testid="preview-frame"
           style="background-color: rgb(var(--canvas-rgb)); color: rgb(var(--ink-rgb)); font-family: var(--font-app)">
        <!-- Application shell: sidebar + header + dashboard -->
        <div class="grid min-h-[22rem] grid-cols-[9.5rem_1fr]">
          <zp-sidebar [items]="nav" activeKey="dashboard" [name]="theme().shortName || 'Your company'" [initials]="theme().initials" [logoUrl]="theme().logoUrl" />
          <div class="min-w-0 p-3">
            <header class="mb-3 flex items-center justify-between rounded-lg bg-primary px-3 py-2 text-on-primary">
              <span class="text-sm font-bold">Dashboard</span>
              <span class="text-xs opacity-90">{{ theme().tagline || 'Your tagline appears here' }}</span>
            </header>
            <div class="grid grid-cols-3 gap-2">
              <zp-stat-card label="Today" value="1,284" hint="orders" />
              <zp-stat-card label="Sales" [value]="sales()" hint="+12% vs last week" />
              <zp-stat-card label="Low stock" value="7" hint="items" />
            </div>
          </div>
        </div>

        <!-- POS -->
        <div class="border-t border-ink/10 p-3">
          <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/70">Point of sale</p>
          <div class="grid gap-3 md:grid-cols-[1fr_12rem]">
            <div>
              <div class="mb-2 flex flex-wrap gap-1.5" role="tablist" aria-label="Categories">
                @for (c of categories; track c) {
                  <span class="rounded-full px-3 py-1 text-xs font-semibold" [class]="c === 'Cocktails' ? 'bg-secondary text-on-secondary' : 'bg-ink/10 text-ink'">{{ c }}</span>
                }
              </div>
              <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
                @for (p of products; track p.name) {
                  <zp-product-tile [name]="p.name" [subtitle]="p.subtitle" [price]="p.price" [stock]="p.stock" [selected]="p.selected" currency="NGN" />
                }
              </div>
            </div>
            <aside class="app-card flex flex-col gap-2" aria-label="Current tab">
              <div class="flex items-center justify-between"><p class="text-sm font-bold">Tab #42</p><zp-status-badge tone="success">Open</zp-status-badge></div>
              @for (l of receiptLines; track l.name) {
                <p class="flex justify-between text-xs"><span>{{ l.quantity }} x {{ l.name }}</span><span>{{ l.quantity * l.unitPrice | currency: 'NGN' : 'symbol-narrow' : '1.0-0' }}</span></p>
              }
              <button type="button" class="btn-primary mt-1 w-full">Charge</button>
              <button type="button" class="btn-outline w-full">Split bill</button>
            </aside>
          </div>
        </div>

        <!-- Forms, table, badges, dialog -->
        <div class="grid gap-3 border-t border-ink/10 p-3 md:grid-cols-2">
          <div class="app-card space-y-2">
            <label class="app-label" for="pv-input">Guest name</label>
            <input id="pv-input" class="app-input" value="Ada Obi" readonly />
            <div class="flex flex-wrap gap-2">
              <zp-status-badge tone="success">Paid</zp-status-badge>
              <zp-status-badge tone="warning">Pending</zp-status-badge>
              <zp-status-badge tone="danger">Voided</zp-status-badge>
              <zp-status-badge tone="primary">VIP</zp-status-badge>
            </div>
            <table class="app-table"><thead><tr><th>Item</th><th>Qty</th><th>Status</th></tr></thead>
              <tbody>
                <tr><td>Old Fashioned</td><td>2</td><td><zp-status-badge tone="success">Served</zp-status-badge></td></tr>
                <tr><td>Gin &amp; Tonic</td><td>1</td><td><zp-status-badge tone="warning">Preparing</zp-status-badge></td></tr>
              </tbody></table>
          </div>
          <div class="space-y-2">
            <div class="app-card" role="dialog" aria-label="Sample dialog">
              <p class="text-sm font-bold">Approve this void?</p>
              <p class="mt-1 text-xs text-ink/80">Voids are recorded in the audit log with your name.</p>
              <div class="mt-3 flex justify-end gap-2"><button type="button" class="btn-ghost">Cancel</button><button type="button" class="btn-secondary">Approve</button></div>
            </div>
            <!-- System alerts are deliberately NOT themed: security and accessibility states never depend on brand colours. -->
            <p class="sys-alert sys-alert-danger">System alerts keep fixed, accessible colours.</p>
          </div>
        </div>

        <!-- Receipt -->
        <div class="border-t border-ink/10 bg-canvas p-3">
          <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/70">Receipt</p>
          <zp-receipt [shortName]="theme().shortName || 'Your company'" [initials]="theme().initials" [logoUrl]="theme().logoUrl"
                      [tagline]="theme().tagline" [header]="theme().receiptHeader" [footer]="theme().receiptFooter"
                      [lines]="receiptLines" currency="NGN" />
        </div>
      </div>
    </div>
  `
})
export class BrandPreviewComponent {
  readonly theme = input.required<PreviewTheme>();
  protected readonly inverted = signal(false);

  protected readonly categories = ['Cocktails', 'Spirits', 'Beer', 'Soft drinks'];
  protected readonly nav: readonly NavItem[] = [
    { key: 'dashboard', label: 'Dashboard' }, { key: 'pos', label: 'POS' }, { key: 'inventory', label: 'Inventory' },
    { key: 'staff', label: 'Staff' }, { key: 'settings', label: 'Settings' }
  ];
  protected readonly products = [
    { name: 'Old Fashioned', subtitle: '60 ml pour', price: 4500, stock: 24, selected: true },
    { name: 'Espresso Martini', subtitle: '50 ml pour', price: 5200, stock: 12, selected: false },
    { name: 'Gin & Tonic', subtitle: '50 ml pour', price: 3800, stock: 3, selected: false }
  ];
  protected readonly receiptLines: readonly ReceiptLine[] = [
    { name: 'Old Fashioned', quantity: 2, unitPrice: 4500 },
    { name: 'Gin & Tonic', quantity: 1, unitPrice: 3800 }
  ];

  protected readonly isDark = computed(() => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(this.theme().backgroundColor.slice(i, i + 2), 16) || 0);
    return (0.299 * r! + 0.587 * g! + 0.114 * b!) < 128;
  });

  protected readonly effective = computed<ThemeInput>(() => (this.inverted() ? invertSurfaces(this.theme(), this.isDark()) : this.theme()));
  protected readonly vars = computed(() => themeVariables(this.effective()));
  protected readonly sales = computed(() => '₦12.4M');
}
