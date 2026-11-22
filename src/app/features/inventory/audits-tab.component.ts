import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ScaleService } from '../../core/hardware/scale';
import { FEATURES, SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { AuditDto, AuditKind, InventoryItemDto, MeasurementDto, MeasurementSource } from '../../core/models/ops.model';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { BranchContextService } from '../../core/services/branch-context.service';
import { AuditsApi, InventoryApi } from '../../core/services/ops.services';
import { SyncAgentService } from '../../core/services/sync-agent.service';
import { DialogComponent, ToastService } from '../../shared/ui/feedback';
import { SearchSelectComponent, SelectOption } from '../../shared/ui/search-select.component';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';

type Method = 'manual' | 'scale' | 'demo';
const TONE = { None: 'success', Warning: 'warning', Investigate: 'warning', Escalate: 'danger' } as const;

/**
 * Stock counts and weigh-scale bottle audits. Three clearly labelled ways to record a quantity: typed by hand (Manual), read from a
 * real Bluetooth scale (Scale) or from the simulated demonstration scale (Demo). The measured figure is stored next to the expected
 * one; changing the book stock is a separate, explicit "book correction".
 */
@Component({
    selector: 'zp-audits-tab',
    imports: [DecimalPipe, FormsModule, DialogComponent, SearchSelectComponent, StatusBadgeComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    @if (error()) { <p class="sys-alert sys-alert-danger mb-3" role="alert">{{ error() }}</p> }

    @if (!current()) {
      <div class="mb-3 flex items-center justify-between"><h2 class="text-lg font-semibold">Audits</h2>
        @if (!readOnly()) { <button type="button" class="btn-primary" data-testid="start-audit" (click)="openStart()">Start an audit</button> }</div>
      <div class="app-card overflow-x-auto p-0"><table class="app-table"><thead><tr><th>#</th><th>Type</th><th>Station</th><th>Shift</th><th>Status</th><th>Started</th><th></th></tr></thead>
        <tbody>@for (a of audits(); track a.id) { <tr><td>{{ a.number }}</td><td>{{ a.kind }}</td><td>{{ a.stationId }}</td><td>{{ a.shiftLabel }}</td>
          <td><zp-status-badge [tone]="a.status === 'Open' ? 'primary' : 'success'">{{ a.status }}</zp-status-badge></td><td class="text-xs">{{ a.startedAtUtc.slice(0, 16).replace('T', ' ') }}</td>
          <td class="text-right"><button type="button" class="btn-outline px-2 py-1 text-sm" [attr.data-testid]="'open-audit-' + a.number" (click)="open(a.id)">Open</button></td></tr> }
          @empty { <tr><td colspan="7" class="py-6 text-center text-ink/70">No audits yet.</td></tr> }</tbody></table></div>
    } @else {
      @if (current(); as a) {
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div><button type="button" class="btn-ghost px-2" (click)="close()">&larr; All audits</button>
            <h2 class="inline text-lg font-semibold">Audit #{{ a.number }} ({{ a.kind }}) <zp-status-badge [tone]="a.status === 'Open' ? 'primary' : 'success'">{{ a.status }}</zp-status-badge></h2></div>
          @if (a.status === 'Open' && !readOnly()) { <button type="button" class="btn-outline" data-testid="complete-audit" (click)="complete(a.id)">Complete audit</button> }
        </div>

        @if (a.status === 'Open' && !readOnly()) {
          <section class="app-card mb-4" aria-label="Record a measurement">
            @if (!sync.online()) { <p class="sys-alert sys-alert-info mb-3" role="status">You are offline. Measurements are saved on this device and sent when you reconnect.</p> }
            <div class="grid gap-3 sm:grid-cols-2">
              <div><label class="app-label" for="m-item">Item</label>
                <zp-search-select inputId="m-item" testId="measure-item" emptyLabel="Choose..." noun="item" placeholder="Search items" [options]="itemOptions()" [value]="itemId()" (valueChange)="itemId.set($event)" /></div>
              <div><label class="app-label" for="m-method">How is it measured?</label>
                <select id="m-method" class="app-input" data-testid="measure-method" [ngModel]="method()" (ngModelChange)="setMethod($event)">
                  <option value="manual">Counted / estimated by hand (Manual)</option>
                  @if (canWeigh()) { <option value="scale" [disabled]="!scales.bluetoothAvailable">Bluetooth scale (Scale)</option><option value="demo">Demonstration scale (simulated, Demo)</option> }
                </select></div>
            </div>

            @if (method() === 'manual') {
              <div class="mt-3 max-w-xs"><label class="app-label" for="m-qty">Quantity ({{ unitOf() }})</label><input id="m-qty" type="number" min="0" step="any" class="app-input" data-testid="measure-qty" [ngModel]="manualQty()" (ngModelChange)="manualQty.set($event === null || $event === '' ? null : +$event)" /></div>
            } @else {
              <div class="mt-3 rounded-lg border border-ink/15 p-3" data-testid="scale-panel">
                @if (method() === 'demo') { <p class="sys-alert sys-alert-warning mb-2" role="status" data-testid="demo-scale-note">Demonstration scale: you set the weight. Nothing is read from a real device, and the result is recorded as Demo.</p> }
                <p class="text-sm">Scale: <strong>{{ scales.adapter()?.label ?? 'not connected' }}</strong> ({{ scales.adapter()?.status() ?? 'disconnected' }})</p>
                @if (scales.adapter()?.error()) { <p class="text-sm text-danger" role="alert">{{ scales.adapter()?.error() }}</p> }
                @if (method() === 'scale' && scales.adapter()?.status() !== 'connected') { <button type="button" class="btn-outline mt-2" data-testid="connect-scale" (click)="connect()">Connect scale</button> }
                @if (method() === 'demo') {
                  <div class="mt-2 flex items-end gap-2"><div><label class="app-label" for="demo-g">Place a bottle weighing (g)</label><input id="demo-g" type="number" min="0" class="app-input" data-testid="demo-grams" [ngModel]="demoGrams()" (ngModelChange)="demoGrams.set(+$event)" /></div>
                    <button type="button" class="btn-outline" data-testid="demo-place" (click)="placeDemo()">Place on scale</button></div>
                }
                <p class="mt-3 text-lg">Reading: <strong data-testid="scale-reading">{{ scales.reading() ? (scales.reading()!.grams | number: '1.0-1') + ' g' : 'no reading yet' }}</strong>
                  @if (scales.reading()) { <zp-status-badge [tone]="scales.reading()!.stable ? 'success' : 'warning'">{{ scales.reading()!.stable ? 'Stable' : 'Settling...' }}</zp-status-badge> }</p>
                @if (tareOf() !== null) { <p class="text-xs text-ink/70">Empty bottle weight used: {{ tareOf() }} g. Density: {{ densityOf() ?? 'not set' }}.</p> }
                @if (densityMissing()) { <p class="sys-alert sys-alert-warning mt-2" role="alert">This item has no density, so weight cannot become millilitres. Set the density on the item, or count it by hand.</p> }
              </div>
            }
            <div class="mt-3"><label class="app-label" for="m-note">Note (optional)</label><input id="m-note" class="app-input" [ngModel]="note()" (ngModelChange)="note.set($event)" /></div>
            <button type="button" class="btn-primary mt-3" data-testid="measure-save" [disabled]="!canSubmit() || saving()" (click)="submit(a)">Record measurement</button>
          </section>
        }

        <div class="app-card overflow-x-auto p-0"><table class="app-table" data-testid="measurements">
          <caption class="sr-only">Measurements in this audit</caption>
          <thead><tr><th>Item</th><th>Source</th><th class="text-right">Expected</th><th class="text-right">Measured</th><th class="text-right">Variance</th><th class="text-right">%</th><th>Severity</th><th></th></tr></thead>
          <tbody>
            @for (m of a.measurements; track m.id) {
              <tr [attr.data-testid]="'measurement-' + m.itemName">
                <td>{{ m.itemName }}@if (m.grossGrams !== null) { <span class="block text-xs text-ink/60">{{ m.grossGrams }} g gross, {{ m.netGrams }} g net</span> }</td>
                <td><zp-status-badge [tone]="m.source === 'Scale' ? 'success' : m.source === 'Demo' ? 'warning' : 'primary'">{{ m.source }}</zp-status-badge></td>
                <td class="text-right">{{ m.expectedQuantity | number: '1.0-2' }}</td><td class="text-right" data-testid="measured">{{ m.measuredQuantity | number: '1.0-2' }}</td>
                <td class="text-right" [class.text-danger]="m.variance < 0" data-testid="variance">{{ m.variance | number: '1.0-2' }}</td>
                <td class="text-right" data-testid="variance-pct">{{ m.variancePercent === null ? 'n/a' : (m.variancePercent | number: '1.0-1') + '%' }}</td>
                <td><zp-status-badge [tone]="tone(m)"><span data-testid="severity">{{ m.severity }}</span></zp-status-badge></td>
                <td class="text-right">@if (canCorrect() && !readOnly() && m.variance !== 0) { <button type="button" class="btn-outline px-2 py-1 text-sm" [attr.data-testid]="'correct-' + m.itemName" (click)="openCorrect(m)">Book correction</button> }</td>
              </tr>
            } @empty { <tr><td colspan="8" class="py-6 text-center text-ink/70">No measurements yet.</td></tr> }
          </tbody></table></div>
      }
    }

    <zp-dialog [open]="dialog() === 'start'" title="Start an audit" (closed)="dialog.set(null)">
      <form class="space-y-3" (submit)="$event.preventDefault(); start()">
        <div><label class="app-label" for="au-kind">Type</label>
          <select id="au-kind" class="app-input" data-testid="audit-kind" [ngModel]="startKind()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="startKind.set($event)"><option value="Manual">Stock count</option>@if (canWeigh()) { <option value="Weighed">Weigh-scale bottle audit</option> }</select></div>
        <div><label class="app-label" for="au-station">Station (e.g. Main bar)</label><input id="au-station" class="app-input" data-testid="audit-station" [ngModel]="station()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="station.set($event)" /></div>
        <div><label class="app-label" for="au-shift">Shift (e.g. Night)</label><input id="au-shift" class="app-input" data-testid="audit-shift" [ngModel]="shift()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="shift.set($event)" /></div>
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="audit-start" [disabled]="saving()">Start</button></div>
      </form>
    </zp-dialog>

    <zp-dialog [open]="dialog() === 'correct'" title="Book a stock correction" (closed)="dialog.set(null)">
      @if (correcting(); as m) {
        <form class="space-y-3" (submit)="$event.preventDefault(); correct()">
          <p class="text-sm">This changes the book stock of <strong>{{ m.itemName }}</strong> to the measured {{ m.measuredQuantity | number: '1.0-2' }}. It is recorded in the stock ledger with your name and reason. A variance is a reason to investigate, not proof of anything.</p>
          <div><label class="app-label" for="co-reason">Reason</label><input id="co-reason" class="app-input" data-testid="correction-reason" [ngModel]="correctReason()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="correctReason.set($event)" /></div>
          <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="dialog.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="correction-save" [disabled]="saving() || correctReason().trim().length < 3">Correct stock</button></div>
        </form>
      }
    </zp-dialog>
  `
})
export class AuditsTabComponent {
  private readonly api = inject(AuditsApi);
  private readonly inventory = inject(InventoryApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  protected readonly branches = inject(BranchContextService);
  protected readonly sync = inject(SyncAgentService);
  protected readonly scales = inject(ScaleService);

  protected readonly audits = signal<readonly AuditDto[]>([]);
  protected readonly current = signal<AuditDto | null>(null);
  protected readonly items = signal<readonly InventoryItemDto[]>([]);
  protected readonly dialog = signal<'start' | 'correct' | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly saving = signal(false);

  protected readonly startKind = signal<AuditKind>('Manual');
  protected readonly station = signal('');
  protected readonly shift = signal('');
  protected readonly itemId = signal('');
  protected readonly method = signal<Method>('manual');
  protected readonly manualQty = signal<number | null>(null);
  protected readonly demoGrams = signal(0);
  protected readonly note = signal('');
  protected readonly correcting = signal<MeasurementDto | null>(null);
  protected readonly correctReason = signal('');

  protected readonly readOnly = computed(() => this.auth.accessModeFor(FEATURES.INVENTORY) === 'readonly');
  protected readonly canWeigh = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.INVENTORY_WEIGH_AUDIT_PERFORM) && this.auth.accessModeFor(FEATURES.BULK_WEIGHED_AUDIT) === 'full');
  protected readonly canCorrect = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.INVENTORY_STOCK_ADJUST));
  protected readonly itemOptions = computed<readonly SelectOption[]>(() => this.items().map((i) => ({ value: i.id, label: i.name })));
  protected readonly selected = computed(() => this.items().find((i) => i.id === this.itemId()) ?? null);
  protected readonly unitOf = computed(() => ({ Milliliter: 'ml', Gram: 'g', Each: 'each' })[this.selected()?.baseUnit ?? 'Each']);
  protected readonly tareOf = computed(() => this.selected()?.tareGrams ?? null);
  protected readonly densityOf = computed(() => this.selected()?.densityGPerMl ?? null);
  protected readonly densityMissing = computed(() => !!this.selected() && this.selected()!.baseUnit === 'Milliliter' && this.selected()!.densityGPerMl === null);

  protected readonly canSubmit = computed(() => {
    if (!this.itemId()) return false;
    if (this.method() === 'manual') return this.manualQty() !== null && this.manualQty()! >= 0;
    const r = this.scales.reading();
    return !!r && r.stable && !this.densityMissing();
  });

  constructor() {
    effect(() => {
      if (this.branches.activeId()) untracked(() => void this.load());
    });
  }

  protected tone = (m: MeasurementDto) => TONE[m.severity];

  private async load(): Promise<void> {
    const branchId = this.branches.activeId();
    if (!branchId) return;
    try {
      const [audits, items] = await Promise.all([firstValueFrom(this.api.list({ branchId, pageSize: 50 })), firstValueFrom(this.inventory.items({ branchId, pageSize: 200 }))]);
      this.audits.set(audits.items);
      this.items.set(items.items.filter((i) => i.isActive));
    } catch (err) { this.error.set(toApiError(err).message); }
  }

  protected openStart(): void { this.startKind.set('Manual'); this.station.set(''); this.shift.set(''); this.dialog.set('start'); }

  protected async start(): Promise<void> {
    const branchId = this.branches.activeId();
    if (!branchId) return;
    this.saving.set(true);
    try {
      const a = await firstValueFrom(this.api.start({ branchId, kind: this.startKind(), stationId: this.station().trim() || null, shiftLabel: this.shift().trim() || null, notes: null, clientId: crypto.randomUUID() }));
      this.dialog.set(null);
      this.current.set(a);
      this.method.set(this.startKind() === 'Weighed' && this.canWeigh() ? 'demo' : 'manual');
      await this.load();
    } catch (err) { this.error.set(toApiError(err).message); } finally { this.saving.set(false); }
  }

  protected async open(id: string): Promise<void> {
    try { this.current.set(await firstValueFrom(this.api.get(id))); } catch (err) { this.error.set(toApiError(err).message); }
  }

  protected close(): void { this.current.set(null); void this.scales.release(); void this.load(); }

  protected async complete(id: string): Promise<void> {
    try { this.current.set(await firstValueFrom(this.api.complete(id))); this.toast.success('Audit completed.'); } catch (err) { this.error.set(toApiError(err).message); }
  }

  // ---- measuring ----
  protected async setMethod(m: Method): Promise<void> {
    this.method.set(m);
    if (m === 'demo') await this.scales.use('demo');
    else if (m === 'manual') await this.scales.release();
  }

  protected async connect(): Promise<void> { await this.scales.use('web-bluetooth'); }

  protected placeDemo(): void { this.scales.placeDemo(this.demoGrams()); }

  protected async submit(audit: AuditDto): Promise<void> {
    const reading = this.scales.reading();
    const source: MeasurementSource = this.method() === 'manual' ? 'Manual' : (reading?.source ?? 'Manual');
    const body = {
      clientId: crypto.randomUUID(), inventoryItemId: this.itemId(), source, deviceId: this.method() === 'manual' ? null : reading?.deviceId ?? null,
      stationId: audit.stationId, isStable: this.method() === 'manual' ? true : !!reading?.stable,
      grossGrams: this.method() === 'manual' ? null : reading?.grams ?? null, tareGrams: null,
      manualQuantity: this.method() === 'manual' ? this.manualQty() : null, note: this.note().trim() || null, measuredAtUtc: new Date().toISOString()
    };

    this.saving.set(true);
    this.error.set(null);
    try {
      const m = await firstValueFrom(this.api.addMeasurement(audit.id, body));
      this.current.update((a) => (a ? { ...a, measurements: [...a.measurements, m] } : a));
      this.toast.success('Measurement recorded.');
      this.reset();
    } catch (err) {
      const e = toApiError(err);
      if (e.status === 0) {
        // Offline: keep it on the device. It carries its own client id, so replaying it can never record it twice.
        this.sync.markOffline();
        await this.sync.enqueue('measurement.add', { auditId: audit.id, ...body }, `Measure ${this.selected()?.name ?? 'item'} (${source})`);
        this.toast.info('You are offline. The measurement is saved on this device and will sync later.');
        this.reset();
      } else this.error.set(e.message);
    } finally { this.saving.set(false); }
  }

  private reset(): void {
    this.itemId.set('');
    this.manualQty.set(null);
    this.note.set('');
  }

  // ---- correction ----
  protected openCorrect(m: MeasurementDto): void { this.correcting.set(m); this.correctReason.set(''); this.dialog.set('correct'); }

  protected async correct(): Promise<void> {
    const m = this.correcting();
    const a = this.current();
    if (!m || !a) return;
    this.saving.set(true);
    try {
      await firstValueFrom(this.api.correct(a.id, { measurementId: m.id, reason: this.correctReason().trim(), idempotencyKey: `corr-${crypto.randomUUID()}` }));
      this.dialog.set(null);
      this.toast.success('Stock corrected to the measured figure.');
    } catch (err) { this.error.set(toApiError(err).message); this.dialog.set(null); } finally { this.saving.set(false); }
  }
}
