import { getSeo } from '~/utils/seo';
import useReveal from '~/utils/useReveal';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import styles from '~/styles/modules/routes/legal.module.css';

export const meta = () => getSeo({
  title: 'Privacy Policy',
  description: 'How Trovarcis handles your data across Trovarcis Reach, Trovarcis Mail and domain registration. What we collect, what we never store, and your rights.',
  path: '/privacy',
});

const SECTIONS = [
  { id: 'who-we-are', label: 'Who we are' },
  { id: 'account-data', label: 'Account and payment data' },
  { id: 'reach', label: 'Trovarcis Reach and web tools' },
  { id: 'mail', label: 'Trovarcis Mail' },
  { id: 'domains', label: 'Domain registration' },
  { id: 'third-party-services', label: 'Third-party services' },
  { id: 'cookies', label: 'Cookies and analytics' },
  { id: 'data-retention', label: 'Data retention' },
  { id: 'your-rights', label: 'Your rights' },
  { id: 'children', label: "Children's privacy" },
  { id: 'changes', label: 'Changes to this policy' },
  { id: 'contact', label: 'Contact' },
];

export default function Privacy() {
  const headerRef = useReveal();

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.inner}`}>
          <header ref={headerRef} className={`${styles.header} reveal`}>
            <h1 className={styles.title}>Privacy Policy</h1>
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
            <h2 id="who-we-are">Who we are</h2>
            <p>
              Trovarcis, operated by Remvolabs (&quot;Trovarcis&quot;, &quot;we&quot;,
              &quot;us&quot;), runs trovarci.sh, the Trovarcis Reach desktop app,
              Trovarcis Mail and our domain registration service. This policy
              explains what data each of them handles and why.
            </p>
            <p>
              Our products work very differently, so they handle data very
              differently. <strong>Trovarcis Reach</strong> keeps your campaigns,
              contacts and sending credentials on your own device.{' '}
              <strong>Trovarcis Mail</strong> is hosted email, so it has to
              store your mailboxes on our servers. Each is described separately
              below.
            </p>

            <h2 id="account-data">Account and payment data</h2>
            <p>For every Trovarcis account we collect:</p>
            <ul>
              <li><strong>Account information</strong> - your email address and a hashed version of your password. We never store your password in plain text.</li>
              <li><strong>Payment information</strong> - processed by our payment providers. We receive a transaction reference, the amount and the product purchased. We never see or store your full card number.</li>
              <li><strong>Balances and transactions</strong> - your Credit balance, your Trovarcis Mail balance and a ledger of purchases and charges, so billing is accurate.</li>
              <li><strong>Support messages</strong> - what you send us when you contact support.</li>
            </ul>

            <h2 id="reach">Trovarcis Reach and web tools</h2>

            <h3>What we never store</h3>
            <ul>
              <li><strong>Email content</strong> - your subject lines, email bodies and templates are composed and stored on your device only. They are sent directly from your device to your SMTP provider. Our servers never see them.</li>
              <li><strong>Contact lists</strong> - your imported contacts, groups, tags and segments live in a local database on your device. They are never uploaded to our servers.</li>
              <li><strong>SMTP and API credentials</strong> - your SMTP passwords, API keys and provider settings are encrypted and stored locally on your device. They are never sent to or stored on our servers.</li>
              <li><strong>Email addresses submitted for verification</strong> - processed, results delivered, then deleted. Bulk verification results are deleted automatically 48 hours after completion.</li>
              <li><strong>Phone numbers submitted for verification</strong> - the same: processed, delivered, deleted.</li>
              <li><strong>Domains checked</strong> - DNS lookups are performed server-side but the domain you check is not logged or stored.</li>
              <li><strong>Email content scored by Arcis</strong> - sent to the Anthropic Claude API for analysis, then discarded. We do not keep the content or the scores.</li>
            </ul>

            <h3>Verification job metadata</h3>
            <p>
              For verification jobs we keep the number of items submitted, the
              processing status and the completion time, not the email addresses
              or phone numbers themselves.
            </p>

            <h3>Desktop app</h3>
            <p>
              The Trovarcis Reach desktop app (Windows, macOS, Linux) stores all
              its data locally on your device:
            </p>
            <ul>
              <li>Contacts, campaigns, templates and settings are stored in a local SQLite database on your device.</li>
              <li>SMTP credentials are encrypted using your operating system&apos;s secure storage.</li>
              <li>The app connects to trovarci.sh only for license activation, update checks and Credit-based features. These requests contain the minimum data required.</li>
              <li>Emails are sent directly from your device to your SMTP provider. They do not pass through our servers.</li>
            </ul>

            <h2 id="mail">Trovarcis Mail</h2>
            <p>
              Hosted email only works if the mail is stored somewhere, so
              Trovarcis Mail stores your mailboxes on our servers. This is what
              we store and how we treat it.
            </p>

            <h3>What we store</h3>
            <ul>
              <li><strong>Mailbox contents</strong> - the emails you send and receive, attachments, folders, drafts and any contacts or calendars you keep in your mailbox.</li>
              <li><strong>Mailbox settings</strong> - addresses, aliases, forwarding rules, filters and signatures.</li>
              <li><strong>Your domains&apos; configuration</strong> - DNS records and verification status for the domains you add.</li>
              <li><strong>Delivery logs</strong> - for each message: sender, recipients, time, size, delivery status and the servers involved. Logs do not contain message bodies.</li>
              <li><strong>Security logs</strong> - sign-in times, IP addresses and devices used to access your mailboxes, to detect and stop account takeovers.</li>
              <li><strong>DNS provider access</strong> - if you connect Cloudflare or another DNS provider, an access token limited to managing your DNS records. It is stored encrypted and you can revoke it at any time.</li>
            </ul>

            <h3>How we use it</h3>
            <ul>
              <li>To store, deliver and receive your mail, and to show it to you on your devices.</li>
              <li>To filter spam and malware automatically.</li>
              <li>To enforce sending limits and detect compromised accounts and abuse.</li>
              <li>To investigate a specific abuse report or a problem you ask us to look into.</li>
              <li>To meet legal obligations.</li>
            </ul>

            <h3>What we never do</h3>
            <ul>
              <li>We do not sell your data or your mail.</li>
              <li>We do not read your mail for advertising or profiling, and we do not show ads.</li>
              <li>We do not use your mail to train AI models.</li>
              <li>Staff only access message content when it is necessary for one of the purposes above, such as investigating an abuse report or a support request you made.</li>
            </ul>

            <h3>Outgoing mail and delivery partners</h3>
            <p>
              Outgoing mail from Trovarcis Mail is delivered through Amazon
              Simple Email Service (Amazon SES) in the EU (Stockholm region).
              Amazon SES handles each outgoing message, including its content,
              only to deliver it, and reports bounces and spam complaints back
              to us so we can protect deliverability.
            </p>

            <h3>Security</h3>
            <p>
              Mail is encrypted in transit between your devices and our servers
              (HTTPS and TLS) and, where the other server supports it, between
              mail servers. Stored mail is encrypted at rest. Trovarcis Mail is
              not end-to-end encrypted: our servers can process message content,
              which is what makes webmail, search and spam filtering work.
            </p>

            <h2 id="domains">Domain registration</h2>
            <ul>
              <li>When you register a domain, we collect the registrant details registries require: name, organisation (if any), address, phone number and email address.</li>
              <li>We pass these details to our registrar partner and the relevant domain registry, as required to register the domain in your name.</li>
              <li>Registries and ICANN rules may require your email address to be verified, and may publish some details in public WHOIS or RDAP records. We enable WHOIS privacy by default where the extension supports it, which hides your personal details from public lookups.</li>
              <li>Registrant details may be disclosed to registries, ICANN, dispute-resolution providers or authorities where their rules or the law require it.</li>
            </ul>

            <h2 id="third-party-services">Third-party services</h2>
            <p>We use the following providers to run our services:</p>

            <table>
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Purpose</th>
                  <th>Data shared</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Bachs</td>
                  <td>Card and bank payments</td>
                  <td>Payment details and email address (handled by Bachs, not us)</td>
                </tr>
                <tr>
                  <td>Cryptomus</td>
                  <td>Crypto payments</td>
                  <td>Wallet address and transaction ID</td>
                </tr>
                <tr>
                  <td>Amazon Web Services (Amazon SES)</td>
                  <td>Delivering outgoing Trovarcis Mail</td>
                  <td>Outgoing messages, sender and recipient addresses, bounce and complaint reports</td>
                </tr>
                <tr>
                  <td>Openprovider</td>
                  <td>Domain registration</td>
                  <td>Registrant contact details for domains you register</td>
                </tr>
                <tr>
                  <td>Hostinger</td>
                  <td>Server hosting</td>
                  <td>Data stored on our servers, including Trovarcis Mail mailboxes</td>
                </tr>
                <tr>
                  <td>Anthropic (Claude API)</td>
                  <td>Email scoring (Arcis)</td>
                  <td>Email content for analysis (not retained)</td>
                </tr>
                <tr>
                  <td>Twilio</td>
                  <td>Phone number verification</td>
                  <td>Phone numbers for lookup (not retained by us)</td>
                </tr>
                <tr>
                  <td>Resend</td>
                  <td>Account emails from trovarci.sh</td>
                  <td>Your email address (for account notifications)</td>
                </tr>
                <tr>
                  <td>Cloudflare</td>
                  <td>DNS, CDN, DDoS protection, country-level geolocation</td>
                  <td>IP address (used for routing and the two-letter country code in our analytics)</td>
                </tr>
              </tbody>
            </table>

            <p>
              Each provider has its own privacy policy. We choose providers that
              limit what they collect and use data only to provide their
              service to us.
            </p>

            <h2 id="cookies">Cookies and analytics</h2>
            <p>
              trovarci.sh uses only the cookies needed for the service to work:
            </p>
            <ul>
              <li><strong>Session cookie</strong> - an encrypted, httpOnly cookie that keeps you signed in. Expires after 30 days.</li>
              <li><strong>No tracking cookies</strong> - we do not use Google Analytics, Facebook Pixel or any advertising trackers.</li>
              <li><strong>No third-party cookies</strong> - we do not embed social media widgets or third-party scripts that set cookies.</li>
            </ul>

            <h3>How we measure usage</h3>
            <p>
              Analytics on trovarci.sh are built in-house and stored in our own
              database. We do not send page-view or behavioural data to any
              third-party analytics provider.
            </p>
            <p>To understand how the site is used we record:</p>
            <ul>
              <li><strong>Page views</strong> - the path you visited, the referring domain (never the full URL) and any UTM campaign parameters in the link you arrived on.</li>
              <li><strong>Tool events</strong> - which tool you ran, whether it succeeded and how many Credits it used. Not the email addresses, phone numbers or domains you submitted.</li>
              <li><strong>Funnel steps</strong> - whether you reached signup, completed signup, viewed pricing, started checkout and completed payment.</li>
              <li><strong>Country</strong> - a two-letter country code derived from your IP by Cloudflare. We do not store the IP itself.</li>
              <li><strong>Device class</strong> - mobile, tablet or desktop, derived from your browser&apos;s User-Agent string.</li>
            </ul>

            <h3>Cookieless sessioning</h3>
            <p>
              Instead of a tracking cookie we group events from the same visitor
              within a single UTC day using a one-way hash of your IP, your
              User-Agent string, the date and a server-side secret. The hash
              rotates every UTC midnight, so we cannot follow one person across
              days unless they are signed in. We never store your IP or full
              User-Agent in our analytics tables.
            </p>

            <h3>Bot traffic</h3>
            <p>
              We filter out search engine crawlers and other automated traffic
              before any analytics row is written.
            </p>

            <h3>Error telemetry</h3>
            <p>
              When something breaks we record the error message, stack trace,
              the URL involved and a redacted summary of the request headers
              (with cookies, authorization headers and passwords removed). Email
              addresses in error messages are replaced with a one-way hash.
              Error events are deleted after 180 days.
            </p>

            <h3>Analytics retention</h3>
            <p>
              Raw analytics events are deleted after 90 days. After that only
              anonymous daily totals remain, with no per-user, per-IP or
              per-session detail.
            </p>

            <h2 id="data-retention">Data retention</h2>
            <ul>
              <li><strong>Account data</strong> - kept while your account is active and deleted when you ask us to delete your account.</li>
              <li><strong>Transaction records</strong> - kept for 7 years for tax and legal compliance.</li>
              <li><strong>Trovarcis Mail mailboxes</strong> - kept while the mailbox is active. When you delete a mailbox or close your account, its contents are permanently deleted after 30 days, so an accidental deletion can be reversed. Deleted data may remain in encrypted backups for up to a further 30 days before those backups are overwritten.</li>
              <li><strong>Mailboxes suspended for non-payment</strong> - kept while the account is in grace or suspension. We email you before deleting anything.</li>
              <li><strong>Mail delivery and security logs</strong> - kept for 90 days.</li>
              <li><strong>Domain registrant data</strong> - kept while the domain is registered with us and as long afterwards as registry rules require.</li>
              <li><strong>Bulk verification results</strong> - deleted 48 hours after job completion.</li>
              <li><strong>Session data</strong> - expired sessions are purged daily.</li>
              <li><strong>Server logs</strong> - rotated every 30 days. They contain request metadata (IP, timestamp, route), not message content.</li>
            </ul>

            <h2 id="your-rights">Your rights</h2>
            <p>Wherever you live, you can:</p>
            <ul>
              <li><strong>Access your data</strong> - ask for a copy of the data we hold about you.</li>
              <li><strong>Correct your data</strong> - update your account and registrant details at any time.</li>
              <li><strong>Export your data</strong> - download your transaction history from your dashboard, and export your Trovarcis Mail mail over IMAP at any time.</li>
              <li><strong>Delete your account</strong> - email <a href="mailto:support@trovarcis.com">support@trovarcis.com</a>. We process deletion requests within 30 days, subject to the retention rules above.</li>
            </ul>
            <p>
              If you are in the European Union or the United Kingdom, you also
              have rights under the GDPR, including the rights to data
              portability, to restrict processing and to object to processing,
              and the right to complain to your data protection authority. If
              you are in Nigeria, you have the rights set out in the Nigeria
              Data Protection Act. Contact us to exercise any of these rights.
            </p>

            <h2 id="children">Children&apos;s privacy</h2>
            <p>
              Our services are not intended for anyone under 16. We do not
              knowingly collect personal information from children. If you
              believe a child has given us personal information, contact us and
              we will delete it.
            </p>

            <h2 id="changes">Changes to this policy</h2>
            <p>
              We may update this policy. For significant changes we notify
              account holders by email and update the date at the top of this
              page. Continuing to use our services after the changes take
              effect means you accept the updated policy.
            </p>

            <h2 id="contact">Contact</h2>
            <div className={styles.contactBox}>
              <p>For privacy questions or data requests:</p>
              <p><strong>Email:</strong> <a href="mailto:support@trovarcis.com">support@trovarcis.com</a></p>
              <p><strong>Operator:</strong> Trovarcis, operated by Remvolabs</p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
