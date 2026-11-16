import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { CompanySettingsDto } from '../../core/models/ops.model';
import { toApiError } from '../../core/services/api.util';
import { BarStore } from '../../core/services/bar.services';
import { OperationSettingsApi } from '../../core/services/ops.services';
import { ConfirmService, ToastService } from '../../shared/ui/feedback';

/** Tax, discount approval, payment methods, pour-variance thresholds and demonstration data. Existing bills keep the tax they were opened with. */
@Component({
  selector: 'zp-operations-settings',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-2xl font-bold">Operations settings</h1>
    <p class="mt-1 text-sm text-ink/80">How bills are taxed and paid, and when a stock variance needs attention.</p>
    @if (error()) { <p class="sys-alert sys-alert-danger my-3" role="alert">{{ error() }}</p> }

    @if (s(); as v) {
      <form class="mt-4 space-y-6" (submit)="$event.preventDefault(); save()">
        <section class="app-card space-y-3"><h2 class="font-semibold">Tax</h2>
          <p class="text-sm text-ink/70">One tax applies to every item. Changing it affects new bills only; bills already open keep the rate they started with.</p>
          <div class="grid gap-3 sm:grid-cols-3">
            <div><label class="app-label" for="s-tn">Tax name</label><input id="s-tn" class="app-input" data-testid="tax-name" [ngModel]="v.taxName" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ taxName: $event })" /></div>
            <div><label class="app-label" for="s-tr">Rate (%)</label><input id="s-tr" type="number" min="0" max="100" step="0.01" class="app-input" data-testid="tax-rate" [ngModel]="v.taxRatePercent" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ taxRatePercent: +$event })" /></div>
            <div class="flex items-end"><label class="flex items-center gap-2 text-sm"><input type="checkbox" data-testid="tax-inclusive" [checked]="v.taxInclusive" (change)="patch({ taxInclusive: !v.taxInclusive })" /> Prices already include tax</label></div>
          </div></section>

        <section class="app-card space-y-3"><h2 class="font-semibold">Discounts and payments</h2>
          <div class="max-w-xs"><label class="app-label" for="s-da">Discount needing manager approval above (%)</label><input id="s-da" type="number" min="0" max="100" class="app-input" data-testid="discount-threshold" [ngModel]="v.discountApprovalPercent" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ discountApprovalPercent: +$event })" />
            <p class="mt-1 text-xs text-ink/70">0 means staff with the discount permission can give any discount.</p></div>
          <div class="flex flex-wrap gap-4 text-sm">
            <label class="flex items-center gap-2"><input type="checkbox" [checked]="v.allowCashPayments" (change)="patch({ allowCashPayments: !v.allowCashPayments })" /> Cash</label>
            <label class="flex items-center gap-2"><input type="checkbox" [checked]="v.allowCardPayments" (change)="patch({ allowCardPayments: !v.allowCardPayments })" /> Card</label>
            <label class="flex items-center gap-2"><input type="checkbox" [checked]="v.allowTransferPayments" (change)="patch({ allowTransferPayments: !v.allowTransferPayments })" /> Bank transfer</label></div>
          @if (v.paymentProviderIsDemo) { <p class="sys-alert sys-alert-warning" role="status" data-testid="provider-note">Card and transfer payments use a <strong>development stub</strong>: no real money moves. A real payment provider must be connected before taking real card payments.</p> }
          @else { <p class="text-sm">Payment provider: {{ v.paymentProvider }}</p> }
        </section>

        @if (v) { <!-- offered to every kind of business since 2026-11-14 -->
          <section class="app-card space-y-2" data-testid="bar-man-section"><h2 class="font-semibold">Preparation stations (bar man method and kitchen)</h2>
            <label class="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" class="mt-1" data-testid="bar-man-enabled" [checked]="v.barManMethodEnabled" (change)="patch({ barManMethodEnabled: !v.barManMethodEnabled })" />
              <span>Send orders to preparation stations (the bar, the kitchen), where staff prepare them and tell the attendant when they are ready</span></label>
            <ul class="list-disc space-y-1 pl-6 text-sm text-ink/80">
              <li>When an attendant presses Send, staff with the "bar man" permission at that branch get the order on their device, with the table and who asked.</li>
              <li>When the bar man marks it ready, the attendant who sent it gets a bell, a sound and a prompt on whatever screen they are on, and taps Collected when they pick it up. They then take payment as usual.</li>
              <li>The Bartender role prepares orders and does not sell. A bartender who should also sell is given the selling rights, or the Cashier role, on the Staff screen.</li>
              <li>Each station says whether the bill waits for it and when stock leaves: a bar usually holds payment and takes stock when ready, a kitchen usually neither. Set them up under Admin &gt; Set-up &gt; Preparation Stations, and give each stock group its station.</li>
              <li>Bar orders need a connection: an order sent while a device is offline reaches the bar when that device is back online.</li>
              <li>It cannot be switched off while orders are still waiting at the bar.</li>
            </ul>
            @if (fe()['barManMethodEnabled']) { <p class="app-error" role="alert" data-testid="bar-man-error">{{ fe()['barManMethodEnabled'] }}</p> }
          </section>
        }

        <section class="app-card space-y-3" data-testid="loyalty-section"><h2 class="font-semibold">Spending loyalty points</h2>
          <p class="text-sm text-ink/80">Customers earn points on what they buy. Here you say what a point is worth when they spend it as money off a bill. At the till the customer allows it with their own four-digit code, or a supervisor does with their PIN. Leave the value at 0 to keep points from being spent.</p>
          <div class="grid gap-3 sm:grid-cols-3">
            <div><label class="app-label" for="s-pv">One point is worth ({{ v.currencyCode }})</label><input id="s-pv" type="number" min="0" step="0.0001" class="app-input" data-testid="loyalty-value" [ngModel]="v.pointValue ?? 0" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ pointValue: +$event })" />
              <p class="mt-1 text-xs text-ink/70">0 means points cannot be spent.</p></div>
            <div><label class="app-label" for="s-pm">Least that can be spent at once (points)</label><input id="s-pm" type="number" min="0" step="1" class="app-input" data-testid="loyalty-least" [ngModel]="v.minRedeemPoints ?? 0" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ minRedeemPoints: +$event })" /></div>
            <div><label class="app-label" for="s-pp">Most of a bill points may pay (%)</label><input id="s-pp" type="number" min="1" max="100" step="1" class="app-input" data-testid="loyalty-most" [ngModel]="v.maxRedeemPercent ?? 100" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ maxRedeemPercent: +$event })" /></div>
          </div>
          <p class="text-xs text-ink/70">Points are only a way to pay if your plan includes Loyalty and gift cards. Points cannot be spent while a till is offline.</p>
        </section>

        <section class="app-card space-y-3" data-testid="giftcard-section"><h2 class="font-semibold">Gift cards</h2>
          <p class="text-sm text-ink/80">Gift cards are sold at the till and spent at any branch, in one go or in parts. The money for a card is owed to its holder until it is spent. Say how long a card lasts from the day it is sold.</p>
          <div class="max-w-xs"><label class="app-label" for="s-gcm">A card lasts (months)</label><input id="s-gcm" type="number" min="0" max="120" step="1" class="app-input" data-testid="giftcard-months" [ngModel]="v.giftCardExpiryMonths ?? 0" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ giftCardExpiryMonths: +$event })" />
            <p class="mt-1 text-xs text-ink/70">0 means a card never expires. A card that has expired is kept on record and reported, never deleted. Cards already sold keep the date they were sold with.</p></div>
        </section>

        <section class="app-card space-y-3" data-testid="layby-section"><h2 class="font-semibold">Layby</h2>
          <p class="text-sm text-ink/80">A customer reserves goods, pays in parts and collects when everything is paid. These rules apply to laybys started from now on.</p>
          <div class="grid gap-3 sm:grid-cols-3">
            <div><label class="app-label" for="s-lb-dep">Least first payment (% of the total)</label><input id="s-lb-dep" type="number" min="0" max="100" step="0.01" class="app-input" data-testid="layby-deposit" [ngModel]="v.laybyMinDepositPercent" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ laybyMinDepositPercent: +$event })" /></div>
            <div><label class="app-label" for="s-lb-days">Days to pay it off</label><input id="s-lb-days" type="number" min="1" max="3650" class="app-input" data-testid="layby-days" [ngModel]="v.laybyDays" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ laybyDays: +$event })" />
              <p class="mt-1 text-xs text-ink/70">Overdue laybys are flagged, never cancelled by themselves.</p></div>
            <div><label class="app-label" for="s-lb-fee">Kept on cancelling (% of what was paid)</label><input id="s-lb-fee" type="number" min="0" max="100" step="0.01" class="app-input" data-testid="layby-fee" [ngModel]="v.laybyCancelFeePercent" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ laybyCancelFeePercent: +$event })" />
              <p class="mt-1 text-xs text-ink/70">0 gives everything back.</p></div>
          </div>
        </section>

        <section class="app-card space-y-3" data-testid="controls-section"><h2 class="font-semibold">Shifts, adjustments and expiry</h2>
          <div class="grid gap-3 sm:grid-cols-2">
            <div><label class="app-label" for="s-cv">Till difference that needs a supervisor ({{ v.currencyCode }})</label><input id="s-cv" type="number" min="0" step="0.01" class="app-input" data-testid="shift-tolerance" [ngModel]="v.cashVarianceReviewThreshold" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ cashVarianceReviewThreshold: +$event })" />
              <p class="mt-1 text-xs text-ink/70">A closed shift off by more than this waits for review. 0 means any difference.</p></div>
            <div><label class="app-label" for="s-ex">"Expiring soon" means within (days)</label><input id="s-ex" type="number" min="1" max="730" class="app-input" data-testid="expiry-days" [ngModel]="v.expiryWarningDays" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ expiryWarningDays: +$event })" /></div>
          </div>
          <label class="flex items-start gap-2 text-sm"><input type="checkbox" class="mt-1" data-testid="branch-prices" [checked]="!!v.branchManagersMaySetPrices" (change)="patch({ branchManagersMaySetPrices: !v.branchManagersMaySetPrices })" /> <span>Branch managers may set their own branch's prices and what it sells. Off: only head office does (Stock &gt; Set-up &gt; Prices and Menus).</span></label>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" data-testid="require-shift" [checked]="v.requireOpenShiftToSell" (change)="patch({ requireOpenShiftToSell: !v.requireOpenShiftToSell })" /> Staff must start a shift before taking payments (never blocks a sale already made offline)</label>
          <div class="space-y-2">
            <label class="flex items-center gap-2 text-sm"><input type="checkbox" data-testid="adjust-approval" [checked]="v.adjustmentApprovalAboveValue !== null" (change)="patch({ adjustmentApprovalAboveValue: v.adjustmentApprovalAboveValue === null ? 0 : null })" /> Stock adjustments above a value need approval by someone else</label>
            @if (v.adjustmentApprovalAboveValue !== null) {
              <div class="max-w-xs"><label class="app-label" for="s-aa">Approval needed above ({{ v.currencyCode }})</label><input id="s-aa" type="number" min="0" step="0.01" class="app-input" data-testid="adjust-threshold" [ngModel]="v.adjustmentApprovalAboveValue" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ adjustmentApprovalAboveValue: +$event })" />
                <p class="mt-1 text-xs text-ink/70">Value = quantity x cost. 0 means every adjustment needs approval.</p></div>
            }
          </div>
        </section>

        <section class="app-card space-y-3"><h2 class="font-semibold">Pour variance thresholds (percent of expected stock)</h2>
          <div class="grid gap-3 sm:grid-cols-3">
            <div><label class="app-label" for="s-w">Warning from</label><input id="s-w" type="number" min="0" class="app-input" data-testid="var-warn" [ngModel]="v.varianceWarnPercent" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ varianceWarnPercent: +$event })" /></div>
            <div><label class="app-label" for="s-i">Investigate from</label><input id="s-i" type="number" min="0" class="app-input" data-testid="var-investigate" [ngModel]="v.varianceInvestigatePercent" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ varianceInvestigatePercent: +$event })" /></div>
            <div><label class="app-label" for="s-e">Escalate from</label><input id="s-e" type="number" min="0" class="app-input" data-testid="var-escalate" [ngModel]="v.varianceEscalatePercent" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ varianceEscalatePercent: +$event })" /></div>
          </div>
          @if (fe()['varianceWarnPercent']) { <p class="app-error" role="alert" data-testid="var-error">{{ fe()['varianceWarnPercent'] }}</p> }</section>

        <div class="flex items-center gap-3"><button type="submit" class="btn-primary" data-testid="settings-save" [disabled]="saving()">Save settings</button><span class="text-sm text-ink/70" role="status" data-testid="settings-msg">{{ msg() }}</span></div>
      </form>

      <section class="app-card mt-8 space-y-2"><h2 class="font-semibold">Demonstration data</h2>
        <p class="text-sm text-ink/80">Loads clearly labelled sample products, stock and a supplier so you can try the POS. Everything is named "Demo" and can be removed in one click.</p>
        <div class="flex gap-2"><button type="button" class="btn-outline" data-testid="seed-demo" (click)="seed()">Load demonstration data</button><button type="button" class="btn-outline" data-testid="clear-demo" (click)="clear()">Remove demonstration data</button></div>
        @if (demoMsg()) { <p class="text-sm" role="status" data-testid="demo-msg">{{ demoMsg() }}</p> }</section>
    } @else { <p class="mt-4 text-ink/70">Loading...</p> }
  `
})
export class OperationsSettingsComponent implements OnInit {
  private readonly api = inject(OperationSettingsApi);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly bar = inject(BarStore);

  protected readonly s = signal<CompanySettingsDto | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly msg = signal('');
  protected readonly demoMsg = signal('');
  protected readonly fe = signal<Readonly<Record<string, string>>>({});

  async ngOnInit(): Promise<void> {
    try { this.s.set(await firstValueFrom(this.api.get())); } catch (err) { this.error.set(toApiError(err).message); }
  }

  protected patch(p: Partial<CompanySettingsDto>): void { this.s.update((v) => (v ? { ...v, ...p } : v)); }

  protected async save(): Promise<void> {
    const v = this.s();
    if (!v) return;
    this.saving.set(true);
    this.fe.set({});
    this.msg.set('');
    try {
      const saved = await firstValueFrom(this.api.update(v));
      this.s.set(saved);
      this.bar.setEnabled(saved.barManMethodEnabled); // this device follows the switch at once; others pick it up when they next open the app
      this.msg.set('Saved.');
      this.toast.success('Settings saved.');
    } catch (err) {
      const e = toApiError(err);
      this.fe.set(Object.fromEntries(Object.entries(e.fieldErrors).map(([k, x]) => [k, x[0] ?? ''])));
      this.msg.set(e.message);
    } finally { this.saving.set(false); }
  }

  protected async seed(): Promise<void> {
    try { this.demoMsg.set(await firstValueFrom(this.api.seedDemo())); } catch (err) { this.demoMsg.set(toApiError(err).message); }
  }

  protected async clear(): Promise<void> {
    if (!(await this.confirm.ask({ title: 'Remove demonstration data?', message: 'The sample products, stock items and supplier will be removed. Real bills and stock history are not touched.', confirmLabel: 'Remove', danger: true }))) return;
    try { this.demoMsg.set(`${await firstValueFrom(this.api.clearDemo())} demonstration record(s) removed.`); } catch (err) { this.demoMsg.set(toApiError(err).message); }
  }
}
