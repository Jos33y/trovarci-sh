// /credits/pending/:paymentId - waiting room for crypto invoice confirmation. Redirects out once terminal.

import { useEffect, useState } from 'react';
import { Link, useLoaderData, useRevalidator, redirect } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import { requireUser } from '~/utils/session.server';
import { getPaymentForUser } from '~/lib/payments.server';
import { getPaymentInfo, mapCryptomusStatus } from '~/lib/cryptomus.server';
import { sql } from '~/utils/db.server';
import styles from '~/styles/modules/routes/paymentPending.module.css';

export const meta = () => [
  { title: 'Payment Status | Trovarcis Reach' },
  { name: 'robots', content: 'noindex' },
];

// Loader fetches the payment row and redirects out on terminal states:
//   confirmed -> receipt page (resolved via credit_transactions.reference_id)
//   failed/expired -> credits page
// Non-terminal -> render pending UI which polls via revalidator every 4s.
export async function loader({ request, params }) {
  const user = await requireUser(request);
  const paymentId = params.paymentId;

  const payment = await getPaymentForUser(paymentId, user.id);
  if (!payment) {
    throw new Response('Payment not found', { status: 404 });
  }

  if (payment.status === 'confirmed') {
    // Receipt route is keyed by credit_transactions.id, not payment.id. Look up the purchase tx.
    const [tx] = await sql`
      SELECT id FROM credit_transactions
      WHERE reference_id = ${payment.id} AND type = 'purchase' AND user_id = ${user.id}
      LIMIT 1
    `;
    if (tx) throw redirect(`/receipts/${tx.id}`);
    // Defensive fallback - confirmed but no tx row yet (race). Dashboard will show balance.
    throw redirect('/dashboard?payment=confirmed');
  }
  if (payment.status === 'failed' || payment.status === 'expired') {
    throw redirect(`/credits?payment=${payment.status}`);
  }

  // Optional read-only Cryptomus poll to shorten perceived latency. Webhook is still source of truth.
  let remoteStatus = null;
  if (payment.gateway === 'cryptomus' && payment.status === 'awaiting_payment') {
    try {
      const info = await getPaymentInfo({ orderId: payment.id });
      remoteStatus = mapCryptomusStatus(info.status, info.is_final);
    } catch {
      // Non-fatal.
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

  // Poll every 4s until status moves to terminal - next loader run redirects out.
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
