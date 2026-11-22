import { CurrencyPipe, DatePipe, formatCurrency, getCurrencySymbol } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, Injectable, LOCALE_ID, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import { ApiEnvelope } from '../../core/models/api.model';
import { toApiError, unwrap } from '../../core/services/api.util';
import { BranchContextService } from '../../core/services/branch-context.service';
import { DialogComponent, ToastService } from '../../shared/ui/feedback';
import { BranchPickerComponent } from '../../shared/ui/ops-chrome.components';
import { SearchSelectComponent, SelectOption } from '../../shared/ui/search-select.component';

export interface TipStaffBalance { membershipId: string; name: string; bills: number; collected: number; paidOut: number; donated: number; held: number }
export interface TipSummary { currencyCode: string; collected: number; paidToStaff: number; donated: number; held: number; staff: TipStaffBalance[] }
export type TipKind = 'Staff' | 'Donation';
export type TipMethod = 'Cash' | 'Bank' | 'Other';
export interface TipPayout {
  id: string; number: number; branchName: string; kind: TipKind; membershipId: string | null; staffName: string | null; beneficiary: string | null; amount: number; paidOn: string;
  method: TipMethod; reference: string | null; note: string | null; recordedByName: string; recordedAtUtc: string; reversed: boolean; reversedByName: string | null; reverseReason: string | null;
}
export interface Colleague { id: string; name: string }

@Injectable({ providedIn: 'root' })
export class TipsApi {
  private readonly http = inject(HttpClient);
  summary(): Observable<TipSummary> { return this.http.get<ApiEnvelope<TipSummary>>('/api/v1/tips/summary').pipe(unwrap()); }
  payouts(): Observable<TipPayout[]> { return this.http.get<ApiEnvelope<TipPayout[]>>('/api/v1/tips/payouts').pipe(unwrap()); }
  create(body: { branchId: string; kind: TipKind; membershipId: string | null; beneficiary: string | null; amount: number; paidOn: string; method: TipMethod; reference: string | null; note: string | null }): Observable<TipPayout> {
    return this.http.post<ApiEnvelope<TipPayout>>('/api/v1/tips/payouts', body).pipe(unwrap());
  }
  reverse(id: string, reason: string): Observable<TipPayout> { return this.http.post<ApiEnvelope<TipPayout>>(`/api/v1/tips/payouts/${id}/reverse`, { reason }).pipe(unwrap()); }
  /** Names of the people in the company, for pickers. */
  colleagues(): Observable<Colleague[]> { return this.http.get<ApiEnvelope<Colleague[]>>('/api/v1/me/colleagues').pipe(unwrap()); }
}

const today = (): string => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/**
 * The tips register (owner's rule, 2026-11-14: no leakage). A tip belongs to whoever served the bill; the business holds it until it
 * is paid to that person or given away by its policy. Every payout and donation is recorded here, nothing can go out beyond what is
 * held, and a wrong entry is reversed with a reason, never deleted. The server checks all of it again.
 */
@Component({
    selector: 'zp-tips',
    imports: [CurrencyPipe, DatePipe, FormsModule, RouterLink, DialogComponent, BranchPickerComponent, SearchSelectComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div><h1 class="text-2xl font-bold">Tips</h1><p class="mt-1 text-sm text-ink/80">What customers gave in tips, who it belongs to, and every payout or donation out of it.</p></div>
      <div class="flex flex-wrap items-center gap-2"><zp-branch-picker />
        <button type="button" class="btn-primary" data-testid="tip-pay" [disabled]="!branches.activeId()" (click)="open('Staff', null)">Pay a staff member</button>
        <button type="button" class="btn-outline" data-testid="tip-donate" [disabled]="!branches.activeId()" (click)="open('Donation', null)">Record a donation</button>
      </div>
    </div>
    @if (error()) { <p class="sys-alert sys-alert-danger mb-3" role="alert" data-testid="tips-error">{{ error() }}</p> }

    @if (summary(); as s) {
      <dl class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="tips-totals">
        <div class="app-card"><dt class="text-xs font-semibold uppercase tracking-wide text-ink/70">Collected</dt><dd class="text-xl font-bold" data-testid="tips-collected">{{ s.collected | currency: s.currencyCode : 'symbol-narrow' : '1.2-2' }}</dd></div>
        <div class="app-card"><dt class="text-xs font-semibold uppercase tracking-wide text-ink/70">Paid to staff</dt><dd class="text-xl font-bold" data-testid="tips-paid">{{ s.paidToStaff | currency: s.currencyCode : 'symbol-narrow' : '1.2-2' }}</dd></div>
        <div class="app-card"><dt class="text-xs font-semibold uppercase tracking-wide text-ink/70">Donated</dt><dd class="text-xl font-bold" data-testid="tips-donated">{{ s.donated | currency: s.currencyCode : 'symbol-narrow' : '1.2-2' }}</dd></div>
        <div class="app-card border-primary"><dt class="text-xs font-semibold uppercase tracking-wide text-ink/70">Held now</dt><dd class="text-xl font-bold" data-testid="tips-held">{{ s.held | currency: s.currencyCode : 'symbol-narrow' : '1.2-2' }}</dd></div>
      </dl>

      <h2 class="mb-2 font-semibold">By staff member</h2>
      <div class="app-card mb-4 overflow-x-auto p-0">
        <table class="app-table" data-testid="tips-staff"><caption class="sr-only">Tips by staff member</caption>
          <thead><tr><th>Staff member</th><th class="text-right">Bills with a tip</th><th class="text-right">Collected</th><th class="text-right">Paid to them</th><th class="text-right">Donated from theirs</th><th class="text-right">Held for them</th><th></th></tr></thead>
          <tbody>
            @for (r of s.staff; track r.membershipId) {
              <tr [attr.data-testid]="'tips-row-' + r.name">
                <td class="font-medium">{{ r.name }}</td><td class="text-right">{{ r.bills }}</td>
                <td class="text-right">{{ r.collected | currency: s.currencyCode : 'symbol-narrow' : '1.2-2' }}</td><td class="text-right">{{ r.paidOut | currency: s.currencyCode : 'symbol-narrow' : '1.2-2' }}</td>
                <td class="text-right">{{ r.donated | currency: s.currencyCode : 'symbol-narrow' : '1.2-2' }}</td><td class="text-right font-semibold">{{ r.held | currency: s.currencyCode : 'symbol-narrow' : '1.2-2' }}</td>
                <td class="whitespace-nowrap text-right">@if (r.held > 0) { <button type="button" class="btn-outline px-2 py-1 text-sm" [attr.data-testid]="'tip-pay-' + r.name" [disabled]="!branches.activeId()" (click)="open('Staff', r)">Pay out</button> }</td>
              </tr>
            } @empty { <tr><td colspan="7" class="py-8 text-center text-ink/70">No tips have been taken yet. A tip counts once its bill is paid in full.</td></tr> }
          </tbody>
        </table>
      </div>
    } @else if (!error()) { <p class="py-8 text-center text-ink/70" role="status">Loading...</p> }

    <div class="mb-2 flex flex-wrap items-center justify-between gap-2"><h2 class="font-semibold">Payouts and donations</h2>
      <a class="text-sm underline" routerLink="/app/pos/reports/tips">Tips report for any period</a></div>
    <div class="app-card overflow-x-auto p-0">
      <table class="app-table" data-testid="tips-entries"><caption class="sr-only">Payouts and donations</caption>
        <thead><tr><th>Entry</th><th>Date</th><th>Kind</th><th>Paid to</th><th>From the tips of</th><th class="text-right">Amount</th><th>How</th><th>Reference</th><th>Recorded by</th><th></th></tr></thead>
        <tbody>
          @for (p of payouts(); track p.id) {
            <tr [class.opacity-60]="p.reversed" [attr.data-testid]="'tips-entry-' + p.number">
              <td>#{{ p.number }}</td><td class="whitespace-nowrap">{{ p.paidOn | date: 'mediumDate' }}</td><td>{{ p.kind === 'Staff' ? 'Paid to staff' : 'Donation' }}</td>
              <td class="font-medium">{{ p.kind === 'Staff' ? p.staffName : p.beneficiary }}</td><td>{{ p.staffName ?? 'Tips held in general' }}</td>
              <td class="text-right font-semibold">{{ p.amount | currency: summary()?.currencyCode : 'symbol-narrow' : '1.2-2' }}</td><td>{{ p.method }}</td><td class="font-mono text-xs">{{ p.reference }}</td>
              <td class="text-xs">{{ p.recordedByName }}<span class="block text-ink/60">{{ p.recordedAtUtc | date: 'short' }}</span></td>
              <td class="whitespace-nowrap text-right">
                @if (p.reversed) { <span class="text-xs" [title]="p.reverseReason ?? ''">Reversed by {{ p.reversedByName }}</span> }
                @else { <button type="button" class="btn-ghost px-2 py-1 text-sm" [attr.data-testid]="'tip-reverse-' + p.number" (click)="openReverse(p)">Reverse</button> }
              </td>
            </tr>
          } @empty { <tr><td colspan="10" class="py-8 text-center text-ink/70">Nothing has been paid out or donated yet.</td></tr> }
        </tbody>
      </table>
    </div>

    <zp-dialog [open]="dialog() === 'entry'" [title]="form().kind === 'Staff' ? 'Pay tips to a staff member' : 'Record a donation from tips'" (closed)="dialog.set(null)">
      <form class="space-y-3" (submit)="$event.preventDefault(); save()" data-testid="tip-dialog">
        @if (form().kind === 'Staff') {
          <div><label class="app-label" for="tp-staff">Staff member</label>
            <zp-search-select inputId="tp-staff" testId="tip-staff" emptyLabel="Choose..." noun="person" placeholder="Search people"
                              [options]="heldOptions()" [value]="form().membershipId" (valueChange)="patch({ membershipId: $event })" /></div>
        } @else {
          <div><label class="app-label" for="tp-ben">Given to</label><input id="tp-ben" class="app-input" maxlength="120" placeholder="Name of the organisation or person" data-testid="tip-beneficiary" [ngModel]="form().beneficiary" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ beneficiary: $event })" /></div>
          <div><label class="app-label" for="tp-from">From whose tips</label>
            <zp-search-select inputId="tp-from" testId="tip-from" emptyLabel="Tips held in general" noun="person" placeholder="Search people"
                              [options]="heldOptions()" [value]="form().membershipId" (valueChange)="patch({ membershipId: $event })" /></div>
        }
        <div class="grid gap-3 sm:grid-cols-2">
          <div><label class="app-label" for="tp-amount">Amount</label><input id="tp-amount" type="number" min="0" step="0.01" class="app-input" data-testid="tip-amount" [ngModel]="form().amount" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ amount: +$event })" />
            <p class="mt-1 text-xs text-ink/70" data-testid="tip-limit">At most {{ limit() | currency: summary()?.currencyCode : 'symbol-narrow' : '1.2-2' }} can go out.</p></div>
          <div><label class="app-label" for="tp-date">Date paid</label><input id="tp-date" type="date" class="app-input" data-testid="tip-date" [ngModel]="form().paidOn" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ paidOn: $event })" /></div>
          <div><label class="app-label" for="tp-method">How it was paid</label>
            <select id="tp-method" class="app-input" data-testid="tip-method" [ngModel]="form().method" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ method: $event })"><option value="Cash">Cash</option><option value="Bank">Bank transfer</option><option value="Other">Other</option></select></div>
          <div><label class="app-label" for="tp-ref">Reference (optional)</label><input id="tp-ref" class="app-input" maxlength="80" placeholder="Transfer or receipt number" data-testid="tip-reference" [ngModel]="form().reference" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ reference: $event })" /></div>
        </div>
        <div><label class="app-label" for="tp-note">Note (optional)</label><input id="tp-note" class="app-input" maxlength="300" [ngModel]="form().note" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ note: $event })" /></div>
        @if (formError()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="tip-form-error">{{ formError() }}</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="tip-save" [disabled]="busy() || !valid()">{{ busy() ? 'Saving...' : 'Record it' }}</button></div>
      </form>
    </zp-dialog>

    <zp-dialog [open]="dialog() === 'reverse'" title="Reverse this entry" (closed)="dialog.set(null)">
      <form class="space-y-3" (submit)="$event.preventDefault(); reverse()">
        <p class="text-sm text-ink/80">The entry stays on record, marked as reversed, and the amount goes back to the tips being held. Use this for a mistake or for money that came back.</p>
        <div><label class="app-label" for="tp-why">Reason</label><input id="tp-why" class="app-input" maxlength="200" data-testid="tip-reverse-reason" [ngModel]="reason()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="reason.set($event)" /></div>
        @if (formError()) { <p class="sys-alert sys-alert-danger" role="alert">{{ formError() }}</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="tip-reverse-confirm" [disabled]="busy() || reason().trim().length < 3">Reverse it</button></div>
      </form>
    </zp-dialog>
  `
})
export class TipsComponent implements OnInit {
  private readonly api = inject(TipsApi);
  private readonly toast = inject(ToastService);
  protected readonly branches = inject(BranchContextService);
  private readonly locale = inject(LOCALE_ID);

  protected readonly summary = signal<TipSummary | null>(null);
  /** The people who hold tips, each with what they hold (written as the currency pipe writes it). */
  protected readonly heldOptions = computed<readonly SelectOption[]>(() => {
    const s = this.summary();
    const code = s?.currencyCode ?? '';
    const money = (v: number): string => formatCurrency(v, this.locale, getCurrencySymbol(code, 'narrow', this.locale), code, '1.2-2');
    return (s?.staff ?? []).filter((r) => r.held > 0).map((r) => ({ value: r.membershipId, label: `${r.name} (holding ${money(r.held)})` }));
  });
  protected readonly payouts = signal<readonly TipPayout[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly dialog = signal<'entry' | 'reverse' | null>(null);
  protected readonly busy = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly reason = signal('');
  private target: TipPayout | null = null;
  protected readonly form = signal({ kind: 'Staff' as TipKind, membershipId: '', beneficiary: '', amount: 0, paidOn: today(), method: 'Cash' as TipMethod, reference: '', note: '' });

  /** What may still go out: the chosen person's tips, or everything held for a donation from the tips in general. */
  protected readonly limit = computed(() => {
    const s = this.summary();
    if (!s) return 0;
    const who = this.form().membershipId;
    return Math.max(0, who ? Math.min(s.held, s.staff.find((r) => r.membershipId === who)?.held ?? 0) : s.held);
  });
  protected readonly valid = computed(() => {
    const f = this.form();
    return f.amount > 0 && f.amount <= this.limit() && !!f.paidOn && (f.kind === 'Staff' ? !!f.membershipId : f.beneficiary.trim().length >= 2);
  });

  ngOnInit(): void {
    void this.branches.load();
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const [s, p] = await Promise.all([firstValueFrom(this.api.summary()), firstValueFrom(this.api.payouts())]);
      this.summary.set(s);
      this.payouts.set(p);
      this.error.set(null);
    } catch (err) { this.error.set(toApiError(err).message); }
  }

  protected patch(p: Partial<ReturnType<typeof this.form>>): void { this.form.update((f) => ({ ...f, ...p })); }

  protected open(kind: TipKind, row: TipStaffBalance | null): void {
    this.formError.set(null);
    this.form.set({ kind, membershipId: row?.membershipId ?? '', beneficiary: '', amount: row?.held ?? 0, paidOn: today(), method: 'Cash', reference: '', note: '' });
    this.dialog.set('entry');
  }

  protected async save(): Promise<void> {
    const branchId = this.branches.activeId();
    if (!branchId || !this.valid()) return;
    const f = this.form();
    this.busy.set(true);
    this.formError.set(null);
    try {
      await firstValueFrom(this.api.create({
        branchId, kind: f.kind, membershipId: f.membershipId || null, beneficiary: f.kind === 'Donation' ? f.beneficiary.trim() : null, amount: f.amount, paidOn: f.paidOn, method: f.method,
        reference: f.reference.trim() || null, note: f.note.trim() || null
      }));
      this.dialog.set(null);
      this.toast.success(f.kind === 'Staff' ? 'Payout recorded.' : 'Donation recorded.');
      await this.load();
    } catch (err) {
      const e = toApiError(err);
      this.formError.set(Object.values(e.fieldErrors)[0]?.[0] ?? e.message);
    } finally { this.busy.set(false); }
  }

  protected openReverse(p: TipPayout): void {
    this.target = p;
    this.reason.set('');
    this.formError.set(null);
    this.dialog.set('reverse');
  }

  protected async reverse(): Promise<void> {
    if (!this.target) return;
    this.busy.set(true);
    this.formError.set(null);
    try {
      await firstValueFrom(this.api.reverse(this.target.id, this.reason().trim()));
      this.dialog.set(null);
      this.toast.success('Entry reversed.');
      await this.load();
    } catch (err) { this.formError.set(toApiError(err).message); }
    finally { this.busy.set(false); }
  }
}
