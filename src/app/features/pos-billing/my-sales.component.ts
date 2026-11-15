import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ReportRow } from '../../core/models/nav-ops.model';
import { ReceiptDto } from '../../core/models/ops.model';
import { SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { REPORTS } from '../../core/navigation/report-definitions';
import { printReceipt } from '../../core/receipt/receipt-render';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { OrdersApi } from '../../core/services/ops.services';
import { DialogComponent } from '../../shared/ui/feedback';
import { ReceiptShareComponent, ReceiptViewComponent } from '../../shared/ui/receipt.components';
import { ReportViewComponent } from '../reports/report-view.component';

/**
 * My Sales (owner's rule, 2026-11-15): the bills the signed-in person served or took a payment on, with filters, their totals, and each
 * bill's receipt to show, print or send to the customer. A person sees only their own; someone who may see everyone's sales
 * (supervisors and above) also gets a staff picker. The server decides both: this screen only asks.
 */
@Component({
  selector: 'zp-my-sales',
  standalone: true,
  imports: [ReportViewComponent, DialogComponent, ReceiptViewComponent, ReceiptShareComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div data-testid="my-sales">
      <zp-report-view [definition]="definition()" title="My Sales" [description]="description()" [rowActions]="actions" />
    </div>

    <ng-template #actions let-row>
      <button type="button" class="btn-outline px-2 py-1 text-sm" [attr.data-testid]="'sale-receipt-' + row['bill']" (click)="open(row)">Receipt</button>
    </ng-template>

    <!-- The bill's receipt: shown, then printed by itself or sent to the customer -->
    <zp-dialog [open]="opened()" [title]="'Receipt for bill ' + (bill() ?? '')" [wide]="true" (closed)="opened.set(false)">
      @if (receipt(); as r) {
        <div class="grid gap-4 md:grid-cols-[20rem_minmax(0,1fr)]" data-testid="sale-receipt">
          <zp-receipt-view [receipt]="r" />
          <zp-receipt-share [receipt]="r" [showPrint]="canPrint()" (print)="reprint()" />
        </div>
        @if (error()) { <p class="sys-alert sys-alert-danger mt-2" role="alert">{{ error() }}</p> }
      } @else { <p class="text-ink/70" [attr.role]="error() ? 'alert' : 'status'" data-testid="sale-receipt-wait">{{ error() ?? 'Loading...' }}</p> }
    </zp-dialog>
  `
})
export class MySalesComponent {
  private readonly auth = inject(AuthService);
  private readonly orders = inject(OrdersApi);

  private readonly seesAll = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.POS_SALES_VIEW_ALL));
  /** The staff picker is offered only to people who may see everyone's sales; the server refuses anyone else who asks. */
  protected readonly definition = computed(() => (this.seesAll() ? REPORTS.mySalesAll : REPORTS.mySales));
  protected readonly description = computed(() => this.seesAll()
    ? 'The bills you served or took payment on. Choose a staff member to see theirs. Open a bill to show, print or send its receipt.'
    : 'The bills you served or took payment on. Only you and your supervisors can see them. Open a bill to show, print or send its receipt.');
  /** Printing again is counted on the receipt, and is for people who take payments. */
  protected readonly canPrint = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.POS_PAYMENT_PROCESS));

  protected readonly opened = signal(false);
  protected readonly bill = signal<string | null>(null);
  protected readonly receipt = signal<ReceiptDto | null>(null);
  protected readonly error = signal<string | null>(null);
  private orderId: string | null = null;

  protected async open(row: ReportRow): Promise<void> {
    const id = row['orderId'];
    if (typeof id !== 'string') return;
    this.orderId = id;
    this.bill.set(String(row['bill'] ?? ''));
    this.receipt.set(null);
    this.error.set(null);
    this.opened.set(true);
    try { this.receipt.set(await firstValueFrom(this.orders.receipt(id))); }
    catch (err) { this.error.set(toApiError(err).message); }
  }

  protected async reprint(): Promise<void> {
    if (!this.orderId) return;
    try {
      const printed = await firstValueFrom(this.orders.reprint(this.orderId));
      this.receipt.set(printed);
      printReceipt(printed);   // the receipt by itself, not the screen around it
    } catch (err) { this.error.set(toApiError(err).message); }
  }
}
