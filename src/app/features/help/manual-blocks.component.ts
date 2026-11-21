import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { ManualDiagramComponent } from './manual-diagram.component';
import { Block, NoteTone, Segment, inline } from './manual.types';

const NOTE_LABEL: Readonly<Record<NoteTone, string>> = { tip: 'Tip', warning: 'Careful', limit: 'Not there yet' };
const IMAGE_DIR = '/manual/img';

/** One line of text with its **bold** parts. Spans, not interpolated text between tags, so no stray space ever appears beside a bracket or a full stop. */
@Component({
  selector: 'zp-manual-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@for (s of segments(); track $index) {<span [class.seg-bold]="s.bold">{{ s.text }}</span>}`,
  styles: [`.seg-bold { font-weight: 700; }`]
})
export class ManualTextComponent {
  readonly text = input.required<string>();
  protected readonly segments = computed<readonly Segment[]>(() => inline(this.text()));
}

/**
 * Draws a list of blocks. The Help screen and the PDF's page both use it, so they show exactly the same words. Text goes in as text (never
 * innerHTML): the only markup, **bold**, becomes a <strong> here. Each note is labelled with a word as well as a colour, so it never depends on colour.
 * A picture that cannot load says so in words instead of showing a broken image.
 */
@Component({
  selector: 'zp-manual-blocks',
  imports: [ManualDiagramComponent, ManualTextComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (b of blocks(); track $index) {
      @switch (b.kind) {
        @case ('p') { <p class="blk-p"><zp-manual-text [text]="b.text" /></p> }
        @case ('steps') {
          <ol class="blk-steps">
            @for (item of b.items; track $index) { <li><zp-manual-text [text]="item" /></li> }
          </ol>
        }
        @case ('list') {
          <ul class="blk-list">
            @for (item of b.items; track $index) { <li><zp-manual-text [text]="item" /></li> }
          </ul>
        }
        @case ('note') {
          <aside class="blk-note" [class]="'blk-note blk-note-' + b.tone" [attr.data-testid]="'note-' + b.tone">
            <span class="blk-note-label">{{ label(b.tone) }}</span>
            <span><zp-manual-text [text]="b.text" /></span>
          </aside>
        }
        @case ('table') {
          <div class="blk-table-wrap" tabindex="0" role="region" [attr.aria-label]="b.caption || 'Table'">
            <table class="blk-table">
              @if (b.caption) { <caption>{{ b.caption }}</caption> }
              <thead><tr>@for (h of b.head; track $index) { <th scope="col">{{ h }}</th> }</tr></thead>
              <tbody>
                @for (row of b.rows; track $index) {
                  <tr>@for (cell of row; track $index) { <td><zp-manual-text [text]="cell" /></td> }</tr>
                }
              </tbody>
            </table>
          </div>
        }
        @case ('screenshot') {
          <figure class="blk-fig" [attr.data-testid]="'shot-' + b.id">
            @if (failed().has(b.id)) {
              <p class="blk-missing" role="status">The picture "{{ b.caption }}" is not available.</p>
            } @else {
              <img [src]="imageUrl(b.id)" [alt]="b.alt" width="1280" height="800" [attr.loading]="eager() ? 'eager' : 'lazy'" decoding="async" (error)="miss(b.id)" />
            }
            <figcaption>{{ b.caption }}</figcaption>
          </figure>
        }
        @case ('diagram') {
          <figure class="blk-fig blk-fig-diagram" [attr.data-testid]="'figure-' + b.id">
            <zp-manual-diagram [id]="b.id" [alt]="b.alt" />
            <figcaption>{{ b.caption }}</figcaption>
          </figure>
        }
      }
    }
  `,
  styles: [`
    :host { display: block; }
    .blk-p { margin: .75rem 0; line-height: 1.65; }
    .blk-steps, .blk-list { margin: .75rem 0; padding-left: 1.5rem; line-height: 1.6; }
    .blk-steps { list-style: decimal; }
    .blk-list { list-style: disc; }
    .blk-steps li, .blk-list li { margin: .35rem 0; padding-left: .25rem; }
    .blk-note { display: flex; gap: .625rem; align-items: baseline; margin: 1rem 0; padding: .75rem 1rem; border-radius: .625rem; border: 1px solid rgb(var(--ink-rgb) / .3); border-left-width: 6px; background: rgb(var(--ink-rgb) / .05); line-height: 1.55; }
    .blk-note-label { flex: none; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; font-size: .75rem; }
    .blk-note-tip { border-left-color: rgb(var(--success-rgb)); }
    .blk-note-warning { border-left-color: rgb(var(--danger-rgb)); }
    .blk-note-limit { border-left-color: rgb(var(--warning-rgb)); background: rgb(var(--warning-rgb) / .1); }
    .blk-table-wrap { margin: 1rem 0; max-width: 100%; overflow-x: auto; border: 1px solid rgb(var(--ink-rgb) / .2); border-radius: .5rem; }
    .blk-table { width: 100%; border-collapse: collapse; font-size: .9rem; line-height: 1.45; }
    .blk-table caption { padding: .5rem .75rem; text-align: left; font-weight: 600; }
    .blk-table th { text-align: left; padding: .5rem .75rem; background: rgb(var(--ink-rgb) / .08); border-bottom: 1px solid rgb(var(--ink-rgb) / .25); font-weight: 700; }
    .blk-table td { padding: .5rem .75rem; vertical-align: top; border-bottom: 1px solid rgb(var(--ink-rgb) / .12); }
    .blk-table tr:last-child td { border-bottom: 0; }
    .blk-fig { margin: 1.25rem 0; }
    .blk-fig img { display: block; width: 100%; height: auto; border: 1px solid rgb(var(--ink-rgb) / .25); border-radius: .5rem; background: #fff; }
    .blk-fig figcaption { margin-top: .5rem; font-size: .85rem; opacity: .85; line-height: 1.45; }
    .blk-missing { padding: 1rem; border: 1px dashed rgb(var(--ink-rgb) / .4); border-radius: .5rem; }
    @media print {
      .blk-fig, .blk-note, .blk-table tr, .blk-steps li { break-inside: avoid; }
      .blk-table-wrap { overflow: visible; border-color: #999; }
      .blk-fig img { border-color: #999; }
    }
  `]
})
export class ManualBlocksComponent {
  readonly blocks = input.required<readonly Block[]>();
  /** The PDF's page loads every picture at once, so the page is complete before it is printed. */
  readonly eager = input(false);

  protected readonly failed = signal<ReadonlySet<string>>(new Set());

  protected label(tone: NoteTone): string { return NOTE_LABEL[tone]; }
  protected imageUrl(id: string): string { return `${IMAGE_DIR}/${id}.png`; }
  protected miss(id: string): void { this.failed.update((f) => new Set([...f, id])); }
}
