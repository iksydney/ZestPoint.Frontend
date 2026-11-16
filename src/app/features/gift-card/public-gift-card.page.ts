import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { PublicGiftCardBalanceDto } from '../../core/models/gift-card.model';
import { toApiError } from '../../core/services/api.util';
import { GiftCardsApi } from '../../core/services/gift-cards.service';

/**
 * The holder of a gift card checking what is left, without signing in. The code is the only key: it shows the balance and the date of that one card, and nothing about who
 * bought it or where. It is rate-limited by the server, so codes cannot be searched for. The code is sent to be checked and is not kept anywhere.
 */
@Component({
  selector: 'zp-public-gift-card',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="min-h-screen bg-slate-100 px-4 py-8 text-slate-900" data-testid="public-gift-card">
      <div class="mx-auto max-w-sm space-y-4">
        <h1 class="text-center text-xl font-bold">Check your gift card</h1>
        <form class="space-y-3 rounded-lg bg-white p-4 shadow" (submit)="$event.preventDefault(); check()">
          <label class="block text-sm font-medium" for="pgc-code">The code on your card or slip</label>
          <input id="pgc-code" class="block w-full rounded border border-slate-300 px-3 py-2 font-mono text-lg uppercase tracking-wider" autocomplete="off" autocapitalize="characters" spellcheck="false"
                 maxlength="24" placeholder="XXXX-XXXX-XXXX-XXXX" data-testid="pgc-code" [ngModel]="code()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="code.set($event)" />
          <button type="submit" class="w-full rounded bg-slate-900 px-4 py-2 font-semibold text-white disabled:opacity-60" data-testid="pgc-check" [disabled]="busy() || code().trim().length < 8">{{ busy() ? 'Checking...' : 'Check the balance' }}</button>
        </form>

        @if (result(); as r) {
          <section class="rounded-lg bg-white p-4 text-center shadow" aria-live="polite" data-testid="pgc-result">
            <p class="text-sm text-slate-600">{{ r.companyName }}, gift card ending {{ r.last4 }}</p>
            @switch (r.state) {
              @case ('Cancelled') { <p class="mt-2 text-lg font-bold" data-testid="pgc-state">This card was cancelled and its balance moved to a new card.</p> }
              @case ('Expired') { <p class="mt-2 text-lg font-bold" data-testid="pgc-state">This card has expired{{ r.expiresAtUtc ? ' (' + (r.expiresAtUtc | date: 'longDate') + ')' : '' }}. Ask the shop what can be done.</p> }
              @case ('Used') { <p class="mt-2 text-lg font-bold" data-testid="pgc-state">Nothing is left on this card.</p> }
              @default {
                <p class="mt-2 text-3xl font-bold" data-testid="pgc-balance">{{ r.balance | currency: r.currencyCode : 'symbol-narrow' : '1.2-2' }}</p>
                @if (r.expiresAtUtc) { <p class="mt-1 text-sm" data-testid="pgc-expiry">Valid until {{ r.expiresAtUtc | date: 'longDate' }}.</p> } @else { <p class="mt-1 text-sm">It does not expire.</p> }
              }
            }
          </section>
        }
        @if (error()) { <p class="rounded-lg bg-white p-4 text-center shadow" role="alert" data-testid="pgc-error">{{ error() }}</p> }
      </div>
    </main>
  `
})
export class PublicGiftCardPageComponent {
  private readonly api = inject(GiftCardsApi);

  protected readonly code = signal('');
  protected readonly busy = signal(false);
  protected readonly result = signal<PublicGiftCardBalanceDto | null>(null);
  protected readonly error = signal<string | null>(null);

  protected async check(): Promise<void> {
    this.busy.set(true);
    this.result.set(null);
    this.error.set(null);
    try { this.result.set(await firstValueFrom(this.api.publicBalance(this.code().trim()))); }
    catch (err) {
      const e = toApiError(err);
      this.error.set(e.status === 404 ? 'That code is not right. Check it and try again.' : e.status === 429 ? 'Too many tries. Please wait a minute and try again.' : e.status === 0 ? 'No connection. Try again when you are online.' : e.message);
    } finally { this.busy.set(false); }
  }
}
