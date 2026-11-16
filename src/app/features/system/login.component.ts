import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, debounceTime, distinctUntilChanged, filter, of, switchMap } from 'rxjs';
import { BrandingDto } from '../../core/models/api.model';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { BrandingApiService } from '../../core/services/domain.services';
import { themeVariables } from '../../core/theme/theme-tokens';
import { BrandMarkComponent } from '../../shared/ui/brand-mark.component';

const SLUG_KEY = 'zp.lastVenue';
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** Company letters (2-3), optional dash, number: "BHL-007", "bhl7". Mirrors StaffCodes.TryParse on the server. */
const STAFF_CODE_RE = /^[A-Za-z]{2,3}\s*-?\s*\d{1,9}$/;

type Mode = 'password' | 'pin';

/**
 * Sign-in. Venue first: once a valid venue is typed its published theme (logo or initials, colours) is fetched and the
 * screen re-themes, scoped to this page. Owners and administrators use email + password; floor staff use venue + staff
 * code + PIN. Error messages never reveal which part was wrong.
 */
@Component({
  selector: 'zp-login',
  standalone: true,
  imports: [FormsModule, RouterLink, BrandMarkComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="grid min-h-screen place-items-center p-4 text-ink" [style]="vars()" style="background-color: rgb(var(--canvas-rgb)); font-family: var(--font-app)">
      <div class="w-full max-w-sm">
        <div class="mb-5 flex flex-col items-center gap-2 text-center">
          <zp-brand-mark [logoUrl]="venue()?.logoUrl ?? null" [initials]="venue()?.initialsFallback ?? 'ZP'" [name]="venue()?.companyName ?? 'ZestPoint'" [size]="56" />
          <h1 class="text-xl font-bold" data-testid="login-title">{{ venue()?.companyName ?? 'Sign in to ZestPoint' }}</h1>
          @if (venue()?.tagline) { <p class="text-sm text-ink/80">{{ venue()!.tagline }}</p> }
        </div>

        <form class="app-card space-y-4" (ngSubmit)="submit()" novalidate>
          <div>
            <label class="app-label" for="l-slug">Venue address</label>
            <div class="flex items-center gap-2">
              <input id="l-slug" class="app-input font-mono" autocomplete="organization" autocapitalize="none" spellcheck="false"
                     [ngModel]="slug()" (ngModelChange)="onSlug($event)" name="slug" data-testid="login-slug" />
              <span class="shrink-0 text-xs text-ink/70">.zestpoint.app</span>
            </div>
            @if (venueState() === 'missing') { <p class="app-error" role="alert">We could not find that venue.</p> }
          </div>

          <div role="tablist" aria-label="Sign-in method" class="grid grid-cols-2 gap-1 rounded-lg border border-ink/15 p-1 text-sm">
            <button type="button" role="tab" [attr.aria-selected]="mode() === 'password'" class="rounded-md px-2 py-1.5 font-medium"
                    [class]="(mode() === 'password' ? 'bg-primary text-on-primary' : 'text-ink/80') + (wrongSide() === 'password' ? ' ring-2 ring-primary ring-offset-2 ring-offset-transparent animate-pulse' : '')" (click)="mode.set('password')" data-testid="mode-password">Owner / admin</button>
            <button type="button" role="tab" [attr.aria-selected]="mode() === 'pin'" class="rounded-md px-2 py-1.5 font-medium"
                    [class]="(mode() === 'pin' ? 'bg-primary text-on-primary' : 'text-ink/80') + (wrongSide() === 'pin' ? ' ring-2 ring-primary ring-offset-2 ring-offset-transparent animate-pulse' : '')" (click)="mode.set('pin')" data-testid="mode-pin">Staff PIN</button>
          </div>

          @if (mode() === 'password') {
            <div>
              <label class="app-label" for="l-email">Email</label>
              <input id="l-email" type="email" class="app-input" autocomplete="username" [ngModel]="email()" (ngModelChange)="email.set($event)" name="email" data-testid="login-email" />
            </div>
            <div>
              <label class="app-label" for="l-pw">Password</label>
              <input id="l-pw" type="password" class="app-input" autocomplete="current-password" [ngModel]="password()" (ngModelChange)="password.set($event)" name="password" data-testid="login-password" />
            </div>
          } @else {
            <div>
              <label class="app-label" for="l-code">Staff code</label>
              <input id="l-code" class="app-input uppercase" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="20" placeholder="e.g. BHL-007" aria-describedby="l-code-hint" [ngModel]="staffCode()" (ngModelChange)="staffCode.set($event)" name="code" data-testid="login-code" />
              <p id="l-code-hint" class="mt-1 text-xs text-ink/70">Your venue&apos;s letters and your number, as shown when you were added. The dash is optional.</p>
            </div>
            <div>
              <label class="app-label" for="l-pin">PIN</label>
              <input id="l-pin" type="password" inputmode="numeric" class="app-input" autocomplete="off" maxlength="12" [ngModel]="pin()" (ngModelChange)="pin.set($event)" name="pin" data-testid="login-pin" />
            </div>
          }

          @if (wrongSide() === 'pin') {
            <div class="sys-alert sys-alert-info text-sm" role="alert" data-testid="login-wrong-side">
              <p><strong>{{ email().trim() }}</strong> looks like a staff code, not an e-mail address. Staff sign in with <strong>Staff PIN</strong> (the button above), using their staff code and PIN. This side is for the owner and administrators.</p>
              <button type="button" class="btn-primary mt-2 w-full" data-testid="login-switch-pin" (click)="switchToPin()">Use Staff PIN with this code</button>
            </div>
          } @else if (wrongSide() === 'password') {
            <div class="sys-alert sys-alert-info text-sm" role="alert" data-testid="login-wrong-side">
              <p>That looks like an e-mail address. The owner and administrators sign in with <strong>Owner / admin</strong> (the button above), using their e-mail and password. Staff use the staff code they were given, like BHL-007.</p>
              <button type="button" class="btn-primary mt-2 w-full" data-testid="login-switch-password" (click)="switchToPassword()">Use Owner / admin with this e-mail</button>
            </div>
          }
          @if (hint()) { <p class="text-sm text-ink/80" role="status" data-testid="login-hint">{{ hint() }}</p> }
          @if (error()) { <p class="app-error" role="alert" data-testid="login-error">{{ error() }}</p> }
          <button type="submit" class="btn-primary w-full" [disabled]="busy() || !ready()" data-testid="login-submit">{{ busy() ? 'Signing in...' : 'Sign in' }}</button>
        </form>

        <p class="mt-4 text-center text-sm text-ink/80">New to ZestPoint? <a routerLink="/register" class="font-semibold text-ink underline">Register your business</a></p>
        <p class="mt-2 text-center text-sm text-ink/80">Trouble signing in? <a routerLink="/status" class="font-semibold text-ink underline" data-testid="login-status-link">Check the system status</a></p>
      </div>
    </main>
  `
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly branding = inject(BrandingApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly slug = signal(this.remembered());
  protected readonly mode = signal<Mode>('password');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly staffCode = signal('');
  protected readonly pin = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly venue = signal<BrandingDto | null>(null);
  protected readonly venueState = signal<'idle' | 'found' | 'missing'>('idle');
  protected readonly vars = computed(() => (this.venue() ? themeVariables(this.venue()!) : {}));

  /** Someone typing on the wrong side: a staff code in the e-mail box, or an e-mail address in the staff code box. Says which button they need. */
  protected readonly wrongSide = computed<'pin' | 'password' | null>(() => {
    if (this.mode() === 'password') { const v = this.email().trim(); return v && !v.includes('@') && STAFF_CODE_RE.test(v) ? 'pin' : null; }
    return this.staffCode().includes('@') ? 'password' : null;
  });

  /** What is still missing or mistyped, in plain words, before the button can be pressed. Nothing while the boxes are empty. */
  protected readonly hint = computed<string | null>(() => {
    if (this.wrongSide()) return null;
    if (this.slug() && !SLUG_RE.test(this.slug())) return 'The venue address is the short name of your business, in small letters without spaces, for example la-bodega.';
    if (this.mode() === 'password') {
      const v = this.email().trim();
      return v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? 'The e-mail address should look like name@example.com.' : null;
    }
    const code = this.staffCode().trim();
    if (code && !STAFF_CODE_RE.test(code)) return 'A staff code is your venue\'s letters and your number, like BHL-007. Ask your manager if you do not have it.';
    if (this.pin() && !/^\d+$/.test(this.pin())) return 'A PIN is numbers only.';
    if (this.pin() && this.pin().length < 4) return 'A PIN has at least 4 numbers.';
    return null;
  });

  protected switchToPin(): void {
    this.staffCode.set(this.email().trim().toUpperCase());
    this.email.set('');
    this.password.set('');
    this.error.set(null);
    this.mode.set('pin');
  }

  protected switchToPassword(): void {
    this.email.set(this.staffCode().trim().toLowerCase());
    this.staffCode.set('');
    this.pin.set('');
    this.error.set(null);
    this.mode.set('password');
  }

  protected readonly ready = computed(() => {
    if (this.wrongSide()) return false;
    if (!SLUG_RE.test(this.slug())) return false;
    return this.mode() === 'password' ? !!this.email().trim() && !!this.password() : STAFF_CODE_RE.test(this.staffCode().trim()) && /^\d{4,12}$/.test(this.pin());
  });

  constructor() {
    toObservable(this.slug).pipe(
      debounceTime(450), distinctUntilChanged(),
      filter((s) => { if (!SLUG_RE.test(s)) { this.venue.set(null); this.venueState.set('idle'); } return SLUG_RE.test(s); }),
      switchMap((s) => this.branding.publicBranding(s).pipe(catchError(() => of(null)))),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((r) => {
      this.venue.set(r?.branding ?? null);
      this.venueState.set(r ? 'found' : 'missing');
    });
  }

  protected onSlug(value: string): void {
    this.slug.set(value.trim().toLowerCase());
    this.error.set(null);
  }

  protected submit(): void {
    if (this.busy() || !this.ready()) return;
    this.busy.set(true);
    this.error.set(null);

    const slug = this.slug();
    const request$ = this.mode() === 'password'
      ? this.auth.loginWithPassword({ tenantSlug: slug, email: this.email().trim(), password: this.password() })
      : this.auth.loginWithPin({ tenantSlug: slug, staffCode: this.staffCode().trim().toUpperCase(), pin: this.pin() });

    request$.subscribe({
      next: () => {
        this.remember(slug);
        this.password.set('');
        this.pin.set('');
        void this.router.navigateByUrl(this.route.snapshot.queryParamMap.get('returnUrl') ?? '/app');
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.pin.set('');
        // Say what was wrong with what was typed, not that "fields" need correcting.
        const failed = toApiError(e);
        const field = Object.entries(failed.fieldErrors)[0];
        const names: Record<string, string> = { email: 'E-mail', password: 'Password', staffCode: 'Staff code', pin: 'PIN', tenantSlug: 'Venue address' };
        this.error.set(failed.status === 0 ? 'No connection to the server. Check the internet on this device and try again.'
          : field ? `${names[field[0]] ?? 'What you typed'}: ${field[1][0] ?? 'please check it.'}`
          : failed.message);
      }
    });
  }

  private remembered(): string {
    try { return localStorage.getItem(SLUG_KEY) ?? ''; } catch { return ''; }
  }

  private remember(slug: string): void {
    try { localStorage.setItem(SLUG_KEY, slug); } catch { /* ignore */ }
  }
}
