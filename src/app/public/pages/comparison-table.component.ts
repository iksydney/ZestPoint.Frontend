import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Check, LucideAngularModule, LucideIconData, Minus, X } from 'lucide-angular';

type Support = 'yes' | 'partial' | 'no';

interface Row {
  feature: string;
  zestpoint: Support;
  legacy: Support;
  retail: Support;
}

@Component({
    selector: 'zp-comparison-table',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NgTemplateOutlet, LucideAngularModule],
    template: `
    <section class="section bg-white dark:bg-navy/40" aria-labelledby="compare-heading">
      <div class="container-page">
        <div class="mx-auto max-w-2xl text-center">
          <p class="eyebrow">Compare</p>
          <h2 id="compare-heading" class="mt-3 text-3xl font-bold sm:text-4xl">ZestPoint vs. legacy and retail POS</h2>
          <p class="mt-3 text-slate-700 dark:text-slate-300">
            Legacy restaurant-management (RMAN) suites and traditional retail POS each cover only half the picture. Neither combines pour-level control, bar speed and supermarket-scale inventory.
          </p>
        </div>

        <div class="mt-10 overflow-x-auto rounded-2xl border border-line-light dark:border-line-dark">
          <table class="w-full min-w-[640px] border-collapse text-left text-sm">
            <caption class="sr-only">Feature comparison of ZestPoint, legacy RMAN systems and traditional retail POS</caption>
            <thead>
              <tr class="bg-slate-50 dark:bg-navy-900">
                <th scope="col" class="px-5 py-4 font-semibold text-navy-900 dark:text-white">Capability</th>
                <th scope="col" class="px-5 py-4 text-center font-semibold text-brand dark:text-glow-400">ZestPoint</th>
                <th scope="col" class="px-5 py-4 text-center font-semibold text-navy-900 dark:text-white">Legacy RMAN</th>
                <th scope="col" class="px-5 py-4 text-center font-semibold text-navy-900 dark:text-white">Retail POS</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-line-light dark:divide-line-dark">
              @for (r of rows; track r.feature) {
                <tr class="transition hover:bg-brand-50/60 dark:hover:bg-white/5">
                  <th scope="row" class="px-5 py-4 font-medium text-navy-900 dark:text-slate-200">{{ r.feature }}</th>
                  <td class="bg-brand-50/50 px-5 py-4 text-center dark:bg-brand/10"><ng-container [ngTemplateOutlet]="mark" [ngTemplateOutletContext]="{ $implicit: r.zestpoint }" /></td>
                  <td class="px-5 py-4 text-center"><ng-container [ngTemplateOutlet]="mark" [ngTemplateOutletContext]="{ $implicit: r.legacy }" /></td>
                  <td class="px-5 py-4 text-center"><ng-container [ngTemplateOutlet]="mark" [ngTemplateOutletContext]="{ $implicit: r.retail }" /></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="mt-3 text-xs text-slate-600 dark:text-slate-400">Comparison reflects typical capabilities of the categories; individual products vary.</p>
      </div>
    </section>

    <ng-template #mark let-value>
      <span class="inline-flex h-7 w-7 items-center justify-center rounded-full" [class]="tone(value)">
        <lucide-icon [img]="icon(value)" [size]="16" aria-hidden="true" />
        <span class="sr-only">{{ labelOf(value) }}</span>
      </span>
    </ng-template>
  `
})
export class ComparisonTableComponent {
  protected readonly label: Record<Support, string> = { yes: 'Supported', partial: 'Partial', no: 'Not supported' };

  protected readonly rows: readonly Row[] = [
    { feature: 'Offline-first local node with auto-sync', zestpoint: 'yes', legacy: 'partial', retail: 'no' },
    { feature: 'Volumetric pour tracking (ml per cocktail)', zestpoint: 'yes', legacy: 'partial', retail: 'no' },
    { feature: 'Bluetooth bottle weighing & stocktake', zestpoint: 'yes', legacy: 'no', retail: 'no' },
    { feature: 'Screen-level RBAC with staff PINs', zestpoint: 'yes', legacy: 'partial', retail: 'partial' },
    { feature: 'Tab transfer across VIP zones & split by seat', zestpoint: 'yes', legacy: 'partial', retail: 'no' },
    { feature: 'Barcode scanning, promotions & SKU-level inventory', zestpoint: 'yes', legacy: 'partial', retail: 'yes' },
    { feature: 'Weighed items priced from a connected scale', zestpoint: 'yes', legacy: 'no', retail: 'partial' },
    { feature: 'Hotel room posting & venue modes', zestpoint: 'yes', legacy: 'partial', retail: 'no' },
    { feature: 'Multi-tenant, multi-venue and multi-store management', zestpoint: 'yes', legacy: 'partial', retail: 'partial' },
    { feature: 'Subscription feature gates (read-only fallback)', zestpoint: 'yes', legacy: 'no', retail: 'no' }
  ];

  protected labelOf(v: Support): string {
    return this.label[v];
  }

  protected icon(v: Support): LucideIconData {
    return v === 'yes' ? Check : v === 'partial' ? Minus : X;
  }

  protected tone(v: Support): string {
    return v === 'yes'
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300'
      : v === 'partial'
        ? 'bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-300'
        : 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-400';
  }
}
