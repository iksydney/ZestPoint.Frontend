import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';

type Choice = 'light' | 'dark';
const KEY = 'zp-public-theme';

/**
 * Light/dark theme for the public site and the guest entry pages (register, accept-invite). Follows the OS until the visitor
 * picks, then persists the choice. The `dark` class lives on <html> only while one of those pages is mounted (attach/detach),
 * so the dashboard is unaffected. An entry page attaches with `entryPage = true`, which also adds `zp-entry` so the app colour
 * tokens switch to their light set (styles.scss); marketing pages style themselves with `dark:` classes and do not need it.
 */
@Injectable({ providedIn: 'root' })
export class PublicThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly _choice = signal<Choice>(this.initial());
  private entryPage = false;

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

  attach(entryPage = false): void {
    this.entryPage = entryPage;
    this.paint();
  }

  detach(): void {
    this.entryPage = false;
    this.document.documentElement.classList.remove('dark', 'zp-entry');
  }

  private paint(): void {
    const root = this.document.documentElement;
    root.classList.toggle('dark', this.isDark());
    root.classList.toggle('zp-entry', this.entryPage);
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
