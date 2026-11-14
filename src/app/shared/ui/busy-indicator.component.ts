import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { LoadingService } from '../../core/services/loading.service';
import { BrandMarkComponent } from './brand-mark.component';

/**
 * The loading mark: a thin moving bar along the top and the company's logo (or its initials) pulsing in the corner, shown while the
 * application waits for the server or loads a screen. Before anyone is signed in it carries ZestPoint's own initials. It is told to
 * screen readers once ("Loading") and never blocks the screen.
 */
@Component({
  selector: 'zp-busy-indicator',
  standalone: true,
  imports: [BrandMarkComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading.busy()) {
      <div class="busy-bar print:hidden" aria-hidden="true"></div>
      <div class="busy-mark print:hidden" role="status" aria-live="polite" data-testid="busy-indicator">
        <zp-brand-mark [logoUrl]="auth.branding()?.logoUrl ?? null" [initials]="auth.branding()?.initialsFallback ?? 'ZP'" [name]="auth.branding()?.shortName ?? 'ZestPoint'" [size]="28" />
        <span class="busy-text">Loading</span>
      </div>
    }
  `,
  styles: [`
    .busy-bar { position: fixed; left: 0; top: 0; z-index: 110; height: 3px; width: 40%; border-radius: 0 3px 3px 0; background: rgb(var(--primary-rgb, 37 99 235)); animation: busy-slide 1.1s ease-in-out infinite; pointer-events: none; }
    .busy-mark { position: fixed; right: .75rem; bottom: .75rem; z-index: 110; display: flex; align-items: center; gap: .5rem; padding: .375rem .625rem .375rem .375rem; border-radius: 999px;
      border: 1px solid rgb(var(--ink-rgb, 15 23 42) / .15); background: rgb(var(--panel-rgb, 255 255 255)); color: rgb(var(--ink-rgb, 15 23 42)); box-shadow: 0 8px 24px -8px rgb(0 0 0 / .35); pointer-events: none; }
    .busy-mark zp-brand-mark { display: block; animation: busy-pulse 1s ease-in-out infinite; }
    .busy-text { font-size: .75rem; font-weight: 600; }
    @keyframes busy-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(260%); } }
    @keyframes busy-pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(.86); opacity: .7; } }
    @media (prefers-reduced-motion: reduce) { .busy-bar { animation: none; width: 100%; opacity: .6; } .busy-mark zp-brand-mark { animation: none; } }
  `]
})
export class BusyIndicatorComponent {
  protected readonly loading = inject(LoadingService);
  protected readonly auth = inject(AuthService);
}
