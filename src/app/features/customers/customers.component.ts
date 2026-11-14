import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { FEATURES, SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { ApiError, toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { CustomerDto, CustomersApi, SaveCustomerRequest } from '../../core/services/customer.services';
import { DialogComponent, ToastService } from '../../shared/ui/feedback';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';

const blank = (): SaveCustomerRequest => ({ name: '', phone: '', email: null, address: null, birthday: null, notes: null, isActive: true, rowVersion: null });

/**
 * Customers: found by phone or name, with their loyalty points. Anyone at the till can add one (a name and a phone); the other
 * details and deactivating need the right to manage customers. Points are earned when a bill with the customer on it is paid, and
 * cannot be spent yet.
 */
@Component({
  selector: 'zp-customers',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, DialogComponent, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-bold">Customers</h1>
      <button type="button" class="btn-primary" data-testid="customer-new" [disabled]="readOnly()" (click)="openEdit(null)">New customer</button>
    </div>
    <div class="mb-3 flex flex-wrap items-center gap-3">
      <input class="app-input max-w-sm" placeholder="Name, phone or customer number" aria-label="Search customers" data-testid="customer-search" [ngModel]="search()" (ngModelChange)="search.set($event)" (keydown.enter)="page.set(1); load()" />
      <button type="button" class="btn-outline" data-testid="customer-search-go" (click)="page.set(1); load()">Search</button>
      @if (canManage()) { <label class="flex items-center gap-2 text-sm"><input type="checkbox" [checked]="showInactive()" (change)="showInactive.set(!showInactive()); page.set(1); load()" /> Show deactivated</label> }
    </div>
    @if (readOnly()) { <p class="sys-alert sys-alert-warning mb-3" role="status">Read-only: your subscription limits this screen.</p> }
    @if (error()) { <p class="sys-alert sys-alert-danger mb-3" role="alert">{{ error() }}</p> }

    <div class="app-card overflow-x-auto p-0" data-testid="customers-table">
      <table class="app-table">
        <caption class="sr-only">Customers</caption>
        <thead><tr><th>No.</th><th>Name</th><th>Phone</th><th class="text-right">Points</th><th>Status</th><th></th></tr></thead>
        <tbody>
          @for (c of customers(); track c.id) {
            <tr [attr.data-testid]="'customer-' + c.name">
              <td class="font-mono text-xs">{{ c.number }}</td><td class="font-medium">{{ c.name }}</td><td class="font-mono">{{ c.phone }}</td>
              <td class="text-right font-mono" [attr.data-testid]="'points-' + c.name">{{ c.pointsBalance | number: '1.0-2' }}</td>
              <td><zp-status-badge [tone]="c.isActive ? 'success' : 'danger'">{{ c.isActive ? 'Active' : 'Deactivated' }}</zp-status-badge></td>
              <td class="whitespace-nowrap text-right">
                <button type="button" class="btn-ghost px-2 py-1 text-sm" [attr.data-testid]="'customer-open-' + c.name" (click)="openView(c)">Points</button>
                @if (canManage() && !readOnly()) { <button type="button" class="btn-ghost px-2 py-1 text-sm" [attr.data-testid]="'customer-edit-' + c.name" (click)="openEdit(c)">Edit</button> }
              </td>
            </tr>
          } @empty { <tr><td colspan="6" class="py-8 text-center text-ink/70">{{ loading() ? 'Loading...' : 'No customers found.' }}</td></tr> }
        </tbody>
      </table>
    </div>
    <div class="mt-3 flex items-center justify-between text-sm">
      <span data-testid="customers-count">{{ total() }} customer{{ total() === 1 ? '' : 's' }}</span>
      <span class="flex gap-2"><button type="button" class="btn-outline px-2 py-1" [disabled]="page() <= 1" (click)="page.set(page() - 1); load()">Previous</button>
        <button type="button" class="btn-outline px-2 py-1" [disabled]="page() * pageSize >= total()" (click)="page.set(page() + 1); load()">Next</button></span>
    </div>

    <zp-dialog [open]="dialog() === 'edit'" [title]="editingId() ? 'Edit customer' : 'New customer'" (closed)="dialog.set(null)">
      <form class="space-y-3" autocomplete="off" (submit)="$event.preventDefault(); save()">
        <div><label class="app-label" for="cu-name">Name</label><input id="cu-name" name="zp-customer-name" class="app-input" maxlength="120" autocomplete="off" data-testid="customer-name" [ngModel]="form().name" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ name: $event })" />
          @if (fe('name')) { <p class="app-error" role="alert">{{ fe('name') }}</p> }</div>
        <div><label class="app-label" for="cu-phone">Phone</label><input id="cu-phone" name="zp-customer-phone" class="app-input font-mono" maxlength="30" inputmode="tel" autocomplete="off" data-testid="customer-phone" [ngModel]="form().phone" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ phone: $event })" />
          @if (fe('phone')) { <p class="app-error" role="alert" data-testid="error-phone">{{ fe('phone') }}</p> }</div>
        @if (canManage()) {
          <div class="grid gap-3 sm:grid-cols-2">
            <div><label class="app-label" for="cu-email">Email (optional)</label><input id="cu-email" type="email" class="app-input" maxlength="200" autocomplete="off" data-testid="customer-email" [ngModel]="form().email" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ email: $event || null })" />
              @if (fe('email')) { <p class="app-error" role="alert">{{ fe('email') }}</p> }</div>
            <div><label class="app-label" for="cu-birthday">Birthday (optional)</label><input id="cu-birthday" type="date" class="app-input" data-testid="customer-birthday" [ngModel]="form().birthday" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ birthday: $event || null })" />
              @if (fe('birthday')) { <p class="app-error" role="alert">{{ fe('birthday') }}</p> }</div>
          </div>
          <div><label class="app-label" for="cu-address">Address (optional)</label><input id="cu-address" class="app-input" maxlength="300" autocomplete="off" [ngModel]="form().address" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ address: $event || null })" /></div>
          <div><label class="app-label" for="cu-notes">Note (optional)</label><input id="cu-notes" class="app-input" maxlength="500" [ngModel]="form().notes" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ notes: $event || null })" /></div>
          @if (editingId()) { <label class="flex items-center gap-2 text-sm"><input type="checkbox" data-testid="customer-active" [checked]="form().isActive" (change)="patch({ isActive: !form().isActive })" /> Active (a deactivated customer cannot be put on a bill; their history is kept)</label> }
        } @else { <p class="text-xs text-ink/70">Email, address and birthday can be added by someone who may manage customers.</p> }
        @if (dialogError()) { <p class="sys-alert sys-alert-danger" role="alert">{{ dialogError() }}</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="customer-save" [disabled]="saving() || !form().name.trim() || !form().phone.trim()">Save customer</button></div>
      </form>
    </zp-dialog>

    <zp-dialog [open]="dialog() === 'view'" [title]="(viewing()?.name ?? 'Customer') + ': loyalty points'" (closed)="dialog.set(null)">
      @if (viewing(); as v) {
        <dl class="mb-3 grid grid-cols-2 gap-2 text-sm">
          <div><dt class="text-ink/70">Points now</dt><dd class="text-lg font-bold" data-testid="view-points">{{ v.pointsBalance | number: '1.0-2' }}</dd></div>
          <div><dt class="text-ink/70">Paid bills</dt><dd class="text-lg font-bold">{{ v.billCount }}</dd></div>
        </dl>
        <p class="mb-2 text-xs text-ink/70">Points are earned when a bill with this customer on it is paid in full, and go back in proportion when money is refunded. They cannot be spent yet.</p>
        <table class="app-table" data-testid="view-history">
          <thead><tr><th>When</th><th>What</th><th>Bill</th><th class="text-right">Points</th></tr></thead>
          <tbody>
            @for (p of v.points; track $index) {
              <tr><td>{{ p.occurredAtUtc | date: 'medium' }}</td><td>{{ p.kind === 'Earned' ? 'Earned' : 'Taken back' + (p.reason ? ': ' + p.reason : '') }}</td><td>{{ p.orderNumber ? '#' + p.orderNumber : '' }}</td><td class="text-right font-mono">{{ p.points | number: '1.0-2' }}</td></tr>
            } @empty { <tr><td colspan="4" class="py-4 text-center text-ink/70">No points yet.</td></tr> }
          </tbody>
        </table>
      } @else { <p class="text-ink/70">Loading...</p> }
    </zp-dialog>
  `
})
export class CustomersComponent implements OnInit {
  private readonly api = inject(CustomersApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly pageSize = 25;
  protected readonly customers = signal<readonly CustomerDto[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly search = signal('');
  protected readonly showInactive = signal(false);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly dialogError = signal<string | null>(null);
  protected readonly dialog = signal<'edit' | 'view' | null>(null);
  protected readonly editingId = signal<string | null>(null);
  protected readonly viewing = signal<CustomerDto | null>(null);
  protected readonly form = signal<SaveCustomerRequest>(blank());
  private readonly fieldErrors = signal<Readonly<Record<string, readonly string[]>>>({});

  protected readonly readOnly = computed(() => this.auth.accessModeFor(FEATURES.CORE_POS) === 'readonly');
  protected readonly canManage = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.CUSTOMERS_MANAGE));

  ngOnInit(): void { void this.load(); }

  protected fe = (name: string): string | null => this.fieldErrors()[name]?.[0] ?? null;
  protected patch(p: Partial<SaveCustomerRequest>): void { this.form.update((f) => ({ ...f, ...p })); }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await firstValueFrom(this.api.list({ search: this.search().trim(), includeInactive: this.showInactive(), page: this.page(), pageSize: this.pageSize }));
      this.customers.set(res.items);
      this.total.set(res.total);
    } catch (err) { this.error.set(toApiError(err).message); }
    finally { this.loading.set(false); }
  }

  protected openEdit(c: CustomerDto | null): void {
    this.editingId.set(c?.id ?? null);
    this.form.set(c ? { name: c.name, phone: c.phone, email: c.email, address: c.address, birthday: c.birthday, notes: c.notes, isActive: c.isActive, rowVersion: c.rowVersion } : blank());
    this.fieldErrors.set({});
    this.dialogError.set(null);
    this.dialog.set('edit');
  }

  protected async openView(c: CustomerDto): Promise<void> {
    this.viewing.set(null);
    this.dialog.set('view');
    try { this.viewing.set(await firstValueFrom(this.api.get(c.id))); }
    catch (err) { this.dialog.set(null); this.error.set(toApiError(err).message); }
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    this.fieldErrors.set({});
    this.dialogError.set(null);
    const body = { ...this.form(), name: this.form().name.trim(), phone: this.form().phone.trim() };
    try {
      const id = this.editingId();
      await firstValueFrom(id ? this.api.update(id, body) : this.api.create(body));
      this.dialog.set(null);
      this.toast.success('Customer saved.');
      await this.load();
    } catch (err) {
      const e = toApiError(err) as ApiError;
      this.fieldErrors.set(e.fieldErrors);
      this.dialogError.set(Object.keys(e.fieldErrors).length === 0 ? e.message : null);
    } finally { this.saving.set(false); }
  }
}
