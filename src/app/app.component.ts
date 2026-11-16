import { Component, effect, inject } from '@angular/core';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router, RouterOutlet } from '@angular/router';
import { LoadingService } from './core/services/loading.service';
import { BusyIndicatorComponent } from './shared/ui/busy-indicator.component';
import { AuthService } from './core/services/auth.service';
import { ThemeService } from './core/services/theme.service';
import { InstallService } from './core/services/install.service';

@Component({
  selector: 'zp-root',
  standalone: true,
  imports: [RouterOutlet, BusyIndicatorComponent],
  template: `<router-outlet /><zp-busy-indicator />`
})
export class AppComponent {
  private readonly auth = inject(AuthService);
  private readonly theme = inject(ThemeService);
  /** Created now, not when the shell opens: the browser may offer to install before anyone has signed in. */
  private readonly install = inject(InstallService);

  constructor() {
    // Going to a screen that still has to be fetched shows the loading mark too.
    const loading = inject(LoadingService);
    let moving = false;
    inject(Router).events.subscribe((e) => {
      if (e instanceof NavigationStart && !moving) { moving = true; loading.begin(); }
      else if ((e instanceof NavigationEnd || e instanceof NavigationCancel || e instanceof NavigationError) && moving) { moving = false; loading.end(); }
    });

    // Start restoring a previous session (httpOnly refresh cookie) without blocking the public pages.
    void this.auth.ready();

    // The SAVED tenant theme applies app-wide as soon as a session exists (or restores after reload); signing out reverts to defaults.
    effect(() => {
      const branding = this.auth.branding();
      if (branding) this.theme.apply(branding);
      else this.theme.reset();
    }, { allowSignalWrites: true });
  }
}
