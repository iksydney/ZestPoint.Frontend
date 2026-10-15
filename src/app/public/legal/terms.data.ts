import { SITE } from '../site';
import { LegalSectionData } from './legal-layout.component';

export const TERMS_SECTIONS: readonly LegalSectionData[] = [
  {
    id: 'agreement',
    title: 'Agreement and definitions',
    html: `
        <p>These Terms form a binding agreement between ${SITE.parent} (&ldquo;ZestNovaForge&rdquo;) and the business that registers for ZestPoint (&ldquo;Customer&rdquo;). By creating a workspace or using the service you confirm you have authority to bind the Customer.</p>
        <ul>
          <li><strong>Service</strong>: the ZestPoint platform, local node software, applications and APIs.</li>
          <li><strong>Workspace</strong> or <strong>Tenant</strong>: the Customer&apos;s isolated environment.</li>
          <li><strong>Owner</strong>: the Customer&apos;s CEO/administrator account holder.</li>
          <li><strong>Authorised Users</strong>: staff the Owner grants access to.</li>
        </ul>
    `
  },
  {
    id: 'accounts-tenancy',
    title: 'Accounts and multi-tenant workspace rules',
    html: `
      <ul>
        <li>Each Customer receives one isolated Workspace. You must not attempt to access another Workspace or circumvent tenant isolation.</li>
        <li>The Owner is responsible for creating Authorised Users, assigning screen-level permissions and keeping PINs and credentials confidential.</li>
        <li>You are responsible for all activity under your Workspace, including actions by Authorised Users within their granted permissions.</li>
        <li>Branding you upload (logo, colours) must not infringe third-party rights.</li>
      </ul>
    `
  },
  {
    id: 'service-levels',
    title: 'Service levels (SLA)',
    html: `
        <ul>
          <li><strong>Availability target:</strong> 99.9% monthly uptime for the cloud service, excluding scheduled maintenance announced at least 48 hours ahead and events outside our reasonable control.</li>
          <li><strong>Offline operation:</strong> the local node is designed to continue trading during internet or cloud outages. Time offline does not count as cloud downtime, and queued transactions sync on reconnection.</li>
          <li><strong>Support:</strong> via <a href="mailto:${SITE.supportEmail}">${SITE.supportEmail}</a>. Critical (trading stopped) issues are acknowledged within 1 hour; high within 4 hours; normal within 1 business day. Enterprise plans may have enhanced terms.</li>
          <li><strong>Service credits:</strong> if monthly availability falls below the target, the Customer may claim a pro-rata credit against the next invoice, as the sole remedy for downtime, requested within 30 days of month-end.</li>
        </ul>
    `
  },
  {
    id: 'subscriptions-payment',
    title: 'Subscriptions and payment',
    html: `
      <ul>
        <li>Plans (for example Express Bar, Cocktail Pro and Enterprise Lounge) and billing periods (monthly or annual) are those shown at sign-up or in your order form. Fees exclude applicable taxes.</li>
        <li>Fees are billed in advance and renew automatically unless cancelled before the renewal date. Annual plans are non-refundable except where required by law.</li>
        <li>We may change prices on at least 30 days&apos; written notice, effective from your next renewal.</li>
        <li>Overdue amounts may accrue interest at the lower of 1.5% per month or the maximum permitted by law.</li>
        <li><strong>Feature gates:</strong> access to modules and screens depends on your plan. Features outside your plan, or all features when payment lapses, may be restricted to read-only or disabled, as described below.</li>
      </ul>
    `
  },
  {
    id: 'lockout',
    title: 'Non-payment, read-only mode and hard lockout',
    html: `
        <p>To protect trading, we apply a staged process when an invoice is unpaid:</p>
        <ul>
          <li><strong>Days 1 to 7 (grace period):</strong> full access continues; we send payment reminders to the Owner.</li>
          <li><strong>Days 8 to 21 (read-only mode):</strong> the Workspace becomes read-only. You can view data and export reports, but new sales-affecting changes, such as menu edits, stock adjustments, staff changes and plan-gated modules, are disabled. Where a local node is trading, in-flight sales and offline queues are preserved.</li>
          <li><strong>Day 22 onwards (hard lockout):</strong> access to the Workspace is suspended until the balance is cleared. Data is retained for 90 days so you can reinstate or export it; after that it may be deleted.</li>
        </ul>
        <p>Paying all overdue amounts restores access promptly. We are not liable for losses caused by suspension carried out in accordance with this section.</p>
    `
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    html: `
        <p>You must not: (a) breach law or the rights of others; (b) probe, scan or test the Service&apos;s security without written consent; (c) reverse engineer or copy the Service except as the law allows; (d) overload the Service or interfere with other Tenants; (e) resell or provide the Service as a bureau without our agreement; or (f) use the Service to process unlawful transactions.</p>
        <p>You are responsible for holding all licences needed to operate your venue or store and to sell regulated goods such as alcohol or tobacco, and for age-verification and responsible service obligations. ZestPoint is a tool and does not provide legal or compliance advice.</p>
    `
  },
  {
    id: 'data-protection',
    title: 'Customer data and data protection',
    html: `
        <p>As between the parties, the Customer owns the data it enters into the Service (&ldquo;Customer Data&rdquo;) and grants us a licence to host and process it to provide the Service. For personal data in Customer Data, we act as processor and you as controller, under our data processing terms and <a href="/privacy">Privacy Policy</a>.</p>
        <p>The Customer is responsible for the lawfulness of the data it collects from staff and guests. You may export Customer Data at any time during the subscription and for 90 days afterward.</p>
    `
  },
  {
    id: 'ip',
    title: 'Intellectual property',
    html: `
        <p>ZestNovaForge and its licensors own all rights in the ZestPoint platform, software, local node, APIs, documentation, designs, the ZestPoint and ZestNovaForge names and logos, and any improvements or derivatives. These Terms grant you only a limited, non-exclusive, non-transferable, revocable right to use the Service during your subscription.</p>
        <p>If you give us feedback, you grant us a perpetual, royalty-free right to use it without obligation. Customer Data and your own branding remain yours.</p>
    `
  },
  {
    id: 'warranties-liability',
    title: 'Warranties, liability and indemnity',
    html: `
      <ul>
        <li>The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. To the extent permitted by law we disclaim implied warranties of merchantability, fitness for a particular purpose and non-infringement.</li>
        <li>We are not liable for indirect, incidental, special or consequential loss, or loss of profit, revenue, goodwill or data, however arising.</li>
        <li>Our total aggregate liability arising from the Service in any 12-month period is limited to the fees paid by the Customer for that period.</li>
        <li>Nothing limits liability that cannot lawfully be limited, including for fraud, or death or personal injury caused by negligence.</li>
        <li>The Customer will indemnify us against third-party claims arising from its Customer Data, its breach of these Terms, or its venue operations, including alcohol licensing and sales.</li>
        <li>Hardware (scales, terminals, printers) is subject to its manufacturer&apos;s warranty; we are not responsible for third-party hardware faults.</li>
      </ul>
    `
  },
  {
    id: 'term-termination',
    title: 'Term and termination',
    html: `
      <ul>
        <li>The subscription runs for the chosen period and renews automatically. Either party may stop renewal with 30 days&apos; notice before the renewal date.</li>
        <li>Either party may terminate for material breach not remedied within 14 days of notice; we may suspend immediately for security threats or unlawful use.</li>
        <li>On termination your access ends, unpaid fees become due, and we will make your data available for export for 90 days before deletion, subject to legal retention duties.</li>
        <li>Sections that by nature should survive (including payment, IP, liability, governing law) survive termination.</li>
      </ul>
    `
  },
  {
    id: 'general',
    title: 'Governing law and general terms',
    html: `
        <p>These Terms are governed by the laws of the Federal Republic of Nigeria, and the courts of Nigeria have exclusive jurisdiction, without prejudice to any mandatory consumer or data-protection rights you have elsewhere. The parties will first attempt to resolve disputes in good faith through negotiation for 30 days.</p>
        <p>These Terms, together with your order form and the Privacy Policy, are the entire agreement. If a provision is unenforceable the rest remains in force. We may update these Terms with 30 days&apos; notice for material changes; continued use after that date constitutes acceptance. Neither party is liable for delay caused by events beyond its reasonable control.</p>
        <p>Questions: <a href="mailto:${SITE.infoEmail}">${SITE.infoEmail}</a>.</p>
    `
  }
];
