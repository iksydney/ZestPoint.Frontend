import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { APP_NAV, NavDefinition, groupOf, navFor, permissionsOf } from '../../core/navigation/app-nav';
import { AuthService } from '../../core/services/auth.service';
import { BrandMarkComponent } from '../../shared/ui/brand-mark.component';
import { AccountBannerComponent } from '../../shared/ui/account-banner.component';
import { ConfirmHostComponent, ToastHostComponent } from '../../shared/ui/feedback';
import { NavSidebarComponent } from '../../shared/ui/nav-sidebar.component';

/**
 * The signed-in application frame: the branded menu (only the screens this person may use), a breadcrumb, the header and the content area.
 * Hiding a menu entry is a convenience only; every route and API call is guarded independently.
 */
@Component({
  selector: 'zp-app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, NavSidebarComponent, BrandMarkComponent, ToastHostComponent, ConfirmHostComponent, AccountBannerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid min-h-screen grid-cols-1 bg-canvas text-ink md:grid-cols-[16rem_1fr] print:block">
      <div class="hidden md:block print:hidden">
        <zp-nav-sidebar class="block h-screen md:sticky md:top-0" [items]="items()" [currentUrl]="url()" [name]="branding()?.shortName ?? 'ZestPoint'" [initials]="branding()?.initialsFallback ?? 'ZP'" [logoUrl]="branding()?.logoUrl ?? null" />
      </div>

      @if (drawer()) {
        <div class="fixed inset-0 z-40 bg-black/50 md:hidden" (click)="drawer.set(false)" aria-hidden="true"></div>
        <div class="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] md:hidden" role="dialog" aria-modal="true" aria-label="Menu" data-testid="nav-drawer">
          <zp-nav-sidebar class="block h-full" [items]="items()" [currentUrl]="url()" [name]="branding()?.shortName ?? 'ZestPoint'" [initials]="branding()?.initialsFallback ?? 'ZP'" [logoUrl]="branding()?.logoUrl ?? null" (chosen)="drawer.set(false)" />
        </div>
      }

      <div class="flex min-w-0 flex-col">
        <header class="flex items-center justify-between gap-3 border-b border-ink/10 bg-panel px-4 py-2 print:hidden">
          <div class="flex items-center gap-2 md:hidden">
            <button type="button" class="btn-ghost px-2" aria-label="Open menu" [attr.aria-expanded]="drawer()" data-testid="nav-open" (click)="drawer.set(true)">
              <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <zp-brand-mark [logoUrl]="branding()?.logoUrl ?? null" [initials]="branding()?.initialsFallback ?? 'ZP'" [name]="branding()?.shortName ?? 'ZestPoint'" [size]="30" />
            <span class="text-sm font-bold">{{ branding()?.shortName }}</span>
          </div>
          <p class="hidden text-sm text-ink/70 md:block">{{ branding()?.tagline }}</p>
          <div class="flex items-center gap-3">
            <div class="text-right text-sm leading-tight">
              <p class="font-semibold" data-testid="user-name">{{ auth.membership()?.displayName }}</p>
              <p class="text-xs text-ink/70">{{ auth.membership()?.roles?.[0] }}</p>
            </div>
            <button type="button" class="btn-outline text-sm" (click)="signOut()" data-testid="sign-out">Sign out</button>
          </div>
        </header>
        @if (crumbs().length > 1) {
          <nav class="border-b border-ink/10 bg-panel/60 px-4 py-1.5 text-xs text-ink/70 sm:px-6 print:hidden" aria-label="Breadcrumb" data-testid="breadcrumb">
            <ol class="flex flex-wrap items-center gap-1">
              @for (c of crumbs(); track c.label; let last = $last) {
                <li class="flex items-center gap-1">
                  @if (c.route && !last) { <a class="underline-offset-2 hover:underline" [routerLink]="c.route">{{ c.label }}</a> } @else { <span [attr.aria-current]="last ? 'page' : null" [class.font-semibold]="last" [class.text-ink]="last">{{ c.label }}</span> }
                  @if (!last) { <span aria-hidden="true">/</span> }
                </li>
              }
            </ol>
          </nav>
        }
        <zp-account-banner class="block px-4 pt-3 sm:px-6 print:hidden" />
        <main class="min-w-0 flex-1 p-4 sm:p-6"><router-outlet /></main>
        <zp-toast-host />
        <zp-confirm-host />
      </div>
    </div>
  `
})
export class AppShellComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly branding = this.auth.branding;
  protected readonly drawer = signal(false);
  protected readonly url = toSignal(this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), map((e) => e.urlAfterRedirects), startWith(this.router.url)), { initialValue: this.router.url });

  /** The screens this person may use: permission AND module; a locked workspace keeps only the subscription screen. */
  protected readonly items = computed<NavDefinition[]>(() =>
    APP_NAV.filter((n) => this.auth.hasAnyPermission(permissionsOf(n)) && (!this.auth.locked() || n.key === 'subscription' || n.key === 'support')
      && (!n.feature || this.auth.accessModeFor(n.feature) !== 'locked')));

  protected readonly crumbs = computed(() => {
    const here = navFor(this.url());
    if (!here) return [];
    const group = groupOf(here);
    return [{ label: 'Home', route: '/app' }, ...(group ? [{ label: group.label, route: null as string | null }] : []), { label: here.label, route: here.route }];
  });

  protected signOut(): void {
    void this.auth.logout();
  }
}
