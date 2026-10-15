import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Building2, Droplets, KeyRound, LucideAngularModule, LucideIconData, Scale, WifiOff, Wine } from 'lucide-angular';

interface Pillar {
  icon: LucideIconData;
  title: string;
  body: string;
}

@Component({
  selector: 'zp-feature-grid',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  template: `
    <section class="section" aria-labelledby="pillars-heading">
      <div class="container-page">
        <div class="mx-auto max-w-2xl text-center">
          <p class="eyebrow">Core pillars</p>
          <h2 id="pillars-heading" class="mt-3 text-3xl font-bold sm:text-4xl">Everything a high-volume venue needs, nothing it doesn't</h2>
        </div>
        <ul class="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          @for (p of pillars; track p.title) {
            <li>
              <div class="zp-card h-full hover:-translate-y-1 hover:border-brand/50 dark:hover:border-glow-400/50 dark:hover:shadow-glow-sm">
                <span class="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-brand dark:bg-glow-400/10 dark:text-glow-400">
                  <lucide-icon [img]="p.icon" [size]="24" aria-hidden="true" />
                </span>
                <h3 class="text-lg font-semibold">{{ p.title }}</h3>
                <p class="mt-2 text-slate-700 dark:text-slate-300">{{ p.body }}</p>
              </div>
            </li>
          }
        </ul>
      </div>
    </section>
  `
})
export class FeatureGridComponent {
  protected readonly pillars: readonly Pillar[] = [
    { icon: Wine, title: 'High-Velocity Checkout & Dynamic Tabs', body: 'Split bar tabs by seat, pre-auth cards and transfer tabs across VIP zones, or run barcode-scan lanes for supermarket queues, without slowing the line.' },
    { icon: Droplets, title: 'Volumetric & Unit-Level Inventory', body: 'Track liquid depletion in milliliters per pour in bars, and stock by SKU, batch and expiry date in stores, with variance surfaced instantly.' },
    { icon: Scale, title: 'Smart Scale Weighing', body: 'Weigh partial spirit bottles via Bluetooth in under 3 seconds, and price loose produce and deli items straight from the scale at checkout.' },
    { icon: KeyRound, title: 'Screen-Level RBAC & Staff PINs', body: 'Granular permissions for voids, comps, stock audits, and ledger visibility, enforced on every screen and API call.' },
    { icon: Building2, title: 'Agnostic Venue Modes', body: 'Adapts seamlessly to nightclubs, hotel bars (room posting), lounges, sports bars, supermarkets and convenience stores.' },
    { icon: WifiOff, title: 'Offline-First Local Node', body: 'Uninterrupted sales on every bar and checkout lane even during total network or internet failure, with automatic sync on recovery.' }
  ];
}
