import { getSeo } from '~/utils/seo';
import useReveal from '~/utils/useReveal';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import styles from '~/styles/modules/routes/legal.module.css';

export const meta = () => getSeo({
  title: 'Refund Policy',
  description: 'Refunds for Trovarcis Reach licenses, Credits, Trovarcis Mail balances and domain registrations.',
  path: '/refund',
});

const SECTIONS = [
  { id: 'software-refunds', label: 'Software license refunds' },
  { id: 'credit-refunds', label: 'Credit refunds' },
  { id: 'mail-refunds', label: 'Trovarcis Mail refunds' },
  { id: 'domain-refunds', label: 'Domain refunds' },
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
            <p className={styles.updated}>Last updated: October 17, 2026</p>
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
              We want you to be confident in what you buy from us. This policy
              explains when each of our products can be refunded.
            </p>

            <h2 id="software-refunds">Software license refunds</h2>
            <p>
              All Trovarcis Reach license purchases (Email Pro, SMS Pro, Bundle)
              come with a <strong>15-day money-back guarantee</strong> from the
              date of purchase.
            </p>
            <ul>
              <li>If you are not satisfied with the software for any reason, you may request a full refund within 15 days of purchase.</li>
              <li>No questions asked. You do not need to give a reason.</li>
              <li>Refunds go back to the original payment method.</li>
              <li>On refund, your activation code is deactivated and the software reverts to the Free tier.</li>
              <li>Any bonus Credits included with your license are removed from your balance.</li>
            </ul>

            <h3>Early bird and promotional pricing</h3>
            <p>
              Licenses bought at early bird or promotional prices are eligible
              for the same 15-day refund. The refund is the price you actually
              paid, not the regular price.
            </p>

            <h2 id="credit-refunds">Credit refunds</h2>
            <p>
              Credit purchases are generally non-refundable because Credits are
              consumed as you use them. However:
            </p>
            <ul>
              <li><strong>Unused Credits from a recent purchase</strong> - if you bought Credits within the last 7 days and have not used any, you may request a refund.</li>
              <li><strong>Failed verification jobs</strong> - if a bulk verification job fails because of a system error on our side, Credits charged for unprocessed items are refunded to your balance automatically.</li>
              <li><strong>Service outages</strong> - if our tools are unavailable because of an outage and you were charged Credits, we restore them on request.</li>
            </ul>
            <p>
              Credit refunds are restored to your Credit balance, not paid out
              as cash, except where the law requires otherwise.
            </p>

            <h2 id="mail-refunds">Trovarcis Mail refunds</h2>
            <ul>
              <li><strong>Unused top-ups</strong> - if you topped up your Trovarcis Mail balance within the last 14 days and none of that top-up has been spent, you may request a refund of it to the original payment method.</li>
              <li><strong>Mailbox charges</strong> - monthly mailbox charges, including prorated charges for mailboxes added mid-month, are not refunded once the period has started. If you delete a mailbox, it stops being charged from the next monthly charge.</li>
              <li><strong>Remaining balance when you leave</strong> - if you close your account, you may request a refund of any balance not spent on mailboxes or domains, less any payment provider fees we cannot recover. Requests must be made within 30 days of closing the account.</li>
              <li><strong>Our outages</strong> - if Trovarcis Mail is unavailable for an extended period because of a problem on our side, we credit your balance in proportion to the downtime on request.</li>
            </ul>

            <h2 id="domain-refunds">Domain refunds</h2>
            <p>
              Once a domain is registered or renewed, the registry charges us
              and the fee cannot be recovered, so domain registrations, renewals
              and transfers are <strong>non-refundable</strong>. The exceptions:
            </p>
            <ul>
              <li>If a registration fails, the amount is returned to your balance automatically.</li>
              <li>If we charged you the wrong amount, we refund the difference.</li>
            </ul>
            <p>
              Please check the spelling of a domain name and its renewal price
              before you buy.
            </p>

            <h2 id="how-to-request">How to request a refund</h2>
            <p>
              Email{' '}
              <a href="mailto:support@trovarcis.com">support@trovarcis.com</a> with:
            </p>
            <ul>
              <li>The email address on your account.</li>
              <li>Your activation code, order reference or transaction ID.</li>
              <li>Which product the refund is for: Reach license, Credits, Trovarcis Mail or a domain.</li>
            </ul>

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
                  <td>Card or bank transfer</td>
                  <td>5 to 10 business days to appear on your statement</td>
                </tr>
                <tr>
                  <td>Cryptocurrency (Cryptomus)</td>
                  <td>1 to 3 business days to your wallet</td>
                </tr>
                <tr>
                  <td>Credit or balance restoration</td>
                  <td>Immediate</td>
                </tr>
              </tbody>
            </table>
            <p>
              We aim to review refund requests within 2 business days. The time
              for funds to reach you depends on your payment provider.
            </p>

            <h2 id="exceptions">Exceptions</h2>
            <p>Refunds are not issued in the following cases:</p>
            <ul>
              <li><strong>After the refund window</strong> - requests made after the periods stated above.</li>
              <li><strong>Acceptable Use violations</strong> - if your license is revoked, your mailboxes are suspended or your account is terminated because of a violation of our <a href="/acceptable-use">Acceptable Use Policy</a>, no refund is given for any product or balance.</li>
              <li><strong>Chargebacks</strong> - if you open a chargeback with your bank instead of contacting us, your account will be suspended. Please contact us first. We are happy to sort out problems directly.</li>
              <li><strong>Used Credits and spent balance</strong> - Credits already used and balance already spent on mailboxes or domains are not refunded as cash.</li>
              <li><strong>Repeated refund abuse</strong> - buying and refunding repeatedly to use our products without paying is not allowed. We may refuse refund requests that appear to abuse this policy.</li>
            </ul>

            <h2 id="contact">Contact</h2>
            <div className={styles.contactBox}>
              <p>For refund requests or billing questions:</p>
              <p><strong>Email:</strong> <a href="mailto:support@trovarcis.com">support@trovarcis.com</a></p>
              <p><strong>Response time:</strong> Within 2 business days</p>
              <p><strong>Operator:</strong> Trovarcis, operated by Remvolabs</p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
