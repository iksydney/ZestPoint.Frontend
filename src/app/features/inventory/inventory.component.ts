import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FEATURES, SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { AuthService } from '../../core/services/auth.service';
import { BranchContextService } from '../../core/services/branch-context.service';
import { BranchPickerComponent, SyncStatusComponent } from '../../shared/ui/ops-chrome.components';
import { AuditsTabComponent } from './audits-tab.component';
import { InsightsTabComponent } from './insights-tab.component';
import { PurchasingTabComponent } from './purchasing-tab.component';
import { StockTabComponent } from './stock-tab.component';

type Tab = 'stock' | 'purchasing' | 'audits' | 'insights';

/** Inventory console for the active branch. Tabs appear only for what the person's role and the company's plan allow. */
@Component({
  selector: 'zp-inventory',
  standalone: true,
  imports: [BranchPickerComponent, SyncStatusComponent, StockTabComponent, PurchasingTabComponent, AuditsTabComponent, InsightsTabComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-bold">Inventory</h1>
      <div class="flex flex-wrap items-center gap-4"><zp-branch-picker /><zp-sync-status /></div>
    </div>
    @if (readOnly()) { <p class="sys-alert sys-alert-warning mb-3" role="status" data-testid="inventory-readonly">Read-only: your subscription limits this screen. You can look, but not change anything.</p> }
    @if (!branches.activeId()) { <p class="sys-alert sys-alert-warning" role="status">You are not assigned to a branch yet. Ask a manager to give you access.</p> }
    @else {
      <div class="mb-4 flex flex-wrap gap-1 border-b border-ink/15" role="tablist">
        @for (t of tabs(); track t.key) {
          <button type="button" role="tab" class="px-4 py-2 font-medium" [class]="tab() === t.key ? 'border-b-2 border-primary text-ink' : 'text-ink/70 hover:text-ink'"
                  [attr.aria-selected]="tab() === t.key" [attr.data-testid]="'tab-' + t.key" (click)="tab.set(t.key)">{{ t.label }}</button>
        }
      </div>
      @switch (tab()) {
        @case ('stock') { <zp-stock-tab /> }
        @case ('purchasing') { <zp-purchasing-tab /> }
        @case ('audits') { <zp-audits-tab /> }
        @case ('insights') { <zp-insights-tab /> }
      }
    }
  `
})
export class InventoryComponent implements OnInit {
  protected readonly branches = inject(BranchContextService);
  private readonly auth = inject(AuthService);
  protected readonly tab = signal<Tab>('stock');

  protected readonly readOnly = computed(() => this.auth.accessModeFor(FEATURES.INVENTORY) === 'readonly');
  protected readonly tabs = computed(() => {
    const p = SCREEN_PERMISSIONS;
    const list: { key: Tab; label: string }[] = [{ key: 'stock', label: 'Stock' }];
    if (this.auth.hasAnyPermission([p.INVENTORY_PURCHASE_MANAGE, p.INVENTORY_PURCHASE_APPROVE])) list.push({ key: 'purchasing', label: 'Purchasing' });
    if (this.auth.hasAnyPermission([p.INVENTORY_AUDIT_PERFORM, p.INVENTORY_WEIGH_AUDIT_PERFORM])) list.push({ key: 'audits', label: 'Audits' });
    list.push({ key: 'insights', label: 'Usage & variance' });
    return list;
  });

  ngOnInit(): void {
    void this.branches.load();
  }
}
