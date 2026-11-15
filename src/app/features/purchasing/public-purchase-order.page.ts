import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiEnvelope } from '../../core/models/api.model';
import { WorkstationOrderDto } from '../../core/models/purchasing.model';
import { toApiError, unwrap } from '../../core/services/api.util';
import { PoPrintSheetComponent } from './po-print-sheet.component';

/**
 * A purchase order as its supplier sees it, opened from the web link they were sent, without signing in. The long random part of the
 * address is the only key: it opens this one order, read-only, as it would be printed. Nothing else of the business is reachable.
 */
@Component({
  selector: 'zp-public-purchase-order',
  standalone: true,
  imports: [PoPrintSheetComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="min-h-screen bg-slate-100 px-2 py-6 text-slate-900 print:bg-white print:p-0" data-testid="public-po">
      <div class="mx-auto max-w-4xl space-y-3">
        @if (order(); as o) {
          <div class="flex flex-wrap items-center justify-between gap-2 px-2 print:hidden">
            <h1 class="text-lg font-bold">{{ o.documentNumber }} from {{ company() }}</h1>
            <button type="button" class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white" data-testid="public-po-print" (click)="print()">Print or save as PDF</button>
          </div>
          <div class="overflow-x-auto rounded-lg bg-white shadow print:shadow-none"><zp-po-print-sheet [doc]="o" [screen]="true" [companyName]="company()" /></div>
        } @else if (error()) {
          <p class="rounded-lg bg-white p-4 text-center shadow" role="alert" data-testid="public-po-error">{{ error() }}</p>
        } @else {
          <p class="text-center" role="status">Loading the order...</p>
        }
      </div>
    </main>
  `
})
export class PublicPurchaseOrderPageComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);

  protected readonly order = signal<WorkstationOrderDto | null>(null);
  protected readonly company = signal('');
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.paramMap.get('token') ?? '';
    try {
      const r = await firstValueFrom(this.http.get<ApiEnvelope<{ companyName: string; order: WorkstationOrderDto }>>(`/api/v1/public/purchase-orders/${encodeURIComponent(token)}`).pipe(unwrap()));
      this.company.set(r.companyName);
      this.order.set(r.order);
    } catch (err) {
      const e = toApiError(err);
      this.error.set(e.status === 404 ? 'This link is not valid. Ask the business to send it again.' : e.status === 0 ? 'No connection. Try again when you are online.' : e.message);
    }
  }

  protected print(): void { window.print(); }
}
