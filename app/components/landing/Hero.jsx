import { Link } from 'react-router';
import Button from '~/components/shared/Button';
import { LockIcon } from '~/components/icons';
import { STORAGE_LINE, SENDER_REFUND_LINE } from '~/utils/senderCopy';
import styles from '~/styles/modules/landing/Hero.module.css';

// The homepage leads with Sender. The tools section below picks up the "checks" the sub mentions.
export default function Hero({ priceLabel }) {
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.heroGrid} aria-hidden="true" />

      <div className={`container ${styles.inner}`}>
        <div className={styles.content}>
          <p className={styles.kicker}>Trovarcis Sender for Windows</p>

          <h1 id="hero-title" className={styles.headline}>
            Send bulk email that reaches the inbox.
          </h1>

          <p className={styles.sub}>
            Sender sends your campaigns from your own computer, through your own
            SMTP accounts. The checks on trovarci.sh make sure your domain, your
            list and your message are ready first.
          </p>

          <div className={styles.ctas}>
            <Button href="/sender" variant="primary">Get Sender, {priceLabel}</Button>
            <Button href="#tools" variant="secondary">Try the free checks</Button>
          </div>

          <p className={styles.privacy}>
            <span className={styles.privacyIcon} aria-hidden="true"><LockIcon size={16} /></span>
            <span>{STORAGE_LINE}</span>
          </p>

          <p className={styles.terms}>
            One payment, no monthly fee. {SENDER_REFUND_LINE}
          </p>
        </div>

        <figure className={styles.visual}>
          <div className={styles.window}>
            <div className={styles.windowBar} aria-hidden="true">
              <span className={styles.windowTitle}>Trovarcis Sender</span>
              <span className={styles.windowControls}>
                <svg viewBox="0 0 10 10" width="10" height="10"><path d="M1 5.5h8" stroke="currentColor" /></svg>
                <svg viewBox="0 0 10 10" width="10" height="10"><rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="currentColor" /></svg>
                <svg viewBox="0 0 10 10" width="10" height="10"><path d="m1.5 1.5 7 7m0-7-7 7" stroke="currentColor" /></svg>
              </span>
            </div>
            <img
              className={styles.shot}
              src="/images/sender/sender-overview-1600.webp"
              srcSet="/images/sender/sender-overview-800.webp 800w, /images/sender/sender-overview-1600.webp 1600w"
              sizes="(min-width: 1280px) 720px, (min-width: 1024px) 56vw, calc(100vw - 32px)"
              width="1600"
              height="1179"
              alt="The Trovarcis Sender overview screen: getting started steps, daily sending capacity across three SMTP accounts, and the last campaign's results."
              fetchPriority="high"
              decoding="async"
            />
          </div>
          <figcaption className={styles.caption}>
            Sender 1.0, shown with demo data. <Link to="/sender#screens" className={styles.captionLink}>See every screen</Link>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
