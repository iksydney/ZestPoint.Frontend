import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { PlatformOperatorDto, PlatformRole, ROLE_LABEL } from '../../core/models/support.model';
import { toApiError } from '../../core/services/api.util';
import { PlatformSupportApi } from '../../core/services/support.services';
import { PlatformAuthService } from '../../core/services/subscription.services';
import { ConfirmService, DialogComponent, ToastService } from '../../shared/ui/feedback';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';

/** The people who run ZestPoint: add operators, set their role, switch them off. Administrators only. */
@Component({
    selector: 'zp-platform-operators',
    imports: [DatePipe, FormsModule, DialogComponent, StatusBadgeComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div><h1 class="text-2xl font-bold">Operators</h1>
        <p class="text-sm text-ink/70">Support agents answer tickets and log notes. Support leads also assign, change status, manage people and customer records. Administrators also run billing and operators.</p></div>
      <button type="button" class="btn-primary" data-testid="op-new" (click)="openNew()">Add operator</button>
    </div>
    @if (error()) { <p class="sys-alert sys-alert-danger my-3" role="alert">{{ error() }}</p> }
    <div class="app-card mt-3 overflow-x-auto p-0"><table class="app-table" data-testid="op-table"><thead><tr><th>Name</th><th>E-mail</th><th>Role</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead>
      <tbody>@for (o of items(); track o.id) {
        <tr [attr.data-testid]="'op-' + o.email"><td>{{ o.displayName }}@if (o.id === myId()) { <span class="app-badge app-badge-primary ml-1">You</span> }</td><td>{{ o.email }}</td>
          <td>
            @if (o.id === myId()) { {{ roleLabel(o.role) }} } @else {
              <select class="app-input w-auto" [attr.aria-label]="'Role of ' + o.displayName" [attr.data-testid]="'op-role-' + o.email" [ngModel]="o.role" (ngModelChange)="changeRole(o, $event)">
                @for (r of roles; track r) { <option [value]="r">{{ roleLabel(r) }}</option> }</select> }
          </td>
          <td><zp-status-badge [tone]="o.isActive ? 'success' : 'danger'">{{ o.isActive ? 'Active' : 'Switched off' }}</zp-status-badge></td>
          <td class="whitespace-nowrap">{{ o.lastLoginAtUtc ? (o.lastLoginAtUtc | date: 'medium') : 'Never' }}</td>
          <td>@if (o.id !== myId()) { <button type="button" class="btn-ghost text-sm" [attr.data-testid]="'op-toggle-' + o.email" (click)="toggle(o)">{{ o.isActive ? 'Switch off' : 'Switch on' }}</button> }</td></tr> }
        @empty { <tr><td colspan="6" class="py-8 text-center text-ink/70">{{ loading() ? 'Loading...' : 'No operators.' }}</td></tr> }</tbody></table></div>

    <zp-dialog [open]="creating()" title="Add operator" (closed)="creating.set(false)">
      <form class="space-y-3" (submit)="$event.preventDefault(); create()">
        <div><label class="app-label" for="on-name">Name</label><input id="on-name" class="app-input" data-testid="op-name" [ngModel]="draft().displayName" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ displayName: $event })" /></div>
        <div><label class="app-label" for="on-email">E-mail (their sign-in)</label><input id="on-email" type="email" class="app-input" data-testid="op-email" [ngModel]="draft().email" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ email: $event })" /></div>
        <div><label class="app-label" for="on-role">Role</label><select id="on-role" class="app-input" data-testid="op-role" [ngModel]="draft().role" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ role: $event })">@for (r of roles; track r) { <option [value]="r">{{ roleLabel(r) }}</option> }</select></div>
        <div><label class="app-label" for="on-pw">Initial password (at least 12 characters)</label><input id="on-pw" type="password" autocomplete="new-password" class="app-input" data-testid="op-password" [ngModel]="draft().initialPassword" [ngModelOptions]="{ standalone: true }" (ngModelChange)="patch({ initialPassword: $event })" />
          <p class="mt-1 text-xs text-ink/60">Give it to them in person. It is stored hashed and never shown again.</p></div>
        @if (createError()) { <p class="sys-alert sys-alert-danger" role="alert">{{ createError() }}</p> }
        <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="creating.set(false)">Cancel</button>
          <button type="submit" class="btn-primary" data-testid="op-create" [disabled]="busy() || draft().displayName.trim().length < 2 || !draft().email.includes('@') || draft().initialPassword.length < 12">Add operator</button></div>
      </form>
    </zp-dialog>
  `
})
export class PlatformOperatorsComponent implements OnInit {
  private readonly api = inject(PlatformSupportApi);
  private readonly platform = inject(PlatformAuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly roles: readonly PlatformRole[] = ['SupportAgent', 'SupportLead', 'Admin'];
  protected readonly items = signal<readonly PlatformOperatorDto[]>([]);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly creating = signal(false);
  protected readonly createError = signal<string | null>(null);
  protected readonly draft = signal<{ displayName: string; email: string; role: PlatformRole; initialPassword: string }>({ displayName: '', email: '', role: 'SupportAgent', initialPassword: '' });

  protected myId(): string | null { return this.platform.session()?.id ?? null; }
  protected roleLabel(r: PlatformRole): string { return ROLE_LABEL[r]; }
  protected patch(p: Partial<ReturnType<typeof this.draft>>): void { this.draft.update((d) => ({ ...d, ...p })); }

  ngOnInit(): void { void this.load(); }

  protected openNew(): void {
    this.draft.set({ displayName: '', email: '', role: 'SupportAgent', initialPassword: '' });
    this.createError.set(null);
    this.creating.set(true);
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try { this.items.set(await firstValueFrom(this.api.operators())); } catch (err) { this.error.set(toApiError(err).message); } finally { this.loading.set(false); }
  }

  protected async create(): Promise<void> {
    const d = this.draft();
    this.busy.set(true);
    this.createError.set(null);
    try {
      await firstValueFrom(this.api.createOperator({ displayName: d.displayName.trim(), email: d.email.trim(), role: d.role, initialPassword: d.initialPassword }));
      this.creating.set(false);
      this.toast.success('Operator added. Give them the initial password in person.');
      await this.load();
    } catch (err) { this.createError.set(toApiError(err).message); } finally { this.busy.set(false); }
  }

  protected async changeRole(o: PlatformOperatorDto, role: PlatformRole): Promise<void> {
    await this.save(o, role, o.isActive, `${o.displayName} is now a ${ROLE_LABEL[role].toLowerCase()}.`);
  }

  protected async toggle(o: PlatformOperatorDto): Promise<void> {
    if (o.isActive && !(await this.confirm.ask({ title: `Switch off ${o.displayName}?`, message: 'They are signed out of the platform at once and cannot sign in again until switched back on.', confirmLabel: 'Switch off' }))) return;
    await this.save(o, o.role, !o.isActive, o.isActive ? `${o.displayName} was switched off.` : `${o.displayName} was switched on.`);
  }

  private async save(o: PlatformOperatorDto, role: PlatformRole, isActive: boolean, done: string): Promise<void> {
    this.error.set(null);
    try {
      await firstValueFrom(this.api.updateOperator(o.id, { role, isActive }));
      this.toast.success(done);
    } catch (err) { this.error.set(toApiError(err).message); }
    await this.load(); // always show what the server holds, including after a refusal
  }
}
