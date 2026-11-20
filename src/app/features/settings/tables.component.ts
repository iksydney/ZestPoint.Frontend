import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiEnvelope } from '../../core/models/api.model';
import { TableDto } from '../../core/models/ops.model';
import { FEATURES } from '../../core/models/rbac.model';
import { toApiError, unwrap } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { BranchContextService } from '../../core/services/branch-context.service';
import { printTableStickers, tableLink, tableQr } from '../../core/receipt/table-qr';
import { TableOrdersApi } from '../../core/services/table-ordering.service';
import { tableWording } from '../../core/table-wording';
import { DialogComponent, ToastService } from '../../shared/ui/feedback';
import { DomSanitizer } from '@angular/platform-browser';
import { BranchPickerComponent } from '../../shared/ui/ops-chrome.components';

interface TableForm { id: string | null; name: string; area: string; seats: number; isActive: boolean; sortOrder: number }

/**
 * Tables (owner's decision, 2026-11-15): the list of tables at a branch. The till offers them when a table bill is opened and shows
 * which have a bill running. A table is switched off, never deleted, so old bills keep their table. The server decides who may
 * change the list and refuses a second table with the same name at a branch.
 */
@Component({
    selector: 'zp-tables',
    imports: [FormsModule, BranchPickerComponent, DialogComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="flex flex-col gap-4" data-testid="tables">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div><h1 class="text-2xl font-bold">Tables</h1><p class="text-sm text-ink/70">The tables at this branch. The till offers them when you open a table bill, and shows which have a bill running.</p></div>
        <zp-branch-picker />
      </div>
      @if (error()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="tables-error">{{ error() }}</p> }
      @if (!branches.activeId()) { <p class="sys-alert sys-alert-warning" role="status">You are not assigned to a branch yet.</p> }
      @if (readOnly()) { <p class="sys-alert sys-alert-info" role="status">Your subscription is read-only: tables can be seen but not changed.</p> }

      <section class="app-card overflow-hidden p-0" aria-label="Tables at this branch">
        <div class="flex flex-wrap items-center justify-between gap-2 bg-ink/5 px-4 py-2">
          <h2 class="text-lg font-semibold">{{ branches.active()?.name ?? 'This branch' }}: {{ activeCount() }} in use</h2>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-outline" data-testid="table-qr-all" [disabled]="!branches.activeId() || activeCount() === 0 || busy()" (click)="printAll()">Print all QR codes</button>
            <button type="button" class="btn-outline" data-testid="table-many" [disabled]="readOnly() || !branches.activeId()" (click)="openMany()">Add several</button>
            <button type="button" class="btn-primary" data-testid="table-new" [disabled]="readOnly() || !branches.activeId()" (click)="open(null)">Add a table</button>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="app-table min-w-[34rem]" data-testid="table-list">
            <caption class="sr-only">Tables at this branch</caption>
            <thead><tr><th>Name</th><th>Area</th><th class="text-right">Seats</th><th>Now</th><th>Status</th><th></th></tr></thead>
            <tbody>
              @for (t of tables(); track t.id) {
                <tr [attr.data-testid]="'table-row-' + t.name" [class.opacity-60]="!t.isActive">
                  <td class="font-semibold">{{ t.name }}</td><td>{{ t.area }}</td><td class="text-right">{{ t.seats || '' }}</td>
                  <td>@if (t.openBills) { <span class="app-badge app-badge-warning">{{ t.openBills }} bill{{ t.openBills === 1 ? '' : 's' }} open</span> } @else { <span class="text-ink/60">Free</span> }</td>
                  <td>{{ t.isActive ? 'In use' : 'Switched off' }}</td>
                  <td class="text-right"><button type="button" class="btn-ghost text-sm" [attr.data-testid]="'table-qr-' + t.name" [disabled]="!t.isActive" (click)="showQr(t)">QR code</button> <button type="button" class="btn-ghost text-sm" [attr.data-testid]="'table-edit-' + t.name" [disabled]="readOnly()" (click)="open(t)">Edit</button></td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="py-8 text-center text-ink/70" data-testid="tables-empty">{{ loading() ? 'Loading...' : 'No tables yet. Without a list, staff type the table name when they open a bill.' }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <zp-dialog [open]="!!form()" [title]="form()?.id ? tableWording(editingName()) : 'Add a table'" (closed)="form.set(null)">
      @if (form(); as f) {
        <form class="space-y-3" (submit)="$event.preventDefault(); save()" data-testid="table-form">
          <div><label class="app-label" for="tb-name">Name or number</label><input id="tb-name" class="app-input" maxlength="60" data-testid="table-name" placeholder="e.g. 12 or VIP 1" [ngModel]="f.name" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ name: $event })" />
            @if (fieldError('name')) { <p class="app-error" role="alert" data-testid="table-name-error">{{ fieldError('name') }}</p> }</div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div><label class="app-label" for="tb-area">Area (optional)</label><input id="tb-area" class="app-input" maxlength="60" data-testid="table-area" placeholder="e.g. Terrace" list="tb-areas" [ngModel]="f.area" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ area: $event })" />
              <datalist id="tb-areas">@for (a of areas(); track a) { <option [value]="a"></option> }</datalist></div>
            <div><label class="app-label" for="tb-seats">Seats (optional)</label><input id="tb-seats" type="number" min="0" max="500" step="1" class="app-input" data-testid="table-seats" [ngModel]="f.seats" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ seats: +$event || 0 })" /></div>
          </div>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" data-testid="table-active" [checked]="f.isActive" (change)="patch({ isActive: !f.isActive })" /> In use (untick to switch the table off; it is never deleted)</label>
          @if (dialogError()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="table-error">{{ dialogError() }}</p> }
          <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="form.set(null)">Cancel</button><button type="submit" class="btn-primary" data-testid="table-save" [disabled]="busy()">{{ busy() ? 'Saving...' : 'Save' }}</button></div>
        </form>
      }
    </zp-dialog>

    <!-- The table's sticker -->
    <zp-dialog [open]="!!qr()" [title]="'QR code for table ' + (qr()?.name ?? '')" (closed)="closeQr()">
      @if (qr(); as q) {
        <div class="space-y-3" data-testid="table-qr">
          <p class="text-sm text-ink/80">Stick this on the table. A customer who scans it sees your menu and can order, call a waiter or ask for the bill, with no app and no sign-in. Anyone with the code can order for this table, so if a sticker is copied or photographed, make a new code: the old sticker stops working.</p>
          @if (!ordering()) { <p class="sys-alert sys-alert-warning" role="status" data-testid="table-qr-plan">Your plan does not include Table ordering, so the page this opens will say ordering is not available.</p> }
          <div class="mx-auto h-48 w-48 rounded bg-white p-2" data-testid="table-qr-image" [innerHTML]="qrSvg()" role="img" [attr.aria-label]="'QR code for table ' + q.name"></div>
          <p class="break-all text-center font-mono text-xs" data-testid="table-qr-link">{{ link() }}</p>
          @if (dialogError()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="table-qr-error">{{ dialogError() }}</p> }
          <div class="flex flex-wrap justify-end gap-2">
            @if (confirmNew()) {
              <span class="self-center text-sm">The old sticker will stop working.</span>
              <button type="button" class="btn-ghost" (click)="confirmNew.set(false)">Keep this code</button>
              <button type="button" class="btn-primary" data-testid="table-qr-new-confirm" [disabled]="busy()" (click)="newCode()">Make a new code</button>
            } @else {
              <button type="button" class="btn-outline" data-testid="table-qr-new" [disabled]="readOnly()" (click)="confirmNew.set(true)">Make a new code</button>
              <button type="button" class="btn-primary" data-testid="table-qr-print" (click)="printOne()">Print the sticker</button>
            }
          </div>
        </div>
      }
    </zp-dialog>

    <!-- Several at once: "Table 1" to "Table 20" in one go -->
    <zp-dialog [open]="many()" title="Add several tables" (closed)="many.set(false)">
      <form class="space-y-3" (submit)="$event.preventDefault(); saveMany()" data-testid="table-many-form">
        <p class="text-sm text-ink/80">Makes numbered tables in one go. Names already used at this branch are skipped.</p>
        <div class="grid gap-3 sm:grid-cols-3">
          <div><label class="app-label" for="tm-prefix">Name before the number</label><input id="tm-prefix" class="app-input" maxlength="40" data-testid="many-prefix" placeholder="e.g. Table" [ngModel]="manyPrefix()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="manyPrefix.set($event)" /></div>
          <div><label class="app-label" for="tm-from">From</label><input id="tm-from" type="number" min="1" step="1" class="app-input" data-testid="many-from" [ngModel]="manyFrom()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="manyFrom.set(+$event || 1)" /></div>
          <div><label class="app-label" for="tm-to">To</label><input id="tm-to" type="number" min="1" step="1" class="app-input" data-testid="many-to" [ngModel]="manyTo()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="manyTo.set(+$event || 1)" /></div>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div><label class="app-label" for="tm-area">Area (optional)</label><input id="tm-area" class="app-input" maxlength="60" data-testid="many-area" list="tb-areas-many" [ngModel]="manyArea()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="manyArea.set($event)" />
            <datalist id="tb-areas-many">@for (a of areas(); track a) { <option [value]="a"></option> }</datalist></div>
          <div><label class="app-label" for="tm-seats">Seats each (optional)</label><input id="tm-seats" type="number" min="0" max="500" step="1" class="app-input" data-testid="many-seats" [ngModel]="manySeats()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="manySeats.set(+$event || 0)" /></div>
        </div>
        <p class="text-sm" role="status" data-testid="many-preview">{{ manyNames().length ? manyNames().length + ' table(s): ' + manyNames()[0] + (manyNames().length > 1 ? ' to ' + manyNames()[manyNames().length - 1] : '') : 'From must not be more than To, and at most 200 at a time.' }}</p>
        @if (dialogError()) { <p class="sys-alert sys-alert-danger" role="alert">{{ dialogError() }}</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="many.set(false)">Cancel</button><button type="submit" class="btn-primary" data-testid="many-save" [disabled]="busy() || !manyNames().length">{{ busy() ? 'Adding...' : 'Add' }}</button></div>
      </form>
    </zp-dialog>
  `
})
export class TablesComponent {
  protected readonly tableWording = tableWording;
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  protected readonly branches = inject(BranchContextService);

  protected readonly tables = signal<readonly TableDto[]>([]);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly dialogError = signal<string | null>(null);
  protected readonly fieldErrors = signal<Readonly<Record<string, readonly string[]>>>({});
  protected readonly form = signal<TableForm | null>(null);

  private readonly orders = inject(TableOrdersApi);
  private readonly sanitizer = inject(DomSanitizer);
  /** The table whose sticker is open: its code is read when the box opens and is gone when it closes. */
  protected readonly qr = signal<{ id: string; name: string; area: string | null; code: string } | null>(null);
  protected readonly confirmNew = signal(false);
  protected readonly ordering = computed(() => this.auth.accessModeFor(FEATURES.TABLE_ORDERING) === 'full');
  protected readonly link = computed(() => { const q = this.qr(); return q ? tableLink(q.code) : ''; });
  protected readonly qrSvg = computed(() => { const q = this.qr(); return q ? this.sanitizer.bypassSecurityTrustHtml(tableQr(q.code)) : ''; });

  protected readonly many = signal(false);
  protected readonly manyPrefix = signal('Table');
  protected readonly manyFrom = signal(1);
  protected readonly manyTo = signal(10);
  protected readonly manyArea = signal('');
  protected readonly manySeats = signal(4);

  protected readonly readOnly = computed(() => this.auth.accessModeFor(FEATURES.CORE_POS) === 'readonly');
  protected readonly activeCount = computed(() => this.tables().filter((t) => t.isActive).length);
  protected readonly areas = computed(() => [...new Set(this.tables().map((t) => t.area).filter((a): a is string => !!a))].sort());
  protected readonly editingName = computed(() => this.tables().find((t) => t.id === this.form()?.id)?.name ?? '');
  protected readonly manyNames = computed(() => {
    const from = Math.floor(this.manyFrom());
    const to = Math.floor(this.manyTo());
    if (from < 1 || to < from || to - from >= 200) return [];
    const prefix = this.manyPrefix().trim();
    return Array.from({ length: to - from + 1 }, (_, i) => (prefix ? `${prefix} ${from + i}` : String(from + i)));
  });

  constructor() {
    void this.branches.load();
    // The list belongs to the branch chosen at the top: it is read again when that changes.
    effect(() => {
      const branch = this.branches.activeId();
      untracked(() => void this.load(branch));
    }, { allowSignalWrites: true });
  }

  protected fieldError = (name: string): string | null => this.fieldErrors()[name]?.[0] ?? null;
  protected patch(p: Partial<TableForm>): void { this.form.update((f) => (f ? { ...f, ...p } : f)); }

  private async load(branchId: string | null): Promise<void> {
    if (!branchId) { this.tables.set([]); return; }
    this.loading.set(true);
    this.error.set(null);
    try { this.tables.set(await firstValueFrom(this.http.get<ApiEnvelope<TableDto[]>>('/api/v1/tables', { params: { branchId } }).pipe(unwrap()))); }
    catch (err) { this.error.set(toApiError(err).message); }
    finally { this.loading.set(false); }
  }

  protected open(t: TableDto | null): void {
    this.dialogError.set(null);
    this.fieldErrors.set({});
    this.form.set(t ? { id: t.id, name: t.name, area: t.area ?? '', seats: t.seats, isActive: t.isActive, sortOrder: t.sortOrder }
      : { id: null, name: '', area: '', seats: 4, isActive: true, sortOrder: this.tables().length });
  }

  protected async showQr(t: TableDto): Promise<void> {
    this.dialogError.set(null);
    this.confirmNew.set(false);
    try {
      const q = await firstValueFrom(this.orders.qr(t.id));
      this.qr.set({ id: t.id, name: t.name, area: t.area, code: q.code });
    } catch (err) { this.error.set(toApiError(err).message); }
  }

  protected closeQr(): void {
    this.qr.set(null);
    this.confirmNew.set(false);
  }

  protected printOne(): void {
    const q = this.qr();
    if (q) printTableStickers(this.auth.branding()?.companyName ?? '', [{ name: q.name, area: q.area, code: q.code }]);
  }

  /** One sticker per table in use, on a sheet to print. Each code is asked for (and so recorded) once. */
  protected async printAll(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const stickers = [];
      for (const t of this.tables().filter((x) => x.isActive)) {
        const q = await firstValueFrom(this.orders.qr(t.id));
        stickers.push({ name: t.name, area: t.area, code: q.code });
      }
      printTableStickers(this.auth.branding()?.companyName ?? '', stickers);
    } catch (err) { this.error.set(toApiError(err).message); }
    finally { this.busy.set(false); }
  }

  protected async newCode(): Promise<void> {
    const q = this.qr();
    if (!q || this.busy()) return;
    this.busy.set(true);
    this.dialogError.set(null);
    try {
      await firstValueFrom(this.orders.newCode(q.id));
      const fresh = await firstValueFrom(this.orders.qr(q.id));
      this.qr.set({ ...q, code: fresh.code });
      this.confirmNew.set(false);
      this.toast.success('The table has a new code. Its old sticker no longer works.');
    } catch (err) { this.dialogError.set(toApiError(err).message); }
    finally { this.busy.set(false); }
  }

  protected openMany(): void {
    this.dialogError.set(null);
    this.many.set(true);
  }

  private body(f: TableForm, branchId: string) {
    return { branchId, name: f.name.trim(), area: f.area.trim() || null, seats: Math.max(0, Math.floor(f.seats || 0)), isActive: f.isActive, sortOrder: f.sortOrder };
  }

  protected async save(): Promise<void> {
    const f = this.form();
    const branchId = this.branches.activeId();
    if (!f || !branchId || this.busy()) return;
    if (!f.name.trim()) { this.fieldErrors.set({ name: ['Type the table\'s name or number.'] }); return; }
    this.busy.set(true);
    this.dialogError.set(null);
    this.fieldErrors.set({});
    try {
      const call = f.id ? this.http.put<ApiEnvelope<TableDto>>(`/api/v1/tables/${f.id}`, this.body(f, branchId)) : this.http.post<ApiEnvelope<TableDto>>('/api/v1/tables', this.body(f, branchId));
      await firstValueFrom(call.pipe(unwrap()));
      this.form.set(null);
      this.toast.success(f.id ? 'Table saved.' : 'Table added.');
      await this.load(branchId);
    } catch (err) {
      const e = toApiError(err);
      this.fieldErrors.set(e.fieldErrors);
      if (!Object.keys(e.fieldErrors).length) this.dialogError.set(e.message);
    } finally { this.busy.set(false); }
  }

  protected async saveMany(): Promise<void> {
    const branchId = this.branches.activeId();
    const names = this.manyNames();
    if (!branchId || !names.length || this.busy()) return;
    this.busy.set(true);
    this.dialogError.set(null);
    const taken = new Set(this.tables().map((t) => t.name.toLowerCase()));
    let added = 0;
    let order = this.tables().length;
    try {
      for (const name of names) {
        if (taken.has(name.toLowerCase())) continue;
        await firstValueFrom(this.http.post<ApiEnvelope<TableDto>>('/api/v1/tables', { branchId, name, area: this.manyArea().trim() || null, seats: Math.max(0, Math.floor(this.manySeats() || 0)), isActive: true, sortOrder: order++ }).pipe(unwrap()));
        added++;
      }
      this.many.set(false);
      this.toast.success(added === names.length ? `${added} table(s) added.` : `${added} table(s) added; ${names.length - added} already existed.`);
    } catch (err) {
      this.dialogError.set(`${added} table(s) were added, then: ${toApiError(err).message}`);
    } finally {
      this.busy.set(false);
      await this.load(branchId);
    }
  }
}
