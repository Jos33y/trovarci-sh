import { getSeo } from '~/utils/seo';
import useReveal from '~/utils/useReveal';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import styles from '~/styles/modules/routes/legal.module.css';

export const meta = () => getSeo({
  title: 'Privacy Policy',
  description: 'How Trovarcis Reach handles your data. What we collect, what we never store, and your rights.',
  path: '/privacy',
});

const SECTIONS = [
  { id: 'what-we-collect', label: 'What we collect' },
  { id: 'what-we-never-store', label: 'What we never store' },
  { id: 'desktop-mobile-app', label: 'Desktop and mobile app' },
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
            <p>
              Trovarcis LLC ("Trovarcis", "we", "us") operates trovarci.sh and the
              Trovarcis Reach desktop and mobile applications. This policy explains
              how we handle your data when you use our products and services.
            </p>
            <p>
              The short version: we collect the minimum needed to provide our services.
              Your email content, contact lists, and sending credentials never touch
              our servers.
            </p>

            <h2 id="what-we-collect">What we collect</h2>
            <p>When you create an account on trovarci.sh, we collect:</p>
            <ul>
              <li><strong>Account information</strong> - your email address and a hashed version of your password. We never store your password in plain text.</li>
              <li><strong>Payment information</strong> - processed by Stripe or Cryptomus. We receive a transaction reference and the product purchased. We never see or store your full card number.</li>
              <li><strong>Credit balance and transactions</strong> - your Credit balance and a ledger of purchases and usage to provide accurate billing.</li>
              <li><strong>Verification job metadata</strong> - the number of items submitted, processing status, and completion time. Not the actual email addresses or phone numbers (see below).</li>
            </ul>

            <h2 id="what-we-never-store">What we never store</h2>
            <p>
              This is the most important section. Trovarcis Reach is built on
              the principle that your data stays on your device.
            </p>
            <ul>
              <li><strong>Email content</strong> - your subject lines, email bodies, and templates are composed and stored on your device only. They are sent directly from your device to your SMTP provider. Our servers never see them.</li>
              <li><strong>Contact lists</strong> - your imported contacts, groups, tags, and segments live on your device in a local database. They are never uploaded to our servers.</li>
              <li><strong>SMTP and API credentials</strong> - your SMTP passwords, API keys, and provider configurations are encrypted and stored locally on your device. They are never transmitted to or stored on our servers.</li>
              <li><strong>Email addresses submitted for verification</strong> - processed in memory, results delivered, then permanently deleted. Bulk verification results are auto-deleted 48 hours after completion.</li>
              <li><strong>Phone numbers submitted for verification</strong> - same as email addresses. Processed, delivered, deleted.</li>
              <li><strong>Domains checked</strong> - DNS lookups are performed server-side but the domain you check is not logged or stored.</li>
              <li><strong>Email content scored by Arcis</strong> - sent to the Anthropic Claude API for analysis, then discarded. We do not retain the content or the scores.</li>
            </ul>

            <h2 id="desktop-mobile-app">Desktop and mobile app</h2>
            <p>
              The Trovarcis Reach desktop app (Windows, macOS, Linux) and mobile
              app (Android, iOS) store all data locally on your device:
            </p>
            <ul>
              <li>Contacts, campaigns, templates, and settings are stored in a local SQLite database on your device.</li>
              <li>SMTP credentials are encrypted using your operating system's secure storage (Electron safeStorage on desktop, Keychain/Keystore on mobile).</li>
              <li>The app connects to trovarci.sh only for license activation, update checks, and Credit-based features (email scoring, verification). These requests contain the minimum data required.</li>
              <li>Emails are sent directly from your device to your SMTP provider. They do not pass through our servers.</li>
            </ul>

            <h2 id="third-party-services">Third-party services</h2>
            <p>We use the following third-party services to operate:</p>

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
                  <td>Stripe</td>
                  <td>Card payments</td>
                  <td>Payment details (handled by Stripe, not us)</td>
                </tr>
                <tr>
                  <td>Cryptomus</td>
                  <td>Crypto payments</td>
                  <td>Wallet address and transaction ID</td>
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
                  <td>Transactional emails</td>
                  <td>Your email address (for account notifications)</td>
                </tr>
                <tr>
                  <td>Cloudflare</td>
                  <td>CDN, DDoS protection, country-level geolocation</td>
                  <td>IP address (used for routing and the two-letter country code we display in admin analytics)</td>
                </tr>
              </tbody>
            </table>

            <p>
              Each of these services has its own privacy policy. We select
              providers that respect user privacy and minimize data collection.
            </p>

            <h2 id="cookies">Cookies and analytics</h2>
            <p>
              trovarci.sh uses minimal cookies required for the service to function:
            </p>
            <ul>
              <li><strong>Session cookie</strong> - an encrypted, httpOnly cookie that keeps you logged in. Required for account functionality. Expires after 30 days.</li>
              <li><strong>No tracking cookies</strong> - we do not use Google Analytics, Facebook Pixel, or any advertising trackers.</li>
              <li><strong>No third-party cookies</strong> - we do not embed social media widgets or third-party scripts that set cookies.</li>
            </ul>

            <h3>How we measure usage</h3>
            <p>
              Analytics on trovarci.sh are built in-house and stored on our own
              database. We do not send page-view or behavioral data to any
              third-party analytics provider.
            </p>
            <p>
              To understand how the site is used we record:
            </p>
            <ul>
              <li><strong>Page views</strong> - the path you visited, the page that referred you (domain only, never the full URL), and any UTM campaign parameters in the link you arrived on.</li>
              <li><strong>Tool events</strong> - which tool you ran, whether the run succeeded, and how many credits it consumed. We do not record the email addresses, phone numbers, or domains you submit to verifiers; we record only that a verification happened.</li>
              <li><strong>Funnel steps</strong> - whether you reached signup, completed signup, viewed pricing, started checkout, and completed payment. This tells us where the experience is breaking down.</li>
              <li><strong>Country</strong> - a two-letter ISO country code derived from your IP by Cloudflare. We do not store the IP itself; only the country code reaches our database.</li>
              <li><strong>Device class</strong> - mobile, tablet, or desktop, derived from your browser&apos;s User-Agent string.</li>
            </ul>

            <h3>Cookieless sessioning</h3>
            <p>
              Instead of a tracking cookie we group events from the same visitor
              within a single UTC day using a one-way hash of (your IP) + (your
              User-Agent string) + (today&apos;s date) + (a server-side secret).
              The hash is 16 hexadecimal characters. It rotates every UTC
              midnight, so we cannot reconstruct what one person did across
              multiple days unless you are signed in. We never store your IP
              or your full User-Agent in our analytics tables.
            </p>

            <h3>Bot traffic</h3>
            <p>
              We filter out search engine crawlers and other automated traffic
              at the server, before any analytics row is written. This keeps
              our reporting accurate without needing to record bot activity.
            </p>

            <h3>Error telemetry</h3>
            <p>
              When something breaks - a server exception, a JavaScript crash in
              your browser, an unhandled promise rejection - we record it so we
              can fix it. The record includes the error message, the stack
              trace, the URL that triggered it, and a redacted summary of the
              request headers (with cookies, authorization headers, and
              passwords stripped). Email addresses appearing in error messages
              are replaced with a one-way hash. We retain error events for 180
              days, then they are deleted.
            </p>

            <h3>Retention</h3>
            <p>
              Raw analytics events are deleted after 90 days. After that only
              anonymous daily aggregates remain (counts of page views, signups,
              countries, and so on). Aggregates have no per-user, per-IP, or
              per-session detail and are kept indefinitely.
            </p>

            <h2 id="data-retention">Data retention</h2>
            <ul>
              <li><strong>Account data</strong> - retained as long as your account is active. Deleted upon account deletion request.</li>
              <li><strong>Transaction records</strong> - retained for 7 years for tax and legal compliance.</li>
              <li><strong>Bulk verification results</strong> - auto-deleted 48 hours after job completion.</li>
              <li><strong>Session data</strong> - expired sessions are purged daily.</li>
              <li><strong>Server logs</strong> - rotated every 30 days. Logs contain request metadata (IP, timestamp, route) but never email addresses, phone numbers, or content.</li>
            </ul>

            <h2 id="your-rights">Your rights</h2>
            <p>Regardless of where you live, you can:</p>
            <ul>
              <li><strong>Access your data</strong> - request a copy of all data we hold about you.</li>
              <li><strong>Correct your data</strong> - update your email address or account information at any time.</li>
              <li><strong>Delete your account</strong> - request complete deletion of your account and all associated data by emailing support@trovarcis.com. We process deletion requests within 30 days.</li>
              <li><strong>Export your data</strong> - download your transaction history and account information from your dashboard.</li>
            </ul>
            <p>
              If you are in the European Union, you have additional rights under
              GDPR including the right to data portability, the right to restrict
              processing, and the right to object to processing. Contact us to
              exercise any of these rights.
            </p>

            <h2 id="children">Children's privacy</h2>
            <p>
              Trovarcis Reach is not intended for use by anyone under the age of 16.
              We do not knowingly collect personal information from children. If you
              believe a child has provided us with personal information, please
              contact us and we will delete it.
            </p>

            <h2 id="changes">Changes to this policy</h2>
            <p>
              We may update this policy from time to time. When we make significant
              changes, we will notify you by email (if you have an account) and
              update the "Last updated" date at the top of this page. Your continued
              use of our services after changes take effect constitutes acceptance of
              the updated policy.
            </p>

            <h2 id="contact">Contact</h2>
            <div className={styles.contactBox}>
              <p>For privacy-related questions or data requests:</p>
              <p><strong>Email:</strong> <a href="mailto:support@trovarcis.com">support@trovarcis.com</a></p>
              <p><strong>Company:</strong> Trovarcis LLC, Wyoming, USA</p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}