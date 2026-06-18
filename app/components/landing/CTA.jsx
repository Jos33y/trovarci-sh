import { useState } from 'react';
import useReveal from '~/utils/useReveal';
import styles from '~/styles/modules/landing/CTA.module.css';

export default function CTA() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle, submitting, success, error
  const revealRef = useReveal();

  function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus('submitting');

    // TODO: wire to actual waitlist endpoint
    // For now, simulate success after brief delay
    setTimeout(() => {
      setStatus('success');
      setEmail('');
    }, 800);
  }

  return (
    <section className={styles.section} id="cta">
      {/* Background layers — mirrors hero grid+noise */}
      <div className={styles.ctaGrid} aria-hidden="true" />
      <div className={styles.ctaNoise} aria-hidden="true" />

      <div ref={revealRef} className={`container ${styles.inner} reveal`}>
        <h2 className={styles.heading}>
          Launching June 2026.
        </h2>
        <p className={styles.sub}>
          Get early bird pricing and be first in line when Trovarcis Reach ships.
        </p>

        {status === 'success' ? (
          <div className={styles.success}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={styles.successIcon}>
              <path d="M4 10.5L8 14.5L16 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>You're on the list. We'll email you at launch.</span>
          </div>
        ) : (
          <div className={styles.formWrap}>
            <div className={styles.inputRow}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className={styles.input}
                required
                disabled={status === 'submitting'}
                aria-label="Email address for waitlist"
              />
              <button
                type="button"
                onClick={handleSubmit}
                className={styles.button}
                disabled={status === 'submitting' || !email.trim()}
              >
                {status === 'submitting' ? 'Joining...' : 'Get Early Access'}
              </button>
            </div>
            <p className={styles.note}>No spam. One email when we launch. Unsubscribe anytime.</p>
          </div>
        )}
      </div>
    </section>
  );
}