import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { FEATURES } from '../../core/models/rbac.model';
import { SaveSupplierRequest, SupplierDto } from '../../core/models/ops.model';
import { ApiError, toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { InventoryApi } from '../../core/services/ops.services';
import { DialogComponent, ToastService } from '../../shared/ui/feedback';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';

const blank = (): SaveSupplierRequest => ({ name: '', contactName: null, email: null, phone: null, address: null, paymentTermsDays: 30, isActive: true, taxId: null, repName: null, creditLimit: null });

/** Add / Modify Suppliers. Payment terms drive the "overdue" figures in the aged-suppliers report. Suppliers are deactivated, never deleted. */
@Component({
  selector: 'zp-suppliers',
  standalone: true,
  imports: [FormsModule, DialogComponent, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-bold">Add / Modify Suppliers</h1>
      <button type="button" class="btn-primary" data-testid="supplier-new" [disabled]="readOnly()" (click)="openEdit(null)">Add supplier</button>
    </div>
    @if (readOnly()) { <p class="sys-alert sys-alert-warning mb-3" role="status">Read-only: your subscription limits this screen.</p> }
    @if (error()) { <p class="sys-alert sys-alert-danger mb-3" role="alert" data-testid="suppliers-error">{{ error() }}</p> }
    <div class="app-card overflow-x-auto p-0"><table class="app-table" data-testid="suppliers-table">
      <caption class="sr-only">Suppliers</caption>
      <thead><tr><th>Supplier</th><th>Contact</th><th>E-mail</th><th>Phone</th><th class="text-right">Terms (days)</th><th>Status</th><th></th></tr></thead>
      <tbody>@for (s of suppliers(); track s.id) {
        <tr [attr.data-testid]="'supplier-' + s.name"><td class="font-medium">{{ s.name }}@if (s.isDemo) { <zp-status-badge tone="warning">Demo</zp-status-badge> }<span class="block text-xs font-normal text-ink/60">{{ s.address }}</span></td>
          <td>{{ s.contactName }}</td><td>{{ s.email }}</td><td>{{ s.phone }}</td><td class="text-right">{{ s.paymentTermsDays }}</td>
          <td><zp-status-badge [tone]="s.isActive ? 'success' : 'danger'">{{ s.isActive ? 'Active' : 'Inactive' }}</zp-status-badge></td>
          <td class="text-right">@if (!readOnly()) { <button type="button" class="btn-outline px-2 py-1 text-sm" [attr.data-testid]="'supplier-edit-' + s.name" (click)="openEdit(s)">Edit</button> }</td></tr>
      } @empty { <tr><td colspan="7" class="py-8 text-center text-ink/70">{{ loading() ? 'Loading...' : 'No suppliers yet.' }}</td></tr> }</tbody></table></div>

    <zp-dialog [open]="dialog()" [title]="editingId() ? 'Edit supplier' : 'Add supplier'" (closed)="dialog.set(false)">
      <form class="space-y-3" (submit)="$event.preventDefault(); save()">
        <div><label class="app-label" for="s-name">Name</label><input id="s-name" class="app-input" data-testid="supplier-name" maxlength="160" [ngModel]="f().name" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ name: $event })" />@if (fe('name')) { <p class="app-error" role="alert">{{ fe('name') }}</p> }</div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div><label class="app-label" for="s-contact">Contact person</label><input id="s-contact" class="app-input" maxlength="120" [ngModel]="f().contactName" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ contactName: $event || null })" /></div>
          <div><label class="app-label" for="s-phone">Phone</label><input id="s-phone" class="app-input" maxlength="32" [ngModel]="f().phone" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ phone: $event || null })" /></div>
          <div><label class="app-label" for="s-email">E-mail</label><input id="s-email" type="email" class="app-input" maxlength="254" [ngModel]="f().email" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ email: $event || null })" />@if (fe('email')) { <p class="app-error" role="alert">{{ fe('email') }}</p> }</div>
          <div><label class="app-label" for="s-terms">Payment terms (days)</label><input id="s-terms" type="number" min="0" max="365" class="app-input" data-testid="supplier-terms" [ngModel]="f().paymentTermsDays" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ paymentTermsDays: +$event })" /></div>
          <div><label class="app-label" for="s-tax">Tax ID</label><input id="s-tax" class="app-input font-data" maxlength="60" data-testid="supplier-taxid" [ngModel]="f().taxId" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ taxId: $event || null })" /></div>
          <div><label class="app-label" for="s-rep">Sales rep</label><input id="s-rep" class="app-input" maxlength="120" data-testid="supplier-rep" [ngModel]="f().repName" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ repName: $event || null })" /></div>
          <div><label class="app-label" for="s-limit">Credit limit (blank = none)</label><input id="s-limit" type="number" min="0" step="any" class="app-input font-data" data-testid="supplier-limit" [ngModel]="f().creditLimit" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ creditLimit: $event === null || $event === '' ? null : +$event })" /></div>
        </div>
        <div><label class="app-label" for="s-addr">Address</label><input id="s-addr" class="app-input" maxlength="300" [ngModel]="f().address" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ address: $event || null })" /></div>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" [checked]="f().isActive" (change)="patch({ isActive: !f().isActive })" /> Active</label>
        @if (dialogError()) { <p class="sys-alert sys-alert-danger" role="alert">{{ dialogError() }}</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(false)">Cancel</button><button type="submit" class="btn-primary" data-testid="supplier-save" [disabled]="saving() || !f().name.trim()">Save supplier</button></div>
      </form>
    </zp-dialog>
  `
})
export class SuppliersComponent implements OnInit {
  private readonly api = inject(InventoryApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly suppliers = signal<readonly SupplierDto[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly dialogError = signal<string | null>(null);
  protected readonly dialog = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly f = signal<SaveSupplierRequest>(blank());
  private readonly fieldErrors = signal<Readonly<Record<string, readonly string[]>>>({});
  protected readonly readOnly = computed(() => this.auth.accessModeFor(FEATURES.INVENTORY) === 'readonly');

  ngOnInit(): void { void this.load(); }

  protected fe = (name: string): string | null => this.fieldErrors()[name]?.[0] ?? null;
  protected patch(p: Partial<SaveSupplierRequest>): void { this.f.update((v) => ({ ...v, ...p })); }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try { this.suppliers.set(await firstValueFrom(this.api.suppliers())); }
    catch (err) { this.error.set(toApiError(err).message); } finally { this.loading.set(false); }
  }

  protected openEdit(s: SupplierDto | null): void {
    this.editingId.set(s?.id ?? null);
    this.f.set(s ? { name: s.name, contactName: s.contactName, email: s.email, phone: s.phone, address: s.address, paymentTermsDays: s.paymentTermsDays, isActive: s.isActive, taxId: s.taxId ?? null, repName: s.repName ?? null, creditLimit: s.creditLimit ?? null } : blank());
    this.fieldErrors.set({});
    this.dialogError.set(null);
    this.dialog.set(true);
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    this.fieldErrors.set({});
    this.dialogError.set(null);
    try {
      await firstValueFrom(this.api.saveSupplier(this.editingId(), { ...this.f(), name: this.f().name.trim() }));
      this.dialog.set(false);
      this.toast.success('Supplier saved.');
      await this.load();
    } catch (err) {
      const e = toApiError(err) as ApiError;
      this.fieldErrors.set(e.fieldErrors);
      this.dialogError.set(Object.keys(e.fieldErrors).length === 0 ? e.message : null);
    } finally { this.saving.set(false); }
  }
}
