import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { OnboardingStep } from '../../core/models/api.model';
import { AuthService } from '../../core/services/auth.service';
import { BrandMarkComponent } from '../../shared/ui/brand-mark.component';
import { BrandingEditorComponent } from '../branding/branding-editor.component';

const STEP_LABELS: Record<OnboardingStep, { title: string; blurb: string }> = {
  Company: { title: 'Company', blurb: 'Your business details' },
  Branding: { title: 'Brand', blurb: 'Logo, colours and receipts' },
  Staff: { title: 'Staff & roles', blurb: 'Invite your team and set permissions' },
  Subscription: { title: 'Plan', blurb: 'Choose your plan and modules' }
};

/**
 * First-run setup. The company step is finished by registration; the brand step is this wizard; the remaining steps are
 * available from the dashboard once their screens ship. Progress is stored on the server (and the branding draft autosaves),
 * so leaving and coming back resumes exactly here, from any device.
 */
@Component({
  selector: 'zp-onboarding',
  standalone: true,
  imports: [RouterLink, BrandMarkComponent, BrandingEditorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-canvas text-ink">
      <header class="border-b border-ink/10 bg-panel">
        <div class="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div class="flex items-center gap-3">
            <zp-brand-mark [logoUrl]="branding()?.logoUrl ?? null" [initials]="branding()?.initialsFallback ?? 'ZP'" [name]="tenantName()" [size]="36" />
            <div>
              <p class="text-sm font-bold">{{ tenantName() }}</p>
              <p class="text-xs text-ink/70">Set up your workspace</p>
            </div>
          </div>
          <button type="button" class="btn-ghost text-sm" (click)="signOut()">Sign out</button>
        </div>
      </header>

      <main class="mx-auto max-w-7xl px-4 py-6">
        <div class="mb-6" role="group" aria-label="Setup progress">
          <div class="mb-2 flex items-center justify-between text-sm">
            <p class="font-semibold">Step {{ currentIndex() + 1 }} of {{ steps().length }}: {{ labelFor(current()).title }}</p>
            <p class="text-ink/80" data-testid="progress-percent">{{ percent() }}% complete</p>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-ink/10" role="progressbar" [attr.aria-valuenow]="percent()" aria-valuemin="0" aria-valuemax="100">
            <div class="h-full bg-primary transition-all" [style.width.%]="percent()"></div>
          </div>
          <ol class="mt-3 grid gap-2 sm:grid-cols-4">
            @for (s of steps(); track s.step) {
              <li class="rounded-lg border p-2 text-sm" [class]="s.step === current() ? 'border-primary bg-primary/10' : 'border-ink/15'" [attr.aria-current]="s.step === current() ? 'step' : null">
                <span class="font-semibold">{{ s.completed ? 'Done: ' : '' }}{{ labelFor(s.step).title }}</span>
                <span class="block text-xs text-ink/70">{{ labelFor(s.step).blurb }}</span>
              </li>
            }
          </ol>
        </div>

        @if (brandDone()) {
          <section class="app-card space-y-3 text-center" aria-live="polite" data-testid="brand-done">
            <p class="text-xl font-bold">Your brand is live.</p>
            <p class="text-ink/80">Everyone in {{ tenantName() }} now sees your logo and colours. Next, invite your team and set what each person can do.</p>
            <div class="flex justify-center gap-2">
              <a routerLink="/app/staff" class="btn-primary" data-testid="go-staff">Set up staff &amp; roles</a>
              <a routerLink="/app/subscription" class="btn-outline" data-testid="go-subscription">Choose your plan</a>
              <a routerLink="/app/dashboard" class="btn-outline" data-testid="go-dashboard">Go to the dashboard</a>
              <button type="button" class="btn-outline" (click)="brandDone.set(false)">Keep editing brand</button>
            </div>
          </section>
        } @else {
          <zp-branding-editor mode="onboarding" (saved)="onSaved()" />
        }
      </main>
    </div>
  `
})
export class OnboardingComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly branding = this.auth.branding;
  protected readonly tenantName = computed(() => this.auth.tenant()?.name ?? 'Your company');
  protected readonly steps = computed(() => this.auth.onboarding()?.steps ?? []);
  protected readonly current = computed(() => this.auth.onboarding()?.currentStep ?? 'Branding');
  protected readonly percent = computed(() => this.auth.onboarding()?.percent ?? 0);
  protected readonly currentIndex = computed(() => Math.max(0, this.steps().findIndex((s) => s.step === this.current())));
  protected readonly brandDone = signal(false);

  protected labelFor(step: OnboardingStep) {
    return STEP_LABELS[step];
  }

  protected onSaved(): void {
    this.brandDone.set(true);
  }

  protected signOut(): void {
    void this.auth.logout();
  }
}
