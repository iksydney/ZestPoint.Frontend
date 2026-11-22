import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { BranchStaffDto, LimitedStaffDto, RoleDto } from '../../core/models/staff.model';
import { toApiError } from '../../core/services/api.util';
import { AuthService } from '../../core/services/auth.service';
import { RolesApiService, StaffApiService } from '../../core/services/staff.services';
import { DialogComponent, ToastService } from '../../shared/ui/feedback';

type Step = 'keep' | 'choose' | 'existing' | 'new';

/**
 * "Who works at this branch?" (owner's decision, 2026-11-22). Opens right after a branch is created and from the branch's own row: a new branch is not visible to people it was not
 * given to, so the owner says who works there, by adding people who already work for the company or by creating new people for it, as many times as needed, then Done.
 * After a new branch it first lists the people who worked at "every branch" and now work only at the branches they had, so the owner can give any of them every branch again.
 * The server decides everything (who may be changed, that nobody is left without a branch); this window only asks and shows what it answered.
 */
@Component({
    selector: 'zp-branch-people',
    imports: [FormsModule, DialogComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <zp-dialog [open]="open()" [title]="'Who works at ' + branchName() + '?'" [wide]="true" (closed)="finish()">
      <div class="space-y-4" data-testid="branch-people">
        @if (!canManage()) {
          <p class="sys-alert sys-alert-info" role="status" data-testid="bp-no-right">Adding people to a branch needs the right to manage staff, which you do not have. Ask someone who has it: they will find a "Staff of this branch" button on this branch.</p>
          <div class="flex justify-end"><button type="button" class="btn-primary" data-testid="bp-close" (click)="finish()">Close</button></div>
        } @else {
          @if (error()) { <p class="sys-alert sys-alert-danger" role="alert" data-testid="bp-error">{{ error() }}</p> }

          @switch (step()) {
            @case ('keep') {
              <section class="space-y-3" aria-label="People who worked at every branch" data-testid="bp-keep">
                <p class="text-sm">{{ branchName() }} is saved. These people used to work at <strong>every branch</strong>. So that {{ branchName() }} does not appear to them by itself, they now work only at the branches they had, and they do not see {{ branchName() }}.</p>
                @if (data()?.canGiveEveryBranch) {
                  <p class="text-sm text-ink/80">Tick anyone who should work at every branch again: they will see {{ branchName() }} and every branch you add later. Paying suppliers and setting up printers need "every branch".</p>
                } @else {
                  <p class="text-sm text-ink/80">Only someone who works at every branch can give a person every branch.</p>
                }
                <ul class="divide-y divide-ink/10 rounded-lg border border-ink/15">
                  @for (p of limited(); track p.membershipId) {
                    <li class="flex items-center justify-between gap-3 px-3 py-2">
                      <label class="flex items-center gap-2 text-sm">
                        <input type="checkbox" [disabled]="!data()?.canGiveEveryBranch || busy()" [checked]="every().has(p.membershipId)" (change)="toggleEvery(p.membershipId)" [attr.data-testid]="'bp-keep-' + p.displayName" />
                        <span class="font-medium">{{ p.displayName }}</span>
                      </label>
                      <span class="text-xs text-ink/70">{{ p.roles.join(', ') }}</span>
                    </li>
                  }
                </ul>
                <div class="flex justify-end"><button type="button" class="btn-primary" data-testid="bp-keep-next" [disabled]="busy()" (click)="keepNext()">{{ busy() ? 'Saving...' : 'Next' }}</button></div>
              </section>
            }
            @case ('choose') {
              <section class="space-y-3" aria-label="Choose what to do" data-testid="bp-choose">
                <p class="text-sm">Who will work at <strong>{{ branchName() }}</strong>? Only the people you add here see it, and you, as the owner. You can come back to this window from the branch's "Staff of this branch" button.</p>
                @if (summary().length) {
                  <ul class="rounded-lg bg-ink/5 px-3 py-2 text-sm" data-testid="bp-summary">@for (line of summary(); track $index) { <li>{{ line }}</li> }</ul>
                }
                <div class="grid gap-2 sm:grid-cols-2">
                  <button type="button" class="btn-outline touch-target text-left" data-testid="bp-existing" (click)="goExisting()"><span class="block font-semibold">Add people who already work here</span><span class="block text-xs font-normal text-ink/70">Choose from your staff.</span></button>
                  <button type="button" class="btn-outline touch-target text-left" data-testid="bp-new" (click)="goNew()"><span class="block font-semibold">Create a new person for this branch</span><span class="block text-xs font-normal text-ink/70">Name, role and a way to sign in.</span></button>
                </div>
                <div class="flex justify-end"><button type="button" class="btn-primary" data-testid="bp-done" (click)="finish()">{{ summary().length ? 'Done' : 'Skip for now' }}</button></div>
              </section>
            }
            @case ('existing') {
              <section class="space-y-3" aria-label="Add people who already work here" data-testid="bp-existing-step">
                <div><label class="app-label" for="bp-search">Find a person</label><input id="bp-search" class="app-input" data-testid="bp-search" placeholder="Name, role or staff code" [ngModel]="search()" (ngModelChange)="search.set($event)" [ngModelOptions]="{ standalone: true }" /></div>
                <ul class="max-h-80 divide-y divide-ink/10 overflow-auto rounded-lg border border-ink/15" data-testid="bp-people">
                  @for (p of visible(); track p.membershipId) {
                    <li class="flex items-center justify-between gap-3 px-3 py-2">
                      <label class="flex items-center gap-2 text-sm">
                        <input type="checkbox" [disabled]="p.hasAllBranches || p.isYou || busy()" [checked]="p.hasAllBranches || ticked().has(p.membershipId)" (change)="toggle(p.membershipId)" [attr.data-testid]="'bp-person-' + p.displayName" />
                        <span class="font-medium">{{ p.displayName }}</span> <span class="text-xs text-ink/70">{{ p.staffCode }}</span>
                      </label>
                      <span class="text-right text-xs text-ink/70">{{ p.roles.join(', ') }}@if (p.hasAllBranches) { <span class="block">Works at every branch</span> }@else if (p.isYou) { <span class="block">You</span> }</span>
                    </li>
                  } @empty { <li class="px-3 py-6 text-center text-sm text-ink/70" data-testid="bp-none">{{ search().trim() ? 'Nobody matches that.' : 'There is nobody else to add.' }}</li> }
                </ul>
                <div class="flex justify-between gap-2">
                  <button type="button" class="btn-ghost" data-testid="bp-back" [disabled]="busy()" (click)="back()">Back</button>
                  <button type="button" class="btn-primary" data-testid="bp-save-existing" [disabled]="busy()" (click)="saveExisting()">{{ busy() ? 'Saving...' : 'Save' }}</button>
                </div>
              </section>
            }
            @case ('new') {
              <form class="space-y-3" aria-label="Create a new person for this branch" data-testid="bp-new-step" (submit)="$event.preventDefault(); createPerson()">
                <p class="text-sm">The new person works only at <strong>{{ branchName() }}</strong>.</p>
                <div><label class="app-label" for="bp-name">Name</label><input id="bp-name" class="app-input" maxlength="120" data-testid="bp-new-name" [ngModel]="nm().name" (ngModelChange)="patch({ name: $event })" [ngModelOptions]="{ standalone: true }" />
                  @if (fe()['displayName']) { <p class="app-error" role="alert">{{ fe()['displayName'] }}</p> }</div>
                <fieldset>
                  <legend class="app-label">Roles</legend>
                  <div class="grid gap-1 sm:grid-cols-2">@for (r of assignableRoles(); track r.id) {
                    <label class="flex items-center gap-2 text-sm"><input type="checkbox" [checked]="nm().roleIds.includes(r.id)" (change)="toggleRole(r.id)" [attr.data-testid]="'bp-role-' + r.systemKey" /> {{ r.name }}</label> }</div>
                  @if (fe()['roleIds']) { <p class="app-error" role="alert">{{ fe()['roleIds'] }}</p> }
                </fieldset>
                <fieldset>
                  <legend class="app-label">How will they sign in?</legend>
                  <label class="mr-4 inline-flex items-center gap-2 text-sm"><input type="radio" name="bp-method" [checked]="!nm().invite" (change)="patch({ invite: false })" data-testid="bp-method-pin" /> PIN set by me</label>
                  <label class="inline-flex items-center gap-2 text-sm"><input type="radio" name="bp-method" [checked]="nm().invite" (change)="patch({ invite: true })" data-testid="bp-method-invite" /> Email invitation</label>
                </fieldset>
                @if (nm().invite) {
                  <div><label class="app-label" for="bp-email">Email</label><input id="bp-email" type="email" class="app-input" data-testid="bp-new-email" [ngModel]="nm().email" (ngModelChange)="patch({ email: $event })" [ngModelOptions]="{ standalone: true }" />
                    @if (fe()['email']) { <p class="app-error" role="alert">{{ fe()['email'] }}</p> }</div>
                } @else {
                  <div><label class="app-label" for="bp-pin">PIN (4 to 12 digits)</label><input id="bp-pin" type="password" inputmode="numeric" autocomplete="one-time-code" data-1p-ignore data-lpignore="true" class="app-input w-40" data-testid="bp-new-pin" [ngModel]="nm().pin" (ngModelChange)="patch({ pin: $event })" [ngModelOptions]="{ standalone: true }" />
                    @if (fe()['pin']) { <p class="app-error" role="alert">{{ fe()['pin'] }}</p> }</div>
                }
                @if (fe()['branchIds']) { <p class="app-error" role="alert">{{ fe()['branchIds'] }}</p> }
                <div class="flex justify-between gap-2">
                  <button type="button" class="btn-ghost" data-testid="bp-back" [disabled]="busy()" (click)="back()">Back</button>
                  <button type="submit" class="btn-primary" data-testid="bp-create" [disabled]="busy()">{{ busy() ? 'Adding...' : 'Add person' }}</button>
                </div>
              </form>
            }
          }
        }
      </div>
    </zp-dialog>
  `
})
export class BranchPeopleComponent {
  private readonly staffApi = inject(StaffApiService);
  private readonly rolesApi = inject(RolesApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly open = input.required<boolean>();
  readonly branchId = input<string | null>(null);
  readonly branchName = input('');
  /** Only right after the branch was created: the people who worked at every branch and now work at the branches they had. */
  readonly limited = input<readonly LimitedStaffDto[]>([]);
  readonly closed = output<void>();
  /** Someone was added, taken off or created: the screen behind may refresh. */
  readonly changed = output<void>();

  protected readonly canManage = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.STAFF_MANAGE));
  protected readonly step = signal<Step>('choose');
  protected readonly data = signal<BranchStaffDto | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly summary = signal<readonly string[]>([]);
  protected readonly search = signal('');
  protected readonly ticked = signal<ReadonlySet<string>>(new Set());
  protected readonly every = signal<ReadonlySet<string>>(new Set());
  protected readonly roles = signal<readonly RoleDto[]>([]);
  protected readonly nm = signal({ name: '', email: '', pin: '', roleIds: [] as string[], invite: false });
  protected readonly fe = signal<Record<string, string>>({});

  protected readonly assignableRoles = computed(() => this.roles().filter((r) => !r.isSuperAdmin));
  /** People who can be ticked or not: everyone but the owner (the owner works at every branch), matching the search. */
  protected readonly visible = computed(() => {
    const q = this.search().trim().toLowerCase();
    return (this.data()?.staff ?? []).filter((p) => !p.isOwner && (!q || `${p.displayName} ${p.staffCode} ${p.roles.join(' ')}`.toLowerCase().includes(q)));
  });

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const id = this.branchId();
      untracked(() => { if (id) void this.begin(id); });
    });
  }

  private async begin(id: string): Promise<void> {
    this.error.set(null);
    this.summary.set([]);
    this.search.set('');
    this.every.set(new Set());
    this.data.set(null);
    this.step.set(this.limited().length > 0 ? 'keep' : 'choose');
    if (!this.canManage()) return;
    try {
      this.data.set(await firstValueFrom(this.staffApi.branchStaff(id)));
      if (this.roles().length === 0) this.roles.set(await firstValueFrom(this.rolesApi.list()));
    } catch (err) { this.error.set(toApiError(err).message); }
  }

  /** The people (with a list of branches) who work at the branch now: what the server needs to hear again with every change, so that nobody is taken off by accident. */
  private currentHere(): string[] {
    return (this.data()?.staff ?? []).filter((p) => !p.isOwner && !p.hasAllBranches && p.worksHere).map((p) => p.membershipId);
  }

  protected toggle(id: string): void { this.ticked.update((s) => flip(s, id)); }
  protected toggleEvery(id: string): void { this.every.update((s) => flip(s, id)); }
  protected back(): void { this.error.set(null); this.step.set('choose'); }

  protected async keepNext(): Promise<void> {
    const id = this.branchId();
    if (!id) return;
    const picked = [...this.every()];
    if (picked.length > 0) {
      this.busy.set(true);
      this.error.set(null);
      try {
        this.data.set(await firstValueFrom(this.staffApi.setBranchStaff(id, { membershipIds: this.currentHere(), everyBranch: picked })));
        const names = this.limited().filter((p) => this.every().has(p.membershipId)).map((p) => p.displayName);
        this.summary.update((s) => [...s, `Every branch again: ${names.join(', ')}.`]);
        this.changed.emit();
      } catch (err) { this.error.set(toApiError(err).message); this.busy.set(false); return; }
      this.busy.set(false);
    }
    this.step.set('choose');
  }

  protected goExisting(): void {
    this.error.set(null);
    this.search.set('');
    this.ticked.set(new Set(this.currentHere()));
    this.step.set('existing');
  }

  protected async saveExisting(): Promise<void> {
    const id = this.branchId();
    if (!id) return;
    const before = new Set(this.currentHere());
    const after = this.ticked();
    this.busy.set(true);
    this.error.set(null);
    try {
      const saved = await firstValueFrom(this.staffApi.setBranchStaff(id, { membershipIds: [...after], everyBranch: [] }));
      const name = (m: string): string => saved.staff.find((p) => p.membershipId === m)?.displayName ?? '';
      const added = [...after].filter((m) => !before.has(m)).map(name);
      const removed = [...before].filter((m) => !after.has(m)).map(name);
      this.data.set(saved);
      this.summary.update((s) => [...s, ...(added.length ? [`Added: ${added.join(', ')}.`] : []), ...(removed.length ? [`Taken off: ${removed.join(', ')}.`] : [])]);
      if (added.length || removed.length) this.changed.emit();
      this.step.set('choose');
    } catch (err) { this.error.set(toApiError(err).message); } finally { this.busy.set(false); }
  }

  protected goNew(): void {
    this.error.set(null);
    this.fe.set({});
    this.nm.set({ name: '', email: '', pin: '', roleIds: [], invite: false });
    this.step.set('new');
  }

  protected patch(change: Partial<ReturnType<typeof this.nm>>): void { this.nm.update((cur) => ({ ...cur, ...change })); }
  protected toggleRole(id: string): void { this.patch({ roleIds: this.nm().roleIds.includes(id) ? this.nm().roleIds.filter((r) => r !== id) : [...this.nm().roleIds, id] }); }

  protected async createPerson(): Promise<void> {
    const id = this.branchId();
    if (!id) return;
    const v = this.nm();
    this.error.set(null);
    // Plain words before the server is asked (the server checks the same things again).
    const problems: Record<string, string> = {};
    if (!v.name.trim()) problems['displayName'] = 'Type their name.';
    if (v.roleIds.length === 0) problems['roleIds'] = 'Choose at least one role.';
    if (v.invite && !v.email.trim()) problems['email'] = 'Type their email address, or choose a PIN instead.';
    if (!v.invite && !v.pin.trim()) problems['pin'] = 'Type a PIN of 4 to 12 digits, or choose an email invitation instead.';
    this.fe.set(problems);
    if (Object.keys(problems).length > 0) return;
    this.busy.set(true);
    try {
      const made = await firstValueFrom(this.staffApi.create({
        displayName: v.name.trim(), email: v.invite ? v.email.trim() || null : null, roleIds: v.roleIds, hasAllBranches: false, branchIds: [id],
        pin: v.invite ? null : v.pin || null, sendInvitation: v.invite
      }));
      this.summary.update((s) => [...s, `Created: ${made.staff.displayName} (staff code ${made.staff.staffCode}).`]);
      this.toast.success(`${made.staff.displayName} added (staff code ${made.staff.staffCode}).`);
      this.data.set(await firstValueFrom(this.staffApi.branchStaff(id)));
      this.changed.emit();
      this.step.set('choose');
    } catch (err) {
      const e = toApiError(err);
      const map: Record<string, string> = {};
      for (const [k, m] of Object.entries(e.fieldErrors)) map[k] = m[0] ?? '';
      this.fe.set(map);
      this.error.set(Object.keys(map).length ? null : e.message);
    } finally { this.busy.set(false); }
  }

  protected finish(): void {
    const made = this.summary().length;
    if (made > 0) this.toast.success(`${this.branchName()}: ${made === 1 ? 'one change saved' : made + ' changes saved'}.`);
    this.closed.emit();
  }
}

function flip(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(set);
  if (!next.delete(id)) next.add(id);
  return next;
}
