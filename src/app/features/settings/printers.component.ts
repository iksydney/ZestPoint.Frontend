import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiEnvelope } from '../../core/models/api.model';
import { HandheldMake, PrinterDto, PrinterKind, PrinterLanguage, PrinterPurpose } from '../../core/models/ops.model';
import { FEATURES } from '../../core/models/rbac.model';
import { toApiError, unwrap } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { BranchContextService } from '../../core/services/branch-context.service';
import { StationsService } from '../../core/services/stations.service';
import { DialogComponent, ToastService } from '../../shared/ui/feedback';
import { SearchSelectComponent, SelectOption } from '../../shared/ui/search-select.component';

interface PrinterForm {
  id: string | null; branchId: string | null; name: string; kind: PrinterKind; language: PrinterLanguage; host: string; port: number | null; deviceName: string;
  handheldMake: HandheldMake | null; paperWidthMm: number; labelHeightMm: number | null; purposes: PrinterPurpose[]; stationIds: string[]; isActive: boolean; sortOrder: number; notes: string;
}

const KINDS: readonly { value: PrinterKind; label: string }[] = [
  { value: 'Network', label: 'On the shop network (Wi-Fi or cable)' },
  { value: 'Bluetooth', label: 'Bluetooth' },
  { value: 'Handheld', label: 'A handheld\'s own printer' }
];
const LANGUAGES: readonly { value: PrinterLanguage; label: string }[] = [
  { value: 'EscPos', label: 'ESC/POS (receipt printers)' },
  { value: 'Tspl', label: 'TSPL (label printers: TSC, Xprinter)' },
  { value: 'Zpl', label: 'ZPL (Zebra label printers)' }
];
const PURPOSES: readonly { value: PrinterPurpose; label: string; hint: string }[] = [
  { value: 'Receipts', label: 'Receipts', hint: 'Customer receipts and gift card slips.' },
  { value: 'Reports', label: 'Reports', hint: 'Shift summaries and other reports on paper.' },
  { value: 'Labels', label: 'Labels', hint: 'Price and barcode labels, and table QR stickers.' },
  { value: 'Kitchen', label: 'Kitchen and bar tickets', hint: 'A paper ticket of what was sent to a station, printed by the waiter\'s phone from the bill. Choose the stations below.' }
];

/**
 * Printers (owner's decision, 2026-11-17): the printers the company's phones print to, set up once here and read by every phone for its branch. The server
 * keeps and checks the list but never talks to a printer: a phone connects to a network printer from inside the shop, pairs a Bluetooth printer by hand
 * (only its name is kept here, as a hint) and uses a handheld's own printer when it is on that handheld. A printer is switched off, never deleted.
 */
@Component({
    selector: 'zp-printers',
    imports: [FormsModule, DialogComponent, SearchSelectComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="flex flex-col gap-4" data-testid="printers">
      <div>
        <h1 class="text-2xl font-bold">Printers</h1>
        <p class="text-sm text-ink/70">The printers your phones print to: receipts and gift card slips, shift reports, labels, and kitchen and bar tickets. Set each one up once here; every phone at the branch finds it. Each phone pairs its own Bluetooth printer.</p>
      </div>
      @if (error()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="printers-error">{{ error() }}</p> }
      @if (readOnly()) { <p class="sys-alert sys-alert-info" role="status">Your subscription is read-only: printers can be seen but not changed.</p> }
      @if (!loading() && printers().length === 0) {
        <p class="sys-alert sys-alert-info" role="status" data-testid="printers-none">No printers yet. Add one, and the phones at its branch can print receipts, reports and labels to it.</p>
      }

      <section class="app-card overflow-hidden p-0" aria-label="Printers">
        <div class="flex items-center justify-between bg-ink/5 px-4 py-2">
          <h2 class="text-lg font-semibold">{{ activeCount() }} in use</h2>
          <button type="button" class="btn-primary" data-testid="printer-new" [disabled]="readOnly()" (click)="open(null)">Add a printer</button>
        </div>
        <div class="overflow-x-auto">
          <table class="app-table min-w-[46rem]" data-testid="printer-list">
            <caption class="sr-only">Printers</caption>
            <thead><tr><th>Name</th><th>Where</th><th>Connection</th><th>Language</th><th>Paper</th><th>For</th><th>Status</th><th></th></tr></thead>
            <tbody>
              @for (p of printers(); track p.id) {
                <tr [attr.data-testid]="'printer-row-' + p.name" [class.opacity-60]="!p.isActive">
                  <td class="font-semibold">{{ p.name }}</td>
                  <td>{{ p.branchName ?? 'Every branch' }}</td>
                  <td>{{ connection(p) }}</td>
                  <td>{{ languageName(p.language) }}</td>
                  <td class="whitespace-nowrap">{{ paper(p) }}</td>
                  <td>{{ purposeNames(p) }}</td>
                  <td>{{ p.isActive ? 'In use' : 'Switched off' }}</td>
                  <td class="text-right"><button type="button" class="btn-ghost text-sm" [attr.data-testid]="'printer-edit-' + p.name" [disabled]="readOnly()" (click)="open(p)">Edit</button></td>
                </tr>
              } @empty { <tr><td colspan="8" class="py-8 text-center text-ink/70">{{ loading() ? 'Loading...' : '' }}</td></tr> }
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <zp-dialog [open]="!!form()" [title]="form()?.id ? 'Printer ' + editingName() : 'Add a printer'" [wide]="true" (closed)="form.set(null)">
      @if (form(); as f) {
        <form class="space-y-3" (submit)="$event.preventDefault(); save()" data-testid="printer-form">
          <div class="grid gap-3 sm:grid-cols-2">
            <div><label class="app-label" for="pr-name">Name</label><input id="pr-name" class="app-input" maxlength="60" data-testid="printer-name" placeholder="e.g. Counter, Bar labels" [ngModel]="f.name" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ name: $event })" />
              @if (fieldError('name')) { <p class="app-error" role="alert" data-testid="printer-name-error">{{ fieldError('name') }}</p> }</div>
            <div><label class="app-label" for="pr-branch">Where</label>
              <zp-search-select inputId="pr-branch" testId="printer-branch" [emptyLabel]="everyBranch() ? 'Every branch' : null" noun="branch" placeholder="Search branches"
                                [options]="branchOptions()" [value]="f.branchId ?? ''" (valueChange)="patch({ branchId: $event || null })" /></div>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div><label class="app-label" for="pr-kind">How the phone reaches it</label>
              <select id="pr-kind" class="app-input" data-testid="printer-kind" [ngModel]="f.kind" [ngModelOptions]="{ standalone: true }" (ngModelChange)="chooseKind($event)">
                @for (k of kinds; track k.value) { <option [value]="k.value">{{ k.label }}</option> }
              </select></div>
            <div><label class="app-label" for="pr-lang">Language it speaks</label>
              <select id="pr-lang" class="app-input" data-testid="printer-language" [disabled]="f.kind === 'Handheld'" [ngModel]="f.language" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ language: $event })">
                @for (l of languages; track l.value) { <option [value]="l.value">{{ l.label }}</option> }
              </select>
              @if (fieldError('language')) { <p class="app-error" role="alert" data-testid="printer-language-error">{{ fieldError('language') }}</p> }</div>
          </div>

          @if (f.kind === 'Network') {
            <div class="grid gap-3 sm:grid-cols-3">
              <div class="sm:col-span-2"><label class="app-label" for="pr-host">Printer address</label><input id="pr-host" class="app-input" maxlength="255" data-testid="printer-host" placeholder="e.g. 192.168.1.50" [ngModel]="f.host" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ host: $event })" />
                @if (fieldError('host')) { <p class="app-error" role="alert" data-testid="printer-host-error">{{ fieldError('host') }}</p> }</div>
              <div><label class="app-label" for="pr-port">Port</label><input id="pr-port" type="number" min="1" max="65535" class="app-input" data-testid="printer-port" placeholder="9100" [ngModel]="f.port" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ port: $event ? +$event : null })" />
                @if (fieldError('port')) { <p class="app-error" role="alert" data-testid="printer-port-error">{{ fieldError('port') }}</p> }</div>
            </div>
            <p class="-mt-1 text-xs text-ink/70">The phone connects to this address from inside the shop, so it must be the printer's address on the shop network. Give the printer a fixed address in your router so it does not change.</p>
          }
          @if (f.kind === 'Bluetooth') {
            <div><label class="app-label" for="pr-device">Name of the printer in the phone's Bluetooth list (optional)</label><input id="pr-device" class="app-input" maxlength="80" data-testid="printer-device" placeholder="e.g. BT-58-01" [ngModel]="f.deviceName" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ deviceName: $event })" /></div>
            <p class="-mt-1 text-xs text-ink/70">Each phone pairs the printer in its own Bluetooth settings and then chooses it in the ZestPoint app. The name only helps the phone find the right one.</p>
          }
          @if (f.kind === 'Handheld') {
            <div><label class="app-label" for="pr-make">Whose handheld</label>
              <select id="pr-make" class="app-input" data-testid="printer-make" [ngModel]="f.handheldMake ?? ''" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ handheldMake: $event || null })">
                <option value="">Choose...</option><option value="Sunmi">Sunmi (V2, V2s, T2 and similar)</option>
              </select>
              @if (fieldError('handheldMake')) { <p class="app-error" role="alert" data-testid="printer-make-error">{{ fieldError('handheldMake') }}</p> }</div>
            <p class="-mt-1 text-xs text-ink/70">Used by phones that are the handheld itself. A phone that is not one cannot print here.</p>
          }

          <fieldset>
            <legend class="app-label">What it prints</legend>
            <div class="grid gap-1 sm:grid-cols-2">
              @for (p of purposeChoices; track p.value) {
                <label class="flex items-start gap-2 text-sm"><input type="checkbox" class="mt-1" [attr.data-testid]="'printer-purpose-' + p.value" [checked]="f.purposes.includes(p.value)" (change)="togglePurpose(p.value)" />
                  <span><strong>{{ p.label }}.</strong> {{ p.hint }}</span></label>
              }
            </div>
            @if (fieldError('purposes')) { <p class="app-error" role="alert" data-testid="printer-purposes-error">{{ fieldError('purposes') }}</p> }
          </fieldset>
          @if (f.purposes.includes('Kitchen')) {
            <fieldset data-testid="printer-stations">
              <legend class="app-label">Print the tickets of these stations</legend>
              @if (stations.list().length === 0) {
                <p class="text-sm text-ink/70" data-testid="printer-stations-none">This company has no stations yet. Stations are the bar, the kitchen, the grill: add them under Set-up, Stations, and then choose them here.</p>
              } @else {
                <div class="grid gap-1 sm:grid-cols-2">
                  @for (st of stations.list(); track st.id) {
                    <label class="flex items-center gap-2 text-sm"><input type="checkbox" [attr.data-testid]="'printer-station-' + st.name" [checked]="f.stationIds.includes(st.id)" (change)="toggleStation(st.id)" /> {{ st.name }}</label>
                  }
                </div>
                <p class="mt-1 text-xs text-ink/70">A waiter's phone prints a station's ticket on a printer at its branch that lists the station here. A station no printer lists prints nothing, and the phone says so.</p>
              }
              @if (fieldError('stationIds')) { <p class="app-error" role="alert" data-testid="printer-stations-error">{{ fieldError('stationIds') }}</p> }
            </fieldset>
          }

          <div class="grid gap-3 sm:grid-cols-2">
            @if (labelsOnly()) {
              <div><label class="app-label" for="pr-paper">Label width (mm)</label><input id="pr-paper" type="number" min="20" max="110" step="1" class="app-input" data-testid="printer-paper" [ngModel]="f.paperWidthMm" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ paperWidthMm: +$event || 0 })" />
                @if (fieldError('paperWidthMm')) { <p class="app-error" role="alert" data-testid="printer-paper-error">{{ fieldError('paperWidthMm') }}</p> }</div>
            } @else {
              <div><label class="app-label" for="pr-paper">Paper width</label>
                <select id="pr-paper" class="app-input" data-testid="printer-paper" [ngModel]="f.paperWidthMm" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ paperWidthMm: +$event })">
                  <option [ngValue]="58">58 mm (narrow)</option><option [ngValue]="80">80 mm (wide)</option>
                </select>
                @if (fieldError('paperWidthMm')) { <p class="app-error" role="alert" data-testid="printer-paper-error">{{ fieldError('paperWidthMm') }}</p> }</div>
            }
            @if (f.purposes.includes('Labels')) {
              <div><label class="app-label" for="pr-height">Label height (mm){{ f.language === 'EscPos' ? ' (optional)' : '' }}</label><input id="pr-height" type="number" min="10" max="200" step="1" class="app-input" data-testid="printer-label-height" [ngModel]="f.labelHeightMm" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ labelHeightMm: $event ? +$event : null })" />
                @if (fieldError('labelHeightMm')) { <p class="app-error" role="alert" data-testid="printer-label-height-error">{{ fieldError('labelHeightMm') }}</p> }</div>
            }
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div><label class="app-label" for="pr-order">Order (lowest first)</label><input id="pr-order" type="number" min="0" max="100000" step="1" class="app-input" data-testid="printer-order" [ngModel]="f.sortOrder" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ sortOrder: +$event || 0 })" />
              <p class="mt-1 text-xs text-ink/70">A phone uses the first printer in use at its branch that is for what it is printing.</p></div>
            <div><label class="app-label" for="pr-notes">Notes (optional)</label><input id="pr-notes" class="app-input" maxlength="300" data-testid="printer-notes" placeholder="e.g. Behind the bar" [ngModel]="f.notes" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ notes: $event })" /></div>
          </div>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" data-testid="printer-active" [checked]="f.isActive" (change)="patch({ isActive: !f.isActive })" /> In use (untick to switch the printer off; it is never deleted)</label>
          @if (dialogError()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="printer-error">{{ dialogError() }}</p> }
          <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="form.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="printer-save" [disabled]="busy()">{{ busy() ? 'Saving...' : 'Save' }}</button></div>
        </form>
      }
    </zp-dialog>
  `
})
export class PrintersComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  protected readonly branches = inject(BranchContextService);
  protected readonly branchOptions = computed<readonly SelectOption[]>(() => this.branches.branches().map((b) => ({ value: b.id, label: b.name })));
  protected readonly stations = inject(StationsService);

  protected readonly kinds = KINDS;
  protected readonly languages = LANGUAGES;
  protected readonly purposeChoices = PURPOSES;

  protected readonly printers = signal<readonly PrinterDto[]>([]);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly dialogError = signal<string | null>(null);
  protected readonly fieldErrors = signal<Readonly<Record<string, readonly string[]>>>({});
  protected readonly form = signal<PrinterForm | null>(null);

  protected readonly readOnly = computed(() => this.auth.accessModeFor(FEATURES.CORE_POS) === 'readonly');
  protected readonly activeCount = computed(() => this.printers().filter((p) => p.isActive).length);
  protected readonly editingName = computed(() => this.printers().find((p) => p.id === this.form()?.id)?.name ?? '');
  /** Only someone who works at every branch may set a printer up for every branch (the server checks it too). */
  protected readonly everyBranch = computed(() => !!this.auth.session()?.hasAllBranches);
  protected readonly labelsOnly = computed(() => { const p = this.form()?.purposes ?? []; return p.length > 0 && p.every((x) => x === 'Labels'); });

  ngOnInit(): void { void this.branches.load(); void this.stations.load(); void this.load(); }

  protected fieldError = (name: string): string | null => this.fieldErrors()[name]?.[0] ?? null;
  protected patch(p: Partial<PrinterForm>): void { this.form.update((f) => (f ? { ...f, ...p } : f)); }

  protected languageName = (l: PrinterLanguage): string => ({ EscPos: 'ESC/POS', Tspl: 'TSPL', Zpl: 'ZPL' })[l];
  protected purposeNames = (p: PrinterDto): string => p.purposes.map((x) => {
    const label = PURPOSES.find((c) => c.value === x)?.label ?? x;
    if (x !== 'Kitchen') return label;
    // The stations it prints the tickets of, by name; none chosen is said, because then nothing prints on it.
    const names = (p.stationIds ?? []).map((id) => this.stations.list().find((st) => st.id === id)?.name).filter((n): n is string => !!n);
    return names.length ? `${label} (${names.join(', ')})` : `${label} (no station chosen)`;
  }).join(', ');
  protected connection(p: PrinterDto): string {
    if (p.kind === 'Network') return `${p.host}:${p.port ?? 9100}`;
    if (p.kind === 'Bluetooth') return p.deviceName ? `Bluetooth: ${p.deviceName}` : 'Bluetooth';
    return `Handheld (${p.handheldMake ?? ''})`;
  }
  protected paper(p: PrinterDto): string {
    const labels = p.purposes.length > 0 && p.purposes.every((x) => x === 'Labels');
    return labels && p.labelHeightMm ? `${p.paperWidthMm} x ${p.labelHeightMm} mm label` : `${p.paperWidthMm} mm`;
  }

  /** Choosing how it is reached sets what goes with it: a handheld's own printer speaks ESC/POS and is Sunmi's (the only one built). */
  protected chooseKind(kind: PrinterKind): void {
    this.patch(kind === 'Handheld' ? { kind, language: 'EscPos', handheldMake: 'Sunmi', purposes: (this.form()?.purposes ?? []).filter((x) => x !== 'Labels') } : { kind });
  }

  protected toggleStation(id: string): void {
    const f = this.form();
    if (!f) return;
    this.patch({ stationIds: f.stationIds.includes(id) ? f.stationIds.filter((x) => x !== id) : [...f.stationIds, id] });
  }

  protected togglePurpose(p: PrinterPurpose): void {
    const f = this.form();
    if (!f) return;
    const has = f.purposes.includes(p);
    const purposes = has ? f.purposes.filter((x) => x !== p) : [...f.purposes, p];
    // A paper width of a receipt is 58 or 80: moving from a label's width to receipts puts it back to one of them.
    const receiptLike = purposes.some((x) => x !== 'Labels');
    this.patch({ purposes, ...(receiptLike && f.paperWidthMm !== 58 && f.paperWidthMm !== 80 ? { paperWidthMm: 58 } : {}) });
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try { this.printers.set(await firstValueFrom(this.http.get<ApiEnvelope<PrinterDto[]>>('/api/v1/printers').pipe(unwrap()))); }
    catch (err) { this.error.set(toApiError(err).message); }
    finally { this.loading.set(false); }
  }

  protected open(p: PrinterDto | null): void {
    this.dialogError.set(null);
    this.fieldErrors.set({});
    this.form.set(p
      ? { id: p.id, branchId: p.branchId, name: p.name, kind: p.kind, language: p.language, host: p.host ?? '', port: p.port, deviceName: p.deviceName ?? '', handheldMake: p.handheldMake, paperWidthMm: p.paperWidthMm, labelHeightMm: p.labelHeightMm, purposes: [...p.purposes], stationIds: [...(p.stationIds ?? [])], isActive: p.isActive, sortOrder: p.sortOrder, notes: p.notes ?? '' }
      : { id: null, branchId: this.everyBranch() ? (this.branches.activeId() ?? null) : (this.branches.activeId() ?? this.branches.branches()[0]?.id ?? null), name: '', kind: 'Network', language: 'EscPos', host: '', port: null, deviceName: '', handheldMake: null, paperWidthMm: 58, labelHeightMm: null, purposes: ['Receipts'], stationIds: [], isActive: true, sortOrder: this.printers().length, notes: '' });
  }

  protected async save(): Promise<void> {
    const f = this.form();
    if (!f || this.busy()) return;
    if (!f.name.trim()) { this.fieldErrors.set({ name: ['Type the printer\'s name.'] }); return; }
    this.busy.set(true);
    this.dialogError.set(null);
    this.fieldErrors.set({});
    const body = {
      branchId: f.branchId, name: f.name.trim(), kind: f.kind, language: f.language,
      host: f.kind === 'Network' ? f.host.trim() : null, port: f.kind === 'Network' ? f.port : null, deviceName: f.kind === 'Bluetooth' ? f.deviceName.trim() || null : null,
      handheldMake: f.kind === 'Handheld' ? f.handheldMake : null, paperWidthMm: f.paperWidthMm, labelHeightMm: f.purposes.includes('Labels') ? f.labelHeightMm : null,
      purposes: f.purposes, stationIds: f.purposes.includes('Kitchen') ? f.stationIds : [], isActive: f.isActive, sortOrder: f.sortOrder, notes: f.notes.trim() || null
    };
    try {
      await firstValueFrom((f.id ? this.http.put<ApiEnvelope<PrinterDto>>(`/api/v1/printers/${f.id}`, body) : this.http.post<ApiEnvelope<PrinterDto>>('/api/v1/printers', body)).pipe(unwrap()));
      this.form.set(null);
      this.toast.success(f.id ? 'Printer saved.' : 'Printer added.');
      await this.load();
    } catch (err) {
      const e = toApiError(err);
      this.fieldErrors.set(e.fieldErrors);
      if (!Object.keys(e.fieldErrors).length) this.dialogError.set(e.message);
    } finally { this.busy.set(false); }
  }
}
