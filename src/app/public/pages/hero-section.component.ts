import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, Moon, ShoppingCart, Sun, Wifi, Wine } from 'lucide-angular';
import { REGISTER_URL } from '../site';

type Mode = 'bar' | 'store';

interface Scene {
  header: string;
  items: readonly { name: string; sub: string; price: string }[];
  seats: string;
  lines: readonly { label: string; amount: string }[];
  total: string;
  action: string;
  alt: string;
}

const SCENES: Record<Mode, Scene> = {
  bar: {
    header: 'Tab #42 · VIP Zone 2',
    items: [
      { name: 'Old Fashioned', sub: '60 ml pour', price: '12.00' },
      { name: 'Espresso Martini', sub: '50 ml pour', price: '14.00' },
      { name: 'Gin & Tonic', sub: '50 ml pour', price: '10.00' },
      { name: 'Whisky Neat', sub: '50 ml pour', price: '11.00' }
    ],
    seats: 'Seat 1 · Seat 2',
    lines: [
      { label: 'Old Fashioned x2', amount: '$24.00' },
      { label: 'Gin & Tonic', amount: '$10.00' }
    ],
    total: '$34.00',
    action: 'Charge',
    alt: 'Illustration of the ZestPoint bar POS screen'
  },
  store: {
    header: 'Lane 3 · Basket #1187',
    items: [
      { name: 'Whole Milk 1L', sub: 'Barcode scanned', price: '2.40' },
      { name: 'Basmati Rice 5kg', sub: 'Barcode scanned', price: '9.80' },
      { name: 'Bananas', sub: '1.24 kg from scale', price: '1.86' },
      { name: 'Sourdough Loaf', sub: 'Promo: 2 for 1', price: '3.50' }
    ],
    seats: 'Cashier · Ada',
    lines: [
      { label: 'Whole Milk 1L x2', amount: '$4.80' },
      { label: 'Bananas 1.24 kg', amount: '$1.86' },
      { label: 'Promo saving', amount: '-$1.75' }
    ],
    total: '$4.91',
    action: 'Pay',
    alt: 'Illustration of the ZestPoint supermarket checkout screen'
  }
};

@Component({
    selector: 'zp-hero-section',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, LucideAngularModule],
    template: `
    <section class="relative overflow-hidden">
      <div aria-hidden="true" class="absolute inset-0 bg-grid-light bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)] dark:bg-grid-dark"></div>
      <div aria-hidden="true" class="absolute -top-40 left-1/2 h-96 w-[48rem] -translate-x-1/2 animate-pulse-glow rounded-full bg-brand/20 blur-3xl dark:bg-brand/30"></div>

      <div class="container-page relative grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-[1.05fr_1fr]">
        <div class="animate-fade-up">
          <span class="zp-badge mb-6">
            <lucide-icon [img]="Wifi" [size]="14" aria-hidden="true" /> Offline-first, from the bar floor to the checkout lane
          </span>
          <h1 class="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
            The Modular Enterprise POS Built for <span class="gradient-text">High-Velocity Hospitality &amp; Retail</span>
          </h1>
          <p class="mt-6 max-w-xl text-lg text-slate-700 dark:text-slate-300">
            High-speed checkout for bars, clubs, hotels and supermarkets. Barcode scanning, volumetric pour tracking, Bluetooth and
            weighed-item scales, SKU-level stock, screen-level RBAC, and offline-first local node resiliency.
          </p>
          <div class="mt-8 flex flex-col gap-3 sm:flex-row">
            <a [routerLink]="onboardingUrl" class="zp-btn zp-btn-primary zp-btn-lg">Start Free Trial</a>
            <a routerLink="/contact" class="zp-btn zp-btn-secondary zp-btn-lg">Book a Live Demo</a>
          </div>
          <p class="mt-4 text-sm text-slate-600 dark:text-slate-400">No card required. Works through internet outages.</p>
          <ul class="mt-6 flex flex-wrap gap-2 text-sm" aria-label="Who ZestPoint is for">
            @for (t of audiences; track t) {
              <li class="rounded-full border border-line-light bg-white px-3 py-1 font-medium text-navy-900 dark:border-line-dark dark:bg-navy-900 dark:text-slate-200">{{ t }}</li>
            }
          </ul>
        </div>

        <!--
          Illustrative POS screen. Two independent switches: Bar / Supermarket scenario, and a light/dark preview. The theme
          switch uses explicit state-driven classes (not dark:) because dark: always follows the site theme.
        -->
        <div class="relative animate-fade-up [animation-delay:150ms]">
          <div aria-hidden="true" class="absolute -inset-4 rounded-[2rem] bg-brand-gradient opacity-20 blur-2xl"></div>
          <div role="img" [attr.aria-label]="scene().alt" class="relative overflow-hidden rounded-2xl border shadow-glow" [class]="t().frame">
            <div class="flex items-center justify-between px-4 py-3 text-sm font-semibold" [class]="t().bar">
              <span>{{ scene().header }}</span>
              <span class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-500">Local node online</span>
            </div>
            <div class="grid gap-3 p-4 sm:grid-cols-[1.3fr_1fr]">
              <div class="grid grid-cols-2 gap-3">
                @for (it of scene().items; track it.name) {
                  <div class="rounded-xl border p-3" [class]="t().card">
                    <p class="text-sm font-semibold">{{ it.name }}</p>
                    <p class="text-xs" [class]="t().muted">{{ it.sub }}</p>
                    <p class="mt-2 font-display text-lg font-bold text-[#38BDF8]">\${{ it.price }}</p>
                  </div>
                }
              </div>
              <div class="flex flex-col justify-between rounded-xl border p-3" [class]="t().card">
                <div class="space-y-1.5 text-sm">
                  <p class="font-semibold">{{ scene().seats }}</p>
                  @for (l of scene().lines; track l.label) {
                    <p class="flex justify-between gap-2" [class]="t().muted"><span>{{ l.label }}</span><span>{{ l.amount }}</span></p>
                  }
                </div>
                <div class="mt-4">
                  <p class="flex justify-between font-display text-lg font-bold"><span>Total</span><span>{{ scene().total }}</span></p>
                  <div class="mt-2 rounded-lg bg-[#1E50FF] py-2 text-center text-sm font-semibold text-white">{{ scene().action }}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="mt-4 flex flex-wrap justify-center gap-3">
            <div role="group" aria-label="Preview scenario" class="inline-flex rounded-lg border border-line-light bg-white p-1 dark:border-line-dark dark:bg-navy-900">
              <button type="button" [attr.aria-pressed]="mode() === 'bar'" (click)="mode.set('bar')" class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium" [class]="mode() === 'bar' ? 'bg-brand text-white' : 'text-slate-700 dark:text-slate-300'">
                <lucide-icon [img]="Wine" [size]="16" aria-hidden="true" /> Bar
              </button>
              <button type="button" [attr.aria-pressed]="mode() === 'store'" (click)="mode.set('store')" class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium" [class]="mode() === 'store' ? 'bg-brand text-white' : 'text-slate-700 dark:text-slate-300'">
                <lucide-icon [img]="ShoppingCart" [size]="16" aria-hidden="true" /> Supermarket
              </button>
            </div>
            <div role="group" aria-label="Preview theme" class="inline-flex rounded-lg border border-line-light bg-white p-1 dark:border-line-dark dark:bg-navy-900">
              <button type="button" [attr.aria-pressed]="!dark()" (click)="dark.set(false)" class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium" [class]="!dark() ? 'bg-brand text-white' : 'text-slate-700 dark:text-slate-300'">
                <lucide-icon [img]="Sun" [size]="16" aria-hidden="true" /> Light
              </button>
              <button type="button" [attr.aria-pressed]="dark()" (click)="dark.set(true)" class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium" [class]="dark() ? 'bg-brand text-white' : 'text-slate-700 dark:text-slate-300'">
                <lucide-icon [img]="Moon" [size]="16" aria-hidden="true" /> Dark
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  `
})
export class HeroSectionComponent {
  protected readonly onboardingUrl = REGISTER_URL;
  protected readonly Wifi = Wifi;
  protected readonly Sun = Sun;
  protected readonly Moon = Moon;
  protected readonly Wine = Wine;
  protected readonly ShoppingCart = ShoppingCart;

  protected readonly audiences = ['Nightclubs', 'Hotel bars', 'Lounges', 'Sports bars', 'Restaurants', 'Supermarkets', 'Retail stores'];

  protected readonly dark = signal(true);
  protected readonly mode = signal<Mode>('bar');
  protected readonly scene = computed(() => SCENES[this.mode()]);

  private static readonly DARK = {
    frame: 'border-slate-700 bg-[#090D16]',
    bar: 'bg-[#0F172A] text-white',
    card: 'border-slate-700 bg-[#0F172A] text-white',
    muted: 'text-slate-400'
  };
  private static readonly LIGHT = {
    frame: 'border-slate-200 bg-[#F8FAFC]',
    bar: 'bg-white text-slate-900',
    card: 'border-slate-200 bg-white text-slate-900',
    muted: 'text-slate-600'
  };

  protected t() {
    return this.dark() ? HeroSectionComponent.DARK : HeroSectionComponent.LIGHT;
  }
}
