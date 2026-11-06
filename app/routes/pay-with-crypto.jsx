// /pay-with-crypto - buying Trovarcis Sender or Credits with crypto through Cryptomus.

import { Link, useLoaderData } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import { getSeo } from '~/utils/seo';
import { currentSenderPrice } from '~/utils/senderConfig.server';
import { formatSenderPrice } from '~/utils/senderCopy';
import styles from '~/styles/modules/routes/payWithCrypto.module.css';

const QUESTIONS = [
  ['Which coins can I pay with?', 'USDT, BTC, ETH and the other coins Cryptomus lists at checkout. USDT is the simplest, because its value does not move while you pay.'],
  ['How long until I get my key or Credits?', 'As soon as the network confirms the payment, usually a few minutes. The page you return to updates on its own, and your Sender key also comes by email.'],
  ['Do I need an account?', 'Not for Trovarcis Sender: your email is enough, and the key is sent there. Credits are added to your Trovarcis account, so sign up first.'],
  ['What if I send too little?', 'For Sender, your order page shows what is missing and lets you pay the rest on the same invoice. Nothing is lost.'],
  ['What if the invoice runs out?', 'A Sender invoice stays open for 12 hours. If it closes before you pay, reopen it from your order page.'],
  ['I have never paid with crypto. Can I still pay?', 'Yes. Buy USDT in an exchange or wallet app you trust, then send it from there to the address shown at checkout. Pick the same network on both sides, for example TRON (TRC-20), and send the exact amount.'],
  ['Can I get a refund?', 'Trovarcis Sender has a 15-day refund if it does not work for you. Unused Credits bought in the last 7 days can be refunded too. Crypto refunds are sent back in crypto.'],
];

export const meta = () => {
  const tags = getSeo({
    title: 'Pay with crypto: USDT, BTC, ETH',
    description: 'Buy Trovarcis Sender or Credits with USDT, BTC, ETH and more. No card or bank needed. Your license key or Credits arrive as soon as the payment confirms.',
    path: '/pay-with-crypto',
  });
  tags.push({
    'script:ld+json': {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: QUESTIONS.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    },
  });
  return tags;
};

const STEPS = [
  ['Choose Crypto at checkout', 'On the Sender page or the Credits page, pick Crypto and continue.'],
  ['Send the amount shown', 'Cryptomus shows the address and the exact amount for the coin and network you pick.'],
  ['Get your key or Credits', 'They appear as soon as the payment confirms. Sender keys also come by email.'],
];

export function loader() {
  return { priceLabel: formatSenderPrice(currentSenderPrice().cents) };
}

export default function PayWithCrypto() {
  const { priceLabel } = useLoaderData();
  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.main}>
        <div className="container">
          <header className={styles.head}>
            <p className={styles.kicker}>Crypto accepted</p>
            <h1 className={styles.headline}>Pay with crypto</h1>
            <p className={styles.sub}>
              Buy Trovarcis Sender or Credits with USDT, BTC, ETH and more. No card and no bank needed.
            </p>
          </header>

          <div className={styles.products}>
            <section className={styles.product} aria-labelledby="p-sender">
              <h2 id="p-sender" className={styles.productName}>Trovarcis Sender</h2>
              <p className={styles.productText}>Send bulk email from your own computer. {priceLabel} once, 3 computers, every 1.x update.</p>
              <Link to="/sender" className={styles.primary}>Get Sender</Link>
            </section>
            <section className={styles.product} aria-labelledby="p-credits">
              <h2 id="p-credits" className={styles.productName}>Credits</h2>
              <p className={styles.productText}>Pay for email verification, phone number lookups and spam score checks. From $5, no subscription.</p>
              <Link to="/credits" className={styles.secondary}>Buy Credits</Link>
            </section>
          </div>

          <section className={styles.section} aria-labelledby="how-title">
            <h2 id="how-title" className={styles.sectionTitle}>How it works</h2>
            <ol className={styles.steps}>
              {STEPS.map(([title, body]) => (
                <li key={title} className={styles.step}>
                  <span className={styles.stepTitle}>{title}</span>
                  <span className={styles.stepBody}>{body}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className={styles.section} aria-labelledby="faq-title">
            <h2 id="faq-title" className={styles.sectionTitle}>Questions</h2>
            <dl className={styles.faq}>
              {QUESTIONS.map(([q, a]) => (
                <div key={q} className={styles.faqItem}>
                  <dt>{q}</dt>
                  <dd>{a}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
