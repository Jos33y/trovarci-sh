import { Link } from 'react-router';
import { TrovarcisLogo } from '~/components/shared/Logo';
import { STORAGE_LINE } from '~/utils/senderCopy';
import styles from '~/styles/modules/layout/Footer.module.css';

// Link text says what each page is for, in the words people search with.
// Sender first, then the people it is written for; tools in the order a campaign needs them.
const COLUMNS = [
  {
    title: "Sender",
    links: [
      { label: "Trovarcis Sender", href: "/sender" },
      { label: "Download for Windows", href: "/download" },
      { label: "Your Sender license", href: "/account/sender" },
      { label: "Pay with crypto", href: "/pay-with-crypto" },
      { label: "Affiliate program", href: "/affiliates" },
      { label: "Bulk email cost calculator", href: "/bulk-email-cost-calculator" },
    ],
  },
  {
    title: "Written for",
    links: [
      { label: "Newsletter writers", href: "/blog/send-newsletter-without-mailchimp" },
      { label: "Churches", href: "/blog/email-all-church-members" },
      { label: "Schools", href: "/blog/email-all-parents-at-once" },
      { label: "Recruiters", href: "/blog/email-candidates-in-bulk" },
      { label: "Cold outreach", href: "/guides/cold-outreach-setup" },
    ],
  },
  {
    title: "Free tools",
    links: [
      { label: "Domain blacklist checker", href: "/domain" },
      { label: "SPF, DKIM, DMARC generator", href: "/records" },
      { label: "SMTP tester", href: "/smtp-test" },
      { label: "Email verifier", href: "/verify" },
      { label: "Phone number checker", href: "/verify-number" },
      { label: "Spam score checker", href: "/score" },
      { label: "Credits", href: "/credits" },
    ],
  },
  {
    title: "Help",
    links: [
      { label: "Help desk", href: "/guides" },
      { label: "Choose an SMTP account", href: "/guides/choose-smtp-account" },
      { label: "Gmail SMTP settings", href: "/guides/gmail-smtp-settings" },
      { label: "Why emails go to spam", href: "/guides/find-why-emails-go-to-spam" },
      { label: "Blog", href: "/blog" },
    ],
  },
  {
    title: "Compare",
    links: [
      { label: "Sender vs SendBlaster", href: "/blog/trovarcis-reach-vs-sendblaster" },
      { label: "SendBlaster alternatives", href: "/blog/sendblaster-alternatives" },
      { label: "MaxBulk Mailer alternatives", href: "/blog/maxbulk-mailer-alternatives" },
      { label: "Atomic Mail Sender alternatives", href: "/blog/atomic-mail-sender-alternatives" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about/trovarcis-team" },
      { label: "Contact", href: "/contact" },
      { label: "support@trovarcis.com", href: "mailto:support@trovarcis.com" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Refund Policy", href: "/refund" },
      { label: "Acceptable Use", href: "/acceptable-use" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className="container">
        <div className={styles.grid}>
          <div className={styles.brand}>
            <TrovarcisLogo size={28} />
            <p className={styles.tagline}>
              Bulk email from your own computer, through your own accounts. One
              payment, no monthly bill.
            </p>
            <p className={styles.storage}>{STORAGE_LINE}</p>
            <Link to="/sender" className={styles.cta}>Get Sender</Link>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title} className={styles.column}>
              <h2 className={styles.columnTitle}>{col.title}</h2>
              <ul className={styles.columnList}>
                {col.links.map((link) => (
                  <li key={link.href}>
                    {link.external ? (
                      <a
                        href={link.href}
                        className={styles.columnLink}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {link.label}
                      </a>
                    ) : link.href.startsWith('/#') || link.href.startsWith('mailto:') ? (
                      <a href={link.href} className={styles.columnLink}>
                        {link.label}
                      </a>
                    ) : (
                      <Link to={link.href} className={styles.columnLink}>
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className={styles.bottom}>
          <p className={styles.copyright}>
            <span className={styles.copyrightSymbol} aria-hidden="true" /> 2026 Trovarcis, operated by Remvolabs
          </p>
        </div>
      </div>
    </footer>
  );
}
