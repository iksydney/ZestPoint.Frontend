import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SCREEN_PERMISSIONS } from '../../core/models/rbac.model';
import { AuthService } from '../../core/services/auth.service';
import { TenantTimePipe } from '../../core/pipes/tenant-time.pipe';

/**
 * The account banner: what is wrong with the subscription (or about to be), which modules are affected, why, and what to do next.
 * Shown on every signed-in screen. Colours are fixed system colours, never the company theme, so a warning always looks like one.
 * People who cannot manage billing see the message without the buttons, plus who to ask.
 */
@Component({
  selector: 'zp-account-banner',
  standalone: true,
  imports: [RouterLink, TenantTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (banner(); as b) {
      <section class="sys-alert flex flex-wrap items-start justify-between gap-3" [class]="level()" [attr.role]="b.level === 'Critical' ? 'alert' : 'status'" data-testid="account-banner" [attr.data-code]="b.code">
        <div class="min-w-0 flex-1">
          <p class="font-bold" data-testid="banner-title">{{ b.title }}</p>
          <p class="mt-0.5 font-normal" data-testid="banner-message">{{ b.message }}</p>
          @if (b.affectedModules.length > 0) {
            <p class="mt-1 text-sm font-normal" data-testid="banner-modules"><span class="font-semibold">Affected:</span> {{ b.affectedModules.join(', ') }}</p>
          }
          @if (b.graceEndsAtUtc && b.code === 'payment-overdue') {
            <p class="mt-1 text-sm font-normal">Full access until {{ b.graceEndsAtUtc | tenantTime: 'datetime' }}.</p>
          }
          @if (!canManage()) { <p class="mt-1 text-sm font-normal">Ask an administrator to update the subscription.</p> }
        </div>
        @if (canManage()) {
          <div class="flex flex-wrap gap-2">
            @if (b.actions.includes('update-payment')) { <a routerLink="/app/subscription" fragment="payment" class="btn-primary text-sm" data-testid="banner-update-payment">Update payment</a> }
            @if (b.actions.includes('choose-plan')) { <a routerLink="/app/subscription" fragment="plans" class="btn-outline text-sm" data-testid="banner-choose-plan">Choose a plan</a> }
            @if (b.actions.includes('resume')) { <a routerLink="/app/subscription" class="btn-outline text-sm" data-testid="banner-resume">Resume</a> }
          </div>
        }
      </section>
    }
  `
})
export class AccountBannerComponent {
  private readonly auth = inject(AuthService);

  protected readonly banner = computed(() => this.auth.subscription()?.banner ?? null);
  protected readonly canManage = computed(() => this.auth.hasPermission(SCREEN_PERMISSIONS.SUBSCRIPTIONS_MANAGE));
  protected readonly level = computed(() => {
    const l = this.banner()?.level;
    return l === 'Critical' ? 'sys-alert-danger' : l === 'Warning' ? 'sys-alert-warning' : 'sys-alert-info';
  });
}
