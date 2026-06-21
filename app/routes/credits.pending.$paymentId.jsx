import { useEffect, useState } from 'react';
import { Link, useLoaderData, useRevalidator, redirect } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import { requireUser } from '~/utils/session.server';
import { getPaymentForUser } from '~/lib/payments.server';
import { getPaymentInfo, mapCryptomusStatus } from '~/lib/cryptomus.server';
import styles from '~/styles/modules/routes/paymentPending.module.css';

export const meta = () => [
  { title: 'Payment Status | Trovarcis Reach' },
  { name: 'robots', content: 'noindex' },
];

/**
 * Loader fetches the payment row.
 *
 * Three terminal cases short-circuit to a redirect so the user never sits
 * on the pending page once the outcome is known:
 *   - confirmed  -> receipt page (the celebration)
 *   - failed     -> credits page (try again, no charge taken)
 *   - expired    -> credits page (invoice timed out)
 *
 * For the still-awaiting case we optionally poll Cryptomus to shorten
 * perceived latency. The webhook remains the source of truth that writes
 * to our DB. This component just revalidates every 4s until status moves.
 */
export async function loader({ request, params }) {
  const user = await requireUser(request);
  const paymentId = params.paymentId;

  const payment = await getPaymentForUser(paymentId, user.id);
  if (!payment) {
    throw new Response('Payment not found', { status: 404 });
  }

  // Terminal states: redirect out so the pending page is never a dead end.
  if (payment.status === 'confirmed') {
    throw redirect(`/receipts/${payment.id}`);
  }
  if (payment.status === 'failed' || payment.status === 'expired') {
    throw redirect(`/credits?payment=${payment.status}`);
  }

  // If not yet terminal, try to pull fresh info from Cryptomus. We only
  // READ status here - the webhook is still the source of truth that writes
  // to our DB. This just helps UX by shortening perceived latency.
  let remoteStatus = null;
  if (payment.gateway === 'cryptomus' && payment.status === 'awaiting_payment') {
    try {
      const info = await getPaymentInfo({ orderId: payment.id });
      remoteStatus = mapCryptomusStatus(info.status, info.is_final);
    } catch {
      // Non-fatal. User sees current DB status.
    }
  }

  return { payment, remoteStatus };
}

function Spinner() {
  return (
    <svg className={styles.spinner} width="40" height="40" viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="17" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <path d="M20 3 A17 17 0 0 1 37 20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export default function PaymentPendingPage() {
  const { payment } = useLoaderData();
  const revalidator = useRevalidator();

  // After the loader's terminal-state redirects, the only status that ever
  // renders here is 'awaiting_payment' (or the much rarer 'pending' before
  // Cryptomus has acknowledged the invoice). Poll every 4s until either
  // changes - the next revalidation that returns a terminal state will
  // trigger the loader redirect, replacing this view.
  useEffect(() => {
    const iv = setInterval(() => {
      revalidator.revalidate();
    }, 4000);
    return () => clearInterval(iv);
  }, [revalidator]);

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(iv);
  }, []);

  const amountUsd = (payment.amount_usd_cents / 100).toFixed(2);

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={styles.container}>

          <div className={styles.card}>
            <div className={styles.iconWrap}>
              <Spinner />
            </div>
            <h1 className={styles.title}>Waiting for payment</h1>
            <p className={styles.subtitle}>
              We're waiting for the blockchain to confirm your transaction. This usually takes 1-5 minutes depending on the network you chose.
            </p>

            <div className={styles.details}>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Amount</span>
                <span className={styles.detailValue}>${amountUsd}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Credits</span>
                <span className={styles.detailValue}>{payment.credits.toLocaleString()}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Reference</span>
                <span className={styles.detailValueMono}>{payment.id.slice(0, 8)}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Elapsed</span>
                <span className={styles.detailValueMono}>{elapsed}s</span>
              </div>
            </div>

            <p className={styles.footnote}>
              You can safely leave this page. Credits will appear in your dashboard automatically when the payment confirms.
            </p>

            <div className={styles.actions}>
              <Link to="/dashboard" className={styles.secondaryBtn}>
                Go to dashboard
              </Link>
            </div>
          </div>

        </div>
      </main>
      <Footer />
    </>
  );
}
