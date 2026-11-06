import { Link } from 'react-router';
import { TrovarcisLogo } from '~/components/shared/Logo';
import styles from '~/styles/modules/layout/Footer.module.css';

// Link text says what each page is for, in the words people search with.
// Tools follow the order a campaign needs them, matching the homepage path.
const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Trovarcis Sender", href: "/sender" },
      { label: "Sender vs SendBlaster", href: "/blog/trovarcis-reach-vs-sendblaster" },
      { label: "Your Sender license", href: "/account/sender" },
      { label: "Pricing", href: "/#pricing" },
      { label: "Credits", href: "/credits" },
      { label: "Pay with crypto", href: "/pay-with-crypto" },
    ],
  },
  {
    title: "Tools",
    links: [
      { label: "Domain blacklist checker", href: "/domain" },
      { label: "SPF, DKIM, DMARC generator", href: "/records" },
      { label: "Email verifier", href: "/verify" },
      { label: "Phone number checker", href: "/verify-number" },
      { label: "Spam score checker", href: "/score" },
      { label: "SMTP tester", href: "/smtp-test" },
    ],
  },
  {
    title: "Guides",
    links: [
      { label: "Why emails go to spam", href: "/blog/why-emails-go-to-spam" },
      { label: "Set up SPF, DKIM, DMARC", href: "/blog/spf-dkim-dmarc-setup" },
      { label: "Fix SPF PermError", href: "/blog/spf-permerror-10-dns-lookups-fix" },
      { label: "Is my domain blacklisted?", href: "/blog/domain-blacklisted-check-fix" },
      { label: "Clean an email list", href: "/blog/clean-email-list-before-sending" },
      { label: "All guides", href: "/blog" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Refund Policy", href: "/refund" },
      { label: "Acceptable Use", href: "/acceptable-use" },
    ],
  },
  {
    title: "Help",
    links: [
      { label: "Contact", href: "/contact" },
      { label: "support@trovarcis.com", href: "mailto:support@trovarcis.com" },
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
              Send bulk email from your own computer. Check your domain, list
              and message first.
            </p>
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
