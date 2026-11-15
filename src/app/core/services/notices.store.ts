import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NotificationDto } from '../models/subscription.model';
import { SubscriptionApi } from './subscription.services';

/**
 * The bell's notices: how many this person has not read and the latest few. Each person has their own; the server never sends a colleague's.
 * A failed refresh leaves what is already shown: the bell is a convenience, never something a screen waits for.
 */
@Injectable({ providedIn: 'root' })
export class NoticesStore {
  private readonly api = inject(SubscriptionApi);
  private readonly _unread = signal(0);
  private readonly _latest = signal<readonly NotificationDto[]>([]);

  readonly unread = this._unread.asReadonly();
  readonly latest = this._latest.asReadonly();

  async refresh(): Promise<void> {
    try {
      const summary = await firstValueFrom(this.api.noticeSummary());
      this._unread.set(summary.unread);
      this._latest.set(summary.latest);
    } catch { /* keep what is shown */ }
  }

  async markRead(id: string): Promise<void> {
    const before = this._latest().find((n) => n.id === id);
    if (before && !before.readAtUtc) {
      this._latest.update((list) => list.map((n) => (n.id === id ? { ...n, readAtUtc: new Date().toISOString() } : n)));
      this._unread.update((n) => Math.max(0, n - 1));
    }
    try { await firstValueFrom(this.api.markRead(id)); } catch { await this.refresh(); }
  }

  async markAllRead(): Promise<void> {
    this._latest.update((list) => list.map((n) => (n.readAtUtc ? n : { ...n, readAtUtc: new Date().toISOString() })));
    this._unread.set(0);
    try { await firstValueFrom(this.api.markAllRead()); } catch { await this.refresh(); }
  }
}
