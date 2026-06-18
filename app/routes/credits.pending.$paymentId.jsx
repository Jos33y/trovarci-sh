import { useEffect, useState } from 'react';
import { Link, useLoaderData, useRevalidator } from 'react-router';
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
 * Loader fetches the payment row. If still awaiting_payment, polls the
 * Cryptomus API once to see if status has advanced (catches the case where
 * the user returned via url_success before the webhook arrived).
 *
 * The component polls by revalidating every 4s until status is terminal.
 */
export async function loader({ request, params }) {
  const user = await requireUser(request);
  const paymentId = params.paymentId;

  const payment = await getPaymentForUser(paymentId, user.id);
  if (!payment) {
    throw new Response('Payment not found', { status: 404 });
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

function CheckIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2" />
      <path d="M14 24l7 7 13-13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FailIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2" />
      <path d="M16 16l16 16M32 16L16 32" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export default function PaymentPendingPage() {
  const { payment } = useLoaderData();
  const revalidator = useRevalidator();

  const isTerminal = ['confirmed', 'failed', 'expired', 'refunded'].includes(payment.status);

  // Poll every 4 seconds while awaiting. Stop once terminal.
  useEffect(() => {
    if (isTerminal) return;
    const iv = setInterval(() => {
      revalidator.revalidate();
    }, 4000);
    return () => clearInterval(iv);
  }, [isTerminal, revalidator]);

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (isTerminal) return;
    const start = Date.now();
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [isTerminal]);

  const amountUsd = (payment.amount_usd_cents / 100).toFixed(2);

  return (
    <>
      <Header />
      <main className={styles.page}>
        <div className={styles.container}>

          {payment.status === 'awaiting_payment' && (
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
            </div>
          )}

          {payment.status === 'confirmed' && (
            <div className={[styles.card, styles.cardSuccess].join(' ')}>
              <div className={[styles.iconWrap, styles.iconSuccess].join(' ')}>
                <CheckIcon />
              </div>
              <h1 className={styles.title}>Payment confirmed</h1>
              <p className={styles.subtitle}>
                <strong className={styles.highlight}>{payment.credits.toLocaleString()}</strong> credits added to your account.
              </p>

              <div className={styles.actions}>
                <Link to="/dashboard" className={styles.primaryBtn}>
                  Go to dashboard
                </Link>
                <Link to={`/receipts/${payment.id}`} className={styles.secondaryBtn}>
                  View receipt
                </Link>
              </div>
            </div>
          )}

          {(payment.status === 'failed' || payment.status === 'expired') && (
            <div className={[styles.card, styles.cardFail].join(' ')}>
              <div className={[styles.iconWrap, styles.iconFail].join(' ')}>
                <FailIcon />
              </div>
              <h1 className={styles.title}>
                {payment.status === 'expired' ? 'Payment expired' : 'Payment failed'}
              </h1>
              <p className={styles.subtitle}>
                {payment.status === 'expired'
                  ? 'This invoice expired before payment was received. No charge was made.'
                  : 'The payment could not be completed. No credits were added and no charge was made.'}
              </p>

              <div className={styles.actions}>
                <Link to="/credits" className={styles.primaryBtn}>
                  Try again
                </Link>
                <a href="mailto:support@trovarcis.com" className={styles.secondaryBtn}>
                  Contact support
                </a>
              </div>
            </div>
          )}

        </div>
      </main>
      <Footer />
    </>
  );
}
