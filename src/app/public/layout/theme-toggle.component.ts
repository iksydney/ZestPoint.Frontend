import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideAngularModule, Moon, Sun } from 'lucide-angular';
import { PublicThemeService } from '../public-theme.service';

/** Sun/Moon switch for the public site (header and footer). */
@Component({
  selector: 'zp-theme-toggle',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  template: `
    <button
      type="button"
      role="switch"
      [attr.aria-checked]="theme.isDark()"
      [attr.aria-label]="theme.isDark() ? 'Switch to light theme' : 'Switch to dark theme'"
      [title]="theme.isDark() ? 'Switch to light theme' : 'Switch to dark theme'"
      (click)="theme.toggle()"
      class="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line-light bg-white text-navy-900 transition hover:border-brand hover:text-brand dark:border-line-dark dark:bg-navy-900 dark:text-white dark:hover:border-glow-400 dark:hover:text-glow-400"
    >
      <lucide-icon [img]="theme.isDark() ? Sun : Moon" [size]="20" aria-hidden="true" />
    </button>
  `
})
export class ThemeToggleComponent {
  protected readonly theme = inject(PublicThemeService);
  protected readonly Sun = Sun;
  protected readonly Moon = Moon;
}
