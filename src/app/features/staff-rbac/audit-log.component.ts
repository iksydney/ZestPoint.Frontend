import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { EMPTY, catchError, debounceTime, firstValueFrom, switchMap, tap } from 'rxjs';
import { ApiEnvelope } from '../../core/models/api.model';
import { AuditLogDto } from '../../core/models/staff.model';
import { toApiError, unwrap } from '../../core/services/api.util';
import { AuditApiService } from '../../core/services/staff.services';

/** What each kind of activity starts with. The server matches the start of the action's name. */
const AREAS: readonly [string, string][] = [
  ['', 'Everything'], ['auth.', 'Sign-ins and sessions'], ['pos.order', 'Bills'], ['pos.line', 'Bill items'], ['pos.payment', 'Payments'], ['pos.void', 'Voids'], ['pos.discount', 'Discounts'],
  ['pos.tips', 'Tips paid out or donated'], ['pos.receipt', 'Receipts'], ['pos.layby', 'Laybys'], ['pos.', 'Everything at the till'], ['inventory.', 'Stock'], ['purchasing.', 'Purchasing'],
  ['product.', 'Products'], ['recipe.', 'Recipes'], ['ledger.', 'Ledger'], ['customer', 'Customers'], ['staff.', 'Staff'], ['role.', 'Roles'], ['settings.', 'Settings'], ['branding.', 'Branding'],
  ['company.', 'Company'], ['branch.', 'Branches'], ['demo.', 'Demonstration data']
];

/**
 * The activity log: who did what and when (append-only on the server). Filters for an audit: the kind of activity, the person, a date
 * range and free text found in the action, the person's name, the record's id or the details (a bill number, an amount, a reason).
 */
@Component({
  selector: 'zp-audit-log',
  standalone: true,
  imports: [DatePipe, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Filter the activity log" (submit)="$event.preventDefault()" data-testid="audit-filters">
      <div>
        <label class="app-label" for="a-action">Kind of activity</label>
        <select id="a-action" class="app-input" [ngModel]="action()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="action.set($event); page.set(1)" data-testid="audit-filter">
          @for (a of areas; track a[0]) { <option [value]="a[0]">{{ a[1] }}</option> }
        </select>
      </div>
      <div>
        <label class="app-label" for="a-who">Person</label>
        <select id="a-who" class="app-input" [ngModel]="actor()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="actor.set($event); page.set(1)" data-testid="audit-who">
          <option value="">Anyone</option>@for (p of people(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
        </select>
      </div>
      <div><label class="app-label" for="a-from">From</label><input id="a-from" type="date" class="app-input" [ngModel]="from()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="from.set($event); page.set(1)" data-testid="audit-from" /></div>
      <div><label class="app-label" for="a-to">To</label><input id="a-to" type="date" class="app-input" [ngModel]="to()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="to.set($event); page.set(1)" data-testid="audit-to" /></div>
      <div><label class="app-label" for="a-search">Search</label><input id="a-search" type="search" class="app-input" placeholder="Bill number, amount, reason..." [ngModel]="search()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="search.set($event); page.set(1)" data-testid="audit-search" /></div>
    </form>
    @if (error()) { <p class="sys-alert sys-alert-danger mb-3" role="alert">{{ error() }}</p> }
    <div class="app-card overflow-x-auto p-0">
      <table class="app-table" data-testid="audit-table">
        <caption class="sr-only">Activity log</caption>
        <thead><tr><th>When</th><th>Who</th><th>Action</th><th>About</th><th>Details</th></tr></thead>
        <tbody>
          @for (a of items(); track a.id) {
            <tr><td class="whitespace-nowrap text-xs">{{ a.occurredAtUtc | date: 'medium' }}</td><td>{{ a.actorName ?? 'System' }}</td>
              <td class="font-mono text-xs">{{ a.action }}</td><td class="text-xs">{{ a.entityType }}</td>
              <td class="max-w-md text-xs text-ink/80">
                <button type="button" class="block w-full text-left" [class.truncate]="opened() !== a.id" [attr.aria-expanded]="opened() === a.id" [title]="opened() === a.id ? 'Show less' : 'Show all of it'" (click)="opened.set(opened() === a.id ? null : a.id)">{{ a.detailsJson ?? '' }}</button>
              </td></tr>
          } @empty { <tr><td colspan="5" class="py-8 text-center text-ink/70">{{ loading() ? 'Loading...' : filtered() ? 'Nothing matches these filters.' : 'Nothing recorded yet.' }}</td></tr> }
        </tbody>
      </table>
    </div>
    <div class="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-ink/80">
      <span data-testid="audit-total">{{ total() }} entries</span>
      <span class="flex items-center gap-2">
        @if (filtered()) { <button type="button" class="btn-ghost px-2 py-1" data-testid="audit-clear" (click)="clear()">Clear filters</button> }
        <button type="button" class="btn-outline px-2 py-1" [disabled]="page() <= 1" (click)="page.set(page() - 1)">Newer</button>
        <button type="button" class="btn-outline px-2 py-1" [disabled]="page() * pageSize >= total()" (click)="page.set(page() + 1)">Older</button>
      </span>
    </div>
  `
})
export class AuditLogComponent implements OnInit {
  private readonly api = inject(AuditApiService);
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly areas = AREAS;
  protected readonly pageSize = 25;
  protected readonly action = signal('');
  protected readonly actor = signal('');
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly search = signal('');
  protected readonly page = signal(1);
  protected readonly opened = signal<string | null>(null);
  protected readonly people = signal<readonly { id: string; name: string }[]>([]);
  protected readonly items = signal<readonly AuditLogDto[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly filtered = computed(() => !!(this.action() || this.actor() || this.from() || this.to() || this.search().trim()));

  constructor() {
    toObservable(computed(() => ({ a: this.action(), w: this.actor(), f: this.from(), t: this.to(), s: this.search().trim(), p: this.page() }))).pipe(
      debounceTime(250),
      tap(() => this.loading.set(true)),
      switchMap((f) => this.api.list({
        action: f.a || undefined, actor: f.w || undefined, search: f.s || undefined,
        // The dates are the person's own days: from the first moment of one to the last moment of the other.
        from: f.f ? new Date(`${f.f}T00:00:00`).toISOString() : undefined, to: f.t ? new Date(`${f.t}T23:59:59.999`).toISOString() : undefined,
        page: f.p, pageSize: this.pageSize
      }).pipe(
        catchError((e: unknown) => { this.error.set(toApiError(e).message); this.loading.set(false); return EMPTY; }) // keep the stream alive after a failure
      )),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((r) => { this.items.set(r.items); this.total.set(r.total); this.loading.set(false); this.error.set(null); });
  }

  ngOnInit(): void {
    void firstValueFrom(this.http.get<ApiEnvelope<{ id: string; name: string }[]>>('/api/v1/me/colleagues').pipe(unwrap())).then((l) => this.people.set(l)).catch(() => undefined);
  }

  protected clear(): void {
    this.action.set('');
    this.actor.set('');
    this.from.set('');
    this.to.set('');
    this.search.set('');
    this.page.set(1);
  }
}
