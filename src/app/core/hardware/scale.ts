import { Injectable, Signal, computed, signal } from '@angular/core';

/**
 * Weigh-scale abstraction. A reading is always labelled with where it came from:
 *   - "Scale": a real device reading (Web Bluetooth).
 *   - "Demo":  a simulated reading from the clearly labelled demonstration scale.
 * Manual entry is not a scale at all; it is typed in the form and sent with source "Manual".
 * Nothing here ever invents a weight: an adapter either reports what the device sent, or the screen says it has nothing.
 */
export interface ScaleReading {
  readonly grams: number;
  /** True only when the device itself, or a short run of identical readings, says the weight has settled. */
  readonly stable: boolean;
  readonly at: number;
  readonly deviceId: string;
  readonly source: 'Scale' | 'Demo';
}

export type ScaleStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ScaleAdapter {
  readonly kind: 'web-bluetooth' | 'demo';
  readonly label: string;
  readonly isDemo: boolean;
  readonly status: Signal<ScaleStatus>;
  readonly reading: Signal<ScaleReading | null>;
  readonly error: Signal<string | null>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

// ---- Weight Scale Service (Bluetooth SIG 0x181D / Weight Measurement 0x2A9D) ----------------------

/** Parses a Weight Measurement characteristic value into grams. Pure, so it is unit-testable. */
export function parseWeightMeasurement(view: DataView): number | null {
  if (view.byteLength < 3) return null;
  const flags = view.getUint8(0);
  const imperial = (flags & 0x01) === 1;
  const raw = view.getUint16(1, true);
  if (raw === 0xffff) return null; // "measurement unsuccessful"
  // SI: 0.005 kg per unit (= 5 g). Imperial: 0.01 lb per unit.
  return imperial ? Math.round(raw * 0.01 * 453.59237 * 10) / 10 : raw * 5;
}

/** A reading counts as stable when the last few samples over ~1 s agree within 1 g. */
export class StabilityWindow {
  private samples: { g: number; t: number }[] = [];
  constructor(private readonly minSamples = 4, private readonly windowMs = 1200, private readonly toleranceG = 1) {}

  push(grams: number, at: number): boolean {
    this.samples = [...this.samples.filter((s) => at - s.t <= this.windowMs), { g: grams, t: at }];
    if (this.samples.length < this.minSamples) return false;
    const values = this.samples.map((s) => s.g);
    return Math.max(...values) - Math.min(...values) <= this.toleranceG;
  }

  reset(): void {
    this.samples = [];
  }
}

export function isWebBluetoothAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

/**
 * Connects to any scale that exposes the standard Bluetooth Weight Scale service. Many commercial bench scales use a vendor
 * protocol instead; those need their own adapter (see findings.md) and until one exists the manual workflow is used.
 */
export class WebBluetoothScaleAdapter implements ScaleAdapter {
  readonly kind = 'web-bluetooth' as const;
  readonly label = 'Bluetooth scale';
  readonly isDemo = false;

  private readonly _status = signal<ScaleStatus>('disconnected');
  private readonly _reading = signal<ScaleReading | null>(null);
  private readonly _error = signal<string | null>(null);
  readonly status = this._status.asReadonly();
  readonly reading = this._reading.asReadonly();
  readonly error = this._error.asReadonly();

  private device: BluetoothDeviceLike | null = null;
  private readonly window = new StabilityWindow();

  async connect(): Promise<void> {
    if (!isWebBluetoothAvailable()) {
      this.fail('This browser cannot talk to Bluetooth devices. Use Chrome or Edge, or enter the weight by hand.');
      return;
    }
    this._status.set('connecting');
    this._error.set(null);
    try {
      const bt = (navigator as unknown as { bluetooth: BluetoothLike }).bluetooth;
      this.device = await bt.requestDevice({ filters: [{ services: ['weight_scale'] }] });
      this.device.addEventListener('gattserverdisconnected', () => {
        this._status.set('disconnected');
        this._reading.set(null);
      });
      const server = await this.device.gatt!.connect();
      const service = await server.getPrimaryService('weight_scale');
      const characteristic = await service.getCharacteristic('weight_measurement');
      characteristic.addEventListener('characteristicvaluechanged', (e: Event) => {
        const target = e.target as unknown as { value?: DataView };
        if (!target.value) return;
        const grams = parseWeightMeasurement(target.value);
        if (grams === null) return;
        const at = Date.now();
        this._reading.set({ grams, stable: this.window.push(grams, at), at, deviceId: this.device?.id ?? 'unknown', source: 'Scale' });
      });
      await characteristic.startNotifications();
      this._status.set('connected');
    } catch (err) {
      const cancelled = err instanceof DOMException && err.name === 'NotFoundError';
      this.fail(cancelled ? 'No scale was chosen.' : 'Could not connect to the scale. Check that it is on, in range and not paired to another device.');
    }
  }

  async disconnect(): Promise<void> {
    this.device?.gatt?.disconnect();
    this._status.set('disconnected');
    this._reading.set(null);
    this.window.reset();
  }

  private fail(message: string): void {
    this._status.set('error');
    this._error.set(message);
  }
}

/** The demonstration scale: the operator sets the weight; every reading is labelled DEMO and recorded with source "Demo". */
export class DemoScaleAdapter implements ScaleAdapter {
  readonly kind = 'demo' as const;
  readonly label = 'Demonstration scale (simulated)';
  readonly isDemo = true;

  private readonly _status = signal<ScaleStatus>('disconnected');
  private readonly _reading = signal<ScaleReading | null>(null);
  readonly status = this._status.asReadonly();
  readonly reading = this._reading.asReadonly();
  readonly error = signal<string | null>(null).asReadonly();

  async connect(): Promise<void> {
    this._status.set('connected');
  }

  async disconnect(): Promise<void> {
    this._status.set('disconnected');
    this._reading.set(null);
  }

  /** Simulates placing a bottle of the given gross weight on the scale. */
  place(grams: number): void {
    this._reading.set({ grams, stable: true, at: Date.now(), deviceId: 'demo-scale', source: 'Demo' });
  }
}

/** Holds the scale the operator picked. */
@Injectable({ providedIn: 'root' })
export class ScaleService {
  private readonly _adapter = signal<ScaleAdapter | null>(null);
  readonly adapter = this._adapter.asReadonly();
  readonly reading = computed(() => this._adapter()?.reading() ?? null);
  readonly bluetoothAvailable = isWebBluetoothAvailable();

  async use(kind: 'web-bluetooth' | 'demo'): Promise<void> {
    await this._adapter()?.disconnect();
    const next: ScaleAdapter = kind === 'demo' ? new DemoScaleAdapter() : new WebBluetoothScaleAdapter();
    this._adapter.set(next);
    await next.connect();
  }

  async release(): Promise<void> {
    await this._adapter()?.disconnect();
    this._adapter.set(null);
  }

  /** Only meaningful for the demonstration adapter. */
  placeDemo(grams: number): void {
    const a = this._adapter();
    if (a instanceof DemoScaleAdapter) a.place(grams);
  }
}

// Minimal structural types so the file compiles without the Web Bluetooth lib typings.
interface BluetoothLike { requestDevice(options: unknown): Promise<BluetoothDeviceLike> }
interface BluetoothDeviceLike {
  readonly id: string;
  readonly gatt?: { connect(): Promise<BluetoothServerLike>; disconnect(): void };
  addEventListener(type: string, listener: () => void): void;
}
interface BluetoothServerLike { getPrimaryService(name: string): Promise<{ getCharacteristic(name: string): Promise<BluetoothCharacteristicLike> }> }
interface BluetoothCharacteristicLike {
  addEventListener(type: string, listener: (e: Event) => void): void;
  startNotifications(): Promise<unknown>;
}
