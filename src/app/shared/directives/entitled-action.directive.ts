import { DestroyRef, Directive, ElementRef, computed, effect, inject, input } from '@angular/core';
import { AccessService, NOT_INCLUDED } from '../../core/services/access.service';

/**
 * Marks a button (or link) as an ACTION an organisation can be given or denied; the value is the permission code the button needs
 * (the same code the server checks):
 *
 *   <button type="button" zpAction="inventory.bins.manage">New bin</button>
 *
 * When the organisation was not given that action, the button stays visible but unavailable: `aria-disabled="true"` (the accessible way to show a
 * disabled control that can still be found and read), a tooltip with the plain reason, and its click is stopped. The click is stopped in the
 * CAPTURE phase on the element itself, so it runs before any `(click)` or form submission the template wires up. The button is deliberately NOT
 * given the native `disabled` attribute: a disabled control never receives a click, so the app could not notice the organisation had since been
 * given the action, whereas a blocked click re-reads the access snapshot (throttled) and the button heals itself.
 *
 * Attributes the host already had (a static `title`) are restored when the action is allowed again. It does NOT look at the person's role
 * (use `*hasScreenPermission` or `AuthService.hasPermission` for that), and it is UX only: the server answers 403 `not_entitled` regardless.
 */
@Directive({
  selector: '[zpAction]',
  standalone: true,
  host: {
    '[class.zp-action-withheld]': 'withheld()',
    '[attr.data-entitlement]': 'withheld() ? "withheld" : null'
  }
})
export class EntitledActionDirective {
  private readonly access = inject(AccessService);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  readonly zpAction = input.required<string>();

  protected readonly withheld = computed(() => !this.access.actionAllowed(this.zpAction()));

  constructor() {
    const original = { title: this.el.getAttribute('title'), ariaDisabled: this.el.getAttribute('aria-disabled') };
    const restore = (name: string, value: string | null, ours: string): void => {
      if (this.el.getAttribute(name) !== ours) return; // the template changed it since: leave that alone
      if (value === null) this.el.removeAttribute(name); else this.el.setAttribute(name, value);
    };

    const block = (event: Event): void => {
      if (!this.withheld()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.access.noteRefusal(); // maybe it was granted since sign-in: re-read the snapshot (at most every ten seconds)
    };
    this.el.addEventListener('click', block, true);
    inject(DestroyRef).onDestroy(() => this.el.removeEventListener('click', block, true));

    effect(() => {
      if (this.withheld()) {
        this.el.setAttribute('aria-disabled', 'true');
        this.el.setAttribute('title', NOT_INCLUDED);
      } else {
        restore('aria-disabled', original.ariaDisabled, 'true');
        restore('title', original.title, NOT_INCLUDED);
      }
    });
  }
}
