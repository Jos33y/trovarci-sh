// /affiliates - the affiliate program: what you earn, how it works, and the terms people agree to.

import { Link, useLoaderData } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import { getSeo } from '~/utils/seo';
import { currentSenderPrice } from '~/utils/senderConfig.server';
import { TIERS, HOLD_DAYS, COOKIE_DAYS, percent, commissionCents } from '~/utils/affiliateTerms';
import styles from '~/styles/modules/routes/payWithCrypto.module.css';

export const meta = () => getSeo({
  title: 'Affiliate program: earn up to 40% in USDT',
  description: `Share Trovarcis Sender and earn 30% of every sale, rising to 40%. Paid in USDT on Tron or Ethereum, any amount, ${HOLD_DAYS} days after each sale.`,
  path: '/affiliates',
});

export function loader() {
  const price = currentSenderPrice();
  return { priceCents: price.cents };
}

const usd = (cents) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

const STEPS = [
  ['Join from your account', 'Sign up or sign in, open Affiliate in your account, accept the terms. Your link is ready at once.'],
  ['Share your link', `Anyone who clicks it and buys Sender within ${COOKIE_DAYS} days counts as your sale. You can point it at any page: a post written for churches, schools or recruiters often does better than the product page.`],
  ['Add your wallet', 'USDT on Tron (TRC-20) or Ethereum (ERC-20). We send $1 first as a test, and you confirm it arrived, so a typo never costs you a payout.'],
  ['Withdraw', `Each sale can be withdrawn ${HOLD_DAYS} days after it is made, once the refund window has passed. Any amount, even one sale. We pay the network fee.`],
];

const WHO = [
  'Freelancers who set up email campaigns for clients',
  'People who make tutorials on sending bulk email',
  'IT helpers for churches, schools and small businesses',
  'Agencies running outreach for clients',
  'Anyone who uses Sender and tells others about it',
];

const TERMS = [
  ['What counts as your sale', `A Sender purchase made within ${COOKIE_DAYS} days of someone clicking your link. If they click another affiliate's link later, the latest click counts.`],
  ['Your rate', `30% for your first 10 sales, 35% from your 11th, 40% from your 51st. Refunded sales do not count toward the next rate.`],
  ['When you can withdraw', `${HOLD_DAYS} days after each sale. A sale refunded before then earns nothing.`],
  ['How you are paid', 'USDT on Tron (TRC-20) or Ethereum (ERC-20), to the wallet in your account, after its $1 test payment is confirmed. Changing your wallet means a new $1 test. We pay the network and service fees.'],
  ['What is not allowed', 'Buying through your own link, spam of any kind, ads that bid on the Trovarcis name, fake reviews or claims, and coupon or deal sites. Commissions earned this way are cancelled and the account closed.'],
  ['Say you earn a commission', 'Wherever you share your link, say plainly that you earn from it.'],
  ['What you see', 'Clicks, sales, amounts and payouts. Never who bought: buyers’ details stay private.'],
  ['Changes', 'Rates and terms may change as the program grows. We email you at least 30 days before a change, and commissions you have already earned never change.'],
];

export default function Affiliates() {
  const { priceCents } = useLoaderData();
  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.main}>
        <div className="container">
          <header className={styles.head}>
            <p className={styles.kicker}>Affiliate program</p>
            <h1 className={styles.headline}>Earn up to 40% on every sale</h1>
            <p className={styles.sub}>
              Share Trovarcis Sender with people who email a list. When they buy through your link, you earn a share of every sale, paid in USDT.
            </p>
          </header>

          <div className={styles.products}>
            {TIERS.map((t, i) => {
              const upto = TIERS[i + 1] ? `sales ${t.from + 1} to ${TIERS[i + 1].from}` : `from sale ${t.from + 1}`;
              return (
                <section key={t.from} className={styles.product} aria-labelledby={`tier-${t.from}`}>
                  <h2 id={`tier-${t.from}`} className={styles.productName}>{percent(t.rateBp)}</h2>
                  <p className={styles.productText}>
                    {usd(commissionCents(priceCents, t.rateBp))} per sale, {upto}.
                  </p>
                </section>
              );
            })}
          </div>

          <p className={styles.sub}>
            <Link to="/account/affiliate" className={styles.primary}>Join and get your link</Link>
          </p>

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

          <section className={styles.section} aria-labelledby="who-title">
            <h2 id="who-title" className={styles.sectionTitle}>Who it suits</h2>
            <dl className={styles.faq}>
              {WHO.map((w) => <div key={w} className={styles.faqItem}><dt>{w}</dt></div>)}
            </dl>
          </section>

          <section className={styles.section} aria-labelledby="terms-title" id="terms">
            <h2 id="terms-title" className={styles.sectionTitle}>Terms</h2>
            <dl className={styles.faq}>
              {TERMS.map(([q, a]) => (
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
