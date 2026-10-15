import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { BrandingDto } from '../models/api.model';
import { relativeLuminance, readableOn } from '../theme/color';
import { themeVariables } from '../theme/theme-tokens';

/**
 * Applies the tenant's SAVED (published) theme to the whole document, and nothing else.
 *
 *  - Colours/typography become CSS variables on <html>, produced by `themeVariables` (the same function the branding
 *    editor uses for its preview frame), so the preview and the real screens cannot drift apart.
 *  - The favicon is the tenant favicon/logo, or a generated initials tile.
 *  - Missing or invalid branding falls back to the safe :root defaults in styles.scss: `reset()` removes the overrides.
 *  - Security alerts (.sys-alert) never use these variables, so a brand can never hide an essential system state.
 *
 * Drafts are NOT applied here; they exist only inside the editor's preview element.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private appliedKeys: string[] = [];

  private readonly _branding = signal<BrandingDto | null>(null);
  readonly branding = this._branding.asReadonly();
  readonly version = computed(() => this._branding()?.version ?? 0);

  constructor() {
    effect(() => {
      const link = this.faviconLink();
      const b = this._branding();
      if (!b) {
        link.href = 'data:,';
        return;
      }
      link.type = '';
      link.href = b.faviconUrl ?? b.logoUrl ?? this.generateInitialsIcon(b.initialsFallback, b.primaryColor);
    });
  }

  apply(branding: BrandingDto): void {
    const root = this.document.documentElement;
    this.clearOverrides();

    const vars = themeVariables(branding);
    for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value);
    this.appliedKeys = Object.keys(vars);

    root.style.colorScheme = relativeLuminance(branding.backgroundColor) < 0.5 ? 'dark' : 'light';
    this.document.querySelector('meta[name="theme-color"]')?.setAttribute('content', branding.primaryColor);
    this._branding.set(branding);
  }

  /** Back to the built-in ZestPoint defaults (signed out, or branding unavailable). */
  reset(): void {
    this.clearOverrides();
    this._branding.set(null);
  }

  private clearOverrides(): void {
    const root = this.document.documentElement;
    for (const key of this.appliedKeys) root.style.removeProperty(key);
    root.style.removeProperty('color-scheme');
    this.appliedKeys = [];
  }

  // ---- favicon ------------------------------------------------------------------------------

  private faviconLink(): HTMLLinkElement {
    let link = this.document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (!link) {
      link = this.document.createElement('link');
      link.rel = 'icon';
      this.document.head.appendChild(link);
    }
    return link;
  }

  /** Draws initials on a rounded primary-colour tile and returns a PNG data URL. */
  generateInitialsIcon(initials: string, background: string, size = 64): string {
    const canvas = this.document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'data:,';

    ctx.fillStyle = background;
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, size * 0.22);
    ctx.fill();

    const text = initials.slice(0, 4).toUpperCase();
    ctx.fillStyle = readableOn(background);
    ctx.font = `700 ${Math.round(size * (text.length > 3 ? 0.3 : text.length > 2 ? 0.36 : 0.46))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, size / 2, size / 2 + size * 0.03);
    return canvas.toDataURL('image/png');
  }
}
