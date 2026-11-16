import qrcode from 'qrcode-generator';

const esc = (text: string): string => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** The address a table's sticker opens: the customer's menu for that table. The code in it is the table's secret. */
export const tableLink = (code: string): string => `${window.location.origin}/t/${code}`;

/** The QR code of the link, drawn on this device (nothing is sent to an outside service). */
export function tableQr(code: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(tableLink(code));
  qr.make();
  return qr.createSvgTag({ scalable: true, margin: 2 });
}

export interface TableSticker { readonly name: string; readonly area: string | null; readonly code: string }

const CSS = `
@page { margin: 8mm; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; font-family: system-ui, sans-serif; }
.sheet { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8mm; }
.card { break-inside: avoid; border: 1px dashed #000; padding: 6mm; text-align: center; }
.card h2 { margin: 0 0 2mm; font-size: 22pt; }
.card p { margin: 1mm 0; font-size: 11pt; }
.card .qr { width: 52mm; height: 52mm; margin: 3mm auto; }
.card .qr svg { width: 100%; height: 100%; }
`;

/**
 * Prints one sticker per table: the table's name, its QR code and a line saying what it is for. Done in a hidden frame so nothing of the screen reaches the paper. The
 * codes are drawn on the device and are not kept anywhere once printed.
 */
export function printTableStickers(company: string, stickers: readonly TableSticker[]): void {
  const cards = stickers.map((s) => `<section class="card"><p>${esc(company)}</p><h2>Table ${esc(s.name)}</h2>${s.area ? `<p>${esc(s.area)}</p>` : ''}<div class="qr">${tableQr(s.code)}</div><p>Scan to see the menu, order from your table, call a waiter or ask for the bill.</p></section>`).join('');
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('data-testid', 'table-qr-print-frame');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  frame.srcdoc = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Table QR codes</title><style>${CSS}</style></head><body><div class="sheet">${cards}</div></body></html>`;
  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) { frame.remove(); return; }
    const done = () => setTimeout(() => frame.remove(), 500);
    win.addEventListener('afterprint', done, { once: true });
    win.focus();
    win.print();
    setTimeout(() => frame.remove(), 120_000);
  };
  document.body.appendChild(frame);
}
