import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PublicMenuItemDto, PublicTableMenuDto, PublicTableRequestDto } from '../../core/models/table-ordering.model';
import { toApiError } from '../../core/services/api.util';
import { PublicTableApi } from '../../core/services/table-ordering.service';

interface BasketLine { key: string; productId: string; name: string; unitPrice: number; quantity: number; optionIds: string[]; optionNames: string }

/**
 * What a table's QR code opens: the company's menu with its branding, no sign-in and no app. The customer picks items and options, sends an order that staff
 * accept or decline (nothing reaches the kitchen or the bill without them), and can call a waiter or ask for the bill. The page sends only item ids, options
 * and quantities: the server prices everything, and shows no stock, no other tables and no staff. Paying is done with staff, as always.
 */
@Component({
  selector: 'zp-public-table',
  standalone: true,
  imports: [CurrencyPipe, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="min-h-screen pb-28" data-testid="public-table" [style.background]="menu()?.backgroundColor || '#f8fafc'" [style.color]="menu()?.textColor || '#0f172a'">
      @if (menu(); as m) {
        <header class="px-4 py-4 text-center" [style.background]="m.primaryColor || '#0f172a'" [style.color]="m.onPrimaryColor || '#ffffff'">
          @if (m.logoUrl) { <img [src]="m.logoUrl" alt="" class="mx-auto mb-2 h-12 w-auto" /> }
          <h1 class="text-xl font-bold" data-testid="tp-title">{{ m.companyName }}</h1>
          <p class="text-sm opacity-90" data-testid="tp-table">{{ m.branchName }}, table {{ m.tableName }}</p>
          @if (m.tagline) { <p class="text-xs opacity-80">{{ m.tagline }}</p> }
        </header>

        <div class="mx-auto max-w-2xl space-y-4 px-4 py-4">
          @if (m.notice) { <p class="rounded-lg bg-white p-3 text-sm shadow" role="status" data-testid="tp-notice">{{ m.notice }}</p> }
          @if (error()) { <p class="rounded-lg bg-white p-3 text-sm shadow" style="color:#b91c1c" role="alert" data-testid="tp-error">{{ error() }}</p> }

          <!-- Where the customer's request is -->
          @if (request(); as r) {
            <section class="rounded-lg bg-white p-4 shadow" aria-live="polite" data-testid="tp-request">
              @switch (r.state) {
                @case ('Waiting') {
                  @if (r.kind === 'order') { <p class="font-semibold" data-testid="tp-state">Waiting for staff to confirm your order...</p> }
                  @else { <p class="font-semibold" data-testid="tp-state">{{ r.kind === 'bill' ? 'The staff know you would like the bill.' : 'The staff know you need a waiter.' }}</p> }
                  @if (r.items.length) { <ul class="mt-2 text-sm">@for (i of r.items; track $index) { <li>{{ i.quantity }} x {{ i.name }}@if (i.options) { <span class="opacity-70"> ({{ i.options }})</span> }</li> }</ul> }
                  @if (r.kind === 'order') { <button type="button" class="mt-3 rounded border px-3 py-1.5 text-sm" data-testid="tp-cancel" (click)="cancel()">Take my order back</button> }
                }
                @case ('Confirmed') {
                  <p class="font-semibold" data-testid="tp-state">Confirmed. Your order is on your bill.</p>
                  @if (r.bill; as b) {
                    <div class="mt-2 text-sm" data-testid="tp-bill">
                      <p class="font-medium">On your table's bill so far</p>
                      <ul>@for (l of b.lines; track $index) { <li class="flex justify-between gap-3"><span>{{ l.quantity }} x {{ l.name }}</span><span>{{ l.total | currency: r.currencyCode : 'symbol-narrow' : '1.2-2' }}</span></li> }</ul>
                      <p class="mt-1 flex justify-between font-semibold"><span>Total</span><span data-testid="tp-bill-total">{{ b.total | currency: r.currencyCode : 'symbol-narrow' : '1.2-2' }}</span></p>
                    </div>
                  }
                  <button type="button" class="mt-3 rounded px-3 py-1.5 text-sm font-semibold" [style.background]="m.primaryColor || '#0f172a'" [style.color]="m.onPrimaryColor || '#fff'" data-testid="tp-more" (click)="forget()">Order something else</button>
                }
                @case ('Declined') {
                  <p class="font-semibold" data-testid="tp-state">Sorry, that could not be done.</p>
                  @if (r.declineReason) { <p class="mt-1 text-sm" data-testid="tp-decline">{{ r.declineReason }}</p> }
                  <button type="button" class="mt-3 rounded border px-3 py-1.5 text-sm" data-testid="tp-more" (click)="forget()">Choose again</button>
                }
                @case ('Expired') {
                  <p class="font-semibold" data-testid="tp-state">Nobody answered in time. Please ask a waiter, or send it again.</p>
                  <button type="button" class="mt-3 rounded border px-3 py-1.5 text-sm" data-testid="tp-more" (click)="forget()">Try again</button>
                }
                @case ('Cancelled') {
                  <p class="font-semibold" data-testid="tp-state">Your order was taken back.</p>
                  <button type="button" class="mt-3 rounded border px-3 py-1.5 text-sm" data-testid="tp-more" (click)="forget()">Choose again</button>
                }
                @default {
                  <p class="font-semibold" data-testid="tp-state">Done. A member of staff has seen to it.</p>
                  <button type="button" class="mt-3 rounded border px-3 py-1.5 text-sm" data-testid="tp-more" (click)="forget()">Back to the menu</button>
                }
              }
            </section>
          }

          <div class="flex flex-wrap gap-2">
            <button type="button" class="flex-1 rounded border bg-white px-3 py-2 text-sm font-medium shadow-sm" data-testid="tp-call-waiter" [disabled]="busy()" (click)="call('waiter')">Call a waiter</button>
            <button type="button" class="flex-1 rounded border bg-white px-3 py-2 text-sm font-medium shadow-sm" data-testid="tp-ask-bill" [disabled]="busy()" (click)="call('bill')">Ask for the bill</button>
          </div>
          @if (callNote()) { <p class="rounded-lg bg-white p-3 text-sm shadow" role="status" data-testid="tp-call-note">{{ callNote() }}</p> }

          <!-- The menu -->
          @for (c of m.categories; track c.name) {
            <section [attr.aria-label]="c.name">
              <h2 class="mb-2 text-lg font-bold">{{ c.name }}</h2>
              <ul class="space-y-2">
                @for (item of c.items; track item.id) {
                  <li class="flex gap-3 rounded-lg bg-white p-3 shadow-sm" [class.opacity-50]="!item.available" [attr.data-testid]="'tp-item-' + item.name">
                    @if (item.hasPicture && item.available) { <img [src]="picture(item)" alt="" loading="lazy" class="h-16 w-16 shrink-0 rounded object-cover" /> }
                    <div class="min-w-0 flex-1">
                      <p class="font-semibold">{{ item.name }}</p>
                      @if (item.description) { <p class="text-sm opacity-80">{{ item.description }}</p> }
                      @if (item.available) { <p class="text-sm font-medium">{{ item.price | currency: m.currencyCode : 'symbol-narrow' : '1.2-2' }}</p> } @else { <p class="text-sm">Not available now</p> }
                    </div>
                    @if (item.available && m.acceptingOrders) {
                      <button type="button" class="self-center rounded px-3 py-1.5 text-sm font-semibold" [style.background]="m.primaryColor || '#0f172a'" [style.color]="m.onPrimaryColor || '#fff'"
                              [attr.data-testid]="'tp-add-' + item.name" (click)="pick(item)">{{ item.options.length ? 'Choose' : 'Add' }}</button>
                    }
                  </li>
                }
              </ul>
            </section>
          }

          <!-- Options for the item being chosen -->
          @if (choosing(); as item) {
            <section class="rounded-lg bg-white p-4 shadow" data-testid="tp-options" role="dialog" aria-label="Choose options">
              <p class="font-semibold">{{ item.name }}</p>
              @for (o of item.options; track o.id) {
                <label class="mt-1 flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" [attr.data-testid]="'tp-option-' + o.name" [checked]="chosenOptions().includes(o.id)" (change)="toggleOption(o.id)" />
                  {{ o.name }}@if (o.priceDelta) { <span class="opacity-70"> (+{{ o.priceDelta | currency: m.currencyCode : 'symbol-narrow' : '1.2-2' }})</span> }</label>
              }
              <div class="mt-3 flex justify-end gap-2">
                <button type="button" class="rounded border px-3 py-1.5 text-sm" (click)="choosing.set(null)">Cancel</button>
                <button type="button" class="rounded px-3 py-1.5 text-sm font-semibold" [style.background]="m.primaryColor || '#0f172a'" [style.color]="m.onPrimaryColor || '#fff'" data-testid="tp-options-add" (click)="addChosen()">Add to my order</button>
              </div>
            </section>
          }
        </div>

        <!-- The basket -->
        @if (basket().length) {
          <aside class="fixed inset-x-0 bottom-0 border-t bg-white p-3 shadow-lg" data-testid="tp-basket" aria-label="Your order">
            <div class="mx-auto max-w-2xl space-y-2">
              @if (reviewing()) {
                <ul class="space-y-1 text-sm">
                  @for (l of basket(); track l.key) {
                    <li class="flex items-center justify-between gap-2"><span class="min-w-0 flex-1">{{ l.name }}@if (l.optionNames) { <span class="opacity-70"> ({{ l.optionNames }})</span> }</span>
                      <span class="flex items-center gap-1"><button type="button" class="h-8 w-8 rounded border" [attr.aria-label]="'Fewer ' + l.name" (click)="change(l.key, -1)">-</button><span class="w-6 text-center" [attr.data-testid]="'tp-qty-' + l.name">{{ l.quantity }}</span><button type="button" class="h-8 w-8 rounded border" [attr.aria-label]="'More ' + l.name" (click)="change(l.key, 1)">+</button></span></li>
                  }
                </ul>
                <input class="w-full rounded border px-3 py-2 text-sm" maxlength="60" placeholder="Your name (optional)" data-testid="tp-name" [ngModel]="name()" (ngModelChange)="name.set($event)" />
                <textarea class="w-full rounded border px-3 py-2 text-sm" rows="2" maxlength="300" placeholder="A note for the staff (optional)" data-testid="tp-note" [ngModel]="note()" (ngModelChange)="note.set($event)"></textarea>
              }
              <div class="flex items-center justify-between gap-2">
                <button type="button" class="text-sm underline" data-testid="tp-review" (click)="reviewing.set(!reviewing())">{{ reviewing() ? 'Hide' : 'Review' }} my order (<span data-testid="tp-basket-count">{{ basketCount() }}</span>)</button>
                <button type="button" class="rounded px-4 py-2 text-sm font-bold disabled:opacity-60" [style.background]="m.primaryColor || '#0f172a'" [style.color]="m.onPrimaryColor || '#fff'" data-testid="tp-send" [disabled]="busy() || !m.acceptingOrders" (click)="send()">
                  {{ busy() ? 'Sending...' : 'Send order ' + (basketTotal() | currency: m.currencyCode : 'symbol-narrow' : '1.2-2') }}</button>
              </div>
            </div>
          </aside>
        }
      } @else if (error()) {
        <div class="mx-auto max-w-sm px-4 py-12 text-center"><p class="rounded-lg bg-white p-4 shadow" role="alert" data-testid="tp-error">{{ error() }}</p></div>
      } @else {
        <p class="py-12 text-center" role="status">Loading the menu...</p>
      }
    </main>
  `
})
export class PublicTablePageComponent implements OnInit {
  private readonly api = inject(PublicTableApi);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  private code = '';
  private deviceId = '';
  private poll: ReturnType<typeof setInterval> | null = null;

  protected readonly menu = signal<PublicTableMenuDto | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly request = signal<PublicTableRequestDto | null>(null);
  protected readonly callNote = signal<string | null>(null);
  protected readonly basket = signal<readonly BasketLine[]>([]);
  protected readonly reviewing = signal(false);
  protected readonly name = signal('');
  protected readonly note = signal('');
  protected readonly choosing = signal<PublicMenuItemDto | null>(null);
  protected readonly chosenOptions = signal<readonly string[]>([]);

  protected readonly basketCount = computed(() => this.basket().reduce((n, l) => n + l.quantity, 0));
  protected readonly basketTotal = computed(() => Math.round(this.basket().reduce((sum, l) => sum + l.unitPrice * l.quantity, 0) * 100) / 100);

  constructor() { this.destroyRef.onDestroy(() => this.stopPolling()); }

  async ngOnInit(): Promise<void> {
    this.code = this.route.snapshot.paramMap.get('code') ?? '';
    this.deviceId = this.loadDevice();
    try {
      this.menu.set(await firstValueFrom(this.api.menu(this.code)));
      // A reload keeps the request the customer is waiting on.
      const last = this.store('request');
      if (last) await this.refresh(last);
    } catch (err) {
      const e = toApiError(err);
      this.error.set(e.status === 404 ? 'This table code is not valid. Please ask a waiter.' : e.status === 0 ? 'No connection. Try again when you are online.' : e.message);
    }
  }

  /** The device's own made-up id: kept in the browser only, so a reload is the same device. It is not who the customer is. */
  private loadDevice(): string {
    try {
      const existing = localStorage.getItem('zp-table-device');
      if (existing && existing.length >= 12) return existing;
      const fresh = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/-/g, '');
      localStorage.setItem('zp-table-device', fresh);
      return fresh;
    } catch { return (crypto.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`).replace(/-/g, ''); }
  }

  private store(key: string, value?: string | null): string | null {
    const k = `zp-table-${this.code.slice(0, 12)}-${key}`;
    try {
      if (value === undefined) return sessionStorage.getItem(k);
      if (value === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, value);
    } catch { /* the page works without it */ }
    return value ?? null;
  }

  protected picture(item: PublicMenuItemDto): string { return this.api.pictureUrl(this.code, item.id); }

  // ---- the basket ----
  protected pick(item: PublicMenuItemDto): void {
    this.error.set(null);
    if (item.options.length) { this.choosing.set(item); this.chosenOptions.set([]); return; }
    this.add(item, []);
  }

  protected toggleOption(id: string): void {
    this.chosenOptions.update((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }

  protected addChosen(): void {
    const item = this.choosing();
    if (!item) return;
    this.add(item, this.chosenOptions());
    this.choosing.set(null);
  }

  private add(item: PublicMenuItemDto, optionIds: readonly string[]): void {
    const options = item.options.filter((o) => optionIds.includes(o.id));
    const key = `${item.id}|${[...optionIds].sort().join(',')}`;
    const unitPrice = Math.round(((item.price ?? 0) + options.reduce((sum, o) => sum + o.priceDelta, 0)) * 100) / 100;
    this.basket.update((list) => {
      const same = list.find((l) => l.key === key);
      return same ? list.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, l.quantity + 1) } : l))
        : [...list, { key, productId: item.id, name: item.name, unitPrice, quantity: 1, optionIds: [...optionIds], optionNames: options.map((o) => o.name).join(', ') }];
    });
  }

  protected change(key: string, delta: number): void {
    this.basket.update((list) => list.map((l) => (l.key === key ? { ...l, quantity: Math.max(0, Math.min(50, l.quantity + delta)) } : l)).filter((l) => l.quantity > 0));
    if (this.basket().length === 0) this.reviewing.set(false);
  }

  // ---- sending, calling, and following the answer ----
  protected async send(): Promise<void> {
    if (this.busy() || !this.basket().length) return;
    this.busy.set(true);
    this.error.set(null);
    this.callNote.set(null);
    try {
      const sent = await firstValueFrom(this.api.order(this.code, {
        deviceId: this.deviceId, name: this.name().trim() || null, note: this.note().trim() || null,
        items: this.basket().map((l) => ({ productId: l.productId, quantity: l.quantity, optionIds: l.optionIds }))
      }));
      this.basket.set([]);
      this.reviewing.set(false);
      this.note.set('');
      this.show(sent);
    } catch (err) { this.error.set(toApiError(err).message); }
    finally { this.busy.set(false); }
  }

  protected async call(kind: 'waiter' | 'bill'): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.callNote.set(null);
    try {
      const asked = await firstValueFrom(this.api.call(this.code, kind, this.deviceId));
      this.callNote.set(kind === 'bill' ? 'We have told the staff you would like the bill.' : 'We have told the staff you need a waiter.');
      if (!this.request() || this.request()!.state !== 'Waiting') this.show(asked);
    } catch (err) { this.error.set(toApiError(err).message); }
    finally { this.busy.set(false); }
  }

  protected async cancel(): Promise<void> {
    const r = this.request();
    if (!r || this.busy()) return;
    this.busy.set(true);
    try { this.show(await firstValueFrom(this.api.cancel(this.code, r.id, this.deviceId))); }
    catch (err) { this.error.set(toApiError(err).message); }
    finally { this.busy.set(false); }
  }

  protected forget(): void {
    this.request.set(null);
    this.callNote.set(null);
    this.store('request', null);
    this.stopPolling();
  }

  private show(r: PublicTableRequestDto): void {
    this.request.set(r);
    this.store('request', r.id);
    if (r.state === 'Waiting') this.startPolling(); else this.stopPolling();
  }

  private async refresh(id: string): Promise<void> {
    try { this.show(await firstValueFrom(this.api.status(this.code, id, this.deviceId))); }
    catch (err) {
      // A busy moment (too many requests), no signal or a server hiccup is not the end of the order: carry on asking. Only a definite "no such request" forgets it.
      const status = toApiError(err).status;
      if (status === 0 || status === 429 || status >= 500) return;
      this.store('request', null);
      this.stopPolling();
    }
  }

  private startPolling(): void {
    if (this.poll) return;
    // Every 4 seconds for the first half minute (the staff are usually quick), then every 12: a table's guests share a request budget, and a waiting order does not need more.
    const started = Date.now();
    let tick = 0;
    this.poll = setInterval(() => {
      tick++;
      if (Date.now() - started > 30_000 && tick % 3 !== 0) return;
      const r = this.request();
      if (r && r.state === 'Waiting' && !document.hidden) void this.refresh(r.id);
    }, 4000);
  }

  private stopPolling(): void {
    if (this.poll) { clearInterval(this.poll); this.poll = null; }
  }
}
