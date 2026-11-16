import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MembershipStatus, PLATFORM_PERMISSIONS, PlatformUserAction, PlatformUserListItemDto } from '../../core/models/support.model';
import { toApiError } from '../../core/services/api.util';
import { PlatformSupportApi } from '../../core/services/support.services';
import { PlatformAuthService } from '../../core/services/subscription.services';
import { DialogComponent, ToastService } from '../../shared/ui/feedback';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';

const ACTIONS: Readonly<Record<PlatformUserAction, { label: string; help: string; danger?: boolean }>> = {
  unlock: { label: 'Unlock', help: 'Clears the failed-attempt lock on their PIN, card and password so they can try again.' },
  'revoke-sessions': { label: 'Sign out everywhere', help: 'Ends every signed-in session for this person.', danger: true },
  'send-reset': { label: 'Send reset link', help: 'E-mails them a link to choose a new password or PIN. You never see or set the credential yourself.' },
  deactivate: { label: 'Deactivate', help: 'Blocks sign-in and ends their sessions. Their records stay. The owner account cannot be deactivated here.', danger: true },
  reactivate: { label: 'Reactivate', help: 'Lets them sign in again.' }
};

/** Find any person in any company and look after their account. Credentials are never shown; every action needs a reason and is recorded in the company's activity log. */
@Component({
    selector: 'zp-platform-users',
    imports: [DatePipe, FormsModule, RouterLink, DialogComponent, StatusBadgeComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <h1 class="text-2xl font-bold">People</h1>
    <p class="text-sm text-ink/70">Everyone with an account in any company. Actions here are written to that company's activity log with your name and reason.</p>
    <div class="my-3 flex flex-wrap items-end gap-3">
      <div><label class="app-label" for="u-search">Search</label><input id="u-search" type="search" class="app-input w-72" placeholder="Name, e-mail, staff code or company" data-testid="user-search" [ngModel]="search()" (ngModelChange)="search.set($event)" (keydown.enter)="load()" /></div>
      <div><label class="app-label" for="u-status">Status</label><select id="u-status" class="app-input" data-testid="user-status" [ngModel]="status()" (ngModelChange)="status.set($event); load()">
        <option value="">Any</option><option value="Active">Active</option><option value="Invited">Invited</option><option value="Deactivated">Deactivated</option></select></div>
      <button type="button" class="btn-outline" data-testid="user-find" (click)="load()">Find</button>
      @if (tenantId()) { <button type="button" class="btn-ghost" data-testid="user-clear-company" (click)="clearCompany()">Showing one company: show all</button> }
    </div>
    @if (error()) { <p class="sys-alert sys-alert-danger mb-3" role="alert">{{ error() }}</p> }
    @if (notice()) { <p class="sys-alert sys-alert-success mb-3" role="status" data-testid="user-notice">{{ notice() }}</p> }

    <div class="app-card overflow-x-auto p-0"><table class="app-table" data-testid="user-table"><thead><tr><th>Person</th><th>Company</th><th>Roles</th><th>Status</th><th>Sessions</th><th>Last seen</th>@if (canManage()) { <th>Actions</th> }</tr></thead>
      <tbody>@for (u of items(); track u.membershipId) {
        <tr [attr.data-testid]="'user-' + u.staffCode + '-' + u.companySlug"><td><span class="font-medium">{{ u.displayName }}</span>@if (u.isOwner) { <span class="app-badge app-badge-primary ml-1">Owner</span> }<span class="block text-xs text-ink/60">#{{ u.staffCode }} {{ u.email }}</span></td>
          <td><a class="underline" [routerLink]="['/platform/customers', u.tenantId]">{{ u.companyName }}</a></td><td>{{ u.roles.join(', ') }}</td>
          <td><zp-status-badge [tone]="u.status === 'Active' ? 'success' : u.status === 'Invited' ? 'primary' : 'danger'">{{ u.status }}</zp-status-badge>@if (u.locked) { <zp-status-badge tone="warning"><span data-testid="user-locked">Locked</span></zp-status-badge> }</td>
          <td>{{ u.activeSessions }}</td><td class="whitespace-nowrap">{{ u.lastSeenAtUtc ? (u.lastSeenAtUtc | date: 'medium') : 'Never' }}</td>
          @if (canManage()) {
            <td class="whitespace-nowrap">
              @for (a of actionsFor(u); track a) { <button type="button" class="btn-ghost text-sm" [attr.data-testid]="'act-' + a + '-' + u.staffCode" (click)="ask(u, a)">{{ labelOf(a) }}</button> }
            </td>
          }</tr> }
        @empty { <tr><td colspan="7" class="py-8 text-center text-ink/70">{{ loading() ? 'Loading...' : 'No people match.' }}</td></tr> }</tbody></table></div>
    <p class="mt-2 text-sm text-ink/70" data-testid="user-total">{{ total() }} person(s)</p>

    <zp-dialog [open]="target() !== null" [title]="dialogTitle()" (closed)="target.set(null)">
      @if (target(); as t) {
        <form class="space-y-3" (submit)="$event.preventDefault(); run()">
          <p class="text-sm">{{ help(t.action) }}</p>
          <div><label class="app-label" for="ua-reason">Reason (kept in the company's activity log)</label>
            <input id="ua-reason" class="app-input" maxlength="400" data-testid="action-reason" [ngModel]="reason()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="reason.set($event)" /></div>
          @if (dialogError()) { <p class="sys-alert sys-alert-danger" role="alert">{{ dialogError() }}</p> }
          <div class="flex justify-end gap-2"><button type="button" class="btn-ghost" (click)="target.set(null)">Cancel</button>
            <button type="submit" [class]="isDanger(t.action) ? 'btn-danger' : 'btn-primary'" data-testid="action-confirm" [disabled]="busy() || reason().trim().length < 3">{{ labelOf(t.action) }}</button></div>
        </form>
      }
    </zp-dialog>
  `
})
export class PlatformUsersComponent implements OnInit {
  private readonly api = inject(PlatformSupportApi);
  private readonly route = inject(ActivatedRoute);
  private readonly platform = inject(PlatformAuthService);
  private readonly toast = inject(ToastService);

  protected readonly items = signal<readonly PlatformUserListItemDto[]>([]);
  protected readonly total = signal(0);
  protected readonly search = signal('');
  protected readonly status = signal<MembershipStatus | ''>('');
  protected readonly tenantId = signal('');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly target = signal<{ user: PlatformUserListItemDto; action: PlatformUserAction } | null>(null);
  protected readonly reason = signal('');
  protected readonly busy = signal(false);
  protected readonly dialogError = signal<string | null>(null);
  protected readonly canManage = computed(() => this.platform.can(PLATFORM_PERMISSIONS.USERS_MANAGE));
  protected readonly dialogTitle = computed(() => { const t = this.target(); return t ? `${ACTIONS[t.action].label}: ${t.user.displayName}` : ''; });

  ngOnInit(): void {
    this.tenantId.set(this.route.snapshot.queryParamMap.get('tenantId') ?? '');
    void this.load();
  }

  protected labelOf(a: PlatformUserAction): string { return ACTIONS[a].label; }
  protected help(a: PlatformUserAction): string { return ACTIONS[a].help; }
  protected isDanger(a: PlatformUserAction): boolean { return !!ACTIONS[a].danger; }

  protected actionsFor(u: PlatformUserListItemDto): PlatformUserAction[] {
    const list: PlatformUserAction[] = ['unlock', 'revoke-sessions', 'send-reset'];
    if (u.status === 'Deactivated') return ['reactivate'];
    if (!u.isOwner) list.push('deactivate');
    return list;
  }

  protected clearCompany(): void {
    this.tenantId.set('');
    void this.load();
  }

  protected ask(user: PlatformUserListItemDto, action: PlatformUserAction): void {
    this.reason.set('');
    this.dialogError.set(null);
    this.target.set({ user, action });
  }

  protected async run(): Promise<void> {
    const t = this.target();
    if (!t) return;
    this.busy.set(true);
    this.dialogError.set(null);
    try {
      const result = await firstValueFrom(this.api.userAction(t.user.membershipId, t.action, this.reason().trim()));
      this.items.update((list) => list.map((u) => (u.membershipId === result.user.membershipId ? result.user : u)));
      this.target.set(null);
      this.notice.set(`${t.user.displayName}: ${result.message}`);
      this.toast.success(result.message);
    } catch (err) { this.dialogError.set(toApiError(err).message); } finally { this.busy.set(false); }
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const page = await firstValueFrom(this.api.users({ search: this.search().trim() || undefined, tenantId: this.tenantId() || undefined, status: this.status(), pageSize: 100 }));
      this.items.set(page.items);
      this.total.set(page.total);
    } catch (err) { this.error.set(toApiError(err).message); } finally { this.loading.set(false); }
  }
}
