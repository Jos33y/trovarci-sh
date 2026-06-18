import { getSeo } from '~/utils/seo';
import useReveal from '~/utils/useReveal';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import styles from '~/styles/modules/routes/legal.module.css';

export const meta = () => getSeo({
  title: 'Terms of Service',
  description: 'Terms governing the use of Trovarcis Reach software, web tools, and services.',
  path: '/terms',
});

const SECTIONS = [
  { id: 'agreement', label: 'Agreement to terms' },
  { id: 'description', label: 'Description of service' },
  { id: 'accounts', label: 'Account registration' },
  { id: 'license', label: 'Software license' },
  { id: 'credits', label: 'Credits' },
  { id: 'acceptable-use', label: 'Acceptable Use Policy' },
  { id: 'your-responsibilities', label: 'Your responsibilities' },
  { id: 'third-party', label: 'Third-party services' },
  { id: 'intellectual-property', label: 'Intellectual property' },
  { id: 'disclaimer', label: 'Disclaimer and liability' },
  { id: 'termination', label: 'Termination' },
  { id: 'governing-law', label: 'Governing law' },
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
            <p className={styles.updated}>Last updated: February 28, 2026</p>
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
              By accessing trovarci.sh, downloading, or using the Trovarcis Reach
              desktop or mobile application, you agree to be bound by these Terms
              of Service. If you do not agree, do not use our products or services.
            </p>
            <p>
              These terms constitute a legal agreement between you and Trovarcis LLC
              ("Trovarcis", "we", "us"), a Wyoming limited liability company.
            </p>

            <h2 id="description">Description of service</h2>
            <p>
              Trovarcis Reach is a bulk email and SMS sending application available
              as a desktop app (Windows, macOS, Linux), mobile app (Android, iOS),
              and a set of web-based tools hosted at trovarci.sh.
            </p>
            <p>
              The software allows you to compose and send email campaigns using your
              own SMTP servers or email API providers. Trovarcis Reach does not
              provide email sending infrastructure. You are responsible for providing
              and configuring your own sending services.
            </p>

            <h2 id="accounts">Account registration</h2>
            <p>
              To access paid features and web tools, you must create an account with
              a valid email address and password. You are responsible for maintaining
              the security of your account credentials.
            </p>
            <ul>
              <li>You must provide accurate information during registration.</li>
              <li>One account per person. Shared accounts are not permitted.</li>
              <li>You must be at least 16 years old to create an account.</li>
              <li>You are responsible for all activity under your account.</li>
              <li>Notify us immediately if you suspect unauthorized access.</li>
            </ul>

            <h2 id="license">Software license</h2>
            <p>
              When you purchase Trovarcis Reach, you receive a perpetual,
              non-exclusive, non-transferable license to use the software.
            </p>
            <ul>
              <li><strong>Perpetual</strong> - your license never expires. One-time purchase, lifetime use.</li>
              <li><strong>Device limits</strong> - Free tier: 1 device. Paid licenses: up to 3 devices per license.</li>
              <li><strong>Personal use</strong> - each license is for one person. You may not share, resell, sublicense, or transfer your activation code to another person.</li>
              <li><strong>Updates</strong> - all updates within the same major version are free. Major version upgrades may require a separate purchase at a discounted rate.</li>
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
              <li>Reverse engineer, decompile, or disassemble the software.</li>
              <li>Remove or alter any copyright notices or branding.</li>
              <li>Use the software to build a competing product.</li>
              <li>Share your activation code publicly or with others.</li>
              <li>Circumvent any license restrictions or device limits.</li>
            </ul>

            <h2 id="credits">Credits</h2>
            <p>
              Credits are the internal currency used for paid web tools on
              trovarci.sh (email scoring, email verification, number verification).
            </p>
            <ul>
              <li><strong>1 Credit = $0.01.</strong> Always.</li>
              <li>Credits never expire.</li>
              <li>Credits are non-transferable between accounts.</li>
              <li>Credit purchases are non-refundable except where required by law. If your account is deleted, remaining Credits are forfeited.</li>
              <li>We reserve the right to adjust Credit pricing for tools with 30 days notice. Existing Credit balances retain their value.</li>
            </ul>

            <h2 id="acceptable-use">Acceptable Use Policy</h2>
            <p>
              This section is critical. Trovarcis Reach is a powerful tool and
              we take responsible use seriously. Violation of this policy may
              result in immediate license revocation and account termination
              without refund.
            </p>

            <h3>You must</h3>
            <ul>
              <li>Only send emails to recipients who have given consent (opt-in) or with whom you have a legitimate business relationship.</li>
              <li>Include a working unsubscribe mechanism in every marketing email.</li>
              <li>Include your physical mailing address or registered business address in every marketing email.</li>
              <li>Honor unsubscribe requests promptly (within 10 business days maximum).</li>
              <li>Comply with all applicable laws in your jurisdiction, including CAN-SPAM (US), GDPR (EU), CASL (Canada), PECR (UK), and any other relevant anti-spam or data protection legislation.</li>
              <li>Use your own legitimately obtained SMTP servers or authorized email API accounts.</li>
              <li>Maintain clean contact lists and remove bounced addresses promptly.</li>
            </ul>

            <h3>You must not</h3>
            <ul>
              <li><strong>Send unsolicited bulk email (spam).</strong> This includes cold email to purchased, scraped, harvested, or rented email lists. If the recipient did not opt in or does not have a prior relationship with you, do not email them.</li>
              <li><strong>Use purchased or scraped contact lists.</strong> Every email address in your list must come from legitimate, consensual collection.</li>
              <li><strong>Send phishing, scam, or fraudulent messages.</strong> Any attempt to deceive recipients, impersonate other organizations, or steal credentials is strictly prohibited.</li>
              <li><strong>Distribute malware, viruses, or harmful content.</strong> Do not send emails containing malicious attachments, links to malware, or exploit kits.</li>
              <li><strong>Send illegal content.</strong> This includes content that violates any applicable law, promotes illegal activity, contains child exploitation material, or incites violence or hatred.</li>
              <li><strong>Harass, threaten, or abuse recipients.</strong> Do not use Trovarcis Reach to send threatening, abusive, defamatory, or harassing messages.</li>
              <li><strong>Send deceptive messages.</strong> Do not use misleading subject lines, false sender information, or deceptive content designed to trick recipients.</li>
              <li><strong>Use stolen or unauthorized SMTP credentials.</strong> Only use sending infrastructure that you own or are authorized to use.</li>
              <li><strong>Overwhelm mail servers.</strong> Do not intentionally flood or attack mail servers, including your own sending infrastructure or recipient mail servers.</li>
              <li><strong>Circumvent sending restrictions.</strong> Do not attempt to bypass rate limits, blacklists, or block lists through technical manipulation.</li>
              <li><strong>Send unsolicited SMS messages.</strong> The same consent requirements apply to SMS campaigns. Only message recipients who have opted in.</li>
            </ul>

            <h3>Regarding the web tools</h3>
            <ul>
              <li>Do not use the email verification tool to validate scraped or purchased email lists.</li>
              <li>Do not use automated scripts to bypass free tier limits.</li>
              <li>Do not use the tools to gather intelligence for spamming purposes.</li>
              <li>Rate limits exist to ensure fair access. Do not attempt to circumvent them.</li>
            </ul>

            <h3>Enforcement</h3>
            <p>
              If we receive abuse complaints, blacklist notifications, or evidence
              of policy violations, we may:
            </p>
            <ul>
              <li>Suspend or revoke your license without refund.</li>
              <li>Terminate your account and forfeit remaining Credits.</li>
              <li>Report illegal activity to relevant authorities.</li>
              <li>Cooperate with law enforcement investigations when legally required.</li>
            </ul>
            <p>
              Abuse reports should be sent to{' '}
              <a href="mailto:abuse@trovarcis.com">abuse@trovarcis.com</a>.
            </p>

            <h2 id="your-responsibilities">Your responsibilities</h2>
            <p>
              Because Trovarcis Reach is a bring-your-own-infrastructure tool,
              you are solely responsible for:
            </p>
            <ul>
              <li>The content of every email and SMS you send.</li>
              <li>Obtaining and maintaining proper consent from your recipients.</li>
              <li>Configuring your SMTP servers and API accounts correctly.</li>
              <li>Complying with your email provider's terms of service and sending limits.</li>
              <li>Managing your sender reputation, domain authentication (SPF, DKIM, DMARC), and IP warm-up.</li>
              <li>Backing up your local data. Trovarcis Reach stores data on your device. We cannot recover lost local data.</li>
              <li>Keeping your software updated to the latest version for security patches.</li>
            </ul>

            <h2 id="third-party">Third-party services</h2>
            <p>
              Trovarcis Reach integrates with third-party services (SMTP providers,
              email APIs, SMS APIs) that you configure. We are not responsible for:
            </p>
            <ul>
              <li>The availability, reliability, or performance of your chosen providers.</li>
              <li>Fees charged by your SMTP or API providers.</li>
              <li>Actions taken by providers against your account (suspensions, blocks).</li>
              <li>Data handling by your chosen providers. Review their privacy policies separately.</li>
            </ul>

            <h2 id="intellectual-property">Intellectual property</h2>
            <p>
              Trovarcis Reach, including its code, design, logo, name, documentation,
              and the Arcis AI engine, are the intellectual property of Trovarcis LLC.
              Your purchase grants a license to use the software, not ownership of
              any intellectual property.
            </p>
            <p>
              Content you create with Trovarcis Reach (emails, templates, contact
              lists) remains your property. We claim no ownership over your content.
            </p>

            <h2 id="disclaimer">Disclaimer and limitation of liability</h2>
            <p>
              Trovarcis Reach is provided "as is" and "as available" without
              warranties of any kind, either express or implied, including but
              not limited to implied warranties of merchantability, fitness for a
              particular purpose, and non-infringement.
            </p>
            <p>We do not warrant that:</p>
            <ul>
              <li>The software will be error-free or uninterrupted.</li>
              <li>Your emails will be delivered to the inbox (deliverability depends on many factors outside our control).</li>
              <li>The email scoring, verification, or other tools will be 100% accurate.</li>
              <li>The software will be compatible with all systems or configurations.</li>
            </ul>
            <p>
              To the maximum extent permitted by law, Trovarcis LLC shall not be
              liable for any indirect, incidental, special, consequential, or
              punitive damages, or any loss of profits, revenue, data, or business
              opportunities arising from your use of the software.
            </p>
            <p>
              Our total liability for any claim related to the software shall not
              exceed the amount you paid for your license in the 12 months preceding
              the claim.
            </p>

            <h2 id="termination">Termination</h2>
            <ul>
              <li><strong>By you</strong> - you may stop using the software at any time. Your license remains valid even if you stop using the product. To delete your account and data, contact support@trovarcis.com.</li>
              <li><strong>By us</strong> - we may terminate your account and revoke your license if you violate these terms, particularly the Acceptable Use Policy. In cases of serious violation, termination is immediate and without refund.</li>
            </ul>
            <p>
              Upon termination, your right to use the software and web tools
              ceases. Data stored locally on your device remains yours.
            </p>

            <h2 id="governing-law">Governing law</h2>
            <p>
              These terms are governed by the laws of the State of Wyoming, United
              States, without regard to its conflict of laws provisions.
            </p>
            <p>
              Any disputes arising from these terms or your use of Trovarcis Reach
              shall be resolved in the state or federal courts located in Wyoming.
              You consent to the personal jurisdiction of such courts.
            </p>

            <h2 id="changes">Changes to terms</h2>
            <p>
              We may update these terms from time to time. When we make material
              changes, we will notify you by email (if you have an account) and
              update the "Last updated" date at the top of this page. Your continued
              use of the software or services after changes take effect constitutes
              acceptance of the updated terms.
            </p>
            <p>
              If you disagree with any changes, you may stop using the services.
              Your existing license to the desktop and mobile app remains valid.
            </p>

            <h2 id="contact">Contact</h2>
            <div className={styles.contactBox}>
              <p>For questions about these terms:</p>
              <p><strong>General:</strong> <a href="mailto:support@trovarcis.com">support@trovarcis.com</a></p>
              <p><strong>Abuse reports:</strong> <a href="mailto:abuse@trovarcis.com">abuse@trovarcis.com</a></p>
              <p><strong>Company:</strong> Trovarcis LLC, Wyoming, USA</p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}