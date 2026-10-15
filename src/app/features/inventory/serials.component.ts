import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ReportRow, SerialStatus } from '../../core/models/nav-ops.model';
import { FEATURES, SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { InventoryItemDto } from '../../core/models/ops.model';
import { ReportDefinition } from '../../core/navigation/report-definitions';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { BranchContextService } from '../../core/services/branch-context.service';
import { StockExtrasApi } from '../../core/services/nav-ops.services';
import { InventoryApi } from '../../core/services/ops.services';
import { DialogComponent, ToastService } from '../../shared/ui/feedback';
import { ReportViewComponent } from '../reports/report-view.component';

/** The lifecycle the server allows. The UI only offers the next steps that are legal; the server refuses the rest. */
const NEXT: Record<SerialStatus, readonly SerialStatus[]> = {
  InStock: ['Sold', 'Damaged', 'Dispatched'], Sold: ['Returned'], Dispatched: ['Returned'], Returned: ['InStock', 'Damaged'], Damaged: []
};

/**
 * Serial numbers: the report of every serial-tracked unit, plus registering serials and moving a unit through its lifecycle
 * (in stock, sold, dispatched, returned, damaged) or to another branch. Serials are required at receipt; they are never generated.
 */
@Component({
  selector: 'zp-serials',
  standalone: true,
  imports: [FormsModule, ReportViewComponent, DialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <zp-report-view #view [definition]="definition" title="Serial Numbers Report" description="Every serial-tracked unit, where it is and what happened to it." [rowActions]="canAct() ? actions : null" />

    @if (canRegister()) { <div class="no-print mt-4"><button type="button" class="btn-outline" data-testid="serial-register" [disabled]="readOnly()" (click)="openRegister()">Register serial numbers</button></div> }

    <ng-template #actions let-row>
      @if (next(row).length > 0 && !readOnly()) { <button type="button" class="btn-outline px-2 py-1 text-sm" [attr.data-testid]="'serial-act-' + row['serial']" (click)="openStatus(row)">Change status</button> }
    </ng-template>

    <zp-dialog [open]="dialog() === 'register'" title="Register serial numbers" (closed)="dialog.set(null)">
      <form class="space-y-3" (submit)="$event.preventDefault(); register()">
        <p class="text-sm text-ink/80">For serial-tracked items only. This records the numbers; it does not change the stock quantity (use a goods receipt for new stock, which asks for the serials itself).</p>
        <div><label class="app-label" for="sr-item">Item</label><select id="sr-item" class="app-input" data-testid="serial-item" [ngModel]="regItem()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="regItem.set($event)"><option value="">Choose an item...</option>@for (i of serialItems(); track i.id) { <option [value]="i.id">{{ i.name }}</option> }</select>
          @if (serialItems().length === 0) { <p class="mt-1 text-xs text-ink/70">No item has serial tracking switched on. Turn it on in Add / Modify Stock.</p> }</div>
        <div><label class="app-label" for="sr-list">Serial numbers (one per line)</label><textarea id="sr-list" rows="5" class="app-input font-mono" data-testid="serial-list" [ngModel]="regList()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="regList.set($event)"></textarea>
          <p class="mt-1 text-xs text-ink/70">{{ regCount() }} serial number(s).</p></div>
        <div><label class="app-label" for="sr-warranty">Warranty until (optional)</label><input id="sr-warranty" type="date" class="app-input" [ngModel]="regWarranty()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="regWarranty.set($event)" /></div>
        @if (dialogError()) { <p class="sys-alert sys-alert-danger" role="alert">{{ dialogError() }}</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="serial-register-save" [disabled]="busy() || !regItem() || regCount() === 0">Register</button></div>
      </form>
    </zp-dialog>

    <zp-dialog [open]="dialog() === 'status'" [title]="'Serial ' + (target()?.['serial'] ?? '')" (closed)="dialog.set(null)">
      @if (target(); as t) {
        <form class="space-y-3" (submit)="$event.preventDefault(); changeStatus()">
          <p class="text-sm">Now: <strong>{{ t['status'] }}</strong> at {{ t['branch'] }}.</p>
          <div><label class="app-label" for="ss-status">Change to</label><select id="ss-status" class="app-input" data-testid="serial-status" [ngModel]="newStatus()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="newStatus.set($event)">@for (s of next(t); track s) { <option [value]="s">{{ s === 'InStock' ? 'In stock' : s }}</option> }</select></div>
          @if (newStatus() === 'Sold' || newStatus() === 'Dispatched') { <div><label class="app-label" for="ss-ref">{{ newStatus() === 'Sold' ? 'Sale reference' : 'Dispatch reference' }}</label><input id="ss-ref" class="app-input" maxlength="100" data-testid="serial-reference" [ngModel]="reference()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="reference.set($event)" /></div> }
          <div><label class="app-label" for="ss-note">Note</label><input id="ss-note" class="app-input" maxlength="300" [ngModel]="note()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="note.set($event)" /></div>
          @if (dialogError()) { <p class="sys-alert sys-alert-danger" role="alert">{{ dialogError() }}</p> }
          <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="serial-status-save" [disabled]="busy()">Save</button></div>
        </form>
      }
    </zp-dialog>
  `
})
export class SerialsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly extras = inject(StockExtrasApi);
  private readonly inventory = inject(InventoryApi);
  private readonly toast = inject(ToastService);
  private readonly branches = inject(BranchContextService);
  private readonly view = viewChild.required<ReportViewComponent>('view');

  protected readonly definition = this.route.snapshot.data['report'] as ReportDefinition;
  protected readonly dialog = signal<'register' | 'status' | null>(null);
  protected readonly items = signal<readonly InventoryItemDto[]>([]);
  protected readonly target = signal<ReportRow | null>(null);
  protected readonly busy = signal(false);
  protected readonly dialogError = signal<string | null>(null);
  protected readonly regItem = signal('');
  protected readonly regList = signal('');
  protected readonly regWarranty = signal('');
  protected readonly newStatus = signal<SerialStatus>('Sold');
  protected readonly reference = signal('');
  protected readonly note = signal('');

  protected readonly readOnly = computed(() => this.auth.accessModeFor(FEATURES.INVENTORY) === 'readonly');
  protected readonly canAct = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.INVENTORY_STOCK_ADJUST));
  protected readonly canRegister = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.INVENTORY_ITEMS_MANAGE));
  protected readonly serialItems = computed(() => this.items().filter((i) => i.tracksSerials && i.isActive));
  protected readonly regCount = computed(() => this.parse().length);

  ngOnInit(): void {
    void this.branches.load();
    if (this.canRegister()) void firstValueFrom(this.inventory.items({ pageSize: 500, active: true })).then((p) => this.items.set(p.items)).catch(() => undefined);
  }

  protected next(row: ReportRow): readonly SerialStatus[] { return NEXT[row['status'] as SerialStatus] ?? []; }

  private parse(): string[] { return [...new Set(this.regList().split(/\r?\n/).map((s) => s.trim()).filter(Boolean))]; }

  protected openRegister(): void {
    this.regItem.set(''); this.regList.set(''); this.regWarranty.set(''); this.dialogError.set(null);
    this.dialog.set('register');
  }

  protected async register(): Promise<void> {
    const branchId = this.branches.activeId();
    if (!branchId) { this.dialogError.set('Choose a branch first (the branch picker is on the Inventory screen).'); return; }
    this.busy.set(true);
    this.dialogError.set(null);
    try {
      await firstValueFrom(this.extras.registerSerials({ inventoryItemId: this.regItem(), branchId, serials: this.parse(), warrantyExpiresOn: this.regWarranty() || null }));
      this.dialog.set(null);
      this.toast.success('Serial numbers registered.');
      await this.view().load();
    } catch (err) { this.dialogError.set(toApiError(err).message); } finally { this.busy.set(false); }
  }

  protected openStatus(row: ReportRow): void {
    this.target.set(row);
    this.newStatus.set(this.next(row)[0] ?? 'Sold');
    this.reference.set(''); this.note.set(''); this.dialogError.set(null);
    this.dialog.set('status');
  }

  protected async changeStatus(): Promise<void> {
    const t = this.target();
    if (!t) return;
    this.busy.set(true);
    this.dialogError.set(null);
    try {
      await firstValueFrom(this.extras.serialStatus(String(t['serialId']), { status: this.newStatus(), reference: this.reference().trim() || null, transferToBranchId: null, note: this.note().trim() || null }));
      this.dialog.set(null);
      this.toast.success('Serial number updated.');
      await this.view().load();
    } catch (err) { this.dialogError.set(toApiError(err).message); } finally { this.busy.set(false); }
  }
}
