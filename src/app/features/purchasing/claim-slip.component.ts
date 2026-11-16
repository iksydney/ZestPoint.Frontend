import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ClaimSlipDto } from '../../core/models/purchasing.model';
import { ZpIconComponent } from '../../shared/ui/zp-icon.component';

/** A backorder / discrepancy claim slip, ready to print and send to the supplier. Printing is the browser's print dialog. */
@Component({
    selector: 'zp-claim-slip',
    imports: [DatePipe, DecimalPipe, ZpIconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    @if (slip(); as c) {
      <div class="space-y-3 text-sm" data-testid="claim-slip">
        <header class="flex flex-wrap items-start justify-between gap-2 border-b border-ink/15 pb-2">
          <div><h3 class="font-syne text-xl font-bold">Claim {{ c.claimNumber }}</h3><p class="font-data text-xs text-ink/70">{{ c.documentNumber }} &bull; invoice {{ c.invoiceRef ?? 'not recorded' }}</p></div>
          <div class="text-right text-xs text-ink/70"><p class="font-semibold text-ink">{{ c.supplierName }}</p><p>{{ c.branchName }}</p><p>Issued {{ c.issuedAtUtc | date: 'medium' }} by {{ c.issuedByName }}</p></div>
        </header>
        @if (c.lines.length > 0) {
          <table class="app-table"><thead><tr><th>Item</th><th class="text-right">Ordered</th><th class="text-right">Received</th><th class="text-right">Short</th>@if (c.claimValue != null) { <th class="text-right">Value</th> }</tr></thead>
            <tbody>@for (l of c.lines; track l.itemName) { <tr><td>{{ l.itemName }} <span class="font-data text-[11px] text-ink/60">{{ l.sku }}</span></td><td class="text-right font-data">{{ l.ordered | number: '1.0-4' }}</td><td class="text-right font-data">{{ l.received | number: '1.0-4' }}</td><td class="text-right font-data font-bold text-danger">{{ l.short | number: '1.0-4' }}</td>@if (c.claimValue != null) { <td class="text-right font-data">{{ l.value | number: '1.2-2' }}</td> }</tr> }</tbody></table>
        }
        @if (c.claimValue != null) { <p class="text-right font-data font-bold" data-testid="claim-value">Claim value: {{ c.claimValue | number: '1.2-2' }}</p> }
        @if (c.discrepancies.length > 0) { <ul class="list-disc pl-5">@for (d of c.discrepancies; track d.id) { <li>{{ d.description }}@if (d.photoMediaIds.length > 0) { <span class="text-ink/60"> ({{ d.photoMediaIds.length }} photo{{ d.photoMediaIds.length === 1 ? '' : 's' }} on file)</span> }</li> }</ul> }
        <div class="no-print flex justify-end"><button type="button" class="btn-primary" data-testid="claim-print" (click)="print()"><zp-icon name="printer" [size]="16" /> Print claim slip</button></div>
      </div>
    }
  `
})
export class ClaimSlipComponent {
  readonly slip = input.required<ClaimSlipDto | null>();
  protected print(): void { window.print(); }
}
