import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CircleCheck, Clock, LoaderCircle, LucideAngularModule, Mail, MapPin, Phone } from 'lucide-angular';
import { PublicIntakeService } from '../public-intake.service';
import { SITE } from '../site';
import { ContactForm, FieldErrors, STAFF_COUNTS, VENUE_TYPES, validateContact } from '../validation';
import { AccordionComponent, AccordionItem } from './accordion.component';

const EMPTY: ContactForm = { name: '', businessName: '', venueType: '', staffCount: '', email: '', phone: '', message: '' };

@Component({
    selector: 'zp-contact-page',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule, RouterLink, LucideAngularModule, AccordionComponent],
    template: `
    <section class="container-page pb-6 pt-16 text-center sm:pt-24">
      <p class="eyebrow">Contact</p>
      <h1 class="mx-auto mt-3 max-w-2xl text-4xl font-bold sm:text-5xl">Book a live demo</h1>
      <p class="mx-auto mt-4 max-w-xl text-lg text-slate-700 dark:text-slate-300">Tell us about your bar, venue or store and we'll show you ZestPoint running on a real bar or checkout workflow.</p>
    </section>

    <section class="container-page grid gap-8 pb-16 lg:grid-cols-[1.5fr_1fr]">
      <div class="zp-card p-6 sm:p-8">
        @if (status() === 'success') {
          <div role="status" class="rounded-2xl border border-emerald-300 bg-emerald-50 p-8 text-center dark:border-emerald-400/30 dark:bg-emerald-400/10">
            <lucide-icon [img]="CircleCheck" [size]="40" class="mx-auto text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
            <h2 class="mt-3 text-2xl font-bold">Request received</h2>
            <p class="mt-2 text-slate-700 dark:text-slate-300">Thanks! Our team will reach out within one business day to schedule your demo.</p>
            <button type="button" class="zp-btn zp-btn-secondary mt-6" (click)="status.set('idle')">Send another request</button>
          </div>
        } @else {
          <form (ngSubmit)="submit()" novalidate class="grid gap-5 sm:grid-cols-2">
            <div>
              <label class="zp-label" for="f-name">Full name</label>
              <input id="f-name" name="name" class="zp-control" autocomplete="name" [attr.aria-invalid]="!!errors().name" [attr.aria-describedby]="errors().name ? 'err-name' : null" [ngModel]="form().name" (ngModelChange)="set('name', $event)" />
              @if (errors().name) { <p id="err-name" role="alert" class="zp-error">{{ errors().name }}</p> }
            </div>
            <div>
              <label class="zp-label" for="f-businessName">Business name</label>
              <input id="f-businessName" name="businessName" class="zp-control" autocomplete="organization" [attr.aria-invalid]="!!errors().businessName" [attr.aria-describedby]="errors().businessName ? 'err-businessName' : null" [ngModel]="form().businessName" (ngModelChange)="set('businessName', $event)" />
              @if (errors().businessName) { <p id="err-businessName" role="alert" class="zp-error">{{ errors().businessName }}</p> }
            </div>
            <div>
              <label class="zp-label" for="f-venueType">Business type</label>
              <select id="f-venueType" name="venueType" class="zp-control" [attr.aria-invalid]="!!errors().venueType" [attr.aria-describedby]="errors().venueType ? 'err-venueType' : null" [ngModel]="form().venueType" (ngModelChange)="set('venueType', $event)">
                <option value="">Select...</option>
                @for (v of venueTypes; track v) { <option [value]="v">{{ v }}</option> }
              </select>
              @if (errors().venueType) { <p id="err-venueType" role="alert" class="zp-error">{{ errors().venueType }}</p> }
            </div>
            <div>
              <label class="zp-label" for="f-staffCount">Staff count</label>
              <select id="f-staffCount" name="staffCount" class="zp-control" [attr.aria-invalid]="!!errors().staffCount" [attr.aria-describedby]="errors().staffCount ? 'err-staffCount' : null" [ngModel]="form().staffCount" (ngModelChange)="set('staffCount', $event)">
                <option value="">Select...</option>
                @for (s of staffCounts; track s) { <option [value]="s">{{ s }}</option> }
              </select>
              @if (errors().staffCount) { <p id="err-staffCount" role="alert" class="zp-error">{{ errors().staffCount }}</p> }
            </div>
            <div>
              <label class="zp-label" for="f-email">Email</label>
              <input id="f-email" name="email" type="email" inputmode="email" class="zp-control" autocomplete="email" [attr.aria-invalid]="!!errors().email" [attr.aria-describedby]="errors().email ? 'err-email' : null" [ngModel]="form().email" (ngModelChange)="set('email', $event)" />
              @if (errors().email) { <p id="err-email" role="alert" class="zp-error">{{ errors().email }}</p> }
            </div>
            <div>
              <label class="zp-label" for="f-phone">Phone</label>
              <input id="f-phone" name="phone" type="tel" class="zp-control" autocomplete="tel" [attr.aria-invalid]="!!errors().phone" [attr.aria-describedby]="errors().phone ? 'err-phone' : null" [ngModel]="form().phone" (ngModelChange)="set('phone', $event)" />
              @if (errors().phone) { <p id="err-phone" role="alert" class="zp-error">{{ errors().phone }}</p> }
            </div>
            <div class="sm:col-span-2">
              <label class="zp-label" for="f-message">How can we help?</label>
              <textarea id="f-message" name="message" rows="5" maxlength="4000" class="zp-control min-h-32" [attr.aria-invalid]="!!errors().message" [attr.aria-describedby]="errors().message ? 'err-message' : null" [ngModel]="form().message" (ngModelChange)="set('message', $event)"></textarea>
              @if (errors().message) { <p id="err-message" role="alert" class="zp-error">{{ errors().message }}</p> }
            </div>

            <!-- Honeypot: hidden from users and assistive tech -->
            <input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" class="absolute -left-[9999px] h-0 w-0 opacity-0" [ngModel]="website()" (ngModelChange)="website.set($event)" />

            <div class="sm:col-span-2">
              @if (status() === 'error') { <p role="alert" class="mb-3 text-sm text-red-700 dark:text-red-400">{{ serverError() }}</p> }
              <button type="submit" class="zp-btn zp-btn-primary zp-btn-lg w-full sm:w-auto" [disabled]="status() === 'loading'">
                @if (status() === 'loading') {
                  <lucide-icon [img]="LoaderCircle" [size]="16" class="animate-spin" aria-hidden="true" /> Sending...
                } @else {
                  Request a demo
                }
              </button>
              <p class="mt-3 text-xs text-slate-600 dark:text-slate-400">By submitting you agree to our <a routerLink="/privacy" class="underline">Privacy Policy</a>.</p>
            </div>
          </form>
        }
      </div>

      <aside aria-label="Operations details" class="space-y-4">
        <div class="zp-card">
          <h2 class="text-lg font-semibold">{{ site.parent }}</h2>
          <ul class="mt-4 space-y-4 text-sm">
            <li class="flex gap-3">
              <lucide-icon [img]="Mail" [size]="20" class="mt-0.5 shrink-0 text-brand dark:text-glow-400" aria-hidden="true" />
              <span>
                <a class="block hover:underline" [href]="'mailto:' + site.supportEmail">{{ site.supportEmail }}</a>
                <a class="block hover:underline" [href]="'mailto:' + site.infoEmail">{{ site.infoEmail }}</a>
              </span>
            </li>
            <li class="flex gap-3">
              <lucide-icon [img]="Phone" [size]="20" class="mt-0.5 shrink-0 text-brand dark:text-glow-400" aria-hidden="true" />
              <a class="hover:underline" [href]="'tel:' + phoneHref">{{ site.phone }}</a>
            </li>
            <li class="flex gap-3">
              <lucide-icon [img]="MapPin" [size]="20" class="mt-0.5 shrink-0 text-brand dark:text-glow-400" aria-hidden="true" />
              <address class="not-italic">@for (l of site.address.lines; track l) { <span class="block">{{ l }}</span> }</address>
            </li>
            <li class="flex gap-3">
              <lucide-icon [img]="Clock" [size]="20" class="mt-0.5 shrink-0 text-brand dark:text-glow-400" aria-hidden="true" />
              <span>{{ site.address.hours }}</span>
            </li>
          </ul>
        </div>
      </aside>
    </section>

    <section class="container-page pb-24" aria-labelledby="faq-heading">
      <h2 id="faq-heading" class="mb-6 text-center text-3xl font-bold">Frequently asked questions</h2>
      <div class="mx-auto max-w-3xl"><zp-accordion [items]="faq" /></div>
    </section>
  `
})
export class ContactPageComponent {
  private readonly intake = inject(PublicIntakeService);

  protected readonly site = SITE;
  protected readonly phoneHref = SITE.phone.replace(/\s/g, '');
  protected readonly venueTypes = VENUE_TYPES;
  protected readonly staffCounts = STAFF_COUNTS;
  protected readonly CircleCheck = CircleCheck;
  protected readonly LoaderCircle = LoaderCircle;
  protected readonly Mail = Mail;
  protected readonly Phone = Phone;
  protected readonly MapPin = MapPin;
  protected readonly Clock = Clock;

  protected readonly form = signal<ContactForm>({ ...EMPTY });
  protected readonly website = signal(''); // honeypot
  protected readonly errors = signal<FieldErrors>({});
  protected readonly status = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  protected readonly serverError = signal('');

  protected readonly faq: readonly AccordionItem[] = [
    { question: 'Does ZestPoint work when the internet goes down?', answer: 'Yes. A local node at your venue keeps every terminal selling through a total internet or network failure. Orders are queued securely and synchronised in order as soon as connectivity returns, with no duplicates.' },
    { question: 'Which Bluetooth scales are supported?', answer: 'ZestPoint supports Bluetooth Low Energy bottle-weighing scales for bars and weighing scales for loose produce, deli and bakery items in stores. Share your scale model during the demo and we will confirm compatibility and calibration steps.' },
    { question: 'How is our data secured?', answer: 'Each venue group is an isolated tenant. Data is encrypted in transit (TLS) and at rest, offline queues are encrypted on the device, and every action is enforced by screen-level permissions and logged in an audit trail.' },
    { question: 'Can we migrate from our legacy POS?', answer: 'Yes. We import menus, categories, prices, staff and stock lists from CSV or your current system, and can run both in parallel during a pilot night before you switch over.' },
    { question: 'How does staff access control work?', answer: 'Staff sign in with a PIN. Owners assign permissions per screen and action, such as voids, comps, discounts and stock audits. The rules are enforced in the app and again on the server.' },
    { question: 'What happens if our subscription lapses?', answer: 'Features outside your plan become read-only rather than disappearing, so staff can still view data. Our Terms of Service describe the grace period before any lockout.' },
    { question: 'Does it support hotel bars and room posting?', answer: 'Yes. Venue modes let a hotel bar post charges to guest rooms, while nightclubs, lounges and sports bars each get workflows tuned to how they trade.' },
    { question: 'Can supermarkets and retail stores use ZestPoint?', answer: 'Yes. Store mode adds barcode scanning, price look-ups, promotions, multi-lane checkout, weighed items, and SKU-level stock with batches, expiry dates and reorder levels. Chains manage prices and staff centrally across every store.' },
    { question: 'How quickly can we go live?', answer: 'Most single venues are trading within days: import your menu, set up staff PINs and permissions, pair your hardware, and run a trial shift alongside your current system.' }
  ];

  protected set<K extends keyof ContactForm>(key: K, value: ContactForm[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
    if (this.errors()[key]) this.errors.update((e) => ({ ...e, [key]: undefined }));
  }

  protected async submit(): Promise<void> {
    if (this.status() === 'loading') return;

    const found = validateContact(this.form());
    this.errors.set(found);
    const first = Object.keys(found)[0];
    if (first) {
      document.getElementById(`f-${first}`)?.focus();
      return;
    }

    this.status.set('loading');
    this.serverError.set('');
    try {
      await this.intake.contact({ ...this.form(), website: this.website() });
      this.status.set('success');
      this.form.set({ ...EMPTY });
    } catch (e) {
      this.status.set('error');
      this.serverError.set(e instanceof Error ? e.message : 'Something went wrong.');
    }
  }
}
