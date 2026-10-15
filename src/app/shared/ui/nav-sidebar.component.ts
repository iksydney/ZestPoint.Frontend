import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NAV_GROUPS, NavDefinition, NavGroup, NavGroupKey, NavIcon, navFor } from '../../core/navigation/app-nav';
import { BrandMarkComponent } from './brand-mark.component';
import { ICON_PATHS } from './icon-paths';



type Section = { readonly kind: 'item'; readonly item: NavDefinition } | { readonly kind: 'group'; readonly group: NavGroup; readonly items: readonly NavDefinition[] };

/**
 * The application menu. It only ever receives screens the person may use (permission and module), grouped as POS, Stock and Purchasing.
 * Hiding an entry is a convenience: the route guards and the API refuse the same screen independently.
 *
 * Keyboard: Up/Down/Home/End move between entries; Enter or Space opens a group. The legacy menu keys (1-9, letters) work ONLY while
 * focus is inside that group's list, so typing in a form field or anywhere else never triggers navigation.
 */
@Component({
  selector: 'zp-nav-sidebar',
  standalone: true,
  imports: [RouterLink, BrandMarkComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="flex h-full flex-col gap-1 overflow-y-auto border-r border-ink/10 bg-panel p-3 text-ink" aria-label="Main" data-testid="main-nav" (keydown)="onKey($event)">
      <div class="mb-2 flex items-center gap-2 px-1">
        <zp-brand-mark [logoUrl]="logoUrl()" [initials]="initials()" [name]="name()" [size]="32" />
        <span class="truncate text-sm font-bold">{{ name() }}</span>
      </div>

      <label class="sr-only" for="nav-search">Find a screen</label>
      <input id="nav-search" type="search" class="app-input mb-2 py-1.5 text-sm" placeholder="Find a screen..." autocomplete="off" data-testid="nav-search" [value]="query()" (input)="query.set($any($event.target).value)" />

      @if (query().trim()) {
        <ul class="flex flex-col gap-0.5" data-testid="nav-results">
          @for (n of matches(); track n.key) {
            <li><a class="nav-link" [routerLink]="n.route" (click)="chosen.emit()" [class.nav-active]="isActive(n)" [attr.aria-current]="isActive(n) ? 'page' : null" [attr.data-nav]="n.key">
              {{ n.label }} @if (groupLabel(n); as g) { <span class="ml-auto text-xs text-ink/60">{{ g }}</span> }</a></li>
          } @empty { <li class="px-3 py-2 text-sm text-ink/70" role="status">No screen matches.</li> }
        </ul>
      } @else {
        @for (s of sections(); track sectionKey(s)) {
          @if (s.kind === 'item') {
            <a class="nav-link" [routerLink]="s.item.route" (click)="chosen.emit()" [class.nav-active]="isActive(s.item)" [attr.aria-current]="isActive(s.item) ? 'page' : null" [attr.data-nav]="s.item.key" [attr.title]="s.item.description ?? s.item.label">
              <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icon(s.item.icon)" /></svg><span class="truncate">{{ s.item.label }}</span></a>
          } @else {
            <div class="mt-1" [attr.data-group]="s.group.key">
              <button type="button" class="nav-link w-full font-semibold" [attr.aria-expanded]="isOpen(s.group.key)" [attr.aria-controls]="'nav-grp-' + s.group.key" [attr.data-testid]="'nav-group-' + s.group.key" (click)="toggle(s.group.key)">
                <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icon(s.group.icon)" /></svg>
                <span>{{ s.group.label }}</span>
                <svg class="ml-auto h-4 w-4 shrink-0 transition-transform" [class.rotate-90]="isOpen(s.group.key)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
              </button>
              @if (isOpen(s.group.key)) {
                <ul class="ml-3 mt-0.5 flex flex-col gap-0.5 border-l border-ink/10 pl-2" [id]="'nav-grp-' + s.group.key" [attr.data-group-list]="s.group.key">
                  @for (n of s.items; track n.key) {
                    <li><a class="nav-link text-[13px]" [routerLink]="n.route" (click)="chosen.emit()" [class.nav-active]="isActive(n)" [attr.aria-current]="isActive(n) ? 'page' : null" [attr.data-nav]="n.key"
                           [attr.title]="n.label + (shownKey(n) ? ' (press ' + shownKey(n)!.toUpperCase() + ' while in this menu)' : '')" [attr.aria-keyshortcuts]="shownKey(n)">
                      <span class="truncate">{{ n.label }}</span>
                      @if (shownKey(n)) { <kbd class="ml-auto rounded border border-ink/25 px-1 text-[10px] font-semibold uppercase text-ink/70" aria-hidden="true">{{ shownKey(n) }}</kbd> }</a></li>
                  }
                </ul>
              }
            </div>
          }
        }
      }
    </nav>
  `,
  styles: [`
    .nav-link { display: flex; align-items: center; gap: .5rem; border-radius: .5rem; padding: .5rem .75rem; font-size: .875rem; font-weight: 500; color: rgb(var(--ink-rgb) / .85); text-align: left; min-height: 2.25rem; }
    .nav-link:hover { background: rgb(var(--ink-rgb) / .1); }
    .nav-link:focus-visible { outline: 2px solid rgb(var(--primary-rgb)); outline-offset: 1px; }
    .nav-active { background: rgb(var(--primary-rgb)); color: rgb(var(--on-primary-rgb)); }
    .nav-active:hover { background: rgb(var(--primary-rgb)); }
    .nav-active kbd { color: inherit; border-color: currentColor; }
    .nav-icon { width: 1.1rem; height: 1.1rem; flex-shrink: 0; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  `]
})
export class NavSidebarComponent {
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Only the screens this person may use. */
  readonly items = input.required<readonly NavDefinition[]>();
  readonly name = input.required<string>();
  readonly initials = input.required<string>();
  readonly logoUrl = input<string | null>(null);
  readonly currentUrl = input('');
  /** Emitted after a link is followed (the mobile drawer closes itself). */
  readonly chosen = output<void>();

  protected readonly query = signal('');
  private readonly open = signal<ReadonlySet<NavGroupKey>>(this.restore());

  protected readonly sections = computed<readonly Section[]>(() => {
    const list: Section[] = [];
    const seen = new Set<NavGroupKey>();
    for (const n of this.items()) {
      if (!n.group) { list.push({ kind: 'item', item: n }); continue; }
      if (seen.has(n.group)) continue;
      seen.add(n.group);
      const group = NAV_GROUPS.find((g) => g.key === n.group)!;
      list.push({ kind: 'group', group, items: this.items().filter((i) => i.group === n.group) });
    }
    return list;
  });

  protected readonly matches = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.items().filter((n) => `${n.label} ${n.description ?? ''} ${this.groupLabel(n) ?? ''}`.toLowerCase().includes(q));
  });

  constructor() {
    // The group that holds the current screen is always open, so the active entry is never hidden.
    effect(() => {
      const group = navFor(this.currentUrl())?.group;
      if (group && !this.open().has(group)) this.open.update((s) => new Set(s).add(group));
    }, { allowSignalWrites: true });
  }

  protected icon = (key: NavIcon): string => ICON_PATHS[key];
  /** Letter keys are shown beside a link; the digit keys still work in the menu but are not displayed as numbering. */
  protected shownKey = (n: NavDefinition): string | null => (n.shortcut && !/^\d$/.test(n.shortcut) ? n.shortcut : null);
  protected groupLabel = (n: NavDefinition): string | null => NAV_GROUPS.find((g) => g.key === n.group)?.label ?? null;
  protected sectionKey = (s: Section): string => (s.kind === 'item' ? s.item.key : `g:${s.group.key}`);
  protected isActive = (n: NavDefinition): boolean => navFor(this.currentUrl())?.key === n.key;
  protected isOpen = (key: NavGroupKey): boolean => this.open().has(key);

  protected toggle(key: NavGroupKey): void {
    this.open.update((s) => { const next = new Set(s); next.has(key) ? next.delete(key) : next.add(key); return next; });
    try { sessionStorage.setItem('zp.nav.open', JSON.stringify([...this.open()])); } catch { /* storage may be blocked */ }
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement;
    const links = Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('a.nav-link, button.nav-link'));

    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && target.matches('a.nav-link, button.nav-link')) {
      event.preventDefault();
      const i = links.indexOf(target);
      const next = event.key === 'ArrowDown' ? i + 1 : event.key === 'ArrowUp' ? i - 1 : event.key === 'Home' ? 0 : links.length - 1;
      links[Math.max(0, Math.min(links.length - 1, next))]?.focus();
      return;
    }

    // Legacy menu keys: only when focus is on an entry INSIDE a group's list (never in the search box or any other field).
    if (event.key.length !== 1 || !target.matches('a.nav-link')) return;
    const groupKey = target.closest<HTMLElement>('[data-group-list]')?.dataset['groupList'];
    if (!groupKey) return;
    const hit = this.items().find((n) => n.group === groupKey && n.shortcut === event.key.toLowerCase());
    if (hit) {
      event.preventDefault();
      void this.router.navigateByUrl(hit.route);
      this.chosen.emit();
    }
  }

  private restore(): ReadonlySet<NavGroupKey> {
    try {
      const saved = sessionStorage.getItem('zp.nav.open');
      if (saved) return new Set(JSON.parse(saved) as NavGroupKey[]);
    } catch { /* ignore */ }
    return new Set<NavGroupKey>(['pos']);
  }
}
