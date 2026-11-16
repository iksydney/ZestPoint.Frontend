import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PublicThemeService } from '../public-theme.service';
import { PublicFooterComponent } from './footer.component';
import { PublicHeaderComponent } from './header.component';

/** Shell for every public marketing route: header, routed page, footer, and the public light/dark theme. */
@Component({
    selector: 'zp-public-layout',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterOutlet, PublicHeaderComponent, PublicFooterComponent],
    template: `
    <div class="zp-public">
      <zp-public-header />
      <main id="main" class="outline-none"><router-outlet /></main>
      <zp-public-footer />
    </div>
  `
})
export class PublicLayoutComponent implements OnInit, OnDestroy {
  private readonly theme = inject(PublicThemeService);

  ngOnInit(): void {
    this.theme.attach();
  }

  ngOnDestroy(): void {
    this.theme.detach();
  }
}
