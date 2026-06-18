import { Link } from 'react-router';
import { TrovarcisLogo } from '~/components/shared/Logo';
import styles from '~/styles/modules/layout/Footer.module.css';

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "Pricing", href: "/#pricing" },
      { label: "Download", href: "/download" },
      { label: "Credits", href: "/credits" },
    ],
  },
  {
    title: "Free Tools",
    links: [
      { label: "Email Scorer", href: "/score" },
      { label: "Domain Checker", href: "/domain" },
      { label: "Email Verifier", href: "/verify" },
      { label: "SMTP Tester", href: "/smtp-test" },
      { label: "DNS Generator", href: "/records" },
      { label: "Number Verifier", href: "/verify-number" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Refund Policy", href: "/refund" },
    ],
  },
  {
    title: "Connect",
    links: [
      { label: "Blog", href: "/blog" },
      { label: "X (Twitter)", href: "https://x.com/trovarcisreach", external: true },
      { label: "GitHub", href: "https://github.com/trovarcis", external: true },
      { label: "support@trovarcis.com", href: "mailto:support@trovarcis.com", external: true },
    ],
  },
];

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <div className={styles.grid}>
          <div className={styles.brand}>
            <TrovarcisLogo size={28} />
            <p className={styles.tagline}>
              Infrastructure for businesses that move fast.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title} className={styles.column}>
              <h4 className={styles.columnTitle}>{col.title}</h4>
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
                    ) : link.href.startsWith('/#') ? (
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
            <span className={styles.copyrightSymbol} aria-hidden="true" /> 2026 Trovarcis LLC <span className={styles.dot} aria-hidden="true" /> Wyoming, USA
          </p>
        </div>
      </div>
    </footer>
  );
}