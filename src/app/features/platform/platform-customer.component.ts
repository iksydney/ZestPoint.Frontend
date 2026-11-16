import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CRM_NOTE_KINDS, CRM_STAGES, CrmNoteKind, CrmProfileDto, CrmStage, PLATFORM_PERMISSIONS, PlatformOperatorDto, STAGE_LABEL } from '../../core/models/support.model';
import { toApiError } from '../../core/services/api.util';
import { PlatformSupportApi } from '../../core/services/support.services';
import { PlatformAuthService } from '../../core/services/subscription.services';
import { ToastService } from '../../shared/ui/feedback';

/** One company's customer record: the stage and owner ZestPoint keeps, tags, the next follow-up, and the private contact log. */
@Component({
    selector: 'zp-platform-customer',
    imports: [DatePipe, FormsModule, RouterLink],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <a routerLink="/platform/customers" class="text-sm underline">&larr; All customers</a>
    @if (error()) { <p class="sys-alert sys-alert-danger my-3" role="alert" data-testid="customer-error">{{ error() }}</p> }
    @if (profile(); as p) {
      <h1 class="mt-2 text-2xl font-bold" data-testid="customer-title">Customer record</h1>
      <p class="text-sm text-ink/70">
        <a class="underline" [routerLink]="['/platform/tenants', p.tenantId]" data-testid="customer-company">Subscription and plan</a> &middot;
        <a class="underline" [routerLink]="['/platform/support']" [queryParams]="{ tenantId: p.tenantId }" data-testid="customer-tickets">{{ p.openTickets }} open ticket(s)</a> &middot;
        <a class="underline" [routerLink]="['/platform/users']" [queryParams]="{ tenantId: p.tenantId }" data-testid="customer-people">People</a>
      </p>

      <div class="mt-3 grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <section class="app-card space-y-3" aria-label="Profile">
          <h2 class="font-semibold">Profile</h2>
          <div><label class="app-label" for="cs">Stage</label>
            <select id="cs" class="app-input" data-testid="crm-stage" [disabled]="!canManage()" [ngModel]="stage()" (ngModelChange)="stage.set($event)">@for (s of stages; track s) { <option [value]="s">{{ label(s) }}</option> }</select></div>
          <div><label class="app-label" for="co">Owner</label>
            <select id="co" class="app-input" data-testid="crm-owner" [disabled]="!canManage()" [ngModel]="owner()" (ngModelChange)="owner.set($event)">
              <option value="">Nobody</option>@for (a of assignees(); track a.id) { <option [value]="a.id">{{ a.displayName }}</option> }</select></div>
          <div><label class="app-label" for="ct">Tags (comma separated)</label>
            <input id="ct" class="app-input" data-testid="crm-tags" [disabled]="!canManage()" [ngModel]="tags()" (ngModelChange)="tags.set($event)" placeholder="vip, hotel-group" /></div>
          <div><label class="app-label" for="cf">Next follow-up</label>
            <input id="cf" type="date" class="app-input" data-testid="crm-follow" [disabled]="!canManage()" [ngModel]="follow()" (ngModelChange)="follow.set($event)" /></div>
          @if (canManage()) { <button type="button" class="btn-primary" data-testid="crm-save" [disabled]="busy()" (click)="save()">Save profile</button> }
          @else { <p class="text-xs text-ink/60">Changing the stage, owner or tags needs a support lead.</p> }
        </section>

        <section class="app-card" aria-label="Contact log">
          <h2 class="font-semibold">Contact log</h2>
          @if (canWrite()) {
            <form class="mt-2 space-y-2" (submit)="$event.preventDefault(); addNote()">
              <div class="flex flex-wrap gap-2">
                <select class="app-input w-auto" aria-label="Type" data-testid="note-kind" [ngModel]="noteKind()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="noteKind.set($event)">@for (k of kinds; track k) { <option [value]="k">{{ k }}</option> }</select>
              </div>
              <textarea rows="3" maxlength="4000" class="app-input" aria-label="Note" placeholder="What was discussed or decided" data-testid="note-body" [ngModel]="noteBody()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="noteBody.set($event)"></textarea>
              <button type="submit" class="btn-primary" data-testid="note-add" [disabled]="busy() || !noteBody().trim()">Add to log</button>
            </form>
          }
          <ol class="mt-3 space-y-2" data-testid="note-list">
            @for (n of p.notes; track n.id) {
              <li class="rounded-lg border border-ink/10 bg-panel p-3"><p class="text-xs text-ink/60"><span class="font-medium text-ink">{{ n.kind }}</span> &middot; {{ n.authorName }} &middot; {{ n.createdAtUtc | date: 'medium' }}</p>
                <p class="mt-1 whitespace-pre-wrap text-sm">{{ n.body }}</p></li>
            } @empty { <li class="text-sm text-ink/70">Nothing logged yet.</li> }
          </ol>
        </section>
      </div>
    } @else if (!error()) { <p class="py-8 text-center text-ink/70">Loading...</p> }
  `
})
export class PlatformCustomerComponent implements OnInit {
  private readonly api = inject(PlatformSupportApi);
  private readonly route = inject(ActivatedRoute);
  private readonly platform = inject(PlatformAuthService);
  private readonly toast = inject(ToastService);

  protected readonly stages = CRM_STAGES;
  protected readonly kinds = CRM_NOTE_KINDS;
  protected readonly profile = signal<CrmProfileDto | null>(null);
  protected readonly assignees = signal<readonly PlatformOperatorDto[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly stage = signal<CrmStage>('Lead');
  protected readonly owner = signal('');
  protected readonly tags = signal('');
  protected readonly follow = signal('');
  protected readonly noteKind = signal<CrmNoteKind>('Note');
  protected readonly noteBody = signal('');
  protected readonly canManage = computed(() => this.platform.can(PLATFORM_PERMISSIONS.CRM_MANAGE));
  protected readonly canWrite = computed(() => this.platform.can(PLATFORM_PERMISSIONS.CRM_WRITE));

  private id = '';

  async ngOnInit(): Promise<void> {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    try {
      if (this.platform.can(PLATFORM_PERMISSIONS.TICKETS_VIEW)) this.assignees.set(await firstValueFrom(this.api.assignees()));
      this.show(await firstValueFrom(this.api.customer(this.id)));
    } catch (err) { this.error.set(toApiError(err).message); }
  }

  protected label(s: CrmStage): string { return STAGE_LABEL[s]; }

  private show(p: CrmProfileDto): void {
    this.profile.set(p);
    this.stage.set(p.stage);
    this.owner.set(p.ownerAdminId ?? '');
    this.tags.set(p.tags.join(', '));
    this.follow.set(p.nextFollowUpUtc ? p.nextFollowUpUtc.slice(0, 10) : '');
  }

  protected async save(): Promise<void> {
    const p = this.profile();
    if (!p) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      this.show(await firstValueFrom(this.api.saveCustomer(this.id, {
        stage: this.stage(), ownerAdminId: this.owner() || null, tags: this.tags().split(',').map((t) => t.trim()).filter(Boolean),
        nextFollowUpUtc: this.follow() ? new Date(`${this.follow()}T09:00:00Z`).toISOString() : null, rowVersion: p.rowVersion || null
      })));
      this.toast.success('Profile saved.');
    } catch (err) { this.error.set(toApiError(err).message); } finally { this.busy.set(false); }
  }

  protected async addNote(): Promise<void> {
    const text = this.noteBody().trim();
    if (!text) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const keepStage = { stage: this.stage(), owner: this.owner(), tags: this.tags(), follow: this.follow() };
      const fresh = await firstValueFrom(this.api.addNote(this.id, this.noteKind(), text));
      this.profile.set(fresh); // keep unsaved edits in the form: only the log changed
      this.stage.set(keepStage.stage); this.owner.set(keepStage.owner); this.tags.set(keepStage.tags); this.follow.set(keepStage.follow);
      this.noteBody.set('');
      this.toast.success('Added to the log.');
    } catch (err) { this.error.set(toApiError(err).message); } finally { this.busy.set(false); }
  }
}
