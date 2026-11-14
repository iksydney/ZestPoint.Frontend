import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { FEATURES, SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { ApiError, toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { LEDGER_ACCOUNT_TYPES, LedgerAccountDto, LedgerAccountType, LedgerApi, LedgerStatusDto, SaveLedgerAccountRequest } from '../../core/services/ledger.services';
import { DialogComponent, ToastService } from '../../shared/ui/feedback';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';

const blank = (): SaveLedgerAccountRequest => ({ code: '', name: '', type: 'Income', description: null, isActive: true, rowVersion: null });

/**
 * The company's list of ledger accounts with today's balances. Entries are never typed here: the ledger is worked out from sales,
 * payments, refunds, goods received, stock movements, supplier payments and drawer cash, each dated when it happened. Opening this
 * screen (or any ledger report) brings it up to date first.
 */
@Component({
  selector: 'zp-ledger-accounts',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, RouterLink, DialogComponent, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-bold">Chart of Accounts</h1>
      <div class="flex flex-wrap items-center gap-3">
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" data-testid="accounts-inactive" [checked]="showInactive()" (change)="showInactive.set(!showInactive()); load()" /> Show switched off</label>
        <button type="button" class="btn-outline" data-testid="ledger-sync" [disabled]="syncing() || readOnly()" (click)="sync()">{{ syncing() ? 'Posting...' : 'Bring up to date' }}</button>
        @if (canManage()) { <button type="button" class="btn-primary" data-testid="account-new" [disabled]="readOnly()" (click)="openEdit(null)">New account</button> }
      </div>
    </div>

    <p class="mb-3 text-sm text-ink/80">Nobody types entries into the ledger. Every sale, payment, refund, goods receipt, stock movement, supplier payment and drawer movement posts its own balanced entry, dated when it happened. An item's sales and stock go to the account on its stock card; if it has none, to its stock group's account; if the group has none, to <strong>Sales</strong> and <strong>Stock</strong>.</p>
    @if (status(); as s) {
      <p class="mb-3 text-sm" role="status" data-testid="ledger-status" [class]="s.caughtUp ? 'text-ink/70' : 'sys-alert sys-alert-warning'">
        @if (s.caughtUp) { Up to date{{ s.lastSyncedAtUtc ? ' as of ' + (s.lastSyncedAtUtc | date: 'medium') : '' }}. {{ s.journalCount | number }} entries. }
        @else { Still posting past activity ({{ s.journalCount | number }} entries so far). Press Bring up to date again to continue. }
      </p>
    }
    @if (readOnly()) { <p class="sys-alert sys-alert-warning mb-3" role="status">Read-only: your subscription limits this screen.</p> }
    @if (error()) { <p class="sys-alert sys-alert-danger mb-3" role="alert" data-testid="accounts-error">{{ error() }}</p> }

    <div class="mb-3 flex flex-wrap gap-2 text-sm">
      <a class="btn-outline" routerLink="/app/ledger/reports/trial-balance" data-testid="link-trial">Trial Balance</a>
      <a class="btn-outline" routerLink="/app/ledger/reports/profit-and-loss">Profit and Loss</a>
      <a class="btn-outline" routerLink="/app/ledger/reports/journal">Ledger Journal</a>
    </div>

    <div class="app-card overflow-x-auto p-0" data-testid="accounts-table">
      <table class="app-table">
        <caption class="sr-only">Ledger accounts</caption>
        <thead><tr><th>Code</th><th>Account</th><th>Kind</th><th class="text-right">Balance today</th><th>Status</th><th></th></tr></thead>
        <tbody>
          @for (a of accounts(); track a.id) {
            <tr [attr.data-testid]="'account-' + a.code">
              <td class="font-mono">{{ a.code }}</td>
              <td class="font-medium">{{ a.name }} @if (a.isSystem) { <span class="app-badge bg-ink/10 text-ink/80" title="The system posts to this account. You can rename and renumber it, but not switch it off.">system</span> }
                @if (a.description) { <span class="block text-xs font-normal text-ink/60">{{ a.description }}</span> }</td>
              <td>{{ a.type }}</td>
              <td class="text-right font-mono" [attr.data-testid]="'balance-' + a.code">{{ a.balance | number: '1.2-2' }}</td>
              <td><zp-status-badge [tone]="a.isActive ? 'success' : 'danger'">{{ a.isActive ? 'Active' : 'Switched off' }}</zp-status-badge></td>
              <td class="whitespace-nowrap text-right">
                <a class="btn-ghost px-2 py-1 text-sm" routerLink="/app/ledger/reports/journal" [queryParams]="{ search: a.code }">Entries</a>
                @if (canManage() && !readOnly()) { <button type="button" class="btn-ghost px-2 py-1 text-sm" [attr.data-testid]="'account-edit-' + a.code" (click)="openEdit(a)">Edit</button> }
              </td>
            </tr>
          } @empty { <tr><td colspan="6" class="py-8 text-center text-ink/70">{{ loading() ? 'Loading...' : 'No accounts.' }}</td></tr> }
        </tbody>
      </table>
    </div>

    <zp-dialog [open]="dialogOpen()" [title]="editingId() ? 'Edit account' : 'New account'" (closed)="dialogOpen.set(false)">
      <form class="space-y-3" (submit)="$event.preventDefault(); save()">
        <div class="grid gap-3 sm:grid-cols-[8rem_1fr]">
          <div><label class="app-label" for="la-code">Code</label><input id="la-code" class="app-input font-mono" maxlength="20" data-testid="account-code" [ngModel]="form().code" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ code: $event })" />
            @if (fe('code')) { <p class="app-error" role="alert" data-testid="error-code">{{ fe('code') }}</p> }</div>
          <div><label class="app-label" for="la-name">Name</label><input id="la-name" class="app-input" maxlength="80" data-testid="account-name" [ngModel]="form().name" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ name: $event })" />
            @if (fe('name')) { <p class="app-error" role="alert">{{ fe('name') }}</p> }</div>
        </div>
        <div><label class="app-label" for="la-type">Kind</label>
          <select id="la-type" class="app-input" data-testid="account-type" [disabled]="editingSystem()" [ngModel]="form().type" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ type: $event })">
            @for (t of types; track t.value) { <option [ngValue]="t.value">{{ t.label }}: {{ t.hint }}</option> }</select>
          @if (fe('type')) { <p class="app-error" role="alert" data-testid="error-type">{{ fe('type') }}</p> }</div>
        <div><label class="app-label" for="la-desc">Description</label><input id="la-desc" class="app-input" maxlength="300" [ngModel]="form().description" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ description: $event || null })" /></div>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" data-testid="account-active" [disabled]="editingSystem()" [checked]="form().isActive" (change)="patch({ isActive: !form().isActive })" /> Active</label>
        @if (fe('isActive')) { <p class="app-error" role="alert" data-testid="error-isActive">{{ fe('isActive') }}</p> }
        @if (editingSystem()) { <p class="text-xs text-ink/70">The system posts to this account, so its kind stays and it cannot be switched off. Its code and name are yours to change.</p> }
        @if (dialogError()) { <p class="sys-alert sys-alert-danger" role="alert">{{ dialogError() }}</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialogOpen.set(false)">Cancel</button><button type="submit" class="btn-primary" data-testid="account-save" [disabled]="saving() || !form().code.trim() || !form().name.trim()">Save account</button></div>
      </form>
    </zp-dialog>
  `
})
export class LedgerAccountsComponent implements OnInit {
  private readonly api = inject(LedgerApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly types = LEDGER_ACCOUNT_TYPES;
  protected readonly accounts = signal<readonly LedgerAccountDto[]>([]);
  protected readonly status = signal<LedgerStatusDto | null>(null);
  protected readonly loading = signal(false);
  protected readonly syncing = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly dialogError = signal<string | null>(null);
  protected readonly showInactive = signal(false);
  protected readonly dialogOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly editingSystem = signal(false);
  protected readonly form = signal<SaveLedgerAccountRequest>(blank());
  private readonly fieldErrors = signal<Readonly<Record<string, readonly string[]>>>({});

  protected readonly readOnly = computed(() => this.auth.accessModeFor(FEATURES.FINANCIAL_REPORTING) === 'readonly');
  protected readonly canManage = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.LEDGER_ACCOUNTS_MANAGE));

  ngOnInit(): void { void this.sync(); }

  protected fe = (name: string): string | null => this.fieldErrors()[name]?.[0] ?? null;
  protected patch(p: Partial<SaveLedgerAccountRequest>): void { this.form.update((f) => ({ ...f, ...p })); }

  protected async load(): Promise<void> {
    this.loading.set(true);
    try { this.accounts.set(await firstValueFrom(this.api.accounts(this.showInactive()))); }
    catch (err) { this.error.set(toApiError(err).message); }
    finally { this.loading.set(false); }
  }

  /** Posts what has happened since last time, then shows the balances. */
  protected async sync(): Promise<void> {
    this.syncing.set(true);
    this.error.set(null);
    try { this.status.set(await firstValueFrom(this.api.sync())); }
    catch (err) { this.error.set(toApiError(err).message); }
    finally { this.syncing.set(false); }
    await this.load();
  }

  protected openEdit(a: LedgerAccountDto | null): void {
    this.editingId.set(a?.id ?? null);
    this.editingSystem.set(a?.isSystem ?? false);
    this.form.set(a ? { code: a.code, name: a.name, type: a.type as LedgerAccountType, description: a.description, isActive: a.isActive, rowVersion: a.rowVersion } : blank());
    this.fieldErrors.set({});
    this.dialogError.set(null);
    this.dialogOpen.set(true);
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    this.fieldErrors.set({});
    this.dialogError.set(null);
    try {
      await firstValueFrom(this.api.saveAccount(this.editingId(), { ...this.form(), code: this.form().code.trim(), name: this.form().name.trim() }));
      this.dialogOpen.set(false);
      this.toast.success('Account saved.');
      await this.load();
    } catch (err) {
      const e = toApiError(err) as ApiError;
      this.fieldErrors.set(e.fieldErrors);
      this.dialogError.set(Object.keys(e.fieldErrors).length === 0 ? e.message : null);
    } finally { this.saving.set(false); }
  }
}
