import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { toApiError } from '../../core/services/api.util';
import { PlatformAuthService } from '../../core/services/subscription.services';

/** Sign-in for the people who run ZestPoint itself. It is not a company login: operators have no company, venue or staff code. */
@Component({
    selector: 'zp-platform-login',
    imports: [FormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <main class="grid min-h-screen place-items-center bg-canvas p-6 text-ink">
      <form class="app-card w-full max-w-sm space-y-4" (submit)="$event.preventDefault(); submit()" aria-label="Platform sign in">
        <div><h1 class="text-xl font-bold">ZestPoint platform</h1><p class="text-sm text-ink/80">For ZestPoint operators only. Company staff sign in from the normal sign-in page.</p></div>
        <div><label class="app-label" for="pl-email">Email</label><input id="pl-email" type="email" class="app-input" autocomplete="username" data-testid="platform-email" [ngModel]="email()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="email.set($event)" /></div>
        <div><label class="app-label" for="pl-pass">Password</label><input id="pl-pass" type="password" class="app-input" autocomplete="current-password" data-testid="platform-password" [ngModel]="password()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="password.set($event)" /></div>
        @if (error()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="platform-error">{{ error() }}</p> }
        <button type="submit" class="btn-primary w-full" data-testid="platform-submit" [disabled]="busy() || !email() || !password()">{{ busy() ? 'Signing in...' : 'Sign in' }}</button>
      </form>
    </main>
  `
})
export class PlatformLoginComponent implements OnInit {
  private readonly platform = inject(PlatformAuthService);
  private readonly router = inject(Router);

  /** An operator who is already signed in (their cookie restores it) has no use for this form. */
  async ngOnInit(): Promise<void> {
    await this.platform.ready();
    if (this.platform.isSignedIn()) await this.router.navigate(['/platform/overview']);
  }

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.platform.login(this.email().trim(), this.password()));
      await this.router.navigate(['/platform/overview']);
    } catch (err) {
      this.error.set(toApiError(err).message);
    } finally { this.busy.set(false); }
  }
}
