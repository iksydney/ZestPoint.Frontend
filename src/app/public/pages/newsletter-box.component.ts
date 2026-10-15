import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CircleAlert, CircleCheck, LoaderCircle, LucideAngularModule, Mail } from 'lucide-angular';
import { PublicIntakeService } from '../public-intake.service';
import { isValidEmail } from '../validation';

type Status = 'idle' | 'loading' | 'success' | 'error';

/** Reusable newsletter subscription widget: validation, loading, error and success states. */
@Component({
  selector: 'zp-newsletter-box',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule],
  template: `
    <section class="section" aria-labelledby="newsletter-heading">
      <div class="container-page">
        <div class="relative overflow-hidden rounded-3xl bg-navy px-6 py-12 text-center sm:px-12">
          <div aria-hidden="true" class="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand/40 blur-3xl"></div>
          <div class="relative mx-auto max-w-xl">
            <lucide-icon [img]="Mail" [size]="32" class="mx-auto text-glow-400" aria-hidden="true" />
            <h2 id="newsletter-heading" class="mt-4 text-3xl font-bold !text-white">Hospitality & retail ops, in your inbox</h2>
            <p class="mt-3 text-slate-300">Monthly tips on stock control, shrinkage, and running faster bars and checkouts. No spam, unsubscribe anytime.</p>

            @if (status() === 'success') {
              <div role="status" class="mt-8 flex items-center justify-center gap-2 rounded-xl bg-emerald-400/10 px-4 py-4 font-medium text-emerald-300">
                <lucide-icon [img]="CircleCheck" [size]="20" aria-hidden="true" /> You're subscribed. Welcome aboard!
              </div>
            } @else {
              <form (ngSubmit)="submit()" novalidate class="mt-8">
                <div class="flex flex-col gap-3 sm:flex-row">
                  <div class="flex-1 text-left">
                    <label for="newsletter-email" class="sr-only">Email address</label>
                    <input
                      id="newsletter-email"
                      name="email"
                      type="email"
                      inputmode="email"
                      autocomplete="email"
                      placeholder="you@venue.com"
                      class="zp-control h-12"
                      [attr.aria-invalid]="status() === 'error'"
                      [attr.aria-describedby]="message() ? 'newsletter-msg' : null"
                      [ngModel]="email()"
                      (ngModelChange)="onEmail($event)"
                    />
                  </div>
                  <!-- Honeypot: hidden from users and assistive tech -->
                  <input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" class="absolute -left-[9999px] h-0 w-0 opacity-0" [ngModel]="website()" (ngModelChange)="website.set($event)" />
                  <button type="submit" class="zp-btn zp-btn-primary zp-btn-lg" [disabled]="status() === 'loading'">
                    @if (status() === 'loading') {
                      <lucide-icon [img]="LoaderCircle" [size]="16" class="animate-spin" aria-hidden="true" /> Subscribing...
                    } @else {
                      Subscribe
                    }
                  </button>
                </div>
                <p id="newsletter-msg" role="alert" class="mt-3 min-h-6 text-sm text-red-300">
                  @if (status() === 'error' && message()) {
                    <span class="inline-flex items-center gap-1.5"><lucide-icon [img]="CircleAlert" [size]="16" aria-hidden="true" /> {{ message() }}</span>
                  }
                </p>
              </form>
            }
          </div>
        </div>
      </div>
    </section>
  `
})
export class NewsletterBoxComponent {
  private readonly intake = inject(PublicIntakeService);

  protected readonly Mail = Mail;
  protected readonly CircleCheck = CircleCheck;
  protected readonly CircleAlert = CircleAlert;
  protected readonly LoaderCircle = LoaderCircle;

  protected readonly email = signal('');
  protected readonly website = signal(''); // honeypot
  protected readonly status = signal<Status>('idle');
  protected readonly message = signal('');

  protected onEmail(value: string): void {
    this.email.set(value);
    if (this.status() === 'error') this.status.set('idle');
  }

  protected async submit(): Promise<void> {
    if (this.status() === 'loading') return;

    if (!isValidEmail(this.email())) {
      this.status.set('error');
      this.message.set('Please enter a valid email address.');
      return;
    }

    this.status.set('loading');
    this.message.set('');
    try {
      await this.intake.subscribe(this.email(), this.website());
      this.status.set('success');
      this.email.set('');
    } catch (e) {
      this.status.set('error');
      this.message.set(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    }
  }
}
