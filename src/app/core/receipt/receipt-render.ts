import { ReceiptDto } from '../models/ops.model';

/**
 * One description of a receipt, used for everything a receipt becomes: what is shown on screen, what is printed, the picture that is
 * shared or downloaded, and the text of a message. Change a line here and all of them change together.
 */
export interface ReceiptRow {
  readonly kind: 'title' | 'center' | 'rule' | 'pair' | 'total' | 'indent' | 'note' | 'right';
  readonly left?: string;
  readonly right?: string;
  /** data-testid for the automated tests: on the right-hand figure of a pair, otherwise on the row. */
  readonly testId?: string;
}

const money = (value: number, currency: string): string => {
  try { return new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value); }
  catch { return `${currency} ${value.toFixed(2)}`; }
};

const quantity = (value: number): string => String(Math.round(value * 1000) / 1000);

/** The receipt's own date and time, in the time zone of the branch that issued it. */
export function receiptWhen(r: ReceiptDto): string {
  const at = new Date(r.issuedAtUtc.endsWith('Z') || /[+-]\d\d:\d\d$/.test(r.issuedAtUtc) ? r.issuedAtUtc : r.issuedAtUtc + 'Z');
  try { return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: r.timeZoneId }).format(at); }
  catch { return at.toLocaleString(); }
}

export function receiptRows(r: ReceiptDto): ReceiptRow[] {
  const m = (v: number) => money(v, r.currencyCode);
  const rows: ReceiptRow[] = [{ kind: 'title', left: r.companyName }];
  const centre = (text: string | null | undefined) => { for (const line of (text ?? '').split(/\r?\n/)) if (line.trim()) rows.push({ kind: 'center', left: line.trim() }); };
  centre(r.tagline);
  centre(r.header);
  centre(r.branchName);
  rows.push({ kind: 'center', left: `Receipt #${r.number}, bill #${r.orderNumber}` });
  rows.push({ kind: 'center', left: receiptWhen(r), testId: 'receipt-when' });
  if (r.label) rows.push({ kind: 'center', left: r.label });
  rows.push({ kind: 'rule' });
  for (const l of r.lines) {
    rows.push({ kind: 'pair', left: `${quantity(l.quantity)} x ${l.name}`, right: m(l.lineTotal) });
    for (const c of l.contents ?? []) rows.push({ kind: 'indent', left: `${quantity(c.quantity)} x ${c.name}`, testId: 'receipt-content' });
  }
  rows.push({ kind: 'rule' });
  rows.push({ kind: 'pair', left: 'Subtotal', right: m(r.subtotal) });
  if (r.discounts > 0) rows.push({ kind: 'pair', left: 'Discounts', right: '-' + m(r.discounts), testId: 'receipt-discounts' });
  rows.push({ kind: 'pair', left: `${r.taxName} ${r.taxRatePercent}%${r.taxInclusive ? ' (incl.)' : ''}`, right: m(r.tax) });
  if (r.tip > 0) rows.push({ kind: 'pair', left: 'Tip', right: m(r.tip) });
  rows.push({ kind: 'total', left: 'TOTAL', right: m(r.total), testId: 'receipt-total' });
  for (const p of r.payments) rows.push({ kind: 'pair', left: `${p.method}${p.isDemo ? ' (DEMO)' : ''}`, right: m(p.amount) });
  if (r.change > 0) rows.push({ kind: 'pair', left: 'Change', right: m(r.change) });
  if (r.loyaltyCustomer) rows.push({ kind: 'note', left: `${r.loyaltyCustomer}: ${r.pointsEarned ?? 0} points from this bill, ${r.pointsBalance ?? 0} in all`, testId: 'receipt-loyalty' });
  if (r.isDemoPayment) rows.push({ kind: 'title', left: 'DEMONSTRATION PAYMENT: NO REAL MONEY MOVED' });
  if (r.footer) { rows.push({ kind: 'note', left: '' }); centre(r.footer); }
  if (r.printCount > 0) rows.push({ kind: 'center', left: `Reprint ${r.printCount}` });
  if (r.servedBy) rows.push({ kind: 'right', left: `Served by ${r.servedBy}`, testId: 'receipt-served-by' });
  return rows;
}

const esc = (text: string): string => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const tid = (id?: string): string => (id ? ` data-testid="${esc(id)}"` : '');

/** Every piece of text is escaped here, so the result is safe to put on a page as it is. */
export function receiptHtml(r: ReceiptDto): string {
  const body = receiptRows(r).map((row) => {
    switch (row.kind) {
      case 'rule': return '<hr class="zpr-rule" />';
      case 'pair': return `<p class="zpr-pair"><span>${esc(row.left ?? '')}</span><span${tid(row.testId)}>${esc(row.right ?? '')}</span></p>`;
      case 'total': return `<p class="zpr-pair zpr-b"><span>${esc(row.left ?? '')}</span><span${tid(row.testId)}>${esc(row.right ?? '')}</span></p>`;
      case 'title': return `<p class="zpr-c zpr-b"${tid(row.testId)}>${esc(row.left ?? '')}</p>`;
      case 'center': return `<p class="zpr-c"${tid(row.testId)}>${esc(row.left ?? '')}</p>`;
      case 'indent': return `<p class="zpr-in"${tid(row.testId)}>${esc(row.left ?? '')}</p>`;
      case 'right': return `<p class="zpr-r"${tid(row.testId)}>${esc(row.left ?? '')}</p>`;
      default: return `<p${tid(row.testId)}>${esc(row.left ?? '') || '&nbsp;'}</p>`;
    }
  }).join('');
  return `<article class="zpr" id="receipt-print" data-testid="receipt-view">${body}</article>`;
}

/** The look of a receipt: black on white, fixed-width type, the width of an 80 mm till roll. Used on screen and in the printed page. */
export const RECEIPT_CSS = `
.zpr { box-sizing: border-box; width: 100%; max-width: 20rem; margin: 0 auto; padding: 1rem; border-radius: .375rem; background: #fff; color: #0f172a;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace; font-size: 12px; line-height: 1.65; }
.zpr p { margin: 0; overflow-wrap: anywhere; }
.zpr-c { text-align: center; }
.zpr-r { text-align: right; margin-top: .5rem !important; }
.zpr-b { font-weight: 700; }
.zpr-in { padding-left: 1rem; }
.zpr-pair { display: flex; justify-content: space-between; gap: .75rem; }
.zpr-pair > span:last-child { white-space: nowrap; }
.zpr-rule { border: 0; border-top: 1px dashed #94a3b8; margin: .5rem 0; }
`;

/** A whole page holding only the receipt, for printing: no application around it, no page margins, till-roll width. */
export function receiptDocument(r: ReceiptDto): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Receipt ${r.number}</title><style>
@page { margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
${RECEIPT_CSS}
.zpr { width: 80mm; max-width: 80mm; margin: 0; padding: 4mm 5mm 8mm; border-radius: 0; color: #000; }
.zpr-rule { border-top-color: #000; }
</style></head><body>${receiptHtml(r)}</body></html>`;
}

/**
 * Prints the receipt by itself. The page is put in a hidden frame and that frame is printed, so nothing of the till screen (the dialog,
 * the buttons, the dimmed background) reaches the paper, whatever the printer: a till-roll printer gets its 80 mm, a sheet printer gets
 * the receipt at the top left.
 */
export function printReceipt(r: ReceiptDto): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('data-testid', 'receipt-print-frame');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  frame.srcdoc = receiptDocument(r);
  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) { frame.remove(); return; }
    const done = () => setTimeout(() => frame.remove(), 500);
    win.addEventListener('afterprint', done, { once: true });
    win.focus();
    win.print();
    setTimeout(() => frame.remove(), 120_000); // a browser that never reports "after print" still gets tidied up
  };
  document.body.appendChild(frame);
}

/** The web address of a receipt: what the QR code, a message and an NFC tag carry. */
export const receiptLink = (shareToken: string): string => `${window.location.origin}/r/${shareToken}`;

/** A short message to go with the link. */
export function receiptMessage(r: ReceiptDto, link: string | null): string {
  const total = money(r.total, r.currencyCode);
  return `${r.companyName}: receipt #${r.number}, ${receiptWhen(r)}. Total ${total}.${link ? ` View or save it here: ${link}` : ''}`;
}

/** The receipt as a picture (PNG), drawn from the same rows, for the share sheet and for download. */
export async function receiptPng(r: ReceiptDto): Promise<Blob> {
  const scale = 2;
  const width = 384;
  const pad = 20;
  const lineHeight = 22;
  const font = (bold: boolean) => `${bold ? '700 ' : ''}14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  const probe = document.createElement('canvas').getContext('2d')!;

  // Break text that is wider than the space it has, at spaces where it can.
  const wrap = (text: string, max: number, bold: boolean): string[] => {
    probe.font = font(bold);
    const out: string[] = [];
    let line = '';
    for (const word of text.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (probe.measureText(next).width <= max || !line) line = next; else { out.push(line); line = word; }
    }
    out.push(line);
    return out;
  };

  type Draw = { text: string; x: number; align: CanvasTextAlign; bold: boolean; right?: string } | 'rule';
  const draws: Draw[] = [];
  const inner = width - pad * 2;
  for (const row of receiptRows(r)) {
    const bold = row.kind === 'title' || row.kind === 'total';
    if (row.kind === 'rule') { draws.push('rule'); continue; }
    if (row.kind === 'pair' || row.kind === 'total') {
      probe.font = font(bold);
      const rightWidth = probe.measureText(row.right ?? '').width;
      const lines = wrap(row.left ?? '', inner - rightWidth - 12, bold);
      lines.forEach((text, i) => draws.push({ text, x: pad, align: 'left', bold, right: i === 0 ? row.right : undefined }));
      continue;
    }
    const centred = row.kind === 'title' || row.kind === 'center';
    const indent = row.kind === 'indent' ? 16 : 0;
    for (const text of wrap(row.left ?? '', inner - indent, bold))
      draws.push(centred ? { text, x: width / 2, align: 'center', bold } : row.kind === 'right' ? { text, x: width - pad, align: 'right', bold } : { text, x: pad + indent, align: 'left', bold });
  }

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = (pad * 2 + draws.length * lineHeight) * scale;
  const g = canvas.getContext('2d')!;
  g.scale(scale, scale);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, width, canvas.height / scale);
  g.fillStyle = '#000000';
  g.textBaseline = 'middle';
  draws.forEach((d, i) => {
    const y = pad + i * lineHeight + lineHeight / 2;
    if (d === 'rule') {
      g.save(); g.strokeStyle = '#64748b'; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(pad, y); g.lineTo(width - pad, y); g.stroke(); g.restore();
      return;
    }
    g.font = font(d.bold);
    g.textAlign = d.align;
    g.fillText(d.text, d.x, y);
    if (d.right) { g.textAlign = 'right'; g.fillText(d.right, width - pad, y); }
  });
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The picture could not be made.'))), 'image/png'));
}
