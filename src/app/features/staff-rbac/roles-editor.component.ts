import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, forkJoin } from 'rxjs';
import { SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { PermissionDto, RoleDto } from '../../core/models/staff.model';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { RolesApiService } from '../../core/services/staff.services';
import { StationsService } from '../../core/services/stations.service';
import { ConfirmService, ToastService } from '../../shared/ui/feedback';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';

interface RoleDraft { name: string; description: string; permissions: string[]; stationIds: string[]; }

/**
 * Role and permission editor: grouped toggles with plain-language descriptions. The server decides what the signed-in
 * person may grant, so toggles for permissions they do not hold are disabled here AND rejected by the API if forced.
 */
@Component({
    selector: 'zp-roles-editor',
    imports: [FormsModule, StatusBadgeComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    @if (loading()) { <p role="status">Loading roles...</p> } @else {
      <div class="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <aside aria-label="Roles" class="space-y-1">
          @for (r of roles(); track r.id) {
            <button type="button" class="app-focus w-full rounded-lg border px-3 py-2 text-left text-sm"
                    [class]="selectedId() === r.id && !creating() ? 'border-primary bg-primary/10' : 'border-ink/15 hover:bg-ink/5'" (click)="select(r)" [attr.data-testid]="'role-' + (r.systemKey ?? r.name)">
              <span class="block font-semibold">{{ r.name }}</span>
              <span class="text-xs text-ink/70">{{ r.memberCount }} staff{{ r.isSystem ? ' - built in' : '' }}</span>
            </button>
          }
          @if (canManage()) { <button type="button" class="btn-outline mt-2 w-full" (click)="startCreate()" data-testid="new-role">New custom role</button> }
        </aside>

        <section class="app-card space-y-3" aria-label="Role details" data-testid="role-editor">
          @if (error()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="role-error">{{ error() }}</p> }
          @if (!draft()) { <p class="text-ink/70">Select a role to see what it allows.</p> } @else {
            @if (readOnlyReason(); as why) { <p class="sys-alert sys-alert-info" role="status">{{ why }}</p> }
            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="app-label" for="role-name">Name</label>
                <input id="role-name" class="app-input" [ngModel]="draft()!.name" (ngModelChange)="patch({ name: $event })" [disabled]="locked()" maxlength="80" data-testid="role-name" />
              </div>
              <div>
                <label class="app-label" for="role-desc">Description</label>
                <input id="role-desc" class="app-input" [ngModel]="draft()!.description" (ngModelChange)="patch({ description: $event })" [disabled]="locked()" maxlength="300" />
              </div>
            </div>

            @for (g of groups(); track g.name) {
              <fieldset class="rounded-lg border border-ink/15 p-3">
                <legend class="px-1 text-sm font-bold">{{ g.name }}</legend>
                <ul class="space-y-2">
                  @for (p of g.items; track p.key) {
                    <li class="flex items-start gap-3">
                      <input type="checkbox" class="mt-1 h-4 w-4" [id]="'perm-' + p.key" [checked]="draft()!.permissions.includes(p.key)"
                             [disabled]="locked() || !holds(p.key)" (change)="toggle(p.key)" [attr.data-testid]="'perm-' + p.key" />
                      <label [for]="'perm-' + p.key" class="text-sm">
                        <span class="font-mono text-xs text-ink/70">{{ p.key }}</span>
                        <span class="block">{{ p.description }}</span>
                        @if (!holds(p.key) && !locked()) { <span class="text-xs text-warning">You do not hold this permission, so you cannot grant or remove it.</span> }
                      </label>
                    </li>
                  }
                </ul>
              </fieldset>
            }

            @if (worksAtStations() && stations().length > 0) {
              <fieldset class="rounded-lg border border-ink/15 p-3" data-testid="role-stations">
                <legend class="px-1 text-sm font-bold">Stations this role works at</legend>
                <p class="mb-2 text-sm text-ink/80">Tick the kitchen to make this a kitchen role: the people who hold it hear only the kitchen's orders, on screen and on their phone, and are not called for a drink. Tick nothing and the role works at every station.</p>
                <ul class="flex flex-wrap gap-x-4 gap-y-2">
                  @for (s of stations(); track s.id) {
                    <li class="flex items-center gap-2">
                      <input type="checkbox" class="h-4 w-4" [id]="'station-' + s.id" [checked]="draft()!.stationIds.includes(s.id)" [disabled]="locked()" (change)="toggleStation(s.id)" [attr.data-testid]="'role-station-' + s.name" />
                      <label [for]="'station-' + s.id" class="text-sm font-semibold">{{ s.name }}</label>
                    </li>
                  }
                </ul>
                <p class="mt-2 text-xs text-ink/70" data-testid="role-stations-summary">{{ stationsSummary() }}</p>
              </fieldset>
            }

            @if (canManage()) {
              <div class="flex flex-wrap items-center gap-2 border-t border-ink/10 pt-3">
                <button type="button" class="btn-primary" (click)="save()" [disabled]="saving() || locked() || !dirty()" data-testid="save-role">{{ creating() ? 'Create role' : 'Save changes' }}</button>
                @if (!creating() && selected()) {
                  <button type="button" class="btn-outline" (click)="duplicate()" [disabled]="saving()" data-testid="duplicate-role">Duplicate</button>
                  @if (!selected()!.isSystem) { <button type="button" class="btn-ghost text-danger" (click)="remove()" [disabled]="saving()" data-testid="delete-role">Delete</button> }
                }
                @if (selected()?.isSuperAdmin) { <zp-status-badge tone="primary">All permissions, always</zp-status-badge> }
              </div>
            }
          }
        </section>
      </div>
    }
  `
})
export class RolesEditorComponent {
  private readonly api = inject(RolesApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly stationsService = inject(StationsService);

  protected readonly stations = this.stationsService.list;
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly roles = signal<RoleDto[]>([]);
  protected readonly catalogue = signal<PermissionDto[]>([]);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly creating = signal(false);
  protected readonly draft = signal<RoleDraft | null>(null);
  private readonly baseline = signal('');

  /** The station list means something only to a role that can work a station's orders. */
  protected readonly worksAtStations = computed(() => this.draft()?.permissions.includes(SCREEN_PERMISSIONS.POS_BAR_ORDER_FULFIL) ?? false);

  protected readonly stationsSummary = computed(() => {
    const chosen = this.draft()?.stationIds ?? [];
    const names = this.stations().filter((s) => chosen.includes(s.id)).map((s) => s.name);
    return names.length === 0 ? 'Works at every station.' : `Works only at: ${names.join(', ')}.`;
  });

  protected readonly canManage = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.ROLES_MANAGE));
  protected readonly selected = computed(() => this.roles().find((r) => r.id === this.selectedId()) ?? null);
  protected readonly dirty = computed(() => JSON.stringify(this.draft()) !== this.baseline());
  protected readonly locked = computed(() => !this.canManage() || (!this.creating() && !(this.selected()?.canEdit ?? false)));

  protected readonly groups = computed(() => {
    const map = new Map<string, PermissionDto[]>();
    for (const p of this.catalogue()) map.set(p.group, [...(map.get(p.group) ?? []), p]);
    return [...map].map(([name, items]) => ({ name, items }));
  });

  protected readonly readOnlyReason = computed(() => {
    if (this.creating()) return null;
    const r = this.selected();
    if (!r) return null;
    if (r.isSuperAdmin) return 'The owner role always holds every permission and cannot be changed.';
    if (!this.canManage()) return 'You can view this role but you do not have permission to change roles.';
    if (!r.canEdit) return 'This role has permissions you do not hold yourself, so you cannot edit it.';
    return null;
  });

  constructor() {
    void this.stationsService.load();   // names for the station section; without them the section is simply not shown
    forkJoin({ roles: this.api.list(), catalogue: this.api.permissions() }).subscribe({
      next: ({ roles, catalogue }) => { this.roles.set(roles); this.catalogue.set(catalogue); this.loading.set(false); if (roles[0]) this.select(roles[0]); },
      error: (e: unknown) => { this.error.set(toApiError(e).message); this.loading.set(false); }
    });
    this.destroyRef.onDestroy(() => undefined);
  }

  /** The signed-in person can only grant or remove what they hold. The owner holds everything. */
  protected holds(key: string): boolean {
    return this.auth.hasPermission(key);
  }

  protected select(r: RoleDto): void {
    this.creating.set(false);
    this.selectedId.set(r.id);
    this.setDraft({ name: r.name, description: r.description, permissions: [...r.permissions], stationIds: [...(r.stationIds ?? [])] });
    this.error.set(null);
  }

  protected startCreate(): void {
    this.creating.set(true);
    this.selectedId.set(null);
    this.setDraft({ name: '', description: '', permissions: [], stationIds: [] });
    this.error.set(null);
  }

  private setDraft(d: RoleDraft): void {
    this.draft.set(d);
    this.baseline.set(JSON.stringify(d));
  }

  protected patch(change: Partial<{ name: string; description: string }>): void {
    this.draft.update((d) => (d ? { ...d, ...change } : d));
  }

  protected toggle(key: string): void {
    this.draft.update((d) => d ? { ...d, permissions: d.permissions.includes(key) ? d.permissions.filter((k) => k !== key) : [...d.permissions, key] } : d);
  }

  protected toggleStation(id: string): void {
    this.draft.update((d) => d ? { ...d, stationIds: d.stationIds.includes(id) ? d.stationIds.filter((s) => s !== id) : [...d.stationIds, id] } : d);
  }

  protected async save(): Promise<void> {
    const d = this.draft();
    if (!d) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      // The stations mean something only while the role can work a station's orders, so a role that cannot is saved with none.
      const stationIds = d.permissions.includes(SCREEN_PERMISSIONS.POS_BAR_ORDER_FULFIL) ? d.stationIds : [];
      const request = { name: d.name.trim(), description: d.description.trim() || null, permissions: d.permissions, stationIds, rowVersion: this.creating() ? null : this.selected()?.rowVersion ?? null };
      const saved = await firstValueFrom(this.creating() ? this.api.create(request) : this.api.update(this.selectedId()!, request));
      this.roles.update((list) => this.creating() ? [...list, saved] : list.map((r) => (r.id === saved.id ? saved : r)));
      this.toast.success(this.creating() ? 'Role created.' : 'Role saved. Changes apply to staff straight away.');
      this.select(saved);
    } catch (err) {
      const e = toApiError(err);
      this.error.set(e.fieldErrors['permissions']?.[0] ?? e.fieldErrors['name']?.[0] ?? e.fieldErrors['stationIds']?.[0] ?? e.message);
    } finally {
      this.saving.set(false);
    }
  }

  protected async duplicate(): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      const copy = await firstValueFrom(this.api.duplicate(this.selectedId()!));
      this.roles.update((list) => [...list, copy]);
      this.toast.success(`Created "${copy.name}".`);
      this.select(copy);
    } catch (err) {
      this.error.set(toApiError(err).message);
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const r = this.selected();
    if (!r) return;
    if (!(await this.confirm.ask({ title: `Delete "${r.name}"?`, message: 'Roles still assigned to staff cannot be deleted.', confirmLabel: 'Delete role', danger: true }))) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.delete(r.id));
      this.roles.update((list) => list.filter((x) => x.id !== r.id));
      this.toast.success('Role deleted.');
      const next = this.roles()[0];
      if (next) this.select(next);
      else this.draft.set(null);
    } catch (err) {
      this.error.set(toApiError(err).message);
    } finally {
      this.saving.set(false);
    }
  }
}
