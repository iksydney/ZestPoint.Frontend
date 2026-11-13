import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { EMPTY, catchError, debounceTime, distinctUntilChanged, firstValueFrom, switchMap, tap } from 'rxjs';
import { SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { BranchDto, RoleDto, SessionDto, StaffDetailDto, StaffListItemDto } from '../../core/models/staff.model';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { OnboardingService } from '../../core/services/domain.services';
import { BranchesApiService, RolesApiService, StaffApiService } from '../../core/services/staff.services';
import { ConfirmService, DialogComponent, ToastService } from '../../shared/ui/feedback';
import { StatusBadgeComponent } from '../../shared/ui/ui-kit.components';

type Tone = 'success' | 'warning' | 'danger' | 'primary';

/**
 * Staff administration: list with filters, add/invite, and a per-person panel for roles, branches, PIN/RFID, sessions and
 * deactivation. Every control is also gated by the API; the buttons hidden here are a convenience, never the protection.
 */
@Component({
  selector: 'zp-staff-list',
  standalone: true,
  imports: [DatePipe, FormsModule, DialogComponent, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-3 flex flex-wrap items-end gap-2">
      <div class="min-w-[12rem] flex-1">
        <label class="app-label" for="f-search">Search</label>
        <input id="f-search" class="app-input" placeholder="Name, email or staff code" [ngModel]="search()" (ngModelChange)="search.set($event)" data-testid="staff-search" />
      </div>
      <div>
        <label class="app-label" for="f-status">Status</label>
        <select id="f-status" class="app-input" [ngModel]="status()" (ngModelChange)="status.set($event)">
          <option value="">All</option><option value="Active">Active</option><option value="Invited">Invited</option><option value="Deactivated">Deactivated</option>
        </select>
      </div>
      <div>
        <label class="app-label" for="f-role">Role</label>
        <select id="f-role" class="app-input" [ngModel]="roleId()" (ngModelChange)="roleId.set($event)">
          <option value="">All</option>@for (r of roles(); track r.id) { <option [value]="r.id">{{ r.name }}</option> }
        </select>
      </div>
      <div>
        <label class="app-label" for="f-branch">Branch</label>
        <select id="f-branch" class="app-input" [ngModel]="branchId()" (ngModelChange)="branchId.set($event)">
          <option value="">All</option>@for (b of branches(); track b.id) { <option [value]="b.id">{{ b.name }}</option> }
        </select>
      </div>
      @if (canManage()) { <button type="button" class="btn-primary" (click)="openCreate()" data-testid="add-staff">Add staff</button> }
    </div>

    @if (error()) { <p class="sys-alert sys-alert-danger mb-3" role="alert">{{ error() }}</p> }

    <div class="app-card overflow-x-auto p-0">
      <table class="app-table" data-testid="staff-table">
        <caption class="sr-only">Staff</caption>
        <thead><tr><th>Name</th><th>Code</th><th>Roles</th><th>Branches</th><th>Status</th><th>Sign-in</th><th>Last activity</th><th><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>
          @for (s of items(); track s.id) {
            <tr [attr.data-testid]="'staff-row-' + s.staffCode">
              <td class="font-medium">{{ s.displayName }} @if (s.isOwner) { <zp-status-badge tone="primary">Owner</zp-status-badge> }@if (s.id === me()?.id) { <span class="text-xs text-ink/60"> (you)</span> }
                @if (s.email) { <span class="block text-xs font-normal text-ink/70">{{ s.email }}</span> }</td>
              <td>{{ s.staffCode }}</td>
              <td>{{ s.roles.join(', ') }}</td>
              <td>{{ s.hasAllBranches ? 'All branches' : s.branches.join(', ') || 'None' }}</td>
              <td><zp-status-badge [tone]="statusTone(s)">{{ statusLabel(s) }}</zp-status-badge></td>
              <td class="text-xs">
                @if (s.hasPin) { <span>PIN{{ s.pinLocked ? ' (locked)' : '' }}</span> } @if (s.hasRfid) { <span> Card</span> }
                @if (!s.hasPin && !s.hasRfid) { <span class="text-ink/60">{{ s.email ? 'Email' : 'None' }}</span> }
              </td>
              <td class="text-xs">{{ s.lastActivityAtUtc ? (s.lastActivityAtUtc | date: 'medium') : 'Never' }}</td>
              <td class="text-right"><button type="button" class="btn-outline px-2 py-1 text-sm" (click)="openDetail(s.id)" [attr.data-testid]="'manage-' + s.staffCode">{{ canManage() ? 'Manage' : 'View' }}</button></td>
            </tr>
          } @empty {
            <tr><td colspan="8" class="py-8 text-center text-ink/70">{{ loading() ? 'Loading...' : 'No staff match these filters.' }}</td></tr>
          }
        </tbody>
      </table>
    </div>
    <div class="mt-2 flex items-center justify-between text-sm text-ink/80">
      <span>{{ total() }} staff</span>
      <span class="flex gap-2">
        <button type="button" class="btn-outline px-2 py-1" [disabled]="page() <= 1" (click)="page.set(page() - 1)">Previous</button>
        <button type="button" class="btn-outline px-2 py-1" [disabled]="page() * pageSize >= total()" (click)="page.set(page() + 1)">Next</button>
      </span>
    </div>

    <!-- ===== Add staff ===== -->
    <zp-dialog [open]="createOpen()" title="Add a staff member" (closed)="createOpen.set(false)">
      <form class="space-y-3" (ngSubmit)="create()" novalidate>
        <div>
          <label class="app-label" for="c-name">Full name</label>
          <input id="c-name" name="name" class="app-input" [ngModel]="c().displayName" (ngModelChange)="patchC({ displayName: $event })" data-testid="new-name" />
          @if (cErrors()['displayName']) { <p class="app-error" role="alert">{{ cErrors()['displayName'] }}</p> }
        </div>
        <fieldset>
          <legend class="app-label">How will they sign in?</legend>
          <label class="mr-4 inline-flex items-center gap-2 text-sm"><input type="radio" name="method" [checked]="!c().sendInvitation" (change)="patchC({ sendInvitation: false })" data-testid="method-pin" /> PIN set by me</label>
          <label class="inline-flex items-center gap-2 text-sm"><input type="radio" name="method" [checked]="c().sendInvitation" (change)="patchC({ sendInvitation: true })" data-testid="method-invite" /> Email invitation</label>
        </fieldset>
        @if (c().sendInvitation) {
          <div>
            <label class="app-label" for="c-email">Email</label>
            <input id="c-email" name="email" type="email" class="app-input" [ngModel]="c().email" (ngModelChange)="patchC({ email: $event })" data-testid="new-email" />
            @if (cErrors()['email']) { <p class="app-error" role="alert">{{ cErrors()['email'] }}</p> }
            <p class="app-hint">They get an e-mail with a link and a default PIN. Opening the link asks for that PIN once, then they choose their own.</p>
          </div>
        } @else {
          <div>
            <label class="app-label" for="c-pin">PIN (4 to 12 digits)</label>
            <input id="c-pin" name="pin" type="password" inputmode="numeric" autocomplete="off" class="app-input w-40" [ngModel]="c().pin" (ngModelChange)="patchC({ pin: $event })" data-testid="new-pin" />
            @if (cErrors()['pin']) { <p class="app-error" role="alert">{{ cErrors()['pin'] }}</p> }
          </div>
        }
        <fieldset>
          <legend class="app-label">Roles</legend>
          <div class="grid gap-1 sm:grid-cols-2">
            @for (r of assignableRoles(); track r.id) {
              <label class="flex items-center gap-2 text-sm"><input type="checkbox" [checked]="c().roleIds.includes(r.id)" (change)="toggleCRole(r.id)" [attr.data-testid]="'new-role-' + r.systemKey" /> {{ r.name }}</label>
            }
          </div>
          @if (cErrors()['roleIds']) { <p class="app-error" role="alert">{{ cErrors()['roleIds'] }}</p> }
        </fieldset>
        <fieldset>
          <legend class="app-label">Branches</legend>
          <label class="mb-1 flex items-center gap-2 text-sm"><input type="checkbox" [checked]="c().hasAllBranches" (change)="patchC({ hasAllBranches: !c().hasAllBranches })" /> All branches</label>
          @if (!c().hasAllBranches) {
            <div class="grid gap-1 sm:grid-cols-2">
              @for (b of activeBranches(); track b.id) { <label class="flex items-center gap-2 text-sm"><input type="checkbox" [checked]="c().branchIds.includes(b.id)" (change)="toggleCBranch(b.id)" /> {{ b.name }}</label> }
            </div>
          }
          @if (cErrors()['branchIds']) { <p class="app-error" role="alert">{{ cErrors()['branchIds'] }}</p> }
        </fieldset>
        @if (cError()) { <p class="app-error" role="alert">{{ cError() }}</p> }
        <div class="flex justify-end gap-2 pt-1">
          <button type="button" class="btn-ghost" (click)="createOpen.set(false)">Cancel</button>
          <button type="submit" class="btn-primary" [disabled]="saving()" data-testid="create-staff">{{ saving() ? 'Adding...' : 'Add staff' }}</button>
        </div>
      </form>
    </zp-dialog>

    <!-- ===== Person panel ===== -->
    <!-- Shown right after someone is added, so the code they sign in with is never missed. -->
    <zp-dialog [open]="!!added()" title="Staff member added" (closed)="added.set(null)">
      @if (added(); as a) {
        <div class="space-y-3" data-testid="staff-added">
          <p class="text-sm"><strong>{{ a.displayName }}</strong> has been added. Give them this staff code: they need it every time they sign in.</p>
          <div class="rounded-lg border border-ink/15 bg-ink/5 p-4 text-center">
            <p class="text-xs uppercase tracking-wide text-ink/70">Staff code</p>
            <p class="font-mono text-3xl font-bold tracking-wider" data-testid="staff-added-code">{{ a.staffCode }}</p>
          </div>
          <div class="text-sm">
            <p class="font-medium">How they sign in</p>
            <ol class="ml-5 list-decimal space-y-1 text-ink/80">
              <li>Open the sign-in page and choose <strong>Staff PIN</strong>.</li>
              <li>Venue: <strong data-testid="staff-added-venue">{{ auth.tenant()?.slug }}</strong></li>
              <li>Staff code: <strong>{{ a.staffCode }}</strong> (capital letters and the dash are optional)</li>
              <li>{{ a.hasPin ? 'The PIN you set for them.' : 'The PIN from their invitation e-mail; they choose their own after accepting it.' }}</li>
            </ol>
          </div>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-outline" data-testid="staff-added-copy" (click)="copyCode(a.staffCode)">Copy code</button>
            <button type="button" class="btn-primary" data-testid="staff-added-done" (click)="added.set(null)">Done</button>
          </div>
        </div>
      }
    </zp-dialog>

    <zp-dialog [open]="!!detail()" [title]="detail()?.displayName ?? 'Staff member'" [wide]="true" (closed)="detail.set(null)">
      @if (detail(); as d) {
        <div class="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <zp-status-badge [tone]="statusTone(d)">{{ statusLabel(d) }}</zp-status-badge>
          <span class="text-ink/70">Staff code <strong class="font-mono text-ink" data-testid="detail-staff-code">{{ d.staffCode }}</strong></span>
          @if (d.email) { <span class="text-ink/70">{{ d.email }}</span> }
          <span class="text-ink/70">{{ d.activeSessions }} active session(s)</span>
        </div>
        @if (devLink()) { <p class="sys-alert sys-alert-info mb-3 break-all" role="status">Development invitation link: <a [href]="devLink()" class="underline" data-testid="dev-invite-link">{{ devLink() }}</a>@if (devPin()) { <br />Development default PIN: <strong data-testid="dev-default-pin">{{ devPin() }}</strong> }</p> }
        @if (dError()) { <p class="sys-alert sys-alert-danger mb-3" role="alert" data-testid="detail-error">{{ dError() }}</p> }

        <div class="grid gap-4 md:grid-cols-2">
          <section class="space-y-3" aria-label="Profile and access">
            <div>
              <label class="app-label" for="d-name">Name</label>
              <input id="d-name" class="app-input" [ngModel]="e().displayName" (ngModelChange)="patchE({ displayName: $event })" [disabled]="!canManage()" />
            </div>
            <fieldset [disabled]="!canManage() || d.isOwner">
              <legend class="app-label">Roles</legend>
              @for (r of roles(); track r.id) {
                <label class="flex items-center gap-2 text-sm" [class.opacity-50]="r.isSuperAdmin"><input type="checkbox" [checked]="e().roleIds.includes(r.id)" [disabled]="r.isSuperAdmin && !d.isOwner" (change)="toggleERole(r.id)" [attr.data-testid]="'edit-role-' + r.systemKey" /> {{ r.name }}</label>
              }
            </fieldset>
            <fieldset [disabled]="!canManage() || d.isOwner">
              <legend class="app-label">Branches</legend>
              <label class="mb-1 flex items-center gap-2 text-sm"><input type="checkbox" [checked]="e().hasAllBranches" (change)="patchE({ hasAllBranches: !e().hasAllBranches })" /> All branches</label>
              @if (!e().hasAllBranches) { @for (b of activeBranches(); track b.id) { <label class="flex items-center gap-2 text-sm"><input type="checkbox" [checked]="e().branchIds.includes(b.id)" (change)="toggleEBranch(b.id)" /> {{ b.name }}</label> } }
            </fieldset>
            @if (canManage()) { <button type="button" class="btn-primary" (click)="saveProfile()" [disabled]="saving()" data-testid="save-staff">Save changes</button> }
          </section>

          <section class="space-y-3" aria-label="Sign-in and sessions">
            <div class="app-card space-y-2">
              <p class="text-sm font-semibold">PIN</p>
              <p class="text-xs text-ink/70">{{ d.hasPin ? (d.pinLocked ? 'A PIN is set but locked after too many wrong attempts. Setting a new one unlocks it.' : 'A PIN is set.') : 'No PIN set.' }}</p>
              @if (canManage()) {
                <div class="flex gap-2">
                  <input class="app-input w-32" type="password" inputmode="numeric" autocomplete="off" placeholder="New PIN" [ngModel]="newPin()" (ngModelChange)="newPin.set($event)" aria-label="New PIN" data-testid="set-pin-input" />
                  <button type="button" class="btn-outline" (click)="setPin()" [disabled]="!newPin()" data-testid="set-pin">{{ d.hasPin ? 'Reset PIN' : 'Set PIN' }}</button>
                  @if (d.hasPin) { <button type="button" class="btn-ghost" (click)="removeCredential('pin')">Remove</button> }
                </div>
              }
            </div>
            @if (rfidAvailable()) {
              <div class="app-card space-y-2">
                <p class="text-sm font-semibold">Card (RFID)</p>
                <p class="text-xs text-ink/70">{{ d.hasRfid ? 'A card is assigned.' : 'No card assigned.' }}</p>
                @if (canManage()) {
                  <div class="flex gap-2">
                    <input class="app-input" autocomplete="off" placeholder="Scan or type the card ID" [ngModel]="cardUid()" (ngModelChange)="cardUid.set($event)" aria-label="Card ID" />
                    <button type="button" class="btn-outline" (click)="setRfid()" [disabled]="cardUid().length < 4">Assign</button>
                    @if (d.hasRfid) { <button type="button" class="btn-ghost" (click)="removeCredential('rfid')">Remove</button> }
                  </div>
                }
              </div>
            }
            @if (canManage()) {
              <div class="app-card space-y-2">
                <p class="text-sm font-semibold">Sessions</p>
                @for (s of sessions(); track s.id) {
                  <p class="text-xs text-ink/80">{{ s.authMethod }}{{ s.isCurrent ? ' (this device)' : '' }} - last seen {{ s.lastSeenAtUtc ? (s.lastSeenAtUtc | date: 'short') : 'never' }}</p>
                } @empty { <p class="text-xs text-ink/70">No active sessions.</p> }
                <button type="button" class="btn-outline" (click)="revokeSessions()" [disabled]="d.activeSessions === 0" data-testid="revoke-sessions">Sign out everywhere</button>
              </div>
              @if (!d.isOwner && d.id !== me()?.id) {
                <div class="flex flex-wrap gap-2">
                  @if (d.status === 'Deactivated') { <button type="button" class="btn-primary" (click)="reactivate()" data-testid="reactivate">Reactivate</button> }
                  @else { <button type="button" class="btn-outline" (click)="deactivate()" data-testid="deactivate">Deactivate</button> }
                  @if (d.email) { <button type="button" class="btn-outline" (click)="resend()">Resend invitation</button> }
                </div>
              }
            }
          </section>
        </div>
      }
    </zp-dialog>
  `
})
export class StaffListComponent {
  private readonly api = inject(StaffApiService);
  private readonly rolesApi = inject(RolesApiService);
  private readonly branchesApi = inject(BranchesApiService);
  private readonly onboarding = inject(OnboardingService);
  protected readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly destroyRef = inject(DestroyRef);

  readonly changed = output<void>();
  readonly pageSize = 25;

  protected readonly me = this.auth.membership;
  protected readonly canManage = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.STAFF_MANAGE));

  protected readonly search = signal('');
  protected readonly status = signal('');
  protected readonly roleId = signal('');
  protected readonly branchId = signal('');
  protected readonly page = signal(1);

  protected readonly items = signal<readonly StaffListItemDto[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly roles = signal<RoleDto[]>([]);
  protected readonly branches = signal<BranchDto[]>([]);
  protected readonly activeBranches = computed(() => this.branches().filter((b) => b.isActive));
  protected readonly assignableRoles = computed(() => this.roles().filter((r) => !r.isSuperAdmin));
  protected readonly rfidAvailable = signal(true);

  // create dialog
  protected readonly createOpen = signal(false);
  protected readonly c = signal(emptyCreate());
  protected readonly cErrors = signal<Record<string, string>>({});
  protected readonly cError = signal<string | null>(null);
  protected readonly saving = signal(false);

  // detail dialog
  protected readonly detail = signal<StaffDetailDto | null>(null);
  protected readonly e = signal({ displayName: '', roleIds: [] as string[], hasAllBranches: false, branchIds: [] as string[] });
  protected readonly dError = signal<string | null>(null);
  protected readonly devLink = signal<string | null>(null);
  /** The person just added; drives the "Staff member added" panel that shows their sign-in code. */
  protected readonly added = signal<StaffDetailDto | null>(null);
  protected readonly devPin = signal<string | null>(null);
  protected readonly sessions = signal<SessionDto[]>([]);
  protected readonly newPin = signal('');
  protected readonly cardUid = signal('');

  constructor() {
    this.rolesApi.list().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (r) => this.roles.set(r), error: () => undefined });
    this.branchesApi.list().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (b) => this.branches.set(b), error: () => undefined });

    const filters = computed(() => ({ s: this.search().trim(), st: this.status(), r: this.roleId(), b: this.branchId(), p: this.page() }));
    toObservable(filters).pipe(
      debounceTime(250),
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      tap(() => { this.loading.set(true); this.error.set(null); }),
      switchMap((f) => this.api.list({ search: f.s, status: f.st, roleId: f.r, branchId: f.b, page: f.p, pageSize: this.pageSize }).pipe(
        catchError((e: unknown) => { this.error.set(toApiError(e).message); this.loading.set(false); return EMPTY; }) // keep the stream alive after a failure
      )),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((r) => { this.items.set(r.items); this.total.set(r.total); this.loading.set(false); });
  }

  protected reload(): void {
    this.api.list({ search: this.search().trim(), status: this.status(), roleId: this.roleId(), branchId: this.branchId(), page: this.page(), pageSize: this.pageSize })
      .subscribe({ next: (r) => { this.items.set(r.items); this.total.set(r.total); }, error: (e: unknown) => this.error.set(toApiError(e).message) });
  }

  // ---- labels ---------------------------------------------------------------------------------

  protected statusLabel(s: StaffListItemDto): string {
    if (s.status === 'Invited') return s.inviteExpired ? 'Invite expired' : 'Invited';
    return s.status;
  }

  protected statusTone(s: StaffListItemDto): Tone {
    return s.status === 'Active' ? 'success' : s.status === 'Invited' ? (s.inviteExpired ? 'danger' : 'warning') : 'danger';
  }

  // ---- create ---------------------------------------------------------------------------------

  protected async copyCode(code: string): Promise<void> {
    try { await navigator.clipboard.writeText(code); this.toast.success('Staff code copied.'); }
    catch { this.toast.error('Could not copy. Write the code down instead.'); }
  }

  protected openCreate(): void {
    this.c.set(emptyCreate());
    this.cErrors.set({});
    this.cError.set(null);
    this.createOpen.set(true);
  }

  protected patchC(change: Partial<ReturnType<typeof emptyCreate>>): void {
    this.c.update((cur) => ({ ...cur, ...change }));
  }

  protected toggleCRole(id: string): void { this.patchC({ roleIds: toggle(this.c().roleIds, id) }); }
  protected toggleCBranch(id: string): void { this.patchC({ branchIds: toggle(this.c().branchIds, id) }); }

  protected async create(): Promise<void> {
    const v = this.c();
    this.saving.set(true);
    this.cErrors.set({});
    this.cError.set(null);
    try {
      const result = await firstValueFrom(this.api.create({
        displayName: v.displayName.trim(), email: v.sendInvitation ? v.email.trim() || null : null, roleIds: v.roleIds,
        hasAllBranches: v.hasAllBranches, branchIds: v.hasAllBranches ? [] : v.branchIds, pin: v.sendInvitation ? null : v.pin || null, sendInvitation: v.sendInvitation
      }));
      this.createOpen.set(false);
      this.toast.success(`${result.staff.displayName} added (staff code ${result.staff.staffCode}).`);
      if (result.devInviteLink) { this.devLink.set(result.devInviteLink); this.devPin.set(result.devDefaultPin); this.detail.set(result.staff); this.beginEdit(result.staff); }
      else this.added.set(result.staff);
      this.reload();
      this.changed.emit();
      this.completeStaffStepIfNeeded();
    } catch (err) {
      const e = toApiError(err);
      const map: Record<string, string> = {};
      for (const [k, v2] of Object.entries(e.fieldErrors)) map[k] = v2[0] ?? '';
      this.cErrors.set(map);
      this.cError.set(Object.keys(map).length ? null : e.message);
    } finally {
      this.saving.set(false);
    }
  }

  /** Adding the first teammate finishes the "Staff & roles" onboarding step. */
  private completeStaffStepIfNeeded(): void {
    const done = this.auth.onboarding()?.steps.find((s) => s.step === 'Staff')?.completed;
    if (done === false && this.auth.hasPermission(SCREEN_PERMISSIONS.SETTINGS_COMPANY_MANAGE))
      this.onboarding.completeStep('Staff').subscribe({ next: (p) => this.auth.patchOnboarding(p), error: () => undefined });
  }

  // ---- person panel ---------------------------------------------------------------------------

  protected async openDetail(id: string): Promise<void> {
    this.dError.set(null);
    this.devLink.set(null);
    this.devPin.set(null);
    try {
      const d = await firstValueFrom(this.api.get(id));
      this.beginEdit(d);
      this.detail.set(d);
      this.loadSessions(id);
    } catch (err) {
      this.error.set(toApiError(err).message);
    }
  }

  private beginEdit(d: StaffDetailDto): void {
    this.e.set({ displayName: d.displayName, roleIds: [...d.roleIds], hasAllBranches: d.hasAllBranches, branchIds: [...d.branchIds] });
    this.newPin.set('');
    this.cardUid.set('');
  }

  private loadSessions(id: string): void {
    if (!this.canManage()) return;
    this.api.sessions(id).subscribe({ next: (s) => this.sessions.set(s), error: () => this.sessions.set([]) });
  }

  protected patchE(change: Partial<ReturnType<typeof this.e>>): void { this.e.update((cur) => ({ ...cur, ...change })); }
  protected toggleERole(id: string): void { this.patchE({ roleIds: toggle(this.e().roleIds, id) }); }
  protected toggleEBranch(id: string): void { this.patchE({ branchIds: toggle(this.e().branchIds, id) }); }

  private async act(work: () => Promise<StaffDetailDto>, success: string): Promise<void> {
    this.dError.set(null);
    this.saving.set(true);
    try {
      const d = await work();
      this.detail.set(d);
      this.beginEdit(d);
      this.loadSessions(d.id);
      this.toast.success(success);
      this.reload();
      this.changed.emit();
    } catch (err) {
      this.dError.set(toApiError(err).message);
    } finally {
      this.saving.set(false);
    }
  }

  protected saveProfile(): Promise<void> {
    const d = this.detail()!;
    const v = this.e();
    return this.act(() => firstValueFrom(this.api.update(d.id, {
      displayName: v.displayName.trim(), roleIds: v.roleIds, hasAllBranches: v.hasAllBranches, branchIds: v.hasAllBranches ? [] : v.branchIds, rowVersion: d.rowVersion
    })), 'Changes saved.');
  }

  protected setPin(): Promise<void> {
    const d = this.detail()!;
    return this.act(() => firstValueFrom(this.api.setPin(d.id, this.newPin())), 'PIN saved. Their sessions were signed out.');
  }

  protected setRfid(): Promise<void> {
    const d = this.detail()!;
    return this.act(() => firstValueFrom(this.api.setRfid(d.id, this.cardUid())), 'Card assigned.');
  }

  protected async removeCredential(type: 'pin' | 'rfid'): Promise<void> {
    const d = this.detail()!;
    if (!(await this.confirm.ask({ title: `Remove ${type === 'pin' ? 'PIN' : 'card'}?`, message: `${d.displayName} will no longer be able to sign in with it.`, confirmLabel: 'Remove', danger: true }))) return;
    await this.act(() => firstValueFrom(this.api.removeCredential(d.id, type)), 'Removed.');
  }

  protected async deactivate(): Promise<void> {
    const d = this.detail()!;
    if (!(await this.confirm.ask({ title: `Deactivate ${d.displayName}?`, message: 'They are signed out immediately and cannot sign in until reactivated. Their history is kept.', confirmLabel: 'Deactivate', danger: true }))) return;
    await this.act(() => firstValueFrom(this.api.deactivate(d.id)), 'Deactivated and signed out.');
  }

  protected reactivate(): Promise<void> {
    const d = this.detail()!;
    return this.act(() => firstValueFrom(this.api.reactivate(d.id)), 'Reactivated.');
  }

  protected async revokeSessions(): Promise<void> {
    const d = this.detail()!;
    this.dError.set(null);
    try {
      const n = await firstValueFrom(this.api.revokeSessions(d.id));
      this.toast.success(n === 0 ? 'No active sessions.' : `${n} session(s) signed out.`);
      await this.openDetail(d.id);
    } catch (err) {
      this.dError.set(toApiError(err).message);
    }
  }

  protected async resend(): Promise<void> {
    const d = this.detail()!;
    this.dError.set(null);
    try {
      const r = await firstValueFrom(this.api.resendInvite(d.id));
      this.devLink.set(r.devInviteLink);
      this.devPin.set(r.devDefaultPin);
      this.toast.success('Invitation sent.');
    } catch (err) {
      this.dError.set(toApiError(err).message);
    }
  }
}

function emptyCreate() {
  return { displayName: '', email: '', pin: '', roleIds: [] as string[], hasAllBranches: true, branchIds: [] as string[], sendInvitation: false };
}

function toggle(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}
