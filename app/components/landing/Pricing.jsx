import useReveal from '~/utils/useReveal';
import styles from '~/styles/modules/landing/Pricing.module.css';

// Mirrors CREDIT_PACKAGES in paymentsConfig.server.js. Flat $0.01/credit at every tier.
const PACKS = [
  {
    name: "Starter",
    price: "$5",
    credits: "500",
    bulkEmails: "2,500",
    alternates: "Or 500 scores · 250 phone lookups",
    cta: "Buy Starter",
    href: "/credits?pkg=starter",
    popular: false,
  },
  {
    name: "Growth",
    price: "$25",
    credits: "2,500",
    bulkEmails: "12,500",
    alternates: "Or 2,500 scores · 1,250 phone lookups",
    cta: "Buy Growth",
    href: "/credits?pkg=growth",
    popular: true,
  },
  {
    name: "Pro",
    price: "$100",
    credits: "10,000",
    bulkEmails: "50,000",
    alternates: "Or 10,000 scores · 5,000 phone lookups",
    cta: "Buy Pro",
    href: "/credits?pkg=pro",
    popular: false,
  },
];

export default function Pricing() {
  const headerRef = useReveal();
  const cardsRef = useReveal(0.08);
  const footnoteRef = useReveal();

  return (
    <section className={styles.section} id="pricing">
      <div className={styles.bgRadial} aria-hidden="true" />
      <div className={styles.bgNoise} aria-hidden="true" />

      <div className={`container ${styles.inner}`}>
        <div ref={headerRef} className={`${styles.header} reveal`}>
          <div className={styles.kickerRow}>
            <span className="signal-dot signal-dot--sm" aria-hidden="true" />
            <span className={styles.kicker}>One-time</span>
          </div>
          <h2 className={styles.heading}>Pricing</h2>
          <p className={styles.sub}>
            Flat $0.01 per credit. Same rate at any volume. No subscription, no renewal.
          </p>
        </div>

        <div ref={cardsRef} className={`${styles.cards} stagger`}>
          {PACKS.map((pack) => (
            <div
              key={pack.name}
              className={`${styles.card} ${pack.popular ? styles.cardPopular : ''} reveal`}
            >
              {pack.popular && (
                <span className={styles.badge}>
                  <span className="signal-dot signal-dot--sm" aria-hidden="true" />
                  Most popular
                </span>
              )}

              <h3 className={styles.packName}>{pack.name}</h3>

              <div className={styles.priceRow}>
                <span className={styles.price}>{pack.price}</span>
                <span className={styles.period}>one-time</span>
              </div>

              <ul className={styles.details}>
                <li className={styles.detailPrimary}>
                  <span className={styles.detailValue}>{pack.credits}</span>
                  <span className={styles.detailLabel}>credits</span>
                </li>
                <li className={styles.detailSecondary}>
                  <span className={styles.detailApprox}>≈</span>
                  <span className={styles.detailNumber}>{pack.bulkEmails}</span>
                  <span className={styles.detailText}>emails verified in bulk</span>
                </li>
                <li className={styles.detailTertiary}>{pack.alternates}</li>
                <li className={styles.detailTertiary}>All free tools included</li>
              </ul>

              <a
                href={pack.href}
                className={`${styles.cta} ${pack.popular ? styles.ctaPrimary : styles.ctaSecondary}`}
              >
                {pack.cta}
              </a>
            </div>
          ))}
        </div>

        <div ref={footnoteRef} className={`${styles.footnote} reveal`}>
          <p>Or buy any integer amount from 100 to 50,000 credits at the same rate.</p>
          <p>Credits expire 12 months from purchase. Reminder emails before expiry.</p>
          <p>15-day money-back guarantee on unused credits.</p>
        </div>
      </div>
    </section>
  );
}
