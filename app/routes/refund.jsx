import { getSeo } from '~/utils/seo';
import useReveal from '~/utils/useReveal';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import styles from '~/styles/modules/routes/legal.module.css';

export const meta = () => getSeo({
  title: 'Refund Policy',
  description: 'Our 15-day money-back guarantee for software licenses and refund process for Credits.',
  path: '/refund',
});

const SECTIONS = [
  { id: 'software-refunds', label: 'Software license refunds' },
  { id: 'credit-refunds', label: 'Credit refunds' },
  { id: 'how-to-request', label: 'How to request a refund' },
  { id: 'processing', label: 'Processing time' },
  { id: 'exceptions', label: 'Exceptions' },
  { id: 'contact', label: 'Contact' },
];

export default function Refund() {
  const headerRef = useReveal();

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={`container ${styles.inner}`}>
          <header ref={headerRef} className={`${styles.header} reveal`}>
            <h1 className={styles.title}>Refund Policy</h1>
            <p className={styles.updated}>Last updated: February 28, 2026</p>
          </header>

          <hr className={styles.divider} />

          <nav className={styles.toc}>
            <p className={styles.tocLabel}>On this page</p>
            <ul className={styles.tocList}>
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className={styles.tocLink}>{s.label}</a>
                </li>
              ))}
            </ul>
          </nav>

          <div className={styles.content}>
            <p>
              We want you to be confident in your purchase. If Trovarcis Reach
              does not meet your expectations, we offer a straightforward refund
              process.
            </p>

            <h2 id="software-refunds">Software license refunds</h2>
            <p>
              All software license purchases (Email Pro, SMS Pro, Bundle) come
              with a <strong>15-day money-back guarantee</strong> from the date
              of purchase.
            </p>
            <ul>
              <li>If you are not satisfied with the software for any reason, you may request a full refund within 15 days of purchase.</li>
              <li>No questions asked. You do not need to provide a reason.</li>
              <li>Refunds are processed to the original payment method (card via Stripe, or cryptocurrency via Cryptomus).</li>
              <li>Upon refund, your activation code will be deactivated and the software will revert to the Free tier.</li>
              <li>Any bonus Credits included with your license will be removed from your balance.</li>
            </ul>

            <h3>Early bird and promotional pricing</h3>
            <p>
              Licenses purchased at early bird or promotional prices are eligible
              for the same 15-day refund. The refunded amount will be the price
              you actually paid, not the regular price.
            </p>

            <h2 id="credit-refunds">Credit refunds</h2>
            <p>
              Credit purchases are generally non-refundable because Credits are
              consumed as you use them. However:
            </p>
            <ul>
              <li><strong>Unused Credits from a recent purchase</strong> - if you purchased Credits within the last 7 days and have not used any, you may request a refund.</li>
              <li><strong>Failed verification jobs</strong> - if a bulk verification job fails due to a system error on our end, Credits charged for unprocessed items are automatically refunded to your balance.</li>
              <li><strong>Service outages</strong> - if our tools are unavailable due to a service outage and you are charged Credits, we will restore them upon request.</li>
            </ul>
            <p>
              Credit refunds are restored to your Credit balance, not as cash
              refunds, except where required by applicable law.
            </p>

            <h2 id="how-to-request">How to request a refund</h2>
            <p>
              To request a refund, email us at{' '}
              <a href="mailto:support@trovarcis.com">support@trovarcis.com</a> with:
            </p>
            <ul>
              <li>The email address associated with your account.</li>
              <li>Your activation code or order reference number.</li>
              <li>Whether you are requesting a software license refund or a Credit refund.</li>
            </ul>
            <p>
              You can also initiate a refund request from your dashboard at
              trovarci.sh by navigating to your purchase history.
            </p>

            <h2 id="processing">Processing time</h2>
            <table>
              <thead>
                <tr>
                  <th>Payment method</th>
                  <th>Refund timeline</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Credit/debit card (Stripe)</td>
                  <td>5 to 10 business days to appear on your statement</td>
                </tr>
                <tr>
                  <td>Cryptocurrency (Cryptomus)</td>
                  <td>1 to 3 business days to your wallet</td>
                </tr>
                <tr>
                  <td>Credit balance restoration</td>
                  <td>Immediate</td>
                </tr>
              </tbody>
            </table>
            <p>
              We aim to review and approve refund requests within 2 business days.
              The actual time for funds to reach your account depends on your
              payment provider.
            </p>

            <h2 id="exceptions">Exceptions</h2>
            <p>Refunds will not be issued in the following cases:</p>
            <ul>
              <li><strong>After 15 days</strong> - software license refund requests submitted more than 15 days after purchase.</li>
              <li><strong>Acceptable Use violations</strong> - if your license was revoked due to a violation of our <a href="/terms#acceptable-use">Acceptable Use Policy</a>, no refund is provided.</li>
              <li><strong>Chargebacks</strong> - if you initiate a chargeback with your bank instead of contacting us, your account will be suspended. Please contact us first. We are happy to resolve any issues directly.</li>
              <li><strong>Used Credits</strong> - Credits that have already been consumed for verification or scoring cannot be refunded as cash.</li>
              <li><strong>Repeated refund abuse</strong> - purchasing and refunding repeatedly to access the software without paying is not permitted. We reserve the right to deny refund requests that appear to abuse this policy.</li>
            </ul>

            <h2 id="contact">Contact</h2>
            <div className={styles.contactBox}>
              <p>For refund requests or billing questions:</p>
              <p><strong>Email:</strong> <a href="mailto:support@trovarcis.com">support@trovarcis.com</a></p>
              <p><strong>Response time:</strong> Within 2 business days</p>
              <p><strong>Company:</strong> Trovarcis LLC, Wyoming, USA</p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}