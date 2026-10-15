import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { Subscription } from 'rxjs';

/**
 * The company logo, or - when none is uploaded - a generated initials tile in the brand colours ("Rooftop 99 Lounge" -> R99L).
 * Used by the app header, sign-in screen, receipts and the branding preview, so they always agree.
 *
 * Draft logos live behind an authenticated route (<img> cannot send a bearer token), so those are fetched as a blob through
 * HttpClient (which adds the token) and shown from an object URL. Published logos are public and load directly.
 */
@Component({
  selector: 'zp-brand-mark',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (src()) {
      <img [src]="src()" [alt]="name() + ' logo'" class="object-contain" [style.height.px]="size()" [style.width.px]="size()"
           [class.rounded-lg]="true" (error)="failed.set(true)" />
    } @else {
      <span
        class="inline-grid place-items-center rounded-lg bg-primary font-bold text-on-primary select-none"
        [style.height.px]="size()" [style.width.px]="size()" [style.font-size.px]="fontSize()"
        role="img" [attr.aria-label]="name() + ' logo'" data-testid="brand-initials"
      >{{ initials() }}</span>
    }
  `
})
export class BrandMarkComponent {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);

  readonly logoUrl = input<string | null>(null);
  readonly initials = input.required<string>();
  readonly name = input('Company');
  readonly size = input(36);

  protected readonly failed = signal(false);
  protected readonly src = signal<string | null>(null);
  private blobUrl: string | null = null;
  private sub: Subscription | null = null;

  protected fontSize(): number {
    const len = this.initials().length;
    return Math.round(this.size() * (len > 3 ? 0.3 : len > 2 ? 0.36 : 0.45));
  }

  constructor() {
    effect(() => {
      const url = this.logoUrl();
      this.failed.set(false);
      this.release();

      if (!url) return this.src.set(null);
      if (!url.startsWith('/api/v1/branding/media/')) return this.src.set(url);

      this.src.set(null);
      this.sub = this.http.get(url, { responseType: 'blob' }).subscribe({
        next: (blob) => {
          this.blobUrl = URL.createObjectURL(blob);
          this.src.set(this.blobUrl);
        },
        error: () => this.src.set(null)
      });
    }, { allowSignalWrites: true });

    effect(() => {
      if (this.failed()) this.src.set(null); // broken image: show the initials instead of an empty box
    }, { allowSignalWrites: true });

    this.destroyRef.onDestroy(() => this.release());
  }

  private release(): void {
    this.sub?.unsubscribe();
    this.sub = null;
    if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
    this.blobUrl = null;
  }
}
