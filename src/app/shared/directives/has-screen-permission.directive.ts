import { Directive, EmbeddedViewRef, TemplateRef, ViewContainerRef, effect, inject, input } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';

/**
 * Structural directive that renders its host only when the signed-in staff member holds the
 * permission (or any of several):
 *
 *   <button *hasScreenPermission="'POS_VOID_ITEM'">Void</button>
 *   <button *hasScreenPermission="['INV_VIEW', 'INV_WEIGHED_AUDIT']">Audit</button>
 *
 * Reactive: re-evaluates when the session signal changes (sign-in, permission refresh).
 * This is UX only — the API independently enforces [ScreenPermission].
 */
@Directive({ selector: '[hasScreenPermission]', standalone: true })
export class HasScreenPermissionDirective {
  private readonly auth = inject(AuthService);
  private readonly template = inject<TemplateRef<unknown>>(TemplateRef);
  private readonly container = inject(ViewContainerRef);
  private view: EmbeddedViewRef<unknown> | null = null;

  readonly hasScreenPermission = input.required<string | readonly string[]>();

  constructor() {
    effect(() => {
      const required = this.hasScreenPermission();
      const codes = typeof required === 'string' ? [required] : required;
      const allowed = this.auth.hasAnyPermission(codes);

      if (allowed && !this.view) {
        this.view = this.container.createEmbeddedView(this.template);
      } else if (!allowed && this.view) {
        this.container.clear();
        this.view = null;
      }
    });
  }
}
