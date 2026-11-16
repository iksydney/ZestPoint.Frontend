import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComparisonTableComponent } from './comparison-table.component';
import { FeatureGridComponent } from './feature-grid.component';
import { HeroSectionComponent } from './hero-section.component';
import { NewsletterBoxComponent } from './newsletter-box.component';
import { PricingPreviewComponent } from './pricing-preview.component';

@Component({
    selector: 'zp-home-page',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [HeroSectionComponent, FeatureGridComponent, ComparisonTableComponent, PricingPreviewComponent, NewsletterBoxComponent],
    template: `
    <zp-hero-section />
    <zp-feature-grid />
    <zp-comparison-table />
    <zp-pricing-preview />
    <zp-newsletter-box />
  `
})
export class HomePageComponent {}
