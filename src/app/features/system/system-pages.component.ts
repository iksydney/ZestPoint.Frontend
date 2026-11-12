import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { APP_NAV } from '../../core/navigation/app-nav';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'zp-forbidden',
  standalone: true,
  imports: [RouterLink],
  template: `
    <main class="grid min-h-screen place-items-center bg-canvas p-6 text-center text-ink">
      <div class="max-w-md space-y-2">
        <h1 class="text-2xl font-bold">No access</h1>
        <p class="text-ink/80">Your role does not include this screen. If you need it, ask an administrator to update your permissions.</p>
        <a routerLink="/app" class="btn-primary mt-2">Back to the dashboard</a>
      </div>
    </main>`
})
export class ForbiddenComponent {}

/** A clear prompt, not a silent failure: names the module, says it is not in the plan, and says who can change that. */
@Component({
  selector: 'zp-upgrade-required',
  standalone: true,
  imports: [RouterLink],
  template: `
    <main class="grid min-h-screen place-items-center bg-canvas p-6 text-center text-ink">
      <div class="max-w-md space-y-3" data-testid="upgrade-prompt">
        <h1 class="text-2xl font-bold">{{ screen() ? 'Not included in your plan' : 'Upgrade required' }}</h1>
        @if (screen()) {
          <p class="text-ink/80" data-testid="upgrade-screen"><strong>{{ screen() }}</strong> is not available to your organisation{{ plan() ? ' (' + plan() + ')' : '' }}.</p>
          <p class="text-ink/80">Contact ZestPoint if you need it switched on.</p>
          @if (canAsk()) { <a routerLink="/app/support" class="btn-primary" data-testid="upgrade-contact-support">Contact support</a> }
        } @else {
          <p class="text-ink/80">@if (module()) { <strong>{{ module() }}</strong> is } @else { This module is } not part of your current plan{{ plan() ? ' (' + plan() + ')' : '' }}.</p>
        }
        @if (canManage() && !screen()) {
          <p class="text-ink/80">Choose a plan that includes it and it is available straight away.</p>
          <a routerLink="/app/subscription" fragment="plans" class="btn-primary" data-testid="upgrade-choose-plan">See plans</a>
        } @else if (!screen()) {
          <p class="text-ink/80">Ask an administrator of your company to upgrade the subscription.</p>
        }
        <div><a routerLink="/app" class="btn-outline mt-2">Back to the dashboard</a></div>
      </div>
    </main>`
})
export class UpgradeRequiredComponent {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  protected readonly canManage = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.SUBSCRIPTIONS_MANAGE));
  protected readonly canAsk = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.SUPPORT_VIEW));
  protected readonly plan = computed(() => this.auth.subscription()?.planName ?? '');
  /** The name of ONE withheld screen when an operator withheld just that screen (not the whole module). */
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  protected readonly screen = computed(() => {
    const key = this.query().get('screen');
    return key ? (APP_NAV.find((n) => n.key === key)?.label ?? null) : null;
  });
  protected readonly module = computed(() => {
    const key = this.query().get('feature');
    return this.auth.subscription()?.modules.find((m) => m.key === key)?.name ?? null;
  });
}

/** Shown to staff who cannot manage billing while their company's account is restricted. */
@Component({
  selector: 'zp-restricted',
  standalone: true,
  template: `
    <main class="grid min-h-screen place-items-center bg-canvas p-6 text-center text-ink">
      <div class="max-w-md space-y-2" data-testid="restricted-page">
        <h1 class="text-2xl font-bold">Your company's account is restricted</h1>
        <p class="text-ink/80">Payment for the subscription is overdue, so the workspace is paused. Nothing has been deleted. Ask an administrator of your company to update the payment, and everything comes back.</p>
        <button type="button" class="btn-outline mt-2" (click)="signOut()">Sign out</button>
      </div>
    </main>`
})
export class RestrictedComponent {
  private readonly auth = inject(AuthService);

  protected signOut(): void {
    void this.auth.logout();
  }
}
