import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { ManualBlocksComponent } from './manual-blocks.component';
import { MANUAL, MANUAL_DATE, MANUAL_SUBTITLE, MANUAL_TITLE, Chapter, chapterNumber } from './manual.content';

/**
 * The whole manual on one long page, laid out for A4: a cover, the contents, and every chapter starting on a new page. scripts/build-manual-pdf.mjs
 * opens this page in a browser and prints it to public/manual/ZestPoint-Manual.pdf, so the PDF is made from the very same words and blocks the Help
 * screen shows (manual.content.ts through the same block renderer): there is no second copy of the text.
 *
 * It is public and unlinked, like the PDF and the pictures in public/manual (they hold no company data: a demonstration company only). It is always
 * light, like paper, whatever the theme. `?only=front` draws just the cover and contents and `?only=<chapter>` one chapter (after a blank page): the
 * script prints each on its own to count its pages, which is how the contents get their page numbers.
 */
@Component({
  selector: 'zp-manual-print',
  imports: [ManualBlocksComponent],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="zp-paper manual-doc" data-testid="manual-print">
      @if (showFront()) {
        <section class="mp-cover" data-testid="manual-cover">
          <p class="mp-brand">ZestPoint</p>
          <h1 class="mp-title">{{ title }}</h1>
          <p class="mp-subtitle">{{ subtitle }}</p>
          <p class="mp-date">Version of {{ date }}</p>
          <p class="mp-note">The pictures show a demonstration company with sample items, people and amounts. Your own screens show your own names and figures.</p>
        </section>
        <section class="mp-toc" data-testid="manual-toc">
          <h2 class="mp-h2">Contents</h2>
          <ol class="mp-toc-list">
            @for (c of chapters; track c.id) {
              <li class="mp-toc-item">
                <span class="mp-toc-num">{{ number(c) }}</span>
                <span class="mp-toc-text"><span class="mp-toc-title">{{ c.title }}</span><span class="mp-toc-summary">{{ c.summary }}</span></span>
                <span class="mp-toc-page" [attr.data-toc-page]="c.id"></span>
              </li>
            }
          </ol>
        </section>
      }
      @if (blankFirstPage()) { <section class="mp-blank" aria-hidden="true"></section> }
      @if (onlyFront()) { <section class="mp-end" aria-hidden="true"></section> }
      @for (c of shown(); track c.id) {
        <article class="mp-chapter" [attr.data-chapter]="c.id">
          <p class="mp-eyebrow">Chapter {{ number(c) }}</p>
          <h2 class="mp-h2" [id]="'chapter-' + c.id">{{ c.title }}</h2>
          <p class="mp-summary">{{ c.summary }}</p>
          @for (s of c.sections; track s.id) {
            <section class="mp-section" [id]="s.id">
              <h3 class="mp-h3">{{ s.title }}</h3>
              <zp-manual-blocks [blocks]="s.blocks" [eager]="true" />
            </section>
          }
        </article>
      }
    </div>
  `,
  styles: [`
    @page { size: A4; margin: 18mm 16mm 20mm 16mm; @bottom-center { content: counter(page) " / " counter(pages); font: 9pt system-ui, sans-serif; color: #475569; } }
    @page :first { @bottom-center { content: none; } }
    html, body { background: #fff !important; height: auto !important; }
    .manual-doc { background: #fff; color: rgb(var(--ink-rgb)); font: 10.5pt/1.55 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; max-width: 190mm; margin: 0 auto; padding: 0 4mm; }
    .manual-doc * { box-sizing: border-box; }
    .mp-cover { height: 245mm; padding: 50mm 8mm 0 12mm; display: flex; flex-direction: column; justify-content: flex-start; border-left: 12mm solid rgb(var(--primary-rgb)); break-after: page; }
    .mp-brand { font-size: 14pt; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: rgb(var(--primary-rgb)); margin: 0 0 8mm; }
    .mp-title { font-size: 38pt; line-height: 1.05; font-weight: 800; margin: 0 0 8mm; }
    .mp-subtitle { font-size: 14pt; line-height: 1.4; max-width: 130mm; margin: 0 0 14mm; color: rgb(var(--ink-rgb) / .9); }
    .mp-date { font-size: 11pt; font-weight: 700; margin: 0 0 4mm; }
    .mp-note { font-size: 10pt; max-width: 120mm; color: rgb(var(--ink-rgb) / .85); margin: 0; }
    .mp-toc { break-after: page; padding-top: 4mm; }
    .mp-h2 { font-size: 22pt; line-height: 1.15; font-weight: 800; margin: 0 0 6mm; }
    .mp-toc-list { list-style: none; margin: 0; padding: 0; }
    .mp-toc-item { display: flex; gap: 4mm; align-items: baseline; padding: 2mm 0; border-bottom: 1px dotted rgb(var(--ink-rgb) / .45); break-inside: avoid; }
    .mp-toc-num { flex: none; width: 8mm; font-weight: 700; }
    .mp-toc-text { flex: 1; display: flex; flex-direction: column; min-width: 0; }
    .mp-toc-title { font-weight: 700; }
    .mp-toc-summary { font-size: 9pt; color: rgb(var(--ink-rgb) / .85); }
    .mp-toc-page { flex: none; min-width: 10mm; text-align: right; font-weight: 700; }
    .mp-chapter { break-before: page; }
    .mp-blank { height: 1px; break-after: page; }
    .mp-end { height: 1px; }
    .mp-eyebrow { font-size: 10pt; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: rgb(var(--ink-rgb) / .8); margin: 0 0 2mm; }
    .mp-summary { font-size: 11.5pt; color: rgb(var(--ink-rgb) / .9); margin: 0 0 4mm; }
    .mp-section { margin-top: 7mm; }
    .mp-h3 { font-size: 14pt; line-height: 1.25; font-weight: 700; margin: 0 0 2mm; break-after: avoid; }
    .manual-doc img { max-height: 165mm; object-fit: contain; }
    .manual-doc .blk-p, .manual-doc .blk-steps, .manual-doc .blk-list { orphans: 3; widows: 3; }
    @media print { .manual-doc { max-width: none; margin: 0; padding: 0; } }
    @media screen { .manual-doc { padding: 8mm 4mm; } .mp-cover { height: auto; padding-bottom: 40mm; } }
  `]
})
export class ManualPrintComponent {
  private readonly route = inject(ActivatedRoute);

  protected readonly title = MANUAL_TITLE;
  protected readonly subtitle = MANUAL_SUBTITLE;
  protected readonly date = MANUAL_DATE;
  protected readonly chapters = MANUAL;

  private readonly only = toSignal(this.route.queryParamMap.pipe(map((q) => q.get('only'))), { initialValue: this.route.snapshot.queryParamMap.get('only') });

  protected readonly showFront = computed(() => this.only() === null || this.only() === 'front');
  /** One chapter on its own gets a blank first page, so its pages are laid out exactly as in the whole manual (whose first page, the cover, has no margin). */
  /** The cover and contents alone end with one marker on a page of its own, so that the script can count their pages: the contents end with a page break, and a page break that ends a document may or may not leave an empty page. */
  protected readonly onlyFront = computed(() => this.only() === 'front');
  protected readonly blankFirstPage = computed(() => this.only() !== null && this.only() !== 'front');
  protected readonly shown = computed<readonly Chapter[]>(() => {
    const only = this.only();
    if (only === null) return MANUAL;
    return MANUAL.filter((c) => c.id === only);
  });

  protected number(c: Chapter): number { return chapterNumber(c); }
}
