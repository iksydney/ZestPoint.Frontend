import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { NavDefinition } from '../../core/navigation/app-nav';
import { areaByKey, areaOf, helpFor, isReport, menuLabel, reportsRoute } from '../../core/navigation/nav-layout';
import { NavService } from '../../core/navigation/nav.service';

interface Hit { readonly key: string; readonly label: string; readonly where: string; readonly help: string; readonly route: string }

/**
 * Search for a screen or a report by name and go to it (Ctrl+K, or the Search box in the menu). It only ever lists what this person may
 * use. Typing nothing lists the working screens, so it also works as a quick way round the application.
 */
@Component({
  selector: 'zp-command-palette',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 px-4 pt-[10vh] print:hidden" data-testid="palette" (click)="closed.emit()">
        <div class="w-full max-w-xl overflow-hidden rounded-2xl border border-ink/15 bg-panel text-ink shadow-2xl" role="dialog" aria-modal="true" aria-label="Search screens and reports" (click)="$event.stopPropagation()" (keydown)="onKey($event)">
          <div class="flex items-center gap-3 border-b border-ink/10 px-4">
            <svg class="h-5 w-5 shrink-0 text-ink/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M21 21l-4.3-4.3M11 18a7 7 0 100-14 7 7 0 000 14" /></svg>
            <input #box type="search" class="min-h-12 w-full bg-transparent py-3 text-base outline-none placeholder:text-ink/50" placeholder="Search screens and reports" aria-label="Search screens and reports" autocomplete="off" spellcheck="false"
                   role="combobox" aria-expanded="true" aria-controls="palette-results" [attr.aria-activedescendant]="hits().length ? 'palette-hit-' + active() : null"
                   data-testid="palette-input" [value]="query()" (input)="onInput($any($event.target).value)" />
            <kbd class="hidden rounded-md border border-ink/20 px-1.5 text-[11px] font-semibold leading-5 text-ink/60 sm:block" aria-hidden="true">Esc</kbd>
          </div>
          <ul id="palette-results" class="m-0 max-h-[55vh] list-none overflow-y-auto p-2" role="listbox" aria-label="Results" data-testid="palette-results">
            @for (h of hits(); track h.key; let i = $index) {
              <li [id]="'palette-hit-' + i" role="option" [attr.aria-selected]="i === active()">
                <button type="button" class="flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2 text-left" [class]="i === active() ? 'bg-ink/10' : 'hover:bg-ink/5'" tabindex="-1" [attr.data-nav]="h.key" (mousemove)="active.set(i)" (click)="go(h)">
                  <span class="min-w-0"><span class="block truncate text-sm font-semibold">{{ h.label }}</span><span class="block truncate text-xs text-ink/70">{{ h.help }}</span></span>
                  <span class="shrink-0 rounded-full bg-ink/10 px-2 text-[11px] font-semibold leading-5 text-ink/75">{{ h.where }}</span>
                </button>
              </li>
            } @empty { <li class="px-3 py-6 text-center text-sm text-ink/70" role="status" data-testid="palette-empty">Nothing matches "{{ query() }}".</li> }
          </ul>
          <p class="border-t border-ink/10 px-4 py-2 text-xs text-ink/60" aria-hidden="true">Up and Down to move, Enter to open, Esc to close</p>
        </div>
      </div>
    }
  `
})
export class CommandPaletteComponent {
  private readonly nav = inject(NavService);
  private readonly router = inject(Router);

  readonly open = input.required<boolean>();
  readonly closed = output<void>();

  protected readonly query = signal('');
  protected readonly active = signal(0);
  private readonly box = viewChild<ElementRef<HTMLInputElement>>('box');

  private readonly all = computed<readonly (Hit & { readonly words: string; readonly report: boolean })[]>(() => {
    const screens = this.nav.items().map((n: NavDefinition) => {
      const area = areaByKey(areaOf(n));
      const where = area ? (isReport(n) ? `${area.label} report` : area.label) : 'Home';
      return { key: n.key, label: menuLabel(n), where, help: helpFor(n), route: n.route, report: isReport(n), words: `${menuLabel(n)} ${n.label} ${where} ${helpFor(n)}`.toLowerCase() };
    });
    const hubs = this.nav.sections().filter((s) => s.reports.length > 0).map((s) => ({
      key: `reports.${s.area.key}`, label: `${s.area.label} reports`, where: s.area.label, help: `All ${s.reports.length} ${s.area.label.toLowerCase()} reports on one page.`, route: reportsRoute(s.area.key), report: false,
      words: `${s.area.label} reports report`.toLowerCase()
    }));
    return [...screens, ...hubs];
  });

  protected readonly hits = computed<readonly Hit[]>(() => {
    const words = this.query().trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return this.all().filter((h) => !h.report).slice(0, 40);
    return this.all().filter((h) => words.every((w) => h.words.includes(w)))
      // Places to work come before reports; within each, a name that starts with what was typed comes first; otherwise menu order.
      .sort((a, b) => Number(a.report) - Number(b.report) || Number(b.label.toLowerCase().startsWith(words[0]!)) - Number(a.label.toLowerCase().startsWith(words[0]!))).slice(0, 40);
  });

  constructor() {
    effect(() => {
      if (!this.open()) return;
      this.query.set('');
      this.active.set(0);
      queueMicrotask(() => this.box()?.nativeElement.focus());
    }, { allowSignalWrites: true });
  }

  protected onInput(value: string): void {
    this.query.set(value);
    this.active.set(0);
  }

  protected onKey(event: KeyboardEvent): void {
    const count = this.hits().length;
    if (event.key === 'Escape') { event.preventDefault(); this.closed.emit(); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (count === 0) return;
      this.active.update((i) => (i + (event.key === 'ArrowDown' ? 1 : count - 1)) % count);
      queueMicrotask(() => document.getElementById(`palette-hit-${this.active()}`)?.scrollIntoView({ block: 'nearest' }));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const hit = this.hits()[this.active()];
      if (hit) this.go(hit);
    }
  }

  protected go(hit: Hit): void {
    this.closed.emit();
    void this.router.navigateByUrl(hit.route);
  }
}
