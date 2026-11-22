import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  AccessEffect, AccessModuleNodeDto, AccessNodeDto, AccessRuleDto, AccessTreeDto, MAX_APPLICATION_GRANT_DAYS
} from '../../../core/models/access.model';
import { ModeName } from '../../../core/models/subscription.model';
import { toApiError } from '../../../core/services/api.util';
import { PlatformApi } from '../../../core/services/subscription.services';
import { DialogComponent, ToastService } from '../../../shared/ui/feedback';
import { SearchSelectComponent, SelectOption } from '../../../shared/ui/search-select.component';
import { StatusBadgeComponent } from '../../../shared/ui/ui-kit.components';

type DialogKind = 'rule' | 'override' | 'clear-override' | 'grant-module' | 'revert-module' | 'grant-app' | 'revert-app' | 'revoke-rule';

interface DialogState {
  readonly kind: DialogKind;
  readonly title: string;
  readonly module?: AccessModuleNodeDto;
  readonly item?: AccessNodeDto;
  readonly rule?: AccessRuleDto;
}

const dayKey = (d: Date): string => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * 86_400_000);

/**
 * One organisation's access as a Module > Screen > Action tree: what works, where each answer comes from (the plan, an operator, the module's
 * default), and the operator's controls. Every change needs a written reason and goes to the organisation's ledger and audit log under the
 * operator's name; the one-click buttons give a whole module or the whole application (reversible, the latter time-boxed to 90 days).
 * Read-only for operators who lack the billing right; the server enforces that again on every call.
 */
@Component({
    selector: 'zp-access-tree',
    imports: [DatePipe, NgTemplateOutlet, FormsModule, DialogComponent, StatusBadgeComponent, SearchSelectComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <section class="app-card mb-4" data-testid="access-tree" aria-labelledby="access-heading">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div><h2 id="access-heading" class="font-semibold">Access</h2>
          <p class="text-xs text-ink/70">Modules, screens and buttons this company can use. Billing, support and workspace administration are always available.</p></div>
        @if (canManage()) {
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-primary" data-testid="grant-application" (click)="openGrantApplication()">Grant whole application</button>
            @if (tree()?.applicationGrantGroupId) { <button type="button" class="btn-outline" data-testid="revert-application" (click)="openRevertApplication()">Revert application grant</button> }
          </div>
        } @else { <p class="text-xs text-ink/60" data-testid="access-readonly">Changing access needs an administrator.</p> }
      </div>

      @if (tree(); as t) {
        @if (t.applicationGrantGroupId) {
          <p class="sys-alert sys-alert-info mt-3" role="status" data-testid="application-grant-banner">Every available module is open until {{ t.applicationGrantValidUntilUtc | date: 'd MMM yyyy' : 'UTC' }}. Then this company follows its plan again.</p>
        }

        <div class="mt-3 flex flex-wrap items-end gap-3">
          <div class="min-w-[12rem] flex-1"><label class="app-label" for="access-search">Find a screen or button</label>
            <input id="access-search" type="search" class="app-input" data-testid="access-search" placeholder="e.g. bins, void, report" [ngModel]="search()" (ngModelChange)="search.set($event)" /></div>
          <div><label class="app-label" for="access-branch">Showing</label>
            <zp-search-select class="w-56" inputId="access-branch" testId="access-branch" emptyLabel="Whole company" noun="branch" placeholder="Search branches"
                              [options]="branchOptions()" [value]="branchId()" (valueChange)="selectBranch($event)" /></div>
          <label class="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" data-testid="access-changes-only" [ngModel]="changesOnly()" (ngModelChange)="changesOnly.set($event)" /> Only what differs from the default</label>
        </div>

        @if (error()) { <p class="sys-alert sys-alert-danger mt-3" role="alert" data-testid="access-error">{{ error() }}</p> }

        <ul class="mt-3 divide-y divide-ink/10 text-sm" data-testid="detail-modules">
          @for (m of visible(); track m.key) {
            <li class="py-3" [attr.data-testid]="'mod-' + m.key">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="min-w-0">
                  <button type="button" class="flex items-center gap-2 text-left font-medium" [attr.aria-expanded]="isOpen(m.key)" [attr.aria-controls]="'panel-' + m.key" [attr.data-testid]="'toggle-' + m.key" (click)="toggle(m.key)">
                    <span aria-hidden="true">{{ isOpen(m.key) ? '&#9662;' : '&#9656;' }}</span>{{ m.name }}</button>
                  <p class="ml-5 text-xs text-ink/70">{{ m.description }}</p>
                  @if (m.source !== 'Plan' && m.reason) { <p class="ml-5 text-xs text-ink/70">Set by {{ m.grantedBy ?? 'an operator' }}: {{ m.reason }}{{ m.validUntilUtc ? ' (until ' + (m.validUntilUtc | date: 'd MMM yyyy' : 'UTC') + ')' : '' }}</p> }
                </div>
                <div class="flex flex-wrap items-center gap-1.5">
                  @if (!m.available) { <zp-status-badge tone="warning"><span data-testid="coming-soon">Coming soon</span></zp-status-badge> }
                  @else {
                    <zp-status-badge [tone]="m.mode === 'Full' ? 'success' : m.mode === 'ReadOnly' ? 'warning' : 'danger'">{{ m.mode }}</zp-status-badge>
                    @if (m.itemDefault === 'OnlyGranted' && m.mode !== 'None') { <zp-status-badge tone="primary"><span data-testid="selective">Selective</span></zp-status-badge> }
                    <span class="text-xs text-ink/70">{{ m.source === 'Plan' ? (m.includedInPlan ? 'In the plan' : 'Not in the plan') : m.source === 'Override' ? 'Operator override' : 'Add-on' }}</span>
                    @if (canManage()) {
                      <button type="button" class="btn-outline px-2 py-0.5 text-xs" [attr.data-testid]="'grant-module-' + m.key" (click)="openGrantModule(m)">Grant whole module</button>
                      <button type="button" class="btn-outline px-2 py-0.5 text-xs" [attr.data-testid]="'override-' + m.key" (click)="openOverride(m)">Override</button>
                      @if (m.source !== 'Plan') { <button type="button" class="btn-ghost px-2 py-0.5 text-xs" [attr.data-testid]="'clear-' + m.key" (click)="openClearOverride(m)">Clear override</button> }
                      @if (hasOperatorChanges(m)) { <button type="button" class="btn-ghost px-2 py-0.5 text-xs" [attr.data-testid]="'revert-module-' + m.key" (click)="openRevertModule(m)">Revert to plan</button> }
                    }
                  }
                </div>
              </div>

              @if (isOpen(m.key) && m.available) {
                <div class="ml-5 mt-2" [id]="'panel-' + m.key">
                  <ul class="divide-y divide-ink/10">
                    @for (s of m.screens; track s.key) {
                      <li class="py-2" [attr.data-testid]="'screen-' + s.key">
                        <ng-container [ngTemplateOutlet]="row" [ngTemplateOutletContext]="{ n: s, m: m }" />
                        @if (s.actions.length > 0) {
                          <button type="button" class="ml-1 text-xs underline" [attr.aria-expanded]="isOpen(s.key)" [attr.data-testid]="'toggle-' + s.key" (click)="toggle(s.key)">{{ isOpen(s.key) ? 'Hide' : 'Show' }} {{ s.actions.length }} button{{ s.actions.length === 1 ? '' : 's' }}</button>
                        }
                        @if (isOpen(s.key)) {
                          <ul class="ml-4 mt-1 divide-y divide-ink/5 border-l border-ink/10 pl-3">
                            @for (a of s.actions; track a.key) { <li class="py-1.5" [attr.data-testid]="'action-' + a.key"><ng-container [ngTemplateOutlet]="row" [ngTemplateOutletContext]="{ n: a, m: m }" /></li> }
                          </ul>
                        }
                      </li>
                    }
                  </ul>
                  @if (m.actions.length > 0) {
                    <p class="mt-3 text-xs font-semibold uppercase tracking-wide text-ink/70">Shared buttons and lookups</p>
                    <ul class="divide-y divide-ink/5">
                      @for (a of m.actions; track a.key) { <li class="py-1.5" [attr.data-testid]="'action-' + a.key"><ng-container [ngTemplateOutlet]="row" [ngTemplateOutletContext]="{ n: a, m: m }" /></li> }
                    </ul>
                  }
                </div>
              }
            </li>
          } @empty { <li class="py-6 text-center text-ink/70">Nothing matches.</li> }
        </ul>

        @if (t.unknownRules.length > 0) {
          <div class="sys-alert sys-alert-warning mt-3" data-testid="unknown-rules">
            <p class="font-semibold">Rules for items that no longer exist (never applied)</p>
            <ul>@for (r of t.unknownRules; track r.id) { <li class="flex items-center justify-between gap-2 py-1">{{ r.itemKey }} ({{ r.effect }})
              @if (canManage()) { <button type="button" class="btn-outline px-2 py-0.5 text-xs" (click)="openRevokeRule(r, r.itemKey)">Remove</button> }</li> }</ul>
          </div>
        }
      } @else if (!error()) { <p class="mt-3 text-ink/70" role="status">Loading access...</p> }
      @else { <p class="sys-alert sys-alert-danger mt-3" role="alert">{{ error() }}</p> }
    </section>

    <ng-template #row let-n="n" let-m="m">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="min-w-0"><span class="font-medium">{{ n.name }}</span>
          <zp-status-badge [tone]="n.allowed ? 'success' : 'danger'"><span [attr.data-testid]="'state-' + n.key">{{ n.allowed ? 'Allowed' : 'Withheld' }}</span></zp-status-badge>
          <span class="ml-1 text-xs text-ink/70">{{ origin(n) }}</span></div>
        @if (canManage() && m.available) {
          <div class="flex flex-wrap items-center gap-1.5">
            <button type="button" class="btn-outline px-2 py-0.5 text-xs" [attr.aria-label]="'Allow ' + n.name" [attr.data-testid]="'allow-' + n.key" (click)="openRule(n, 'Allow')">Allow</button>
            <button type="button" class="btn-outline px-2 py-0.5 text-xs" [attr.aria-label]="'Withhold ' + n.name" [attr.data-testid]="'deny-' + n.key" (click)="openRule(n, 'Deny')">Withhold</button>
          </div>
        }
      </div>
      @if (n.rules.length > 0) {
        <ul class="mt-1 flex flex-wrap gap-1.5">
          @for (r of n.rules; track r.id) {
            <li class="inline-flex items-center gap-1 rounded-full border border-ink/20 px-2 py-0.5 text-xs" [attr.data-testid]="'rule-' + r.id">
              <span>{{ r.effect === 'Allow' ? 'Allowed' : 'Withheld' }}{{ r.branchName ? ' at ' + r.branchName : '' }}{{ r.validUntilUtc ? ' until ' + (r.validUntilUtc | date: 'd MMM yyyy' : 'UTC') : '' }}</span>
              <span class="text-ink/70" [title]="r.reason + ' (' + r.grantedBy + ')'">&middot; why</span>
              @if (canManage()) { <button type="button" class="font-semibold underline" [attr.aria-label]="'Remove this rule on ' + n.name" [attr.data-testid]="'rule-remove-' + r.id" (click)="openRevokeRule(r, n.name)">Remove</button> }
            </li>
          }
        </ul>
      }
    </ng-template>

    <zp-dialog [open]="dialog() !== null" [title]="dialog()?.title ?? ''" (closed)="close()">
      <form class="space-y-3" (submit)="$event.preventDefault(); run()">
        @switch (dialog()?.kind) {
          @case ('rule') {
            <div class="grid gap-3 sm:grid-cols-2">
              <div><label class="app-label" for="r-scope">Applies to</label>
                <select id="r-scope" class="app-input" data-testid="rule-scope" [ngModel]="scope()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="scope.set($event)">
                  <option value="">The whole company</option>@for (b of tree()?.branches ?? []; track b.id) { <option [value]="b.id">Only {{ b.name }}</option> }</select></div>
              <div><label class="app-label" for="r-until">Until (optional)</label>
                <input id="r-until" type="date" class="app-input" data-testid="action-until" [min]="tomorrow" [ngModel]="until()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="until.set($event)" /></div>
            </div>
            @if (dialog()?.module?.mode === 'None' && effect() === 'Allow') {
              <p class="sys-alert sys-alert-info text-xs" data-testid="selective-note">This module is off for the company. Allowing this switches the module on selectively: only what you allow will work.</p>
            }
          }
          @case ('override') {
            <div class="grid gap-3 sm:grid-cols-2">
              <div><label class="app-label" for="o-mode">Access</label>
                <select id="o-mode" class="app-input" data-testid="action-mode" [ngModel]="mode()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="mode.set($event)"><option value="Full">Full</option><option value="ReadOnly">Read-only</option><option value="None">None (withdraw)</option></select></div>
              <div><label class="app-label" for="o-until">Until (optional)</label>
                <input id="o-until" type="date" class="app-input" data-testid="action-until" [min]="tomorrow" [ngModel]="until()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="until.set($event)" /></div>
            </div>
            <label class="flex items-center gap-2 text-sm"><input type="checkbox" data-testid="action-selective" [ngModel]="selective()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="selective.set($event)" /> Selective: only screens and buttons I allow individually</label>
          }
          @case ('grant-module') {
            <p class="text-sm">Every screen and button of this module becomes available, and any withdrawals beneath it are cleared. You can revert it later in one click.</p>
            <div><label class="app-label" for="g-until">Until (optional)</label>
              <input id="g-until" type="date" class="app-input" data-testid="action-until" [min]="tomorrow" [ngModel]="until()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="until.set($event)" /></div>
          }
          @case ('grant-app') {
            <p class="text-sm">Every available module, screen and button opens for this company. The plan, limits and billing are not changed, and modules with nothing built behind them are skipped. It ends on the date below; you can revert it sooner.</p>
            <div><label class="app-label" for="a-until">Ends on (required, at most {{ maxDays }} days away)</label>
              <input id="a-until" type="date" class="app-input" data-testid="application-until" required [min]="tomorrow" [max]="latest" [ngModel]="until()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="until.set($event)" /></div>
          }
          @case ('revert-app') { <p class="text-sm">Everything granted by the whole-application click is removed, and the company follows its plan again.</p> }
          @case ('revert-module') { <p class="text-sm">The module returns to what the plan gives, and any rules an operator set beneath it are removed.</p> }
          @case ('clear-override') { <p class="text-sm">The module is handed back to the plan.</p> }
          @case ('revoke-rule') { <p class="text-sm">The rule is removed (kept in the history) and the item follows its default again.</p> }
        }
        <div><label class="app-label" for="a-reason">Reason (kept in the company's ledger)</label>
          <input id="a-reason" class="app-input" data-testid="action-reason" [ngModel]="reason()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="reason.set($event)" /></div>
        @if (dialogError()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="action-error">{{ dialogError() }}</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="close()">Cancel</button>
          <button type="submit" class="btn-primary" data-testid="action-confirm" [disabled]="!canConfirm()">{{ confirmLabel() }}</button></div>
      </form>
    </zp-dialog>
  `,
    styles: [`:host { display: block; }`]
})
export class AccessTreeComponent implements OnInit {
  private readonly api = inject(PlatformApi);
  private readonly toast = inject(ToastService);

  readonly tenantId = input.required<string>();
  /** Whether the operator holds the billing right. Reading is open to every operator. */
  readonly canManage = input(false);
  /** Emitted after any change, so the page can refresh what else it shows (the ledger). */
  readonly changed = output<void>();

  protected readonly tree = signal<AccessTreeDto | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly search = signal('');
  protected readonly branchId = signal('');
  protected readonly branchOptions = computed<readonly SelectOption[]>(() => (this.tree()?.branches ?? []).map((b) => ({ value: b.id, label: b.name })));
  protected readonly changesOnly = signal(false);
  private readonly openKeys = signal<ReadonlySet<string>>(new Set());

  protected readonly dialog = signal<DialogState | null>(null);
  protected readonly reason = signal('');
  protected readonly effect = signal<AccessEffect>('Allow');
  protected readonly scope = signal('');
  protected readonly until = signal('');
  protected readonly mode = signal<ModeName>('Full');
  protected readonly selective = signal(false);
  protected readonly busy = signal(false);
  protected readonly dialogError = signal<string | null>(null);

  protected readonly maxDays = MAX_APPLICATION_GRANT_DAYS;
  protected readonly tomorrow = dayKey(addDays(new Date(), 1));
  /** One day inside the 90-day cap: the form sends the END of the chosen day, so the last allowed date is never the boundary the server checks. */
  protected readonly latest = dayKey(addDays(new Date(), MAX_APPLICATION_GRANT_DAYS - 1));

  /** The modules (and, beneath them, the screens and buttons) that match the search and the "only differences" filter. */
  protected readonly visible = computed<AccessModuleNodeDto[]>(() => {
    const t = this.tree();
    if (!t) return [];
    const q = this.search().trim().toLowerCase();
    const only = this.changesOnly();
    const differs = (n: AccessNodeDto): boolean => n.rules.length > 0 || n.origin === 'Operator' || n.origin === 'Plan' || n.actions.some(differs);
    const matches = (n: AccessNodeDto): boolean => !q || n.name.toLowerCase().includes(q) || n.key.toLowerCase().includes(q) || n.actions.some(matches);
    const keep = (n: AccessNodeDto): boolean => matches(n) && (!only || differs(n));

    const out: AccessModuleNodeDto[] = [];
    for (const m of t.modules) {
      const moduleHit = !q || m.name.toLowerCase().includes(q);
      const screens = m.screens.filter((s) => (moduleHit && !only) || keep(s));
      const actions = m.actions.filter((a) => (moduleHit && !only) || keep(a));
      const moduleDiffers = m.source !== 'Plan' || m.itemDefault === 'OnlyGranted';
      if (screens.length > 0 || actions.length > 0 || (moduleHit && (!only || moduleDiffers))) out.push({ ...m, screens, actions });
    }
    return out;
  });

  ngOnInit(): void {
    void this.load();
  }

  /** Re-reads the tree (after a plan change elsewhere on the page, or a change here). */
  async load(): Promise<void> {
    const seq = ++this.loadSeq;
    this.error.set(null);
    try {
      const fresh = await firstValueFrom(this.api.accessTree(this.tenantId(), this.branchId() || null));
      if (seq === this.loadSeq) this.tree.set(fresh); // only the newest request may show: a slow older one must not overwrite it
    } catch (err) { if (seq === this.loadSeq) this.error.set(toApiError(err).message); }
  }

  private loadSeq = 0;

  protected selectBranch(id: string): void {
    this.branchId.set(id);
    void this.load();
  }

  protected isOpen(key: string): boolean {
    // A search opens everything it found, so the match is visible without more clicks.
    return this.openKeys().has(key) || this.search().trim().length > 0;
  }

  protected toggle(key: string): void {
    this.openKeys.update((s) => { const next = new Set(s); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  }

  protected hasOperatorChanges(m: AccessModuleNodeDto): boolean {
    return m.source !== 'Plan' || m.screens.some((s) => s.rules.length > 0 || s.actions.some((a) => a.rules.length > 0)) || m.actions.some((a) => a.rules.length > 0);
  }

  protected origin(n: AccessNodeDto): string {
    switch (n.origin) {
      case 'Operator': return 'set by an operator';
      case 'Plan': return 'set by the plan';
      case 'Module': return 'its module is off';
      case 'Screen': return 'follows its screens';
      default: return 'module default';
    }
  }

  // ---- Dialogs ----------------------------------------------------------------------------------------------

  private begin(state: DialogState): void {
    this.reason.set('');
    this.until.set('');
    this.scope.set('');
    this.dialogError.set(null);
    this.dialog.set(state);
  }

  protected openRule(item: AccessNodeDto, effect: AccessEffect): void {
    this.effect.set(effect);
    const module = this.tree()?.modules.find((m) => m.screens.some((s) => s.key === item.key || s.actions.some((a) => a.key === item.key)) || m.actions.some((a) => a.key === item.key));
    this.begin({ kind: 'rule', title: `${effect === 'Allow' ? 'Allow' : 'Withhold'}: ${item.name}`, item, module });
  }

  protected openOverride(m: AccessModuleNodeDto): void {
    this.begin({ kind: 'override', title: `Override: ${m.name}`, module: m });
    this.mode.set('Full');
    this.selective.set(false);
  }

  protected openClearOverride(m: AccessModuleNodeDto): void { this.begin({ kind: 'clear-override', title: `Remove override: ${m.name}`, module: m }); }
  protected openGrantModule(m: AccessModuleNodeDto): void { this.begin({ kind: 'grant-module', title: `Grant the whole module: ${m.name}`, module: m }); }
  protected openRevertModule(m: AccessModuleNodeDto): void { this.begin({ kind: 'revert-module', title: `Return to the plan: ${m.name}`, module: m }); }
  protected openRevokeRule(rule: AccessRuleDto, name: string): void { this.begin({ kind: 'revoke-rule', title: `Remove a rule: ${name}`, rule }); }
  protected openRevertApplication(): void { this.begin({ kind: 'revert-app', title: 'Revert the whole-application grant' }); }

  protected openGrantApplication(): void {
    this.begin({ kind: 'grant-app', title: 'Grant the whole application' });
    this.until.set(dayKey(addDays(new Date(), 30)));
  }

  protected close(): void {
    if (!this.busy()) this.dialog.set(null);
  }

  protected confirmLabel(): string {
    switch (this.dialog()?.kind) {
      case 'grant-app': return 'Grant whole application';
      case 'grant-module': return 'Grant whole module';
      case 'clear-override': case 'revoke-rule': return 'Remove';
      case 'revert-app': case 'revert-module': return 'Revert';
      default: return 'Apply';
    }
  }

  protected canConfirm(): boolean {
    if (this.busy() || this.reason().trim().length < 3) return false;
    if (this.dialog()?.kind === 'grant-app') {
      const u = this.until();
      return u >= this.tomorrow && u <= this.latest;   // required, and within the cap the server enforces
    }
    return true;
  }

  private endOfDay(): string | null {
    return this.until() ? new Date(this.until() + 'T23:59:59Z').toISOString() : null;
  }

  protected async run(): Promise<void> {
    const d = this.dialog();
    if (!d || !this.canConfirm()) return;
    this.busy.set(true);
    this.dialogError.set(null);
    const id = this.tenantId();
    const reason = this.reason().trim();
    try {
      switch (d.kind) {
        case 'rule':
          await firstValueFrom(this.api.setAccessRule(id, { itemKey: d.item!.key, effect: this.effect(), branchId: this.scope() || null, validUntilUtc: this.endOfDay(), reason }));
          break;
        case 'override':
          await firstValueFrom(this.api.setOverride(id, d.module!.key, this.mode(), this.endOfDay(), reason, this.selective() ? 'OnlyGranted' : 'All'));
          break;
        case 'clear-override': await firstValueFrom(this.api.clearOverride(id, d.module!.key, reason)); break;
        case 'grant-module': await firstValueFrom(this.api.grantModule(id, d.module!.key, this.endOfDay(), reason)); break;
        case 'revert-module': await firstValueFrom(this.api.revertModule(id, d.module!.key, reason)); break;
        case 'revoke-rule': await firstValueFrom(this.api.revokeAccessRule(id, d.rule!.id, reason)); break;
        case 'revert-app': await firstValueFrom(this.api.revertApplication(id, reason)); break;
        case 'grant-app': {
          const result = await firstValueFrom(this.api.grantApplication(id, this.endOfDay()!, reason));
          if (result.skippedModules.length > 0) this.toast.success(`Granted ${result.grantedModules.length} modules. Not built yet, so skipped: ${result.skippedModules.join(', ')}.`);
          break;
        }
      }
      this.dialog.set(null);
      await this.load(); // the change endpoints answer for the whole company; this re-reads for the branch being shown
      if (d.kind !== 'grant-app') this.toast.success('Done. The change is in the company\'s ledger.');
      this.changed.emit();
    } catch (err) {
      this.dialogError.set(toApiError(err).message);
    } finally { this.busy.set(false); }
  }
}
