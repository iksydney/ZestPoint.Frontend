import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { ManualBlocksComponent } from './manual-blocks.component';
import { MANUAL, MANUAL_PDF_URL, MANUAL_SUBTITLE, MANUAL_TITLE, ROLES, Chapter, RoleId, chapterById, chapterNumber, searchManual, sectionsFor } from './manual.content';

/**
 * The manual inside the application (/app/help and /app/help/:chapter). Any signed-in person may open it: it holds no company data, only how
 * ZestPoint works. The words come from manual.content.ts, the same source the PDF is made from.
 *
 * Contents on the left (a button on a phone), a search box that narrows the sections to those that mention every word typed, chips for the
 * person's job, and one chapter at a time. A section is linked as /app/help/<chapter>#<section>. Printing this screen prints the chapter shown;
 * the whole manual is the PDF.
 */
@Component({
  selector: 'zp-help',
  imports: [RouterLink, ManualBlocksComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-6xl" data-testid="help">
      <header class="help-noprint flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="text-2xl font-bold sm:text-3xl" data-testid="help-title">{{ title }}</h1>
          <p class="mt-1 max-w-2xl text-sm text-ink/80">{{ subtitle }}</p>
        </div>
        <a class="btn-primary shrink-0 no-underline" [href]="pdfUrl" download="ZestPoint-Manual.pdf" data-testid="help-pdf">Download the PDF</a>
      </header>

      <section class="help-noprint app-card mt-4 space-y-3" aria-label="Find your way">
        <div>
          <label class="app-label" for="help-search">Search the manual</label>
          <div class="flex gap-2">
            <input id="help-search" type="search" class="app-input" placeholder="For example: expiry, void, printer" autocomplete="off" [value]="query()" (input)="onQuery($event)" data-testid="help-search" />
            @if (searching()) { <button type="button" class="btn-outline shrink-0" (click)="query.set('')" data-testid="help-clear">Clear</button> }
          </div>
          <p class="mt-1 text-sm" role="status" aria-live="polite" data-testid="help-result-count">
            @if (searching()) {
              @if (sectionCount() === 0) { Nothing matches. } @else { {{ sectionCount() }} {{ sectionCount() === 1 ? 'section' : 'sections' }} in {{ hits().length }} {{ hits().length === 1 ? 'chapter' : 'chapters' }} match. }
            }
          </p>
        </div>
        <div role="group" aria-label="Show the chapters for your job">
          <p class="app-label">Your job</p>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="chip" [class.chip-on]="role() === null" [attr.aria-pressed]="role() === null" (click)="role.set(null)" data-testid="help-role-all">Everyone</button>
            @for (r of roles; track r.id) {
              <button type="button" class="chip" [class.chip-on]="role() === r.id" [attr.aria-pressed]="role() === r.id" [attr.title]="r.blurb" (click)="pickRole(r.id)" [attr.data-testid]="'help-role-' + r.id">{{ r.label }}</button>
            }
          </div>
        </div>
      </section>

      <div class="mt-4 grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <div class="help-noprint min-w-0">
          <button type="button" class="btn-outline w-full lg:hidden" [attr.aria-expanded]="tocOpen()" aria-controls="help-contents" (click)="tocOpen.set(!tocOpen())" data-testid="help-toc-toggle">
            {{ tocOpen() ? 'Hide the contents' : 'Show the contents' }}
          </button>
          <nav id="help-contents" class="app-card mt-2 lg:sticky lg:top-20 lg:mt-0 lg:block lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto" [class.hidden]="!tocOpen()" aria-label="Contents" data-testid="help-toc">
            <h2 class="text-sm font-bold uppercase tracking-wide text-ink/70">Contents</h2>
            @if (hits().length === 0) {
              <p class="mt-2 text-sm" data-testid="help-toc-empty">No chapter matches.</p>
            } @else {
              <ol class="mt-2 space-y-1">
                @for (h of hits(); track h.chapter.id) {
                  <li>
                    <a class="toc-link" [class.toc-on]="!searching() && current()?.id === h.chapter.id" [routerLink]="['/app/help', h.chapter.id]" (click)="tocOpen.set(false)"
                       [attr.aria-current]="!searching() && current()?.id === h.chapter.id ? 'page' : null" [attr.data-testid]="'help-toc-' + h.chapter.id">
                      <span class="toc-num">{{ number(h.chapter) }}.</span>
                      <span>{{ h.chapter.title }}@if (searching()) { <span class="text-ink/70"> ({{ h.sections.length }})</span> }</span>
                    </a>
                    @if (!searching() && current()?.id === h.chapter.id) {
                      <ul class="toc-sub">
                        @for (s of h.sections; track s.id) {
                          <li><a [routerLink]="['/app/help', h.chapter.id]" [fragment]="s.id" (click)="tocOpen.set(false)" [attr.data-testid]="'help-toc-section-' + s.id">{{ s.title }}</a></li>
                        }
                      </ul>
                    }
                  </li>
                }
              </ol>
            }
          </nav>
        </div>

        <div class="block min-w-0" data-testid="help-content">
          @if (searching()) {
            @if (hits().length === 0) {
              <div class="app-card" role="status" data-testid="help-no-match">
                <p class="font-semibold">No section matches "{{ query().trim() }}".</p>
                <p class="mt-1 text-sm text-ink/80">Try a shorter word, or a different one. Words are matched anywhere in a section, in any order. @if (role() !== null) { You are only searching the chapters for one job: choose <strong>Everyone</strong> to search all of them. }</p>
                <button type="button" class="btn-outline mt-3" (click)="query.set('')" data-testid="help-no-match-clear">Clear the search</button>
              </div>
            } @else {
              @for (h of hits(); track h.chapter.id) {
                <article class="mb-8" [attr.data-testid]="'help-result-' + h.chapter.id">
                  <h2 class="chapter-title"><a [routerLink]="['/app/help', h.chapter.id]">{{ number(h.chapter) }}. {{ h.chapter.title }}</a></h2>
                  @for (s of h.sections; track s.id) {
                    <section class="help-section" [id]="s.id" tabindex="-1" [attr.data-testid]="'help-section-' + s.id">
                      <h3 class="section-title">{{ s.title }}
                        <a class="anchor" [routerLink]="['/app/help', h.chapter.id]" [fragment]="s.id" [attr.aria-label]="'Link to the section ' + s.title" [attr.data-testid]="'help-anchor-' + s.id">#</a></h3>
                      <zp-manual-blocks [blocks]="s.blocks" />
                    </section>
                  }
                </article>
              }
            }
          } @else if (current(); as ch) {
            <article [attr.data-testid]="'help-chapter-' + ch.id" [attr.data-chapter]="ch.id">
              <p class="text-sm font-semibold uppercase tracking-wide text-ink/70">Chapter {{ number(ch) }} of {{ total }}</p>
              <h2 class="chapter-title" id="chapter-top" tabindex="-1" data-testid="help-chapter-title">{{ ch.title }}</h2>
              <p class="mt-1 text-ink/80">{{ ch.summary }}</p>
              <p class="mt-1 text-sm text-ink/70" data-testid="help-audience">For: {{ audience(ch) }}</p>
              @for (s of sections(); track s.id) {
                <section class="help-section" [id]="s.id" tabindex="-1" [attr.data-testid]="'help-section-' + s.id">
                  <h3 class="section-title">{{ s.title }}
                    <a class="anchor help-noprint" [routerLink]="['/app/help', ch.id]" [fragment]="s.id" [attr.aria-label]="'Link to the section ' + s.title" [attr.data-testid]="'help-anchor-' + s.id">#</a></h3>
                  <zp-manual-blocks [blocks]="s.blocks" />
                </section>
              }
              <nav class="help-noprint mt-10 flex flex-wrap justify-between gap-3 border-t border-ink/15 pt-4" aria-label="Next and previous chapter">
                @if (previous(); as prev) { <a class="btn-outline no-underline" [routerLink]="['/app/help', prev.id]" data-testid="help-prev">Previous: {{ prev.title }}</a> } @else { <span></span> }
                @if (next(); as nxt) { <a class="btn-outline no-underline" [routerLink]="['/app/help', nxt.id]" data-testid="help-next">Next: {{ nxt.title }}</a> }
              </nav>
            </article>
          } @else if (unknownChapter()) {
            <div class="app-card" role="status" data-testid="help-unknown">
              <p class="font-semibold">There is no chapter called "{{ requested() }}".</p>
              <a class="btn-primary mt-3 no-underline" [routerLink]="['/app/help']">Open the first chapter</a>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .chip { min-height: 2.5rem; border-radius: 9999px; border: 1px solid rgb(var(--ink-rgb) / .35); padding: .25rem .875rem; font-size: .875rem; font-weight: 600; color: rgb(var(--ink-rgb)); background: transparent; }
    .chip:hover { background: rgb(var(--ink-rgb) / .08); }
    .chip:focus-visible { outline: 2px solid rgb(var(--primary-rgb)); outline-offset: 2px; }
    .chip-on { background: rgb(var(--primary-rgb)); border-color: rgb(var(--primary-rgb)); color: rgb(var(--on-primary-rgb)); }
    .chip-on:hover { background: rgb(var(--primary-rgb)); }
    .toc-link { display: flex; gap: .5rem; align-items: baseline; border-radius: .5rem; padding: .375rem .5rem; min-height: 2.25rem; font-size: .9rem; color: rgb(var(--ink-rgb)); text-decoration: none; }
    .toc-link:hover { background: rgb(var(--ink-rgb) / .08); }
    .toc-link:focus-visible { outline: 2px solid rgb(var(--primary-rgb)); outline-offset: 1px; }
    .toc-on { background: rgb(var(--primary-rgb) / .14); font-weight: 700; }
    .toc-num { flex: none; min-width: 1.5rem; color: rgb(var(--ink-rgb) / .75); }
    .toc-sub { margin: .25rem 0 .5rem 2rem; padding: 0; list-style: none; border-left: 2px solid rgb(var(--ink-rgb) / .2); }
    .toc-sub a { display: block; padding: .25rem .625rem; font-size: .85rem; color: rgb(var(--ink-rgb) / .9); text-decoration: none; border-radius: .375rem; }
    .toc-sub a:hover { background: rgb(var(--ink-rgb) / .08); text-decoration: underline; }
    .toc-sub a:focus-visible { outline: 2px solid rgb(var(--primary-rgb)); }
    .chapter-title { margin-top: .25rem; font-size: 1.6rem; font-weight: 800; line-height: 1.2; overflow-wrap: anywhere; }
    .chapter-title a { color: inherit; text-decoration: none; }
    .chapter-title a:hover { text-decoration: underline; }
    .help-section { margin-top: 2rem; scroll-margin-top: 5rem; }
    .help-section:focus { outline: none; }
    .section-title { font-size: 1.2rem; font-weight: 700; line-height: 1.3; overflow-wrap: anywhere; }
    .anchor { margin-left: .25rem; color: rgb(var(--ink-rgb) / .7); text-decoration: none; font-weight: 400; padding: 0 .25rem; }
    .anchor:hover, .anchor:focus-visible { color: rgb(var(--ink-rgb)); text-decoration: underline; }
    @media print {
      .help-noprint { display: none !important; }
      .help-section { break-inside: auto; }
      .section-title { break-after: avoid; }
    }
  `]
})
export class HelpComponent {
  private readonly route = inject(ActivatedRoute);

  protected readonly title = MANUAL_TITLE;
  protected readonly subtitle = MANUAL_SUBTITLE;
  protected readonly pdfUrl = MANUAL_PDF_URL;
  protected readonly roles = ROLES;
  protected readonly total = MANUAL.length;

  protected readonly query = signal('');
  protected readonly role = signal<RoleId | null>(null);
  /** On a phone the contents are folded away until asked for. */
  protected readonly tocOpen = signal(false);

  private readonly requested$ = toSignal(this.route.paramMap.pipe(map((p) => p.get('chapter'))), { initialValue: this.route.snapshot.paramMap.get('chapter') });
  private readonly fragment = toSignal(this.route.fragment, { initialValue: this.route.snapshot.fragment });

  protected readonly searching = computed(() => this.query().trim().length > 0);
  protected readonly hits = computed(() => searchManual(this.query(), this.role()));
  protected readonly sectionCount = computed(() => this.hits().reduce((n, h) => n + h.sections.length, 0));

  protected readonly requested = computed(() => this.requested$() ?? '');
  protected readonly unknownChapter = computed(() => !!this.requested$() && chapterById(this.requested$()) === null);

  /** The chapter shown: the one in the address if the job filter keeps it, else the first the filter keeps. */
  protected readonly current = computed<Chapter | null>(() => {
    const visible = this.hits().map((h) => h.chapter);
    const wanted = chapterById(this.requested$());
    if (this.requested$() && wanted === null) return null;
    return (wanted && visible.includes(wanted) ? wanted : visible[0]) ?? null;
  });
  protected readonly sections = computed(() => { const c = this.current(); return c ? sectionsFor(c, this.role()) : []; });
  private readonly index = computed(() => { const c = this.current(); return c ? this.hits().findIndex((h) => h.chapter.id === c.id) : -1; });
  protected readonly previous = computed(() => (this.index() > 0 ? this.hits()[this.index() - 1]!.chapter : null));
  protected readonly next = computed(() => (this.index() >= 0 && this.index() < this.hits().length - 1 ? this.hits()[this.index() + 1]!.chapter : null));

  constructor() {
    // A section link (/app/help/<chapter>#<section>) scrolls to its section once it is drawn; a new chapter starts at the top.
    effect(() => {
      const fragment = this.fragment();
      const chapter = this.current()?.id;
      this.searching();
      if (!chapter) return;
      setTimeout(() => this.reveal(fragment), 50);
    });
  }

  protected number(c: Chapter): number { return chapterNumber(c); }
  protected audience(c: Chapter): string {
    return c.roles === 'all' ? 'everyone' : c.roles.map((id) => ROLES.find((r) => r.id === id)?.label ?? id).join(', ');
  }
  protected onQuery(e: Event): void { this.query.set((e.target as HTMLInputElement).value); }
  protected pickRole(id: RoleId): void { this.role.set(this.role() === id ? null : id); }

  private reveal(fragment: string | null): void {
    const target = fragment ? document.getElementById(fragment) : null;
    if (target) {
      target.scrollIntoView({ block: 'start' });
      target.focus({ preventScroll: true });
    } else if (!this.searching()) {
      window.scrollTo({ top: 0 });
    }
  }
}
