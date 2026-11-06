import { Link } from 'react-router';
import Button from '~/components/shared/Button';
import { LockIcon } from '~/components/icons';
import { STORAGE_LINE, SENDER_REFUND_LINE } from '~/utils/senderCopy';
import styles from '~/styles/modules/landing/Hero.module.css';

// The route a campaign takes. Trovarcis sits outside it, which is the privacy promise drawn out.
const ROUTE = [
  { name: 'Your computer', note: 'Trovarcis Sender' },
  { name: 'Your SMTP account', note: 'Gmail, Zoho, Amazon SES…' },
  { name: 'Their inbox', note: 'Delivered from your account' },
];

export default function Hero() {
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
            <Button href="/sender" variant="primary">Get Sender</Button>
            <Button href="#tools" variant="secondary">Try the free checks</Button>
          </div>

          <p className={styles.terms}>One payment, no monthly fee. {SENDER_REFUND_LINE}</p>
        </div>

        <div className={styles.stage}>
          <figure className={styles.window}>
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
              src="/images/sender/sender-report-1600.webp"
              srcSet="/images/sender/sender-report-800.webp 800w, /images/sender/sender-report-1600.webp 1600w"
              sizes="(min-width: 1200px) 960px, calc(100vw - 32px)"
              width="1600"
              height="1179"
              alt="Trovarcis Sender sending a campaign: the campaign clock at 39%, 3,180 sent, and three SMTP accounts each sending within its own daily limit."
              fetchPriority="high"
              decoding="async"
            />
            <figcaption className={styles.caption}>
              Sender 1.0, sending a campaign.{' '}
              <Link to="/sender#screens" className={styles.captionLink}>See every screen</Link>
            </figcaption>
          </figure>

          <img
            className={styles.license}
            src="/images/sender/sender-license-card.webp"
            width="376"
            height="330"
            alt="The Sender lifetime license card: every update, on up to 3 devices."
            loading="lazy"
            decoding="async"
          />

          <div className={styles.route}>
            <p className={styles.routeTitle}>Where your mail goes</p>
            <ol className={styles.routeSteps}>
              {ROUTE.map((step) => (
                <li key={step.name} className={styles.routeStep}>
                  <span className={styles.routeNode} aria-hidden="true" />
                  <span className={styles.routeName}>{step.name}</span>
                  <span className={styles.routeNote}>{step.note}</span>
                </li>
              ))}
            </ol>
            <p className={styles.routeOff}>
              <span className={styles.routeLock} aria-hidden="true"><LockIcon size={14} /></span>
              <span>{STORAGE_LINE}</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
