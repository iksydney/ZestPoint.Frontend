import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import qrcode from 'qrcode-generator';
import { ReceiptDto } from '../../core/models/ops.model';
import { RECEIPT_CSS, receiptHtml, receiptLink, receiptMessage, receiptPng } from '../../core/receipt/receipt-render';

/** The receipt as the customer gets it. Screen, print, picture and message are all made from the same rows (core/receipt/receipt-render.ts). */
@Component({
  selector: 'zp-receipt-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `<div [innerHTML]="html()"></div>`,
  styles: [RECEIPT_CSS]
})
export class ReceiptViewComponent {
  private readonly sanitizer = inject(DomSanitizer);
  readonly receipt = input.required<ReceiptDto>();
  // receiptHtml escapes every piece of text itself; it is trusted as it stands so the test ids on the rows are kept.
  protected readonly html = computed(() => this.sanitizer.bypassSecurityTrustHtml(receiptHtml(this.receipt())));
}

interface NdefWriter { write(message: { records: { recordType: string; data: string }[] }): Promise<void> }

/**
 * Every way a receipt can reach the customer: print, the device's share sheet (WhatsApp, e-mail, Bluetooth, Nearby Share, AirDrop, as a
 * picture), a WhatsApp, SMS or e-mail message carrying its web link, the link itself, a QR code to scan, an NFC tag to tap (Android
 * Chrome only), and a picture to download. The link opens that one receipt without signing in (see PublicReceiptPageComponent).
 * Nothing is sent to any outside service from here: the QR code is drawn on the device and messages open the person's own apps.
 */
@Component({
    selector: 'zp-receipt-share',
    imports: [FormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="space-y-3 text-sm" data-testid="receipt-share">
      <div class="flex flex-wrap gap-2">
        @if (showPrint()) { <button type="button" class="btn-primary" data-testid="reprint" (click)="print.emit()">Print</button> }
        @if (canShare) { <button type="button" class="btn-outline" data-testid="receipt-share-sheet" [disabled]="busy()" (click)="share()">Share</button> }
        <button type="button" class="btn-outline" data-testid="receipt-download" [disabled]="busy()" (click)="download()">Download</button>
      </div>

      @if (link(); as url) {
        @if (askPhone()) {
          <div>
            <label class="app-label" for="rs-phone">Customer's phone (optional, for WhatsApp and SMS)</label>
            <input id="rs-phone" class="app-input font-mono" inputmode="tel" autocomplete="off" maxlength="20" placeholder="e.g. 2348012345678" data-testid="receipt-phone" [ngModel]="typedPhone()" (ngModelChange)="typedPhone.set($event)" />
            <p class="mt-1 text-xs text-ink/70">With the country code, no plus sign or spaces. Leave empty to choose the person in WhatsApp.</p>
          </div>
        }
        <div class="flex flex-wrap gap-2">
          <a class="btn-outline" target="_blank" rel="noopener noreferrer" data-testid="receipt-whatsapp" [href]="whatsapp()">WhatsApp</a>
          <a class="btn-outline" data-testid="receipt-email" [href]="email()">E-mail</a>
          <a class="btn-outline" data-testid="receipt-sms" [href]="sms()">SMS</a>
          <button type="button" class="btn-outline" data-testid="receipt-copy" (click)="copy(url)">Copy link</button>
          @if (canNfc) { <button type="button" class="btn-outline" data-testid="receipt-nfc" [disabled]="busy()" (click)="writeNfc(url)">Write to NFC tag</button> }
        </div>
        <div class="flex items-center gap-3 rounded-lg border border-ink/15 p-3">
          <div class="h-32 w-32 shrink-0 rounded bg-white p-1" data-testid="receipt-qr" [attr.data-link]="url" [innerHTML]="qr()" role="img" aria-label="QR code of the receipt link"></div>
          <p class="text-ink/80">The customer points their phone camera at this code to open the receipt and keep it.</p>
        </div>
      } @else {
        <p class="text-ink/70" data-testid="receipt-no-link">This receipt has no web link yet, so it can be printed, shared as a picture or downloaded only.</p>
      }
      @if (note()) { <p role="status" data-testid="receipt-share-note">{{ note() }}</p> }
    </div>
  `
})
export class ReceiptShareComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly receipt = input.required<ReceiptDto>();
  /** The phone of the customer on the bill, when there is one: it fills the box. */
  readonly phone = input<string | null>(null);
  readonly showPrint = input(true);
  /** The till asks for a phone number; the customer's own page does not. */
  readonly askPhone = input(true);
  /** The person pressed Print; the till records the reprint and prints. */
  readonly print = output<void>();

  protected readonly typedPhone = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly note = signal<string | null>(null);
  protected readonly canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  protected readonly canNfc = typeof window !== 'undefined' && 'NDEFReader' in window;

  protected readonly link = computed(() => { const t = this.receipt().shareToken; return t ? receiptLink(t) : null; });
  private readonly digits = computed(() => (this.typedPhone() ?? this.phone() ?? '').replace(/\D/g, ''));
  private readonly message = computed(() => receiptMessage(this.receipt(), this.link()));

  protected readonly whatsapp = computed(() => `https://wa.me/${this.digits()}?text=${encodeURIComponent(this.message())}`);
  protected readonly sms = computed(() => this.sanitizer.bypassSecurityTrustUrl(`sms:${this.digits()}?&body=${encodeURIComponent(this.message())}`));
  protected readonly email = computed(() => `mailto:?subject=${encodeURIComponent(`Your receipt from ${this.receipt().companyName}`)}&body=${encodeURIComponent(this.message())}`);

  /** Drawn on this device; the link goes nowhere else. */
  protected readonly qr = computed(() => {
    const url = this.link();
    if (!url) return '';
    const code = qrcode(0, 'M');
    code.addData(url);
    code.make();
    return this.sanitizer.bypassSecurityTrustHtml(code.createSvgTag({ scalable: true, margin: 2 }));
  });

  private fileName(): string { return `receipt-${this.receipt().number}.png`; }

  protected async share(): Promise<void> {
    this.busy.set(true);
    this.note.set(null);
    try {
      const r = this.receipt();
      const file = new File([await receiptPng(r)], this.fileName(), { type: 'image/png' });
      const withFile: ShareData = { title: `Receipt #${r.number}`, text: this.message(), files: [file] };
      if (navigator.canShare?.(withFile)) await navigator.share(withFile);
      else await navigator.share({ title: `Receipt #${r.number}`, text: this.message(), url: this.link() ?? undefined });
    } catch (err) {
      if ((err as { name?: string }).name !== 'AbortError') this.note.set('This device could not open its share options. Use one of the other ways.');
    } finally { this.busy.set(false); }
  }

  protected async download(): Promise<void> {
    this.busy.set(true);
    this.note.set(null);
    try {
      const url = URL.createObjectURL(await receiptPng(this.receipt()));
      const a = document.createElement('a');
      a.href = url;
      a.download = this.fileName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      this.note.set('Saved as a picture.');
    } catch { this.note.set('The picture could not be made on this device.'); }
    finally { this.busy.set(false); }
  }

  protected async copy(url: string): Promise<void> {
    try { await navigator.clipboard.writeText(url); this.note.set('Link copied.'); }
    catch { this.note.set(`Copy this link: ${url}`); }
  }

  /** Android Chrome only: the link is written to an NFC sticker or card held to this device; the customer then taps that. */
  protected async writeNfc(url: string): Promise<void> {
    this.busy.set(true);
    this.note.set('Hold an NFC tag to the back of this device...');
    try {
      const Reader = (window as unknown as { NDEFReader: new () => NdefWriter }).NDEFReader;
      await new Reader().write({ records: [{ recordType: 'url', data: url }] });
      this.note.set('Written. The customer can tap the tag with their phone.');
    } catch { this.note.set('The tag was not written. NFC may be off, or permission was refused.'); }
    finally { this.busy.set(false); }
  }
}
