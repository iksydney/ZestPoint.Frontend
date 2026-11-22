import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { StockUnit } from '../../core/models/ops.model';
import { ClaimSlipDto, DiscrepancyDto, DiscrepancyKind, DiscrepancyRequest, ReceiveWorkstationLine, ReceivingLineDto, ReceivingManifestDto, STATUS_TEXT } from '../../core/models/purchasing.model';
import { netUnitCost, round2, tareWithinTolerance } from '../../core/purchase-math';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { ReceivingApi } from '../../core/services/purchasing.services';
import { CameraScannerComponent, type ScanFeedback } from '../../shared/ui/camera-scanner.component';
import { ConfirmService, DialogComponent, ToastService } from '../../shared/ui/feedback';
import { SearchSelectComponent, SelectOption } from '../../shared/ui/search-select.component';
import { ZpIconComponent } from '../../shared/ui/zp-icon.component';
import { ClaimSlipComponent } from './claim-slip.component';
import { PhotoThumbComponent } from './photo-thumb.component';

const UNIT: Record<StockUnit, string> = { Milliliter: 'ml', Gram: 'g', Each: 'each' };

interface Entry {
  accepted: number;
  rejected: number;
  binId: string | null;
  lot: string;
  expiry: string;
  serials: string;
  tare: number | null;
  seals: number | null;
  note: string;
  checked: boolean;
}

interface DraftDiscrepancy { id: string; kind: DiscrepancyKind; itemId: string | null; itemName: string | null; quantity: number | null; description: string; photoIds: string[] }

type Filter = 'all' | 'pending' | 'shortage';

/**
 * Receiving: the receiver checks the delivery against the order line by line, chooses the bin, records weights, seals, lots and serials, notes
 * what is wrong (with photos) and commits. Costs only appear for people who may see them. Lines for a high-security bin are held until a second
 * person, signed in on their own device, confirms them. The same screen releases goods to a supplier on a return and receives a branch transfer.
 */
@Component({
    selector: 'zp-goods-receiving',
    imports: [DatePipe, DecimalPipe, FormsModule, RouterLink, DialogComponent, ZpIconComponent, ClaimSlipComponent, PhotoThumbComponent, CameraScannerComponent, SearchSelectComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="no-print flex flex-col gap-4 font-jakarta" data-testid="receiving">
      @if (error()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="rcv-error">{{ error() }}</p> }
      @if (loading()) { <p class="py-8 text-center text-ink/70">Loading...</p> }
      @if (manifest(); as m) {
        <!-- Context strip -->
        <section class="app-card flex flex-wrap items-center justify-between gap-3 px-4 py-2" aria-label="Context">
          <div class="flex flex-wrap items-center gap-2 text-xs">
            <span class="po-cap">Purchasing</span><span class="text-ink/50">/</span><span class="po-cap text-primary">{{ verb() }}</span><span class="text-ink/50">/</span>
            <a class="rounded bg-ink/10 px-2 py-0.5 font-data text-[11px] text-success underline" [routerLink]="['/app/purchasing/orders', m.orderId]" data-testid="rcv-doc">{{ m.documentNumber }}</a>
          </div>
          <div class="flex flex-wrap items-center gap-5 text-xs">
            <span class="flex items-center gap-1"><zp-icon name="person" [size]="16" class="text-ink/60" /><span class="text-ink/70">Receiver:</span><strong class="font-data">{{ receiver() }}</strong></span>
            <span class="flex items-center gap-1"><zp-icon name="branch" [size]="16" class="text-success" /><span class="po-cap">Receiving at:</span><strong class="font-data text-success">{{ m.branchName }}</strong></span>
            @if (m.sourceBranchName) { <span class="flex items-center gap-1"><zp-icon name="dispatch" [size]="16" class="text-primary" /><span class="po-cap">From:</span><strong class="font-data">{{ m.sourceBranchName }}</strong></span> }
            <span class="flex items-center gap-1 text-ink/70"><zp-icon name="clock" [size]="16" /><span class="font-data">{{ now() | date: 'HH:mm:ss' }}</span></span>
          </div>
        </section>

        <!-- Manifest card -->
        <section class="app-card relative overflow-hidden" aria-label="Manifest">
          <div class="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl"></div>
          <div class="relative flex flex-col items-stretch justify-between gap-4 xl:flex-row xl:items-center">
            <div class="flex items-center gap-4">
              <div class="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-primary/20 text-primary"><zp-icon name="pallet" [size]="32" /></div>
              <div>
                <div class="flex flex-wrap items-center gap-3"><h1 class="font-syne text-2xl font-bold leading-tight">{{ m.documentNumber }}</h1>
                  <span class="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-0.5 font-data text-[11px] font-semibold text-primary"><span class="h-2 w-2 animate-pulse rounded-full bg-primary"></span>{{ statusText(m) }}</span></div>
                <p class="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink/70">
                  <span class="font-semibold text-ink">{{ m.supplierName ?? 'Branch transfer' }}</span><span>&bull;</span><span>{{ m.lines.length }} consignment lines</span><span>&bull;</span>
                  <span class="font-data text-xs text-ink">Expected: {{ m.expectedUnits | number: '1.0-4' }} units</span>@if (m.createdByName) { <span>&bull;</span><span class="text-xs">Raised by {{ m.createdByName }}@if (m.postedAtUtc) { ({{ m.postedAtUtc | date: 'MMM d, y' }}) }</span> }</p>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-4">
              <div class="flex items-center gap-4 rounded-xl bg-ink/10 px-4 py-2" data-testid="rcv-progress">
                <div class="relative grid h-12 w-12 shrink-0 place-items-center">
                  <svg class="h-12 w-12 -rotate-90" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.9155" fill="none" stroke="currentColor" class="text-ink/15" stroke-width="3.5" /><circle cx="18" cy="18" r="15.9155" fill="none" stroke="currentColor" class="text-success" stroke-width="3.5" stroke-linecap="round" [attr.stroke-dasharray]="percent() + ', 100'" /></svg>
                  <span class="absolute font-data text-[10px] font-bold">{{ percent() | number: '1.0-1' }}%</span></div>
                <div class="flex flex-col"><span class="po-cap">Consignment progress</span><span class="mt-0.5 flex items-baseline gap-1"><span class="font-syne text-xl font-bold text-success" data-testid="rcv-verified">{{ verified() | number: '1.0-4' }}</span><span class="text-xs text-ink/70">/ {{ m.expectedUnits | number: '1.0-4' }} verified</span></span></div>
              </div>
            </div>
          </div>
        </section>

        @if (!m.canReceive) { <p class="sys-alert sys-alert-warning" role="status" data-testid="rcv-blocked">{{ m.cannotReceiveReason }}</p> }

        <!-- Delivery details recorded at the dock -->
        <section class="app-card grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6" aria-label="Delivery details">
          <label class="flex flex-col gap-1 rounded-lg bg-ink/5 p-2"><span class="po-cap">Supplier invoice / delivery note</span><input class="bg-transparent font-data text-xs font-semibold focus:outline-none" maxlength="100" data-testid="rcv-invoice" [disabled]="!m.canReceive" [ngModel]="invoiceRef()" (ngModelChange)="invoiceRef.set($event)" /></label>
          <label class="flex flex-col gap-1 rounded-lg bg-ink/5 p-2"><span class="po-cap">Courier</span><input class="bg-transparent font-data text-xs font-semibold focus:outline-none" maxlength="120" [disabled]="!m.canReceive" [ngModel]="courier()" (ngModelChange)="courier.set($event)" /></label>
          <label class="flex flex-col gap-1 rounded-lg bg-ink/5 p-2"><span class="po-cap">Waybill</span><input class="bg-transparent font-data text-xs font-semibold focus:outline-none" maxlength="80" [disabled]="!m.canReceive" [ngModel]="waybill()" (ngModelChange)="waybill.set($event)" /></label>
          <label class="flex flex-col gap-1 rounded-lg bg-ink/5 p-2"><span class="po-cap">Receiving bay</span><input class="bg-transparent font-data text-xs font-semibold focus:outline-none" maxlength="60" placeholder="e.g. Bay 03" data-testid="rcv-bay" [disabled]="!m.canReceive" [ngModel]="bay()" (ngModelChange)="bay.set($event)" /></label>
          <label class="flex flex-col gap-1 rounded-lg bg-ink/5 p-2"><span class="po-cap">Temperature on arrival (C)</span><input type="number" step="0.1" class="bg-transparent font-data text-xs font-semibold focus:outline-none" data-testid="rcv-temp" [disabled]="!m.canReceive" [ngModel]="temperature()" (ngModelChange)="temperature.set($event === '' || $event === null ? null : +$event)" /></label>
          <div class="flex flex-col gap-1 rounded-lg bg-ink/5 p-2"><span class="po-cap">Security seal</span><span class="flex items-center gap-2"><input class="w-full min-w-0 bg-transparent font-data text-xs font-semibold focus:outline-none" maxlength="60" placeholder="Seal number" data-testid="rcv-seal" [disabled]="!m.canReceive" [ngModel]="sealNumber()" (ngModelChange)="sealNumber.set($event)" />
            <select class="rounded bg-canvas px-1 py-0.5 font-data text-[11px] focus:outline-none" aria-label="Seal state" data-testid="rcv-seal-state" [disabled]="!m.canReceive" [ngModel]="sealIntact()" (ngModelChange)="sealIntact.set($event)"><option [ngValue]="null">Not checked</option><option [ngValue]="true">Intact</option><option [ngValue]="false">Broken</option></select></span></div>
        </section>

        <!-- Control bar -->
        <section class="app-card flex flex-wrap items-center justify-between gap-3 p-3" aria-label="Controls">
          <div class="flex min-w-[20rem] flex-1 items-center gap-2">
            <div class="relative flex-1">
              <zp-icon name="scan" [size]="20" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-success" />
              <input class="w-full rounded-lg bg-canvas py-2.5 pl-10 pr-20 font-data text-sm text-success placeholder:text-ink/50 focus:outline-none focus:ring-1 focus:ring-success" placeholder="Scan a barcode or SKU, or type 12*SKU for a quantity [F4]" data-testid="rcv-scan" autocomplete="off"
                [disabled]="!m.canReceive" [ngModel]="scanText()" (ngModelChange)="scanText.set($event)" (keydown.enter)="scan(); $event.preventDefault()" />
              <span class="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1"><span class="po-kbd">F4</span><span class="h-2 w-2 rounded-full bg-success"></span></span>
            </div>
            <button type="button" class="btn-outline px-3 max-lg:min-h-11" aria-label="Scan with the camera" data-testid="rcv-scan-camera" [disabled]="!m.canReceive" (click)="openCamera()">Camera</button>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <div class="flex items-center rounded-lg bg-ink/10 p-1" role="tablist" aria-label="Show lines">
              <button type="button" role="tab" class="rounded px-3 py-1 text-sm" [class]="filter() === 'all' ? 'bg-panel font-semibold text-ink' : 'text-ink/70'" [attr.aria-selected]="filter() === 'all'" data-testid="rcv-tab-all" (click)="filter.set('all')">All lines ({{ rows().length }})</button>
              <button type="button" role="tab" class="rounded px-3 py-1 text-sm" [class]="filter() === 'pending' ? 'bg-panel font-semibold text-ink' : 'text-ink/70'" [attr.aria-selected]="filter() === 'pending'" data-testid="rcv-tab-pending" (click)="filter.set('pending')">Pending ({{ pendingCount() }})</button>
              <button type="button" role="tab" class="flex items-center gap-1 rounded px-3 py-1 text-sm" [class]="filter() === 'shortage' ? 'bg-panel font-semibold text-danger' : 'text-danger/80'" [attr.aria-selected]="filter() === 'shortage'" data-testid="rcv-tab-shortage" (click)="filter.set('shortage')">Shortage ({{ shortageCount() }}) @if (shortageCount() > 0) { <span class="h-1.5 w-1.5 rounded-full bg-danger"></span> }</button>
            </div>
            <button type="button" class="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 font-syne text-lg font-semibold text-on-primary shadow-md transition active:scale-[0.98] disabled:opacity-40" data-testid="rcv-all" [disabled]="!m.canReceive" (click)="receiveAll()"><zp-icon name="doneall" [size]="20" /> Receive all lines (100%)</button>
          </div>
        </section>
        <zp-camera-scanner [open]="cameraOpen()" title="Scan what arrived" [continuous]="true" [feedback]="cameraFeedback()" (scanned)="cameraScanned($event)" (closed)="closeCamera()" />
        @if (scanNote()) { <p class="text-xs" [class]="scanOk() ? 'text-success' : 'text-warning'" role="status" data-testid="rcv-scan-note">{{ scanNote() }}@if (!scanOk() && lastUnknown()) { <button type="button" class="ml-2 underline" (click)="discrepancyFromScan()">Record it as a wrong item</button> }</p> }

        <!-- Verification table -->
        <section class="app-card overflow-hidden p-0" aria-label="Physical verification">
          <div class="flex flex-wrap items-center justify-between gap-2 bg-ink/5 px-4 py-2">
            <div class="flex flex-wrap items-center gap-2"><zp-icon name="check" [size]="20" class="text-primary" /><h2 class="font-syne text-lg font-semibold">Physical verification manifest</h2>
              <span class="rounded bg-ink/10 px-2 py-0.5 font-data text-[11px] text-ink/70">Segregation rule: the receiver is not the buyer</span></div>
            <span class="po-cap hidden md:inline">Keyboard: Tab between lines &bull; Enter in the scan box adds one unit</span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full min-w-[64rem] text-left" data-testid="rcv-lines">
              <thead class="bg-ink/10 text-ink/70"><tr class="po-cap"><th class="w-10 px-3 py-2 text-center"><input type="checkbox" class="h-4 w-4" aria-label="Select all lines" [checked]="allChecked()" (change)="toggleAll($any($event.target).checked)" [disabled]="!m.canReceive" /></th>
                <th class="px-3 py-2">SKU / item details</th><th class="px-3 py-2">Bin destination</th><th class="px-2 py-2 text-right">Ordered</th><th class="px-2 py-2 text-right">Prev rcvd</th><th class="w-52 px-3 py-2 text-center">Verifying now</th>
                <th class="px-2 py-2 text-right">Outstanding</th><th class="px-3 py-2 text-center">Line status</th><th class="px-3 py-2">Tare &amp; seal integrity</th><th class="px-2 py-2 text-right">Details</th></tr></thead>
              <tbody class="divide-y divide-ink/10 text-sm">
                @for (r of visibleRows(); track r.line.lineId) {
                  <tr class="transition-colors hover:bg-ink/5" [class]="r.short > 0 && r.e.accepted > 0 ? 'bg-primary/5' : ''" [attr.data-testid]="'rline-' + tid(r.line)">
                    <td class="px-3 py-3 text-center"><input type="checkbox" class="h-4 w-4" [attr.aria-label]="'Include ' + r.line.itemName" [checked]="r.e.checked" [disabled]="!m.canReceive || r.line.outstanding <= 0" (change)="patch(r.line.lineId, { checked: $any($event.target).checked })" /></td>
                    <td class="px-3 py-3"><div class="flex items-center gap-3"><div class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-ink/10 text-primary"><zp-icon name="bottle" [size]="22" /></div>
                      <div class="flex flex-col"><span class="text-[15px] font-semibold">{{ r.line.itemName }}</span>
                        <span class="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-ink/70"><span class="font-data">{{ r.line.sku }}</span>@if (r.line.containerSize) { <span>&bull;</span><span class="font-data">{{ r.line.containerSize | number: '1.0-0' }} {{ unit(r.line.unit) }}</span> }
                          @if (r.line.barcode) { <span class="rounded bg-success/10 px-1 font-jakarta text-[10px] font-bold uppercase text-success">Barcode on file</span> }
                          @if (r.line.tracksBatches) { <span class="rounded bg-ink/10 px-1 font-jakarta text-[10px] font-bold uppercase">Batch</span> }
                          @if (r.line.tracksSerials) { <span class="rounded bg-ink/10 px-1 font-jakarta text-[10px] font-bold uppercase">Serial</span> }</span></div></div></td>
                    <td class="px-3 py-3"><zp-search-select [ariaLabel]="'Bin for ' + r.line.itemName" [testId]="'rbin-' + tid(r.line)" [emptyLabel]="m.bins.length === 0 ? 'No bins set up' : 'Choose a bin'" noun="bin" placeholder="Search bins"
                      [inputClass]="binIsSecure(r.e.binId) ? 'w-full rounded bg-ink/10 px-2 py-1 font-data text-[11px] focus:outline-none focus:ring-1 focus:ring-primary text-primary font-semibold' : 'w-full rounded bg-ink/10 px-2 py-1 font-data text-[11px] focus:outline-none focus:ring-1 focus:ring-primary text-ink'"
                      [options]="binOptions()" [value]="r.e.binId" [disabled]="!m.canReceive || m.bins.length === 0" (valueChange)="patch(r.line.lineId, { binId: $event || null })" /></td>
                    <td class="px-2 py-3 text-right font-data text-sm font-bold">{{ r.line.ordered | number: '1.0-4' }}</td>
                    <td class="px-2 py-3 text-right font-data text-sm text-ink/70">{{ r.line.previouslyReceived | number: '1.0-4' }}@if (r.line.awaitingSecondKey > 0) { <span class="block text-[10px] text-primary">+{{ r.line.awaitingSecondKey | number: '1.0-4' }} held</span> }</td>
                    <td class="px-3 py-3"><div class="flex items-center justify-center gap-1 rounded-lg bg-canvas p-1">
                      <button type="button" class="grid h-8 w-8 place-items-center rounded bg-ink/10 hover:bg-ink/20 disabled:opacity-40" [attr.aria-label]="'One fewer ' + r.line.itemName" [disabled]="!m.canReceive || r.e.accepted <= 0" (click)="step(r.line, -1)"><zp-icon name="minus" [size]="16" /></button>
                      <input type="number" min="0" step="any" class="w-16 rounded bg-ink/10 py-1 text-center font-data text-sm font-bold text-success focus:outline-none focus:ring-1 focus:ring-success" [attr.aria-label]="'Quantity received of ' + r.line.itemName" [attr.data-testid]="'raccept-' + tid(r.line)" [disabled]="!m.canReceive || r.line.outstanding <= 0" [ngModel]="r.e.accepted" (ngModelChange)="setAccepted(r.line, +$event)" />
                      <button type="button" class="grid h-8 w-8 place-items-center rounded bg-ink/10 hover:bg-ink/20 disabled:opacity-40" [attr.aria-label]="'One more ' + r.line.itemName" [disabled]="!m.canReceive || r.e.accepted >= r.line.outstanding" (click)="step(r.line, 1)"><zp-icon name="plus" [size]="16" /></button>
                      <button type="button" class="rounded bg-ink/10 px-2 py-1 po-cap hover:text-primary disabled:opacity-40" [attr.data-testid]="'rmax-' + tid(r.line)" [disabled]="!m.canReceive || r.line.outstanding <= 0" (click)="setAccepted(r.line, r.line.outstanding)">Max</button></div></td>
                    <td class="px-2 py-3 text-right font-data text-sm font-bold" [class]="r.short > 0 ? 'text-danger' : 'text-success'" [attr.data-testid]="'rshort-' + tid(r.line)">{{ r.short > 0 ? (r.short | number: '1.0-4') + ' backordered' : '0' }}</td>
                    <td class="px-3 py-3 text-center">
                      @if (r.line.outstanding <= 0) { <span class="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 font-data text-[11px] font-semibold text-success">Received earlier</span> }
                      @else if (r.e.accepted <= 0) { <span class="inline-flex items-center gap-1.5 rounded-full bg-ink/10 px-3 py-1 font-data text-[11px] font-semibold text-ink/70">Pending</span> }
                      @else if (r.short <= 0) { <span class="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 font-data text-[11px] font-semibold text-success"><span class="h-1.5 w-1.5 rounded-full bg-success"></span>Fully received</span> }
                      @else { <span class="inline-flex items-center gap-1.5 rounded-full bg-primary/20 px-3 py-1 font-data text-[11px] font-semibold text-primary"><span class="h-1.5 w-1.5 rounded-full bg-primary"></span>Partial ({{ r.short | number: '1.0-4' }} short)</span> }</td>
                    <td class="px-3 py-3">
                      <div class="flex flex-col gap-1">
                        <div class="flex items-center gap-2">
                          <input type="number" min="0" class="w-16 rounded bg-ink/10 px-1 py-0.5 text-right font-data text-[11px] focus:outline-none focus:ring-1 focus:ring-primary" [attr.aria-label]="'Seals intact for ' + r.line.itemName" [attr.data-testid]="'rseals-' + tid(r.line)" placeholder="seals" [disabled]="!m.canReceive || r.line.outstanding <= 0" [ngModel]="r.e.seals" (ngModelChange)="patch(r.line.lineId, { seals: $event === '' || $event === null ? null : +$event })" />
                          @if (r.line.tareExpectedGrams) { <input type="number" min="0" step="any" class="w-20 rounded bg-ink/10 px-1 py-0.5 text-right font-data text-[11px] focus:outline-none focus:ring-1 focus:ring-primary" [attr.aria-label]="'Weighed tare of ' + r.line.itemName" [attr.data-testid]="'rtare-' + tid(r.line)" placeholder="tare g" [disabled]="!m.canReceive || r.line.outstanding <= 0" [ngModel]="r.e.tare" (ngModelChange)="patch(r.line.lineId, { tare: $event === '' || $event === null ? null : +$event })" /> }
                        </div>
                        @if (r.e.seals != null) { <span class="flex items-center gap-1 text-[11px]" [class]="r.e.seals >= r.e.accepted ? 'text-success' : 'text-danger'"><zp-icon [name]="r.e.seals >= r.e.accepted ? 'shield' : 'alert'" [size]="14" /> Seals intact ({{ r.e.seals }}/{{ r.e.accepted | number: '1.0-4' }})</span> }
                        @if (r.tare !== null) { <span class="font-data text-[11px]" [class]="r.tare ? 'text-success' : 'text-danger'" [attr.data-testid]="'rtare-state-' + tid(r.line)">Expected {{ r.line.tareExpectedGrams | number: '1.0-0' }} g: {{ r.tare ? 'passed' : 'outside +/-' + m.tareTolerancePercent + '%' }}</span> }
                        @if (rowError(r.line.lineId); as err) { <span class="text-[11px] text-danger" role="alert" [attr.data-testid]="'rerror-' + tid(r.line)">{{ err }}</span> }
                      </div></td>
                    <td class="px-2 py-3 text-right"><button type="button" class="rounded px-2 py-1 text-xs underline hover:text-primary disabled:opacity-40" [attr.data-testid]="'rdetail-' + tid(r.line)" [disabled]="!m.canReceive || r.line.outstanding <= 0" (click)="detailKey.set(r.line.lineId)">Lot, serials, notes</button></td>
                  </tr>
                } @empty { <tr><td colspan="10" class="px-4 py-8 text-center text-sm text-ink/70">No lines in this view.</td></tr> }
              </tbody>
            </table>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-2 bg-ink/5 px-4 py-2 text-sm">
            <span class="flex items-center gap-2 text-ink/70"><zp-icon name="check" [size]="16" class="text-success" /> Last scan: <strong class="text-ink" data-testid="rcv-last-scan">{{ lastScan() ?? 'none yet' }}</strong></span>
            <span class="po-cap">Tare tolerance range: +/-{{ m.tareTolerancePercent }}%</span>
          </div>
        </section>

        <!-- Summary cards -->
        <section class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4" aria-label="Summary">
          <div class="app-card flex flex-col justify-between gap-2"><div class="flex items-center justify-between"><span class="po-cap">Physical intake</span><zp-icon name="box" [size]="18" class="text-success" /></div>
            <div><span class="font-syne text-4xl font-extrabold" data-testid="rcv-intake">{{ acceptedUnits() | number: '1.0-4' }}</span><span class="ml-1 text-sm text-ink/70">/ {{ m.expectedUnits | number: '1.0-4' }} units</span></div>
            <p class="flex items-center gap-1 text-sm text-success"><zp-icon name="check" [size]="16" /> {{ percent() | number: '1.0-1' }}% of the consignment cleared</p>
            <div class="h-2 overflow-hidden rounded-full bg-ink/15"><div class="h-full rounded-full bg-success" [style.width.%]="percent()"></div></div></div>
          <div class="app-card flex flex-col justify-between gap-2"><div class="flex items-center justify-between"><span class="po-cap">Shortage / backorder</span><zp-icon name="clock" [size]="18" class="text-primary" /></div>
            <div><span class="font-syne text-4xl font-extrabold text-primary" data-testid="rcv-backorder">{{ backorder() | number: '1.0-4' }}</span><span class="ml-1 text-sm text-ink/70">units owed</span></div>
            @if (m.canSeeCosts) { <p class="text-sm text-ink/70">Vendor credit pending: <strong class="text-primary" data-testid="rcv-credit">{{ creditPending() | number: '1.2-2' }}</strong></p> }
            <span class="po-cap">The order stays open until the rest arrives</span></div>
          @if (m.canSeeCosts) {
            <div class="app-card flex flex-col justify-between gap-2"><div class="flex items-center justify-between"><span class="po-cap">Received valuation</span><zp-icon name="wallet" [size]="18" class="text-primary" /></div>
              <span class="font-syne text-3xl font-bold text-primary" data-testid="rcv-value">{{ valuation() | number: '1.2-2' }}</span>
              <p class="text-sm text-ink/70">Total order: <span class="font-data text-ink">{{ m.orderTotal | number: '1.2-2' }}</span></p><span class="po-cap font-semibold text-success">Goes on the supplier's account when posted</span></div>
          } @else {
            <div class="app-card flex flex-col justify-between gap-2"><div class="flex items-center justify-between"><span class="po-cap">Valuation</span><zp-icon name="lock" [size]="18" class="text-ink/60" /></div><p class="text-sm text-ink/70">Costs are shown only to people who may see them.</p></div>
          }
          <div class="app-card flex flex-col justify-between gap-2"><div class="flex items-center justify-between"><span class="po-cap">Storage route dispatch</span><zp-icon name="dispatch" [size]="18" class="text-success" /></div>
            <div class="grid grid-cols-2 gap-2" data-testid="rcv-route">@for (b of routing(); track b.key) { <div class="flex flex-col rounded bg-ink/10 p-1.5"><span class="po-cap">{{ b.label }}</span><span class="font-data text-[11px] font-bold" [class]="b.secure ? 'text-primary' : 'text-success'">+{{ b.qty | number: '1.0-4' }} units</span></div> } @empty { <span class="col-span-2 text-xs text-ink/60">Nothing counted yet.</span> }</div>
            <span class="po-cap">Bins you choose per line</span></div>
        </section>

        <!-- Discrepancies -->
        <section class="app-card flex flex-col gap-3" aria-label="Discrepancies" data-testid="rcv-discrepancies">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-3"><div class="grid h-10 w-10 place-items-center rounded-xl bg-danger/10 text-danger"><zp-icon name="alert" [size]="24" /></div>
              <div><div class="flex items-center gap-2"><h2 class="font-syne text-lg font-semibold">{{ allDiscrepancies().length > 0 ? 'Transit discrepancy notice active' : 'Discrepancies' }}</h2>
                @if (allDiscrepancies().length > 0) { <span class="rounded bg-danger/15 px-2 py-0.5 po-cap text-danger">{{ allDiscrepancies().length }} alert{{ allDiscrepancies().length === 1 ? '' : 's' }}</span> }</div>
                <p class="text-sm text-ink/70">{{ allDiscrepancies().length > 0 ? 'Short, damaged or wrong goods are recorded with the evidence and can go on a claim slip.' : 'Nothing wrong has been recorded. Record shortages, damage or wrong items here, with photos.' }}</p></div></div>
            <div class="flex flex-wrap items-center gap-2">
              <button type="button" class="btn-outline" data-testid="rcv-add-discrepancy" [disabled]="!m.canReceive" (click)="openDiscrepancy()"><zp-icon name="camera" [size]="16" /> Record a problem / attach photos</button>
              <button type="button" class="btn-outline" data-testid="rcv-memo" [disabled]="!m.canReceive" (click)="memoOpen.set(true)"><zp-icon name="note" [size]="16" /> Edit variance memo</button>
            </div>
          </div>
          @if (memo()) { <p class="rounded-lg bg-ink/5 p-2 text-sm" data-testid="rcv-memo-text"><span class="po-cap">Variance memo</span><br />{{ memo() }}</p> }
          <ul class="space-y-2">
            @for (d of draftDiscrepancies(); track d.id) {
              <li class="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm" [attr.data-testid]="'draft-discrepancy-' + d.kind"><p class="flex flex-wrap items-center justify-between gap-2"><span><strong>{{ kindLabel(d.kind) }}</strong>@if (d.itemName) { : {{ d.itemName }} } @if (d.quantity != null) { ({{ d.quantity | number: '1.0-4' }}) } <span class="po-cap">not yet committed</span></span>
                <button type="button" class="text-xs underline" (click)="removeDraft(d.id)">Remove</button></p><p class="mt-1 text-ink/80">{{ d.description }}</p>
                <div class="mt-2 flex flex-wrap gap-2">@for (p of d.photoIds; track p) { <zp-photo-thumb [id]="p" /> }</div></li>
            }
            @for (d of m.discrepancies; track d.id) {
              <li class="rounded-lg border border-ink/10 bg-ink/5 p-3 text-sm"><p><strong>{{ kindLabel(d.kind) }}</strong>@if (d.itemName) { : {{ d.itemName }} } @if (d.quantity != null) { ({{ d.quantity | number: '1.0-4' }}) } <span class="po-cap">{{ d.recordedByName }} &bull; {{ d.recordedAtUtc | date: 'medium' }}@if (d.claimNumber) { &bull; claim {{ d.claimNumber }} }</span></p><p class="mt-1 text-ink/80">{{ d.description }}</p>
                <div class="mt-2 flex flex-wrap gap-2">@for (p of d.photoMediaIds; track p) { <zp-photo-thumb [id]="p" /> }</div></li>
            }
          </ul>
        </section>

        <!-- Command dock -->
        <section class="app-card sticky bottom-2 z-30 flex flex-wrap items-center justify-between gap-3 p-3 shadow-2xl" aria-label="Actions">
          <div class="flex flex-wrap items-center gap-2">
            <button type="button" class="btn-outline h-11" data-testid="rcv-print" (click)="print()"><zp-icon name="receipt" [size]="18" /> Print goods received note <span class="po-kbd">F3</span></button>
            <button type="button" class="btn-outline h-11 text-primary" data-testid="rcv-claim" [disabled]="m.receipts.length === 0" [title]="m.receipts.length === 0 ? 'Available once something has been received' : ''" (click)="claim()"><zp-icon name="note" [size]="18" /> Issue backorder claim slip</button>
            <button type="button" class="btn-ghost h-11" data-testid="rcv-cancel" (click)="leave()"><zp-icon name="x" [size]="18" /> Cancel <span class="po-kbd">Esc</span></button>
          </div>
          <div class="flex flex-wrap items-center gap-4">
            <div class="hidden flex-col text-right sm:flex"><span class="flex items-center justify-end gap-1 text-sm font-semibold" [class]="secureCount() > 0 ? 'text-primary' : 'text-success'" data-testid="rcv-dual"><zp-icon name="lock" [size]="16" /> {{ secureCount() > 0 ? 'Second key needed for ' + secureCount() + ' secure line' + (secureCount() === 1 ? '' : 's') : 'No high-security bin on this receipt' }}</span>
              <span class="po-cap">{{ secureCount() > 0 ? 'Held lines enter stock when another person confirms' : 'Stock levels update immediately' }}</span></div>
            <button type="button" class="inline-flex h-12 items-center gap-3 rounded-xl bg-success px-6 font-syne text-lg font-semibold uppercase tracking-wide text-on-secondary shadow-lg transition active:scale-[0.98] disabled:opacity-40" style="color: rgb(var(--canvas-rgb))" data-testid="rcv-commit" [disabled]="!m.canReceive || busy() || acceptedUnits() + rejectedUnits() <= 0" (click)="commit()">
              <zp-icon name="inbox" [size]="22" /> {{ commitLabel() }} <span class="po-kbd">F2</span></button>
          </div>
        </section>
      }
    </div>

    <!-- Draft goods received note (printed from the screen; the final one is printed from the receipt) -->
    @if (manifest(); as m) {
      <section class="hidden bg-white p-6 font-jakarta text-sm text-black print:block" data-testid="rcv-print-sheet">
        <header class="flex items-start justify-between border-b border-black pb-3"><div><h1 class="font-syne text-2xl font-bold">Goods received note (draft)</h1><p class="font-data text-lg">{{ m.documentNumber }}</p></div>
          <div class="text-right"><p class="font-semibold">{{ m.supplierName ?? 'Branch transfer' }}</p><p>{{ m.branchName }}</p><p>{{ now() | date: 'd MMM yyyy HH:mm' }}</p><p>Receiver: {{ receiver() }}</p></div></header>
        <table class="my-3 w-full border-collapse text-left"><thead><tr class="border-y border-black"><th class="py-1">SKU</th><th>Item</th><th class="text-right">Ordered</th><th class="text-right">Counted</th><th>Bin</th><th class="text-right">Short</th></tr></thead>
          <tbody>@for (r of rows(); track r.line.lineId) { <tr class="border-b border-gray-300"><td class="py-1 font-data">{{ r.line.sku }}</td><td>{{ r.line.itemName }}</td><td class="text-right font-data">{{ r.line.ordered | number: '1.0-4' }}</td><td class="text-right font-data">{{ r.e.accepted | number: '1.0-4' }}</td><td class="font-data">{{ binCode(r.e.binId) }}</td><td class="text-right font-data">{{ r.short | number: '1.0-4' }}</td></tr> }</tbody></table>
        @if (memo()) { <p class="whitespace-pre-wrap">{{ memo() }}</p> }
        <footer class="mt-10 grid grid-cols-2 gap-6 text-xs"><div class="border-t border-black pt-1">Received by {{ receiver() }}</div><div class="border-t border-black pt-1">Driver / supplier signature</div></footer>
      </section>
    }

    <!-- Dialogs -->
    <zp-dialog [open]="detailKey() !== null" [title]="detailTitle()" [wide]="true" (closed)="detailKey.set(null)">
      @if (detailRow(); as r) {
        <form class="grid gap-3 sm:grid-cols-2" (submit)="$event.preventDefault(); detailKey.set(null)">
          @if (r.line.tracksBatches) {
            <div><label class="app-label" for="dl-lot">Lot code (required for this item)</label><input id="dl-lot" class="app-input font-data" maxlength="60" data-testid="detail-lot" [ngModel]="r.e.lot" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch(r.line.lineId, { lot: $event })" /></div>
          }
          <div><label class="app-label" for="dl-exp">Expiry date</label><input id="dl-exp" type="date" class="app-input" data-testid="detail-expiry" [ngModel]="r.e.expiry" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch(r.line.lineId, { expiry: $event })" /></div>
          <div><label class="app-label" for="dl-rej">Turned away (damaged or wrong)</label><input id="dl-rej" type="number" min="0" step="any" class="app-input font-data" data-testid="detail-rejected" [ngModel]="r.e.rejected" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch(r.line.lineId, { rejected: +$event })" /></div>
          @if (r.line.tracksSerials) {
            <div class="sm:col-span-2"><label class="app-label" for="dl-serials">Serial numbers: one per line, exactly {{ r.e.accepted | number: '1.0-0' }}</label><textarea id="dl-serials" rows="4" class="app-input font-data text-xs" data-testid="detail-serials" [ngModel]="r.e.serials" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch(r.line.lineId, { serials: $event })"></textarea></div>
          }
          <div class="sm:col-span-2"><label class="app-label" for="dl-note">Note for this line</label><input id="dl-note" class="app-input" maxlength="300" data-testid="detail-note" [ngModel]="r.e.note" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch(r.line.lineId, { note: $event })" /></div>
          <div class="flex justify-end sm:col-span-2"><button type="submit" class="btn-primary" data-testid="detail-done">Done</button></div>
        </form>
      }
    </zp-dialog>

    <zp-dialog [open]="discOpen()" title="Record a problem with this delivery" [wide]="true" (closed)="discOpen.set(false)">
      <form class="grid gap-3 sm:grid-cols-2" (submit)="$event.preventDefault(); addDiscrepancy()">
        <div><label class="app-label" for="dc-kind">What happened</label><select id="dc-kind" class="app-input" data-testid="disc-kind" [ngModel]="discKind()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="discKind.set($event)"><option value="Shortage">Short delivery</option><option value="Damage">Damaged goods</option><option value="WrongItem">Wrong item</option><option value="Other">Something else</option></select></div>
        <div><label class="app-label" for="dc-item">Item (optional)</label><zp-search-select inputId="dc-item" testId="disc-item" emptyLabel="Not about one item" noun="item" placeholder="Search items" [options]="discItemOptions()" [value]="discItem()" (valueChange)="discItem.set($event || null)" /></div>
        <div><label class="app-label" for="dc-qty">Quantity (optional)</label><input id="dc-qty" type="number" min="0" step="any" class="app-input font-data" data-testid="disc-qty" [ngModel]="discQty()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="discQty.set($event === '' || $event === null ? null : +$event)" /></div>
        <div class="sm:col-span-2"><label class="app-label" for="dc-text">Describe it</label><textarea id="dc-text" rows="3" maxlength="1000" class="app-input" data-testid="disc-text" [ngModel]="discText()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="discText.set($event)"></textarea></div>
        <div class="sm:col-span-2"><label class="app-label" for="dc-photo">Photos (PNG, JPEG or WebP, up to 5 MB each)</label>
          <input id="dc-photo" type="file" accept="image/png,image/jpeg,image/webp" capture="environment" multiple class="app-input" data-testid="disc-photo" (change)="uploadPhotos($any($event.target).files)" />
          <div class="mt-2 flex flex-wrap gap-2">@for (p of discPhotos(); track p) { <zp-photo-thumb [id]="p" /> }</div>
          @if (photoError()) { <p class="mt-1 text-xs text-danger" role="alert">{{ photoError() }}</p> }</div>
        <div class="flex justify-end gap-2 sm:col-span-2"><button type="button" class="btn-ghost" (click)="discOpen.set(false)">Cancel</button><button type="submit" class="btn-primary" data-testid="disc-save" [disabled]="discText().trim().length < 3 || uploading()">Add to this receipt</button></div>
      </form>
    </zp-dialog>

    <zp-dialog [open]="memoOpen()" title="Variance memo" (closed)="memoOpen.set(false)">
      <label class="app-label" for="memo-text">What should the buyer and the supplier know about this delivery?</label>
      <textarea id="memo-text" rows="5" maxlength="1000" class="app-input" data-testid="memo-input" [ngModel]="memo()" (ngModelChange)="memo.set($event)"></textarea>
      <div class="mt-3 flex justify-end"><button type="button" class="btn-primary" (click)="memoOpen.set(false)">Done</button></div>
    </zp-dialog>

    <zp-dialog [open]="claimSlip() !== null" title="Backorder claim slip" [wide]="true" (closed)="claimSlip.set(null)">
      @if (claimSlip(); as c) { <zp-claim-slip [slip]="c" /> }
    </zp-dialog>
  `
})
export class GoodsReceivingComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ReceivingApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly now = signal(new Date());
  protected readonly manifest = signal<ReceivingManifestDto | null>(null);
  protected readonly entries = signal<Readonly<Record<string, Entry>>>({});
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly rowErrors = signal<Readonly<Record<string, string>>>({});
  protected readonly filter = signal<Filter>('all');

  protected readonly invoiceRef = signal('');
  protected readonly courier = signal('');
  protected readonly waybill = signal('');
  protected readonly bay = signal('');
  protected readonly temperature = signal<number | null>(null);
  protected readonly sealNumber = signal('');
  protected readonly sealIntact = signal<boolean | null>(null);
  protected readonly memo = signal('');
  protected readonly memoOpen = signal(false);

  protected readonly scanText = signal('');
  protected readonly scanNote = signal<string | null>(null);
  protected readonly scanOk = signal(true);
  protected readonly lastScan = signal<string | null>(null);
  protected readonly lastUnknown = signal<string | null>(null);
  protected readonly cameraOpen = signal(false);
  protected readonly cameraFeedback = signal<ScanFeedback | null>(null);

  protected readonly detailKey = signal<string | null>(null);
  protected readonly discOpen = signal(false);
  protected readonly discKind = signal<DiscrepancyKind>('Shortage');
  protected readonly discItem = signal<string | null>(null);
  protected readonly binOptions = computed<readonly SelectOption[]>(() => (this.manifest()?.bins ?? []).map((b) => ({ value: b.id, label: `${b.code}${b.isHighSecurity ? ' - secure, needs a second person' : ''}` })));
  protected readonly discItemOptions = computed<readonly SelectOption[]>(() => (this.manifest()?.lines ?? []).map((l) => ({ value: l.inventoryItemId, label: l.itemName })));
  protected readonly discQty = signal<number | null>(null);
  protected readonly discText = signal('');
  protected readonly discPhotos = signal<readonly string[]>([]);
  protected readonly photoError = signal<string | null>(null);
  protected readonly uploading = signal(false);
  protected readonly draftDiscrepancies = signal<readonly DraftDiscrepancy[]>([]);
  protected readonly claimSlip = signal<ClaimSlipDto | null>(null);

  private readonly commitKey = `rcv-${crypto.randomUUID()}`;
  private clock: ReturnType<typeof setInterval> | null = null;
  private orderId = '';

  protected readonly rows = computed(() => {
    const m = this.manifest();
    if (!m) return [];
    const entries = this.entries();
    return m.lines.map((line) => {
      const e = entries[line.lineId] ?? this.blank(line, m);
      const short = Math.max(0, line.outstanding - (e.checked ? e.accepted : 0));
      return { line, e, short, tare: tareWithinTolerance(e.tare, line.tareExpectedGrams) };
    });
  });
  protected readonly visibleRows = computed(() => {
    const f = this.filter();
    return this.rows().filter((r) => (f === 'all' ? true : f === 'pending' ? r.line.outstanding > 0 && r.e.accepted <= 0 : r.line.outstanding > 0 && r.short > 0));
  });
  protected readonly pendingCount = computed(() => this.rows().filter((r) => r.line.outstanding > 0 && r.e.accepted <= 0).length);
  protected readonly shortageCount = computed(() => this.rows().filter((r) => r.line.outstanding > 0 && r.short > 0).length);
  protected readonly acceptedUnits = computed(() => this.rows().reduce((n, r) => n + (r.e.checked ? r.e.accepted : 0), 0));
  protected readonly rejectedUnits = computed(() => this.rows().reduce((n, r) => n + (r.e.checked ? r.e.rejected : 0), 0));
  protected readonly verified = computed(() => (this.manifest()?.verifiedUnits ?? 0) + this.acceptedUnits());
  protected readonly percent = computed(() => { const m = this.manifest(); return m && m.expectedUnits > 0 ? Math.min(100, Math.round((this.verified() / m.expectedUnits) * 1000) / 10) : 0; });
  protected readonly backorder = computed(() => this.rows().reduce((n, r) => n + r.short, 0));
  protected readonly allChecked = computed(() => this.rows().filter((r) => r.line.outstanding > 0).every((r) => r.e.checked));
  protected readonly secureCount = computed(() => this.rows().filter((r) => r.e.checked && r.e.accepted > 0 && this.binIsSecure(r.e.binId)).length);
  protected readonly allDiscrepancies = computed<readonly (DiscrepancyDto | DraftDiscrepancy)[]>(() => [...this.draftDiscrepancies(), ...(this.manifest()?.discrepancies ?? [])]);
  protected readonly detailRow = computed(() => this.rows().find((r) => r.line.lineId === this.detailKey()) ?? null);
  protected readonly detailTitle = computed(() => (this.detailRow() ? `Details: ${this.detailRow()!.line.itemName}` : 'Details'));
  protected readonly receiver = computed(() => this.auth.membership()?.displayName ?? '');

  protected readonly creditPending = computed(() => {
    const m = this.manifest();
    if (!m?.canSeeCosts) return 0;
    return round2(this.rows().reduce((n, r) => n + r.short * (r.line.unitCost ?? 0) * (1 - (r.line.discountPercent ?? 0) / 100) * (m.taxInclusive ? 1 : 1 + (r.line.taxRatePercent ?? 0) / 100), 0));
  });
  protected readonly valuation = computed(() => {
    const m = this.manifest();
    if (!m?.canSeeCosts) return 0;
    return round2(this.rows().reduce((n, r) => n + (r.e.checked ? r.e.accepted : 0) * netUnitCost(r.line.unitCost ?? 0, r.line.discountPercent ?? 0, r.line.taxRatePercent ?? 0, m.taxInclusive) * (1 + (r.line.taxRatePercent ?? 0) / 100), 0));
  });
  protected readonly routing = computed(() => {
    const m = this.manifest();
    const groups = new Map<string, { key: string; label: string; qty: number; secure: boolean }>();
    for (const r of this.rows()) {
      if (!r.e.checked || r.e.accepted <= 0) continue;
      const bin = m?.bins.find((b) => b.id === r.e.binId);
      const key = bin?.id ?? 'none';
      const g = groups.get(key) ?? { key, label: bin?.code ?? 'Unassigned', qty: 0, secure: !!bin?.isHighSecurity };
      g.qty += r.e.accepted;
      groups.set(key, g);
    }
    return [...groups.values()];
  });

  private readonly auth = inject(AuthService);

  ngOnInit(): void {
    this.orderId = this.route.snapshot.paramMap.get('id') ?? '';
    this.clock = setInterval(() => this.now.set(new Date()), 1000);
    void this.load();
  }

  ngOnDestroy(): void { if (this.clock) clearInterval(this.clock); }

  private blank(line: ReceivingLineDto, m: ReceivingManifestDto): Entry {
    const suggested = line.suggestedBinId ?? (m.bins.length === 1 ? m.bins[0]!.id : null);
    return { accepted: 0, rejected: 0, binId: suggested, lot: '', expiry: line.expiryDate ? line.expiryDate.slice(0, 10) : '', serials: '', tare: null, seals: null, note: '', checked: false };
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const m = await firstValueFrom(this.api.manifest(this.orderId));
      this.manifest.set(m);
      this.invoiceRef.set(m.invoiceRef ?? '');
      this.courier.set(m.courier ?? '');
      this.waybill.set(m.waybill ?? '');
      const next: Record<string, Entry> = {};
      for (const l of m.lines) next[l.lineId] = this.blank(l, m);
      this.entries.set(next);
    } catch (err) { this.error.set(toApiError(err).message); } finally { this.loading.set(false); }
  }

  // ---- Counting -----------------------------------------------------------------------------------------------------------

  protected patch(lineId: string, p: Partial<Entry>): void {
    this.entries.update((all) => {
      const line = this.manifest()?.lines.find((l) => l.lineId === lineId);
      const current = all[lineId] ?? (line ? this.blank(line, this.manifest()!) : null);
      return current ? { ...all, [lineId]: { ...current, ...p } } : all;
    });
    this.rowErrors.update((e) => { const { [lineId]: _drop, ...rest } = e; return rest; });
  }

  protected setAccepted(line: ReceivingLineDto, qty: number): void {
    const q = Number.isNaN(qty) || qty < 0 ? 0 : Math.min(qty, line.outstanding);
    this.patch(line.lineId, { accepted: q, checked: q > 0 });
  }

  protected step(line: ReceivingLineDto, delta: number): void {
    const e = this.entries()[line.lineId];
    this.setAccepted(line, (e?.accepted ?? 0) + delta);
  }

  protected receiveAll(): void {
    this.entries.update((all) => {
      const next = { ...all };
      for (const l of this.manifest()!.lines) if (l.outstanding > 0) next[l.lineId] = { ...(next[l.lineId] ?? this.blank(l, this.manifest()!)), accepted: l.outstanding, checked: true };
      return next;
    });
  }

  protected toggleAll(checked: boolean): void {
    this.entries.update((all) => {
      const next = { ...all };
      for (const l of this.manifest()!.lines) if (l.outstanding > 0) next[l.lineId] = { ...(next[l.lineId] ?? this.blank(l, this.manifest()!)), checked, accepted: checked && (next[l.lineId]?.accepted ?? 0) === 0 ? l.outstanding : (next[l.lineId]?.accepted ?? 0) };
      return next;
    });
  }

  protected openCamera(): void { this.cameraFeedback.set(null); this.cameraOpen.set(true); }
  protected closeCamera(): void { this.cameraOpen.set(false); this.cameraFeedback.set(null); }

  /** Each code the camera reads counts exactly as if it had been typed in the scan box: one unit, and the same notes. */
  protected cameraScanned(code: string): void {
    this.scanText.set(code);
    this.scan();
    this.cameraFeedback.set({ text: this.scanNote() ?? code, ok: this.scanOk() });
  }

  protected scan(): void {
    const raw = this.scanText().trim();
    if (!raw) return;
    const m = /^(\d+(?:\.\d+)?)\s*[*x]\s*(.+)$/i.exec(raw);
    const qty = m ? Number(m[1]) : 1;
    const code = (m ? m[2]! : raw).trim().toLowerCase();
    const lines = this.manifest()!.lines;
    const line = lines.find((l) => l.barcode?.toLowerCase() === code || l.sku?.toLowerCase() === code) ?? (() => { const named = lines.filter((l) => l.itemName.toLowerCase().includes(code)); return named.length === 1 ? named[0] : undefined; })();
    this.scanText.set('');
    if (!line) { this.scanOk.set(false); this.lastUnknown.set(raw); this.scanNote.set(`"${raw}" is not on this order.`); return; }
    this.lastUnknown.set(null);
    const have = this.entries()[line.lineId]?.accepted ?? 0;
    const room = line.outstanding - have;
    if (room <= 0) { this.scanOk.set(false); this.scanNote.set(`${line.itemName} is already fully counted: ${line.outstanding} expected.`); return; }
    const add = Math.min(qty, room);
    this.setAccepted(line, have + add);
    this.scanOk.set(add === qty);
    this.scanNote.set(add === qty ? `${line.itemName}: ${have + add} counted.` : `${line.itemName}: only ${add} more was expected, so the count stops at ${have + add}.`);
    this.lastScan.set(`${line.itemName} (${add} unit${add === 1 ? '' : 's'}) at ${new Date().toLocaleTimeString()}`);
  }

  /** Test ids and the keyboard use the SKU, or the item name when it has no SKU. */
  protected tid(line: ReceivingLineDto): string { return line.sku ?? line.itemName; }

  protected rowError(lineId: string): string | null { return this.rowErrors()[lineId] ?? null; }
  protected unit = (u: StockUnit): string => UNIT[u];
  protected statusText(m: ReceivingManifestDto): string { return `${STATUS_TEXT[m.status].toUpperCase()}`; }
  protected binIsSecure(id: string | null): boolean { return !!id && !!this.manifest()?.bins.find((b) => b.id === id)?.isHighSecurity; }
  protected binCode(id: string | null): string { return this.manifest()?.bins.find((b) => b.id === id)?.code ?? '-'; }
  protected kindLabel(k: DiscrepancyKind): string { return k === 'Shortage' ? 'Short delivery' : k === 'Damage' ? 'Damaged goods' : k === 'WrongItem' ? 'Wrong item' : 'Other problem'; }
  protected verb(): string {
    const t = this.manifest()?.documentType;
    return t === 'VendorReturn' ? 'Release to supplier' : t === 'StockTransfer' ? 'Receive transfer' : 'Inward physical inspection';
  }
  protected commitLabel(): string {
    const t = this.manifest()?.documentType;
    return t === 'VendorReturn' ? 'Release goods to supplier [commit]' : t === 'StockTransfer' ? 'Commit transfer to live stock ledger' : 'Commit inward receipt to live stock ledger';
  }

  // ---- Problems and photos ---------------------------------------------------------------------------------------------------

  protected openDiscrepancy(prefill?: { kind?: DiscrepancyKind; text?: string }): void {
    this.discKind.set(prefill?.kind ?? 'Shortage');
    this.discItem.set(null);
    this.discQty.set(null);
    this.discText.set(prefill?.text ?? '');
    this.discPhotos.set([]);
    this.photoError.set(null);
    this.discOpen.set(true);
  }

  protected discrepancyFromScan(): void { this.openDiscrepancy({ kind: 'WrongItem', text: `Delivered but not on the order: ${this.lastUnknown()}` }); }

  protected async uploadPhotos(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    this.uploading.set(true);
    this.photoError.set(null);
    try {
      for (const f of Array.from(files)) {
        if (f.size > 5 * 1024 * 1024) { this.photoError.set(`${f.name} is larger than 5 MB.`); continue; }
        const { id } = await firstValueFrom(this.api.uploadPhoto(f));
        this.discPhotos.update((p) => [...p, id]);
      }
    } catch (err) { this.photoError.set(toApiError(err).message); } finally { this.uploading.set(false); }
  }

  protected addDiscrepancy(): void {
    const item = this.manifest()!.lines.find((l) => l.inventoryItemId === this.discItem());
    this.draftDiscrepancies.update((d) => [...d, { id: crypto.randomUUID(), kind: this.discKind(), itemId: this.discItem(), itemName: item?.itemName ?? null, quantity: this.discQty(), description: this.discText().trim(), photoIds: [...this.discPhotos()] }]);
    this.discOpen.set(false);
  }

  protected removeDraft(id: string): void { this.draftDiscrepancies.update((d) => d.filter((x) => x.id !== id)); }

  // ---- Committing -------------------------------------------------------------------------------------------------------------

  protected async commit(): Promise<void> {
    const included = this.rows().filter((r) => r.e.checked && (r.e.accepted > 0 || r.e.rejected > 0));
    if (included.length === 0) { this.error.set('Count at least one line first.'); return; }
    const secure = this.secureCount();
    const note = secure > 0 ? ` ${secure} line(s) go to a high-security bin and wait for a second person.` : '';
    if (!(await this.confirm.ask({ title: `${this.commitLabel().split(' [')[0]}?`, message: `${this.acceptedUnits()} unit(s) counted across ${included.length} line(s).${note}`, confirmLabel: 'Commit' }))) return;

    const lines: ReceiveWorkstationLine[] = included.map((r) => ({
      purchaseOrderLineId: r.line.lineId, acceptedQuantity: r.e.accepted, rejectedQuantity: r.e.rejected, binId: r.e.accepted > 0 ? r.e.binId : null, lotCode: r.e.lot.trim() || null,
      expiryDate: r.e.expiry ? new Date(`${r.e.expiry}T12:00:00Z`).toISOString() : null, serials: r.line.tracksSerials ? r.e.serials.split(/\r?\n/).map((x) => x.trim()).filter(Boolean) : null,
      tareGramsPerUnit: r.e.tare, sealsIntact: r.e.seals, note: r.e.note.trim() || null
    }));
    const order = included.map((r) => r.line.lineId);
    const discrepancies: DiscrepancyRequest[] = this.draftDiscrepancies().map((d) => ({ kind: d.kind, inventoryItemId: d.itemId, quantity: d.quantity, description: d.description, photoMediaIds: d.photoIds }));

    this.busy.set(true);
    this.error.set(null);
    this.rowErrors.set({});
    try {
      const receipt = await firstValueFrom(this.api.receive(this.orderId, {
        idempotencyKey: this.commitKey, invoiceRef: this.invoiceRef().trim() || null, courier: this.courier().trim() || null, waybill: this.waybill().trim() || null, dockBay: this.bay().trim() || null,
        temperatureC: this.temperature(), sealNumber: this.sealNumber().trim() || null, sealIntact: this.sealIntact(), discrepancyNote: this.memo().trim() || null, lines, discrepancies
      }));
      this.toast.success(receipt.status === 'AwaitingSecondKey' ? 'Recorded. Held lines wait for a second person.' : 'Goods received.');
      await this.router.navigate(['/app/purchasing/receipts', receipt.id]);
    } catch (err) {
      const e = toApiError(err);
      const mapped: Record<string, string> = {};
      for (const [key, msgs] of Object.entries(e.fieldErrors)) {
        const idx = /^lines\[(\d+)\]/.exec(key);
        if (idx) { const id = order[Number(idx[1])]; if (id) mapped[id] = msgs[0] ?? e.message; }
      }
      this.rowErrors.set(mapped);
      this.error.set(Object.keys(mapped).length > 0 ? 'Some lines need attention: see the red notes on them.' : (Object.values(e.fieldErrors)[0]?.[0] ?? e.message));
    } finally { this.busy.set(false); }
  }

  protected async claim(): Promise<void> {
    const last = this.manifest()?.receipts.at(-1);
    if (!last) return;
    try { this.claimSlip.set(await firstValueFrom(this.api.claim(last.id))); } catch (err) { this.error.set(toApiError(err).message); }
  }

  protected print(): void { window.print(); }

  protected dirty(): boolean { return this.acceptedUnits() > 0 || this.draftDiscrepancies().length > 0; }

  protected async leave(): Promise<void> {
    if (this.dirty() && !(await this.confirm.ask({ title: 'Leave without committing?', message: 'What you have counted on this screen has not been saved.', confirmLabel: 'Leave', danger: true }))) return;
    await this.router.navigate(['/app/purchasing/receiving']);
  }

  @HostListener('document:keydown', ['$event'])
  protected onKey(e: KeyboardEvent): void {
    if (this.detailKey() || this.discOpen() || this.memoOpen() || this.claimSlip() || this.confirm.request()) return;
    if (e.key === 'F2') { e.preventDefault(); void this.commit(); }
    else if (e.key === 'F3') { e.preventDefault(); this.print(); }
    else if (e.key === 'F4') { e.preventDefault(); (document.querySelector('[data-testid="rcv-scan"]') as HTMLInputElement | null)?.focus(); }
    else if (e.key === 'Escape') { void this.leave(); }
  }
}
