import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { InviteInfoDto } from '../../core/models/staff.model';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { StaffApiService } from '../../core/services/staff.services';

/**
 * Landing page for an emailed staff invitation (also the target of the mobile deep link). An invitation that carries a default PIN
 * asks for it once and prompts for a new PIN; otherwise choose a password (and/or PIN). Either way the person ends up signed in.
 */
@Component({
  selector: 'zp-accept-invite',
  standalone: true,
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="grid min-h-screen place-items-center p-4 text-ink">
      <div class="w-full max-w-sm">
        @if (loading()) { <p role="status" class="text-center">Checking your invitation...</p> }
        @else if (!info()) {
          <div class="app-card space-y-2 text-center">
            <h1 class="text-xl font-bold">This invitation cannot be used</h1>
            <p class="text-sm text-ink/80">It may have expired or already been accepted. Ask your administrator to send a new one.</p>
            <a routerLink="/login" class="btn-primary">Go to sign in</a>
          </div>
        } @else {
          <form class="app-card space-y-4" (ngSubmit)="submit()" novalidate>
            <div class="text-center"><h1 class="text-xl font-bold">Welcome, {{ info()!.displayName }}</h1>
              <p class="text-sm text-ink/80">Finish setting up your account for {{ info()!.companyName }}.</p></div>
            @if (info()!.requiresPassword) {
              <div><label class="app-label" for="i-pw">Choose a password</label>
                <input id="i-pw" type="password" class="app-input" autocomplete="new-password" [ngModel]="password()" (ngModelChange)="password.set($event)" name="password" data-testid="invite-password" />
                <p class="app-hint">At least 10 characters with upper case, lower case and a number.</p></div>
            }
            @if (info()!.requiresCurrentPin) {
              <div><label class="app-label" for="i-cur">Default PIN from your invitation e-mail</label>
                <input id="i-cur" type="password" inputmode="numeric" class="app-input w-40" autocomplete="one-time-code" maxlength="12" [ngModel]="currentPin()" (ngModelChange)="currentPin.set($event)" name="currentPin"
                       [attr.aria-invalid]="!!pinErrors()['currentPin']" data-testid="invite-current-pin" />
                @if (pinErrors()['currentPin']) { <p class="app-error" role="alert">{{ pinErrors()['currentPin'] }}</p> }</div>
              <div><label class="app-label" for="i-pin">Choose your own PIN</label>
                <input id="i-pin" type="password" inputmode="numeric" class="app-input w-40" autocomplete="new-password" maxlength="12" [ngModel]="pin()" (ngModelChange)="pin.set($event)" name="pin"
                       [attr.aria-invalid]="!!pinErrors()['pin']" aria-describedby="i-pin-hint" data-testid="invite-pin" />
                <p id="i-pin-hint" class="app-hint">4 to 12 digits. You will use it with your staff code to sign in at the till.</p>
                @if (pinErrors()['pin']) { <p class="app-error" role="alert">{{ pinErrors()['pin'] }}</p> }</div>
              <div><label class="app-label" for="i-pin2">Confirm your PIN</label>
                <input id="i-pin2" type="password" inputmode="numeric" class="app-input w-40" autocomplete="new-password" maxlength="12" [ngModel]="pinConfirm()" (ngModelChange)="pinConfirm.set($event)" name="pinConfirm" data-testid="invite-pin-confirm" />
                @if (pinConfirm().length > 0 && pinConfirm() !== pin()) { <p class="app-error" role="alert">The PINs do not match.</p> }</div>
            } @else {
              <div><label class="app-label" for="i-pin">PIN for the till (optional)</label>
                <input id="i-pin" type="password" inputmode="numeric" class="app-input w-40" autocomplete="off" maxlength="12" [ngModel]="pin()" (ngModelChange)="pin.set($event)" name="pin" data-testid="invite-pin" /></div>
            }
            @if (error()) { <p class="app-error" role="alert" data-testid="invite-error">{{ error() }}</p> }
            <button type="submit" class="btn-primary w-full" [disabled]="busy() || !canSubmit()" data-testid="invite-submit">{{ busy() ? 'Setting up...' : 'Finish and sign in' }}</button>
          </form>
        }
      </div>
    </main>
  `
})
export class AcceptInviteComponent {
  private readonly api = inject(StaffApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  private readonly venue: string;
  private readonly token: string;

  protected readonly loading = signal(true);
  protected readonly info = signal<InviteInfoDto | null>(null);
  protected readonly password = signal('');
  protected readonly pin = signal('');
  protected readonly currentPin = signal('');
  protected readonly pinConfirm = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly pinErrors = signal<Record<string, string>>({});
  protected readonly canSubmit = computed(() => {
    const i = this.info();
    const passwordOk = i?.requiresPassword ? this.password().length >= 10 : true;
    if (i?.requiresCurrentPin) {
      return passwordOk && this.currentPin().length >= 4 && /^\d{4,12}$/.test(this.pin()) && this.pin() === this.pinConfirm() && this.pin() !== this.currentPin();
    }
    return passwordOk && (this.password().length > 0 || this.pin().length > 0);
  });

  constructor() {
    const q = inject(ActivatedRoute).snapshot.queryParamMap;
    this.venue = q.get('venue') ?? '';
    this.token = q.get('token') ?? '';
    this.api.invite(this.venue, this.token).subscribe({
      next: (i) => { this.info.set(i); this.loading.set(false); },
      error: () => { this.info.set(null); this.loading.set(false); }
    });
  }

  protected submit(): void {
    if (this.busy() || !this.canSubmit()) return;
    this.busy.set(true);
    this.error.set(null);
    this.pinErrors.set({});
    this.api.acceptInvite({
      tenantSlug: this.venue, token: this.token, password: this.password() || null, pin: this.pin() || null, currentPin: this.currentPin() || null
    }).subscribe({
      next: (session) => { this.auth.adopt(session); void this.router.navigateByUrl('/app'); },
      error: (e: unknown) => {
        this.busy.set(false);
        const err = toApiError(e);
        const pinFields: Record<string, string> = {};
        for (const f of ['currentPin', 'pin']) if (err.fieldErrors[f]?.[0]) pinFields[f] = err.fieldErrors[f]![0]!;
        this.pinErrors.set(pinFields);
        this.error.set(err.fieldErrors['password']?.[0] ?? (Object.keys(pinFields).length ? null : err.message));
      }
    });
  }
}
