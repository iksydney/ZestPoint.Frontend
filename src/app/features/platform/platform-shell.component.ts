import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { PLATFORM_PERMISSIONS, ROLE_LABEL } from '../../core/models/support.model';
import { PlatformAuthService } from '../../core/services/subscription.services';
import { ConfirmHostComponent, ToastHostComponent } from '../../shared/ui/feedback';

/** Frame for the platform interface: companies, plans, support, customers, people and operators. Deliberately plain and unthemed: it is not any company's brand. */
@Component({
    selector: 'zp-platform-shell',
    imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastHostComponent, ConfirmHostComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="min-h-screen bg-canvas text-ink">
      <header class="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 bg-panel px-4 py-2">
        <div class="flex flex-wrap items-center gap-4">
          <span class="font-bold" data-testid="platform-title">ZestPoint platform</span>
          <nav class="flex flex-wrap gap-1" aria-label="Platform">
            <a routerLink="/platform/overview" routerLinkActive="bg-primary/10" class="btn-ghost text-sm" data-testid="nav-overview">Overview</a>
            <a routerLink="/platform/tenants" routerLinkActive="bg-primary/10" class="btn-ghost text-sm" data-testid="nav-tenants">Companies</a>
            <a routerLink="/platform/plans" routerLinkActive="bg-primary/10" class="btn-ghost text-sm" data-testid="nav-plans">Plans</a>
            @if (platform.can(perms.TICKETS_VIEW)) { <a routerLink="/platform/support" routerLinkActive="bg-primary/10" class="btn-ghost text-sm" data-testid="nav-support">Support</a> }
            @if (platform.can(perms.TICKETS_VIEW)) { <a routerLink="/platform/status" routerLinkActive="bg-primary/10" class="btn-ghost text-sm" data-testid="nav-status">Status</a> }
            @if (platform.can(perms.CRM_VIEW)) { <a routerLink="/platform/customers" routerLinkActive="bg-primary/10" class="btn-ghost text-sm" data-testid="nav-customers">Customers</a> }
            @if (platform.can(perms.USERS_VIEW)) { <a routerLink="/platform/users" routerLinkActive="bg-primary/10" class="btn-ghost text-sm" data-testid="nav-users">People</a> }
            @if (platform.can(perms.OPERATORS_MANAGE)) { <a routerLink="/platform/operators" routerLinkActive="bg-primary/10" class="btn-ghost text-sm" data-testid="nav-operators">Operators</a> }
          </nav>
        </div>
        <div class="flex items-center gap-3 text-sm"><span><span data-testid="operator-name">{{ platform.session()?.displayName }}</span>
          <span class="ml-1 text-ink/60" data-testid="operator-role">({{ role() }})</span></span>
          <button type="button" class="btn-outline text-sm" data-testid="platform-signout" (click)="signOut()">Sign out</button></div>
      </header>
      <main class="mx-auto max-w-6xl p-4 sm:p-6"><router-outlet /></main>
      <zp-toast-host /><zp-confirm-host />
    </div>
  `
})
export class PlatformShellComponent {
  protected readonly platform = inject(PlatformAuthService);
  protected readonly perms = PLATFORM_PERMISSIONS;
  private readonly router = inject(Router);

  protected role(): string {
    const r = this.platform.session()?.role;
    return r ? ROLE_LABEL[r] : '';
  }

  constructor() {
    // Signed out in another tab: this one has nothing left to show either.
    this.platform.onRemoteSignOut = () => void this.router.navigate(['/platform/login']);
    inject(DestroyRef).onDestroy(() => { this.platform.onRemoteSignOut = null; });
  }

  protected async signOut(): Promise<void> {
    await this.platform.logout();
    await this.router.navigate(['/platform/login']);
  }
}
