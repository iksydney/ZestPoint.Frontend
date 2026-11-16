import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Cloud, Droplets, KeyRound, LucideAngularModule, LucideIconData, Network, Wine } from 'lucide-angular';
import { REGISTER_URL } from '../site';

interface Module {
  id: string;
  icon: LucideIconData;
  title: string;
  summary: string;
  points: readonly string[];
}

@Component({
    selector: 'zp-features-page',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, LucideAngularModule],
    template: `
    <section class="container-page pb-8 pt-16 text-center sm:pt-24">
      <p class="eyebrow">Platform</p>
      <h1 class="mx-auto mt-3 max-w-3xl text-4xl font-bold sm:text-5xl">Five modules. One platform for every shift, from the bar to the checkout lane.</h1>
      <p class="mx-auto mt-5 max-w-2xl text-lg text-slate-700 dark:text-slate-300">Adopt what you need today and switch on more as you grow.</p>
      <nav aria-label="Modules" class="mt-8 flex flex-wrap justify-center gap-2">
        @for (m of modules; track m.id) {
          <a
            [href]="'#module-' + m.id"
            (click)="jump($event, m.id)"
            class="rounded-full border border-line-light px-4 py-1.5 text-sm font-medium text-navy-900 hover:border-brand hover:text-brand dark:border-line-dark dark:text-slate-200 dark:hover:border-glow-400 dark:hover:text-glow-400"
          >Module {{ m.id }}</a>
        }
      </nav>
    </section>

    <div class="container-page space-y-6 pb-16">
      @for (m of modules; track m.id) {
        <article [id]="'module-' + m.id" class="scroll-mt-24 rounded-3xl border border-line-light bg-white p-6 shadow-card sm:p-10 dark:border-line-dark dark:bg-navy-900/60 dark:shadow-none">
          <div class="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
            <div>
              <span class="zp-badge">Module {{ m.id }}</span>
              <span class="mt-5 grid h-14 w-14 place-items-center rounded-2xl bg-brand-gradient text-white shadow-glow-sm">
                <lucide-icon [img]="m.icon" [size]="28" aria-hidden="true" />
              </span>
              <h2 class="mt-5 text-2xl font-bold sm:text-3xl">{{ m.title }}</h2>
              <p class="mt-3 text-slate-700 dark:text-slate-300">{{ m.summary }}</p>
            </div>
            <ul class="space-y-3">
              @for (p of m.points; track p) {
                <li class="flex gap-3 rounded-xl border border-line-light bg-slate-50 p-4 dark:border-line-dark dark:bg-surface-dark/60">
                  <span aria-hidden="true" class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand dark:bg-glow-400"></span>
                  <span>{{ p }}</span>
                </li>
              }
            </ul>
          </div>
        </article>
      }
    </div>

    <section class="container-page pb-24 text-center">
      <h2 class="text-3xl font-bold">Ready to see it on your bar?</h2>
      <div class="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <a [routerLink]="onboardingUrl" class="zp-btn zp-btn-primary zp-btn-lg">Start Free Trial</a>
        <a routerLink="/contact" class="zp-btn zp-btn-secondary zp-btn-lg">Book a Live Demo</a>
      </div>
    </section>
  `
})
export class FeaturesPageComponent {
  protected readonly onboardingUrl = REGISTER_URL;

  protected readonly modules: readonly Module[] = [
    {
      id: '01',
      icon: Wine,
      title: 'High-Speed Billing, Barcode Checkout & KDS Routing',
      summary: 'A touch-first checkout tuned for the pace of a packed bar and a busy supermarket lane.',
      points: ['One-tap rounds, modifiers and favourites', 'Split bills by seat; transfer tabs between VIP zones', 'Card pre-authorisation for open tabs', 'Orders routed to bar, kitchen and runner screens (KDS) by item category', 'Room posting for hotel bars', 'Barcode scanning, price look-ups, promotions and multi-lane checkout for supermarkets and retail']
    },
    {
      id: '02',
      icon: Droplets,
      title: 'Volumetric & SKU Inventory, Variance & Weigh-Scale Auditing',
      summary: 'Know exactly where every millilitre went.',
      points: ['Recipes deplete stock in milliliters per pour', 'Bluetooth scale weighing of partial bottles in under 3 seconds', 'Theoretical vs. actual variance reports per bar and shift', 'SKU-level stock with batches, expiry dates, reorder levels and supplier receiving for supermarkets', 'Weighed-item pricing for produce, deli and bakery from the scale', 'Audit trail for every count, adjustment and void', 'Permission-gated stock audits (e.g. INV_WEIGHED_AUDIT)']
    },
    {
      id: '03',
      icon: Network,
      title: 'Multi-Venue Management, Centralized Menus & Enterprise Accounting',
      summary: 'Run one venue or fifty from a single workspace.',
      points: ['Central menu and price management with per-venue overrides', 'Cross-venue sales, staff and shrinkage dashboards', 'Tenant-isolated data with company branding', 'Ledger exports for enterprise accounting', 'Store and venue modes: nightclub, hotel bar, lounge, sports bar, supermarket, convenience store']
    },
    {
      id: '04',
      icon: Cloud,
      title: 'Hybrid Offline Architecture & Local Node Synchronization',
      summary: 'Sales never stop, even when the internet does.',
      points: ['A local node at the venue keeps terminals trading through total outages', 'Operations queue locally and sync in order when connectivity returns', 'Client-generated IDs prevent duplicate orders on replay', 'Encrypted local storage and encrypted sync transport', 'Conflict handling with a full audit history']
    },
    {
      id: '05',
      icon: KeyRound,
      title: 'Identity, Screen-Level RBAC & Dynamic Subscription Feature Gates',
      summary: 'The right access for every role, and the right features for every plan.',
      points: ['Fast staff PIN sign-in', 'Permissions mapped to explicit screens and actions: voids, comps, discounts, audits', 'Enforced in the UI and independently on every API call', 'Plan-based feature gates that fall back to graceful read-only mode', 'Tenant checks on every token, so access never leaks across venues']
    }
  ];

  protected jump(event: Event, id: string): void {
    event.preventDefault();
    document.getElementById(`module-${id}`)?.scrollIntoView({ behavior: 'smooth' });
  }
}
