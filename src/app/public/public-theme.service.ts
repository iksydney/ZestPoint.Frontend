import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';

type Choice = 'light' | 'dark';
const KEY = 'zp-public-theme';

/**
 * Light/dark theme for the public site only. Follows the OS until the visitor picks, then persists the choice.
 * The `dark` class lives on <html> only while a public page is mounted (attach/detach), so the dashboard is unaffected.
 */
@Injectable({ providedIn: 'root' })
export class PublicThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly _choice = signal<Choice>(this.initial());

  readonly isDark = computed(() => this._choice() === 'dark');

  toggle(): void {
    const next: Choice = this.isDark() ? 'light' : 'dark';
    this._choice.set(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage unavailable: keep the in-memory choice */
    }
    this.paint();
  }

  attach(): void {
    this.paint();
  }

  detach(): void {
    this.document.documentElement.classList.remove('dark');
  }

  private paint(): void {
    this.document.documentElement.classList.toggle('dark', this.isDark());
  }

  private initial(): Choice {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      /* ignore */
    }
    return this.document.defaultView?.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
}
