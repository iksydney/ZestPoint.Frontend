/**
 * The shapes of the manual and the small helpers its chapters are written with.
 *
 * The manual is DATA, not markup: chapters hold sections and sections hold blocks. The Help screen (help.component.ts) and the page the PDF is
 * made from (manual-print.component.ts) both draw it with the same block renderer, so the two can never disagree. Text is plain: the only
 * markup is **bold** (a screen, a button or a word being defined), which the renderer turns into <strong> without ever using innerHTML.
 */

/** The people the manual is written for. A chapter says which of them it is for; the Help screen's role chips filter on these. */
export type RoleId = 'owner' | 'manager' | 'cashier' | 'waiter' | 'kitchen' | 'store' | 'accountant';

export interface RoleInfo {
  readonly id: RoleId;
  readonly label: string;
  /** One line, shown beside the chip. */
  readonly blurb: string;
}

/** Hand-drawn pictures (inline SVG, manual-diagrams.component.ts). */
export type DiagramId = 'connect' | 'journey';

/** How a note is drawn: a tip, something to be careful with, or something ZestPoint does not do yet. */
export type NoteTone = 'tip' | 'warning' | 'limit';

export type Block =
  | { readonly kind: 'p'; readonly text: string }
  | { readonly kind: 'steps'; readonly items: readonly string[] }
  | { readonly kind: 'list'; readonly items: readonly string[] }
  | { readonly kind: 'note'; readonly tone: NoteTone; readonly text: string }
  | { readonly kind: 'table'; readonly head: readonly string[]; readonly rows: readonly (readonly string[])[]; readonly caption?: string }
  /** A picture of the real screen with demonstration data. `id` is the file name in public/manual/img (without .png). */
  | { readonly kind: 'screenshot'; readonly id: string; readonly caption: string; readonly alt: string }
  | { readonly kind: 'diagram'; readonly id: DiagramId; readonly caption: string; readonly alt: string };

export interface Section {
  /** Stable and unique across the whole manual: it is the link to the section (#id) and a test id. */
  readonly id: string;
  readonly title: string;
  /** When set, only these roles see the section when they pick their chip. */
  readonly roles?: readonly RoleId[];
  readonly blocks: readonly Block[];
}

export interface Chapter {
  /** The address of the chapter: /app/help/<id>. */
  readonly id: string;
  readonly title: string;
  /** One or two sentences under the title and beside it in the contents. */
  readonly summary: string;
  /** Who it is for; 'all' shows it whichever chip is picked. */
  readonly roles: readonly RoleId[] | 'all';
  readonly sections: readonly Section[];
}

// ---- Writing helpers: they only build the data above, so a chapter reads like the page it makes. ----------------------------------------

export const p = (text: string): Block => ({ kind: 'p', text });
export const steps = (...items: string[]): Block => ({ kind: 'steps', items });
export const list = (...items: string[]): Block => ({ kind: 'list', items });
export const tip = (text: string): Block => ({ kind: 'note', tone: 'tip', text });
export const careful = (text: string): Block => ({ kind: 'note', tone: 'warning', text });
/** Something ZestPoint does not do yet, or does only in part: always said plainly (the product never claims what it does not do). */
export const notYet = (text: string): Block => ({ kind: 'note', tone: 'limit', text });
export const table = (head: readonly string[], rows: readonly (readonly string[])[], caption?: string): Block => ({ kind: 'table', head, rows, caption });
export const shot = (id: string, caption: string, alt: string): Block => ({ kind: 'screenshot', id, caption, alt });
export const diagram = (id: DiagramId, caption: string, alt: string): Block => ({ kind: 'diagram', id, caption, alt });
export const section = (id: string, title: string, blocks: readonly Block[], roles?: readonly RoleId[]): Section => ({ id, title, blocks, roles });

/** A piece of a line of text: plain, or bold. */
export interface Segment { readonly text: string; readonly bold: boolean }

/** Splits **bold** out of a line. An unmatched ** is left as it is, so a stray one never swallows the rest of a sentence. */
export function inline(text: string): readonly Segment[] {
  const out: Segment[] = [];
  const parts = text.split('**');
  if (parts.length % 2 === 0) return [{ text, bold: false }];
  parts.forEach((part, i) => { if (part) out.push({ text: part, bold: i % 2 === 1 }); });
  return out;
}

/** The text of a block, for searching and for the plain-text checks. */
export function blockText(b: Block): string {
  switch (b.kind) {
    case 'p': return b.text;
    case 'steps':
    case 'list': return b.items.join(' ');
    case 'note': return b.text;
    case 'table': return [b.caption ?? '', ...b.head, ...b.rows.flat()].join(' ');
    case 'screenshot':
    case 'diagram': return `${b.caption} ${b.alt}`;
  }
}

/** Everything a section says, lower-cased once, for the Help screen's search. **bold** marks are removed so a search matches the words. */
export function sectionText(s: Section): string {
  return [s.title, ...s.blocks.map(blockText)].join(' ').replace(/\*\*/g, '').toLowerCase();
}
