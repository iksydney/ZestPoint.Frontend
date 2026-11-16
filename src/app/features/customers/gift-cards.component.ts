import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { GiftCardDto, GiftCardListDto, GiftCardState, IssuedGiftCardDto } from '../../core/models/gift-card.model';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { GiftCardsApi } from '../../core/services/gift-cards.service';
import { DialogComponent, ToastService } from '../../shared/ui/feedback';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';
import { GiftCardIssuedComponent } from './gift-card-issued.component';

const PAGE = 25;

/**
 * Gift Cards, for a manager: every card sold with what is left on it, what the business owes the holders of cards that can still be used, what has expired (reported, never
 * deleted), and a lost card cancelled with its balance issued again on a new card. A card's code is never shown here: only its last four characters. The new card's code is
 * shown once, when it is issued.
 */
@Component({
  selector: 'zp-gift-cards',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, FormsModule, DialogComponent, StatusBadgeComponent, GiftCardIssuedComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-3">
      <h1 class="text-2xl font-bold" data-testid="gc-title">Gift Cards</h1>
      <p class="mt-1 max-w-3xl text-sm text-ink/80">Cards are sold at the till and spent at any branch. The money for a card is owed to whoever holds it until it is spent, so a card sold is not a sale: spending it is. A card's code is shown only when it is issued; here you see its last four characters.</p>
    </div>

    @if (error()) { <div class="sys-alert sys-alert-danger mb-3" role="alert" data-testid="gc-error">{{ error() }}</div> }

    @if (data(); as d) {
      <div class="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="gc-summary">
        <div class="app-card"><p class="text-xs font-medium uppercase tracking-wide text-ink/70">Sold</p><p class="mt-1 text-xl font-bold" data-testid="gc-sold">{{ d.summary.soldValue | currency: d.summary.currencyCode : 'symbol-narrow' : '1.2-2' }}</p><p class="text-xs text-ink/70">{{ d.summary.soldCount }} cards</p></div>
        <div class="app-card"><p class="text-xs font-medium uppercase tracking-wide text-ink/70">Spent</p><p class="mt-1 text-xl font-bold" data-testid="gc-spent">{{ d.summary.spentValue | currency: d.summary.currencyCode : 'symbol-narrow' : '1.2-2' }}</p><p class="text-xs text-ink/70">less what was refunded onto cards</p></div>
        <div class="app-card"><p class="text-xs font-medium uppercase tracking-wide text-ink/70">Owed to holders</p><p class="mt-1 text-xl font-bold" data-testid="gc-outstanding">{{ d.summary.outstanding | currency: d.summary.currencyCode : 'symbol-narrow' : '1.2-2' }}</p><p class="text-xs text-ink/70">{{ d.summary.activeCount }} cards that can be used</p></div>
        <div class="app-card"><p class="text-xs font-medium uppercase tracking-wide text-ink/70">Expired, not spent</p><p class="mt-1 text-xl font-bold" data-testid="gc-expired">{{ d.summary.expiredBalance | currency: d.summary.currencyCode : 'symbol-narrow' : '1.2-2' }}</p><p class="text-xs text-ink/70">{{ d.summary.expiredCount }} cards, kept on record</p></div>
      </div>
    }

    <form class="app-card mb-4 flex flex-wrap items-end gap-3" (submit)="$event.preventDefault(); apply()" aria-label="Find cards">
      <div><label class="app-label" for="gc-state">Show</label>
        <select id="gc-state" class="app-input" data-testid="gc-state" (change)="state.set($any($event.target).value)">
          <option value="all" [selected]="state() === 'all'">All cards</option><option value="active" [selected]="state() === 'active'">In use</option><option value="expired" [selected]="state() === 'expired'">Expired</option>
          <option value="used" [selected]="state() === 'used'">Nothing left</option><option value="cancelled" [selected]="state() === 'cancelled'">Cancelled</option></select></div>
      <div class="min-w-[14rem] flex-1"><label class="app-label" for="gc-search">Find</label><input id="gc-search" class="app-input" data-testid="gc-search" placeholder="Number, last four characters, name, phone or e-mail" [ngModel]="search()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="search.set($event)" /></div>
      <button type="submit" class="btn-primary" data-testid="gc-apply" [disabled]="loading()">Apply</button>
    </form>

    <section class="app-card p-0" aria-label="Cards">
      <div class="overflow-x-auto">
        <table class="app-table" data-testid="gc-table">
          <caption class="sr-only">Gift cards</caption>
          <thead><tr><th>No.</th><th>Ends</th><th>For</th><th>Sold</th><th class="text-right">Worth</th><th class="text-right">Left</th><th>State</th><th>Valid until</th><th><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>
            @for (c of cards(); track c.id) {
              <tr [attr.data-testid]="'gc-row-' + c.number">
                <td>{{ c.number }}</td>
                <td class="font-mono">{{ c.last4 }}</td>
                <td>{{ c.recipientName || '-' }}@if (c.recipientEmail) { <span class="block text-xs text-ink/70">{{ c.recipientEmail }}</span> }</td>
                <td>{{ c.soldAtUtc | date: 'medium' }}@if (c.soldOnOrderNumber) { <span class="block text-xs text-ink/70">bill #{{ c.soldOnOrderNumber }}, {{ c.soldByName ?? 'someone' }}, {{ c.branchName ?? '' }}</span> }</td>
                <td class="text-right">{{ c.amount | currency: c.currencyCode : 'symbol-narrow' : '1.2-2' }}</td>
                <td class="text-right font-semibold" [attr.data-testid]="'gc-left-' + c.number">{{ c.balance | currency: c.currencyCode : 'symbol-narrow' : '1.2-2' }}</td>
                <td><zp-status-badge [tone]="tone(c.state)"><span [attr.data-testid]="'gc-status-' + c.number">{{ label(c.state) }}</span></zp-status-badge>
                  @if (c.replacedByNumber) { <span class="block text-xs text-ink/70">replaced by card {{ c.replacedByNumber }}</span> }
                  @if (c.replacesNumber) { <span class="block text-xs text-ink/70">replaces card {{ c.replacesNumber }}</span> }</td>
                <td>{{ c.expiresAtUtc ? (c.expiresAtUtc | date: 'mediumDate') : 'Never' }}</td>
                <td class="whitespace-nowrap text-right">
                  <button type="button" class="btn-ghost px-2 py-1 text-sm" [attr.data-testid]="'gc-view-' + c.number" (click)="view(c)">History</button>
                  @if ((c.state === 'Active' || c.state === 'Expired') && c.balance > 0) { <button type="button" class="btn-outline px-2 py-1 text-sm" [attr.data-testid]="'gc-cancel-' + c.number" (click)="startCancel(c)">Cancel and reissue</button> }
                </td>
              </tr>
            } @empty { <tr><td colspan="9" class="py-6 text-center text-ink/70" data-testid="gc-none">{{ loading() ? 'Loading...' : 'No gift cards here yet.' }}</td></tr> }
          </tbody>
        </table>
      </div>
      @if (total() > pageSize) {
        <div class="flex items-center justify-between gap-2 border-t border-ink/10 p-3 text-sm">
          <span>{{ total() }} cards</span>
          <span class="flex gap-2"><button type="button" class="btn-outline px-2 py-1" [disabled]="page() <= 1 || loading()" (click)="go(page() - 1)">Previous</button><button type="button" class="btn-outline px-2 py-1" [disabled]="page() * pageSize >= total() || loading()" (click)="go(page() + 1)">Next</button></span>
        </div>
      }
    </section>

    <!-- History of one card -->
    <zp-dialog [open]="dialog() === 'history'" [title]="'Gift card ' + (viewing()?.number ?? '')" [wide]="true" (closed)="dialog.set(null)">
      @if (viewing(); as v) {
        <dl class="mb-3 grid gap-2 text-sm sm:grid-cols-3">
          <div><dt class="text-ink/70">Ends</dt><dd class="font-mono">{{ v.last4 }}</dd></div>
          <div><dt class="text-ink/70">Worth</dt><dd>{{ v.amount | currency: v.currencyCode : 'symbol-narrow' : '1.2-2' }}</dd></div>
          <div><dt class="text-ink/70">Left</dt><dd class="font-bold" data-testid="gc-history-left">{{ v.balance | currency: v.currencyCode : 'symbol-narrow' : '1.2-2' }}</dd></div>
          @if (v.cancelReason) { <div class="sm:col-span-3"><dt class="text-ink/70">Cancelled{{ v.cancelledByName ? ' by ' + v.cancelledByName : '' }}</dt><dd>{{ v.cancelReason }}</dd></div> }
        </dl>
        <table class="app-table" data-testid="gc-history">
          <thead><tr><th>When</th><th>What</th><th>Bill</th><th>By</th><th class="text-right">Amount</th></tr></thead>
          <tbody>
            @for (h of v.history; track $index) {
              <tr><td>{{ h.occurredAtUtc | date: 'medium' }}</td><td>{{ kindLabel(h.kind) }}{{ h.reason ? ': ' + h.reason : '' }}</td><td>{{ h.orderNumber ? '#' + h.orderNumber : '' }}</td><td>{{ h.byName ?? '' }}</td>
                <td class="text-right font-mono">{{ h.amount | currency: v.currencyCode : 'symbol-narrow' : '1.2-2' }}</td></tr>
            }
          </tbody>
        </table>
      } @else { <p class="text-ink/70">Loading...</p> }
    </zp-dialog>

    <!-- Cancel and reissue -->
    <zp-dialog [open]="dialog() === 'cancel'" [title]="'Cancel card ' + (target()?.number ?? '')" (closed)="dialog.set(null)">
      @if (target(); as c) {
        <form class="space-y-3" (submit)="$event.preventDefault(); confirmCancel()" data-testid="gc-cancel-form">
          <p class="text-sm">Card {{ c.number }} (ends {{ c.last4 }}) has {{ c.balance | currency: c.currencyCode : 'symbol-narrow' : '1.2-2' }} left. It will be cancelled, so its code stops working, and that balance will be issued again on a new card with a new code, shown once. This is on record with your name and the reason.</p>
          <div><label class="app-label" for="gc-reason">Why is it being cancelled?</label><input id="gc-reason" class="app-input" maxlength="300" data-testid="gc-reason" [ngModel]="reason()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="reason.set($event)" placeholder="For example: lost, stolen, sent to the wrong person" /></div>
          @if (cancelError()) { <p class="app-error" role="alert" data-testid="gc-cancel-error">{{ cancelError() }}</p> }
          <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Keep the card</button><button type="submit" class="btn-primary" data-testid="gc-cancel-confirm" [disabled]="busy() || reason().trim().length < 3">{{ busy() ? 'Working...' : 'Cancel it and issue a new card' }}</button></div>
        </form>
      }
    </zp-dialog>

    <!-- The new card, once -->
    <zp-dialog [open]="dialog() === 'issued'" title="The new gift card" (closed)="closeIssued()">
      @if (issued(); as card) { <zp-gift-card-issued [card]="card" [companyName]="company()" (done)="closeIssued()" /> }
    </zp-dialog>
  `
})
export class GiftCardsComponent implements OnInit {
  private readonly api = inject(GiftCardsApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly pageSize = PAGE;
  protected readonly data = signal<GiftCardListDto | null>(null);
  protected readonly cards = computed(() => this.data()?.cards.items ?? []);
  protected readonly total = computed(() => this.data()?.cards.total ?? 0);
  protected readonly page = signal(1);
  protected readonly state = signal('all');
  protected readonly search = signal('');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly dialog = signal<'history' | 'cancel' | 'issued' | null>(null);
  protected readonly viewing = signal<GiftCardDto | null>(null);
  protected readonly target = signal<GiftCardDto | null>(null);
  protected readonly reason = signal('');
  protected readonly busy = signal(false);
  protected readonly cancelError = signal<string | null>(null);
  protected readonly issued = signal<IssuedGiftCardDto | null>(null);
  protected readonly company = computed(() => this.auth.branding()?.companyName ?? '');

  ngOnInit(): void { void this.load(); }

  protected apply(): void { this.page.set(1); void this.load(); }
  protected go(page: number): void { this.page.set(page); void this.load(); }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try { this.data.set(await firstValueFrom(this.api.list({ state: this.state(), search: this.search().trim(), page: this.page(), pageSize: PAGE }))); }
    catch (err) { this.error.set(toApiError(err).message); }
    finally { this.loading.set(false); }
  }

  protected tone(state: GiftCardState): 'success' | 'warning' | 'danger' | 'primary' {
    return state === 'Active' ? 'success' : state === 'Expired' ? 'warning' : state === 'Cancelled' ? 'danger' : 'primary';
  }

  protected label(state: GiftCardState): string {
    return state === 'Used' ? 'Nothing left' : state;
  }

  protected kindLabel(kind: string): string {
    return kind === 'Issued' ? 'Sold' : kind === 'Spent' ? 'Spent on a bill' : kind === 'Refunded' ? 'Put back by a refund' : kind === 'Cancelled' ? 'Cancelled, balance moved' : 'Balance arrived from a cancelled card';
  }

  protected async view(card: GiftCardDto): Promise<void> {
    this.viewing.set(null);
    this.dialog.set('history');
    try { this.viewing.set(await firstValueFrom(this.api.get(card.id))); }
    catch (err) { this.dialog.set(null); this.error.set(toApiError(err).message); }
  }

  protected startCancel(card: GiftCardDto): void {
    this.target.set(card);
    this.reason.set('');
    this.cancelError.set(null);
    this.dialog.set('cancel');
  }

  protected async confirmCancel(): Promise<void> {
    const card = this.target();
    if (!card || this.busy()) return;
    this.busy.set(true);
    this.cancelError.set(null);
    try {
      const done = await firstValueFrom(this.api.cancelAndReissue(card.id, this.reason().trim()));
      this.issued.set(done.replacement);
      this.dialog.set('issued');
      this.toast.success(`Card ${card.number} cancelled; its balance is on card ${done.replacement.number}.`);
      void this.load();
    } catch (err) { this.cancelError.set(toApiError(err).message); }
    finally { this.busy.set(false); }
  }

  /** Nothing of the new code stays on the screen once the box is closed. */
  protected closeIssued(): void {
    this.issued.set(null);
    this.dialog.set(null);
  }
}
