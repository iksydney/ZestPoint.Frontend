import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { BranchContextService } from '../../core/services/branch-context.service';
import { SyncAgentService } from '../../core/services/sync-agent.service';
import { DialogComponent } from './feedback';

/** Which branch the person is working at. Hidden when only one is available. */
@Component({
  selector: 'zp-branch-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ctx.branches().length > 1) {
      <label class="flex items-center gap-2 text-sm">
        <span class="font-medium">Branch</span>
        <select class="app-input w-auto py-1" data-testid="branch-picker" [value]="ctx.activeId() ?? ''" (change)="ctx.select($any($event.target).value)">
          @for (b of ctx.branches(); track b.id) { <option [value]="b.id">{{ b.name }}</option> }
        </select>
      </label>
    } @else if (ctx.active()) {
      <span class="text-sm font-medium" data-testid="branch-name">{{ ctx.active()!.name }}</span>
    }
  `
})
export class BranchPickerComponent {
  protected readonly ctx = inject(BranchContextService);
}

/**
 * Connection and sync state, always visible on sale-floor screens: online/offline, how many changes are waiting, and any change
 * the server refused (with its reason) so nothing is lost silently.
 */
@Component({
    selector: 'zp-sync-status',
    imports: [DialogComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="flex items-center gap-2 text-sm" data-testid="sync-status">
      <span class="app-badge" [class]="sync.online() ? 'app-badge-success' : 'app-badge-warning'" [attr.data-state]="sync.online() ? 'online' : 'offline'">
        {{ sync.online() ? 'Online' : 'Offline' }}
      </span>
      @if (sync.pending() > 0) {
        <span class="app-badge app-badge-primary" data-testid="sync-pending">{{ sync.pending() }} waiting to sync</span>
        @if (sync.online()) { <button type="button" class="btn-ghost px-2 py-0.5 text-xs" (click)="sync.flush()">Sync now</button> }
      }
      @if (sync.issues().length > 0) {
        <button type="button" class="app-badge app-badge-danger" data-testid="sync-issues" (click)="open.set(true)">{{ sync.issues().length }} not accepted</button>
      }
    </div>

    <zp-dialog [open]="open()" title="Changes the server did not accept" [wide]="true" (closed)="open.set(false)">
      <p class="mb-3 text-sm text-ink/80">These were made on this device but could not be applied. Check each one, fix it by hand if it still matters, then dismiss it.</p>
      <ul class="space-y-2">
        @for (i of sync.issues(); track i.clientOperationId) {
          <li class="app-card flex items-start justify-between gap-3">
            <div>
              <p class="font-medium">{{ i.summary }}</p>
              <p class="text-sm text-danger" role="alert">{{ i.rejection?.message }}</p>
              <p class="text-xs text-ink/60">{{ i.createdAtUtc }}</p>
            </div>
            <button type="button" class="btn-outline px-2 py-1 text-sm" (click)="sync.dismissIssue(i.clientOperationId)">Dismiss</button>
          </li>
        } @empty { <li class="text-ink/70">Nothing to review.</li> }
      </ul>
    </zp-dialog>
  `
})
export class SyncStatusComponent {
  protected readonly sync = inject(SyncAgentService);
  protected readonly open = signal(false);
}
