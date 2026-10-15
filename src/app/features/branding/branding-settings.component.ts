import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { AuthService } from '../../core/services/auth.service';
import { BrandingEditorComponent } from './branding-editor.component';

/** Settings -> Branding & Appearance. Anyone with settings.branding.view may look; only managers can change it. */
@Component({
  selector: 'zp-branding-settings',
  standalone: true,
  imports: [BrandingEditorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="text-2xl font-bold">Branding &amp; Appearance</h1>
    <p class="mb-4 mt-1 text-ink/80">Changes appear in the preview straight away. Other people see them only after you save and apply.</p>
    @if (canManage()) {
      <zp-branding-editor mode="settings" />
    } @else {
      <p class="sys-alert sys-alert-info" role="status">You can view the current theme but not change it. Ask an administrator for branding access.</p>
    }
  `
})
export class BrandingSettingsComponent {
  private readonly auth = inject(AuthService);
  protected readonly canManage = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.SETTINGS_BRANDING_MANAGE));
}
