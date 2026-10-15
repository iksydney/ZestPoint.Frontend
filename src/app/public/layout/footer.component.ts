import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { REGISTER_URL, PORTAL_LOGIN_URL, SITE } from '../site';
import { LogoComponent } from './logo.component';
import { ThemeToggleComponent } from './theme-toggle.component';

interface FooterLink {
  label: string;
  /** Router path, or an external/mailto URL. */
  href: string;
}

@Component({
  selector: 'zp-public-footer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LogoComponent, ThemeToggleComponent],
  template: `
    <footer class="border-t border-line-light bg-white dark:border-line-dark dark:bg-navy">
      <div class="container-page grid gap-10 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div class="space-y-4">
          <zp-logo />
          <p class="max-w-xs text-sm text-slate-700 dark:text-slate-400">
            Modular enterprise POS for bars, hospitality and supermarkets, with offline-first resilience.
          </p>
          <div class="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-400">
            <span>Theme</span>
            <zp-theme-toggle />
          </div>
        </div>

        @for (col of columns; track col.title) {
          <nav [attr.aria-label]="col.title">
            <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-navy-900 dark:text-white">{{ col.title }}</h2>
            <ul class="space-y-2 text-sm">
              @for (l of col.links; track l.label) {
                <li>
                  @if (isExternal(l.href)) {
                    <a [href]="l.href" class="text-slate-700 hover:text-brand dark:text-slate-400 dark:hover:text-glow-400">{{ l.label }}</a>
                  } @else {
                    <a [routerLink]="l.href" class="text-slate-700 hover:text-brand dark:text-slate-400 dark:hover:text-glow-400">{{ l.label }}</a>
                  }
                </li>
              }
            </ul>
          </nav>
        }
      </div>

      <div class="border-t border-line-light dark:border-line-dark">
        <div class="container-page flex flex-col gap-2 py-6 text-sm text-slate-700 sm:flex-row sm:items-center sm:justify-between dark:text-slate-400">
          <p>
            &copy; {{ year }} {{ site.name }}. A product of
            <span class="font-semibold text-navy-900 dark:text-white">ZestNovaForge</span> Limited. All rights reserved.
          </p>
          <p><a [href]="'mailto:' + site.infoEmail" class="hover:text-brand dark:hover:text-glow-400">{{ site.infoEmail }}</a></p>
        </div>
      </div>
    </footer>
  `
})
export class PublicFooterComponent {
  protected readonly site = SITE;
  protected readonly year = new Date().getFullYear();
  protected readonly columns: readonly { title: string; links: readonly FooterLink[] }[] = [
    {
      title: 'Product',
      links: [
        { href: '/features', label: 'Features' },
        { href: '/pricing', label: 'Pricing' },
        { href: REGISTER_URL, label: 'Register' }
      ]
    },
    {
      title: 'Company',
      links: [
        { href: '/contact', label: 'Contact & demo' },
        { href: `mailto:${SITE.supportEmail}`, label: 'Support' },
        { href: PORTAL_LOGIN_URL, label: 'Login' }
      ]
    },
    {
      title: 'Legal',
      links: [
        { href: '/privacy', label: 'Privacy Policy' },
        { href: '/terms', label: 'Terms of Service' }
      ]
    }
  ];

  protected isExternal(href: string): boolean {
    return /^(https?:|mailto:)/.test(href);
  }
}
