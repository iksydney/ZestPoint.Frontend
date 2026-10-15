import { ChangeDetectionStrategy, Component, OnDestroy, effect, inject, input, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ReceivingApi } from '../../core/services/purchasing.services';

/**
 * An evidence photo. The file is private to the company, so it is fetched with the person's own sign-in (an <img src> could not send it)
 * and shown from a temporary local URL.
 */
@Component({
  selector: 'zp-photo-thumb',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (url(); as u) { <a [href]="u" target="_blank" rel="noopener" class="block"><img [src]="u" alt="Evidence photo" class="h-16 w-16 rounded-lg border border-ink/15 object-cover" data-testid="photo-thumb" /></a> }
    @else { <span class="grid h-16 w-16 place-items-center rounded-lg border border-dashed border-ink/25 text-[10px] text-ink/60">{{ failed() ? 'Not available' : 'Loading' }}</span> }
  `
})
export class PhotoThumbComponent implements OnDestroy {
  private readonly api = inject(ReceivingApi);
  readonly id = input.required<string>();
  protected readonly url = signal<string | null>(null);
  protected readonly failed = signal(false);

  constructor() {
    effect(() => {
      const id = this.id();
      void this.load(id);
    });
  }

  private async load(id: string): Promise<void> {
    try {
      const blob = await firstValueFrom(this.api.photo(id));
      this.revoke();
      this.url.set(URL.createObjectURL(blob));
    } catch { this.failed.set(true); }
  }

  private revoke(): void {
    const u = this.url();
    if (u) URL.revokeObjectURL(u);
  }

  ngOnDestroy(): void { this.revoke(); }
}
