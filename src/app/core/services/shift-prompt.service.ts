import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { FEATURES, SCREEN_PERMISSIONS } from '../models/rbac.model';
import { APP_NAV } from '../navigation/app-nav';
import { NavService } from '../navigation/nav.service';
import { AccessService } from './access.service';
import { AuthService } from './auth.service';
import { BranchContextService } from './branch-context.service';
import { ShiftApi } from './nav-ops.services';
import { ShiftStore } from './shift-store.service';

/** A shift this long gets a reminder to end it, and again every hour after "Still working". */
export const SHIFT_REMINDER_AFTER_MS = 6 * 60 * 60 * 1000;
export const SHIFT_REMINDER_AGAIN_MS = 60 * 60 * 1000;

/**
 * What the Point of Sale screen must do for this person right now:
 *  - `open`: show the till (the person needs no shift, or has one running at this branch, or it cannot be known and nobody is held on a guess);
 *  - `checking`: the shift is still being read;
 *  - `start`: no shift is running, so the Start your shift box comes first;
 *  - `cannot`: the person sells but holds no right to start a shift, so they are told who to ask;
 *  - `other-branch`: a shift is running at another branch (the server allows one running shift per person).
 */
export type PosGate = 'open' | 'checking' | 'start' | 'cannot' | 'other-branch';

/**
 * Two things the screen does about a person's shift (owner's rule, 2026-11-15, changed 2026-11-24):
 *
 *  - Anyone who sells or takes orders (cashiers, waiters, bar attendants, supervisors, managers and the owner) must start a shift, with an
 *    opening float, the moment they open the Point of Sale: `gate`. Signing in is free, and every other screen opens without a shift.
 *  - Anyone whose shift has run six hours is reminded to end it, and again each hour until it is ended, on whatever screen they are on.
 *    Each answer is sent to the server, which writes it to the activity log.
 *
 * This only shapes the screen. What the server accepts without a shift is the server's decision, and it does not refuse an order for lack of one.
 */
@Injectable({ providedIn: 'root' })
export class ShiftPromptService {
  private readonly auth = inject(AuthService);
  private readonly nav = inject(NavService);
  private readonly access = inject(AccessService);
  private readonly store = inject(ShiftStore);
  private readonly api = inject(ShiftApi);
  private readonly branches = inject(BranchContextService);

  /**
   * The state of the last look at the person's shift: `pending` until the server (or this device, offline) has answered, `known` once it has,
   * `unreadable` when it could not be read at all. Nobody is held up on a guess, so `unreadable` lets the till open.
   */
  private readonly look = signal<'pending' | 'known' | 'unreadable'>('pending');
  private readonly known = computed(() => this.look() === 'known');
  private readonly now = signal(Date.now());
  /** Bumped when a reminder is answered, so the due time is read again. */
  private readonly answered = signal(0);
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Each look has a number: an answer that arrives after a newer look began (another person, an unlock) is ignored. */
  private lookNumber = 0;

  private readonly dayScreen = APP_NAV.find((n) => n.key === 'pos.day')!;

  private readonly shift = computed(() => { const s = this.store.current(); return s && s.status === 'Open' ? s : null; });

  /** The session holds the right to put an order on a bill or to take a payment: that is what "sells or takes orders" means. */
  readonly sellsOrTakesOrders = computed(() =>
    this.auth.hasPermission(SCREEN_PERMISSIONS.POS_ORDER_CREATE) || this.auth.hasPermission(SCREEN_PERMISSIONS.POS_PAYMENT_PROCESS));

  /** The person may read their shift and start one. */
  private readonly canStart = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.POS_DAY_VIEW) && this.auth.hasPermission(SCREEN_PERMISSIONS.POS_DAY_OPEN));

  /**
   * Whether anybody at this company could start a shift: the plan has not withheld Start / End of Day or its Start button, and the module is
   * not read-only. When nobody can, asking would only strand people at the door, so the gate does not apply.
   */
  private readonly shiftsAvailable = computed(() =>
    this.access.canShow(this.dayScreen) && this.access.actionAllowed(SCREEN_PERMISSIONS.POS_DAY_OPEN) && this.auth.accessModeFor(FEATURES.CORE_POS) !== 'readonly');

  /** What the Point of Sale screen shows first. */
  readonly gate = computed<PosGate>(() => {
    if (!this.auth.isAuthenticated() || this.auth.locked() || !this.sellsOrTakesOrders() || !this.shiftsAvailable()) return 'open';
    if (!this.canStart()) return 'cannot';
    if (this.look() === 'pending') return 'checking';
    if (this.look() === 'unreadable') return 'open';
    const branch = this.branches.activeId();
    if (!branch) return 'open';   // the till itself says there is no branch to work at
    const s = this.shift();
    if (!s) return 'start';
    return !s.branchId || s.branchId === branch ? 'open' : 'other-branch';
  });

  /** The branch of the running shift, for the message that says it is elsewhere. */
  readonly shiftBranchName = computed(() => this.shift()?.branchName ?? '');

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
    void this.check(true);
    if (!this.timer) this.timer = setInterval(() => this.now.set(Date.now()), 30_000);
  }

  /**
   * Reads the shift. `first` is the look made when the application frame is built for a person: whatever was known belongs to the last look
   * (perhaps to the last person), so nothing is known until this one answers. A later look (the screen unlocked, or a start refused because one
   * is already running) is the same person, so what was known stays on screen, and the till is not taken away and rebuilt, until it answers.
   */
  async check(first = false): Promise<void> {
    const mine = ++this.lookNumber;
    if (first) this.look.set('pending');
    if (!this.auth.hasPermission(SCREEN_PERMISSIONS.POS_DAY_VIEW) || !this.nav.has('pos.day')) { this.look.set('unreadable'); return; }
    try {
      await this.branches.load();
      await this.store.load();
      if (mine === this.lookNumber) this.look.set('known');
    } catch { if (mine === this.lookNumber && this.look() === 'pending') this.look.set('unreadable'); }   // not known: never hold someone up on a guess
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
