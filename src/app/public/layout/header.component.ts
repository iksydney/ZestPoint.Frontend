import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { LucideAngularModule, Menu, X } from 'lucide-angular';
import { NAV_LINKS, REGISTER_URL, PORTAL_LOGIN_URL } from '../site';
import { AuthService } from '../../core/services/auth.service';
import { LogoComponent } from './logo.component';
import { ThemeToggleComponent } from './theme-toggle.component';

@Component({
  selector: 'zp-public-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, LucideAngularModule, LogoComponent, ThemeToggleComponent],
  template: `
    <header class="sticky top-0 z-50 border-b border-line-light bg-surface-light/85 backdrop-blur-md dark:border-line-dark dark:bg-surface-dark/85">
      <a href="#main" (click)="skipToContent($event)" class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:rounded focus:bg-brand focus:px-3 focus:py-2 focus:text-white">
        Skip to content
      </a>
      <div class="container-page flex h-16 items-center justify-between gap-4">
        <zp-logo />

        <nav aria-label="Primary" class="hidden items-center gap-1 md:flex">
          @for (link of links; track link.href) {
            <a
              [routerLink]="link.href"
              routerLinkActive="!text-brand dark:!text-glow-400"
              ariaCurrentWhenActive="page"
              class="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:text-brand dark:text-slate-300 dark:hover:text-glow-400"
            >{{ link.label }}</a>
          }
        </nav>

        <div class="flex items-center gap-2">
          <zp-theme-toggle />
          @if (signedIn()) {
            <a routerLink="/app" class="zp-btn zp-btn-primary hidden sm:inline-flex">Open dashboard</a>
          } @else {
            <a [routerLink]="portalLogin" class="zp-btn zp-btn-secondary hidden sm:inline-flex">Login</a>
            <a [routerLink]="register" class="zp-btn zp-btn-primary hidden sm:inline-flex">Register</a>
          }
          <button
            type="button"
            class="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line-light text-navy-900 md:hidden dark:border-line-dark dark:text-white"
            [attr.aria-label]="menuOpen() ? 'Close menu' : 'Open menu'"
            [attr.aria-expanded]="menuOpen()"
            aria-controls="mobile-nav"
            (click)="menuOpen.set(!menuOpen())"
          >
            <lucide-icon [img]="menuOpen() ? X : Menu" [size]="20" aria-hidden="true" />
          </button>
        </div>
      </div>

      @if (menuOpen()) {
        <nav id="mobile-nav" aria-label="Mobile" class="border-t border-line-light bg-surface-light px-4 pb-4 pt-2 md:hidden dark:border-line-dark dark:bg-surface-dark">
          <ul class="flex flex-col gap-1">
            @for (link of links; track link.href) {
              <li>
                <a [routerLink]="link.href" class="block rounded-lg px-3 py-3 text-base font-medium text-navy-900 hover:bg-slate-100 dark:text-white dark:hover:bg-white/10">{{ link.label }}</a>
              </li>
            }
            @if (signedIn()) {
              <li class="pt-2"><a routerLink="/app" class="zp-btn zp-btn-primary w-full">Open dashboard</a></li>
            } @else {
              <li class="grid grid-cols-2 gap-2 pt-2">
                <a [routerLink]="portalLogin" class="zp-btn zp-btn-secondary">Login</a>
                <a [routerLink]="register" class="zp-btn zp-btn-primary">Register</a>
              </li>
            }
          </ul>
        </nav>
      }
    </header>
  `
})
export class PublicHeaderComponent {
  protected readonly links = NAV_LINKS;
  protected readonly portalLogin = PORTAL_LOGIN_URL;
  protected readonly register = REGISTER_URL;
  protected readonly signedIn = inject(AuthService).isAuthenticated;
  protected readonly menuOpen = signal(false);
  protected readonly Menu = Menu;
  protected readonly X = X;

  constructor() {
    // Close the mobile menu on navigation.
    inject(Router).events
      .pipe(filter((e) => e instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe(() => this.menuOpen.set(false));
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.menuOpen.set(false);
  }

  /** `<a href="#main">` would fight the router, so move focus manually. */
  protected skipToContent(event: Event): void {
    event.preventDefault();
    const main = document.getElementById('main');
    main?.setAttribute('tabindex', '-1');
    main?.focus();
  }
}
