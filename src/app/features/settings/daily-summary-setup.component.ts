import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiEnvelope } from '../../core/models/api.model';
import { DailySummarySettingsDto, SaveSummaryRecipientRequest, SummaryRecipientDto } from '../../core/models/daily-summary.model';
import { toApiError, unwrap } from '../../core/services/api.util';
import { BranchContextService } from '../../core/services/branch-context.service';
import { DailySummaryApi } from '../../core/services/daily-summary.service';
import { ConfirmService, ToastService } from '../../shared/ui/feedback';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';

interface Form { id: string | null; kind: 'staff' | 'outside'; membershipId: string; name: string; email: string; phone: string; inApp: boolean; email_: boolean; sms: boolean; whatsApp: boolean; branchId: string; active: boolean }

const blank = (): Form => ({ id: null, kind: 'staff', membershipId: '', name: '', email: '', phone: '', inApp: true, email_: true, sms: false, whatsApp: false, branchId: '', active: true });
const timeOf = (minute: number): string => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const minuteOf = (time: string): number => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const yesterday = (): string => { const d = new Date(Date.now() - 86_400_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/**
 * Daily Summary set-up: whether it is on, when it goes (the company's time, each morning for the day before), and who gets it by which ways: a member of staff
 * or anyone with an e-mail address or a number, for every branch or one. A way that is not available on this server says so beside its box. The server checks
 * all of it and refuses a recipient with no way to reach them.
 */
@Component({
    selector: 'zp-daily-summary-setup',
    imports: [FormsModule, StatusBadgeComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="mb-3">
      <h1 class="text-2xl font-bold" data-testid="dss-title">Daily Summary set-up</h1>
      <p class="mt-1 max-w-3xl text-sm text-ink/80">Each morning the summary of the day before is built, kept, and sent to the people below.</p>
    </div>
    @if (error()) { <div class="sys-alert sys-alert-danger mb-3" role="alert" data-testid="dss-error">{{ error() }}</div> }

    @if (settings(); as st) {
      <section class="app-card mb-4" aria-label="When" data-testid="dss-when">
        <label class="flex items-center gap-2 text-sm font-medium"><input type="checkbox" data-testid="dss-enabled" [checked]="enabled()" (change)="enabled.set(!enabled())" /> Send the daily summary</label>
        <div class="mt-3 flex flex-wrap items-end gap-3">
          <div><label class="app-label" for="dss-time">Send it at</label><input id="dss-time" type="time" class="app-input" data-testid="dss-time" [value]="time()" (input)="time.set($any($event.target).value)" /></div>
          <span class="pb-2 text-xs text-ink/70">in {{ st.timeZoneId }}, for the day before.</span>
          <button type="button" class="btn-primary" data-testid="dss-save" [disabled]="saving()" (click)="saveWhen()">Save</button>
        </div>
        <p class="mt-2 text-xs text-ink/70" data-testid="dss-last">{{ st.lastBuiltFor ? 'The last day sent was ' + st.lastBuiltFor + '.' : 'Nothing has been sent yet.' }}</p>
        <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-ink/10 pt-3">
          <button type="button" class="btn-outline" data-testid="dss-build" [disabled]="building()" (click)="buildYesterday()">{{ building() ? 'Building...' : 'Build yesterday now' }}</button>
          <span class="text-xs text-ink/70">Builds the summary of a day that has none yet, so you can look at it before the first morning. It is never rebuilt once built.</span>
        </div>
        @if (note()) { <p class="mt-2 text-sm" role="status" data-testid="dss-note">{{ note() }}</p> }
      </section>

      <section class="app-card mb-4 p-0" aria-label="Who gets it">
        <div class="flex items-center justify-between gap-2 px-4 py-3"><h2 class="text-base font-semibold">Who gets it</h2><button type="button" class="btn-primary" data-testid="dss-add" (click)="add()">Add someone</button></div>
        <div class="overflow-x-auto"><table class="app-table" data-testid="dss-table"><caption class="sr-only">Recipients</caption>
          <thead><tr><th>Who</th><th>Branches</th><th>By</th><th></th></tr></thead>
          <tbody>
            @for (r of st.recipients; track r.id) {
              <tr [attr.data-testid]="'dss-row-' + r.name">
                <td>{{ r.name }}<span class="block text-xs text-ink/60">{{ r.membershipId ? 'staff' : (r.email ?? r.phone) }}</span>@if (!r.isActive) { <zp-status-badge tone="warning">Paused</zp-status-badge> }</td>
                <td class="text-sm">{{ r.branchName }}</td>
                <td class="text-sm">{{ ways(r) }}</td>
                <td class="whitespace-nowrap text-right"><button type="button" class="btn-ghost px-2 py-1 text-sm" [attr.data-testid]="'dss-edit-' + r.name" (click)="edit(r)">Change</button><button type="button" class="btn-ghost px-2 py-1 text-sm" [attr.data-testid]="'dss-remove-' + r.name" (click)="remove(r)">Remove</button></td>
              </tr>
            } @empty { <tr><td colspan="4" class="py-6 text-center text-ink/70" data-testid="dss-none">Nobody yet. Add yourself to see what it looks like.</td></tr> }
          </tbody></table></div>
      </section>

      @if (form(); as f) {
        <section class="app-card mb-4" aria-label="Recipient" data-testid="dss-form">
          <h2 class="mb-3 text-base font-semibold">{{ f.id ? 'Change' : 'Add' }} a person</h2>
          <div class="grid gap-3 sm:grid-cols-2">
            @if (!f.id) {
              <div class="sm:col-span-2 flex gap-4 text-sm">
                <label class="flex items-center gap-2"><input type="radio" name="kind" data-testid="dss-kind-staff" [checked]="f.kind === 'staff'" (change)="patch({ kind: 'staff' })" /> Someone who works here</label>
                <label class="flex items-center gap-2"><input type="radio" name="kind" data-testid="dss-kind-outside" [checked]="f.kind === 'outside'" (change)="patch({ kind: 'outside' })" /> Someone else (an owner, an accountant)</label>
              </div>
            }
            @if (f.kind === 'staff') {
              <div class="sm:col-span-2"><label class="app-label" for="dss-staff">Staff member</label>
                <select id="dss-staff" class="app-input" data-testid="dss-staff" [disabled]="!!f.id" [ngModel]="f.membershipId" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ membershipId: $event })">
                  <option value="">Choose...</option>@for (p of people(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }</select></div>
            } @else {
              <div><label class="app-label" for="dss-name">Name</label><input id="dss-name" class="app-input" data-testid="dss-name" [ngModel]="f.name" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ name: $event })" /></div>
              <div><label class="app-label" for="dss-email">E-mail address</label><input id="dss-email" type="email" class="app-input" data-testid="dss-email" [ngModel]="f.email" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ email: $event })" /></div>
              <div><label class="app-label" for="dss-phone">Phone number (for SMS or WhatsApp)</label><input id="dss-phone" class="app-input" data-testid="dss-phone" [ngModel]="f.phone" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ phone: $event })" /></div>
            }
            <div><label class="app-label" for="dss-branch">Branches</label>
              <select id="dss-branch" class="app-input" data-testid="dss-branch" [ngModel]="f.branchId" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ branchId: $event })">
                <option value="">All branches (the company's summary)</option>@for (b of branches.branches(); track b.id) { <option [value]="b.id">{{ b.name }} only</option> }</select></div>
            <fieldset class="sm:col-span-2"><legend class="app-label">Send it</legend>
              <div class="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                @if (f.kind === 'staff') { <label class="flex items-center gap-2"><input type="checkbox" data-testid="dss-way-inapp" [checked]="f.inApp" (change)="patch({ inApp: !f.inApp })" /> In the app (the notices bell)</label> }
                <label class="flex items-center gap-2"><input type="checkbox" data-testid="dss-way-email" [checked]="f.email_" (change)="patch({ email_: !f.email_ })" /> By e-mail</label>
                <label class="flex items-center gap-2"><input type="checkbox" data-testid="dss-way-sms" [checked]="f.sms" (change)="patch({ sms: !f.sms })" /> By SMS</label>
                <label class="flex items-center gap-2"><input type="checkbox" data-testid="dss-way-whatsapp" [checked]="f.whatsApp" (change)="patch({ whatsApp: !f.whatsApp })" /> By WhatsApp</label>
              </div>
              @for (c of unavailable(st); track c.channel) { <p class="mt-1 text-xs text-ink/70" data-testid="dss-unavailable">{{ c.label }}: {{ c.note }}</p> }
            </fieldset>
            <label class="flex items-center gap-2 text-sm"><input type="checkbox" [checked]="f.active" (change)="patch({ active: !f.active })" /> Send to them</label>
          </div>
          @if (formError()) { <p class="sys-alert sys-alert-danger mt-3" role="alert" data-testid="dss-form-error">{{ formError() }}</p> }
          <div class="mt-3 flex gap-2"><button type="button" class="btn-primary" data-testid="dss-form-save" [disabled]="saving()" (click)="saveRecipient()">Save</button><button type="button" class="btn-ghost" (click)="form.set(null)">Cancel</button></div>
        </section>
      }
    }
  `
})
export class DailySummarySetupComponent implements OnInit {
  private readonly api = inject(DailySummaryApi);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  protected readonly branches = inject(BranchContextService);

  protected readonly settings = signal<DailySummarySettingsDto | null>(null);
  protected readonly people = signal<readonly { id: string; name: string }[]>([]);
  protected readonly enabled = signal(false);
  protected readonly time = signal('07:00');
  protected readonly form = signal<Form | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly note = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly building = signal(false);

  ngOnInit(): void {
    void this.load();
    void firstValueFrom(this.http.get<ApiEnvelope<{ id: string; name: string }[]>>('/api/v1/me/colleagues').pipe(unwrap())).then((p) => this.people.set(p), () => undefined);
  }

  private apply(s: DailySummarySettingsDto): void {
    this.settings.set(s);
    this.enabled.set(s.enabled);
    this.time.set(timeOf(s.sendAtMinute));
  }

  private async load(): Promise<void> {
    try { this.apply(await firstValueFrom(this.api.settings())); } catch (err) { this.error.set(toApiError(err).message); }
  }

  protected unavailable(st: DailySummarySettingsDto) { return st.channels.filter((c) => !c.ready && c.note); }

  protected ways(r: SummaryRecipientDto): string {
    return [r.sendInApp ? 'in the app' : null, r.sendEmail ? 'e-mail' : null, r.sendSms ? 'SMS' : null, r.sendWhatsApp ? 'WhatsApp' : null].filter(Boolean).join(', ');
  }

  protected async saveWhen(): Promise<void> {
    this.saving.set(true);
    try { this.apply(await firstValueFrom(this.api.saveSettings(this.enabled(), minuteOf(this.time())))); this.note.set('Saved.'); this.error.set(null); }
    catch (err) { this.error.set(toApiError(err).message); }
    finally { this.saving.set(false); }
  }

  protected async buildYesterday(): Promise<void> {
    this.building.set(true);
    try { const d = await firstValueFrom(this.api.build(yesterday())); this.note.set(`The summary of ${d.date} is built. Open Sell > Reports > Daily Summary to read it.`); }
    catch (err) { this.note.set(toApiError(err).message); }
    finally { this.building.set(false); }
  }

  protected add(): void { this.formError.set(null); this.form.set(blank()); }

  protected edit(r: SummaryRecipientDto): void {
    this.formError.set(null);
    this.form.set({ id: r.id, kind: r.membershipId ? 'staff' : 'outside', membershipId: r.membershipId ?? '', name: r.membershipId ? '' : r.name, email: r.membershipId ? '' : r.email ?? '', phone: r.membershipId ? '' : r.phone ?? '',
      inApp: r.sendInApp, email_: r.sendEmail, sms: r.sendSms, whatsApp: r.sendWhatsApp, branchId: r.branchId ?? '', active: r.isActive });
  }

  protected patch(p: Partial<Form>): void { this.form.update((f) => (f ? { ...f, ...p } : f)); }

  protected async saveRecipient(): Promise<void> {
    const f = this.form();
    if (!f) return;
    const body: SaveSummaryRecipientRequest = {
      membershipId: f.kind === 'staff' ? f.membershipId || null : null, name: f.kind === 'outside' ? f.name : null, email: f.kind === 'outside' ? f.email || null : null, phone: f.kind === 'outside' ? f.phone || null : null,
      sendInApp: f.kind === 'staff' && f.inApp, sendEmail: f.email_, sendSms: f.sms, sendWhatsApp: f.whatsApp, branchId: f.branchId || null, isActive: f.active
    };
    this.saving.set(true);
    try { await firstValueFrom(this.api.saveRecipient(f.id, body)); this.form.set(null); await this.load(); this.toast.success('Saved.'); }
    catch (err) { this.formError.set(toApiError(err).message); }
    finally { this.saving.set(false); }
  }

  protected async remove(r: SummaryRecipientDto): Promise<void> {
    if (!(await this.confirm.ask({ title: `Stop sending to ${r.name}?`, message: 'They will not get the daily summary any more. The days already sent are not affected.', confirmLabel: 'Remove' }))) return;
    try { await firstValueFrom(this.api.removeRecipient(r.id)); await this.load(); } catch (err) { this.error.set(toApiError(err).message); }
  }
}
