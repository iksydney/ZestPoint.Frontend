import { ChangeDetectionStrategy, Component, ElementRef, HostListener, OnDestroy, effect, input, output, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { confirmScan, createReader, type Reader } from '../../core/scanner/barcode-reader';
import { DialogComponent } from './feedback';

/** What the screen using the scanner tells the person about the code just read ("Added Cola", "No product has that barcode"). */
export interface ScanFeedback { readonly text: string; readonly ok: boolean }

/**
 * The phone's camera as a barcode scanner (enterprise programme, piece 13), for the till, stock take, receiving and the purchase order. It opens the
 * back camera, reads codes (`core/scanner/barcode-reader.ts`) and hands each one to the screen, which says what it did with it (`feedback`). It never
 * records or sends a picture: frames are read in the browser and thrown away, and the camera is switched off the moment this closes, the page is
 * hidden or the screen is left.
 *
 * `continuous` keeps reading (the till, receiving) with the same code ignored for 1.5 seconds so one scan is not counted twice; otherwise it closes
 * after the first code. Typing the code is always offered, so a refused permission, a device with no camera or an insecure address never stops the work.
 * On a phone it fills the screen.
 */
@Component({
    selector: 'zp-camera-scanner',
    imports: [FormsModule, DialogComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <zp-dialog [open]="open()" [title]="title()" [phoneFull]="true" (closed)="closed.emit()">
      <div class="space-y-3" data-testid="scanner" [attr.data-engine]="engine()">
        <div class="relative overflow-hidden rounded-xl bg-black" [class.hidden]="!!fatal()">
          <video #video playsinline muted autoplay class="aspect-[4/3] max-h-[55dvh] w-full object-cover" data-testid="scanner-video"></video>
          <div class="pointer-events-none absolute inset-x-6 inset-y-[22%] rounded-lg border-2 border-white/80" aria-hidden="true"></div>
        </div>
        @if (fatal(); as why) { <p class="sys-alert sys-alert-warning" role="alert" data-testid="scanner-problem">{{ why }}</p> }
        <p class="text-sm text-ink/80" role="status" aria-live="polite" data-testid="scanner-status">{{ status() }}</p>
        @if (feedback(); as f) {
          <p class="rounded-lg px-3 py-2 text-sm font-semibold" [class]="f.ok ? 'bg-success/15 text-ink' : 'bg-danger/15 text-ink'" role="status" data-testid="scanner-feedback">{{ f.ok ? 'OK: ' : 'Not added: ' }}{{ f.text }}</p>
        }
        @if (hasTorch() || canSwitch()) {
          <div class="flex flex-wrap gap-2">
            @if (hasTorch()) { <button type="button" class="btn-outline text-sm" data-testid="scanner-torch" [attr.aria-pressed]="torchOn()" (click)="toggleTorch()">{{ torchOn() ? 'Light off' : 'Light on' }}</button> }
            @if (canSwitch()) { <button type="button" class="btn-outline text-sm" data-testid="scanner-switch" (click)="switchCamera()">Other camera</button> }
          </div>
        }
        <form class="flex items-end gap-2" (submit)="$event.preventDefault(); submitManual()">
          <div class="min-w-0 flex-1"><label class="app-label" for="scan-manual">Or type the code</label>
            <input id="scan-manual" class="app-input" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" data-testid="scanner-manual" [ngModel]="manual()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="manual.set($event)" /></div>
          <button type="submit" class="btn-outline" data-testid="scanner-use" [disabled]="!manual().trim()">Use code</button>
        </form>
        <div class="flex justify-end"><button type="button" class="btn-primary" data-testid="scanner-done" (click)="closed.emit()">Done</button></div>
      </div>
    </zp-dialog>
  `
})
export class CameraScannerComponent implements OnDestroy {
  readonly open = input.required<boolean>();
  readonly title = input('Scan a barcode');
  readonly continuous = input(false);
  readonly feedback = input<ScanFeedback | null>(null);
  readonly scanned = output<string>();
  readonly closed = output<void>();

  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  protected readonly status = signal('');
  protected readonly fatal = signal<string | null>(null);
  protected readonly manual = signal('');
  protected readonly hasTorch = signal(false);
  protected readonly torchOn = signal(false);
  protected readonly canSwitch = signal(false);
  /** Which reader is in use once the camera is running: the browser's own, or the bundled library. Only for support and the tests. */
  protected readonly engine = signal<string | null>(null);

  private stream: MediaStream | null = null;
  private reader: Reader | null = null;
  /** Bumped on every open and close: a late answer from an earlier opening must not touch this one. */
  private session = 0;
  private lastCode = '';
  private lastAt = 0;
  private deviceIds: string[] = [];
  private deviceIndex = -1;

  constructor() {
    effect(() => {
      if (this.open()) untracked(() => void this.start());
      else untracked(() => this.stop());
    });
  }

  ngOnDestroy(): void { this.stop(); }

  /** A phone put away or another tab in front: the camera must not stay on behind it. */
  @HostListener('document:visibilitychange')
  protected onVisibility(): void {
    if (!this.open()) return;
    if (document.hidden) this.stop(); else void this.start();
  }

  private async start(): Promise<void> {
    this.stopStream();
    const session = ++this.session;
    this.fatal.set(null);
    this.torchOn.set(false);
    this.hasTorch.set(false);
    this.status.set('Starting the camera...');

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this.fatal.set(window.isSecureContext ? 'This browser cannot use the camera.' : 'The camera only works on a secure (https) address.');
      this.status.set('Type the code below instead.');
      return;
    }

    let stage: 'camera' | 'reader' = 'camera';
    try {
      const deviceId = this.deviceIndex >= 0 ? this.deviceIds[this.deviceIndex] : undefined;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: deviceId ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      if (session !== this.session) { stream.getTracks().forEach((t) => t.stop()); return; }   // closed while the camera was starting
      this.stream = stream;
      const video = this.video()?.nativeElement;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      void this.listCameras();
      this.hasTorch.set(!!(stream.getVideoTracks()[0]?.getCapabilities?.() as { torch?: boolean } | undefined)?.torch);

      this.status.set('Getting ready...');
      stage = 'reader';
      this.reader ??= await createReader();
      if (session !== this.session) return;
      this.engine.set(this.reader.engine);
      this.status.set('Point the camera at a barcode.');
      void this.loop(session);
    } catch (err) {
      if (session !== this.session) return;
      const name = (err as { name?: string } | null)?.name;
      this.fatal.set(
        stage === 'reader' ? 'The barcode reader could not be loaded. It needs a connection the first time. Type the code below.'
        : name === 'NotAllowedError' || name === 'SecurityError' ? 'The camera was not allowed. Allow it for this site in the browser settings, or type the code below.'
        : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'This device has no camera that can be used.'
        : name === 'NotReadableError' ? 'The camera is busy in another app. Close it there, or type the code below.'
        : 'The camera could not be started. Type the code below instead.');
      this.status.set('Type the code below instead.');
      this.stopStream();
    }
  }

  private async loop(session: number): Promise<void> {
    const interval = this.reader?.engine === 'native' ? 100 : 180;
    while (session === this.session && this.reader) {
      const video = this.video()?.nativeElement;
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        try {
          const found = await this.reader.detect(video);
          if (session !== this.session) return;
          const hit = found.find((f) => f.rawValue);
          if (hit) this.hit(hit.rawValue);
        } catch { /* a frame that cannot be read: the next one will do */ }
      }
      await new Promise<void>((resolve) => setTimeout(resolve, interval));
    }
  }

  private hit(code: string): void {
    const now = Date.now();
    if (code === this.lastCode && now - this.lastAt < 1500) return;   // the same code still in front of the camera is one scan
    this.lastCode = code;
    this.lastAt = now;
    confirmScan();
    this.status.set(`Read ${code}`);
    this.scanned.emit(code);
    if (!this.continuous()) this.closed.emit();
  }

  protected submitManual(): void {
    const code = this.manual().trim();
    if (!code) return;
    this.manual.set('');
    this.status.set(`Read ${code}`);
    this.scanned.emit(code);
    if (!this.continuous()) this.closed.emit();
  }

  private async listCameras(): Promise<void> {
    try {
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput' && d.deviceId);
      this.deviceIds = devices.map((d) => d.deviceId);
      this.canSwitch.set(devices.length > 1);
      const current = this.stream?.getVideoTracks()[0]?.getSettings().deviceId;
      if (this.deviceIndex < 0 && current) this.deviceIndex = Math.max(0, this.deviceIds.indexOf(current));
    } catch { /* the list is a nicety */ }
  }

  protected switchCamera(): void {
    if (this.deviceIds.length < 2) return;
    this.deviceIndex = (this.deviceIndex + 1) % this.deviceIds.length;
    void this.start();
  }

  protected async toggleTorch(): Promise<void> {
    const track = this.stream?.getVideoTracks()[0];
    if (!track) return;
    const next = !this.torchOn();
    try { await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] }); this.torchOn.set(next); }
    catch { this.hasTorch.set(false); }
  }

  private stopStream(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    const video = this.video()?.nativeElement;
    if (video) video.srcObject = null;
  }

  private stop(): void {
    this.session++;
    this.stopStream();
    this.status.set('');
    this.lastCode = '';
  }
}
