import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BranchDto } from '../models/staff.model';
import { AuthService } from './auth.service';
import { OfflineDbService } from './offline-db.service';
import { BranchesApiService } from './staff.services';

/**
 * The branch the person is working at. Stock, orders and audits are per branch, so every POS and inventory screen reads this.
 * The list is cached so the choice survives a dropped connection. The server still checks branch access on every call.
 */
@Injectable({ providedIn: 'root' })
export class BranchContextService {
  private readonly auth = inject(AuthService);
  private readonly api = inject(BranchesApiService);
  private readonly db = inject(OfflineDbService);

  private readonly _branches = signal<readonly BranchDto[]>([]);
  private readonly _activeId = signal<string | null>(null);
  private loaded: Promise<void> | null = null;
  private loadedFor: string | null = null;

  readonly branches = this._branches.asReadonly();
  readonly activeId = this._activeId.asReadonly();
  readonly active = computed(() => this._branches().find((b) => b.id === this._activeId()) ?? null);

  /** Loads the branches the caller may use (once per tenant) and restores their last choice. */
  load(): Promise<void> {
    const tenantId = this.auth.tenantId();
    if (!tenantId) return Promise.resolve();
    if (this.loadedFor !== tenantId) {
      this.loadedFor = tenantId;
      this.loaded = this.fetch(tenantId);
    }
    return this.loaded!;
  }

  select(id: string): void {
    this._activeId.set(id);
    const tenantId = this.auth.tenantId();
    if (tenantId) try { sessionStorage.setItem(this.key(tenantId), id); } catch { /* storage may be blocked */ }
  }

  private key = (tenantId: string) => `zp.branch.${tenantId}`;

  private async fetch(tenantId: string): Promise<void> {
    let list: readonly BranchDto[];
    try {
      list = await firstValueFrom(this.api.list());
      await this.db.cache(`${tenantId}:branches`, list);
    } catch {
      list = (await this.db.cached<BranchDto[]>(`${tenantId}:branches`)) ?? [];
    }

    const session = this.auth.session();
    const usable = list.filter((b) => b.isActive && (session?.hasAllBranches || session?.branchIds.includes(b.id)));
    this._branches.set(usable);

    let saved: string | null = null;
    try { saved = sessionStorage.getItem(this.key(tenantId)); } catch { /* ignore */ }
    const pick = usable.find((b) => b.id === saved) ?? usable.find((b) => b.isHeadOffice) ?? usable[0] ?? null;
    this._activeId.set(pick?.id ?? null);
  }
}
