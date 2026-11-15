import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NavDefinition, NavIcon, navFor } from '../../core/navigation/app-nav';
import { NavAreaKey, areaOf, helpFor, isReport, isSetup, menuLabel, reportsRoute, setupRoute } from '../../core/navigation/nav-layout';
import { NavService } from '../../core/navigation/nav.service';
import { BrandMarkComponent } from './brand-mark.component';
import { ICON_PATHS } from './icon-paths';

const OPEN_KEY = 'zp.nav.areas';

/**
 * The application menu: the working screens this person may use, grouped by the job being done (Sell, Customers, Stock, Purchasing,
 * Finance, Admin). Reports and set-up screens are not listed here; an area has one Reports entry and one Set-up entry, each a page of them. Search (Ctrl+K) reaches
 * every screen and report by name.
 *
 * Keyboard: Up/Down/Home/End move between entries; Enter or Space opens or closes an area.
 * The data-tour attributes are what the guided tour points at (core/tour/tours.ts): renaming one means updating the tour.
 */
@Component({
  selector: 'zp-nav-sidebar',
  standalone: true,
  imports: [RouterLink, BrandMarkComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="zp-nav flex h-full flex-col border-r border-ink/10 bg-panel text-ink" aria-label="Main" data-testid="main-nav" data-tour="nav" (keydown)="onKey($event)">
      <div class="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <zp-brand-mark [logoUrl]="logoUrl()" [initials]="initials()" [name]="name()" [size]="34" />
        <span class="truncate text-[15px] font-bold tracking-tight">{{ name() }}</span>
      </div>

      <div class="px-3 pb-2">
        <button type="button" class="nav-search" data-testid="nav-search" data-tour="nav-search" aria-haspopup="dialog" (click)="search.emit()">
          <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icon('search')" /></svg>
          <span class="flex-1 text-left">Search</span>
          <kbd class="nav-kbd" aria-hidden="true">Ctrl K</kbd>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto px-3 pb-4">
        @if (nav.home(); as home) {
          <a class="nav-link" [routerLink]="home.route" (click)="chosen.emit()" [class.nav-active]="activeKey() === home.key" [attr.aria-current]="activeKey() === home.key ? 'page' : null" [attr.data-nav]="home.key" [attr.title]="help(home)">
            <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icon(home.icon)" /></svg><span class="truncate">{{ label(home) }}</span></a>
        }

        @for (s of nav.sections(); track s.area.key) {
          <section class="mt-4 rounded-xl" [attr.data-group]="s.area.key" [attr.data-tour]="'nav-area-' + s.area.key">
            <h2 class="m-0">
              <button type="button" class="nav-area" [attr.aria-expanded]="isOpen(s.area.key)" [attr.aria-controls]="'nav-area-' + s.area.key" [attr.data-testid]="'nav-group-' + s.area.key" [attr.title]="s.area.blurb" (click)="toggle(s.area.key)">
                <span>{{ s.area.label }}</span>
                <svg class="h-3.5 w-3.5 shrink-0 transition-transform duration-150" [class.rotate-90]="isOpen(s.area.key)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
              </button>
            </h2>
            @if (isOpen(s.area.key)) {
              <ul class="mt-1 flex list-none flex-col gap-0.5 p-0" [id]="'nav-area-' + s.area.key" [attr.data-group-list]="s.area.key">
                @for (n of s.screens; track n.key) {
                  <li><a class="nav-link" [routerLink]="n.route" (click)="chosen.emit()" [class.nav-active]="activeKey() === n.key" [attr.aria-current]="activeKey() === n.key ? 'page' : null" [attr.data-nav]="n.key" [attr.title]="help(n)">
                    <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icon(n.icon)" /></svg><span class="truncate">{{ label(n) }}</span></a></li>
                }
                @if (s.setup.length) {
                  <li><a class="nav-link" [routerLink]="setup(s.area.key)" (click)="chosen.emit()" [class.nav-active]="activeKey() === 'setup.' + s.area.key" [attr.aria-current]="activeKey() === 'setup.' + s.area.key ? 'page' : null"
                         [attr.data-nav]="'setup.' + s.area.key" [attr.title]="'Set up ' + names(s.setup)">
                    <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icon('settings')" /></svg><span class="truncate">Set-up</span>
                    <span class="nav-count" [attr.aria-label]="s.setup.length + ' set-up screens'">{{ s.setup.length }}</span></a></li>
                }
                @if (s.reports.length) {
                  <li><a class="nav-link" [routerLink]="reports(s.area.key)" (click)="chosen.emit()" [class.nav-active]="activeKey() === 'reports.' + s.area.key" [attr.aria-current]="activeKey() === 'reports.' + s.area.key ? 'page' : null"
                         [attr.data-nav]="'reports.' + s.area.key" [attr.title]="s.area.label + ' reports'">
                    <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icon('chart')" /></svg><span class="truncate">Reports</span>
                    <span class="nav-count" [attr.aria-label]="s.reports.length + ' reports'">{{ s.reports.length }}</span></a></li>
                }
              </ul>
            }
          </section>
        }
      </div>
    </nav>
  `,
  styles: [`
    .nav-icon { width: 1.125rem; height: 1.125rem; flex-shrink: 0; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; opacity: .8; }
    .nav-search { display: flex; width: 100%; align-items: center; gap: .625rem; min-height: 2.5rem; border-radius: .625rem; border: 1px solid rgb(var(--ink-rgb) / .14); background: rgb(var(--ink-rgb) / .04);
      padding: .5rem .625rem; font-size: .875rem; color: rgb(var(--ink-rgb) / .7); transition: background-color .12s, border-color .12s; }
    .nav-search:hover { background: rgb(var(--ink-rgb) / .08); border-color: rgb(var(--ink-rgb) / .25); }
    .nav-kbd { border-radius: .375rem; border: 1px solid rgb(var(--ink-rgb) / .2); padding: 0 .375rem; font-family: inherit; font-size: .6875rem; font-weight: 600; line-height: 1.25rem; color: rgb(var(--ink-rgb) / .6); }
    .nav-area { display: flex; width: 100%; align-items: center; justify-content: space-between; border-radius: .5rem; padding: .375rem .625rem; min-height: 2rem;
      font-size: .6875rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: rgb(var(--ink-rgb) / .6); }
    .nav-area:hover { color: rgb(var(--ink-rgb)); background: rgb(var(--ink-rgb) / .05); }
    .nav-link { position: relative; display: flex; align-items: center; gap: .625rem; min-height: 2.5rem; border-radius: .625rem; padding: .5rem .625rem; font-size: .875rem; font-weight: 500;
      color: rgb(var(--ink-rgb) / .82); text-decoration: none; transition: background-color .12s, color .12s; }
    .nav-link:hover { background: rgb(var(--ink-rgb) / .07); color: rgb(var(--ink-rgb)); }
    /* The current screen: a tinted row and an accent bar. The text stays the ink colour, so it is readable whatever brand colour a company picks. */
    .nav-active, .nav-active:hover { background: rgb(var(--ink-rgb) / .1); color: rgb(var(--ink-rgb)); font-weight: 650; }
    .nav-active::before { content: ''; position: absolute; left: 0; top: .5rem; bottom: .5rem; width: 3px; border-radius: 3px; background: rgb(var(--primary-rgb)); }
    .nav-active .nav-icon { opacity: 1; }
    .nav-count { margin-left: auto; border-radius: 999px; background: rgb(var(--ink-rgb) / .1); padding: 0 .5rem; font-size: .6875rem; font-weight: 600; line-height: 1.25rem; color: rgb(var(--ink-rgb) / .75); }
    .nav-link:focus-visible, .nav-area:focus-visible, .nav-search:focus-visible { outline: 2px solid rgb(var(--primary-rgb)); outline-offset: 1px; }
    @media (prefers-reduced-motion: reduce) { .nav-link, .nav-search, .nav-area svg { transition: none; } }
  `]
})
export class NavSidebarComponent {
  protected readonly nav = inject(NavService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly name = input.required<string>();
  readonly initials = input.required<string>();
  readonly logoUrl = input<string | null>(null);
  readonly currentUrl = input('');
  /** Emitted after a link is followed (the mobile drawer closes itself). */
  readonly chosen = output<void>();
  /** The person asked for search (the shell opens the search box). */
  readonly search = output<void>();

  private readonly open = signal<ReadonlySet<NavAreaKey>>(this.restore());

  /** The entry to mark as current: the screen itself, or its area's Reports entry for a report and for the Reports page. */
  protected readonly activeKey = computed<string | null>(() => {
    const path = this.currentUrl().split('?')[0]!.split('#')[0]!;
    const hub = /^\/app\/(reports|setup)\/([a-z]+)/.exec(path);
    if (hub) return `${hub[1]}.${hub[2]}`;
    const here = navFor(this.currentUrl());
    if (!here) return null;
    return isReport(here) ? `reports.${areaOf(here)}` : isSetup(here) ? `setup.${areaOf(here)}` : here.key;
  });

  constructor() {
    // The area that holds the current screen is always open, so the current entry is never hidden.
    effect(() => {
      const key = this.activeKey();
      if (!key) return;
      const here = navFor(this.currentUrl());
      const area = key.startsWith('reports.') || key.startsWith('setup.') ? (key.slice(key.indexOf('.') + 1) as NavAreaKey) : here ? areaOf(here) : null;
      if (area && !this.open().has(area)) this.open.update((s) => new Set(s).add(area));
    }, { allowSignalWrites: true });
  }

  protected icon = (key: NavIcon): string => ICON_PATHS[key];
  protected label = (n: NavDefinition): string => menuLabel(n);
  protected help = (n: NavDefinition): string => helpFor(n);
  protected reports = (area: NavAreaKey): string => reportsRoute(area);
  protected setup = (area: NavAreaKey): string => setupRoute(area);
  protected names = (list: readonly NavDefinition[]): string => list.map((n) => menuLabel(n)).join(', ');
  protected isOpen = (key: NavAreaKey): boolean => this.open().has(key);

  /** Opens an area from outside (the tour shows what is inside each one). */
  expand(key: NavAreaKey): void {
    if (!this.open().has(key)) this.open.update((s) => new Set(s).add(key));
  }

  protected toggle(key: NavAreaKey): void {
    this.open.update((s) => { const next = new Set(s); if (next.has(key)) next.delete(key); else next.add(key); return next; });
    try { localStorage.setItem(OPEN_KEY, JSON.stringify([...this.open()])); } catch { /* storage may be blocked: the menu still works */ }
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !target.matches('a.nav-link, button.nav-area, button.nav-search')) return;
    event.preventDefault();
    const stops = Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('a.nav-link, button.nav-area, button.nav-search'));
    const i = stops.indexOf(target);
    const next = event.key === 'ArrowDown' ? i + 1 : event.key === 'ArrowUp' ? i - 1 : event.key === 'Home' ? 0 : stops.length - 1;
    stops[Math.max(0, Math.min(stops.length - 1, next))]?.focus();
  }

  private restore(): ReadonlySet<NavAreaKey> {
    try {
      const saved = localStorage.getItem(OPEN_KEY);
      if (saved) return new Set(JSON.parse(saved) as NavAreaKey[]);
    } catch { /* ignore */ }
    // A first visit shows every area open: a new person sees the whole of what they can do. They close what they do not need.
    return new Set<NavAreaKey>(['sell', 'customers', 'stock', 'purchasing', 'finance', 'admin']);
  }
}
