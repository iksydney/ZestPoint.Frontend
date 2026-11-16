import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Check, LucideAngularModule } from 'lucide-angular';
import { REGISTER_URL } from '../site';

/**
 * EXAMPLE PRICING: these mirror the example plans the platform ships with (Express Bar, Cocktail Pro, Enterprise Lounge). The real, editable
 * price list lives in the platform operator's plan settings; keep this marketing copy in step with it.
 */
const ANNUAL_DISCOUNT = 0.2;

interface Plan {
  name: string;
  blurb: string;
  monthly: number | null; // null => custom quote
  features: readonly string[];
  highlight?: boolean;
}

@Component({
    selector: 'zp-pricing-preview',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, LucideAngularModule],
    template: `
    <section class="section" aria-labelledby="pricing-heading">
      <div class="container-page">
        <div class="mx-auto max-w-2xl text-center">
          <p class="eyebrow">Pricing</p>
          <h2 id="pricing-heading" class="mt-3 text-3xl font-bold sm:text-4xl">Plans that scale with your venue</h2>

          <div class="mt-6 inline-flex items-center gap-3">
            <span class="text-sm font-medium" [class]="!annual() ? 'text-navy-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'">Monthly</span>
            <button
              type="button"
              role="switch"
              [attr.aria-checked]="annual()"
              aria-label="Bill annually"
              (click)="annual.set(!annual())"
              class="relative h-7 w-12 rounded-full transition"
              [class]="annual() ? 'bg-brand' : 'bg-slate-400 dark:bg-slate-600'"
            >
              <span class="absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform" [class.translate-x-5]="annual()"></span>
            </button>
            <span class="text-sm font-medium" [class]="annual() ? 'text-navy-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'">Annual</span>
            <span class="zp-badge">Save {{ discountPct }}%</span>
          </div>
        </div>

        <div class="mt-12 grid gap-6 lg:grid-cols-3">
          @for (plan of plans; track plan.name) {
            <div class="zp-card flex flex-col" [class]="plan.highlight ? 'border-brand ring-1 ring-brand dark:border-glow-400 dark:ring-glow-400 dark:shadow-glow-sm' : ''">
              <div class="flex items-center justify-between">
                <h3 class="text-xl font-semibold">{{ plan.name }}</h3>
                @if (plan.highlight) { <span class="zp-badge">Most popular</span> }
              </div>
              <p class="mt-1 text-sm text-slate-700 dark:text-slate-300">{{ plan.blurb }}</p>
              <p class="mt-6 flex items-baseline gap-1">
                @if (price(plan) === null) {
                  <span class="font-display text-4xl font-bold text-navy-900 dark:text-white">Custom</span>
                } @else {
                  <span class="font-display text-4xl font-bold text-navy-900 dark:text-white">\${{ price(plan) }}</span>
                  <span class="text-sm text-slate-600 dark:text-slate-400">/ venue / month{{ annual() ? ', billed yearly' : '' }}</span>
                }
              </p>
              <ul class="mt-6 flex-1 space-y-3 text-sm">
                @for (f of plan.features; track f) {
                  <li class="flex gap-2">
                    <lucide-icon [img]="Check" [size]="16" class="mt-0.5 shrink-0 text-brand dark:text-glow-400" aria-hidden="true" />
                    <span>{{ f }}</span>
                  </li>
                }
              </ul>
              <a
                [routerLink]="plan.monthly === null ? '/contact' : onboardingUrl"
                class="zp-btn mt-8 w-full"
                [class]="plan.highlight ? 'zp-btn-primary' : 'zp-btn-secondary'"
              >{{ plan.monthly === null ? 'Talk to sales' : 'Start free trial' }}</a>
            </div>
          }
        </div>

        @if (!full()) {
          <p class="mt-8 text-center"><a routerLink="/pricing" class="zp-btn zp-btn-ghost">See full plan details</a></p>
        }
        <p class="mt-4 text-center text-xs text-slate-600 dark:text-slate-400">Prices shown in USD, excluding taxes. Illustrative until final pricing is published.</p>
      </div>
    </section>
  `
})
export class PricingPreviewComponent {
  readonly full = input(false);

  protected readonly annual = signal(false);
  protected readonly onboardingUrl = REGISTER_URL;
  protected readonly Check = Check;
  protected readonly discountPct = ANNUAL_DISCOUNT * 100;

  protected readonly plans: readonly Plan[] = [
    { name: 'Express Bar', blurb: 'One bar, shop or store that needs a fast till and stock control.', monthly: 49, features: ['Core POS with tabs, split bills and receipts', 'Inventory with stock movements and purchasing', '1 branch, 5 staff, 2,000 orders a month', 'Offline selling'] },
    { name: 'Cocktail Pro', blurb: 'Bars that pour to a recipe and want to see where stock goes.', monthly: 149, highlight: true, features: ['Everything in Express Bar', 'Recipes with volumetric depletion', 'Weigh-scale bottle audits and pour analytics', 'Kitchen display and financial reporting', '3 branches, 25 staff'] },
    { name: 'Enterprise Lounge', blurb: 'Groups, hotels and supermarket chains across many branches.', monthly: 399, features: ['Everything in Cocktail Pro', 'Multi-branch transfers', 'Hotel room charging and advanced analytics', 'Enterprise API and integrations', 'Unlimited branches, staff and orders'] }
  ];

  protected price(plan: Plan): number | null {
    return plan.monthly === null ? null : Math.round(plan.monthly * (this.annual() ? 1 - ANNUAL_DISCOUNT : 1));
  }
}
