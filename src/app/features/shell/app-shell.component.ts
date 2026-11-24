import { ItemSavedPromptComponent } from '../../shared/ui/item-saved-prompt.component';
import { ShiftPromptComponent } from '../../shared/ui/shift-prompt.component';
import { ShiftPromptService } from '../../core/services/shift-prompt.service';
import { IdleLockService } from '../../core/services/idle-lock.service';
import { LockScreenComponent } from '../../shared/ui/lock-screen.component';
import { ChangeDetectionStrategy, Component, HostListener, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { navFor } from '../../core/navigation/app-nav';
import { areaByKey, areaOf, isReport, isSetup, menuLabel, reportsRoute, setupRoute } from '../../core/navigation/nav-layout';
import { NavService } from '../../core/navigation/nav.service';
import { AuthService } from '../../core/services/auth.service';
import { BarStore } from '../../core/services/bar.services';
import { TourService } from '../../core/tour/tour.service';
import { APP_TOUR } from '../../core/tour/tours';
import { BarDockComponent } from '../pos-billing/bar-dock.component';
import { BrandMarkComponent } from '../../shared/ui/brand-mark.component';
import { AccountBannerComponent } from '../../shared/ui/account-banner.component';
import { StatusBannerComponent } from '../../shared/ui/status-banner.component';
import { InstallHintComponent } from '../../shared/ui/install-hint.component';
import { CommandPaletteComponent } from '../../shared/ui/command-palette.component';
import { ConfirmHostComponent, ToastHostComponent, ToastService } from '../../shared/ui/feedback';
import { NavSidebarComponent } from '../../shared/ui/nav-sidebar.component';
import { NoticesBellComponent } from '../../shared/ui/notices-bell.component';
import { TourHostComponent } from '../../shared/ui/tour-host.component';

/**
 * The signed-in application frame: the menu (only what this person may use), search, Help with the guided tours, a breadcrumb, the
 * header and the content area. Hiding a menu entry is a convenience only; every route and API call is guarded independently.
 *
 * The data-tour attributes here are what the tour of the application points at (core/tour/tours.ts).
 */
@Component({
    selector: 'zp-app-shell',
    imports: [RouterOutlet, RouterLink, NavSidebarComponent, BrandMarkComponent, ToastHostComponent, ConfirmHostComponent, AccountBannerComponent, StatusBannerComponent, InstallHintComponent, BarDockComponent, CommandPaletteComponent, TourHostComponent, LockScreenComponent, ItemSavedPromptComponent, ShiftPromptComponent, NoticesBellComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="grid min-h-screen grid-cols-[minmax(0,1fr)] bg-canvas text-ink md:grid-cols-[17rem_minmax(0,1fr)] print:block" [attr.inert]="lock.locked() ? '' : null">
      <div class="hidden md:block print:hidden">
        <zp-nav-sidebar class="block h-screen md:sticky md:top-0" [currentUrl]="url()" [name]="branding()?.shortName ?? 'ZestPoint'" [initials]="branding()?.initialsFallback ?? 'ZP'" [logoUrl]="branding()?.logoUrl ?? null" (search)="openSearch()" />
      </div>

      @if (drawer()) {
        <div class="fixed inset-0 z-40 bg-black/50 md:hidden" (click)="drawer.set(false)" aria-hidden="true"></div>
        <div class="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] shadow-2xl md:hidden" role="dialog" aria-modal="true" aria-label="Menu" data-testid="nav-drawer">
          <zp-nav-sidebar class="block h-full" [currentUrl]="url()" [name]="branding()?.shortName ?? 'ZestPoint'" [initials]="branding()?.initialsFallback ?? 'ZP'" [logoUrl]="branding()?.logoUrl ?? null" (chosen)="drawer.set(false)" (search)="drawer.set(false); openSearch()" />
        </div>
      }

      <div class="flex min-w-0 flex-col">
        <header class="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-ink/10 bg-panel/95 px-4 py-2 backdrop-blur print:hidden">
          <div class="flex min-w-0 items-center gap-2 md:hidden">
            <button type="button" class="btn-ghost px-2" aria-label="Open menu" [attr.aria-expanded]="drawer()" data-testid="nav-open" (click)="drawer.set(true)">
              <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <zp-brand-mark [logoUrl]="branding()?.logoUrl ?? null" [initials]="branding()?.initialsFallback ?? 'ZP'" [name]="branding()?.shortName ?? 'ZestPoint'" [size]="30" />
            <span class="truncate text-sm font-bold">{{ branding()?.shortName }}</span>
          </div>
          <p class="hidden truncate text-sm text-ink/70 md:block">{{ branding()?.tagline }}</p>

          <div class="flex shrink-0 items-center gap-1.5 sm:gap-3">
            <button type="button" class="btn-ghost px-2 md:hidden" aria-label="Search screens and reports" data-testid="header-search" (click)="openSearch()">
              <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M21 21l-4.3-4.3M11 18a7 7 0 100-14 7 7 0 000 14" /></svg>
            </button>

            <zp-notices-bell />

            <!-- Bar man method: the bell. It rings (with the number) when an order this person sent is ready, or one is waiting at the bar. -->
            @if (bar.active()) {
              <button type="button" class="btn-ghost relative px-2" data-testid="bar-bell" [attr.data-count]="bar.bellCount()" [attr.aria-label]="bar.bellCount() ? bar.bellCount() + ' bar order(s) need you' : 'Bar orders'" (click)="bar.openPanel()">
                <svg class="h-5 w-5" [class.text-primary]="bar.bellCount() > 0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9a6 6 0 1112 0c0 5 2 6 2 7H4c0-1 2-2 2-7M10 20a2 2 0 004 0" /></svg>
                @if (bar.bellCount() > 0) { <span class="absolute -right-0.5 -top-0.5 min-w-[1.125rem] rounded-full bg-danger px-1 text-center text-[11px] font-bold leading-[1.125rem] text-white" aria-hidden="true">{{ bar.bellCount() }}</span> }
              </button>
            }

            <div class="relative">
              <button type="button" class="btn-ghost flex items-center gap-1.5 px-2 text-sm" aria-haspopup="menu" [attr.aria-expanded]="help()" data-testid="help-open" data-tour="help" (click)="help.set(!help())">
                <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21a9 9 0 100-18 9 9 0 000 18M9.5 9.5a2.5 2.5 0 114.2 1.8c-.9.8-1.7 1.3-1.7 2.7M12 17h.01" /></svg>
                <span class="hidden sm:inline">Help</span>
              </button>
              @if (help()) {
                <div class="absolute right-0 top-full z-40 mt-1 w-72 rounded-xl border border-ink/15 bg-panel p-1.5 shadow-xl" role="menu" aria-label="Help" data-testid="help-menu">
                  <a class="help-item no-underline" role="menuitem" routerLink="/app/help" data-testid="help-manual" (click)="help.set(false)">
                    <span class="font-semibold">The manual</span><span class="text-xs text-ink/70">How everything works and connects, with a PDF to download.</span></a>
                  <button type="button" class="help-item" role="menuitem" data-testid="help-tour-app" (click)="startTour(appTour)">
                    <span class="font-semibold">Tour of ZestPoint</span><span class="text-xs text-ink/70">The menu, search and where things are. About a minute.</span></button>
                  @if (screenTour(); as t) {
                    <button type="button" class="help-item" role="menuitem" data-testid="help-tour-screen" (click)="startTour(t.key)">
                      <span class="font-semibold">Tour of this screen</span><span class="text-xs text-ink/70">{{ t.title }}</span></button>
                  }
                  <button type="button" class="help-item" role="menuitem" data-testid="help-tours-reset" (click)="startOver()">
                    <span class="font-semibold">Show me every tour again</span><span class="text-xs text-ink/70">Each screen's tour starts the next time you open it.</span></button>
                  @if (canSupport()) {
                    <a class="help-item no-underline" role="menuitem" routerLink="/app/support" (click)="help.set(false)">
                      <span class="font-semibold">Ask for help</span><span class="text-xs text-ink/70">Send ZestPoint a question and follow the answer.</span></a>
                  }
                </div>
              }
            </div>

            <div class="flex items-center gap-3" data-tour="account">
              <div class="hidden text-right text-sm leading-tight sm:block">
                <p class="font-semibold" data-testid="user-name">{{ auth.membership()?.displayName }}</p>
                <p class="text-xs text-ink/70">{{ auth.membership()?.roles?.[0] }}</p>
              </div>
              <button type="button" class="btn-outline text-sm" (click)="signOut()" data-testid="sign-out">Sign out</button>
            </div>
          </div>
        </header>
        @if (crumbs().length > 1) {
          <nav class="border-b border-ink/10 bg-panel/60 px-4 py-1.5 text-xs text-ink/70 sm:px-6 print:hidden" aria-label="Breadcrumb" data-testid="breadcrumb">
            <ol class="m-0 flex list-none flex-wrap items-center gap-1 p-0">
              @for (c of crumbs(); track c.label; let last = $last) {
                <li class="flex items-center gap-1">
                  @if (c.route && !last) { <a class="underline-offset-2 hover:underline" [routerLink]="c.route">{{ c.label }}</a> } @else { <span [attr.aria-current]="last ? 'page' : null" [class.font-semibold]="last" [class.text-ink]="last">{{ c.label }}</span> }
                  @if (!last) { <span aria-hidden="true">/</span> }
                </li>
              }
            </ol>
          </nav>
        }
        <zp-status-banner class="block px-4 sm:px-6 print:hidden" />
        <zp-account-banner class="block px-4 pt-3 sm:px-6 print:hidden" />
        <zp-install-hint class="block px-4 sm:px-6 print:hidden" />
        <!-- Room at the bottom so the floating bar button never covers the last control of a screen. -->
        <!-- Anything wider than the screen (a big table) scrolls inside this area; the page itself never scrolls sideways, even on the smallest phone. -->
        <main class="relative min-w-0 flex-1 overflow-x-auto p-3 min-[360px]:p-4 sm:p-6" [class.pb-24]="bar.active()"><router-outlet /></main>
        <zp-bar-dock />
        <zp-toast-host />
        <zp-confirm-host />
      </div>
    </div>
    <zp-command-palette [open]="searching()" (closed)="searching.set(false)" />
    <zp-tour-host />
    <zp-item-saved-prompt />
    <zp-shift-prompt />
    <zp-lock-screen />
  `,
    styles: [`
    .help-item { display: flex; width: 100%; flex-direction: column; gap: .125rem; border-radius: .5rem; padding: .5rem .625rem; text-align: left; font-size: .875rem; color: rgb(var(--ink-rgb)); min-height: 2.75rem; }
    .help-item:hover, .help-item:focus-visible { background: rgb(var(--ink-rgb) / .08); outline: none; }
  `]
})
export class AppShellComponent {
  protected readonly auth = inject(AuthService);
  private readonly nav = inject(NavService);
  private readonly router = inject(Router);
  private readonly tour = inject(TourService);
  private readonly toast = inject(ToastService);
  protected readonly bar = inject(BarStore);
  protected readonly lock = inject(IdleLockService);

  protected readonly appTour = APP_TOUR;
  protected readonly branding = this.auth.branding;
  protected readonly drawer = signal(false);
  protected readonly searching = signal(false);
  protected readonly help = signal(false);
  protected readonly url = toSignal(this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), map((e) => e.urlAfterRedirects), startWith(this.router.url)), { initialValue: this.router.url });
  private drawerOpenedByTour = false;

  /** The Point of Sale shows the Start your shift box in place of the till until the shift starts: the till's tour has nothing to point at yet. */
  private readonly tillHeldBack = computed(() => /^\/app\/pos\/?$/.test(this.url().split('?')[0]!.split('#')[0]!) && this.shiftPrompt.gate() !== 'open');

  protected readonly screenTour = computed(() => {
    const t = this.tour.screenTour(this.url());
    return t && t.nav && this.nav.has(t.nav) && !this.tillHeldBack() ? t : null;
  });
  protected readonly canSupport = computed(() => this.nav.has('support'));

  /** Home / area / (Reports) / screen. */
  protected readonly crumbs = computed<readonly { label: string; route: string | null }[]>(() => {
    const path = this.url().split('?')[0]!.split('#')[0]!;
    const hub = /^\/app\/(reports|setup)\/([a-z]+)/.exec(path);
    if (hub) {
      const area = areaByKey(hub[2]);
      return area ? [{ label: 'Home', route: '/app' }, { label: area.label, route: null }, hub[1] === 'setup' ? { label: 'Set-up', route: setupRoute(area.key) } : { label: 'Reports', route: reportsRoute(area.key) }] : [];
    }
    const here = navFor(this.url());
    if (!here) return [];
    const area = areaByKey(areaOf(here));
    return [
      { label: 'Home', route: '/app' },
      ...(area ? [{ label: area.label, route: null as string | null }] : []),
      ...(area && isReport(here) ? [{ label: 'Reports', route: reportsRoute(area.key) as string | null }] : []),
      ...(area && isSetup(here) ? [{ label: 'Set-up', route: setupRoute(area.key) as string | null }] : []),
      { label: menuLabel(here), route: here.route }
    ];
  });

  protected readonly shiftPrompt = inject(ShiftPromptService);

  constructor() {
    // Finds out whether the company uses the bar man method and, if this person takes part in it, starts the live connection.
    this.lock.start(); void this.bar.start();

    // A tour the person has not seen starts once the screen they landed on has had a moment to draw. Never during first-time set-up.
    effect((onCleanup) => {
      const url = this.url();
      // Not while the Point of Sale is showing the Start your shift box in place of the till: the tour waits until the shift has started.
      if (url.includes('/onboarding') || this.auth.locked() || this.tillHeldBack()) return;
      const timer = setTimeout(() => void this.tour.arrived(url), 600);
      onCleanup(() => clearTimeout(timer));
    });

    // On a phone the menu is a drawer: it is opened for the steps of a tour that are about the menu, and closed again after them.
    effect(() => {
      const wanted = this.tour.wantsMenu();
      untracked(() => {
        const phone = !window.matchMedia('(min-width: 768px)').matches;
        if (wanted && phone && !this.drawer()) { this.drawer.set(true); this.drawerOpenedByTour = true; }
        else if (!wanted && this.drawerOpenedByTour) { this.drawer.set(false); this.drawerOpenedByTour = false; }
      });
    }, { allowSignalWrites: true });
  }

  protected openSearch(): void {
    if (this.tour.active()) return;
    this.help.set(false);
    this.searching.set(true);
  }

  protected startTour(key: string): void {
    this.help.set(false);
    this.searching.set(false);
    this.tour.start(key);
  }

  protected async startOver(): Promise<void> {
    this.help.set(false);
    try {
      await this.tour.startOver();
      this.toast.success('Each tour will start again the next time you open its screen.');
    } catch { this.toast.error('That could not be saved. Check your connection and try again.'); }
  }

  /** Ctrl+K (Cmd+K on a Mac) opens search from anywhere, including while typing in a field. Escape closes the Help menu. */
  @HostListener('document:keydown', ['$event'])
  protected onKey(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (this.searching()) this.searching.set(false); else this.openSearch();
    } else if (event.key === 'Escape' && this.help()) this.help.set(false);
  }

  @HostListener('document:click', ['$event'])
  protected onClick(event: MouseEvent): void {
    if (this.help() && !(event.target as HTMLElement).closest('[data-testid="help-open"], [data-testid="help-menu"]')) this.help.set(false);
  }

  protected signOut(): void {
    void this.auth.logout();
  }
}
