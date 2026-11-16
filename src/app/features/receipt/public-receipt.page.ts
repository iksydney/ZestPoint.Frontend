import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ReceiptDto } from '../../core/models/ops.model';
import { printReceipt } from '../../core/receipt/receipt-render';
import { ApiEnvelope } from '../../core/models/api.model';
import { toApiError, unwrap } from '../../core/services/api.util';
import { ReceiptShareComponent, ReceiptViewComponent } from '../../shared/ui/receipt.components';

/**
 * A customer's receipt, opened from its web link (QR code, WhatsApp, e-mail, SMS, NFC tag) without signing in. The long random part of
 * the address is the only key: it opens this one receipt, read-only. Nothing else of the business is reachable from here.
 */
@Component({
    selector: 'zp-public-receipt',
    imports: [ReceiptViewComponent, ReceiptShareComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <main class="min-h-screen bg-slate-100 px-4 py-8 text-slate-900" data-testid="public-receipt">
      <div class="mx-auto max-w-sm space-y-4">
        @if (receipt(); as r) {
          <h1 class="text-center text-lg font-bold">Your receipt from {{ r.companyName }}</h1>
          <div class="rounded-lg shadow"><zp-receipt-view [receipt]="r" /></div>
          <div class="rounded-lg bg-white p-3 shadow print:hidden">
            <zp-receipt-share [receipt]="r" [askPhone]="false" (print)="print(r)" />
          </div>
        } @else if (error()) {
          <p class="rounded-lg bg-white p-4 text-center shadow" role="alert" data-testid="public-receipt-error">{{ error() }}</p>
        } @else {
          <p class="text-center" role="status">Loading your receipt...</p>
        }
      </div>
    </main>
  `
})
export class PublicReceiptPageComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);

  protected readonly receipt = signal<ReceiptDto | null>(null);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.paramMap.get('token') ?? '';
    try {
      const r = await firstValueFrom(this.http.get<ApiEnvelope<ReceiptDto>>(`/api/v1/public/receipts/${encodeURIComponent(token)}`).pipe(unwrap()));
      this.receipt.set({ ...r, shareToken: token });
    } catch (err) {
      const e = toApiError(err);
      this.error.set(e.status === 404 ? 'This receipt link is not valid. Ask the shop to send it again.' : e.status === 0 ? 'No connection. Try again when you are online.' : e.message);
    }
  }

  protected print(r: ReceiptDto): void { printReceipt(r); }
}
