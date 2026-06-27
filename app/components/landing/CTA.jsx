import useReveal from '~/utils/useReveal';
import styles from '~/styles/modules/landing/CTA.module.css';

// Native GET form submits to /signup?email=<value> - no JS state needed
export default function CTA() {
  const revealRef = useReveal();

  return (
    <section className={styles.section} id="cta">
      <div className={styles.ctaGrid} aria-hidden="true" />
      <div className={styles.ctaNoise} aria-hidden="true" />

      <div ref={revealRef} className={`container ${styles.inner} reveal`}>
        <h2 className={styles.heading}>
          Start with 10 free credits.
        </h2>
        <p className={styles.sub}>
          Sign up, run a check, see the results. No card, no commitment.
        </p>

        <form action="/signup" method="get" className={styles.formWrap}>
          <div className={styles.inputRow}>
            <input
              type="email"
              name="email"
              placeholder="your@email.com"
              className={styles.input}
              required
              aria-label="Email address"
            />
            <button type="submit" className={styles.button}>
              Create account
            </button>
          </div>
          <p className={styles.note}>
            Or <a href="/tools" className={styles.noteLink}>run a free tool first</a>. No account needed.
          </p>
        </form>
      </div>
    </section>
  );
}
