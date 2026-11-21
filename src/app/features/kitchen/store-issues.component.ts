import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { StockIssueDto } from '../../core/models/kitchen.model';
import { InventoryItemDto } from '../../core/models/ops.model';
import { BinDto } from '../../core/models/purchasing.model';
import { FEATURES } from '../../core/models/rbac.model';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { BranchContextService } from '../../core/services/branch-context.service';
import { KitchenApi } from '../../core/services/kitchen.services';
import { InventoryApi } from '../../core/services/ops.services';
import { BinApi } from '../../core/services/purchasing.services';
import { StationsService } from '../../core/services/stations.service';
import { DialogComponent, ToastService } from '../../shared/ui/feedback';

interface AskLine { inventoryItemId: string; quantity: number }
interface IssueLine { lineId: string; itemName: string; requested: number; issued: number; fromBinId: string | null }
interface ReceiveLine { lineId: string; itemName: string; issued: number; received: number }

/**
 * Store issues (owner's decision, 2026-11-21): a station asks the store for stock, the store hands over what it can (it may be less), and the station confirms what arrived. Stock moves
 * into the station's own place only when the station confirms, so the kitchen's stock is counted apart from the store's; what was issued and what was received are both kept, so
 * what went missing on the way is seen. The person who asked does not issue it and the one who issued does not confirm it: the server enforces that and says so in plain words.
 */
@Component({
    selector: 'zp-store-issues',
    imports: [DatePipe, DecimalPipe, FormsModule, DialogComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="flex flex-col gap-4" data-testid="store-issues">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 class="text-2xl font-bold">Store issues</h1>
          <p class="text-sm text-ink/70">A station asks the store for stock; the store hands it over; the station confirms what arrived. Then it is counted in the station's own place.</p>
        </div>
        <button type="button" class="btn-primary" data-testid="issue-new" [disabled]="readOnly() || stationOptions().length === 0" (click)="openAsk()">Ask the store for stock</button>
      </div>
      @if (error()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="issues-error">{{ error() }}</p> }
      @if (readOnly()) { <p class="sys-alert sys-alert-info" role="status">Your subscription is read-only: requests can be seen but not made.</p> }
      @if (!branches.activeId()) { <p class="sys-alert sys-alert-warning" role="status">You are not assigned to a branch yet.</p> }
      @if (!loading() && stationOptions().length === 0) { <p class="sys-alert sys-alert-info" role="status" data-testid="issues-no-station">Your role does not work at a station, so there is nothing to ask for. Stations and who works at them are set up by the owner.</p> }

      <label class="flex items-center gap-2 text-sm"><input type="checkbox" data-testid="issues-show-all" [ngModel]="showAll()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="showAll.set($event); reload()" /> Show finished requests too</label>

      <div class="space-y-3" data-testid="issue-list">
        @for (i of issues(); track i.id) {
          <article class="app-card space-y-2" [attr.data-testid]="'issue-row-' + i.number">
            <header class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="text-lg font-semibold">#{{ i.number }} for the {{ i.stationName }}</h2>
              <span class="app-badge" [class]="badge(i)" [attr.data-testid]="'issue-status-' + i.number">{{ label(i) }}</span>
            </header>
            <p class="text-xs text-ink/70">Asked by {{ i.requestedByName }}, {{ i.requestedAtUtc | date: 'd MMM, HH:mm' }}@if (i.issuedByName) { . Issued by {{ i.issuedByName }} }@if (i.receivedByName) { . Confirmed by {{ i.receivedByName }} }@if (i.note) { . "{{ i.note }}" }@if (i.cancelReason) { . Cancelled: {{ i.cancelReason }} }</p>
            <table class="app-table"><thead><tr><th>Item</th><th class="text-right">Asked</th><th class="text-right">Issued</th><th class="text-right">Arrived</th></tr></thead>
              <tbody>@for (l of i.lines; track l.id) { <tr><td>{{ l.itemName }}</td><td class="text-right">{{ l.requested | number: '1.0-3' }}</td><td class="text-right">{{ l.issued === null ? '' : (l.issued | number: '1.0-3') }}</td>
                <td class="text-right" [class.text-danger]="(l.shortfall ?? 0) > 0">{{ l.received === null ? '' : (l.received | number: '1.0-3') }}@if ((l.shortfall ?? 0) > 0) { <span class="text-xs"> ({{ l.shortfall | number: '1.0-3' }} missing)</span> }</td></tr> }</tbody></table>
            @if (!readOnly()) {
              <div class="flex flex-wrap gap-2">
                @if (i.status === 'Requested') {
                  <button type="button" class="btn-primary" [attr.data-testid]="'issue-open-' + i.number" (click)="openIssue(i)">Hand over</button>
                  <button type="button" class="btn-ghost" [attr.data-testid]="'issue-cancel-' + i.number" (click)="cancelling.set(i)">Cancel</button>
                } @else if (i.status === 'Issued') {
                  <button type="button" class="btn-primary" [attr.data-testid]="'issue-confirm-' + i.number" (click)="openReceive(i)">Confirm what arrived</button>
                }
              </div>
            }
          </article>
        } @empty { <p class="app-card py-8 text-center text-ink/70" data-testid="issues-empty">{{ loading() ? 'Loading...' : 'No requests.' }}</p> }
      </div>
    </div>

    <zp-dialog [open]="!!ask()" title="Ask the store for stock" (closed)="ask.set(null)">
      @if (ask(); as a) {
        <form class="space-y-3" (submit)="$event.preventDefault(); sendAsk()" data-testid="ask-form">
          <div><label class="app-label" for="ask-station">For which station</label>
            <select id="ask-station" class="app-input" data-testid="ask-station" [ngModel]="a.stationId" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchAsk({ stationId: $event })">@for (s of stationOptions(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }</select></div>
          @for (l of a.lines; track $index) {
            <div class="grid grid-cols-[1fr_6rem_auto] items-end gap-2">
              <select class="app-input" aria-label="Item" [attr.data-testid]="'ask-item-' + $index" [ngModel]="l.inventoryItemId" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchAskLine($index, { inventoryItemId: $event })"><option value="">Choose an item</option>@for (i of items(); track i.id) { <option [value]="i.id">{{ i.name }}</option> }</select>
              <input type="number" min="0" step="any" class="app-input" aria-label="Quantity" [attr.data-testid]="'ask-qty-' + $index" [ngModel]="l.quantity" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchAskLine($index, { quantity: +$event })" />
              <button type="button" class="btn-ghost px-2" aria-label="Remove" (click)="removeAskLine($index)">x</button>
            </div>
          }
          <button type="button" class="btn-outline text-sm" data-testid="ask-add" (click)="addAskLine()">Add an item</button>
          <div><label class="app-label" for="ask-note">Note (optional)</label><input id="ask-note" class="app-input" maxlength="500" data-testid="ask-note" [ngModel]="a.note" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchAsk({ note: $event })" /></div>
          @if (dialogError()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="ask-error">{{ dialogError() }}</p> }
          <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="ask.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="ask-send" [disabled]="busy() || validAsk().length === 0 || !a.stationId">{{ busy() ? 'Sending...' : 'Send the request' }}</button></div>
        </form>
      }
    </zp-dialog>

    <zp-dialog [open]="!!issuing()" [title]="issuing() ? 'Hand over #' + issuing()!.number : ''" (closed)="issuing.set(null)">
      @if (issuing(); as w) {
        <form class="space-y-3" (submit)="$event.preventDefault(); sendIssue()" data-testid="issue-form">
          <p class="text-sm text-ink/80">Say how much you are handing over for each line (0 for none), and which store bin it comes from if it is in one.</p>
          @for (l of issueLines(); track l.lineId; let n = $index) {
            <div class="grid grid-cols-[1fr_6rem_9rem] items-end gap-2">
              <div class="text-sm"><strong>{{ l.itemName }}</strong><span class="block text-xs text-ink/70">asked for {{ l.requested | number: '1.0-3' }}</span></div>
              <input type="number" min="0" step="any" class="app-input" aria-label="Issued" [attr.data-testid]="'issue-qty-' + n" [ngModel]="l.issued" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchIssue(n, { issued: +$event })" />
              <select class="app-input" aria-label="From bin" [attr.data-testid]="'issue-bin-' + n" [ngModel]="l.fromBinId" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchIssue(n, { fromBinId: $event || null })"><option [ngValue]="null">Not in a bin</option>@for (b of storeBins(); track b.id) { <option [ngValue]="b.id">{{ b.code }}</option> }</select>
            </div>
          }
          @if (dialogError()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="issue-error">{{ dialogError() }}</p> }
          <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="issuing.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="issue-send" [disabled]="busy()">{{ busy() ? 'Saving...' : 'Hand it over' }}</button></div>
        </form>
      }
    </zp-dialog>

    <zp-dialog [open]="!!receiving()" [title]="receiving() ? 'Confirm #' + receiving()!.number : ''" (closed)="receiving.set(null)">
      @if (receiving()) {
        <form class="space-y-3" (submit)="$event.preventDefault(); sendReceive()" data-testid="receive-form">
          <p class="text-sm text-ink/80">Count what really arrived. If less than was issued, the difference is recorded and the store is told.</p>
          @for (l of receiveLines(); track l.lineId; let n = $index) {
            <div class="grid grid-cols-[1fr_6rem] items-end gap-2">
              <div class="text-sm"><strong>{{ l.itemName }}</strong><span class="block text-xs text-ink/70">issued {{ l.issued | number: '1.0-3' }}</span></div>
              <input type="number" min="0" step="any" class="app-input" aria-label="Arrived" [attr.data-testid]="'receive-qty-' + n" [ngModel]="l.received" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patchReceive(n, +$event)" />
            </div>
          }
          @if (dialogError()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="receive-error">{{ dialogError() }}</p> }
          <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="receiving.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="receive-send" [disabled]="busy()">{{ busy() ? 'Saving...' : 'Confirm' }}</button></div>
        </form>
      }
    </zp-dialog>

    <zp-dialog [open]="!!cancelling()" [title]="cancelling() ? 'Cancel #' + cancelling()!.number : ''" (closed)="cancelling.set(null)">
      <form class="space-y-3" (submit)="$event.preventDefault(); sendCancel()" data-testid="cancel-form">
        <div><label class="app-label" for="cancel-reason">Why</label><input id="cancel-reason" class="app-input" maxlength="300" data-testid="cancel-reason" [ngModel]="cancelReason()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="cancelReason.set($event)" /></div>
        @if (dialogError()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="cancel-error">{{ dialogError() }}</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="cancelling.set(null)">Back</button><button type="submit" class="btn-primary" data-testid="cancel-send" [disabled]="busy() || cancelReason().trim().length < 3">Cancel the request</button></div>
      </form>
    </zp-dialog>
  `
})
export class StoreIssuesComponent {
  private readonly api = inject(KitchenApi);
  private readonly inventory = inject(InventoryApi);
  private readonly binApi = inject(BinApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly stationsService = inject(StationsService);
  protected readonly branches = inject(BranchContextService);

  protected readonly issues = signal<readonly StockIssueDto[]>([]);
  protected readonly items = signal<readonly InventoryItemDto[]>([]);
  protected readonly storeBins = signal<readonly BinDto[]>([]);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly dialogError = signal<string | null>(null);
  protected readonly showAll = signal(false);
  protected readonly ask = signal<{ stationId: string; note: string; lines: AskLine[] } | null>(null);
  protected readonly issuing = signal<StockIssueDto | null>(null);
  protected readonly issueLines = signal<IssueLine[]>([]);
  protected readonly receiving = signal<StockIssueDto | null>(null);
  protected readonly receiveLines = signal<ReceiveLine[]>([]);
  protected readonly cancelling = signal<StockIssueDto | null>(null);
  protected readonly cancelReason = signal('');
  private askId: string | null = null;

  protected readonly readOnly = computed(() => this.auth.accessModeFor(FEATURES.INVENTORY) === 'readonly');
  protected readonly stationOptions = computed(() => this.stationsService.list().filter((s) => s.isActive && s.worksHere));
  protected readonly validAsk = computed(() => (this.ask()?.lines ?? []).filter((l) => l.inventoryItemId && l.quantity > 0));

  constructor() {
    void this.stationsService.load();
    effect(() => { this.branches.activeId(); untracked(() => void this.reload()); }, { allowSignalWrites: true });
  }

  protected label(i: StockIssueDto): string { return ({ Requested: 'Waiting for the store', Issued: 'Issued: confirm what arrived', Received: 'Received', Cancelled: 'Cancelled' } as const)[i.status]; }
  protected badge(i: StockIssueDto): string { return i.status === 'Received' ? 'app-badge-success' : i.status === 'Cancelled' ? '' : 'app-badge-warning'; }

  protected async reload(): Promise<void> {
    const branch = this.branches.activeId();
    if (!branch) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      this.issues.set(await firstValueFrom(this.api.issues(branch, !this.showAll())));
      if (this.items().length === 0) this.items.set((await firstValueFrom(this.inventory.items({ pageSize: 500 }))).items);
      this.storeBins.set((await firstValueFrom(this.binApi.list({ branchId: branch, includeInactive: false }))).filter((b) => !b.stationId && !b.isHighSecurity));
    } catch (err) { this.error.set(toApiError(err).message); } finally { this.loading.set(false); }
  }

  // ---- asking
  protected openAsk(): void { this.dialogError.set(null); this.askId = null; this.ask.set({ stationId: this.stationOptions()[0]?.id ?? '', note: '', lines: [{ inventoryItemId: '', quantity: 0 }] }); }
  protected patchAsk(p: Partial<{ stationId: string; note: string }>): void { this.ask.update((a) => (a ? { ...a, ...p } : a)); }
  protected addAskLine(): void { this.ask.update((a) => (a ? { ...a, lines: [...a.lines, { inventoryItemId: '', quantity: 0 }] } : a)); }
  protected removeAskLine(i: number): void { this.ask.update((a) => (a ? { ...a, lines: a.lines.filter((_, n) => n !== i) } : a)); }
  protected patchAskLine(i: number, p: Partial<AskLine>): void { this.ask.update((a) => (a ? { ...a, lines: a.lines.map((l, n) => (n === i ? { ...l, ...p } : l)) } : a)); }

  protected async sendAsk(): Promise<void> {
    const a = this.ask(); const branch = this.branches.activeId();
    if (!a || !branch || this.busy()) return;
    this.busy.set(true);
    this.dialogError.set(null);
    this.askId ??= crypto.randomUUID();
    try {
      const made = await firstValueFrom(this.api.requestIssue({ id: this.askId, branchId: branch, stationId: a.stationId, note: a.note.trim() || null, lines: this.validAsk().map((l) => ({ ...l })) }));
      this.ask.set(null);
      this.toast.success(`Request #${made.number} sent to the store.`);
      await this.reload();
    } catch (err) { this.dialogError.set(toApiError(err).message); } finally { this.busy.set(false); }
  }

  // ---- issuing
  protected openIssue(i: StockIssueDto): void { this.dialogError.set(null); this.issuing.set(i); this.issueLines.set(i.lines.map((l) => ({ lineId: l.id, itemName: l.itemName, requested: l.requested, issued: l.requested, fromBinId: null }))); }
  protected patchIssue(i: number, p: Partial<IssueLine>): void { this.issueLines.update((l) => l.map((x, n) => (n === i ? { ...x, ...p } : x))); }

  protected async sendIssue(): Promise<void> {
    const w = this.issuing();
    if (!w || this.busy()) return;
    this.busy.set(true);
    this.dialogError.set(null);
    try {
      await firstValueFrom(this.api.issue(w.id, { lines: this.issueLines().map((l) => ({ lineId: l.lineId, issued: l.issued, fromBinId: l.fromBinId })), rowVersion: w.rowVersion }));
      this.issuing.set(null);
      this.toast.success('Handed over. The station is told to confirm what arrived.');
      await this.reload();
    } catch (err) { this.dialogError.set(toApiError(err).message); } finally { this.busy.set(false); }
  }

  // ---- receiving
  protected openReceive(i: StockIssueDto): void { this.dialogError.set(null); this.receiving.set(i); this.receiveLines.set(i.lines.map((l) => ({ lineId: l.id, itemName: l.itemName, issued: l.issued ?? 0, received: l.issued ?? 0 }))); }
  protected patchReceive(i: number, received: number): void { this.receiveLines.update((l) => l.map((x, n) => (n === i ? { ...x, received } : x))); }

  protected async sendReceive(): Promise<void> {
    const w = this.receiving();
    if (!w || this.busy()) return;
    this.busy.set(true);
    this.dialogError.set(null);
    try {
      const done = await firstValueFrom(this.api.receive(w.id, { lines: this.receiveLines().map((l) => ({ lineId: l.lineId, received: l.received })), rowVersion: w.rowVersion }));
      this.receiving.set(null);
      this.toast.success(done.lines.some((l) => (l.shortfall ?? 0) > 0) ? 'Confirmed. What did not arrive is recorded and the store is told.' : 'Confirmed. The stock is in the station\'s place.');
      await this.reload();
    } catch (err) { this.dialogError.set(toApiError(err).message); } finally { this.busy.set(false); }
  }

  // ---- cancelling
  protected async sendCancel(): Promise<void> {
    const w = this.cancelling();
    if (!w || this.busy()) return;
    this.busy.set(true);
    this.dialogError.set(null);
    try {
      await firstValueFrom(this.api.cancelIssue(w.id, this.cancelReason().trim()));
      this.cancelling.set(null);
      this.cancelReason.set('');
      this.toast.success('Request cancelled.');
      await this.reload();
    } catch (err) { this.dialogError.set(toApiError(err).message); } finally { this.busy.set(false); }
  }
}
