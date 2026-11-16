import { Injectable, computed, signal } from '@angular/core';

/** The browser's own install offer (Chrome, Edge and Samsung Internet on Android, and Chromium on a PC). It is not in TypeScript's library yet. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'zp.install.dismissed';
/** After "Not now" the hint stays away this long. It is per device, not per person: it is about this phone. */
const QUIET_DAYS = 30;

const safeGet = (key: string): string | null => { try { return localStorage.getItem(key); } catch { return null; } };
const safeSet = (key: string, value: string): void => { try { localStorage.setItem(key, value); } catch { /* private window: the hint simply comes back next time */ } };

/** Opened from the home screen: there is nothing left to offer. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches === true || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** iPhone and iPad have no install offer to catch: the person has to use the Share menu, so all the hint can do is say how. */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);   // iPadOS says it is a Mac
}

const isTouchDevice = (): boolean => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;

/**
 * Offers to install the application on a phone or tablet (enterprise programme, piece 13). It keeps the browser's install offer until the person
 * asks for it, says how to do it by hand on an iPhone, and stays quiet once the application is installed, opened from the home screen, or
 * dismissed (for 30 days, on this device). On a PC the browser's own install button in the address bar is enough: the hint is for touch devices.
 * It must be created when the page loads (the browser may make its offer before anyone signs in): `AppComponent` asks for it.
 */
@Injectable({ providedIn: 'root' })
export class InstallService {
  private deferred: BeforeInstallPromptEvent | null = null;

  /** The browser has offered to install: the Install button can work. */
  readonly canPrompt = signal(false);
  readonly installed = signal(isStandalone());
  readonly ios = isIos();
  private readonly dismissed = signal(this.recentlyDismissed());

  /** Show the hint: not installed, not put off, and either the browser offered or this is an iPhone that has to be told how. */
  readonly showHint = computed(() => !this.installed() && !this.dismissed() && (this.canPrompt() ? isTouchDevice() || this.ios : this.ios));

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();   // keep the offer for our own button instead of the browser's mini-bar
      this.deferred = e as BeforeInstallPromptEvent;
      this.canPrompt.set(true);
    });
    window.addEventListener('appinstalled', () => { this.deferred = null; this.canPrompt.set(false); this.installed.set(true); });
  }

  private recentlyDismissed(): boolean {
    const at = Number(safeGet(DISMISSED_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < QUIET_DAYS * 86_400_000;
  }

  /** Opens the browser's install box. Whatever the answer, the offer is used up; "no" is remembered like "Not now". */
  async install(): Promise<void> {
    const offer = this.deferred;
    if (!offer) return;
    this.deferred = null;
    this.canPrompt.set(false);
    try {
      await offer.prompt();
      const { outcome } = await offer.userChoice;
      if (outcome === 'accepted') this.installed.set(true); else this.dismiss();
    } catch { /* the box could not open: the hint is gone for now and the browser's own button still works */ }
  }

  dismiss(): void {
    safeSet(DISMISSED_KEY, String(Date.now()));
    this.dismissed.set(true);
  }
}
