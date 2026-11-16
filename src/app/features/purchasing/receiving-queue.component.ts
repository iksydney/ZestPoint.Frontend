import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { DOCUMENT_TYPES, ReceivingQueueDto } from '../../core/models/purchasing.model';
import { toApiError } from '../../core/services/api.util';
import { BranchContextService } from '../../core/services/branch-context.service';
import { ReceivingApi } from '../../core/services/purchasing.services';
import { BranchPickerComponent } from '../../shared/ui/ops-chrome.components';
import { ZpIconComponent } from '../../shared/ui/zp-icon.component';

/** Goods receiving: what is expected at the dock, and receipts waiting for a second person. */
@Component({
    selector: 'zp-receiving-queue',
    imports: [DatePipe, DecimalPipe, RouterLink, BranchPickerComponent, ZpIconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="flex flex-col gap-4 font-jakarta" data-testid="receiving-queue">
      <div class="flex flex-wrap items-center justify-between gap-3"><div><h1 class="font-syne text-2xl font-bold">Goods receiving</h1><p class="text-sm text-ink/70">Check deliveries against their orders, put them in bins, and give the second key to receipts held for a high-security bin.</p></div><zp-branch-picker /></div>
      @if (error()) { <p class="sys-alert sys-alert-danger" role="alert">{{ error() }}</p> }

      @if ((queue()?.awaitingSecondKey?.length ?? 0) > 0) {
        <section class="app-card border-primary/50 bg-primary/5" aria-label="Waiting for a second key" data-testid="queue-second-key">
          <h2 class="flex items-center gap-2 font-syne text-lg font-semibold"><zp-icon name="lock" [size]="20" class="text-primary" /> Waiting for a second person ({{ queue()!.awaitingSecondKey.length }})</h2>
          <ul class="mt-2 divide-y divide-ink/10">@for (r of queue()!.awaitingSecondKey; track r.id) {
            <li class="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span>GRN-{{ r.number }} &bull; {{ r.lineCount }} held line(s) &bull; received by {{ r.receivedByName }} on {{ r.receivedAtUtc | date: 'medium' }}</span>
              <a class="btn-outline" [routerLink]="['/app/purchasing/receipts', r.id]" [attr.data-testid]="'second-key-' + r.number">Open</a></li> }</ul>
        </section>
      }

      <section class="app-card overflow-hidden p-0" aria-label="Expected deliveries">
        <div class="overflow-x-auto"><table class="app-table min-w-[44rem]" data-testid="queue-orders"><thead><tr><th>Document</th><th>From</th><th>Branch</th><th class="text-right">Expected</th><th class="text-right">Received</th><th>Due</th><th></th></tr></thead>
          <tbody>@for (o of queue()?.orders ?? []; track o.orderId) {
            <tr [attr.data-testid]="'queue-' + o.documentNumber"><td><span class="font-data font-semibold">{{ o.documentNumber }}</span><span class="block text-xs text-ink/60">{{ typeLabel(o.documentType) }}</span></td><td>{{ o.supplierName ?? 'Another branch' }}</td><td>{{ o.branchName }}</td>
              <td class="text-right font-data">{{ o.expectedUnits | number: '1.0-4' }}</td><td class="text-right font-data">{{ o.receivedUnits | number: '1.0-4' }}</td><td class="whitespace-nowrap">{{ o.expectedDeliveryDate ? (o.expectedDeliveryDate | date: 'mediumDate') : '' }}</td>
              <td class="text-right"><a class="btn-primary" [routerLink]="['/app/purchasing/orders', o.orderId, 'receive']" [attr.data-testid]="'receive-' + o.documentNumber"><zp-icon name="inbox" [size]="16" /> Receive</a></td></tr> }
            @empty { <tr><td colspan="7" class="py-10 text-center text-ink/70">{{ loading() ? 'Loading...' : 'Nothing is waiting to be received. Approved orders appear here.' }}</td></tr> }</tbody></table></div>
      </section>
    </div>
  `
})
export class ReceivingQueueComponent implements OnInit {
  private readonly api = inject(ReceivingApi);
  private readonly branches = inject(BranchContextService);
  protected readonly queue = signal<ReceivingQueueDto | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => { this.branches.activeId(); untracked(() => void this.load()); }, { allowSignalWrites: true });
  }

  async ngOnInit(): Promise<void> { await this.branches.load(); }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try { this.queue.set(await firstValueFrom(this.api.queue(this.branches.activeId() ?? undefined))); } catch (err) { this.error.set(toApiError(err).message); } finally { this.loading.set(false); }
  }

  protected typeLabel(t: string): string { return DOCUMENT_TYPES.find((d) => d.value === t)?.short ?? t; }
}
