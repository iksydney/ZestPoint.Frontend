import qrcode from 'qrcode-generator';
import { IssuedGiftCardDto } from '../models/gift-card.model';

const esc = (text: string): string => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const money = (value: number, currency: string): string => {
  try { return new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value); }
  catch { return `${currency} ${value.toFixed(2)}`; }
};

/** The QR code carries the code and nothing else, so a scanner that types what it reads fills the till's code box. Drawn on the device. */
export function giftCardQr(code: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(code.replace(/-/g, ''));
  qr.make();
  return qr.createSvgTag({ scalable: true, margin: 2 });
}

/** The slip the customer takes away: what the card is worth, the code, how to use it, and a QR code of the code. Every piece of text is escaped. */
export function giftCardSlipHtml(card: IssuedGiftCardDto, companyName: string): string {
  const expiry = card.expiresAtUtc ? `<p class="gc-c">Use it before ${esc(new Date(card.expiresAtUtc.endsWith('Z') ? card.expiresAtUtc : card.expiresAtUtc + 'Z').toLocaleDateString('en-GB', { dateStyle: 'long' }))}.</p>` : '';
  return `<article class="gc" data-testid="gift-card-slip">
<p class="gc-c gc-b">${esc(companyName)}</p>
<p class="gc-c gc-big">GIFT CARD</p>
<p class="gc-c gc-big">${esc(money(card.amount, card.currencyCode))}</p>
<hr class="gc-rule" />
<p class="gc-c">Your code</p>
<p class="gc-c gc-code" data-testid="gift-card-slip-code">${esc(card.code)}</p>
<div class="gc-qr">${giftCardQr(card.code)}</div>
${expiry}
<hr class="gc-rule" />
<p class="gc-c">Spend it at any of our branches, all at once or a little at a time. Give the code to the cashier when you pay.</p>
<p class="gc-c">Keep this slip safe: anyone who has the code can spend the card.</p>
<p class="gc-c">Card ${card.number}</p>
</article>`;
}

const SLIP_CSS = `
@page { margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
.gc { box-sizing: border-box; width: 80mm; padding: 4mm 5mm 8mm; color: #000; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace; font-size: 12px; line-height: 1.6; }
.gc p { margin: 0; overflow-wrap: anywhere; }
.gc-c { text-align: center; }
.gc-b { font-weight: 700; }
.gc-big { font-size: 18px; font-weight: 700; }
.gc-code { font-size: 17px; font-weight: 700; letter-spacing: .06em; margin: .35rem 0; }
.gc-rule { border: 0; border-top: 1px dashed #000; margin: .5rem 0; }
.gc-qr { width: 38mm; height: 38mm; margin: .3rem auto; }
.gc-qr svg { width: 100%; height: 100%; }
`;

/** Prints the slip by itself, in a hidden frame, so nothing of the screen it came from reaches the paper (the same way a receipt is printed). */
export function printGiftCardSlip(card: IssuedGiftCardDto, companyName: string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('data-testid', 'gift-card-print-frame');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  frame.srcdoc = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Gift card ${card.number}</title><style>${SLIP_CSS}</style></head><body>${giftCardSlipHtml(card, companyName)}</body></html>`;
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
