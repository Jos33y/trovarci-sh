import Button from '~/components/shared/Button';
import styles from '~/styles/modules/landing/Hero.module.css';

// Bulk email verification mid-run. The classification bar + bounce-prevented KPI tell the toolkit story.
function EmailVerifierMockup() {
  return (
    <div className={styles.mockupWrap}>
      <div className={styles.mockup}>
        <div className={styles.mockupBar}>
          <div className={styles.mockupDots}>
            <span className={styles.dotRed} />
            <span className={styles.dotYellow} />
            <span className={styles.dotGreen} />
          </div>
          <span className={styles.mockupTitle}>Email Verifier</span>
        </div>

        <div className={styles.mockupBody}>
          <div className={styles.fileHeader}>
            <div>
              <div className={styles.fileName}>prospects-q3.csv</div>
              <div className={styles.fileMeta}>12,000 addresses</div>
            </div>
            <span className={styles.statusBadge}>
              <span className={styles.statusDot} />
              Verifying
            </span>
          </div>

          <div className={styles.progressSection}>
            <div className={styles.progressBar}>
              <div className={styles.progressFill}>
                <div className={styles.progressShimmer} />
              </div>
            </div>
            <div className={styles.progressLabel}>
              <span className={styles.progressCount}>
                <span className={styles.progressCurrent}>8,432</span> / 12,000
              </span>
              <span className={styles.progressPercent}>70%</span>
            </div>
          </div>

          <div className={styles.distribution}>
            <div className={styles.distBar}>
              <div
                className={`${styles.distSegment} ${styles.distValid}`}
                style={{ width: '81.7%' }}
                aria-label="6,891 valid"
              />
              <div
                className={`${styles.distSegment} ${styles.distInvalid}`}
                style={{ width: '11.6%' }}
                aria-label="982 invalid"
              />
              <div
                className={`${styles.distSegment} ${styles.distCatchall}`}
                style={{ width: '3.7%' }}
                aria-label="312 catch-all"
              />
              <div
                className={`${styles.distSegment} ${styles.distDisposable}`}
                style={{ width: '2.2%' }}
                aria-label="184 disposable"
              />
              <div
                className={`${styles.distSegment} ${styles.distRole}`}
                style={{ width: '0.8%' }}
                aria-label="63 role-based"
              />
            </div>

            <div className={styles.distLegend}>
              <div className={styles.distItem}>
                <span className={`${styles.distDot} ${styles.distValid}`} />
                <span className={styles.distLabel}>Valid</span>
                <span className={styles.distCount}>6,891</span>
              </div>
              <div className={styles.distItem}>
                <span className={`${styles.distDot} ${styles.distInvalid}`} />
                <span className={styles.distLabel}>Invalid</span>
                <span className={styles.distCount}>982</span>
              </div>
              <div className={styles.distItem}>
                <span className={`${styles.distDot} ${styles.distCatchall}`} />
                <span className={styles.distLabel}>Catch-all</span>
                <span className={styles.distCount}>312</span>
              </div>
              <div className={styles.distItem}>
                <span className={`${styles.distDot} ${styles.distDisposable}`} />
                <span className={styles.distLabel}>Disposable</span>
                <span className={styles.distCount}>184</span>
              </div>
              <div className={styles.distItem}>
                <span className={`${styles.distDot} ${styles.distRole}`} />
                <span className={styles.distLabel}>Role</span>
                <span className={styles.distCount}>63</span>
              </div>
            </div>
          </div>

          <div className={styles.kpiRow}>
            <div className={`${styles.kpiCard} ${styles.kpiCardAccent}`}>
              <div className={styles.kpiLabel}>Bounce prevented</div>
              <div className={styles.kpiValue}>15.3%</div>
              <div className={styles.kpiCaption}>would have hard-bounced</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>Throughput</div>
              <div className={styles.kpiValueNeutral}>285<span className={styles.kpiUnit}>/min</span></div>
              <div className={styles.kpiCaption}>live processing</div>
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
      <div className={styles.heroGrid} aria-hidden="true" />
      <div className={styles.heroNoise} aria-hidden="true" />

      <div className={`container ${styles.inner}`}>
        <div className={styles.content}>
          <h1 className={styles.headline}>
            Email deliverability, the toolkit.
          </h1>

          <p className={styles.sub}>
            Six checks that catch what mail servers will. No subscription,
            no surprises.
          </p>

          <div className={styles.ctas}>
            <Button href="/signup" variant="primary">Start free</Button>
            <Button href="/tools" variant="secondary">See the tools</Button>
          </div>

          <p className={styles.launch}>10 free credits on signup. No card.</p>
        </div>

        <div className={styles.visual}>
          <EmailVerifierMockup />
        </div>
      </div>
    </section>
  );
}
