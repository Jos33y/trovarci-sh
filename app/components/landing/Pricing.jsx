import useReveal from '~/utils/useReveal';
import styles from '~/styles/modules/landing/Pricing.module.css';

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    desc: "Try the app. Hit the limits. Then upgrade.",
    cta: "Download Free",
    href: "/download",
    highlight: false,
    badge: null,
    features: [
      { text: "1 SMTP account", included: true },
      { text: "500 contacts", included: true },
      { text: "1,000 emails per campaign", included: true },
      { text: "5 starter templates", included: true },
      { text: "1 device", included: true },
      { text: "Multi-SMTP failover", included: false },
      { text: "Arcis AI scoring", included: false },
      { text: "Campaign scheduling", included: false },
    ],
  },
  {
    name: "Email Pro",
    price: "$59",
    originalPrice: "$79",
    period: "one-time",
    desc: "Everything you need to send at scale. No limits.",
    cta: "Get Early Access",
    href: "#cta",
    highlight: true,
    badge: "Most popular",
    features: [
      { text: "Unlimited SMTP/API accounts", included: true },
      { text: "Unlimited contacts", included: true },
      { text: "Unlimited emails per campaign", included: true },
      { text: "Multi-SMTP failover, round-robin, weighted", included: true },
      { text: "Arcis AI email scoring (5 Credits)", included: true },
      { text: "All templates", included: true },
      { text: "Campaign scheduling", included: true },
      { text: "3 devices", included: true },
    ],
  },
  {
    name: "Bundle",
    price: "$89",
    originalPrice: "$119",
    period: "one-time",
    desc: "Email + SMS. Both modules. One purchase.",
    cta: "Get Early Access",
    href: "#cta",
    highlight: false,
    badge: "Best value",
    features: [
      { text: "Everything in Email Pro", included: true },
      { text: "SMS module included", included: true },
      { text: "Multi-provider SMS failover", included: true },
      { text: "SMS scheduling", included: true },
      { text: "10 Credits included", included: true },
      { text: "3 devices", included: true },
    ],
  },
];

function CheckIcon({ included }) {
  if (included) {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={styles.checkIcon}>
        <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={styles.crossIcon}>
      <path d="M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function Pricing() {
  const headerRef = useReveal();
  const cardsRef = useReveal(0.08);
  const guaranteeRef = useReveal();

  return (
    <section className={styles.section} id="pricing">
      <div className={`container ${styles.inner}`}>
        <div ref={headerRef} className="reveal" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h2 className={styles.heading}>Pricing</h2>
          <p className={styles.sub}>One price. Yours forever. No subscriptions. No renewals.</p>

          <div className={styles.earlyBird}>
            Early bird pricing for the first 100 customers
          </div>
        </div>

        <div ref={cardsRef} className={`${styles.cards} stagger`}>
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`${styles.card} ${plan.highlight ? styles.cardHighlight : ''} reveal`}
            >
              {plan.badge && (
                <span className={`${styles.badge} ${plan.highlight ? styles.badgeAccent : styles.badgeMuted}`}>
                  {plan.badge}
                </span>
              )}

              <h3 className={styles.planName}>{plan.name}</h3>

              <div className={styles.priceRow}>
                {plan.originalPrice && (
                  <span className={styles.originalPrice}>{plan.originalPrice}</span>
                )}
                <span className={styles.price}>{plan.price}</span>
                <span className={styles.period}>{plan.period}</span>
              </div>

              <p className={styles.planDesc}>{plan.desc}</p>

              <a
                href={plan.href}
                className={`${styles.planCta} ${plan.highlight ? styles.planCtaPrimary : styles.planCtaSecondary}`}
              >
                {plan.cta}
              </a>

              <ul className={styles.features}>
                {plan.features.map((f) => (
                  <li key={f.text} className={`${styles.feature} ${!f.included ? styles.featureDisabled : ''}`}>
                    <CheckIcon included={f.included} />
                    <span>{f.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div ref={guaranteeRef} className={`${styles.guarantee} reveal`}>
          15-day money-back guarantee. No questions asked.
        </div>
      </div>
    </section>
  );
}
