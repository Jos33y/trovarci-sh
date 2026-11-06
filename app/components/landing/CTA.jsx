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
          Run your first checks today. Get Sender when your list is ready to go.
        </p>

        <form action="/signup" method="get" className={styles.formWrap}>
          <div className={styles.inputRow}>
            <input
              type="email"
              name="email"
              autoComplete="email"
              spellCheck="false"
              placeholder="Your email"
              className={styles.input}
              required
              aria-label="Email address"
            />
            <button type="submit" className={styles.button}>
              Create account
            </button>
          </div>
          <p className={styles.note}>
            Or <a href="/tools" className={styles.noteLink}>run a free tool first</a>, no account needed.
            Ready to send? <a href="/sender" className={styles.noteLink}>Get Sender</a>.
          </p>
        </form>
      </div>
    </section>
  );
}
