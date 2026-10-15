import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PricingPreviewComponent } from './pricing-preview.component';

@Component({
  selector: 'zp-pricing-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PricingPreviewComponent],
  template: `<zp-pricing-preview [full]="true" />`
})
export class PricingPageComponent {}
