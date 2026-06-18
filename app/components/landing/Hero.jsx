import Button from '~/components/shared/Button';
import styles from '~/styles/modules/landing/Hero.module.css';

/*
 * SendingMockup — Live preview of the desktop app's
 * sending dashboard. Animated to feel like a running app.
 * The mockup IS the conversion tool. It proves the
 * product exists and works without a single marketing word.
 */
function SendingMockup() {
  return (
    <div className={styles.mockupWrap}>
      <div className={styles.mockup}>
        {/* Window chrome */}
        <div className={styles.mockupBar}>
          <div className={styles.mockupDots}>
            <span className={styles.dotRed} />
            <span className={styles.dotYellow} />
            <span className={styles.dotGreen} />
          </div>
          <span className={styles.mockupTitle}>Trovarcis Reach</span>
        </div>

        {/* Campaign header */}
        <div className={styles.mockupBody}>
          <div className={styles.campaignHeader}>
            <div>
              <div className={styles.campaignName}>Product Launch Blast</div>
              <div className={styles.campaignMeta}>12,450 recipients</div>
            </div>
            <span className={styles.statusBadge}>
              <span className={styles.statusDot} />
              Sending
            </span>
          </div>

          {/* Progress */}
          <div className={styles.progressSection}>
            <div className={styles.progressBar}>
              <div className={styles.progressFill}>
                <div className={styles.progressShimmer} />
              </div>
            </div>
            <div className={styles.progressLabel}>
              <span className={styles.progressCount}>
                <span className={styles.progressCurrent}>8,342</span> / 12,450
              </span>
              <span className={styles.progressPercent}>67%</span>
            </div>
          </div>

          {/* SMTP providers */}
          <div className={styles.smtpSection}>
            <div className={`${styles.smtpCard} ${styles.smtpActive}`}>
              <div className={styles.smtpStatus}>
                <span className={styles.smtpDotActive} />
                Active
              </div>
              <div className={styles.smtpName}>Resend</div>
              <div className={styles.smtpSpeed}>285/min</div>
            </div>
            <div className={styles.smtpCard}>
              <div className={styles.smtpStatus}>
                <span className={styles.smtpDotStandby} />
                Standby
              </div>
              <div className={styles.smtpName}>Amazon SES</div>
              <div className={styles.smtpSpeed}>Ready</div>
            </div>
          </div>

          {/* Delivery stats */}
          <div className={styles.statsRow}>
            <div className={styles.stat}>
              <span className={`${styles.statValue} ${styles.statSuccess}`}>98.2%</span>
              <span className={styles.statLabel}>Delivered</span>
            </div>
            <div className={styles.stat}>
              <span className={`${styles.statValue} ${styles.statWarning}`}>1.3%</span>
              <span className={styles.statLabel}>Bounced</span>
            </div>
            <div className={styles.stat}>
              <span className={`${styles.statValue} ${styles.statError}`}>0.5%</span>
              <span className={styles.statLabel}>Failed</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Hero() {
  return (
    <section className={styles.hero}>
      {/* Background layers — grid lines + noise grain */}
      <div className={styles.heroGrid} aria-hidden="true" />
      <div className={styles.heroNoise} aria-hidden="true" />

      <div className={`container ${styles.inner}`}>

        {/* Left column */}
        <div className={styles.content}>
          <h1 className={styles.headline}>
            Send email at scale.
          </h1>

          <p className={styles.sub}>
            Desktop and mobile app. One-time purchase. Your contacts,
            your SMTPs, your data. Nothing leaves your machine.
          </p>

          <div className={styles.ctas}>
            <Button href="#cta" variant="primary">Get Early Access</Button>
            <Button href="/tools" variant="secondary">Try Free Tools</Button>
          </div>

          <p className={styles.launch}>Launching June 2026</p>
        </div>

        {/* Right column */}
        <div className={styles.visual}>
          <SendingMockup />
        </div>

      </div>
    </section>
  );
}