import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AccessCatalogDto, AccessCatalogModuleDto, AccessEffect } from '../../core/models/access.model';
import { FEATURES } from '../../core/models/rbac.model';
import { ItemDefault, ModeName, PlanDto, SavePlanRequest } from '../../core/models/subscription.model';
import { toApiError } from '../../core/services/api.util';
import { PlatformApi, PlatformAuthService } from '../../core/services/subscription.services';
import { PLATFORM_PERMISSIONS } from '../../core/models/support.model';
import { DialogComponent, ToastService } from '../../shared/ui/feedback';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';

const MODULES = Object.values(FEATURES) as string[];

const DAYS = [{ bit: 1, label: 'Mon' }, { bit: 2, label: 'Tue' }, { bit: 4, label: 'Wed' }, { bit: 8, label: 'Thu' }, { bit: 16, label: 'Fri' }, { bit: 32, label: 'Sat' }, { bit: 64, label: 'Sun' }] as const;
const clock = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const FROM_TIMES = Array.from({ length: 48 }, (_, i) => i * 30);        // 00:00 to 23:30
const TO_TIMES = Array.from({ length: 48 }, (_, i) => (i + 1) * 30);    // 00:30 to 24:00

const blank = (): SavePlanRequest => ({
  code: '', name: '', description: '', priceMinor: 0, currencyCode: 'USD', interval: 'Monthly', maxBranches: null, maxStaff: null, maxMonthlyOrders: null, monthlyMessageAllowance: null,
  supportFirstResponseNormalMinutes: null, supportFirstResponseUrgentMinutes: null, supportDays: 127, supportFromMinute: 0, supportToMinute: 1440, namedContact: false,
  trialDays: 14, warningDays: 3, graceDays: 7, restrictionPolicy: 'LockedExceptBilling', isActive: true, isPublic: true, sortOrder: 10, features: [], rules: [], rowVersion: null
});

/** Plans are configuration, not code: price, interval, modules, limits, reminder/grace timing and the restriction policy. Saving updates every company on the plan. */
@Component({
    selector: 'zp-platform-plans',
    imports: [CurrencyPipe, FormsModule, DialogComponent, StatusBadgeComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="mb-4 flex items-center justify-between"><h1 class="text-2xl font-bold">Plans</h1>@if (platform.can(perms.BILLING_MANAGE)) { <button type="button" class="btn-primary" data-testid="new-plan" (click)="openPlan(null)">New plan</button> }</div>
    @if (error()) { <p class="sys-alert sys-alert-danger mb-3" role="alert">{{ error() }}</p> }
    <div class="app-card overflow-x-auto p-0"><table class="app-table" data-testid="plans-table"><thead><tr><th>Plan</th><th class="text-right">Price</th><th>Limits (branches / staff / orders / paid messages)</th><th>Timing</th><th>Support promise</th><th>Modules</th><th></th></tr></thead>
      <tbody>@for (p of plans(); track p.id) {
        <tr [attr.data-testid]="'plan-row-' + p.code"><td class="font-medium">{{ p.name }}<span class="block text-xs font-normal text-ink/60">{{ p.code }}</span> @if (!p.isActive) { <zp-status-badge tone="danger">Inactive</zp-status-badge> }@if (!p.isPublic) { <zp-status-badge tone="warning">Hidden</zp-status-badge> }</td>
          <td class="text-right">{{ p.priceMinor / 100 | currency: p.currencyCode }}<span class="block text-xs text-ink/60">per {{ p.interval === 'Yearly' ? 'year' : 'month' }}</span></td>
          <td class="text-sm">{{ p.maxBranches ?? '&infin;' }} / {{ p.maxStaff ?? '&infin;' }} / {{ p.maxMonthlyOrders ?? '&infin;' }} / {{ p.monthlyMessageAllowance || 'none' }}</td>
          <td class="text-sm">trial {{ p.trialDays }}d, remind {{ p.warningDays }}d, grace {{ p.graceDays }}d<span class="block text-xs text-ink/60">{{ p.restrictionPolicy === 'PerModule' ? 'per-module restriction' : 'locked except billing' }}</span></td>
          <td class="text-sm" [attr.data-testid]="'plan-support-' + p.code">{{ promiseText(p) }}</td>
          <td class="text-sm">{{ p.features.length }} of {{ allModules.length }}</td>
          <td class="text-right">@if (platform.can(perms.BILLING_MANAGE)) { <button type="button" class="btn-outline px-2 py-1 text-sm" [attr.data-testid]="'edit-plan-' + p.code" (click)="openPlan(p)">Edit</button> }</td></tr> }</tbody></table></div>

    <zp-dialog [open]="open()" [title]="editingId() ? 'Edit plan' : 'New plan'" [wide]="true" (closed)="open.set(false)">
      <form class="space-y-4" (submit)="$event.preventDefault(); save()">
        <div class="grid gap-3 sm:grid-cols-3">
          <div><label class="app-label" for="p-code">Code</label><input id="p-code" class="app-input" data-testid="plan-code" [disabled]="!!editingId()" [ngModel]="f().code" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ code: $event })" />@if (fe()['code']) { <p class="app-error" role="alert">{{ fe()['code'] }}</p> }</div>
          <div class="sm:col-span-2"><label class="app-label" for="p-name">Name</label><input id="p-name" class="app-input" data-testid="plan-name" [ngModel]="f().name" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ name: $event })" /></div>
          <div class="sm:col-span-3"><label class="app-label" for="p-desc">Description</label><input id="p-desc" class="app-input" [ngModel]="f().description" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ description: $event })" /></div>
          <div><label class="app-label" for="p-price">Price (minor units, e.g. cents)</label><input id="p-price" type="number" min="0" class="app-input" data-testid="plan-price" [ngModel]="f().priceMinor" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ priceMinor: +$event })" /></div>
          <div><label class="app-label" for="p-cur">Currency</label><input id="p-cur" class="app-input uppercase" maxlength="3" [ngModel]="f().currencyCode" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ currencyCode: $event })" /></div>
          <div><label class="app-label" for="p-int">Billing interval</label><select id="p-int" class="app-input" [ngModel]="f().interval" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ interval: $event })"><option value="Monthly">Monthly</option><option value="Yearly">Yearly</option></select></div>
          <div><label class="app-label" for="p-mb">Max branches (blank = unlimited)</label><input id="p-mb" type="number" min="1" class="app-input" [ngModel]="f().maxBranches" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ maxBranches: $event ? +$event : null })" /></div>
          <div><label class="app-label" for="p-ms">Max staff</label><input id="p-ms" type="number" min="1" class="app-input" [ngModel]="f().maxStaff" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ maxStaff: $event ? +$event : null })" /></div>
          <div><label class="app-label" for="p-mo">Max orders a month</label><input id="p-mo" type="number" min="1" class="app-input" [ngModel]="f().maxMonthlyOrders" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ maxMonthlyOrders: $event ? +$event : null })" /></div>
          <div><label class="app-label" for="p-mm">Paid messages a month (SMS and WhatsApp; blank or 0 = none included, they go by e-mail)</label><input id="p-mm" type="number" min="0" class="app-input" data-testid="plan-messages" [ngModel]="f().monthlyMessageAllowance" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ monthlyMessageAllowance: $event ? +$event : null })" /></div>
          <div><label class="app-label" for="p-td">Trial days</label><input id="p-td" type="number" min="0" class="app-input" [ngModel]="f().trialDays" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ trialDays: +$event })" /></div>
          <div><label class="app-label" for="p-wd">Reminder days before due</label><input id="p-wd" type="number" min="0" class="app-input" data-testid="plan-warning" [ngModel]="f().warningDays" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ warningDays: +$event })" /></div>
          <div><label class="app-label" for="p-gd">Grace days after due</label><input id="p-gd" type="number" min="0" class="app-input" data-testid="plan-grace" [ngModel]="f().graceDays" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ graceDays: +$event })" /></div>
          <div class="sm:col-span-2"><label class="app-label" for="p-rp">When restricted</label><select id="p-rp" class="app-input" data-testid="plan-policy" [ngModel]="f().restrictionPolicy" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ restrictionPolicy: $event })"><option value="LockedExceptBilling">Everything locked except subscription and payment</option><option value="PerModule">Each module follows its own restricted mode</option></select></div>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" [checked]="f().isActive" (change)="patch({ isActive: !f().isActive })" /> Active</label>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" [checked]="f().isPublic" (change)="patch({ isPublic: !f().isPublic })" /> Shown to customers</label>
        </div>
        <fieldset class="rounded-lg border border-ink/15 p-3" data-testid="plan-support"><legend class="px-1 text-sm font-semibold">Support promise</legend>
          <p class="mb-2 text-xs text-ink/70">The minutes to a first reply are counted only inside these days and hours, in support's own time zone. Leave both times blank to promise nothing. A normal-ticket time also covers urgent tickets unless an urgent time is given.</p>
          <div class="grid gap-3 sm:grid-cols-2">
            <div><label class="app-label" for="p-sn">First reply, normal ticket (minutes)</label><input id="p-sn" type="number" min="1" class="app-input" data-testid="plan-support-normal" [ngModel]="f().supportFirstResponseNormalMinutes" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ supportFirstResponseNormalMinutes: $event ? +$event : null })" /></div>
            <div><label class="app-label" for="p-su">First reply, urgent ticket (minutes)</label><input id="p-su" type="number" min="1" class="app-input" data-testid="plan-support-urgent" [ngModel]="f().supportFirstResponseUrgentMinutes" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ supportFirstResponseUrgentMinutes: $event ? +$event : null })" /></div>
            <div class="sm:col-span-2"><span class="app-label">Support days</span><div class="flex flex-wrap gap-x-4 gap-y-1">@for (d of days; track d.bit) { <label class="flex items-center gap-1.5 text-sm"><input type="checkbox" [attr.data-testid]="'plan-support-day-' + d.bit" [checked]="hasDay(d.bit)" (change)="toggleDay(d.bit)" /> {{ d.label }}</label> }</div></div>
            <div><label class="app-label" for="p-sf">Support opens</label><select id="p-sf" class="app-input" data-testid="plan-support-from" [ngModel]="f().supportFromMinute" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ supportFromMinute: +$event })">@for (t of fromTimes; track t) { <option [value]="t">{{ clock(t) }}</option> }</select></div>
            <div><label class="app-label" for="p-st">Support closes</label><select id="p-st" class="app-input" data-testid="plan-support-to" [ngModel]="f().supportToMinute" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ supportToMinute: +$event })">@for (t of toTimes; track t) { <option [value]="t">{{ clock(t) }}</option> }</select></div>
            <label class="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" data-testid="plan-support-named" [checked]="f().namedContact" (change)="patch({ namedContact: !f().namedContact })" /> A named contact at ZestPoint (the owner on the company's customer record)</label>
          </div>
          @if (fe()['supportToMinute']) { <p class="app-error mt-2" role="alert">{{ fe()['supportToMinute'] }}</p> }
          @if (fe()['supportDays']) { <p class="app-error mt-2" role="alert">{{ fe()['supportDays'] }}</p> }
        </fieldset>
        <fieldset class="rounded-lg border border-ink/15 p-3"><legend class="px-1 text-sm font-semibold">Modules in this plan</legend>
          <div class="space-y-2">
            @for (m of allModules; track m) {
              <div class="rounded-lg border border-ink/10 p-2 text-sm" [attr.data-testid]="'plan-block-' + m">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <label class="flex items-center gap-2"><input type="checkbox" [attr.data-testid]="'plan-module-' + m" [checked]="has(m)" (change)="toggle(m)" /> {{ moduleInfo(m)?.name ?? m }}@if (moduleInfo(m) && !moduleInfo(m)!.available) { <span class="text-xs text-ink/70">(coming soon)</span> }</label>
                  @if (has(m)) {
                    <span class="flex flex-wrap items-center gap-2">
                      <select class="app-input w-auto py-0.5 text-xs" [attr.aria-label]="'Which screens and buttons are included in ' + (moduleInfo(m)?.name ?? m)" [attr.data-testid]="'plan-default-' + m" [ngModel]="defaultOf(m)" [ngModelOptions]="{ standalone: true }" (ngModelChange)="setDefault(m, $event)"><option value="All">every screen and button</option><option value="OnlyGranted">only the ones I allow</option></select>
                      @if (f().restrictionPolicy === 'PerModule') { <select class="app-input w-auto py-0.5 text-xs" [ngModel]="modeOf(m)" [ngModelOptions]="{ standalone: true }" (ngModelChange)="setMode(m, $event)"><option value="None">locked when restricted</option><option value="ReadOnly">read-only when restricted</option></select> }
                    </span>
                  }
                </div>
                @if (has(m) && moduleInfo(m); as info) {
                  @if (info.screens.length + info.actions.length > 0) {
                    <details class="mt-2" [attr.data-testid]="'plan-details-' + m"><summary class="cursor-pointer text-xs underline">Screens and buttons ({{ ruleCount(info) }} rule{{ ruleCount(info) === 1 ? '' : 's' }})</summary>
                      <ul class="mt-1 divide-y divide-ink/10">
                        @for (s of info.screens; track s.key) {
                          <li class="py-1.5">
                            <div class="flex items-center justify-between gap-2"><span>{{ s.name }}</span>
                              <select class="app-input w-auto py-0.5 text-xs" [attr.aria-label]="'Rule for ' + s.name" [attr.data-testid]="'plan-rule-' + s.key" [ngModel]="ruleOf(s.key)" [ngModelOptions]="{ standalone: true }" (ngModelChange)="setRule(s.key, $event)"><option value="">Default</option><option value="Allow">Allow</option><option value="Deny">Withhold</option></select></div>
                            @if (s.actions.length > 0) {
                              <details class="ml-4 mt-1"><summary class="cursor-pointer text-xs text-ink/70 underline">{{ s.actions.length }} button{{ s.actions.length === 1 ? '' : 's' }}</summary>
                                @for (a of s.actions; track a.key) {
                                  <div class="flex items-center justify-between gap-2 py-0.5 text-xs"><span>{{ a.name }}</span>
                                    <select class="app-input w-auto py-0.5 text-xs" [attr.aria-label]="'Rule for ' + a.name" [attr.data-testid]="'plan-rule-' + a.key" [ngModel]="ruleOf(a.key)" [ngModelOptions]="{ standalone: true }" (ngModelChange)="setRule(a.key, $event)"><option value="">Default</option><option value="Allow">Allow</option><option value="Deny">Withhold</option></select></div>
                                }
                              </details>
                            }
                          </li>
                        }
                        @for (a of info.actions; track a.key) {
                          <li class="flex items-center justify-between gap-2 py-1.5 text-xs"><span>{{ a.name }}</span>
                            <select class="app-input w-auto py-0.5 text-xs" [attr.aria-label]="'Rule for ' + a.name" [attr.data-testid]="'plan-rule-' + a.key" [ngModel]="ruleOf(a.key)" [ngModelOptions]="{ standalone: true }" (ngModelChange)="setRule(a.key, $event)"><option value="">Default</option><option value="Allow">Allow</option><option value="Deny">Withhold</option></select></li>
                        }
                      </ul></details>
                  }
                }
              </div>
            }
          </div></fieldset>
        @if (saveError()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="plan-error">{{ saveError() }}</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="open.set(false)">Cancel</button><button type="submit" class="btn-primary" data-testid="plan-save" [disabled]="busy()">Save plan</button></div>
      </form>
    </zp-dialog>
  `
})
export class PlatformPlansComponent implements OnInit {
  private readonly api = inject(PlatformApi);
  protected readonly platform = inject(PlatformAuthService);
  protected readonly perms = PLATFORM_PERMISSIONS;
  private readonly toast = inject(ToastService);

  protected readonly allModules = MODULES;
  protected readonly days = DAYS;
  protected readonly fromTimes = FROM_TIMES;
  protected readonly toTimes = TO_TIMES;
  protected readonly clock = clock;
  protected readonly plans = signal<readonly PlanDto[]>([]);
  protected readonly open = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly f = signal<SavePlanRequest>(blank());
  protected readonly error = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);
  protected readonly fe = signal<Readonly<Record<string, string>>>({});
  protected readonly busy = signal(false);

  protected readonly catalog = signal<AccessCatalogDto | null>(null);

  ngOnInit(): void {
    void this.load();
    // The screens and buttons come from the server's catalog, so a new screen appears here without a change to this page.
    void firstValueFrom(this.api.accessCatalog()).then((c) => this.catalog.set(c), () => { /* the plan editor still works at module level */ });
  }

  protected moduleInfo(key: string): AccessCatalogModuleDto | undefined { return this.catalog()?.modules.find((m) => m.key === key); }
  protected defaultOf(key: string): ItemDefault { return this.f().features.find((x) => x.featureKey === key)?.itemDefault ?? 'All'; }
  protected ruleOf(key: string): '' | AccessEffect { return this.f().rules.find((r) => r.itemKey === key)?.effect ?? ''; }

  protected setDefault(key: string, itemDefault: ItemDefault): void {
    this.f.update((v) => ({ ...v, features: v.features.map((x) => (x.featureKey === key ? { ...x, itemDefault } : x)) }));
  }

  /** Default removes the plan's rule; Allow and Withhold set it. */
  protected setRule(itemKey: string, effect: '' | AccessEffect): void {
    this.f.update((v) => ({ ...v, rules: [...v.rules.filter((r) => r.itemKey !== itemKey), ...(effect ? [{ itemKey, effect }] : [])] }));
  }

  protected ruleCount(m: AccessCatalogModuleDto): number {
    const keys = new Set([...m.screens.flatMap((s) => [s.key, ...s.actions.map((a) => a.key)]), ...m.actions.map((a) => a.key)]);
    return this.f().rules.filter((r) => keys.has(r.itemKey)).length;
  }

  private async load(): Promise<void> {
    try { this.plans.set(await firstValueFrom(this.api.plans())); } catch (err) { this.error.set(toApiError(err).message); }
  }

  protected patch(p: Partial<SavePlanRequest>): void { this.f.update((v) => ({ ...v, ...p })); }
  protected hasDay(bit: number): boolean { return (this.f().supportDays & bit) !== 0; }
  protected toggleDay(bit: number): void { this.f.update((v) => ({ ...v, supportDays: v.supportDays ^ bit })); }

  /** The promise in a line for the list: normal and urgent minutes, the days and hours, a named contact. */
  protected promiseText(p: PlanDto): string {
    const n = p.supportFirstResponseNormalMinutes;
    const u = p.supportFirstResponseUrgentMinutes;
    if (!n && !u) return 'none';
    const hours = p.supportDays === 127 && p.supportFromMinute === 0 && p.supportToMinute === 1440
      ? 'round the clock'
      : `${DAYS.filter((d) => (p.supportDays & d.bit) !== 0).map((d) => d.label).join(' ')} ${clock(p.supportFromMinute)} to ${clock(p.supportToMinute)}`;
    return `${n ?? u} / ${u ?? n} min, ${hours}${p.namedContact ? ', named contact' : ''}`;
  }
  protected has(key: string): boolean { return this.f().features.some((x) => x.featureKey === key); }
  protected modeOf(key: string): ModeName { return this.f().features.find((x) => x.featureKey === key)?.modeWhenRestricted ?? 'None'; }

  protected toggle(key: string): void {
    // Taking a module out of the plan also takes out the screen and button rules beneath it: they would otherwise be saved invisibly.
    const info = this.moduleInfo(key);
    const owned = new Set(info ? [...info.screens.flatMap((s) => [s.key, ...s.actions.map((a) => a.key)]), ...info.actions.map((a) => a.key)] : []);
    if (this.has(key) && owned.size > 0) this.f.update((v) => ({ ...v, rules: v.rules.filter((r) => !owned.has(r.itemKey)) }));
    this.f.update((v) => ({ ...v, features: v.features.some((x) => x.featureKey === key) ? v.features.filter((x) => x.featureKey !== key) : [...v.features, { featureKey: key, modeWhenRestricted: 'None' as ModeName, itemDefault: 'All' as ItemDefault }] }));
  }

  protected setMode(key: string, mode: ModeName): void {
    this.f.update((v) => ({ ...v, features: v.features.map((x) => (x.featureKey === key ? { ...x, modeWhenRestricted: mode } : x)) }));
  }

  protected openPlan(p: PlanDto | null): void {
    this.saveError.set(null);
    this.fe.set({});
    this.editingId.set(p?.id ?? null);
    this.f.set(p ? { ...p, features: p.features.map((x) => ({ ...x })), rules: p.rules.map((r) => ({ ...r })), rowVersion: p.rowVersion } : blank());
    this.open.set(true);
  }

  protected async save(): Promise<void> {
    this.busy.set(true);
    this.saveError.set(null);
    this.fe.set({});
    try {
      await firstValueFrom(this.api.savePlan(this.editingId(), { ...this.f(), currencyCode: this.f().currencyCode.toUpperCase() }));
      this.open.set(false);
      this.toast.success('Plan saved. Companies on it have been updated.');
      await this.load();
    } catch (err) {
      const e = toApiError(err);
      this.fe.set(Object.fromEntries(Object.entries(e.fieldErrors).map(([k, v]) => [k, v[0] ?? ''])));
      this.saveError.set(e.message);
    } finally { this.busy.set(false); }
  }
}
