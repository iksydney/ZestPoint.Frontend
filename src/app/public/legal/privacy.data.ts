import { SITE } from '../site';
import { LegalSectionData } from './legal-layout.component';

export const PRIVACY_SECTIONS: readonly LegalSectionData[] = [
  {
    id: 'who-we-are',
    title: 'Who we are and our role',
    html: `
        <p>ZestPoint is a multi-tenant point-of-sale platform operated by ${SITE.parent} (&ldquo;ZestNovaForge&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;).</p>
        <p>Our role depends on the data:</p>
        <ul>
          <li><strong>Data controller</strong> for our own website visitors, prospects, newsletter subscribers and account administrators (the &ldquo;CEO&rdquo; or owner of a workspace).</li>
          <li><strong>Data processor</strong> for data that a venue (our customer, the &ldquo;Tenant&rdquo;) enters into or generates in its workspace, including staff records, guest and tab data and sales. The Tenant is the controller of that data and we process it on the Tenant&apos;s documented instructions under a data processing agreement.</li>
        </ul>
        <p>Privacy contact: <a href="mailto:${SITE.privacyEmail}">${SITE.privacyEmail}</a>.</p>
    `
  },
  {
    id: 'data-we-collect',
    title: 'Data we collect',
    html: `
      <ul>
        <li><strong>Account and onboarding data:</strong> name, work email, phone number, company name, subdomain, branding (logo, colours) and subscription details.</li>
        <li><strong>Staff data (entered by Tenants):</strong> display name, role and screen-level permissions, hashed PIN, sign-in and activity audit logs.</li>
        <li><strong>Venue and store sales telemetry:</strong> orders, tabs, baskets, voids, comps, discounts, pour volumes, bottle and item weights, SKU and stock counts, variance reports, device and terminal identifiers, and sync status.</li>
        <li><strong>Guest data (entered by Tenants):</strong> tab names, room numbers for room posting, and optional contact details a Tenant chooses to record.</li>
        <li><strong>Website and form data:</strong> contact and demo-request submissions, newsletter email addresses, and technical data such as IP address, browser type and pages visited.</li>
      </ul>
    `
  },
  {
    id: 'payment-information',
    title: 'Payment information',
    html: `
        <p>ZestPoint does not store full card numbers, CVV codes or magnetic-stripe data. Card payments and pre-authorisations are handled by PCI DSS-certified payment processors; we receive only tokens, the last four digits, card brand, amount and authorisation status needed to reconcile sales.</p>
        <p>Subscription billing is processed by our payment provider, which acts as an independent controller of the payment details you give it.</p>
    `
  },
  {
    id: 'purposes-legal-bases',
    title: 'How we use data and our legal bases',
    html: `
      <ul>
        <li><strong>Providing the service</strong> (contract): running workspaces, authenticating staff, enforcing permissions, processing sales, syncing data.</li>
        <li><strong>Security and fraud prevention</strong> (legitimate interests; legal obligation): audit trails, anomaly detection, abuse prevention.</li>
        <li><strong>Product improvement and analytics</strong> (legitimate interests): aggregated and de-identified usage and performance insights.</li>
        <li><strong>Marketing and newsletters</strong> (consent): you may withdraw consent at any time using the unsubscribe link or by contacting us.</li>
        <li><strong>Legal compliance</strong> (legal obligation): tax, accounting and regulatory record keeping.</li>
      </ul>
    `
  },
  {
    id: 'multi-tenancy',
    title: 'Multi-tenant isolation',
    html: `
      <p>Each Tenant&apos;s data is logically isolated. Every record carries a tenant identifier, every query is filtered by it, and every authenticated request is checked so that a user can only reach the tenant they belong to. Staff access within a tenant is limited by screen-level role permissions. We do not use one Tenant&apos;s data to serve another.</p>
    `
  },
  {
    id: 'security-encryption',
    title: 'Security, encryption and offline sync',
    html: `
      <ul>
        <li>Data is encrypted in transit using TLS and at rest using industry-standard encryption.</li>
        <li><strong>Offline sync:</strong> when a venue&apos;s local node or terminal is offline, pending transactions are held in an encrypted local store and transmitted over an encrypted channel on reconnection. Operations carry unique identifiers so replays do not create duplicates.</li>
        <li>PINs are stored only as salted hashes. Access tokens are short-lived and bound to a single tenant.</li>
        <li>We apply least-privilege internal access, audit logging and regular security reviews.</li>
        <li>If a personal data breach occurs we will notify affected Tenants without undue delay and, where required, the relevant regulator within 72 hours (GDPR Art. 33; NDPA/NDPR) and affected individuals where there is a high risk to them.</li>
      </ul>
    `
  },
  {
    id: 'sharing',
    title: 'Who we share data with',
    html: `
        <p>We share personal data only with:</p>
        <ul>
          <li>Sub-processors that help us operate the service (cloud hosting, database, email delivery, payment processing, error monitoring), bound by written data protection terms.</li>
          <li>Professional advisers, and authorities where the law requires it.</li>
          <li>A successor entity in a merger or acquisition, subject to this policy.</li>
        </ul>
        <p>We do not sell personal data. A current sub-processor list is available on request.</p>
    `
  },
  {
    id: 'international-transfers',
    title: 'International transfers',
    html: `
      <p>Data may be processed outside Nigeria and the European Economic Area. Where we transfer personal data we rely on an adequacy decision, Standard Contractual Clauses or another lawful transfer mechanism, in line with the GDPR and the Nigeria Data Protection Act 2023 and its implementing regulations (including the NDPR).</p>
    `
  },
  {
    id: 'retention',
    title: 'Retention',
    html: `
      <ul>
        <li><strong>Tenant workspace data</strong> is kept for the life of the subscription and for up to 90 days afterwards for export, then deleted or anonymised, except where law requires longer retention.</li>
        <li><strong>Financial and tax records</strong> are retained for the period required by applicable law.</li>
        <li><strong>Marketing data</strong> is kept until you unsubscribe or ask us to delete it.</li>
        <li><strong>Backups</strong> are overwritten on a rolling cycle, after which deleted data is no longer recoverable.</li>
      </ul>
    `
  },
  {
    id: 'cookies',
    title: 'Cookies and similar technologies',
    html: `
        <p>This website uses a small number of cookies and local storage entries:</p>
        <ul>
          <li><strong>Strictly necessary / preference:</strong> remembers your light or dark theme choice. No consent is required.</li>
          <li><strong>Analytics and marketing:</strong> only set with your consent where required, and you can withdraw it at any time.</li>
        </ul>
        <p>You can control cookies in your browser settings. The ZestPoint application uses session storage and, for offline operation, an encrypted local database; these are essential to the service.</p>
    `
  },
  {
    id: 'your-rights',
    title: 'Your rights, including deletion',
    html: `
        <p>Under the GDPR and the NDPR/NDPA you have the right to:</p>
        <ul>
          <li>access your personal data and receive a copy;</li>
          <li>have inaccurate data corrected;</li>
          <li><strong>request erasure</strong> (&ldquo;right to be forgotten&rdquo;) where no overriding legal basis for retention exists;</li>
          <li>restrict or object to processing, including direct marketing;</li>
          <li>data portability in a structured, machine-readable format;</li>
          <li>withdraw consent at any time, without affecting earlier lawful processing;</li>
          <li>not be subject to decisions based solely on automated processing with legal effects.</li>
        </ul>
        <p>To exercise a right, email <a href="mailto:${SITE.privacyEmail}">${SITE.privacyEmail}</a>. We respond within one month (30 days). If your data sits in a venue&apos;s workspace, we will direct your request to that venue, the controller, and assist them in responding. You may also complain to the Nigeria Data Protection Commission, or to your local EU/EEA supervisory authority.</p>
    `
  },
  {
    id: 'children',
    title: 'Children',
    html: `<p>ZestPoint is a business service for licensed venues, retailers and is not directed to anyone under 18. We do not knowingly collect children&apos;s personal data. If you believe we have, contact us and we will delete it.</p>`
  },
  {
    id: 'changes-contact',
    title: 'Changes and contact',
    html: `
        <p>We may update this policy and will post the new version here with a revised date, and notify Tenant administrators of material changes.</p>
        <p>
          ${SITE.parent}<br>
          Email: <a href="mailto:${SITE.privacyEmail}">${SITE.privacyEmail}</a><br>
          Support: <a href="mailto:${SITE.supportEmail}">${SITE.supportEmail}</a>
        </p>
    `
  }
];
