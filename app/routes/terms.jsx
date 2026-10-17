import { getSeo } from '~/utils/seo';
import useReveal from '~/utils/useReveal';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import styles from '~/styles/modules/routes/legal.module.css';

export const meta = () => getSeo({
  title: 'Terms of Service',
  description: 'Terms governing Trovarcis Reach, Trovarcis Mail, domain registration and the web tools at trovarci.sh.',
  path: '/terms',
});

const SECTIONS = [
  { id: 'agreement', label: 'Agreement to terms' },
  { id: 'services', label: 'Our services' },
  { id: 'accounts', label: 'Account registration' },
  { id: 'license', label: 'Trovarcis Reach license' },
  { id: 'credits', label: 'Credits' },
  { id: 'mail', label: 'Trovarcis Mail' },
  { id: 'domains', label: 'Domain registration' },
  { id: 'acceptable-use', label: 'Acceptable use' },
  { id: 'your-responsibilities', label: 'Your responsibilities' },
  { id: 'third-party', label: 'Third-party services' },
  { id: 'intellectual-property', label: 'Intellectual property' },
  { id: 'disclaimer', label: 'Disclaimer and liability' },
  { id: 'termination', label: 'Termination' },
  { id: 'changes', label: 'Changes to terms' },
  { id: 'contact', label: 'Contact' },
];

export default function Terms() {
  const headerRef = useReveal();

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.inner}`}>
          <header ref={headerRef} className={`${styles.header} reveal`}>
            <h1 className={styles.title}>Terms of Service</h1>
            <p className={styles.updated}>Last updated: October 17, 2026</p>
          </header>

          <hr className={styles.divider} />

          <nav className={styles.toc}>
            <p className={styles.tocLabel}>On this page</p>
            <ul className={styles.tocList}>
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className={styles.tocLink}>{s.label}</a>
                </li>
              ))}
            </ul>
          </nav>

          <div className={styles.content}>
            <h2 id="agreement">Agreement to terms</h2>
            <p>
              These Terms of Service are an agreement between you and
              Trovarcis, operated by Remvolabs (&quot;Trovarcis&quot;, &quot;we&quot;,
              &quot;us&quot;). By creating an account, buying anything from us, or
              using trovarci.sh, the Trovarcis Reach desktop app or Trovarcis
              Mail, you agree to these terms, our{' '}
              <a href="/acceptable-use">Acceptable Use Policy</a>, our{' '}
              <a href="/privacy">Privacy Policy</a> and our{' '}
              <a href="/refund">Refund Policy</a>. If you do not agree, do not
              use our services.
            </p>
            <p>
              If you use our services on behalf of a business, you confirm that
              you are authorised to accept these terms for that business.
            </p>

            <h2 id="services">Our services</h2>
            <ul>
              <li><strong>Trovarcis Reach</strong> - a desktop application (Windows, macOS, Linux) for sending email and SMS campaigns through SMTP servers and providers that you own or are authorised to use, plus web tools at trovarci.sh for email scoring, email and phone verification and domain checks. Reach does not provide sending infrastructure.</li>
              <li><strong>Trovarcis Mail</strong> - hosted business email on your own domain: mailboxes, webmail, IMAP and SMTP access for your devices, and sending through our infrastructure, subject to sending limits.</li>
              <li><strong>Domain registration</strong> - registering and renewing domain names through our accredited registrar partner, so you can use them with Trovarcis Mail or anywhere else.</li>
            </ul>
            <p>
              Sections of these terms that name a specific service apply only to
              that service. Everything else applies to all of them.
            </p>

            <h2 id="accounts">Account registration</h2>
            <ul>
              <li>You must provide accurate information and keep it up to date.</li>
              <li>You must be at least 16 years old.</li>
              <li>Each account belongs to one person or one business. You may give your own staff access to mailboxes you pay for.</li>
              <li>You are responsible for all activity under your account and its mailboxes, and for keeping your credentials secure.</li>
              <li>Tell us immediately at <a href="mailto:support@trovarcis.com">support@trovarcis.com</a> if you suspect unauthorised access.</li>
            </ul>

            <h2 id="license">Trovarcis Reach license</h2>
            <p>
              When you buy Trovarcis Reach, you receive a perpetual,
              non-exclusive, non-transferable license to use the desktop
              software.
            </p>
            <ul>
              <li><strong>Perpetual</strong> - your license does not expire. One-time purchase, lifetime use.</li>
              <li><strong>Device limits</strong> - Free tier: 1 device. Paid licenses: up to 3 devices per license.</li>
              <li><strong>Personal use</strong> - each license is for one person. You may not share, resell, sublicense or transfer your activation code.</li>
              <li><strong>Updates</strong> - updates within the same major version are free. Major version upgrades may require a separate purchase at a discounted rate.</li>
            </ul>

            <h3>License tiers</h3>
            <table>
              <thead>
                <tr>
                  <th>Tier</th>
                  <th>Price</th>
                  <th>Devices</th>
                  <th>Includes</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Free</td>
                  <td>$0</td>
                  <td>1</td>
                  <td>1 SMTP, 500 contacts, 1,000 emails/campaign</td>
                </tr>
                <tr>
                  <td>Email Pro</td>
                  <td>$79 one-time</td>
                  <td>3</td>
                  <td>Unlimited SMTP, contacts, emails, all features</td>
                </tr>
                <tr>
                  <td>SMS Pro</td>
                  <td>$49 one-time</td>
                  <td>3</td>
                  <td>SMS campaigns, multi-provider support</td>
                </tr>
                <tr>
                  <td>Bundle</td>
                  <td>$119 one-time</td>
                  <td>3</td>
                  <td>Everything in Email Pro + SMS Pro</td>
                </tr>
              </tbody>
            </table>

            <h3>What you may not do</h3>
            <ul>
              <li>Reverse engineer, decompile or disassemble the software.</li>
              <li>Remove or alter copyright notices or branding.</li>
              <li>Use the software to build a competing product.</li>
              <li>Share your activation code publicly or with others.</li>
              <li>Circumvent license restrictions or device limits.</li>
            </ul>

            <h2 id="credits">Credits</h2>
            <p>
              Credits are the internal currency for paid web tools on
              trovarci.sh (email scoring, email verification, number
              verification).
            </p>
            <ul>
              <li><strong>1 Credit = $0.01.</strong> Always.</li>
              <li>Credits never expire.</li>
              <li>Credits are non-transferable between accounts.</li>
              <li>Credit purchases are non-refundable except as described in our <a href="/refund">Refund Policy</a> or where required by law. If your account is deleted, remaining Credits are forfeited.</li>
              <li>We may adjust Credit pricing for tools with 30 days notice. Existing Credit balances keep their value.</li>
            </ul>

            <h2 id="mail">Trovarcis Mail</h2>

            <h3>Prepaid balance and billing</h3>
            <ul>
              <li>Trovarcis Mail is paid from a prepaid balance held in US dollars. You top up by card, bank transfer or cryptocurrency through the payment options shown at checkout. Some customers may see prices in their local currency at checkout.</li>
              <li>Each active mailbox is charged monthly from your balance at the price shown in your dashboard at the time of the charge. Mailboxes added part-way through a month are charged a prorated amount when they are created.</li>
              <li>We warn you by email before your balance runs out. If your balance cannot cover a charge, a grace period applies. After the grace period, <strong>sending is suspended but incoming mail continues to be received</strong> until the balance is restored.</li>
              <li>We may change mailbox prices with at least 30 days notice by email. New prices apply from your next charge after the notice period.</li>
            </ul>

            <h3>Your domain and DNS</h3>
            <ul>
              <li>You may only add domains that you own or are authorised to manage. Sending is enabled only after the domain is verified.</li>
              <li>If you connect your DNS provider (for example Cloudflare) we will create and update the records Trovarcis Mail needs. You can remove that access at any time.</li>
            </ul>

            <h3>Sending limits</h3>
            <p>
              Every mailbox has a daily sending limit, counted per recipient, as
              described in the <a href="/acceptable-use#sending-limits">Acceptable Use Policy</a>.
              Trovarcis Mail is for person-to-person business email, not bulk
              or marketing campaigns.
            </p>

            <h3>Your mail</h3>
            <ul>
              <li>The email, contacts and files in your mailboxes belong to you. We store and process them only to provide the service, as described in our <a href="/privacy#mail">Privacy Policy</a>.</li>
              <li>You can export your mail at any time over IMAP while your account is active.</li>
              <li>When you close a mailbox or your account, its contents are deleted after the retention period stated in the Privacy Policy. Export anything you want to keep before then.</li>
              <li>We back up mail regularly, but you are responsible for keeping your own copies of anything critical.</li>
            </ul>

            <h3>Availability</h3>
            <p>
              We work to keep Trovarcis Mail available at all times, but
              maintenance, provider outages and events outside our control can
              cause interruptions. We do not currently offer a service level
              agreement. Planned maintenance is announced in advance where
              possible.
            </p>

            <h2 id="domains">Domain registration</h2>
            <ul>
              <li>Domains are registered through our accredited registrar partner. <strong>You are the registrant and the owner of every domain you buy</strong>, registered under your own contact details.</li>
              <li>You must provide accurate registrant details and confirm your email address when the registry asks. Domains with unverified or false details can be suspended by the registry.</li>
              <li>WHOIS privacy is enabled by default where the domain extension supports it.</li>
              <li>Registration and renewal are paid from your Trovarcis balance. We show the renewal price before you buy, which can differ from the first-year price.</li>
              <li>We send renewal reminders before expiry. Renewal is charged from your balance. If the balance cannot cover it and the domain expires, it may stop working and can eventually be lost. Expired domains may only be recoverable at the registry&apos;s restore fee, if at all.</li>
              <li>You can transfer your domain to another registrar at any time, subject to registry rules such as the 60-day transfer lock after registration or a previous transfer. We provide the transfer code on request.</li>
              <li>Domains are subject to the policies of the relevant registry and of ICANN, including the Uniform Domain-Name Dispute-Resolution Policy (UDRP). We may have to suspend, lock or transfer a domain where a registry, a dispute decision or the law requires it.</li>
            </ul>

            <h2 id="acceptable-use">Acceptable use</h2>
            <p>
              Your use of every Trovarcis service is governed by our{' '}
              <a href="/acceptable-use">Acceptable Use Policy</a>. In short: no
              spam, no phishing or fraud, no impersonation, no malware, no
              illegal content, and no attempts to get around our limits. We may
              pause sending, suspend accounts, place domains on hold or end your
              account when the policy is broken, as set out there.
            </p>
            <p>
              Abuse reports go to{' '}
              <a href="mailto:abuse@trovarcis.com">abuse@trovarcis.com</a>.
            </p>

            <h2 id="your-responsibilities">Your responsibilities</h2>
            <p>For every service, you are responsible for:</p>
            <ul>
              <li>The content of every email and SMS you send and the consent of your recipients.</li>
              <li>Complying with the laws that apply to you and your recipients.</li>
              <li>Keeping your account, mailbox and device credentials secure.</li>
            </ul>
            <p>For Trovarcis Reach, which uses your own infrastructure, you are also responsible for:</p>
            <ul>
              <li>Configuring your SMTP servers and API accounts and following their terms and limits.</li>
              <li>Managing your sender reputation, domain authentication (SPF, DKIM, DMARC) and IP warm-up.</li>
              <li>Backing up your local data. Reach stores your data on your device and we cannot recover it.</li>
              <li>Keeping the software updated for security fixes.</li>
            </ul>

            <h2 id="third-party">Third-party services</h2>
            <p>
              Our services rely on third parties such as payment processors,
              our domain registrar partner and email delivery providers, listed
              in our <a href="/privacy#third-party-services">Privacy Policy</a>.
              For Trovarcis Reach you also connect your own SMTP, email API and
              SMS providers. We are not responsible for:
            </p>
            <ul>
              <li>The availability or performance of providers you choose yourself.</li>
              <li>Fees charged by your own SMTP, API or SMS providers.</li>
              <li>Actions your own providers take against your accounts with them.</li>
            </ul>

            <h2 id="intellectual-property">Intellectual property</h2>
            <p>
              Trovarcis Reach, Trovarcis Mail, trovarci.sh, the Arcis engine,
              and their code, design, names, logos and documentation belong to
              Trovarcis. Your purchase gives you a license or a subscription to
              use them, not ownership.
            </p>
            <p>
              Your content (emails, templates, contacts and files) remains
              yours. We claim no ownership over it.
            </p>

            <h2 id="disclaimer">Disclaimer and limitation of liability</h2>
            <p>
              Our services are provided &quot;as is&quot; and &quot;as available&quot;
              without warranties of any kind, express or implied, including
              merchantability, fitness for a particular purpose and
              non-infringement, to the extent the law allows.
            </p>
            <p>We do not guarantee that:</p>
            <ul>
              <li>Any service will be error-free or uninterrupted.</li>
              <li>Any email will reach the inbox. Deliverability depends on many factors outside our control, including how recipients&apos; providers treat your messages.</li>
              <li>Scoring, verification or other tool results will be 100% accurate.</li>
              <li>The software will work with every system or configuration.</li>
            </ul>
            <p>
              To the maximum extent permitted by law, Trovarcis is not liable
              for any indirect, incidental, special, consequential or punitive
              damages, or for loss of profits, revenue, data or business
              opportunities arising from your use of our services.
            </p>
            <p>
              Our total liability for any claim is limited to the amount you
              paid us for the service concerned in the 12 months before the
              claim.
            </p>

            <h2 id="termination">Termination</h2>
            <ul>
              <li><strong>By you</strong> - you can stop using our services at any time. You can close mailboxes from your dashboard. To delete your account and data, contact <a href="mailto:support@trovarcis.com">support@trovarcis.com</a>. A Reach license remains valid even if you stop using the product.</li>
              <li><strong>By us</strong> - we may suspend or end your account if you break these terms or the Acceptable Use Policy. For serious violations this can be immediate and without refund. Otherwise we give notice and, where possible, time to export your mail and transfer your domains.</li>
            </ul>
            <p>
              Domains you own remain yours after your account ends. We will
              provide transfer codes so you can move them to another registrar.
            </p>

            <h2 id="changes">Changes to terms</h2>
            <p>
              We may update these terms. For material changes we notify account
              holders by email and update the date at the top of this page.
              Continuing to use our services after the changes take effect means
              you accept them. If you disagree, you may stop using the services
              and, for Trovarcis Mail, ask for any refund the Refund Policy
              allows. Your existing Reach license remains valid.
            </p>

            <h2 id="contact">Contact</h2>
            <div className={styles.contactBox}>
              <p>For questions about these terms:</p>
              <p><strong>General:</strong> <a href="mailto:support@trovarcis.com">support@trovarcis.com</a></p>
              <p><strong>Abuse reports:</strong> <a href="mailto:abuse@trovarcis.com">abuse@trovarcis.com</a></p>
              <p><strong>Operator:</strong> Trovarcis, operated by Remvolabs</p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
