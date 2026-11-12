import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, debounceTime, distinctUntilChanged, filter, map, of, switchMap, tap } from 'rxjs';
import {
  EnterpriseTypeCode, EnterpriseTypeDto, RegisterCompanyRequest
} from '../../core/models/api.model';
import {
  CHECKOUT_STYLE_LABELS, COUNTRIES, CURRENCIES, MODULE_LABELS, WALLET_CURRENCIES, browserTimeZone, timeZones
} from '../../core/models/reference-data';
import { FeatureCode } from '../../core/models/rbac.model';
import { ApiError, toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { BrandingApiService, RegistrationService } from '../../core/services/domain.services';
import { computeInitials } from '../../core/theme/theme-tokens';
import { BrandMarkComponent } from '../../shared/ui/brand-mark.component';
import { SearchSelectComponent, SelectOption } from '../../shared/ui/search-select.component';

type Step = 'type' | 'company' | 'admin';
const STEPS: readonly { key: Step; label: string }[] = [
  { key: 'type', label: 'Business type' }, { key: 'company', label: 'Company' }, { key: 'admin', label: 'Your account' }
];

const DRAFT_KEY = 'zp.register.draft.v1';
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+()\d\s.-]{7,32}$/;

/** Something that stops the person moving on: shown under its field once touched, and listed beside the button always. */
interface Problem {
  /** Same key the API uses for the field, so a server error replaces the local one. */
  field: string;
  /** Short name for the "Still needed" line. */
  label: string;
  message: string;
}

type SlugStatus = 'idle' | 'checking' | 'available' | 'taken' | 'unknown';
/** The outcome of checking one specific slug; `slug` says which, so a stale result is never applied to newer text. */
interface SlugState { slug: string; status: SlugStatus; reason?: string | null; suggestion?: string | null }

const isCheckableSlug = (slug: string): boolean => slug.length >= 3 && SLUG_RE.test(slug);

function slugProblem(slug: string): string | null {
  if (!slug) return 'Choose your ZestPoint address.';
  if (slug.length < 3) return 'Your address needs at least 3 characters.';
  if (!SLUG_RE.test(slug)) return 'Use only lowercase letters, numbers and single hyphens, and do not start or end with a hyphen.';
  return null;
}

function emailProblem(value: string, whenEmpty: string): string | null {
  const v = value.trim();
  if (!v) return whenEmpty;
  return EMAIL_RE.test(v) ? null : 'Enter a valid email address, like name@company.com.';
}

function phoneProblem(value: string): string | null {
  const v = value.trim();
  if (!v) return 'Enter the business phone number.';
  return PHONE_RE.test(v) ? null : 'Enter a valid phone number, for example +234 803 309 0486.';
}

interface Draft {
  type: EnterpriseTypeCode | null;
  /** Further types for a business that is several things at once (bar + nightclub + hotel). */
  additionalTypes: EnterpriseTypeCode[];
  customType: string;
  companyName: string;
  slug: string;
  slugTouched: boolean;
  businessEmail: string;
  businessPhone: string;
  countryCode: string;
  currencyCode: string;
  /** Extra wallets to open; the default-currency wallet is always created. */
  walletCurrencies: string[];
  timeZoneId: string;
  primaryLocation: string;
  adminFullName: string;
  adminEmail: string;
  step: Step;
}

/**
 * Registration: choose the enterprise type (searchable), describe the company, create the owner account.
 * Progress up to the password is saved locally so a refresh or a later visit resumes where the person left off (the
 * password is never stored). On success the owner is signed in and sent to the onboarding wizard, whose progress is saved
 * on the server.
 */
@Component({
  selector: 'zp-register',
  standalone: true,
  imports: [FormsModule, RouterLink, SearchSelectComponent, BrandMarkComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="mx-auto min-h-screen max-w-5xl px-4 py-8 text-ink">
      <header class="mb-6 flex items-center justify-between">
        <a routerLink="/" class="app-focus flex items-center gap-2 rounded-lg" aria-label="ZestPoint home">
          <span class="inline-grid h-9 w-9 place-items-center rounded-lg bg-primary font-bold text-on-primary">Z</span>
          <span class="text-lg font-bold">ZestPoint</span>
        </a>
        <p class="text-sm text-ink/80">Already registered? <a routerLink="/login" class="font-semibold text-ink underline">Sign in</a></p>
      </header>

      <h1 class="text-2xl font-bold sm:text-3xl">Register your business</h1>
      <p class="mt-1 text-ink/80">Takes about two minutes. You can change everything later.</p>

      <ol class="mt-6 grid grid-cols-3 gap-2" aria-label="Registration progress">
        @for (s of steps; track s.key; let i = $index) {
          <li class="rounded-lg border p-2 text-center text-sm" [class]="step() === s.key ? 'border-primary bg-primary/10 font-semibold' : i < stepIndex() ? 'border-success/50 text-ink' : 'border-ink/15 text-ink/70'"
              [attr.aria-current]="step() === s.key ? 'step' : null">
            <span class="block text-xs uppercase tracking-wide">Step {{ i + 1 }}</span>{{ s.label }}
          </li>
        }
      </ol>

      @if (formError()) { <p class="sys-alert sys-alert-danger mt-4" role="alert">{{ formError() }}</p> }

      <div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section class="app-card space-y-4">
          @switch (step()) {
            @case ('type') {
              @if (loadError()) {
                <p class="sys-alert sys-alert-danger" role="alert">{{ loadError() }}</p>
                <button type="button" class="btn-outline" (click)="loadTypes()">Try again</button>
              } @else if (!types().length) {
                <p role="status">Loading business types...</p>
              } @else {
                <zp-search-select label="What type of business are you registering?" placeholder="Search: supermarket, bar, hotel..."
                                  testId="enterprise-type" [options]="typeOptions()" [value]="d().type" (valueChange)="pickType($event)" (blurred)="touch('enterpriseType')"
                                  [error]="shown()['enterpriseType'] || null" />
                @if (d().type) {
                  <fieldset data-testid="extra-types">
                    <legend class="app-label">Does your business operate as anything else too? (optional)</legend>
                    <div class="grid gap-2 sm:grid-cols-2">
                      @for (t of extraTypeChoices(); track t.code) {
                        <label class="flex min-h-11 items-center gap-2 rounded-lg border border-ink/15 px-3 py-2 text-sm">
                          <input type="checkbox" [checked]="d().additionalTypes.includes(t.code)" (change)="toggleType(t.code)" [attr.data-testid]="'extra-type-' + t.code" />
                          {{ t.name }}
                        </label>
                      }
                    </div>
                    <p class="app-hint">Your main type sets the starting theme and wording. The others add their suggested modules.</p>
                  </fieldset>
                }
                @if (d().type === 'Other') {
                  <div>
                    <label class="app-label" for="r-custom">Describe your business</label>
                    <input id="r-custom" class="app-input" maxlength="100" [ngModel]="d().customType" (ngModelChange)="patch({ customType: $event })" (blur)="touch('customEnterpriseType')"
                           [attr.aria-invalid]="!!shown()['customEnterpriseType']" placeholder="e.g. Car wash, cinema, spa" data-testid="custom-type" />
                    @if (shown()['customEnterpriseType']) { <p class="app-error" role="alert">{{ shown()['customEnterpriseType'] }}</p> }
                  </div>
                }
              }
            }

            @case ('company') {
              <div class="grid gap-4 sm:grid-cols-2">
                <div class="sm:col-span-2">
                  <label class="app-label" for="r-name">Company or trading name</label>
                  <input id="r-name" class="app-input" maxlength="120" autocomplete="organization" [ngModel]="d().companyName" (ngModelChange)="onName($event)" (blur)="touch('companyName')"
                         [attr.aria-invalid]="!!shown()['companyName']" data-testid="company-name" />
                  @if (shown()['companyName']) { <p class="app-error" role="alert">{{ shown()['companyName'] }}</p> }
                </div>
                <div class="sm:col-span-2">
                  <label class="app-label" for="r-slug">Your ZestPoint address</label>
                  <div class="flex items-center gap-2">
                    <input id="r-slug" class="app-input font-mono" maxlength="63" [ngModel]="d().slug" (ngModelChange)="onSlug($event)" (blur)="touch('slug')" data-testid="slug"
                           [attr.aria-invalid]="!!shown()['slug'] || slugStatus() === 'taken'" aria-describedby="r-slug-hint" />
                    <span class="shrink-0 text-sm text-ink/70">.zestpoint.app</span>
                  </div>
                  <p id="r-slug-hint" class="app-hint" role="status">
                    @switch (slugStatus()) {
                      @case ('checking') { Checking availability... }
                      @case ('available') { <span class="text-success">Available</span> }
                      @case ('taken') { <span class="text-danger">{{ slugState().reason }}</span> @if (slugState().suggestion) { <button type="button" class="underline" (click)="useSlug(slugState().suggestion!)">Use {{ slugState().suggestion }}</button> } }
                      @case ('unknown') { We could not check this address just now. We will check it again when you create your account. }
                      @default { Staff use this with their staff code to sign in. }
                    }
                  </p>
                  @if (shown()['slug']) { <p class="app-error" role="alert">{{ shown()['slug'] }}</p> }
                </div>
                <div>
                  <label class="app-label" for="r-bemail">Business email</label>
                  <input id="r-bemail" type="email" class="app-input" autocomplete="email" [ngModel]="d().businessEmail" (ngModelChange)="patch({ businessEmail: $event })" (blur)="touch('businessEmail')"
                         [attr.aria-invalid]="!!shown()['businessEmail']" data-testid="business-email" />
                  @if (shown()['businessEmail']) { <p class="app-error" role="alert">{{ shown()['businessEmail'] }}</p> }
                </div>
                <div>
                  <label class="app-label" for="r-phone">Business phone</label>
                  <input id="r-phone" type="tel" class="app-input" autocomplete="tel" [ngModel]="d().businessPhone" (ngModelChange)="patch({ businessPhone: $event })" (blur)="touch('businessPhone')"
                         [attr.aria-invalid]="!!shown()['businessPhone']" data-testid="business-phone" />
                  @if (shown()['businessPhone']) { <p class="app-error" role="alert">{{ shown()['businessPhone'] }}</p> }
                </div>
                <zp-search-select label="Country" testId="country" [options]="countryOptions" [value]="d().countryCode" (valueChange)="pickCountry($event)" (blurred)="touch('countryCode')" [error]="shown()['countryCode'] || null" />
                <zp-search-select label="Default currency" testId="currency" [options]="currencyOptions" [value]="d().currencyCode" (valueChange)="patch({ currencyCode: $event })" (blurred)="touch('currencyCode')" [error]="shown()['currencyCode'] || null" />
                <fieldset class="sm:col-span-2" data-testid="wallets">
                  <legend class="app-label">Wallets</legend>
                  <p class="app-hint mb-2">We open a wallet in your default currency ({{ d().currencyCode }}). Tick any others you also trade in.</p>
                  <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    @for (c of walletCurrencies; track c) {
                      <label class="flex min-h-11 items-center gap-2 rounded-lg border border-ink/15 px-3 py-2 text-sm">
                        <input type="checkbox" [checked]="c === d().currencyCode || d().walletCurrencies.includes(c)" [disabled]="c === d().currencyCode"
                               (change)="toggleWallet(c)" [attr.data-testid]="'wallet-' + c" />
                        {{ c }}@if (c === d().currencyCode) { <span class="text-xs text-ink/70">default</span> }
                      </label>
                    }
                  </div>
                  @if (shown()['walletCurrencies']) { <p class="app-error" role="alert">{{ shown()['walletCurrencies'] }}</p> }
                </fieldset>
                <div class="sm:col-span-2">
                  <zp-search-select label="Time zone" testId="timezone" [options]="zoneOptions" [value]="d().timeZoneId" (valueChange)="patch({ timeZoneId: $event })" (blurred)="touch('timeZoneId')" [error]="shown()['timeZoneId'] || null" />
                </div>
                <div class="sm:col-span-2">
                  <label class="app-label" for="r-loc">Primary operating location</label>
                  <input id="r-loc" class="app-input" maxlength="300" autocomplete="street-address" [ngModel]="d().primaryLocation" (ngModelChange)="patch({ primaryLocation: $event })" (blur)="touch('primaryLocation')"
                         placeholder="Street, area, city" [attr.aria-invalid]="!!shown()['primaryLocation']" data-testid="location" />
                  @if (shown()['primaryLocation']) { <p class="app-error" role="alert">{{ shown()['primaryLocation'] }}</p> }
                </div>
                <div class="sm:col-span-2">
                  <p class="app-label">Logo (optional)</p>
                  <div class="flex items-center gap-3">
                    <zp-brand-mark [logoUrl]="logoPreview()" [initials]="initials()" [name]="d().companyName || 'Your company'" [size]="48" />
                    <label class="btn-outline cursor-pointer text-sm">Choose a logo
                      <input type="file" class="sr-only" accept="image/png,image/jpeg,image/webp,image/svg+xml" (change)="onLogo($event)" data-testid="logo-file" />
                    </label>
                    @if (logoFile()) { <button type="button" class="btn-ghost text-sm" (click)="clearLogo()">Remove</button> }
                  </div>
                  <p class="app-hint">No logo? We generate <strong>{{ initials() }}</strong> for you. You can add or change it any time.</p>
                  @if (logoNote()) { <p class="app-error" role="alert">{{ logoNote() }}</p> }
                </div>
              </div>
            }

            @case ('admin') {
              <p class="text-sm text-ink/80">This account becomes the company's CEO / Superadmin.</p>
              <div class="grid gap-4 sm:grid-cols-2">
                <div class="sm:col-span-2">
                  <label class="app-label" for="r-aname">Your full name</label>
                  <input id="r-aname" class="app-input" autocomplete="name" [ngModel]="d().adminFullName" (ngModelChange)="patch({ adminFullName: $event })" (blur)="touch('adminFullName')"
                         [attr.aria-invalid]="!!shown()['adminFullName']" data-testid="admin-name" />
                  @if (shown()['adminFullName']) { <p class="app-error" role="alert">{{ shown()['adminFullName'] }}</p> }
                </div>
                <div class="sm:col-span-2">
                  <label class="app-label" for="r-aemail">Your email (used to sign in)</label>
                  <input id="r-aemail" type="email" class="app-input" autocomplete="username" [ngModel]="d().adminEmail" (ngModelChange)="patch({ adminEmail: $event })" (blur)="touch('adminEmail')"
                         [attr.aria-invalid]="!!shown()['adminEmail']" data-testid="admin-email" />
                  @if (shown()['adminEmail']) { <p class="app-error" role="alert">{{ shown()['adminEmail'] }}</p> }
                </div>
                <div>
                  <label class="app-label" for="r-pw">Password</label>
                  <input id="r-pw" [type]="showPassword() ? 'text' : 'password'" class="app-input" autocomplete="new-password" [ngModel]="password()" (ngModelChange)="password.set($event)" (blur)="touch('adminPassword')"
                         [attr.aria-invalid]="!!shown()['adminPassword']" aria-describedby="r-pw-rules" data-testid="admin-password" />
                  @if (shown()['adminPassword']) { <p class="app-error" role="alert">{{ shown()['adminPassword'] }}</p> }
                </div>
                <div>
                  <label class="app-label" for="r-pw2">Confirm password</label>
                  <input id="r-pw2" [type]="showPassword() ? 'text' : 'password'" class="app-input" autocomplete="new-password" [ngModel]="confirm()" (ngModelChange)="confirm.set($event); touch('adminConfirm')"
                         (blur)="touch('adminConfirm')" [attr.aria-invalid]="!!shown()['adminConfirm']" data-testid="admin-confirm" />
                  @if (shown()['adminConfirm']) { <p class="app-error" role="alert">{{ shown()['adminConfirm'] }}</p> }
                </div>
                <label class="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" [ngModel]="showPassword()" (ngModelChange)="showPassword.set($event)" /> Show password</label>
                <ul id="r-pw-rules" class="space-y-0.5 text-xs sm:col-span-2" aria-label="Password requirements">
                  @for (r of passwordRules(); track r.label) {
                    <li [class]="r.ok ? 'text-success' : 'text-ink/70'">{{ r.ok ? 'Done:' : 'Needs:' }} {{ r.label }}</li>
                  }
                </ul>
                <label class="flex items-start gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" class="mt-1" [ngModel]="accepted()" (ngModelChange)="accepted.set($event); touch('acceptTerms')" (blur)="touch('acceptTerms')"
                         [attr.aria-invalid]="!!shown()['acceptTerms']" [attr.aria-describedby]="shown()['acceptTerms'] ? 'r-terms-err' : null" data-testid="accept-terms" />
                  <span>I agree to the <a routerLink="/terms" target="_blank" class="underline">Terms of Service</a> and <a routerLink="/privacy" target="_blank" class="underline">Privacy Policy</a>.</span>
                </label>
                @if (shown()['acceptTerms']) { <p id="r-terms-err" class="app-error sm:col-span-2" role="alert">{{ shown()['acceptTerms'] }}</p> }
              </div>
            }
          }

          <div class="flex items-center justify-between gap-3 border-t border-ink/10 pt-4">
            <button type="button" class="btn-ghost" [disabled]="stepIndex() === 0 || submitting()" (click)="back()">Back</button>
            @if (step() !== 'admin') {
              <button type="button" class="btn-primary" (click)="next()" [disabled]="!canAdvance()" aria-describedby="step-status" data-testid="next">Continue</button>
            } @else {
              <button type="button" class="btn-primary" (click)="submit()" [disabled]="submitting() || !canSubmit()" aria-describedby="step-status" data-testid="submit">
                {{ submitting() ? 'Creating your account...' : 'Create my account' }}
              </button>
            }
          </div>

          <!-- Why the button is disabled: what is still missing, or what we are waiting for. -->
          <div id="step-status" class="space-y-0.5 text-right text-sm text-ink/80" role="status" aria-live="polite" data-testid="step-status">
            @if (blockers().length) { <p data-testid="step-blockers">Still needed: {{ blockers().join(', ') }}.</p> }
            @if (waitingFor(); as w) { <p data-testid="step-waiting">Waiting for {{ w }} to finish.</p> }
          </div>
        </section>

        <!-- What this type of business gets: the template drives defaults, terminology, modules and dashboard -->
        <aside class="app-card space-y-3 self-start" aria-label="Your starting setup" data-testid="setup-summary">
          <p class="text-xs font-semibold uppercase tracking-wide text-ink/70">Your starting setup</p>
          @if (selectedType(); as t) {
            <p class="font-bold">{{ t.name === 'Other' && d().customType ? d().customType : t.name }}</p>
            <p class="text-sm text-ink/80">{{ t.description }}</p>
            <dl class="space-y-1 text-sm">
              <div class="flex justify-between gap-2"><dt class="text-ink/70">Checkout</dt><dd>{{ checkoutLabel() }}</dd></div>
              <div class="flex justify-between gap-2"><dt class="text-ink/70">A sale is called</dt><dd>{{ t.terminology['order'] }}</dd></div>
              <div class="flex justify-between gap-2"><dt class="text-ink/70">Starting theme</dt><dd>{{ themeLabel() }}</dd></div>
              <div class="flex justify-between gap-2"><dt class="text-ink/70">Multi-branch</dt><dd>{{ t.defaults['multiBranch'] ? 'Yes' : 'Single site' }}</dd></div>
            </dl>
            <div>
              <p class="mb-1 text-xs font-semibold text-ink/70">Suggested modules</p>
              <ul class="flex flex-wrap gap-1.5">
                @for (m of modules(); track m) { <li class="app-badge app-badge-primary">{{ m }}</li> }
              </ul>
            </div>
            @if (sampleCategories().length) {
              <div>
                <p class="mb-1 text-xs font-semibold text-ink/70">Sample categories</p>
                <p class="text-sm">{{ sampleCategories().join(', ') }}</p>
              </div>
            }
          } @else {
            <p class="text-sm text-ink/80">Pick your business type and we will set up sensible defaults: terminology, modules, theme and dashboard.</p>
          }
        </aside>
      </div>
    </main>
  `
})
export class RegisterComponent {
  private readonly registration = inject(RegistrationService);
  private readonly auth = inject(AuthService);
  private readonly branding = inject(BrandingApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly steps = STEPS;
  protected readonly countryOptions: SelectOption[] = COUNTRIES.map((c) => ({ value: c.code, label: c.name }));
  protected readonly currencyOptions: SelectOption[] = CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} - ${c.name}` }));
  protected readonly zoneOptions: SelectOption[] = timeZones().map((z) => ({ value: z, label: z.replace(/_/g, ' ') }));
  protected readonly walletCurrencies = WALLET_CURRENCIES;

  protected readonly types = signal<EnterpriseTypeDto[]>([]);
  protected readonly loadError = signal<string | null>(null);
  protected readonly d = signal<Draft>(this.restoreDraft());
  protected readonly step = computed(() => this.d().step);
  protected readonly stepIndex = computed(() => STEPS.findIndex((s) => s.key === this.d().step));

  protected readonly password = signal('');
  protected readonly confirm = signal('');
  protected readonly showPassword = signal(false);
  protected readonly accepted = signal(false);
  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);
  /** Errors the server sent back; they replace the local ones and clear on the next edit. */
  protected readonly errors = signal<Record<string, string>>({});
  /** Fields the person has been in. A local error only appears under a field after that, so an untouched form is not red. */
  private readonly touched = signal<ReadonlySet<string>>(new Set());

  protected readonly logoFile = signal<File | null>(null);
  protected readonly logoPreview = signal<string | null>(null);
  protected readonly logoNote = signal<string | null>(null);
  protected readonly slugState = signal<SlugState>({ slug: '', status: 'idle' });
  /** The state for the slug currently in the box: while the answer is for older text, a valid slug counts as still being checked. */
  protected readonly slugStatus = computed<SlugStatus>(() => {
    const slug = this.d().slug;
    if (this.slugState().slug !== slug) return isCheckableSlug(slug) ? 'checking' : 'idle';
    return this.slugState().status;
  });

  protected readonly typeOptions = computed<SelectOption<EnterpriseTypeCode>[]>(() =>
    this.types().map((t) => ({ value: t.code, label: t.name, description: t.description, group: t.category === 'Group' ? 'Groups' : t.category })));
  protected readonly selectedType = computed(() => this.types().find((t) => t.code === this.d().type) ?? null);
  protected readonly initials = computed(() => computeInitials(this.d().companyName));
  /** Types a business can add on top of its main one. "Other" is free text, so it only ever stands alone. */
  protected readonly extraTypeChoices = computed(() => this.types().filter((t) => t.code !== this.d().type && t.code !== 'Other'));
  protected readonly modules = computed(() => {
    const picked = new Set<string>([this.d().type ?? '', ...this.d().additionalTypes]);
    const all = this.types().filter((t) => picked.has(t.code)).flatMap((t) => t.suggestedModules);
    return [...new Set(all)].map((m) => MODULE_LABELS[m as FeatureCode] ?? m);
  });
  protected readonly sampleCategories = computed(() => (this.selectedType()?.defaults['sampleCategories'] as string[] | undefined) ?? []);
  protected readonly checkoutLabel = computed(() => CHECKOUT_STYLE_LABELS[String(this.selectedType()?.defaults['checkoutStyle'])] ?? 'Standard');
  protected readonly themeLabel = computed(() => (this.selectedType()?.defaultThemePreset ?? 'custom').replace(/-/g, ' '));

  protected readonly passwordRules = computed(() => {
    const p = this.password();
    return [
      { label: 'at least 10 characters', ok: p.length >= 10 },
      { label: 'an uppercase letter', ok: /[A-Z]/.test(p) },
      { label: 'a lowercase letter', ok: /[a-z]/.test(p) },
      { label: 'a number', ok: /\d/.test(p) }
    ];
  });

  /** Everything wrong on the current step, whether or not the person has reached that field yet. */
  protected readonly problems = computed<Problem[]>(() => {
    const d = this.d();
    const out: Problem[] = [];
    const add = (field: string, label: string, message: string | null): void => { if (message) out.push({ field, label, message }); };

    switch (d.step) {
      case 'type':
        if (!d.type) add('enterpriseType', 'Business type', 'Choose your business type.');
        else if (d.type === 'Other' && d.customType.trim().length < 2) add('customEnterpriseType', 'Description of your business', 'Describe your business in a few words (at least 2 characters).');
        break;
      case 'company':
        if (d.companyName.trim().length < 2) add('companyName', 'Company name', 'Enter your company or trading name (at least 2 characters).');
        add('slug', 'ZestPoint address', slugProblem(d.slug));
        add('businessEmail', 'Business email', emailProblem(d.businessEmail, 'Enter the business email.'));
        add('businessPhone', 'Business phone', phoneProblem(d.businessPhone));
        if (!d.countryCode) add('countryCode', 'Country', 'Choose a country.');
        if (!d.currencyCode) add('currencyCode', 'Default currency', 'Choose a default currency.');
        if (!d.timeZoneId) add('timeZoneId', 'Time zone', 'Choose a time zone.');
        if (d.primaryLocation.trim().length < 2) add('primaryLocation', 'Operating location', 'Enter where the business operates (street, area, city).');
        break;
      case 'admin': {
        const password = this.password();
        if (d.adminFullName.trim().length < 2) add('adminFullName', 'Your full name', 'Enter your full name (at least 2 characters).');
        add('adminEmail', 'Your email', emailProblem(d.adminEmail, 'Enter your email address.'));
        if (!password) add('adminPassword', 'Password', 'Enter a password.');
        else if (!this.passwordRules().every((r) => r.ok)) add('adminPassword', 'Password', 'Your password does not meet all the requirements below.');
        if (!this.confirm()) add('adminConfirm', 'Password confirmation', 'Re-enter your password to confirm it.');
        else if (this.confirm() !== password) add('adminConfirm', 'Password confirmation', 'Passwords do not match.');
        if (!this.accepted()) add('acceptTerms', 'Agreement to the terms', 'Accept the Terms of Service and Privacy Policy to continue.');
        break;
      }
    }
    return out;
  });

  /** What each field displays: the server's message if there is one, otherwise the local problem once the field was touched. */
  protected readonly shown = computed<Record<string, string>>(() => {
    const touched = this.touched();
    const local: Record<string, string> = {};
    for (const p of this.problems()) if (touched.has(p.field)) local[p.field] = p.message;
    return { ...local, ...this.errors() };
  });

  /** The "Still needed" list beside the button. A taken address has its own message under the field, so it is only named here. */
  protected readonly blockers = computed<string[]>(() => {
    const list = this.problems().map((p) => p.label);
    if (this.step() === 'company' && this.slugStatus() === 'taken') list.push('An available ZestPoint address');
    return list;
  });

  protected readonly waitingFor = computed<string | null>(() => (this.step() === 'company' && this.slugStatus() === 'checking' ? 'the address availability check' : null));

  constructor() {
    this.loadTypes();

    // Save progress locally (never the password) so a refresh or a later visit resumes here.
    toObservable(this.d).pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef)).subscribe((draft) => this.persistDraft(draft));

    // Live subdomain availability.
    // A failed check is shown as 'unknown' and does not block: the server checks the address again on registration.
    toObservable(computed(() => this.d().slug)).pipe(
      debounceTime(400), distinctUntilChanged(),
      tap((slug) => this.slugState.set({ slug, status: isCheckableSlug(slug) ? 'checking' : 'idle' })),
      filter(isCheckableSlug),
      switchMap((slug) => this.registration.checkSlug(slug).pipe(
        map((r): SlugState => (r.available ? { slug, status: 'available' } : { slug, status: 'taken', reason: r.reason, suggestion: r.suggestion })),
        catchError(() => of<SlugState>({ slug, status: 'unknown' }))
      )),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((state) => this.slugState.set(state));

    this.destroyRef.onDestroy(() => this.revokeLogo());
  }

  protected loadTypes(): void {
    this.loadError.set(null);
    this.registration.enterpriseTypes().subscribe({
      next: (list) => this.types.set(list),
      error: (e: unknown) => this.loadError.set(toApiError(e).message)
    });
  }

  // ---- Editing -------------------------------------------------------------------------------

  protected touch(field: string): void {
    if (!this.touched().has(field)) this.touched.update((cur) => new Set(cur).add(field));
  }

  protected patch(change: Partial<Draft>): void {
    this.d.update((cur) => ({ ...cur, ...change }));
    this.errors.set({});
    this.formError.set(null);
  }

  protected pickType(code: EnterpriseTypeCode): void {
    this.patch({ type: code, additionalTypes: this.d().additionalTypes.filter((t) => t !== code) });
  }

  protected toggleType(code: EnterpriseTypeCode): void {
    const cur = this.d().additionalTypes;
    this.patch({ additionalTypes: cur.includes(code) ? cur.filter((t) => t !== code) : [...cur, code] });
  }

  protected toggleWallet(code: string): void {
    const cur = this.d().walletCurrencies;
    this.patch({ walletCurrencies: cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code] });
  }

  protected pickCountry(code: string): void {
    const c = COUNTRIES.find((x) => x.code === code);
    this.patch(c ? { countryCode: code, currencyCode: c.currency, timeZoneId: c.timeZone } : { countryCode: code });
  }

  protected onName(name: string): void {
    const cur = this.d();
    const auto = !cur.slugTouched;
    this.patch({ companyName: name, ...(auto ? { slug: slugify(name) } : {}) });
  }

  protected onSlug(value: string): void {
    this.patch({ slug: value.toLowerCase().replace(/[^a-z0-9-]/g, '-'), slugTouched: true });
  }

  protected useSlug(slug: string): void {
    this.patch({ slug, slugTouched: true });
  }

  protected onLogo(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    this.logoNote.set(null);
    if (!file) return;

    const limit = file.type === 'image/svg+xml' ? 262_144 : 1_048_576;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) return void this.logoNote.set('Use a PNG, JPEG, WebP or SVG image.');
    if (file.size > limit) return void this.logoNote.set(`That file is too large (max ${Math.round(limit / 1024)} KB).`);

    this.revokeLogo();
    this.logoFile.set(file);
    this.logoPreview.set(URL.createObjectURL(file));
  }

  protected clearLogo(): void {
    this.revokeLogo();
    this.logoFile.set(null);
    this.logoPreview.set(null);
  }

  // ---- Navigation ----------------------------------------------------------------------------

  protected canAdvance(): boolean {
    if (this.problems().length > 0) return false;
    return this.step() !== 'company' || (this.slugStatus() !== 'taken' && this.slugStatus() !== 'checking');
  }

  protected canSubmit(): boolean {
    return this.step() === 'admin' && this.problems().length === 0;
  }

  protected next(): void {
    if (!this.canAdvance()) return;
    const i = this.stepIndex();
    this.patch({ step: STEPS[Math.min(STEPS.length - 1, i + 1)]!.key });
  }

  protected back(): void {
    this.patch({ step: STEPS[Math.max(0, this.stepIndex() - 1)]!.key });
  }

  // ---- Submit --------------------------------------------------------------------------------

  protected submit(): void {
    if (this.submitting() || !this.canSubmit()) return;
    const d = this.d();
    const request: RegisterCompanyRequest = {
      companyName: d.companyName.trim(), slug: d.slug || null, enterpriseType: d.type!,
      additionalEnterpriseTypes: d.additionalTypes.filter((t) => t !== d.type),
      customEnterpriseType: d.type === 'Other' ? d.customType.trim() : null,
      businessEmail: d.businessEmail.trim(), businessPhone: d.businessPhone.trim(), countryCode: d.countryCode,
      currencyCode: d.currencyCode, walletCurrencies: d.walletCurrencies.filter((c) => c !== d.currencyCode), timeZoneId: d.timeZoneId, primaryLocation: d.primaryLocation.trim(),
      adminFullName: d.adminFullName.trim(), adminEmail: d.adminEmail.trim(), adminPassword: this.password()
    };

    this.submitting.set(true);
    this.formError.set(null);
    this.errors.set({});

    this.registration.register(request).subscribe({
      next: (result) => {
        this.auth.adopt(result.session);
        this.clearDraft();
        this.password.set('');
        this.confirm.set('');
        this.uploadLogoThenContinue();
      },
      error: (e: unknown) => {
        this.submitting.set(false);
        this.showErrors(toApiError(e));
      }
    });
  }

  private uploadLogoThenContinue(): void {
    const file = this.logoFile();
    const go = () => void this.router.navigate(['/onboarding']);
    if (!file) return go();

    // The logo goes into the new company's DRAFT theme; the branding wizard picks it up. A failure here never blocks sign-up.
    this.branding.upload('logo', file).subscribe({ next: go, error: go });
  }

  private showErrors(err: ApiError): void {
    const map: Record<string, string> = {};
    for (const [field, messages] of Object.entries(err.fieldErrors)) map[field] = messages[0] ?? err.message;
    this.errors.set(map);
    this.formError.set(Object.keys(map).length ? 'Please fix the highlighted fields.' : err.message);

    const typeFields = ['enterpriseType', 'customEnterpriseType', 'additionalEnterpriseTypes'];
    const companyFields = ['companyName', 'slug', 'businessEmail', 'businessPhone', 'countryCode', 'currencyCode', 'walletCurrencies', 'timeZoneId', 'primaryLocation'];
    const fields = Object.keys(map);
    if (fields.some((f) => typeFields.includes(f))) this.d.update((c) => ({ ...c, step: 'type' }));
    else if (fields.some((f) => companyFields.includes(f))) this.d.update((c) => ({ ...c, step: 'company' }));
  }

  // ---- Local progress ------------------------------------------------------------------------

  private restoreDraft(): Draft {
    const tz = browserTimeZone();
    const fresh: Draft = {
      type: null, additionalTypes: [], customType: '', companyName: '', slug: '', slugTouched: false, businessEmail: '', businessPhone: '',
      countryCode: 'NG', currencyCode: 'NGN', walletCurrencies: [], timeZoneId: COUNTRIES.some((c) => c.timeZone === tz) ? tz : 'Africa/Lagos',
      primaryLocation: '', adminFullName: '', adminEmail: '', step: 'type'
    };
    try {
      const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') as Partial<Draft> | null;
      return saved && typeof saved === 'object' ? { ...fresh, ...saved } : fresh;
    } catch {
      return fresh;
    }
  }

  private persistDraft(draft: Draft): void {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* storage unavailable: progress just is not remembered */ }
  }

  private clearDraft(): void {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  }

  private revokeLogo(): void {
    const url = this.logoPreview();
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
  }
}

function slugify(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
}

