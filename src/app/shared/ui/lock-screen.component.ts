import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { BarStore } from '../../core/services/bar.services';
import { IdleLockService } from '../../core/services/idle-lock.service';

/**
 * The lock that covers the application after two minutes with no activity, and the short warning before it.
 *
 * It asks for what the sign-in page asks for: a staff code and PIN, or an e-mail and password. The person who was working comes back
 * to exactly where they were. Someone else can sign in instead: the application then starts again for them, on their own first screen
 * and with only what their role allows, and nothing of the first person's screen is shown to them.
 */
@Component({
  selector: 'zp-lock-screen',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (lock.warning(); as left) {
      <div class="fixed bottom-4 left-1/2 z-[95] w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border-2 border-primary bg-panel p-3 text-ink shadow-2xl print:hidden" role="alert" data-testid="idle-warning">
        <p class="text-sm font-semibold">Still there? The screen locks in {{ left }} seconds.</p>
        <button type="button" class="btn-primary mt-2 w-full" data-testid="idle-stay" (click)="lock.stay()">I am still here</button>
      </div>
    }
    @if (lock.locked()) {
      <div class="fixed inset-0 z-[100] flex items-center justify-center bg-canvas p-4 text-ink print:hidden" role="dialog" aria-modal="true" aria-labelledby="lock-title" data-testid="lock-screen">
        <form class="app-card w-full max-w-sm space-y-4" autocomplete="off" (submit)="$event.preventDefault(); submit()">
          <div>
            <h1 id="lock-title" class="text-xl font-bold">Screen locked</h1>
            <p class="mt-1 text-sm text-ink/80">Nobody touched it for a while. {{ who() }}'s work is kept. Sign in to carry on, or sign in as yourself to start your own.</p>
            @if (bar.bellCount() > 0) { <p class="mt-2 text-sm font-semibold" role="status" data-testid="lock-bar">{{ bar.bellCount() }} bar order(s) waiting.</p> }
          </div>
          <div class="flex gap-1" role="tablist" aria-label="How to sign in">
            <button type="button" role="tab" class="app-badge cursor-pointer px-3 py-1" [class]="mode() === 'pin' ? 'bg-primary text-on-primary' : 'bg-ink/10'" [attr.aria-selected]="mode() === 'pin'" data-testid="lock-mode-pin" (click)="mode.set('pin')">Staff code and PIN</button>
            <button type="button" role="tab" class="app-badge cursor-pointer px-3 py-1" [class]="mode() === 'password' ? 'bg-primary text-on-primary' : 'bg-ink/10'" [attr.aria-selected]="mode() === 'password'" data-testid="lock-mode-password" (click)="mode.set('password')">E-mail and password</button>
          </div>
          @if (mode() === 'pin') {
            <div><label class="app-label" for="lk-code">Staff code</label><input id="lk-code" class="app-input font-mono" name="lock-code" autocomplete="off" autocapitalize="characters" data-testid="lock-code" [ngModel]="code()" (ngModelChange)="code.set($event)" /></div>
            <div><label class="app-label" for="lk-pin">PIN</label><input id="lk-pin" class="app-input font-mono" name="lock-pin" type="password" inputmode="numeric" autocomplete="one-time-code" maxlength="12" data-testid="lock-pin" [ngModel]="secret()" (ngModelChange)="secret.set($event)" /></div>
          } @else {
            <div><label class="app-label" for="lk-email">E-mail</label><input id="lk-email" class="app-input" name="lock-email" type="email" autocomplete="off" data-testid="lock-email" [ngModel]="email()" (ngModelChange)="email.set($event)" /></div>
            <div><label class="app-label" for="lk-password">Password</label><input id="lk-password" class="app-input" name="lock-secret" type="password" autocomplete="one-time-code" maxlength="128" data-testid="lock-password" [ngModel]="secret()" (ngModelChange)="secret.set($event)" /></div>
          }
          @if (error()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="lock-error">{{ error() }}</p> }
          <button type="submit" class="btn-primary touch-target w-full" data-testid="lock-submit" [disabled]="busy() || !ready()">{{ busy() ? 'Checking...' : 'Unlock' }}</button>
          <button type="button" class="btn-ghost w-full text-sm" data-testid="lock-signout" (click)="signOut()">Sign out instead</button>
        </form>
      </div>
    }
  `
})
export class LockScreenComponent {
  protected readonly lock = inject(IdleLockService);
  protected readonly bar = inject(BarStore);
  private readonly auth = inject(AuthService);

  protected readonly mode = signal<'pin' | 'password'>('pin');
  protected readonly code = signal('');
  protected readonly email = signal('');
  protected readonly secret = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly who = computed(() => this.auth.membership()?.displayName ?? 'The last person');
  protected readonly ready = computed(() => this.secret().length > 0 && (this.mode() === 'pin' ? this.code().trim().length > 0 : this.email().trim().length > 0));

  /** The venue is the one already signed in on this device; it is not asked again. */
  private slug(): string {
    const fromSession = (this.auth.tenant() as { slug?: string } | null)?.slug;
    if (fromSession) return fromSession;
    try { return localStorage.getItem('zp.lastVenue') ?? ''; } catch { return ''; }
  }

  protected submit(): void {
    if (this.busy() || !this.ready()) return;
    this.busy.set(true);
    this.error.set(null);
    const before = this.auth.membership()?.id;
    const tenantSlug = this.slug();
    const request$ = this.mode() === 'password'
      ? this.auth.loginWithPassword({ tenantSlug, email: this.email().trim(), password: this.secret() })
      : this.auth.loginWithPin({ tenantSlug, staffCode: this.code().trim().toUpperCase(), pin: this.secret() });

    request$.subscribe({
      next: (session) => {
        this.secret.set('');
        this.code.set('');
        this.email.set('');
        if (session.membership?.id && session.membership.id === before) {
          this.busy.set(false);
          this.lock.stay();           // the same person: back to where they were
          return;
        }
        // Someone else: the application starts again for them, so they get their own first screen and nothing of the last person's.
        window.location.assign('/app');
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.secret.set('');
        this.error.set(toApiError(e).message);
      }
    });
  }

  protected signOut(): void {
    this.lock.stay();
    void this.auth.logout();
  }
}
