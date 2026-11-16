import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { InstallService } from '../../core/services/install.service';

/**
 * "Install ZestPoint on this device", in the same place as the account and status banners. Only on phones and tablets, never once it is installed,
 * and "Not now" keeps it away for 30 days on this device. On an iPhone it says how to use the Share menu, because there is no button to press.
 */
@Component({
  selector: 'zp-install-hint',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (install.showHint()) {
      <section class="sys-alert sys-alert-info mt-3 flex flex-wrap items-start justify-between gap-3" role="region" aria-label="Install the application" data-testid="install-hint">
        <div class="min-w-0 flex-1">
          <p class="font-bold">Install ZestPoint on this device</p>
          <p class="mt-0.5 font-normal">It opens full-screen from your home screen, like any other app, and starts faster.</p>
          @if (install.ios && !install.canPrompt()) { <p class="mt-1 text-sm font-normal" data-testid="install-ios">On an iPhone or iPad: tap the Share button in your browser, then <strong>Add to Home Screen</strong>.</p> }
        </div>
        <div class="flex flex-wrap gap-2">
          @if (install.canPrompt()) { <button type="button" class="btn-primary text-sm" data-testid="install-now" (click)="install.install()">Install</button> }
          <button type="button" class="btn-ghost text-sm" data-testid="install-dismiss" (click)="install.dismiss()">Not now</button>
        </div>
      </section>
    }
  `
})
export class InstallHintComponent {
  protected readonly install = inject(InstallService);
}
