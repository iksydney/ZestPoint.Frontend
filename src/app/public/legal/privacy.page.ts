import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SITE } from '../site';
import { LegalLayoutComponent } from './legal-layout.component';
import { PRIVACY_SECTIONS } from './privacy.data';

@Component({
  selector: 'zp-privacy-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LegalLayoutComponent],
  template: `
    <zp-legal-layout title="Privacy Policy" [sections]="sections">
      <p>
        This policy explains how {{ site.parent }} handles personal data on the ZestPoint website and platform, and how we meet the
        EU/UK GDPR and the Nigeria Data Protection Regulation (NDPR) and Nigeria Data Protection Act 2023.
      </p>
    </zp-legal-layout>
  `
})
export class PrivacyPageComponent {
  protected readonly site = SITE;
  protected readonly sections = PRIVACY_SECTIONS;
}
