import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { StockUnit } from '../../core/models/ops.model';
import { ClaimSlipDto, DiscrepancyKind, GoodsReceiptDto } from '../../core/models/purchasing.model';
import { toApiError } from '../../core/services/api.util';
import { ReceivingApi } from '../../core/services/purchasing.services';
import { ConfirmService, DialogComponent, ToastService } from '../../shared/ui/feedback';
import { ZpIconComponent } from '../../shared/ui/zp-icon.component';
import { ClaimSlipComponent } from './claim-slip.component';
import { PhotoThumbComponent } from './photo-thumb.component';

const UNIT: Record<StockUnit, string> = { Milliliter: 'ml', Gram: 'g', Each: 'each' };

/**
 * One goods receipt: what was counted, where it went, what was wrong. A receipt that holds lines for a high-security bin shows the second
 * person their decision here (they must not be the one who received it). The note can be printed as a goods received note.
 */
@Component({
  selector: 'zp-goods-receipt-view',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, RouterLink, DialogComponent, ZpIconComponent, ClaimSlipComponent, PhotoThumbComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (error()) { <p class="sys-alert sys-alert-danger mb-3" role="alert" data-testid="grn-error">{{ error() }}</p> }
    @if (receipt(); as g) {
      <div class="no-print flex flex-col gap-4 font-jakarta" data-testid="grn">
        <div class="flex flex-wrap items-center gap-2 text-xs"><a routerLink="/app/purchasing/receiving" class="underline">Goods receiving</a><span class="text-ink/50">/</span><span class="po-cap text-primary">Goods received note</span></div>

        <section class="app-card flex flex-wrap items-start justify-between gap-4">
          <div>
            <div class="flex flex-wrap items-center gap-3"><h1 class="font-syne text-2xl font-bold">GRN-{{ g.number }}</h1>
              <span class="rounded-full px-3 py-0.5 font-data text-[11px] font-semibold" [class]="statusClass(g)" data-testid="grn-status">{{ statusText(g) }}</span></div>
            <p class="mt-1 text-sm text-ink/70">@if (g.purchaseOrderId) { <a class="font-data underline" [routerLink]="['/app/purchasing/orders', g.purchaseOrderId]">{{ g.documentNumber }}</a> &bull; } {{ g.supplierName ?? 'Branch transfer' }} &bull; {{ g.branchName }}</p>
            <p class="mt-1 text-xs text-ink/70">Received {{ g.receivedAtUtc | date: 'medium' }} by {{ g.receivedByName }}@if (g.invoiceRef) { &bull; delivery note {{ g.invoiceRef }} }@if (g.courier) { &bull; {{ g.courier }} {{ g.waybill }} }</p>
            <p class="mt-1 flex flex-wrap gap-3 text-xs text-ink/70">@if (g.dockBay) { <span>Bay {{ g.dockBay }}</span> }@if (g.temperatureC != null) { <span>{{ g.temperatureC | number: '1.0-1' }} C on arrival</span> }@if (g.sealNumber) { <span>Seal {{ g.sealNumber }}: {{ g.sealIntact === false ? 'BROKEN' : g.sealIntact ? 'intact' : 'not checked' }}</span> }</p>
          </div>
          @if (g.totalValue != null) { <div class="rounded-xl bg-ink/10 px-4 py-2 text-right"><span class="po-cap">Value received</span><p class="font-syne text-2xl font-bold text-success" data-testid="grn-value">{{ g.totalValue | number: '1.2-2' }}</p></div> }
        </section>

        @if (g.status === 'AwaitingSecondKey') {
          <section class="app-card border-primary/50 bg-primary/5" aria-label="Second key" data-testid="grn-second-key">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex items-center gap-3"><zp-icon name="lock" [size]="28" class="text-primary" /><div><h2 class="font-syne text-lg font-semibold">Waiting for a second person</h2><p class="text-sm text-ink/80">Lines going into a high-security bin are not stock yet. Another person must count them and confirm.</p></div></div>
              @if (g.canSecondKey) {
                <div class="flex flex-wrap items-center gap-2"><button type="button" class="btn-primary" data-testid="grn-confirm" (click)="decisionOpen.set('confirm')"><zp-icon name="check" [size]="16" /> Confirm the held lines</button>
                  <button type="button" class="btn-outline" data-testid="grn-refuse" (click)="decisionOpen.set('refuse')">Refuse</button></div>
              } @else { <p class="text-sm text-ink/70" data-testid="grn-cannot-second">{{ g.cannotSecondKeyReason }}</p> }
            </div>
          </section>
        }
        @if (g.secondVerifierName) { <p class="text-sm text-ink/80" data-testid="grn-verifier"><zp-icon name="shield" [size]="16" class="text-success" /> Second key by <strong>{{ g.secondVerifierName }}</strong> on {{ g.secondVerifiedAtUtc | date: 'medium' }}@if (g.secondKeyNote) { : {{ g.secondKeyNote }} }</p> }

        <section class="app-card overflow-hidden p-0" aria-label="Lines">
          <div class="overflow-x-auto"><table class="w-full min-w-[48rem] text-left" data-testid="grn-lines"><thead class="bg-ink/10"><tr class="po-cap"><th class="px-3 py-2">Item</th><th class="px-3 py-2">Bin</th><th class="px-2 py-2 text-right">Ordered</th><th class="px-2 py-2 text-right">Accepted</th><th class="px-2 py-2 text-right">Turned away</th><th class="px-3 py-2">Lot / expiry</th><th class="px-3 py-2">Checks</th>@if (g.totalValue != null) { <th class="px-2 py-2 text-right">Value</th> }</tr></thead>
            <tbody class="divide-y divide-ink/10 text-sm">@for (l of g.lines; track l.id) {
              <tr><td class="px-3 py-2"><span class="font-semibold">{{ l.itemName }}</span> <span class="font-data text-[11px] text-ink/60">{{ l.sku }}</span></td>
                <td class="px-3 py-2 font-data text-xs" [class]="l.binIsHighSecurity ? 'text-primary font-semibold' : ''">{{ l.binCode ?? 'Unassigned' }}@if (l.isPendingSecondKey) { <span class="ml-1 rounded bg-primary/20 px-1 text-[10px]">HELD</span> }</td>
                <td class="px-2 py-2 text-right font-data">{{ l.ordered | number: '1.0-4' }}</td><td class="px-2 py-2 text-right font-data font-bold text-success">{{ l.accepted | number: '1.0-4' }} {{ unit(l.unit) }}</td>
                <td class="px-2 py-2 text-right font-data" [class]="l.rejected > 0 ? 'text-danger font-bold' : 'text-ink/60'">{{ l.rejected | number: '1.0-4' }}</td>
                <td class="px-3 py-2 font-data text-xs">{{ l.lotCode }} {{ l.expiryDate ? (l.expiryDate | date: 'MMM y') : '' }}</td>
                <td class="px-3 py-2 text-xs">@if (l.sealsIntact != null) { <span>Seals {{ l.sealsIntact }}</span> } @if (l.tareGramsPerUnit != null) { <span class="ml-2" [class]="l.tareWithinTolerance ? 'text-success' : 'text-danger'">Tare {{ l.tareGramsPerUnit | number: '1.0-0' }} g{{ l.tareWithinTolerance === false ? ' (outside tolerance)' : '' }}</span> } @if (l.note) { <span class="block text-ink/70">{{ l.note }}</span> }</td>
                @if (g.totalValue != null) { <td class="px-2 py-2 text-right font-data">{{ l.lineValue | number: '1.2-2' }}</td> }</tr> }</tbody></table></div>
        </section>

        @if (g.discrepancyNote) { <p class="rounded-lg bg-ink/5 p-3 text-sm"><span class="po-cap">Variance memo</span><br />{{ g.discrepancyNote }}</p> }
        <section class="app-card flex flex-col gap-2" aria-label="Discrepancies" data-testid="grn-discrepancies">
          <div class="flex items-center justify-between"><h2 class="font-syne text-lg font-semibold">Discrepancies ({{ g.discrepancies.length }})</h2><button type="button" class="btn-outline" data-testid="grn-add-discrepancy" (click)="discOpen.set(true)"><zp-icon name="camera" [size]="16" /> Record a problem</button></div>
          <ul class="space-y-2">@for (d of g.discrepancies; track d.id) {
            <li class="rounded-lg border border-ink/10 bg-ink/5 p-3 text-sm"><p><strong>{{ kindLabel(d.kind) }}</strong>@if (d.itemName) { : {{ d.itemName }} } @if (d.quantity != null) { ({{ d.quantity | number: '1.0-4' }}) } <span class="po-cap">{{ d.recordedByName }} &bull; {{ d.recordedAtUtc | date: 'medium' }}@if (d.claimNumber) { &bull; claim {{ d.claimNumber }} }</span></p><p class="mt-1 text-ink/80">{{ d.description }}</p>
              <div class="mt-2 flex flex-wrap gap-2">@for (p of d.photoMediaIds; track p) { <zp-photo-thumb [id]="p" /> }</div></li>
          } @empty { <li class="text-sm text-ink/70">Nothing wrong was recorded.</li> }</ul>
        </section>

        <section class="app-card sticky bottom-2 z-30 flex flex-wrap items-center justify-between gap-3 p-3 shadow-2xl">
          <div class="flex flex-wrap gap-2"><button type="button" class="btn-outline h-11" data-testid="grn-print" (click)="print()"><zp-icon name="printer" [size]="18" /> Print goods received note <span class="po-kbd">F3</span></button>
            @if (g.documentType !== 'StockTransfer' && g.purchaseOrderId) { <button type="button" class="btn-outline h-11" data-testid="grn-claim" (click)="claim()"><zp-icon name="note" [size]="18" /> Issue claim slip</button> }</div>
          <div class="flex gap-2">@if (g.purchaseOrderId) { <a class="btn-ghost h-11" [routerLink]="['/app/purchasing/orders', g.purchaseOrderId]">Open the document</a> }<a class="btn-primary h-11" routerLink="/app/purchasing/receiving">Back to receiving</a></div>
        </section>
      </div>

      <section class="hidden bg-white p-6 font-jakarta text-sm text-black print:block" data-testid="grn-print-sheet">
        <header class="flex items-start justify-between border-b border-black pb-3"><div><h1 class="font-syne text-2xl font-bold">Goods received note</h1><p class="font-data text-lg">GRN-{{ g.number }}</p><p class="font-data">{{ g.documentNumber }}</p></div>
          <div class="text-right"><p class="font-semibold">{{ g.supplierName ?? 'Branch transfer' }}</p><p>{{ g.branchName }}</p><p>{{ g.receivedAtUtc | date: 'd MMM yyyy HH:mm' }}</p><p>Received by {{ g.receivedByName }}</p>@if (g.secondVerifierName) { <p>Second key: {{ g.secondVerifierName }}</p> }</div></header>
        <table class="my-3 w-full border-collapse text-left"><thead><tr class="border-y border-black"><th class="py-1">SKU</th><th>Item</th><th>Bin</th><th class="text-right">Ordered</th><th class="text-right">Accepted</th><th class="text-right">Turned away</th><th>Lot</th></tr></thead>
          <tbody>@for (l of g.lines; track l.id) { <tr class="border-b border-gray-300"><td class="py-1 font-data">{{ l.sku }}</td><td>{{ l.itemName }}</td><td class="font-data">{{ l.binCode }}{{ l.isPendingSecondKey ? ' (held)' : '' }}</td><td class="text-right font-data">{{ l.ordered | number: '1.0-4' }}</td><td class="text-right font-data">{{ l.accepted | number: '1.0-4' }}</td><td class="text-right font-data">{{ l.rejected | number: '1.0-4' }}</td><td class="font-data">{{ l.lotCode }}</td></tr> }</tbody></table>
        @if (g.discrepancyNote) { <p class="whitespace-pre-wrap">{{ g.discrepancyNote }}</p> }
        @for (d of g.discrepancies; track d.id) { <p>- {{ kindLabel(d.kind) }}: {{ d.description }}</p> }
        <footer class="mt-10 grid grid-cols-2 gap-6 text-xs"><div class="border-t border-black pt-1">Received by {{ g.receivedByName }}</div><div class="border-t border-black pt-1">Driver / supplier signature</div></footer>
      </section>
    }

    <zp-dialog [open]="decisionOpen() !== null" [title]="decisionOpen() === 'confirm' ? 'Confirm the held lines' : 'Refuse the held lines'" (closed)="decisionOpen.set(null)">
      <form class="space-y-3" (submit)="$event.preventDefault(); decide()">
        <p class="text-sm">{{ decisionOpen() === 'confirm' ? 'You are saying you counted the held lines and they match. They enter stock now, and your name is recorded as the second key.' : 'The held lines will never enter stock. Say what you found.' }}</p>
        <div><label class="app-label" for="sk-note">{{ decisionOpen() === 'confirm' ? 'Note (optional)' : 'What did you find?' }}</label><input id="sk-note" class="app-input" maxlength="400" data-testid="grn-note" [ngModel]="note()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="note.set($event)" /></div>
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="decisionOpen.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="grn-decide" [disabled]="busy() || (decisionOpen() === 'refuse' && note().trim().length < 3)">{{ decisionOpen() === 'confirm' ? 'Confirm' : 'Refuse' }}</button></div>
      </form>
    </zp-dialog>

    <zp-dialog [open]="discOpen()" title="Record a problem" [wide]="true" (closed)="discOpen.set(false)">
      <form class="grid gap-3 sm:grid-cols-2" (submit)="$event.preventDefault(); addDiscrepancy()">
        <div><label class="app-label" for="gd-kind">What happened</label><select id="gd-kind" class="app-input" data-testid="grn-disc-kind" [ngModel]="discKind()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="discKind.set($event)"><option value="Shortage">Short delivery</option><option value="Damage">Damaged goods</option><option value="WrongItem">Wrong item</option><option value="Other">Something else</option></select></div>
        <div><label class="app-label" for="gd-qty">Quantity (optional)</label><input id="gd-qty" type="number" min="0" step="any" class="app-input font-data" [ngModel]="discQty()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="discQty.set($event === '' || $event === null ? null : +$event)" /></div>
        <div class="sm:col-span-2"><label class="app-label" for="gd-text">Describe it</label><textarea id="gd-text" rows="3" maxlength="1000" class="app-input" data-testid="grn-disc-text" [ngModel]="discText()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="discText.set($event)"></textarea></div>
        <div class="sm:col-span-2"><label class="app-label" for="gd-photo">Photos</label><input id="gd-photo" type="file" accept="image/png,image/jpeg,image/webp" capture="environment" multiple class="app-input" data-testid="grn-disc-photo" (change)="upload($any($event.target).files)" />
          <div class="mt-2 flex flex-wrap gap-2">@for (p of photos(); track p) { <zp-photo-thumb [id]="p" /> }</div>@if (photoError()) { <p class="mt-1 text-xs text-danger" role="alert">{{ photoError() }}</p> }</div>
        <div class="flex justify-end gap-2 sm:col-span-2"><button type="button" class="btn-ghost" (click)="discOpen.set(false)">Cancel</button><button type="submit" class="btn-primary" data-testid="grn-disc-save" [disabled]="busy() || uploading() || discText().trim().length < 3">Add</button></div>
      </form>
    </zp-dialog>

    <zp-dialog [open]="claimSlip() !== null" title="Claim slip" [wide]="true" (closed)="claimSlip.set(null)">
      @if (claimSlip(); as c) { <zp-claim-slip [slip]="c" /> }
    </zp-dialog>
  `
})
export class GoodsReceiptViewComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ReceivingApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly receipt = signal<GoodsReceiptDto | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly decisionOpen = signal<'confirm' | 'refuse' | null>(null);
  protected readonly note = signal('');
  protected readonly discOpen = signal(false);
  protected readonly discKind = signal<DiscrepancyKind>('Shortage');
  protected readonly discQty = signal<number | null>(null);
  protected readonly discText = signal('');
  protected readonly photos = signal<readonly string[]>([]);
  protected readonly photoError = signal<string | null>(null);
  protected readonly uploading = signal(false);
  protected readonly claimSlip = signal<ClaimSlipDto | null>(null);
  protected readonly anyDialog = computed(() => this.decisionOpen() !== null || this.discOpen() || this.claimSlip() !== null || !!this.confirm.request());

  private id = '';

  async ngOnInit(): Promise<void> {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    await this.load();
  }

  private async load(): Promise<void> {
    this.error.set(null);
    try { this.receipt.set(await firstValueFrom(this.api.receipt(this.id))); } catch (err) { this.error.set(toApiError(err).message); }
  }

  protected unit = (u: StockUnit): string => UNIT[u];
  protected kindLabel(k: DiscrepancyKind): string { return k === 'Shortage' ? 'Short delivery' : k === 'Damage' ? 'Damaged goods' : k === 'WrongItem' ? 'Wrong item' : 'Other problem'; }
  protected statusText(g: GoodsReceiptDto): string { return g.status === 'Posted' ? 'Posted to stock' : g.status === 'AwaitingSecondKey' ? 'Awaiting the second key' : 'Second key refused'; }
  protected statusClass(g: GoodsReceiptDto): string { return g.status === 'Posted' ? 'bg-success/15 text-success' : g.status === 'AwaitingSecondKey' ? 'bg-primary/20 text-primary' : 'bg-danger/15 text-danger'; }

  protected async decide(): Promise<void> {
    const confirmIt = this.decisionOpen() === 'confirm';
    this.busy.set(true);
    this.error.set(null);
    try {
      this.receipt.set(await firstValueFrom(this.api.secondKey(this.id, confirmIt, this.note().trim() || null)));
      this.decisionOpen.set(null);
      this.note.set('');
      this.toast.success(confirmIt ? 'Confirmed. The held lines are now in stock.' : 'Refused. The held lines never entered stock.');
    } catch (err) { this.error.set(toApiError(err).message); } finally { this.busy.set(false); }
  }

  protected async upload(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    this.uploading.set(true);
    this.photoError.set(null);
    try {
      for (const f of Array.from(files)) {
        if (f.size > 5 * 1024 * 1024) { this.photoError.set(`${f.name} is larger than 5 MB.`); continue; }
        this.photos.update((p) => [...p, ...[]]);
        const { id } = await firstValueFrom(this.api.uploadPhoto(f));
        this.photos.update((p) => [...p, id]);
      }
    } catch (err) { this.photoError.set(toApiError(err).message); } finally { this.uploading.set(false); }
  }

  protected async addDiscrepancy(): Promise<void> {
    this.busy.set(true);
    try {
      this.receipt.set(await firstValueFrom(this.api.discrepancy(this.id, { kind: this.discKind(), quantity: this.discQty(), description: this.discText().trim(), photoMediaIds: [...this.photos()] })));
      this.discOpen.set(false);
      this.discText.set('');
      this.discQty.set(null);
      this.photos.set([]);
      this.toast.success('Recorded.');
    } catch (err) { this.error.set(toApiError(err).message); } finally { this.busy.set(false); }
  }

  protected async claim(): Promise<void> {
    try { this.claimSlip.set(await firstValueFrom(this.api.claim(this.id))); await this.load(); } catch (err) { this.error.set(toApiError(err).message); }
  }

  protected print(): void { window.print(); }

  @HostListener('document:keydown.f3', ['$event'])
  protected onF3(e: Event): void {
    if (this.anyDialog()) return;
    e.preventDefault();
    this.print();
  }
}
