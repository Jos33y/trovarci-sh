import { Link } from 'react-router';
import useReveal from '~/utils/useReveal';
import styles from '~/styles/modules/landing/DesktopPromo.module.css';

// Trovarcis Sender on the homepage - split panel, mockup on the right, one button to /sender
function DesktopMockup() {
  return (
    <div className={styles.mockupWrap}>
      <div className={styles.mockup}>
        <div className={styles.mockupBar}>
          <div className={styles.mockupDots}>
            <span className={styles.dotRed} />
            <span className={styles.dotYellow} />
            <span className={styles.dotGreen} />
          </div>
          <span className={styles.mockupTitle}>Trovarcis Sender</span>
        </div>

        <div className={styles.mockupSide}>
          <div className={styles.sideItem}>
            <span className={`${styles.sideDot} ${styles.sideDotActive}`} />
            <span className={styles.sideText}>Campaigns</span>
          </div>
          <div className={styles.sideItem}>
            <span className={styles.sideDot} />
            <span className={styles.sideText}>Contacts</span>
          </div>
          <div className={styles.sideItem}>
            <span className={styles.sideDot} />
            <span className={styles.sideText}>SMTPs</span>
          </div>
          <div className={styles.sideItem}>
            <span className={styles.sideDot} />
            <span className={styles.sideText}>Templates</span>
          </div>
        </div>

        <div className={styles.mockupBody}>
          <div className={styles.campaignRow}>
            <div className={styles.campaignName}>Q3 Outreach</div>
            <span className={styles.statusBadge}>
              <span className={styles.statusDot} />
              Sending
            </span>
          </div>

          <div className={styles.progressBar}>
            <div className={styles.progressFill}>
              <div className={styles.progressShimmer} />
            </div>
          </div>

          <div className={styles.progressMeta}>
            <span className={styles.metaPrimary}>18,420</span>
            <span className={styles.metaDivider}>/</span>
            <span className={styles.metaSecondary}>24,000</span>
            <span className={styles.metaPercent}>77%</span>
          </div>

          <div className={styles.providers}>
            <div className={styles.providerCard}>
              <div className={styles.providerLabel}>
                <span className={styles.providerDotLive} />
                Resend
              </div>
              <div className={styles.providerRate}>420/min</div>
            </div>
            <div className={styles.providerCard}>
              <div className={styles.providerLabel}>
                <span className={styles.providerDotLive} />
                Postmark
              </div>
              <div className={styles.providerRate}>310/min</div>
            </div>
            <div className={styles.providerCard}>
              <div className={styles.providerLabel}>
                <span className={styles.providerDotIdle} />
                Amazon SES
              </div>
              <div className={styles.providerRate}>Standby</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DesktopPromo() {
  const revealRef = useReveal();

  return (
    <section className={styles.section} id="desktop">
      <div className={`container ${styles.inner}`}>
        <div ref={revealRef} className={`${styles.split} reveal`}>

          <div className={styles.content}>
            <span className={styles.kicker}>
              <span className="signal-dot signal-dot--sm" aria-hidden="true" />
              TROVARCIS SENDER
            </span>

            <h2 className={styles.heading}>Send at scale, from your desk.</h2>

            <p className={styles.body}>
              The bulk email sender for Windows. Send through your own SMTP accounts,
              with your lists and credentials stored on your computer.
            </p>

            <ul className={styles.bullets}>
              <li>One payment. No subscription.</li>
              <li>Lifetime license for 3 computers.</li>
              <li>Windows 10 and 11.</li>
            </ul>

            <div className={styles.cta}>
              <Link to="/sender" className={styles.button}>Get Sender</Link>
              <p className={styles.note}>15-day refund.</p>
            </div>
          </div>

          <div className={styles.visual} aria-hidden="true">
            <DesktopMockup />
          </div>

        </div>
      </div>
    </section>
  );
}
