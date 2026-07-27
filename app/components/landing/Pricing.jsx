import useReveal from '~/utils/useReveal';
import { CREDIT_PACKAGES, PER_CREDIT_LABEL, formatUsd } from '~/utils/pricing';
import { formatInt } from '~/utils/format';
import styles from '~/styles/modules/landing/Pricing.module.css';

// Landing shows the first three rungs. Scale and Bulk live on /credits so this
// section stays at three cards. Derived from the curve so it cannot drift.
const LANDING_KEYS = ['starter', 'growth', 'pro'];

const PACKS = LANDING_KEYS.map((key) => {
  const p = CREDIT_PACKAGES.find((x) => x.key === key);
  return {
    name: p.name,
    price: `$${formatUsd(p.priceUsdCents)}`,
    credits: formatInt(p.credits),
    emails: formatInt(p.credits),
    perCredit: PER_CREDIT_LABEL,
    alternates: `Or ${formatInt(p.credits)} scores \u00b7 ${formatInt(Math.floor(p.credits / 2))} phone lookups`,
    cta: `Buy ${p.name}`,
    href: `/credits?pkg=${p.key}`,
    popular: Boolean(p.popular),
  };
});

const TOP_PACK = CREDIT_PACKAGES[CREDIT_PACKAGES.length - 1];

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
            Flat $0.010 per credit. Same rate at any volume. No subscription, no renewal.
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
                  <span className={styles.detailApprox}>{'\u2248'}</span>
                  <span className={styles.detailNumber}>{pack.emails}</span>
                  <span className={styles.detailText}>emails verified</span>
                </li>
                <li className={styles.detailTertiary}>{pack.alternates}</li>
                <li className={styles.detailTertiary}>{pack.perCredit} per credit</li>
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
          <p>Bigger packs are on the credits page: {TOP_PACK.name} is {formatInt(TOP_PACK.credits)} credits for ${formatUsd(TOP_PACK.priceUsdCents)}.</p>
          <p>Or buy any amount from 100 to 1,000,000 credits at the same rate. All free tools included.</p>
          <p>Credits expire 12 months from purchase. Reminder emails before expiry.</p>
          <p>15-day money-back guarantee on unused credits.</p>
        </div>
      </div>
    </section>
  );
}
