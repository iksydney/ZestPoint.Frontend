import { Component, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'zp-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet />`
})
export class AppComponent {
  private readonly auth = inject(AuthService);
  private readonly theme = inject(ThemeService);

  constructor() {
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
