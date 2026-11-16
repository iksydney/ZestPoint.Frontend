import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { AuthService } from '../../core/services/auth.service';
import { AuditLogComponent } from './audit-log.component';
import { RolesEditorComponent } from './roles-editor.component';
import { StaffListComponent } from './staff-list.component';

type Tab = 'staff' | 'roles' | 'activity';

/** Staff &amp; roles: people, role/permission editor and the audit trail. Tabs a person may not use are simply not offered. */
@Component({
    selector: 'zp-staff-rbac',
    imports: [StaffListComponent, RolesEditorComponent, AuditLogComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <h1 class="text-2xl font-bold">Staff &amp; roles</h1>
    <p class="mb-4 mt-1 text-sm text-ink/80">Invite your team, give each person the access their job needs, and review what changed.</p>

    <div role="tablist" aria-label="Staff sections" class="mb-4 inline-flex gap-1 rounded-lg border border-ink/15 p-1">
      @for (t of tabs(); track t.key) {
        <button type="button" role="tab" class="app-focus rounded-md px-4 py-1.5 text-sm font-medium" [attr.aria-selected]="tab() === t.key"
                [class]="tab() === t.key ? 'bg-primary text-on-primary' : 'text-ink/80 hover:bg-ink/10'" (click)="tab.set(t.key)" [attr.data-testid]="'tab-' + t.key">{{ t.label }}</button>
      }
    </div>

    @switch (tab()) {
      @case ('staff') { <zp-staff-list /> }
      @case ('roles') { <zp-roles-editor /> }
      @case ('activity') { <zp-audit-log /> }
    }
  `
})
export class StaffRbacComponent {
  private readonly auth = inject(AuthService);

  protected readonly tab = signal<Tab>('staff');
  protected readonly tabs = computed<{ key: Tab; label: string }[]>(() => [
    { key: 'staff', label: 'Staff' },
    { key: 'roles', label: 'Roles & permissions' },
    ...(this.auth.hasPermission(SCREEN_PERMISSIONS.AUDIT_VIEW) ? [{ key: 'activity' as Tab, label: 'Activity log' }] : [])
  ]);
}
