import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import { ItemFollowUpService } from '../../core/services/item-follow-up.service';

/**
 * The small box shown after a new stock item is saved: add another, finish setting this one up, or done. It does not block the screen
 * and goes away by itself after a while, so someone who just wanted one item is not held up.
 */
@Component({
  selector: 'zp-item-saved-prompt',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (follow.saved(); as item) {
      <div class="fixed bottom-4 left-1/2 z-[70] w-[min(28rem,calc(100vw-1.5rem))] -translate-x-1/2 rounded-xl border-2 border-primary bg-panel p-3 text-ink shadow-2xl print:hidden" role="status" aria-live="polite" data-testid="item-saved-prompt">
        <p class="text-sm font-semibold"><span data-testid="item-saved-name">{{ item.name }}</span> saved.</p>
        <p class="text-xs text-ink/70">Units, package content, recipe and picture can be added now or later.</p>
        <div class="mt-2 flex flex-wrap gap-2">
          <button type="button" class="btn-primary flex-1" data-testid="item-add-another" (click)="follow.addAnother()">Add another item</button>
          <button type="button" class="btn-outline flex-1" data-testid="item-finish" (click)="follow.finishSettingUp()">Finish setting this one up</button>
          <button type="button" class="btn-ghost" data-testid="item-saved-done" (click)="follow.dismiss()">Done</button>
        </div>
      </div>
    }
  `
})
export class ItemSavedPromptComponent {
  protected readonly follow = inject(ItemFollowUpService);

  constructor() {
    // The choices belong to the screen the item was added on: moving to another screen takes the box away.
    inject(Router).events.subscribe((e) => { if (e instanceof NavigationStart) this.follow.dismiss(); });
    let timer: ReturnType<typeof setTimeout> | null = null;
    effect(() => {
      const item = this.follow.saved();
      if (timer) clearTimeout(timer);
      if (item) timer = setTimeout(() => { if (this.follow.saved()?.id === item.id) this.follow.dismiss(); }, 20_000);
    }, { allowSignalWrites: true });
  }
}
