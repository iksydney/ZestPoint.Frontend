import {
  ChangeDetectionStrategy, Component, DestroyRef, HostListener, computed, inject, input, output, signal
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { debounceTime, filter, firstValueFrom, forkJoin } from 'rxjs';
import {
  BrandingColorScheme, BrandingDto, CompanyProfileDto, EnterpriseTypeCode, EnterpriseTypeDto, SaveBrandingRequest,
  ThemePresetDto, ThemeSuggestionDto
} from '../../core/models/api.model';
import { ApiError, toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import {
  BrandingApiService, CompanyApiService, OnboardingService, RegistrationService
} from '../../core/services/domain.services';
import { relativeLuminance } from '../../core/theme/color';
import { FONT_OPTIONS, auditTheme, computeInitials, statusColors } from '../../core/theme/theme-tokens';
import { BrandMarkComponent } from '../../shared/ui/brand-mark.component';
import { SearchSelectComponent, SelectOption } from '../../shared/ui/search-select.component';
import { BrandPreviewComponent, PreviewTheme } from './brand-preview.component';
import { ColorFieldComponent } from './color-field.component';

type Tab = 'identity' | 'colors' | 'receipt';
const MAX_LOGO_BYTES = 1_048_576;
const MAX_SVG_BYTES = 262_144;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

/** The values the editor changes. One object keeps "is it dirty?" and "send it to the server" trivial and consistent. */
interface DraftValues {
  themePreset: string;
  companyName: string;
  enterpriseType: EnterpriseTypeCode;
  customEnterpriseType: string;
  shortName: string;
  tagline: string;
  initialsOverride: string;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  successColor: string | null;
  warningColor: string | null;
  errorColor: string | null;
  colorScheme: BrandingColorScheme;
  fontFamily: string;
  receiptHeader: string;
  receiptFooter: string;
}

type ColorKey = 'primaryColor' | 'secondaryColor' | 'backgroundColor' | 'surfaceColor' | 'textColor' | 'successColor' | 'warningColor' | 'errorColor';

/**
 * Branding &amp; Appearance editor (split screen: controls on the left, live preview on the right). Used by the onboarding
 * wizard (with autosave) and by Settings -> Branding &amp; Appearance.
 *
 * Draft vs saved: edits live in this component's signals and drive the preview instantly. "Save draft" stores them as the
 * company's server-side draft, visible only to branding editors. Only "Save and continue" (publish) changes the theme other
 * users and devices see, and only then does the app-wide ThemeService re-theme.
 */
@Component({
    selector: 'zp-branding-editor',
    imports: [FormsModule, ColorFieldComponent, BrandPreviewComponent, BrandMarkComponent, SearchSelectComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    @if (loading()) {
      <p class="p-6 text-ink/80" role="status">Loading your brand settings...</p>
    } @else {
      <div class="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <!-- ============ Controls ============ -->
        <section aria-label="Brand settings" class="space-y-4">
          <div role="tablist" aria-label="Brand settings sections" class="flex gap-1 rounded-lg border border-ink/15 p-1">
            @for (t of tabs; track t.key) {
              <button type="button" role="tab" class="app-focus flex-1 rounded-md px-3 py-1.5 text-sm font-medium"
                      [attr.aria-selected]="tab() === t.key" [class]="tab() === t.key ? 'bg-primary text-on-primary' : 'text-ink/80 hover:bg-ink/10'"
                      (click)="setTab(t.key)" [attr.data-testid]="'tab-' + t.key">{{ t.label }}</button>
            }
          </div>

          @if (error()) { <p class="sys-alert sys-alert-danger" role="alert">{{ error() }}</p> }
          @if (notice()) { <p class="sys-alert sys-alert-success" role="status">{{ notice() }}</p> }

          @switch (tab()) {
            @case ('identity') {
              <div class="app-card space-y-3">
                <div>
                  <label class="app-label" for="b-company">Company name</label>
                  <input id="b-company" class="app-input" maxlength="120" [ngModel]="v().companyName" (ngModelChange)="set('companyName', $event)" data-testid="company-name" />
                  <p class="app-hint">Saved to your company profile when you save. The initials logo is generated from this name.</p>
                </div>
                <div>
                  <label class="app-label" for="b-short">Short brand name</label>
                  <input id="b-short" class="app-input" maxlength="40" [ngModel]="v().shortName" (ngModelChange)="set('shortName', $event)" data-testid="short-name" />
                </div>
                <div>
                  <label class="app-label" for="b-type">Enterprise type</label>
                  <zp-search-select inputId="b-type" testId="branding-type" noun="business type" placeholder="Search: supermarket, bar, hotel..."
                                    [options]="typeOptions()" [value]="v().enterpriseType" (valueChange)="set('enterpriseType', $event)" />
                </div>
                @if (v().enterpriseType === 'Other') {
                  <div>
                    <label class="app-label" for="b-custom">Your business type</label>
                    <input id="b-custom" class="app-input" maxlength="100" [ngModel]="v().customEnterpriseType" (ngModelChange)="set('customEnterpriseType', $event)" />
                  </div>
                }
                <div>
                  <label class="app-label" for="b-tag">Brand tagline</label>
                  <input id="b-tag" class="app-input" maxlength="160" [ngModel]="v().tagline" (ngModelChange)="set('tagline', $event)" placeholder="e.g. Pour it right" data-testid="tagline" />
                </div>
              </div>

              <div class="app-card space-y-3">
                <p class="text-sm font-semibold">Logo</p>
                <div class="flex items-center gap-3">
                  <zp-brand-mark [logoUrl]="logoUrl()" [initials]="initials()" [name]="v().companyName" [size]="56" />
                  <div class="space-y-1 text-sm">
                    <label class="btn-outline cursor-pointer text-sm">
                      Upload logo
                      <input type="file" class="sr-only" accept="image/png,image/jpeg,image/webp,image/svg+xml" (change)="onFile('logo', $event)" data-testid="logo-input" />
                    </label>
                    @if (logoUrl()) { <button type="button" class="btn-ghost text-sm" (click)="removeMedia('logo')" data-testid="remove-logo">Remove logo</button> }
                  </div>
                </div>
                <p class="app-hint">PNG, JPEG, WebP or SVG, up to 1 MB (SVG up to 256 KB). SVGs are cleaned of scripts before use. Without a logo, ZestPoint generates <strong>{{ initials() }}</strong> in your brand colours.</p>
                <div>
                  <label class="app-label" for="b-initials">Initials (optional override)</label>
                  <input id="b-initials" class="app-input w-28 uppercase" maxlength="4" [ngModel]="v().initialsOverride" (ngModelChange)="set('initialsOverride', $event)" [placeholder]="generatedInitials()" data-testid="initials-input" />
                </div>
                <div class="flex items-center gap-3 border-t border-ink/10 pt-3">
                  <zp-brand-mark [logoUrl]="faviconUrl()" [initials]="initials()" [name]="'Favicon'" [size]="32" />
                  <label class="btn-outline cursor-pointer text-sm">
                    Upload favicon (optional)
                    <input type="file" class="sr-only" accept="image/png,image/jpeg,image/webp,image/svg+xml" (change)="onFile('favicon', $event)" />
                  </label>
                  @if (faviconUrl()) { <button type="button" class="btn-ghost text-sm" (click)="removeMedia('favicon')">Remove</button> }
                </div>
              </div>
            }

            @case ('colors') {
              <div class="app-card space-y-3">
                <label class="app-label" for="b-preset">Theme preset</label>
                <select id="b-preset" class="app-input" [ngModel]="v().themePreset" (ngModelChange)="applyPreset($event)" data-testid="preset-select">
                  @for (p of presets(); track p.key) { <option [value]="p.key">{{ p.name }}</option> }
                </select>
                <p class="app-hint">All presets meet WCAG AA contrast. Editing any colour switches you to Custom.</p>
                <div class="flex flex-wrap gap-2" aria-label="Preset palettes">
                  @for (p of presets(); track p.key) {
                    <button type="button" class="app-focus flex overflow-hidden rounded-lg border border-ink/20" [attr.title]="p.name" [attr.aria-label]="'Apply ' + p.name"
                            (click)="applyPreset(p.key)">
                      @for (c of [p.primaryColor, p.secondaryColor, p.backgroundColor, p.surfaceColor]; track $index) {
                        <span class="block h-7 w-5" [style.background]="c"></span>
                      }
                    </button>
                  }
                </div>
              </div>

              <div class="app-card grid gap-3 sm:grid-cols-2">
                <zp-color-field label="Primary accent" testId="primary" [value]="v().primaryColor" (valueChange)="setColor('primaryColor', $event)" (reset)="resetColor('primaryColor')" />
                <zp-color-field label="Secondary accent" testId="secondary" [value]="v().secondaryColor" (valueChange)="setColor('secondaryColor', $event)" (reset)="resetColor('secondaryColor')" />
                <zp-color-field label="Background" testId="background" [value]="v().backgroundColor" (valueChange)="setColor('backgroundColor', $event)" (reset)="resetColor('backgroundColor')" />
                <zp-color-field label="Surface / cards" testId="surface" [value]="v().surfaceColor" (valueChange)="setColor('surfaceColor', $event)" (reset)="resetColor('surfaceColor')" />
                <zp-color-field label="Main text" testId="text" [value]="v().textColor" (valueChange)="setColor('textColor', $event)" (reset)="resetColor('textColor')" />
              </div>

              <details class="app-card">
                <summary class="cursor-pointer text-sm font-semibold">Status colours (optional)</summary>
                <div class="mt-3 grid gap-3 sm:grid-cols-3">
                  <zp-color-field label="Success" testId="success" [optional]="true" [value]="v().successColor" (valueChange)="setColor('successColor', $event)" (reset)="resetColor('successColor')" />
                  <zp-color-field label="Warning" testId="warning" [optional]="true" [value]="v().warningColor" (valueChange)="setColor('warningColor', $event)" (reset)="resetColor('warningColor')" />
                  <zp-color-field label="Error" testId="error" [optional]="true" [value]="v().errorColor" (valueChange)="setColor('errorColor', $event)" (reset)="resetColor('errorColor')" />
                </div>
                <p class="app-hint">Left blank, these are chosen automatically so they stay readable on your surface colour.</p>
              </details>

              <div class="app-card space-y-2">
                <p class="text-sm font-semibold">Suggest a palette</p>
                <p class="app-hint">Builds complementary colours from your primary accent. You stay in control: accept, edit or reject.</p>
                <div class="flex flex-wrap items-center gap-2">
                  <select class="app-input w-auto" [ngModel]="harmony()" (ngModelChange)="harmony.set($event)" aria-label="Colour harmony">
                    <option value="complementary">Complementary</option><option value="analogous">Analogous</option><option value="triadic">Triadic</option>
                  </select>
                  <button type="button" class="btn-outline" (click)="suggest()" [disabled]="suggesting()" data-testid="suggest-btn">Suggest</button>
                </div>
                @if (suggestion(); as s) {
                  <div class="rounded-lg border border-ink/20 p-3" data-testid="suggestion">
                    <div class="mb-2 flex overflow-hidden rounded-md">
                      @for (c of [s.primaryColor, s.secondaryColor, s.backgroundColor, s.surfaceColor, s.textColor]; track $index) { <span class="block h-8 flex-1" [style.background]="c"></span> }
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <button type="button" class="btn-primary" (click)="acceptSuggestion()">Accept</button>
                      <button type="button" class="btn-outline" (click)="acceptSuggestion(true)">Accept and edit</button>
                      <button type="button" class="btn-ghost" (click)="suggestion.set(null)">Reject</button>
                    </div>
                  </div>
                }
              </div>

              <div class="app-card space-y-2" aria-live="polite" data-testid="contrast-panel">
                <p class="text-sm font-semibold">Accessibility check</p>
                @if (issues().length === 0) {
                  <p class="text-sm text-ink/80">All colour pairs meet the recommended contrast.</p>
                } @else {
                  @for (i of issues(); track i.pair) {
                    <p class="text-sm" [class]="i.blocking ? 'text-danger' : 'text-warning'">
                      <strong>{{ i.blocking ? 'Cannot publish:' : 'Warning:' }}</strong> {{ i.message }}
                    </p>
                  }
                }
              </div>
            }

            @case ('receipt') {
              <div class="app-card space-y-3">
                <div>
                  <label class="app-label" for="b-font">Typography</label>
                  <select id="b-font" class="app-input" [ngModel]="v().fontFamily" (ngModelChange)="set('fontFamily', $event)">
                    @for (f of fonts; track f.key) { <option [value]="f.key">{{ f.label }}</option> }
                  </select>
                </div>
                <div>
                  <label class="app-label" for="b-scheme">Light / dark preference</label>
                  <select id="b-scheme" class="app-input" [ngModel]="v().colorScheme" (ngModelChange)="set('colorScheme', $event)">
                    <option value="System">Follow the device</option><option value="Light">Light</option><option value="Dark">Dark</option>
                  </select>
                </div>
                <div>
                  <label class="app-label" for="b-rh">Receipt header</label>
                  <textarea id="b-rh" rows="2" maxlength="300" class="app-input" [ngModel]="v().receiptHeader" (ngModelChange)="set('receiptHeader', $event)" placeholder="Address, phone, tax number"></textarea>
                </div>
                <div>
                  <label class="app-label" for="b-rf">Receipt footer</label>
                  <textarea id="b-rf" rows="2" maxlength="300" class="app-input" [ngModel]="v().receiptFooter" (ngModelChange)="set('receiptFooter', $event)" placeholder="Thank you! Come again."></textarea>
                </div>
              </div>
            }
          }

          <!-- Actions -->
          <div class="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-2 border-t border-ink/10 bg-canvas/95 p-2 backdrop-blur">
            <button type="button" class="btn-outline" (click)="previewOpen.set(true)" data-testid="preview-theme">Preview theme</button>
            <button type="button" class="btn-ghost" (click)="resetToSaved()" [disabled]="busy()" data-testid="reset-theme">Reset theme</button>
            <button type="button" class="btn-outline" (click)="saveDraft()" [disabled]="busy() || !dirty()" data-testid="save-draft">
              {{ saving() ? 'Saving...' : 'Save draft' }}
            </button>
            <button type="button" class="btn-primary" (click)="saveAndContinue()" [disabled]="busy() || blocking()" data-testid="save-continue"
                    [attr.title]="blocking() ? 'Fix the contrast problems first' : null">
              {{ publishing() ? 'Publishing...' : mode() === 'onboarding' ? 'Save and continue' : 'Save and apply' }}
            </button>
          </div>
          <p class="text-xs text-ink/70" aria-live="polite">
            @if (dirty()) { Unsaved changes are visible only in this preview. }
            @else if (hasServerDraft()) { Draft saved. Other users still see the published theme until you save and apply. }
            @else { Showing the theme your team currently sees (version {{ published()?.version }}). }
          </p>
        </section>

        <!-- ============ Live preview ============ -->
        <section aria-label="Live preview" class="min-w-0 lg:sticky lg:top-4 lg:self-start">
          <zp-brand-preview [theme]="previewTheme()" />
        </section>
      </div>

      @if (previewOpen()) {
        <div class="fixed inset-0 z-50 overflow-auto bg-canvas/95 p-4" role="dialog" aria-modal="true" aria-label="Theme preview" (click)="previewOpen.set(false)">
          <div class="mx-auto max-w-5xl" (click)="$event.stopPropagation()">
            <div class="mb-3 flex items-center justify-between">
              <p class="text-sm font-semibold">Theme preview (nothing is saved or shared)</p>
              <button type="button" class="btn-primary" (click)="previewOpen.set(false)">Exit preview</button>
            </div>
            <zp-brand-preview [theme]="previewTheme()" />
          </div>
        </div>
      }
    }
  `
})
export class BrandingEditorComponent {
  private readonly api = inject(BrandingApiService);
  private readonly company = inject(CompanyApiService);
  private readonly registration = inject(RegistrationService);
  private readonly onboarding = inject(OnboardingService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly mode = input<'onboarding' | 'settings'>('settings');
  /** Emitted after the theme is published (the "continue" action). */
  readonly saved = output<BrandingDto>();

  protected readonly tabs: readonly { key: Tab; label: string }[] = [
    { key: 'identity', label: 'Identity' }, { key: 'colors', label: 'Colours' }, { key: 'receipt', label: 'Type & receipt' }
  ];
  protected readonly fonts = FONT_OPTIONS;

  protected readonly tab = signal<Tab>('identity');
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly publishing = signal(false);
  protected readonly previewOpen = signal(false);

  protected readonly published = signal<BrandingDto | null>(null);
  protected readonly presets = signal<ThemePresetDto[]>([]);
  protected readonly enterpriseTypes = signal<EnterpriseTypeDto[]>([]);
  /** The same words and groups as the registration page's list of business types. */
  protected readonly typeOptions = computed<SelectOption<EnterpriseTypeCode>[]>(() =>
    this.enterpriseTypes().map((t) => ({ value: t.code, label: t.name, description: t.description, group: t.category === 'Group' ? 'Groups' : t.category })));
  protected readonly suggestion = signal<ThemeSuggestionDto | null>(null);
  protected readonly suggesting = signal(false);
  protected readonly harmony = signal('complementary');
  protected readonly hasServerDraft = signal(false);

  protected readonly v = signal<DraftValues>(emptyValues());
  protected readonly logoUrl = signal<string | null>(null);
  protected readonly faviconUrl = signal<string | null>(null);
  private readonly rowVersion = signal<string | null>(null);
  private readonly baseline = signal('');
  private companyProfile: CompanyProfileDto | null = null;

  protected readonly busy = computed(() => this.saving() || this.publishing());
  protected readonly generatedInitials = computed(() => computeInitials(this.v().companyName));
  protected readonly initials = computed(() => (this.v().initialsOverride.trim() || this.generatedInitials()).toUpperCase().slice(0, 4));

  /** What the preview renders: derived from the editor's signals, so it reacts to every keystroke and colour pick. */
  protected readonly previewTheme = computed<PreviewTheme>(() => {
    const v = this.v();
    return {
      primaryColor: v.primaryColor, secondaryColor: v.secondaryColor, backgroundColor: v.backgroundColor,
      surfaceColor: v.surfaceColor, textColor: v.textColor, successColor: v.successColor, warningColor: v.warningColor,
      errorColor: v.errorColor, fontFamily: v.fontFamily,
      shortName: v.shortName, tagline: v.tagline || null, initials: this.initials(), logoUrl: this.logoUrl(),
      receiptHeader: v.receiptHeader || null, receiptFooter: v.receiptFooter || null
    };
  });

  protected readonly issues = computed(() => auditTheme(this.previewTheme()));
  protected readonly blocking = computed(() => this.issues().some((i) => i.blocking));
  protected readonly dirty = computed(() => this.snapshot() !== this.baseline());
  private readonly snapshot = computed(() => JSON.stringify([this.v(), this.logoUrl(), this.faviconUrl()]));

  constructor() {
    forkJoin({
      state: this.api.state(),
      presets: this.api.presets(),
      company: this.company.get(),
      types: this.registration.enterpriseTypes()
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ state, presets, company, types }) => {
        this.companyProfile = company;
        this.presets.set(presets);
        this.enterpriseTypes.set(types);
        this.published.set(state.published);
        this.hasServerDraft.set(!!state.draft);
        this.load(state.draft ?? state.published, company);
        this.loading.set(false);
        this.restoreTab();
      },
      error: (e: unknown) => {
        this.error.set(toApiError(e).message);
        this.loading.set(false);
      }
    });

    // Onboarding saves progress automatically; settings use the explicit Save draft button.
    toObservable(this.snapshot).pipe(
      debounceTime(1500),
      filter(() => this.mode() === 'onboarding' && !this.loading() && this.dirty() && !this.busy()),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => void this.saveDraft(true));
  }

  @HostListener('window:beforeunload', ['$event'])
  protected warnOnUnsaved(event: BeforeUnloadEvent): void {
    if (this.dirty()) event.preventDefault();
  }

  @HostListener('document:keydown.escape')
  protected closePreview(): void {
    this.previewOpen.set(false);
  }

  // ---- Editing -------------------------------------------------------------------------------

  protected set<K extends keyof DraftValues>(key: K, value: DraftValues[K]): void {
    this.v.update((cur) => ({ ...cur, [key]: value }));
  }

  protected setColor(key: ColorKey, value: string | null): void {
    this.v.update((cur) => ({ ...cur, [key]: value, themePreset: 'custom' }));
  }

  /** Reset one colour to what it is in the published theme (or automatic for the optional status colours). */
  protected resetColor(key: ColorKey): void {
    const pub = this.published();
    const fallback: Record<ColorKey, string | null> = {
      primaryColor: pub?.primaryColor ?? '#1D4ED8', secondaryColor: pub?.secondaryColor ?? '#B45309',
      backgroundColor: pub?.backgroundColor ?? '#F8FAFC', surfaceColor: pub?.surfaceColor ?? '#FFFFFF',
      textColor: pub?.textColor ?? '#0F172A', successColor: null, warningColor: null, errorColor: null
    };
    this.v.update((cur) => ({ ...cur, [key]: fallback[key] }));
  }

  protected applyPreset(key: string): void {
    const p = this.presets().find((x) => x.key === key);
    if (!p) return;
    this.v.update((cur) => ({
      ...cur, themePreset: key, primaryColor: p.primaryColor, secondaryColor: p.secondaryColor, backgroundColor: p.backgroundColor,
      surfaceColor: p.surfaceColor, textColor: p.textColor, colorScheme: p.isDark ? 'Dark' : 'Light'
    }));
  }

  protected resetToSaved(): void {
    const pub = this.published();
    if (!pub || !this.companyProfile) return;
    if (this.dirty() && !confirm('Discard your unsaved changes and go back to the current theme?')) return;
    this.load(pub, this.companyProfile);
    this.notice.set(null);
    this.error.set(null);
  }

  protected suggest(): void {
    this.suggesting.set(true);
    const dark = relativeLuminance(this.v().backgroundColor) < 0.5;
    this.api.suggest(this.v().primaryColor, dark, this.harmony()).subscribe({
      next: (s) => { this.suggestion.set(s); this.suggesting.set(false); },
      error: (e: unknown) => { this.error.set(toApiError(e).message); this.suggesting.set(false); }
    });
  }

  protected acceptSuggestion(edit = false): void {
    const s = this.suggestion();
    if (!s) return;
    this.v.update((cur) => ({
      ...cur, themePreset: 'custom', primaryColor: s.primaryColor, secondaryColor: s.secondaryColor,
      backgroundColor: s.backgroundColor, surfaceColor: s.surfaceColor, textColor: s.textColor
    }));
    this.suggestion.set(null);
    if (edit) this.tab.set('colors');
  }

  protected setTab(tab: Tab): void {
    this.tab.set(tab);
    if (this.mode() === 'onboarding') this.onboarding.saveState(JSON.stringify({ tab }), 'Branding').subscribe({ error: () => undefined });
  }

  // ---- Media ---------------------------------------------------------------------------------

  protected onFile(kind: 'logo' | 'favicon', event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const limit = file.type === 'image/svg+xml' ? MAX_SVG_BYTES : MAX_LOGO_BYTES;
    if (!ALLOWED_TYPES.includes(file.type)) return void this.error.set('Use a PNG, JPEG, WebP or SVG image.');
    if (file.size > limit) return void this.error.set(`That file is too large (max ${Math.round(limit / 1024)} KB).`);

    this.error.set(null);
    const signalFor = kind === 'logo' ? this.logoUrl : this.faviconUrl;
    const previous = signalFor();

    // Instant preview from the local file; the server then validates the real content and stores it in the draft.
    const local = URL.createObjectURL(file);
    signalFor.set(local);

    this.api.upload(kind, file).subscribe({
      next: (draft) => {
        URL.revokeObjectURL(local);
        signalFor.set((kind === 'logo' ? draft.logoUrl : draft.faviconUrl) ?? null);
        this.rowVersion.set(draft.rowVersion);
        this.hasServerDraft.set(true);
        this.rebaseline();
      },
      error: (e: unknown) => {
        URL.revokeObjectURL(local);
        signalFor.set(previous);
        this.error.set(toApiError(e).message);
      }
    });
  }

  protected removeMedia(kind: 'logo' | 'favicon'): void {
    const signalFor = kind === 'logo' ? this.logoUrl : this.faviconUrl;
    const previous = signalFor();
    signalFor.set(null); // the preview falls back to the generated initials immediately
    this.api.removeMedia(kind).subscribe({
      next: (draft) => { this.rowVersion.set(draft.rowVersion); this.hasServerDraft.set(true); this.rebaseline(); },
      error: (e: unknown) => { signalFor.set(previous); this.error.set(toApiError(e).message); }
    });
  }

  // ---- Saving --------------------------------------------------------------------------------

  protected async saveDraft(silent = false): Promise<boolean> {
    if (this.busy()) return false;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.saveCompanyIfChanged();
      const draft = await firstValueFrom(this.api.saveDraft(this.toRequest()));
      this.rowVersion.set(draft.rowVersion);
      this.hasServerDraft.set(true);
      this.rebaseline();
      if (!silent) this.notice.set('Draft saved. Other users will not see it until you save and apply.');
      return true;
    } catch (e) {
      this.reportSaveError(e);
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  protected async saveAndContinue(): Promise<void> {
    if (this.busy() || this.blocking()) return;
    this.publishing.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.saveCompanyIfChanged();
      const draft = await firstValueFrom(this.api.saveDraft(this.toRequest()));
      this.rowVersion.set(draft.rowVersion);
      const published = await firstValueFrom(this.api.publish());

      this.published.set(published);
      this.hasServerDraft.set(false);
      this.rowVersion.set(null);
      this.rebaseline();

      // The saved theme becomes the app-wide theme; refresh onboarding progress so guards/steps update.
      this.auth.patchBranding(published);
      this.onboarding.get().subscribe({ next: (p) => this.auth.patchOnboarding(p), error: () => undefined });
      this.notice.set('Branding saved and applied for everyone in your company.');
      this.saved.emit(published);
    } catch (e) {
      this.reportSaveError(e);
    } finally {
      this.publishing.set(false);
    }
  }

  private async saveCompanyIfChanged(): Promise<void> {
    const c = this.companyProfile;
    const v = this.v();
    if (!c) return;
    const unchanged = c.name === v.companyName.trim() && c.enterpriseType === v.enterpriseType &&
      (c.customEnterpriseType ?? '') === (v.enterpriseType === 'Other' ? v.customEnterpriseType.trim() : '');
    if (unchanged) return;

    const updated = await firstValueFrom(this.company.update({
      name: v.companyName.trim(), enterpriseType: v.enterpriseType,
      customEnterpriseType: v.enterpriseType === 'Other' ? v.customEnterpriseType.trim() : null,
      additionalEnterpriseTypes: [...c.additionalEnterpriseTypes],
      businessEmail: c.businessEmail, businessPhone: c.businessPhone, countryCode: c.countryCode,
      currencyCode: c.currencyCode, timeZoneId: c.timeZoneId, primaryLocation: c.primaryLocation
    }));
    this.companyProfile = updated;
  }

  private toRequest(): SaveBrandingRequest {
    const v = this.v();
    return {
      themePreset: v.themePreset,
      shortName: v.shortName.trim() || v.companyName.trim().slice(0, 40),
      tagline: v.tagline.trim() || null,
      initials: v.initialsOverride.trim() || null,
      primaryColor: v.primaryColor, secondaryColor: v.secondaryColor, backgroundColor: v.backgroundColor,
      surfaceColor: v.surfaceColor, textColor: v.textColor,
      successColor: v.successColor, warningColor: v.warningColor, errorColor: v.errorColor,
      colorScheme: v.colorScheme, fontFamily: v.fontFamily,
      receiptHeader: v.receiptHeader.trim() || null, receiptFooter: v.receiptFooter.trim() || null,
      rowVersion: this.rowVersion()
    };
  }

  private reportSaveError(e: unknown): void {
    const err = toApiError(e);
    const first = Object.values(err.fieldErrors)[0]?.[0];
    this.error.set(err.status === 409
      ? 'This draft was changed somewhere else. Reload the page to continue with the latest version.'
      : first ? `${err.message} ${first}` : err.message);
  }

  // ---- State plumbing ------------------------------------------------------------------------

  private load(theme: BrandingDto, company: CompanyProfileDto): void {
    this.v.set({
      themePreset: theme.themePreset,
      companyName: company.name,
      enterpriseType: company.enterpriseType,
      customEnterpriseType: company.customEnterpriseType ?? '',
      shortName: theme.shortName,
      tagline: theme.tagline ?? '',
      initialsOverride: theme.initialsFallback === computeInitials(company.name) ? '' : theme.initialsFallback,
      primaryColor: theme.primaryColor, secondaryColor: theme.secondaryColor, backgroundColor: theme.backgroundColor,
      surfaceColor: theme.surfaceColor, textColor: theme.textColor,
      ...customStatusColors(theme),
      colorScheme: theme.colorScheme, fontFamily: theme.fontFamily,
      receiptHeader: theme.receiptHeader ?? '', receiptFooter: theme.receiptFooter ?? ''
    });
    this.logoUrl.set(theme.logoUrl);
    this.faviconUrl.set(theme.faviconUrl);
    this.rowVersion.set(theme.isDraft ? theme.rowVersion : null);
    this.rebaseline();
  }

  private rebaseline(): void {
    this.baseline.set(this.snapshot());
  }

  private restoreTab(): void {
    if (this.mode() !== 'onboarding') return;
    this.onboarding.get().subscribe({
      next: (p) => {
        try {
          const saved = JSON.parse(p.resumeStateJson ?? '{}') as { tab?: Tab };
          if (saved.tab && this.tabs.some((t) => t.key === saved.tab)) this.tab.set(saved.tab);
        } catch { /* ignore malformed resume state */ }
      },
      error: () => undefined
    });
  }

}

/** The server sends effective status colours; only keep one as an explicit choice if it differs from the automatic value. */
function customStatusColors(theme: BrandingDto): Pick<DraftValues, 'successColor' | 'warningColor' | 'errorColor'> {
  const auto = statusColors({ ...theme, successColor: null, warningColor: null, errorColor: null });
  return {
    successColor: theme.successColor.toUpperCase() === auto.success ? null : theme.successColor,
    warningColor: theme.warningColor.toUpperCase() === auto.warning ? null : theme.warningColor,
    errorColor: theme.errorColor.toUpperCase() === auto.error ? null : theme.errorColor
  };
}

function emptyValues(): DraftValues {
  return {
    themePreset: 'custom', companyName: '', enterpriseType: 'Other', customEnterpriseType: '', shortName: '', tagline: '', initialsOverride: '',
    primaryColor: '#1D4ED8', secondaryColor: '#B45309', backgroundColor: '#F8FAFC', surfaceColor: '#FFFFFF', textColor: '#0F172A',
    successColor: null, warningColor: null, errorColor: null, colorScheme: 'System', fontFamily: 'system', receiptHeader: '', receiptFooter: ''
  };
}
