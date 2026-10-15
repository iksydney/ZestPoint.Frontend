import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { EMPTY, catchError, debounceTime, switchMap, tap } from 'rxjs';
import { AuditLogDto } from '../../core/models/staff.model';
import { toApiError } from '../../core/services/api.util';
import { AuditApiService } from '../../core/services/staff.services';

/** Security and activity audit trail (append-only on the server). Filter by action prefix, e.g. "staff." or "role.". */
@Component({
  selector: 'zp-audit-log',
  standalone: true,
  imports: [DatePipe, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-3 flex items-end gap-2">
      <div>
        <label class="app-label" for="a-action">Action</label>
        <select id="a-action" class="app-input" [ngModel]="action()" (ngModelChange)="action.set($event); page.set(1)" data-testid="audit-filter">
          <option value="">Everything</option><option value="auth.">Sign-ins</option><option value="staff.">Staff</option><option value="role.">Roles</option>
          <option value="branding.">Branding</option><option value="company.">Company</option><option value="branch.">Branches</option>
        </select>
      </div>
    </div>
    @if (error()) { <p class="sys-alert sys-alert-danger mb-3" role="alert">{{ error() }}</p> }
    <div class="app-card overflow-x-auto p-0">
      <table class="app-table" data-testid="audit-table">
        <caption class="sr-only">Audit log</caption>
        <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead>
        <tbody>
          @for (a of items(); track a.id) {
            <tr><td class="whitespace-nowrap text-xs">{{ a.occurredAtUtc | date: 'medium' }}</td><td>{{ a.actorName ?? 'System' }}</td>
              <td class="font-mono text-xs">{{ a.action }}</td><td class="max-w-md truncate text-xs text-ink/80" [title]="a.detailsJson ?? ''">{{ a.detailsJson ?? '' }}</td></tr>
          } @empty { <tr><td colspan="4" class="py-8 text-center text-ink/70">{{ loading() ? 'Loading...' : 'Nothing recorded yet.' }}</td></tr> }
        </tbody>
      </table>
    </div>
    <div class="mt-2 flex items-center justify-between text-sm text-ink/80">
      <span>{{ total() }} entries</span>
      <span class="flex gap-2">
        <button type="button" class="btn-outline px-2 py-1" [disabled]="page() <= 1" (click)="page.set(page() - 1)">Newer</button>
        <button type="button" class="btn-outline px-2 py-1" [disabled]="page() * pageSize >= total()" (click)="page.set(page() + 1)">Older</button>
      </span>
    </div>
  `
})
export class AuditLogComponent {
  private readonly api = inject(AuditApiService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly pageSize = 25;
  protected readonly action = signal('');
  protected readonly page = signal(1);
  protected readonly items = signal<readonly AuditLogDto[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    toObservable(computed(() => ({ a: this.action(), p: this.page() }))).pipe(
      debounceTime(100),
      tap(() => this.loading.set(true)),
      switchMap((f) => this.api.list({ action: f.a, page: f.p, pageSize: this.pageSize }).pipe(
        catchError((e: unknown) => { this.error.set(toApiError(e).message); this.loading.set(false); return EMPTY; }) // keep the stream alive after a failure
      )),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((r) => { this.items.set(r.items); this.total.set(r.total); this.loading.set(false); this.error.set(null); });
  }
}
