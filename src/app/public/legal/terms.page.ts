import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SITE } from '../site';
import { LegalLayoutComponent } from './legal-layout.component';
import { TERMS_SECTIONS } from './terms.data';

@Component({
    selector: 'zp-terms-page',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [LegalLayoutComponent],
    template: `
    <zp-legal-layout title="Terms of Service" [sections]="sections">
      <p>Please read these Terms carefully. They govern your use of ZestPoint, a service of {{ site.parent }}.</p>
    </zp-legal-layout>
  `
})
export class TermsPageComponent {
  protected readonly site = SITE;
  protected readonly sections = TERMS_SECTIONS;
}
