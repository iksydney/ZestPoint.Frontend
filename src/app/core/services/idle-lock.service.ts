import { Injectable, computed, inject, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { SyncAgentService } from './sync-agent.service';

/** How long nobody may touch the screen before it locks. The owner chose two minutes (2026-11-14). */
const DEFAULT_SECONDS = 120;
const WARN_SECONDS = 20;

/**
 * Locks the screen after a spell with no activity (owner's rule, 2026-11-14): nobody is signed out while they work, and a till left
 * alone does not stay open for whoever walks past. Activity is any tap, click, key or scan.
 *
 * Locking does not end the session: what was on screen is kept under the lock, and bar orders keep arriving (sound and all). To carry
 * on, someone signs in on the lock screen exactly as on the sign-in page. The same person comes back to where they were; anyone else
 * gets their own screens (see LockScreenComponent).
 *
 * The lock is a cover on this device, checked by the server only when someone signs in on it. It never locks while the device is
 * offline, because signing back in needs the server and a sale must never be blocked.
 */
@Injectable({ providedIn: 'root' })
export class IdleLockService {
  private readonly auth = inject(AuthService);
  private readonly sync = inject(SyncAgentService);

  private readonly _locked = signal(false);
  private readonly _left = signal<number | null>(null);
  private last = Date.now();
  private started = false;

  readonly locked = this._locked.asReadonly();
  /** Seconds until the lock, shown as a warning for the last few; null the rest of the time. */
  readonly warning = computed(() => { const s = this._left(); return s !== null && s <= WARN_SECONDS && !this._locked() ? s : null; });

  /** 0 switches the lock off (the automated browser tests, which switch it on for themselves with localStorage 'zp.idle.seconds'). */
  private seconds(): number {
    try {
      const own = Number(localStorage.getItem('zp.idle.seconds'));
      if (Number.isFinite(own) && own > 0) return own;
    } catch { /* storage may be blocked */ }
    return (environment as { idleLockSeconds?: number }).idleLockSeconds ?? DEFAULT_SECONDS;
  }

  /** Called once by the application frame. */
  start(): void {
    if (this.started) return;
    this.started = true;
    const touch = () => { if (!this._locked()) this.last = Date.now(); };
    for (const name of ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const) document.addEventListener(name, touch, { capture: true, passive: true });
    setInterval(() => this.tick(), 1000);
  }

  private tick(): void {
    const limit = this.seconds();
    if (limit <= 0 || this._locked()) { this._left.set(null); return; }
    if (!this.auth.isAuthenticated()) { this.last = Date.now(); this._left.set(null); return; }   // the clock starts when someone signs in
    if (!this.sync.online()) { this.last = Date.now(); this._left.set(null); return; }   // never lock a till that could not be unlocked
    const left = Math.ceil(limit - (Date.now() - this.last) / 1000);
    if (left <= 0) { this._left.set(null); this._locked.set(true); return; }
    this._left.set(left);
  }

  /** "I am still here" on the warning, and the lock screen after a sign-in. */
  stay(): void {
    this.last = Date.now();
    this._left.set(null);
    this._locked.set(false);
  }

  /** The person locks the screen themselves before walking away. */
  lockNow(): void {
    if (this.auth.isAuthenticated() && this.sync.online()) this._locked.set(true);
  }
}
