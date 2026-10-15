import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Text + glyph logo. Swap the SVG for the official ZestNovaForge/ZestPoint mark when available. */
@Component({
  selector: 'zp-logo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <a routerLink="/" aria-label="ZestPoint home" class="inline-flex items-center gap-2.5">
      <span aria-hidden="true" class="grid h-9 w-9 place-items-center rounded-xl bg-brand-gradient shadow-glow-sm">
        <svg viewBox="0 0 24 24" class="h-5 w-5 text-white" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 6h14L5 18h14" />
        </svg>
      </span>
      <span class="font-display text-xl font-bold tracking-tight text-navy-900 dark:text-white">
        Zest<span class="text-brand dark:text-glow-400">Point</span>
      </span>
    </a>
  `
})
export class LogoComponent {}
