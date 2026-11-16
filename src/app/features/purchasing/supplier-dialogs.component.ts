import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { SaveSupplierRequest, SupplierDto } from '../../core/models/ops.model';
import { toApiError } from '../../core/services/api.util';
import { InventoryApi } from '../../core/services/ops.services';
import { DialogComponent } from '../../shared/ui/feedback';

/** Find a supplier by typing part of its name, code, contact or tax id. */
@Component({
    selector: 'zp-supplier-lookup',
    imports: [FormsModule, DialogComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <zp-dialog [open]="open()" title="Find a supplier" (closed)="closed.emit()">
      <label class="app-label" for="sl-q">Search</label>
      <input id="sl-q" class="app-input" autocomplete="off" placeholder="Name, code, contact or tax id" data-testid="supplier-lookup-search" [ngModel]="text()" (ngModelChange)="text.set($event)" />
      <ul class="mt-3 max-h-72 divide-y divide-ink/10 overflow-auto rounded-lg border border-ink/10" data-testid="supplier-lookup-list">
        @for (s of matches(); track s.id) {
          <li><button type="button" class="app-focus w-full px-3 py-2 text-left hover:bg-primary/10" [attr.data-testid]="'supplier-pick-' + s.id" (click)="picked.emit(s)">
            <span class="block font-semibold">{{ s.name }} <span class="font-data text-xs text-primary">{{ s.code }}</span></span>
            <span class="block text-xs text-ink/70">{{ s.contactName }} {{ s.phone }}</span></button></li>
        } @empty { <li class="px-3 py-6 text-center text-sm text-ink/70">{{ loading() ? 'Loading...' : 'No supplier matches.' }}</li> }
      </ul>
      @if (error()) { <p class="sys-alert sys-alert-danger mt-3" role="alert">{{ error() }}</p> }
      <div class="mt-3 flex justify-between"><button type="button" class="btn-outline" data-testid="supplier-lookup-new" (click)="addNew.emit()">Add a new supplier</button>
        <button type="button" class="btn-ghost" (click)="closed.emit()">Close</button></div>
    </zp-dialog>
  `
})
export class SupplierLookupComponent {
  private readonly api = inject(InventoryApi);
  readonly open = input.required<boolean>();
  readonly picked = output<SupplierDto>();
  readonly addNew = output<void>();
  readonly closed = output<void>();

  protected readonly text = signal('');
  protected readonly all = signal<readonly SupplierDto[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly matches = computed(() => {
    const t = this.text().trim().toLowerCase();
    return this.all().filter((s) => s.isActive && (!t || [s.name, s.code, s.contactName, s.taxId, s.phone].some((x) => x?.toLowerCase().includes(t)))).slice(0, 50);
  });

  constructor() {
    effect(() => {
      if (this.open()) { this.text.set(''); void this.load(); }
    }, { allowSignalWrites: true });
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try { this.all.set(await firstValueFrom(this.api.suppliers())); } catch (err) { this.error.set(toApiError(err).message); } finally { this.loading.set(false); }
  }
}

interface SupplierForm { name: string; contactName: string; email: string; phone: string; address: string; taxId: string; repName: string; paymentTermsDays: number; creditLimit: string; isActive: boolean }

const blank = (): SupplierForm => ({ name: '', contactName: '', email: '', phone: '', address: '', taxId: '', repName: '', paymentTermsDays: 30, creditLimit: '', isActive: true });

/** Add or edit a supplier without leaving the order. */
@Component({
    selector: 'zp-supplier-form',
    imports: [FormsModule, DialogComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <zp-dialog [open]="open()" [title]="supplier() ? 'Edit supplier' : 'New supplier'" [wide]="true" (closed)="closed.emit()">
      <form class="grid gap-3 sm:grid-cols-2" (submit)="$event.preventDefault(); save()">
        <div class="sm:col-span-2"><label class="app-label" for="sf-name">Supplier name</label><input id="sf-name" class="app-input" maxlength="160" data-testid="supplier-name" [ngModel]="f().name" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ name: $event })" />
          @if (fieldError('name')) { <p class="mt-1 text-xs text-danger">{{ fieldError('name') }}</p> }</div>
        <div><label class="app-label" for="sf-contact">Contact person</label><input id="sf-contact" class="app-input" maxlength="120" [ngModel]="f().contactName" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ contactName: $event })" /></div>
        <div><label class="app-label" for="sf-rep">Sales rep</label><input id="sf-rep" class="app-input" maxlength="120" data-testid="supplier-rep" [ngModel]="f().repName" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ repName: $event })" /></div>
        <div><label class="app-label" for="sf-email">E-mail (orders are sent here)</label><input id="sf-email" type="email" class="app-input" maxlength="254" data-testid="supplier-email" [ngModel]="f().email" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ email: $event })" />
          @if (fieldError('email')) { <p class="mt-1 text-xs text-danger">{{ fieldError('email') }}</p> }</div>
        <div><label class="app-label" for="sf-phone">Phone</label><input id="sf-phone" class="app-input" maxlength="32" [ngModel]="f().phone" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ phone: $event })" /></div>
        <div class="sm:col-span-2"><label class="app-label" for="sf-address">Address</label><input id="sf-address" class="app-input" maxlength="300" [ngModel]="f().address" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ address: $event })" /></div>
        <div><label class="app-label" for="sf-tax">Tax ID</label><input id="sf-tax" class="app-input font-data" maxlength="60" data-testid="supplier-taxid" [ngModel]="f().taxId" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ taxId: $event })" /></div>
        <div><label class="app-label" for="sf-terms">Payment terms (days)</label><input id="sf-terms" type="number" min="0" max="365" class="app-input font-data" data-testid="supplier-terms" [ngModel]="f().paymentTermsDays" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ paymentTermsDays: +$event })" /></div>
        <div><label class="app-label" for="sf-limit">Credit limit (blank = none)</label><input id="sf-limit" type="number" min="0" step="any" class="app-input font-data" data-testid="supplier-limit" [ngModel]="f().creditLimit" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ creditLimit: $event })" />
          @if (fieldError('creditLimit')) { <p class="mt-1 text-xs text-danger">{{ fieldError('creditLimit') }}</p> }</div>
        @if (supplier()) { <label class="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" [ngModel]="f().isActive" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ isActive: $event })" /> Active</label> }
        @if (error()) { <p class="sys-alert sys-alert-danger sm:col-span-2" role="alert" data-testid="supplier-error">{{ error() }}</p> }
        <div class="flex justify-end gap-2 sm:col-span-2"><button type="button" class="btn-ghost" (click)="closed.emit()">Cancel</button>
          <button type="submit" class="btn-primary" data-testid="supplier-save" [disabled]="busy() || f().name.trim().length === 0">{{ supplier() ? 'Save supplier' : 'Add supplier' }}</button></div>
      </form>
    </zp-dialog>
  `
})
export class SupplierFormComponent {
  private readonly api = inject(InventoryApi);
  readonly open = input.required<boolean>();
  /** The supplier being edited, or null to add a new one. */
  readonly supplier = input<SupplierDto | null>(null);
  readonly saved = output<SupplierDto>();
  readonly closed = output<void>();

  protected readonly f = signal<SupplierForm>(blank());
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  private fieldErrors: Readonly<Record<string, readonly string[]>> = {};

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const s = this.supplier();
      this.error.set(null);
      this.fieldErrors = {};
      this.f.set(s ? { name: s.name, contactName: s.contactName ?? '', email: s.email ?? '', phone: s.phone ?? '', address: s.address ?? '', taxId: s.taxId ?? '', repName: s.repName ?? '', paymentTermsDays: s.paymentTermsDays, creditLimit: s.creditLimit == null ? '' : String(s.creditLimit), isActive: s.isActive } : blank());
    }, { allowSignalWrites: true });
  }

  protected patch(p: Partial<SupplierForm>): void { this.f.update((v) => ({ ...v, ...p })); }
  protected fieldError(name: string): string | null { return this.fieldErrors[name]?.[0] ?? null; }

  protected async save(): Promise<void> {
    const f = this.f();
    const body: SaveSupplierRequest = {
      name: f.name.trim(), contactName: f.contactName.trim() || null, email: f.email.trim() || null, phone: f.phone.trim() || null, address: f.address.trim() || null,
      paymentTermsDays: f.paymentTermsDays, isActive: f.isActive, taxId: f.taxId.trim() || null, repName: f.repName.trim() || null, creditLimit: f.creditLimit === '' ? null : Number(f.creditLimit)
    };
    this.busy.set(true);
    this.error.set(null);
    try {
      this.saved.emit(await firstValueFrom(this.api.saveSupplier(this.supplier()?.id ?? null, body)));
    } catch (err) {
      const e = toApiError(err);
      this.fieldErrors = e.fieldErrors;
      this.error.set(e.message);
    } finally { this.busy.set(false); }
  }
}
