import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SCREEN_PERMISSIONS } from '../models/rbac.model';
import { NavService } from '../navigation/nav.service';
import { AuthService } from './auth.service';
import { BranchContextService } from './branch-context.service';
import { ShiftApi } from './nav-ops.services';
import { ShiftStore } from './shift-store.service';

/** A shift this long gets a reminder to end it, and again every hour after "Still working". */
export const SHIFT_REMINDER_AFTER_MS = 6 * 60 * 60 * 1000;
export const SHIFT_REMINDER_AGAIN_MS = 60 * 60 * 1000;

/**
 * Two things the screen does about a person's shift (owner's rule, 2026-11-15):
 *
 *  - A cashier who signs in with no shift running must start one before doing anything else. "A cashier" is someone who takes payments
 *    and starts their own shift but does not review shifts; supervisors, managers and the owner are not held up.
 *  - Anyone whose shift has run six hours is reminded to end it, and again each hour until it is ended. Each answer is sent to the
 *    server, which writes it to the activity log.
 *
 * This only shapes the screen. Whether a shift is needed to take a payment is still the server's decision.
 */
@Injectable({ providedIn: 'root' })
export class ShiftPromptService {
  private readonly auth = inject(AuthService);
  private readonly nav = inject(NavService);
  private readonly store = inject(ShiftStore);
  private readonly api = inject(ShiftApi);
  private readonly branches = inject(BranchContextService);

  /** The server (or this device, offline) has said whether a shift is running. Until then nothing is asked. */
  private readonly known = signal(false);
  private readonly now = signal(Date.now());
  /** Bumped when a reminder is answered, so the due time is read again. */
  private readonly answered = signal(0);
  private timer: ReturnType<typeof setInterval> | null = null;

  private readonly shift = computed(() => { const s = this.store.current(); return s && s.status === 'Open' ? s : null; });

  /** Takes payments and runs their own shift, but is not someone who reviews shifts. */
  private readonly isCashier = computed(() =>
    this.auth.hasPermission(SCREEN_PERMISSIONS.POS_DAY_OPEN) && this.auth.hasPermission(SCREEN_PERMISSIONS.POS_PAYMENT_PROCESS)
    && !this.auth.hasPermission(SCREEN_PERMISSIONS.POS_DAY_REVIEW) && this.nav.has('pos.day'));

  /** The box that must be answered: start a shift (or sign out). */
  readonly mustStart = computed(() => this.known() && this.isCashier() && !this.auth.locked() && !this.shift() && !!this.branches.active());

  /** The open shift when its reminder is due, otherwise null. */
  readonly reminder = computed(() => {
    const s = this.shift();
    this.answered();
    if (!s || !this.known()) return null;
    const due = Math.max(new Date(s.openedAtUtc).getTime() + SHIFT_REMINDER_AFTER_MS, this.snoozedUntil(s.id));
    return this.now() >= due ? s : null;
  });

  /** Hours the open shift has run, for the reminder's wording. */
  readonly hoursOpen = computed(() => { const s = this.shift(); return s ? Math.floor((this.now() - new Date(s.openedAtUtc).getTime()) / 3_600_000) : 0; });

  /** Called once by the application frame after sign-in (and again for a different person, since the frame is rebuilt). */
  start(): void {
    void this.check();
    if (!this.timer) this.timer = setInterval(() => this.now.set(Date.now()), 30_000);
  }

  /** Reads the shift again: after sign-in, and when the screen is unlocked. */
  async check(): Promise<void> {
    this.known.set(false);   // whatever was known belongs to the last look (perhaps to the last person)
    if (!this.auth.hasPermission(SCREEN_PERMISSIONS.POS_DAY_VIEW) || !this.nav.has('pos.day')) return;
    try {
      await this.branches.load();
      await this.store.load();
      this.known.set(true);
    } catch { this.known.set(false); }   // not known: never hold someone up on a guess
    this.now.set(Date.now());
  }

  /** "Still working" or "End my shift now": the reminder goes away for an hour, and the answer is recorded for audit. */
  async answer(answer: 'still_working' | 'end_now'): Promise<void> {
    const s = this.shift();
    if (!s) return;
    this.snooze(s.id, Date.now() + SHIFT_REMINDER_AGAIN_MS);
    this.answered.update((n) => n + 1);
    try { await firstValueFrom(this.api.endReminder(s.id, answer)); } catch { /* offline or refused: the reminder still did its job on screen */ }
  }

  private key(shiftId: string): string { return `zp.shift.reminder.${shiftId}`; }

  private snoozedUntil(shiftId: string): number {
    try { return Number(localStorage.getItem(this.key(shiftId))) || 0; } catch { return 0; }
  }

  private snooze(shiftId: string, until: number): void {
    try { localStorage.setItem(this.key(shiftId), String(until)); } catch { /* private window: it simply asks again sooner */ }
  }
}
