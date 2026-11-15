import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiEnvelope } from '../../core/models/api.model';
import { StationDto } from '../../core/models/ops.model';
import { FEATURES } from '../../core/models/rbac.model';
import { toApiError, unwrap } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { DialogComponent, ToastService } from '../../shared/ui/feedback';

interface StationForm { id: string | null; name: string; holdsPayment: boolean; stockWhenReady: boolean; isDefault: boolean; isActive: boolean; sortOrder: number; amberMinutes: number; redMinutes: number }

/**
 * Preparation stations (owner's decision, 2026-11-15): the places orders are prepared: the bar, the kitchen, a grill. Each stock group
 * is given a station and one item can name its own; pressing Send makes one ticket per station. Two switches say how a station
 * behaves (hold payment until it is ready; take stock when it is ready or when the bill is sent). The server decides all of it and
 * refuses to change how a station works while it has open tickets.
 */
@Component({
  selector: 'zp-stations',
  standalone: true,
  imports: [FormsModule, DialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4" data-testid="stations">
      <div>
        <h1 class="text-2xl font-bold">Preparation stations</h1>
        <p class="text-sm text-ink/70">Where orders are prepared. Give each stock group a station on the Stock Groups screen (an item can have its own on its stock card), and when someone presses Send, each station gets its own ticket.</p>
      </div>
      @if (error()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="stations-error">{{ error() }}</p> }
      @if (readOnly()) { <p class="sys-alert sys-alert-info" role="status">Your subscription is read-only: stations can be seen but not changed.</p> }
      @if (!loading() && stations().length === 0) {
        <p class="sys-alert sys-alert-info" role="status" data-testid="stations-none">No stations yet. Switch on "Send orders to preparation stations" in Settings and a first one is made for you, or add one here.</p>
      }

      <section class="app-card overflow-hidden p-0" aria-label="Stations">
        <div class="flex items-center justify-between bg-ink/5 px-4 py-2">
          <h2 class="text-lg font-semibold">{{ activeCount() }} in use</h2>
          <button type="button" class="btn-primary" data-testid="station-new" [disabled]="readOnly()" (click)="open(null)">Add a station</button>
        </div>
        <div class="overflow-x-auto">
          <table class="app-table min-w-[40rem]" data-testid="station-list">
            <caption class="sr-only">Preparation stations</caption>
            <thead><tr><th>Name</th><th>Holds payment</th><th>Stock leaves</th><th>Amber / red</th><th class="text-right">Groups</th><th class="text-right">Items</th><th>Status</th><th></th></tr></thead>
            <tbody>
              @for (s of stations(); track s.id) {
                <tr [attr.data-testid]="'station-row-' + s.name" [class.opacity-60]="!s.isActive">
                  <td class="font-semibold">{{ s.name }}@if (s.isDefault) { <span class="app-badge app-badge-primary ml-2" title="Items and groups with no station of their own go here">Default</span> }</td>
                  <td>{{ s.holdsPayment ? 'Until ready' : 'No' }}</td>
                  <td>{{ s.stockWhenReady ? 'When ready' : 'When sent' }}</td>
                  <td class="whitespace-nowrap">{{ s.amberMinutes }} / {{ s.redMinutes }} min</td>
                  <td class="text-right">{{ s.groupCount }}</td><td class="text-right">{{ s.itemCount }}</td>
                  <td>{{ s.isActive ? 'In use' : 'Switched off' }}</td>
                  <td class="text-right"><button type="button" class="btn-ghost text-sm" [attr.data-testid]="'station-edit-' + s.name" [disabled]="readOnly()" (click)="open(s)">Edit</button></td>
                </tr>
              } @empty { <tr><td colspan="8" class="py-8 text-center text-ink/70">{{ loading() ? 'Loading...' : '' }}</td></tr> }
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <zp-dialog [open]="!!form()" [title]="form()?.id ? 'Station ' + editingName() : 'Add a station'" (closed)="form.set(null)">
      @if (form(); as f) {
        <form class="space-y-3" (submit)="$event.preventDefault(); save()" data-testid="station-form">
          <div><label class="app-label" for="st-name">Name</label><input id="st-name" class="app-input" maxlength="60" data-testid="station-name" placeholder="e.g. Kitchen, Grill, Pastry" [ngModel]="f.name" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ name: $event })" />
            @if (fieldError('name')) { <p class="app-error" role="alert" data-testid="station-name-error">{{ fieldError('name') }}</p> }</div>
          <label class="flex items-start gap-2 text-sm"><input type="checkbox" class="mt-1" data-testid="station-holds" [checked]="f.holdsPayment" (change)="patch({ holdsPayment: !f.holdsPayment })" />
            <span><strong>The bill waits for this station.</strong> It cannot be paid until the station has marked its items ready. A bar usually does this; a kitchen usually does not, so a bill can be paid while the food is cooking.</span></label>
          <label class="flex items-start gap-2 text-sm"><input type="checkbox" class="mt-1" data-testid="station-stock" [checked]="f.stockWhenReady" (change)="patch({ stockWhenReady: !f.stockWhenReady })" />
            <span><strong>Stock leaves when it is ready.</strong> Untick it and stock leaves when the bill is sent. Then an item the station cannot make is taken off the bill with a void, which gives the stock back.</span></label>
          <label class="flex items-start gap-2 text-sm"><input type="checkbox" class="mt-1" data-testid="station-default" [checked]="f.isDefault" (change)="patch({ isDefault: !f.isDefault })" />
            <span><strong>The default.</strong> Items and groups with no station of their own are prepared here. Without a default they are not sent anywhere.</span></label>
          <div class="grid gap-3 sm:grid-cols-2">
            <div><label class="app-label" for="st-amber">Amber after (minutes)</label><input id="st-amber" type="number" min="1" max="240" step="1" class="app-input" data-testid="station-amber" [ngModel]="f.amberMinutes" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ amberMinutes: +$event || 1 })" /></div>
            <div><label class="app-label" for="st-red">Red after (minutes)</label><input id="st-red" type="number" min="1" max="240" step="1" class="app-input" data-testid="station-red" [ngModel]="f.redMinutes" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ redMinutes: +$event || 1 })" />
              @if (fieldError('redMinutes')) { <p class="app-error" role="alert" data-testid="station-red-error">{{ fieldError('redMinutes') }}</p> }</div>
          </div>
          <p class="-mt-1 text-xs text-ink/70">On the kitchen display a ticket turns amber, then red, after waiting this long since it was sent.</p>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" data-testid="station-active" [checked]="f.isActive" (change)="patch({ isActive: !f.isActive })" /> In use (a station is never deleted)</label>
          @if (dialogError()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="station-error">{{ dialogError() }}</p> }
          <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="form.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="station-save" [disabled]="busy()">{{ busy() ? 'Saving...' : 'Save' }}</button></div>
        </form>
      }
    </zp-dialog>
  `
})
export class StationsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly stations = signal<readonly StationDto[]>([]);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly dialogError = signal<string | null>(null);
  protected readonly fieldErrors = signal<Readonly<Record<string, readonly string[]>>>({});
  protected readonly form = signal<StationForm | null>(null);

  protected readonly readOnly = computed(() => this.auth.accessModeFor(FEATURES.CORE_POS) === 'readonly');
  protected readonly activeCount = computed(() => this.stations().filter((s) => s.isActive).length);
  protected readonly editingName = computed(() => this.stations().find((s) => s.id === this.form()?.id)?.name ?? '');

  ngOnInit(): void { void this.load(); }

  protected fieldError = (name: string): string | null => this.fieldErrors()[name]?.[0] ?? null;
  protected patch(p: Partial<StationForm>): void { this.form.update((f) => (f ? { ...f, ...p } : f)); }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try { this.stations.set(await firstValueFrom(this.http.get<ApiEnvelope<StationDto[]>>('/api/v1/stations').pipe(unwrap()))); }
    catch (err) { this.error.set(toApiError(err).message); }
    finally { this.loading.set(false); }
  }

  protected open(s: StationDto | null): void {
    this.dialogError.set(null);
    this.fieldErrors.set({});
    this.form.set(s ? { id: s.id, name: s.name, holdsPayment: s.holdsPayment, stockWhenReady: s.stockWhenReady, isDefault: s.isDefault, isActive: s.isActive, sortOrder: s.sortOrder, amberMinutes: s.amberMinutes, redMinutes: s.redMinutes }
      : { id: null, name: '', holdsPayment: false, stockWhenReady: false, isDefault: false, isActive: true, sortOrder: this.stations().length, amberMinutes: 10, redMinutes: 20 });
  }

  protected async save(): Promise<void> {
    const f = this.form();
    if (!f || this.busy()) return;
    if (!f.name.trim()) { this.fieldErrors.set({ name: ['Type the station\'s name.'] }); return; }
    this.busy.set(true);
    this.dialogError.set(null);
    this.fieldErrors.set({});
    const body = { name: f.name.trim(), holdsPayment: f.holdsPayment, stockWhenReady: f.stockWhenReady, isDefault: f.isDefault, isActive: f.isActive, sortOrder: f.sortOrder, amberMinutes: f.amberMinutes, redMinutes: f.redMinutes };
    try {
      await firstValueFrom((f.id ? this.http.put<ApiEnvelope<StationDto>>(`/api/v1/stations/${f.id}`, body) : this.http.post<ApiEnvelope<StationDto>>('/api/v1/stations', body)).pipe(unwrap()));
      this.form.set(null);
      this.toast.success(f.id ? 'Station saved.' : 'Station added.');
      await this.load();
    } catch (err) {
      const e = toApiError(err);
      this.fieldErrors.set(e.fieldErrors);
      if (!Object.keys(e.fieldErrors).length) this.dialogError.set(e.message);
    } finally { this.busy.set(false); }
  }
}
