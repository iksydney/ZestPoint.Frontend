/**
 * Reading barcodes from a camera (enterprise programme, piece 13).
 *
 * The browser's own reader (`BarcodeDetector`, in Chrome and Edge on Android and on some computers) is used wherever it exists: it is fast and costs
 * the battery little. Everywhere else (iPhone Safari, Firefox, most Windows PCs) the open-source `barcode-detector` library reads the codes with ZXing.
 * The library, and the 947 KB ZXing file it needs, are loaded only when someone first opens the camera, never as part of the first download; the
 * file is served from this application (`/zxing/`, copied in by angular.json), never from an outside address, so it also works offline once it has been used.
 */

/** What the till, receiving and stock take understand: retail and trade barcodes, and QR codes. Fewer formats is faster and means fewer false reads. */
export const SCAN_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'] as const;

export interface Detected { readonly rawValue: string; readonly format: string }

export interface Reader {
  /** Which reader is in use, for the camera screen to say when something is wrong. */
  readonly engine: 'native' | 'library';
  detect(source: HTMLVideoElement): Promise<readonly Detected[]>;
}

interface NativeDetectorCtor {
  new (options: { formats: string[] }): { detect(source: HTMLVideoElement): Promise<Detected[]> };
  getSupportedFormats(): Promise<string[]>;
}

/** Where the ZXing file is served from: next to the application, honouring the page's base address. */
const wasmUrl = (): string => new URL('zxing/zxing_reader.wasm', document.baseURI).href;

let cached: Promise<Reader> | null = null;

/** Makes the reader once and keeps it: the second time the camera opens it is ready at once. */
export function createReader(): Promise<Reader> {
  cached ??= build().catch((err) => { cached = null; throw err; });   // a failed load (offline the first time) may be tried again
  return cached;
}

async function build(): Promise<Reader> {
  const Native = (globalThis as { BarcodeDetector?: NativeDetectorCtor }).BarcodeDetector;
  if (Native) {
    try {
      const supported = await Native.getSupportedFormats();
      const formats = SCAN_FORMATS.filter((f) => supported.includes(f));
      // A native reader that cannot read the everyday retail formats (some desktops list only QR codes) is not worth using.
      if (formats.includes('ean_13') && formats.includes('code_128')) {
        const detector = new Native({ formats });
        return { engine: 'native', detect: (video) => detector.detect(video) };
      }
    } catch { /* fall through to the library */ }
  }

  const lib = await import('barcode-detector/ponyfill');
  lib.prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl() : prefix + path) } });
  const detector = new lib.BarcodeDetector({ formats: [...SCAN_FORMATS] });
  return { engine: 'library', detect: (video) => detector.detect(video) as Promise<readonly Detected[]> };
}

/** A short beep and a buzz: a scan is felt even when nobody is looking at the screen. */
export function confirmScan(): void {
  try { navigator.vibrate?.(40); } catch { /* not on every device */ }
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.09);
    setTimeout(() => void ctx.close(), 250);
  } catch { /* silent is fine */ }
}
