import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { IssuedGiftCardDto } from '../../core/models/gift-card.model';
import { giftCardQr, printGiftCardSlip } from '../../core/receipt/gift-card-slip';

/**
 * A gift card that has just been issued: its code, big, with a QR code of it, and the slip to print. This is the only time the code exists on the
 * screen: the server keeps a scrambled form of it, so it cannot be shown again, and nothing here is kept on the device after it is closed.
 */
@Component({
    selector: 'zp-gift-card-issued',
    imports: [CurrencyPipe, DatePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="space-y-3" data-testid="gift-card-issued">
      <p class="text-sm" role="note">This is the only time the code is shown. Print the slip or give the code to the customer now: it cannot be shown again. If it is lost, a manager can cancel the card and issue a new one.</p>
      <div class="rounded-lg bg-ink/5 p-4 text-center">
        <p class="text-sm text-ink/70">Gift card {{ card().number }}, worth <strong>{{ card().amount | currency: card().currencyCode : 'symbol-narrow' : '1.2-2' }}</strong></p>
        <p class="mt-1 font-mono text-2xl font-bold tracking-wider" data-testid="gift-card-code">{{ card().code }}</p>
        <div class="mx-auto mt-2 h-36 w-36 rounded bg-white p-1" data-testid="gift-card-qr" [innerHTML]="qr()" role="img" aria-label="QR code of the gift card code"></div>
      </div>
      @if (card().expiresAtUtc; as expiry) { <p class="text-sm" data-testid="gift-card-expiry">Valid until {{ expiry | date: 'longDate' }}.</p> }
      @if (card().messageNote; as note) { <p class="sys-alert sys-alert-info" role="status" data-testid="gift-card-message">{{ note }}</p> }
      @if (copied()) { <p class="text-sm" role="status" data-testid="gift-card-copied">The code is on the clipboard.</p> }
      <div class="flex flex-wrap justify-end gap-2">
        <button type="button" class="btn-outline" data-testid="gift-card-copy" (click)="copy()">Copy the code</button>
        <button type="button" class="btn-outline" data-testid="gift-card-print" (click)="print()">Print the slip</button>
        <button type="button" class="btn-primary" data-testid="gift-card-done" (click)="done.emit()">Done</button>
      </div>
    </div>
  `
})
export class GiftCardIssuedComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly card = input.required<IssuedGiftCardDto>();
  readonly companyName = input('');
  readonly done = output<void>();

  protected readonly copied = signal(false);
  /** Drawn on this device. */
  protected readonly qr = computed(() => this.sanitizer.bypassSecurityTrustHtml(giftCardQr(this.card().code)));

  protected print(): void { printGiftCardSlip(this.card(), this.companyName()); }

  protected async copy(): Promise<void> {
    try { await navigator.clipboard.writeText(this.card().code.replace(/-/g, '')); this.copied.set(true); }
    catch { this.copied.set(false); }
  }
}
