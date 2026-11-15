import { Injectable, signal } from '@angular/core';

/**
 * What happens after a new stock item is saved (owner's rule, 2026-11-15): the card closes and a small box offers the next step, so
 * entering many items is one click each. The stock card says an item was saved; the box (ItemSavedPromptComponent, in the application
 * frame) offers the choices; the screen that showed the card (Items, Stock Overview) opens it again when asked.
 */
@Injectable({ providedIn: 'root' })
export class ItemFollowUpService {
  /** The item just added, while the box is on screen. */
  readonly saved = signal<{ readonly id: string; readonly name: string } | null>(null);
  /** A request for the screen that hosts the stock card: open a blank card, or this item's card on its set-up tabs. */
  readonly request = signal<{ readonly action: 'new' | 'finish'; readonly id: string | null; readonly n: number } | null>(null);
  private n = 0;

  itemAdded(id: string, name: string): void { this.saved.set({ id, name }); }
  dismiss(): void { this.saved.set(null); }

  addAnother(): void {
    this.saved.set(null);
    this.request.set({ action: 'new', id: null, n: ++this.n });
  }

  finishSettingUp(): void {
    const item = this.saved();
    this.saved.set(null);
    if (item) this.request.set({ action: 'finish', id: item.id, n: ++this.n });
  }
}
