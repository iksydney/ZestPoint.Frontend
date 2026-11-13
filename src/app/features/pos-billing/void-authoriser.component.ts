import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { VoidAuthorizer } from '../../core/models/ops.model';

/**
 * Who authorises a void: a supervisor types their own staff code and PIN, or an administrator their email and password. It is asked for
 * every void, whoever is signed in on the device, and it signs nobody in. The values go to the server with the void and are kept nowhere:
 * the component is created when the dialog opens and gone when it closes.
 *
 * The fields are marked so a browser's password manager does not fill the signed-in person's own saved sign-in here, which would turn an
 * unlocked till into an authorisation.
 */
@Component({
  selector: 'zp-void-authoriser',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="space-y-2 rounded-lg border border-ink/15 p-3" data-testid="void-authoriser">
      <legend class="app-label px-1">Who authorises this?</legend>
      <p class="text-xs text-ink/70">A supervisor or an administrator enters their own details. This does not sign them in on this device.</p>
      <div class="flex gap-1" role="tablist" aria-label="How they prove who they are">
        <button type="button" role="tab" class="app-badge min-h-11 cursor-pointer px-3" [class]="mode() === 'pin' ? 'bg-primary text-on-primary' : 'bg-ink/10'" [attr.aria-selected]="mode() === 'pin'" data-testid="auth-mode-pin" (click)="mode.set('pin')">Staff code and PIN</button>
        <button type="button" role="tab" class="app-badge min-h-11 cursor-pointer px-3" [class]="mode() === 'password' ? 'bg-primary text-on-primary' : 'bg-ink/10'" [attr.aria-selected]="mode() === 'password'" data-testid="auth-mode-password" (click)="mode.set('password')">Email and password</button>
      </div>
      @if (mode() === 'pin') {
        <div class="grid gap-2 sm:grid-cols-2">
          <div><label class="app-label" [attr.for]="id + '-code'">Supervisor's staff code</label>
            <input class="app-input" [id]="id + '-code'" name="void-authoriser-code" autocomplete="off" autocapitalize="characters" data-1p-ignore data-lpignore="true" placeholder="e.g. BHL-007" maxlength="20" data-testid="auth-code"
                   [ngModel]="code()" (ngModelChange)="code.set($event)" [ngModelOptions]="{ standalone: true }" /></div>
          <div><label class="app-label" [attr.for]="id + '-pin'">Their PIN</label>
            <input class="app-input" [id]="id + '-pin'" name="void-authoriser-pin" type="password" inputmode="numeric" autocomplete="one-time-code" data-1p-ignore data-lpignore="true" maxlength="12" data-testid="auth-pin"
                   [ngModel]="pin()" (ngModelChange)="pin.set($event)" [ngModelOptions]="{ standalone: true }" /></div>
        </div>
      } @else {
        <div class="grid gap-2 sm:grid-cols-2">
          <div><label class="app-label" [attr.for]="id + '-email'">Administrator's email</label>
            <input class="app-input" [id]="id + '-email'" name="void-authoriser-email" type="email" autocomplete="off" data-1p-ignore data-lpignore="true" maxlength="254" data-testid="auth-email"
                   [ngModel]="email()" (ngModelChange)="email.set($event)" [ngModelOptions]="{ standalone: true }" /></div>
          <div><label class="app-label" [attr.for]="id + '-password'">Their password</label>
            <input class="app-input" [id]="id + '-password'" name="void-authoriser-secret" type="password" autocomplete="one-time-code" data-1p-ignore data-lpignore="true" maxlength="128" data-testid="auth-password"
                   [ngModel]="password()" (ngModelChange)="password.set($event)" [ngModelOptions]="{ standalone: true }" /></div>
        </div>
      }
    </fieldset>
  `
})
export class VoidAuthoriserComponent {
  private static next = 0;
  protected readonly id = `zp-va-${VoidAuthoriserComponent.next++}`;

  /** Increase to wipe the secret after a refused attempt, so it is typed again and never left sitting in the box. */
  readonly clearSecret = input(0);
  /** The credentials once both halves of one pair are filled in, otherwise null. */
  readonly changed = output<VoidAuthorizer | null>();

  protected readonly mode = signal<'pin' | 'password'>('pin');
  protected readonly code = signal('');
  protected readonly pin = signal('');
  protected readonly email = signal('');
  protected readonly password = signal('');

  private readonly value = computed<VoidAuthorizer | null>(() => {
    if (this.mode() === 'pin') return this.code().trim() && this.pin() ? { staffCode: this.code().trim(), pin: this.pin() } : null;
    return this.email().trim() && this.password() ? { email: this.email().trim(), password: this.password() } : null;
  });

  constructor() {
    effect(() => this.changed.emit(this.value()));
    effect(() => {
      if (this.clearSecret() === 0) return;
      this.pin.set('');
      this.password.set('');
    }, { allowSignalWrites: true });
  }
}
