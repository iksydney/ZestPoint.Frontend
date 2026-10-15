import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { BranchDto } from '../../core/models/staff.model';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { BranchesApiService } from '../../core/services/staff.services';
import { DialogComponent, ToastService } from '../../shared/ui/feedback';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';

/** Settings -> Branches and outlets. Staff access is granted per branch, so branches exist before staff are assigned. */
@Component({
  selector: 'zp-branches',
  standalone: true,
  imports: [FormsModule, DialogComponent, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-4 flex items-center justify-between gap-2">
      <div><h1 class="text-2xl font-bold">Branches &amp; outlets</h1><p class="mt-1 text-sm text-ink/80">Each branch can have its own staff access and stock.</p></div>
      @if (canManage()) { <button type="button" class="btn-primary" (click)="openNew()" data-testid="add-branch">Add branch</button> }
    </div>
    @if (error()) { <p class="sys-alert sys-alert-danger mb-3" role="alert">{{ error() }}</p> }
    <div class="app-card overflow-x-auto p-0">
      <table class="app-table">
        <caption class="sr-only">Branches</caption>
        <thead><tr><th>Name</th><th>Code</th><th>Address</th><th>Status</th><th></th></tr></thead>
        <tbody>
          @for (b of branches(); track b.id) {
            <tr [attr.data-testid]="'branch-' + b.code">
              <td class="font-medium">{{ b.name }} @if (b.isHeadOffice) { <zp-status-badge tone="primary">Head office</zp-status-badge> }</td>
              <td class="font-mono text-xs">{{ b.code }}</td><td>{{ b.address }}</td>
              <td><zp-status-badge [tone]="b.isActive ? 'success' : 'danger'">{{ b.isActive ? 'Active' : 'Inactive' }}</zp-status-badge></td>
              <td class="text-right">@if (canManage()) { <button type="button" class="btn-outline px-2 py-1 text-sm" (click)="openEdit(b)">Edit</button> }</td>
            </tr>
          } @empty { <tr><td colspan="5" class="py-8 text-center text-ink/70">{{ loading() ? 'Loading...' : 'No branches yet.' }}</td></tr> }
        </tbody>
      </table>
    </div>

    <zp-dialog [open]="open()" [title]="editingId() ? 'Edit branch' : 'Add a branch'" (closed)="open.set(false)">
      <form class="space-y-3" (ngSubmit)="save()" novalidate>
        <div><label class="app-label" for="br-name">Name</label>
          <input id="br-name" name="name" class="app-input" [ngModel]="f().name" (ngModelChange)="patch({ name: $event })" data-testid="branch-name" />
          @if (fe()['name']) { <p class="app-error" role="alert">{{ fe()['name'] }}</p> }</div>
        <div><label class="app-label" for="br-code">Code</label>
          <input id="br-code" name="code" class="app-input w-40 uppercase" maxlength="20" [ngModel]="f().code" (ngModelChange)="patch({ code: $event })" data-testid="branch-code" />
          @if (fe()['code']) { <p class="app-error" role="alert">{{ fe()['code'] }}</p> }</div>
        <div><label class="app-label" for="br-addr">Address</label>
          <input id="br-addr" name="address" class="app-input" [ngModel]="f().address" (ngModelChange)="patch({ address: $event })" /></div>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="active" [ngModel]="f().isActive" (ngModelChange)="patch({ isActive: $event })" /> Active</label>
        @if (formError()) { <p class="app-error" role="alert">{{ formError() }}</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="open.set(false)">Cancel</button>
          <button type="submit" class="btn-primary" [disabled]="saving()" data-testid="save-branch">{{ saving() ? 'Saving...' : 'Save' }}</button></div>
      </form>
    </zp-dialog>
  `
})
export class BranchesComponent {
  private readonly api = inject(BranchesApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly canManage = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.BRANCHES_MANAGE));
  protected readonly branches = signal<readonly BranchDto[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly open = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly f = signal({ name: '', code: '', address: '', isActive: true });
  protected readonly fe = signal<Record<string, string>>({});
  protected readonly formError = signal<string | null>(null);
  protected readonly saving = signal(false);

  constructor() { this.load(); }

  private load(): void {
    this.api.list().subscribe({
      next: (b) => { this.branches.set(b); this.loading.set(false); },
      error: (e: unknown) => { this.error.set(toApiError(e).message); this.loading.set(false); }
    });
  }

  protected patch(change: Partial<ReturnType<typeof this.f>>): void { this.f.update((cur) => ({ ...cur, ...change })); }

  protected openNew(): void {
    this.editingId.set(null);
    this.f.set({ name: '', code: '', address: '', isActive: true });
    this.fe.set({});
    this.formError.set(null);
    this.open.set(true);
  }

  protected openEdit(b: BranchDto): void {
    this.editingId.set(b.id);
    this.f.set({ name: b.name, code: b.code, address: b.address ?? '', isActive: b.isActive });
    this.fe.set({});
    this.formError.set(null);
    this.open.set(true);
  }

  protected async save(): Promise<void> {
    const v = this.f();
    this.saving.set(true);
    this.fe.set({});
    this.formError.set(null);
    const body = { name: v.name.trim(), code: v.code.trim(), address: v.address.trim() || null, timeZoneId: null, isActive: v.isActive };
    try {
      const id = this.editingId();
      await firstValueFrom(id ? this.api.update(id, body) : this.api.create(body));
      this.toast.success('Branch saved.');
      this.open.set(false);
      this.load();
    } catch (err) {
      const e = toApiError(err);
      const map: Record<string, string> = {};
      for (const [k, m] of Object.entries(e.fieldErrors)) map[k] = m[0] ?? '';
      this.fe.set(map);
      this.formError.set(Object.keys(map).length ? null : e.message);
    } finally {
      this.saving.set(false);
    }
  }
}
