import useReveal from '~/utils/useReveal';
import { CREDIT_PACKAGES, PER_CREDIT_LABEL, formatUsd } from '~/utils/pricing';
import { formatInt } from '~/utils/format';
import { CREDIT_REFUND_LINE, SENDER_REFUND_LINE } from '~/utils/senderCopy';
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

export default function Pricing({ priceLabel }) {
  const headerRef = useReveal();
  const senderRef = useReveal();
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
            <span className={styles.kicker}>Pricing</span>
          </div>
          <h2 className={styles.heading}>Pay once. No monthly bills.</h2>
          <p className={styles.sub}>
            Sender is one payment. Credits for the checks are prepaid at a flat
            $0.010 each, and you buy more only when you run out.
          </p>
        </div>

        <div className={`${styles.sender} reveal`} ref={senderRef}>
          <div className={styles.senderInfo}>
            <h3 className={styles.senderName}>Trovarcis Sender</h3>
            <p className={styles.senderText}>
              Lifetime license for Windows, on up to 3 computers. Every 1.x
              update included. {SENDER_REFUND_LINE}
            </p>
          </div>
          <div className={styles.senderBuy}>
            <div className={styles.priceRow}>
              <span className={styles.price}>{priceLabel}</span>
              <span className={styles.period}>one payment</span>
            </div>
            <p className={styles.senderOffer}>Buy today, get the Mac version free when it ships.</p>
            <a href="/sender" className={`${styles.cta} ${styles.ctaPrimary} ${styles.senderCta}`}>Get Sender</a>
          </div>
        </div>

        <h3 className={styles.creditsTitle}>Credits for the checks</h3>

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

              <h4 className={styles.packName}>{pack.name}</h4>

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
          <p>Or buy any amount from 100 to 1,000,000 credits at the same rate. Domain Checker, SMTP Tester and DNS Generator never use credits.</p>
          <p>Credits expire 12 months after purchase.</p>
          <p>{CREDIT_REFUND_LINE}</p>
        </div>
      </div>
    </section>
  );
}
