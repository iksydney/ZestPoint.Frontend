import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import qrcode from 'qrcode-generator';

interface NdefWriter { write(message: { records: { recordType: string; data: string }[] }): Promise<void> }

/**
 * Sends a web link to someone: WhatsApp, e-mail, SMS, the device's own share options (Bluetooth, Nearby Share, AirDrop), copy, a QR
 * code to scan, and an NFC tag to tap (Chrome on Android only). Used for a purchase order's link to its supplier. Nothing goes to any
 * outside service from here: the QR code is drawn on the device and the messages open the person's own apps.
 */
@Component({
    selector: 'zp-share-links',
    imports: [FormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="space-y-3 text-sm" data-testid="share-links">
      <div>
        <label class="app-label" for="sl-phone">Their phone (optional, for WhatsApp and SMS)</label>
        <input id="sl-phone" class="app-input font-mono" inputmode="tel" autocomplete="off" maxlength="20" placeholder="e.g. 2348012345678" data-testid="share-phone" [ngModel]="typedPhone() ?? phone() ?? ''" (ngModelChange)="typedPhone.set($event)" />
        <p class="mt-1 text-xs text-ink/70">With the country code, no plus sign or spaces. Leave empty to choose the person in WhatsApp.</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <a class="btn-outline" target="_blank" rel="noopener noreferrer" data-testid="share-whatsapp" [href]="whatsapp()">WhatsApp</a>
        <a class="btn-outline" data-testid="share-email" [href]="mail()">E-mail</a>
        <a class="btn-outline" data-testid="share-sms" [href]="sms()">SMS</a>
        @if (canShare) { <button type="button" class="btn-outline" data-testid="share-sheet" (click)="share()">Share</button> }
        <button type="button" class="btn-outline" data-testid="share-copy" (click)="copy()">Copy link</button>
        <a class="btn-outline" target="_blank" rel="noopener" data-testid="share-open" [href]="link()">Open the page</a>
        @if (canNfc) { <button type="button" class="btn-outline" data-testid="share-nfc" [disabled]="busy()" (click)="writeNfc()">Write to NFC tag</button> }
      </div>
      <div class="flex items-center gap-3 rounded-lg border border-ink/15 p-3">
        <div class="h-32 w-32 shrink-0 rounded bg-white p-1" data-testid="share-qr" [attr.data-link]="link()" [innerHTML]="qr()" role="img" aria-label="QR code of the link"></div>
        <p class="text-ink/80">{{ qrHint() }}</p>
      </div>
      @if (note()) { <p role="status" data-testid="share-note">{{ note() }}</p> }
    </div>
  `
})
export class ShareLinksComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly link = input.required<string>();
  /** The text that goes with the link. */
  readonly message = input.required<string>();
  readonly subject = input('');
  readonly email = input<string | null>(null);
  readonly phone = input<string | null>(null);
  readonly qrHint = input('They point their phone camera at this code to open the page.');

  protected readonly typedPhone = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly note = signal<string | null>(null);
  protected readonly canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  protected readonly canNfc = typeof window !== 'undefined' && 'NDEFReader' in window;

  private readonly digits = computed(() => (this.typedPhone() ?? this.phone() ?? '').replace(/\D/g, ''));
  private readonly text = computed(() => `${this.message()} ${this.link()}`);
  protected readonly whatsapp = computed(() => `https://wa.me/${this.digits()}?text=${encodeURIComponent(this.text())}`);
  protected readonly sms = computed(() => this.sanitizer.bypassSecurityTrustUrl(`sms:${this.digits()}?&body=${encodeURIComponent(this.text())}`));
  protected readonly mail = computed(() => `mailto:${encodeURIComponent(this.email() ?? '')}?subject=${encodeURIComponent(this.subject())}&body=${encodeURIComponent(this.text())}`);
  protected readonly qr = computed(() => {
    const code = qrcode(0, 'M');
    code.addData(this.link());
    code.make();
    return this.sanitizer.bypassSecurityTrustHtml(code.createSvgTag({ scalable: true, margin: 2 }));
  });

  protected async share(): Promise<void> {
    try { await navigator.share({ title: this.subject(), text: this.message(), url: this.link() }); }
    catch (err) { if ((err as { name?: string }).name !== 'AbortError') this.note.set('This device could not open its share options. Use one of the other ways.'); }
  }

  protected async copy(): Promise<void> {
    try { await navigator.clipboard.writeText(this.link()); this.note.set('Link copied.'); }
    catch { this.note.set(`Copy this link: ${this.link()}`); }
  }

  protected async writeNfc(): Promise<void> {
    this.busy.set(true);
    this.note.set('Hold an NFC tag to the back of this device...');
    try {
      const Reader = (window as unknown as { NDEFReader: new () => NdefWriter }).NDEFReader;
      await new Reader().write({ records: [{ recordType: 'url', data: this.link() }] });
      this.note.set('Written. They can tap the tag with their phone.');
    } catch { this.note.set('The tag was not written. NFC may be off, or permission was refused.'); }
    finally { this.busy.set(false); }
  }
}
