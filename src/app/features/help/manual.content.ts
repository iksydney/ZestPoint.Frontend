import { ACCOUNTANT, KITCHEN_STAFF, STORE_KEEPER } from './chapters/back-of-house.chapter';
import { CONNECTS } from './chapters/connects.chapter';
import { FIRST_DAY } from './chapters/first-day.chapter';
import { CASHIER, WAITER } from './chapters/floor.chapter';
import { KITCHEN_DAY } from './chapters/kitchen-day.chapter';
import { MANAGER, OWNER } from './chapters/owner-manager.chapter';
import { PHONE } from './chapters/phone.chapter';
import { FAQ, GLOSSARY, NOT_YET } from './chapters/reference.chapter';
import { START } from './chapters/start.chapter';
import { TROUBLESHOOTING } from './chapters/troubleshooting.chapter';
import { Block, Chapter, RoleId, RoleInfo, Section, sectionText } from './manual.types';

export * from './manual.types';

/**
 * THE MANUAL: the one source of its words. The Help screen (/app/help), the page the PDF is made from (/manual-print) and the checks that
 * read it all use this list, so a screen and the PDF cannot disagree. Chapters live under ./chapters, one file for each subject; this file
 * only puts them in reading order and holds what is shared (the people it is for, the date, the search).
 *
 * RULE: write only what ZestPoint does today (constitution Hard stop 9). Where a part is partly done, say so with a "not there yet" note, and
 * take the facts from the architecture notes and ../../findings.md. A screen or button named in bold must exist under that name.
 */
export const MANUAL_TITLE = 'The ZestPoint manual';
export const MANUAL_SUBTITLE = 'How everything works and how it connects, for the businesses that use ZestPoint: bars, restaurants, lounges, nightclubs and shops.';
export const MANUAL_DATE = '21 November 2026';
/** Where the PDF made from this same text is served (public/manual). */
export const MANUAL_PDF_URL = '/manual/ZestPoint-Manual.pdf';
export const MANUAL_IMAGE_DIR = '/manual/img';

export const ROLES: readonly RoleInfo[] = [
  { id: 'owner', label: 'Owner', blurb: 'Runs the company: sees everything, decides the rest' },
  { id: 'manager', label: 'Manager', blurb: 'Runs a branch: approves, reviews, looks after stock and staff' },
  { id: 'cashier', label: 'Cashier', blurb: 'Takes payment and looks after a till' },
  { id: 'waiter', label: 'Waiter', blurb: 'Takes orders at the table' },
  { id: 'kitchen', label: 'Kitchen and bar', blurb: 'Makes what is ordered' },
  { id: 'store', label: 'Store keeper', blurb: 'Receives deliveries and hands out stock' },
  { id: 'accountant', label: 'Accountant', blurb: 'The books, costs and what is owed' }
];

/** The chapters, in reading order. */
export const MANUAL: readonly Chapter[] = [
  START, CONNECTS, FIRST_DAY, OWNER, MANAGER, CASHIER, WAITER, KITCHEN_STAFF, STORE_KEEPER, ACCOUNTANT, KITCHEN_DAY, PHONE, TROUBLESHOOTING, NOT_YET, GLOSSARY, FAQ
];

export const chapterById = (id: string | null | undefined): Chapter | null => MANUAL.find((c) => c.id === id) ?? null;
export const chapterNumber = (c: Chapter): number => MANUAL.indexOf(c) + 1;

/** Does a chapter belong to this job? Chapters for 'all' always do. */
export const chapterIsFor = (c: Chapter, role: RoleId | null): boolean => role === null || c.roles === 'all' || c.roles.includes(role);

/** The sections of a chapter this job sees: a section that names its jobs is shown only to them. */
export const sectionsFor = (c: Chapter, role: RoleId | null): readonly Section[] => c.sections.filter((s) => role === null || !s.roles || s.roles.includes(role));

/** Every screenshot the manual shows, by id, so the screenshot spec and the checks know what must exist. */
export function screenshotIds(): readonly string[] {
  const ids = new Set<string>();
  for (const c of MANUAL) for (const s of c.sections) for (const b of s.blocks) if (b.kind === 'screenshot') ids.add(b.id);
  return [...ids];
}

/** A section found by search, with the chapter it is in. */
export interface SectionHit { readonly chapter: Chapter; readonly sections: readonly Section[] }

/**
 * What a search finds: every word typed must appear in a section's title or text (any order, any letter case). A chapter whose own title matches
 * brings all its sections. Nothing typed finds everything. The job filter narrows chapters and sections first.
 */
export function searchManual(query: string, role: RoleId | null): readonly SectionHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hits: SectionHit[] = [];
  for (const c of MANUAL) {
    if (!chapterIsFor(c, role)) continue;
    const pool = sectionsFor(c, role);
    const chapterHit = words.length > 0 && words.every((w) => c.title.toLowerCase().includes(w));
    const found = words.length === 0 || chapterHit ? pool : pool.filter((s) => { const t = sectionText(s); return words.every((w) => t.includes(w)); });
    if (found.length) hits.push({ chapter: c, sections: found });
  }
  return hits;
}

/** The text of the whole manual, for the plain checks (no developer terms, no secrets). */
export function manualPlainText(): string {
  const parts: string[] = [];
  for (const c of MANUAL) {
    parts.push(c.title, c.summary);
    for (const s of c.sections) {
      parts.push(s.title);
      s.blocks.forEach((b: Block) => parts.push(blockPlain(b)));
    }
  }
  return parts.join('\n');
}

function blockPlain(b: Block): string {
  switch (b.kind) {
    case 'p': return b.text;
    case 'steps':
    case 'list': return b.items.join('\n');
    case 'note': return b.text;
    case 'table': return [b.caption ?? '', ...b.head, ...b.rows.map((r) => r.join(' | '))].join('\n');
    case 'screenshot':
    case 'diagram': return `${b.caption}\n${b.alt}`;
  }
}
