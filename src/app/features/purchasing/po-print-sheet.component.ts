import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DOCUMENT_TYPES, STATUS_TEXT, WorkstationOrderDto } from '../../core/models/purchasing.model';
import { AuthService } from '../../core/services/auth.service';

const UNIT: Record<string, string> = { Milliliter: 'ml', Gram: 'g', Each: 'each' };

/** The printable purchase document (order, return or transfer). Hidden on screen; shown only when the browser prints. Black on white on purpose. */
@Component({
    selector: 'zp-po-print-sheet',
    imports: [DatePipe, DecimalPipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    @if (doc(); as d) {
      <section class="bg-white p-6 font-jakarta text-sm text-black print:block" [class.hidden]="!screen()" data-testid="po-print-sheet">
        <header class="flex items-start justify-between border-b border-black pb-3">
          <div><h1 class="font-syne text-2xl font-bold">{{ typeLabel() }}</h1><p class="font-data text-lg">{{ d.documentNumber }}</p></div>
          <div class="text-right"><p class="font-semibold">{{ company() }}</p><p>{{ d.branchName }}</p><p>Status: {{ status() }}</p><p>Created {{ d.dateCreated | date: 'd MMM yyyy' }} by {{ d.createdByName ?? 'unknown' }}</p></div>
        </header>
        <div class="my-3 grid grid-cols-2 gap-4">
          @if (d.supplier; as s) {
            <div><p class="font-bold uppercase text-xs">Supplier</p><p class="font-semibold">{{ s.name }} {{ s.code }}</p><p>{{ s.address }}</p><p>Tel {{ s.phone }} {{ s.email }}</p>@if (s.taxId) { <p>Tax ID {{ s.taxId }}</p> }</div>
          } @else if (d.sourceBranchName) { <div><p class="font-bold uppercase text-xs">From</p><p class="font-semibold">{{ d.sourceBranchName }}</p></div> }
          <div><p class="font-bold uppercase text-xs">Delivery</p><p>To {{ d.branchName }}</p>@if (d.expectedDeliveryDate) { <p>Expected {{ d.expectedDeliveryDate | date: 'd MMM yyyy' }}</p> }
            @if (d.courier) { <p>Courier {{ d.courier }} {{ d.waybill }}</p> }@if (d.invoiceRef) { <p>Invoice ref {{ d.invoiceRef }}</p> }@if (d.paymentTermsDays != null) { <p>Terms: net {{ d.paymentTermsDays }} days</p> }</div>
        </div>
        <table class="w-full border-collapse text-left">
          <thead><tr class="border-y border-black"><th class="py-1">#</th><th>SKU</th><th>Item</th><th class="text-right">Qty</th><th class="text-right">Cost</th><th class="text-right">Disc %</th><th class="text-right">Tax %</th><th class="text-right">Total</th></tr></thead>
          <tbody>@for (l of d.lines; track l.id; let i = $index) {
            <tr class="border-b border-gray-300"><td class="py-1">{{ i + 1 }}</td><td class="font-data">{{ l.sku }}</td><td>{{ l.itemName }}@if (l.binCode) { <span class="text-xs"> [{{ l.binCode }}]</span> }</td>
              <td class="text-right font-data">{{ l.quantity | number: '1.0-4' }} {{ unit(l.unit) }}</td><td class="text-right font-data">{{ l.unitCost | number: '1.2-4' }}</td>
              <td class="text-right font-data">{{ l.discountPercent | number: '1.0-2' }}</td><td class="text-right font-data">{{ l.taxRatePercent | number: '1.0-2' }}</td><td class="text-right font-data">{{ l.lineTotal | number: '1.2-2' }}</td></tr> }</tbody>
        </table>
        <dl class="ml-auto mt-3 w-64 space-y-1">
          <div class="flex justify-between"><dt>Subtotal</dt><dd class="font-data">{{ d.subtotal | number: '1.2-2' }}</dd></div>
          <div class="flex justify-between"><dt>Discounts</dt><dd class="font-data">-{{ d.discount | number: '1.2-2' }}</dd></div>
          <div class="flex justify-between"><dt>Tax {{ d.taxInclusive ? '(included)' : '(added)' }}</dt><dd class="font-data">{{ d.tax | number: '1.2-2' }}</dd></div>
          <div class="flex justify-between border-t border-black pt-1 text-base font-bold"><dt>Total {{ d.currencyCode }}</dt><dd class="font-data">{{ d.total | number: '1.2-2' }}</dd></div>
        </dl>
        @if (d.notes) { <p class="mt-3 whitespace-pre-wrap">{{ d.notes }}</p> }
        <footer class="mt-10 grid grid-cols-3 gap-6 text-xs"><div class="border-t border-black pt-1">Prepared by {{ d.createdByName }}</div><div class="border-t border-black pt-1">Approved by {{ d.approvedByName }}</div><div class="border-t border-black pt-1">Received by</div></footer>
      </section>
    }
  `
})
export class PoPrintSheetComponent {
  private readonly auth = inject(AuthService);
  readonly doc = input.required<WorkstationOrderDto | null>();
  /** Shown on screen as well as in print (the supplier's page); otherwise it appears only when printing. */
  readonly screen = input(false);
  /** The business's name when nobody is signed in (the supplier's page). */
  readonly companyName = input<string | null>(null);
  protected readonly company = computed(() => this.companyName() ?? this.auth.tenant()?.name ?? '');
  protected readonly typeLabel = computed(() => DOCUMENT_TYPES.find((t) => t.value === this.doc()?.documentType)?.short ?? 'Purchase order');
  protected readonly status = computed(() => (this.doc() ? STATUS_TEXT[this.doc()!.status] : ''));
  protected unit = (u: string): string => UNIT[u] ?? u;
}
