import { useState } from 'react';
import useReveal from '~/utils/useReveal';
import styles from '~/styles/modules/landing/DesktopPromo.module.css';

// Future-product teaser - split panel, real mockup on the right
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
          <span className={styles.mockupTitle}>Trovarcis Reach · Desktop</span>
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
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const revealRef = useReveal();

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    setStatus('submitting');
    setErrorMsg('');

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, source: 'desktop_promo' }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not add you to the list.');
      }

      setStatus('success');
      setEmail('');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message || 'Could not add you to the list.');
    }
  }

  return (
    <section className={styles.section} id="desktop">
      <div className={`container ${styles.inner}`}>
        <div ref={revealRef} className={`${styles.split} reveal`}>

          <div className={styles.content}>
            <span className={styles.kicker}>
              <span className="signal-dot signal-dot--sm" aria-hidden="true" />
              COMING JUL 2026
            </span>

            <h2 className={styles.heading}>Send at scale, from your desk.</h2>

            <p className={styles.body}>
              The bulk email sender, native and offline. Multi-SMTP failover,
              local contact storage, no server in the middle. The toolkit you
              already know, plus the sender it deserves.
            </p>

            <ul className={styles.bullets}>
              <li>One-time purchase. No subscription.</li>
              <li>Windows, macOS, Linux.</li>
              <li>Same toolkit included.</li>
            </ul>

            {status === 'success' ? (
              <div className={styles.success} role="status">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" className={styles.successIcon} aria-hidden="true">
                  <path d="M4 10.5L8 14.5L16 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>You're on the list. We'll email you when it ships.</span>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.inputRow}>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className={styles.input}
                    required
                    disabled={status === 'submitting'}
                    aria-label="Email address for desktop launch notification"
                  />
                  <button
                    type="submit"
                    className={styles.button}
                    disabled={status === 'submitting' || !email.trim()}
                  >
                    {status === 'submitting' ? 'Sending' : 'Notify me'}
                  </button>
                </div>

                {status === 'error' && (
                  <p className={styles.error} role="alert">{errorMsg}</p>
                )}

                <p className={styles.note}>One email when it ships. No spam, no marketing.</p>
              </form>
            )}
          </div>

          <div className={styles.visual} aria-hidden="true">
            <DesktopMockup />
          </div>

        </div>
      </div>
    </section>
  );
}
