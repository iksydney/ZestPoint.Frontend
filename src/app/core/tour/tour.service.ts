import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiEnvelope } from '../models/api.model';
import { navFor } from '../navigation/app-nav';
import { unwrap } from '../services/api.util';
import { AuthService } from '../services/auth.service';
import { APP_TOUR, TOURS, TourDefinition, TourStep, stepsSince, tourByKey, tourForNav } from './tours';

interface TourProgressDto { key: string; version: number; skipped: boolean }

export interface ActiveTour {
  readonly tour: TourDefinition;
  readonly steps: readonly TourStep[];
  readonly index: number;
  /** True when only what changed since the person's last visit is being shown. */
  readonly changesOnly: boolean;
}

const AUTO_KEY = 'zp.tours.auto';

/**
 * Runs the guided tours and remembers, on the person's account, which ones they have seen (and at which version).
 *
 * A tour starts by itself the first time: the tour of the application after the first sign-in, and a screen's own tour the first time
 * that screen is opened. If a tour has changed since the person took it, they are shown only what changed. Anything can be taken again
 * from Help. If what the person has seen cannot be read from the server, nothing starts by itself: a tour is never forced on someone
 * who may already have taken it.
 */
@Injectable({ providedIn: 'root' })
export class TourService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly seen = signal<ReadonlyMap<string, number> | null>(null);
  private loadedFor: string | null = null;
  private loading: Promise<void> | null = null;

  private readonly _active = signal<ActiveTour | null>(null);
  readonly active = this._active.asReadonly();
  readonly step = computed<TourStep | null>(() => { const a = this._active(); return a ? a.steps[a.index] ?? null : null; });
  /** The step on show lives in the side menu, which on a phone is a drawer that has to be opened for it. */
  readonly wantsMenu = computed(() => this.step()?.menu === true);
  /** Steps that should have been on screen and were not, in the tour now running. More than none means a tour is out of date. */
  readonly missing = signal<readonly string[]>([]);

  /**
   * Tours start by themselves everywhere except the automated browser tests, where one popping up would get in the way of every other
   * test; the tour's own test switches them on for itself.
   */
  private autoEnabled(): boolean {
    try { if (localStorage.getItem(AUTO_KEY) === 'on') return true; } catch { /* storage may be blocked */ }
    return (environment as { toursAutoStart?: boolean }).toursAutoStart !== false;
  }

  /** What this person has seen, read once per sign-in. */
  private load(): Promise<void> {
    const who = this.auth.membership()?.id ?? null;
    if (!who) return Promise.resolve();
    if (this.loadedFor !== who || !this.loading) {
      this.loadedFor = who;
      this.seen.set(null);
      this.loading = firstValueFrom(this.http.get<ApiEnvelope<TourProgressDto[]>>('/api/v1/me/tours').pipe(unwrap()))
        .then((rows) => { this.seen.set(new Map(rows.map((r) => [r.key, r.version]))); })
        .catch(() => { this.seen.set(null); });
    }
    return this.loading;
  }

  /** The tour of the screen at this address, if it has one. */
  screenTour(url: string): TourDefinition | null {
    return tourForNav(navFor(url)?.key);
  }

  /** Called when the person lands on a screen: starts what they have not seen yet, if anything. */
  async arrived(url: string): Promise<void> {
    if (!this.autoEnabled() || this._active()) return;
    await this.load();
    const seen = this.seen();
    if (!seen || this._active()) return;
    for (const tour of [tourByKey(APP_TOUR), this.screenTour(url)]) {
      if (!tour) continue;
      const version = seen.get(tour.key) ?? null;
      if (version !== null && version >= tour.version) continue;
      const steps = stepsSince(tour, version);
      // A newer version with nothing to show (a correction to the wording, say) is simply marked as seen.
      if (steps.length === 0) { void this.remember(tour, false); continue; }
      this.begin(tour, steps, version !== null);
      return;
    }
  }

  /** Starts a tour from the beginning because the person asked for it. */
  start(key: string): void {
    const tour = tourByKey(key);
    if (tour) this.begin(tour, tour.steps, false);
  }

  private begin(tour: TourDefinition, steps: readonly TourStep[], changesOnly: boolean): void {
    this.missing.set([]);
    this._active.set({ tour, steps, index: 0, changesOnly });
  }

  next(): void {
    const a = this._active();
    if (!a) return;
    if (a.index >= a.steps.length - 1) { this.finish(false); return; }
    this._active.set({ ...a, index: a.index + 1 });
  }

  back(): void {
    const a = this._active();
    if (a && a.index > 0) this._active.set({ ...a, index: a.index - 1 });
  }

  /** The step's target is not on screen: it is left out, and noted if it should have been there. */
  skipStep(direction: 1 | -1): void {
    const a = this._active();
    if (!a) return;
    const step = a.steps[a.index];
    if (step && !step.optional && !this.missing().includes(step.id)) this.missing.update((m) => [...m, step.id]);
    const index = a.index + direction;
    if (index < 0) { this.next(); return; }
    if (index > a.steps.length - 1) { this.finish(false); return; }
    this._active.set({ ...a, index });
  }

  /** Ends the tour. Leaving early still counts as seen: nobody is shown the same tour twice unless they ask. */
  finish(skipped: boolean): void {
    const a = this._active();
    if (!a) return;
    this._active.set(null);
    void this.remember(a.tour, skipped);
  }

  private async remember(tour: TourDefinition, skipped: boolean): Promise<void> {
    const seen = new Map(this.seen() ?? []);
    if ((seen.get(tour.key) ?? 0) >= tour.version) return;
    seen.set(tour.key, tour.version);
    this.seen.set(seen);
    try { await firstValueFrom(this.http.put<ApiEnvelope<TourProgressDto>>(`/api/v1/me/tours/${encodeURIComponent(tour.key)}`, { version: tour.version, skipped }).pipe(unwrap())); }
    catch { /* not saved: the worst that happens is the tour is offered once more on another device */ }
  }

  /** Forgets everything this person has seen, so each tour is offered again as they move around. */
  async startOver(): Promise<void> {
    await firstValueFrom(this.http.delete<ApiEnvelope<boolean>>('/api/v1/me/tours').pipe(unwrap()));
    this.seen.set(new Map());
  }

  /** Every tour and whether this person has seen its current version (for the Help menu). */
  readonly catalogue = computed(() => TOURS.map((t) => ({ tour: t, seen: (this.seen()?.get(t.key) ?? 0) >= t.version })));
}
