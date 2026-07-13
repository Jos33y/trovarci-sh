// Admin payment detail - kvList of payment fields, metadata code block, linked user side rail.
import { Link, useLoaderData } from 'react-router';
import { requireAdmin, adminGetPaymentDetail } from '~/utils/admin.server';
import styles from '~/styles/modules/routes/admin';
import { formatInt } from '~/utils/format';

export const meta = ({ data }) => [
  { title: data?.payment ? `Payment ${data.payment.id.slice(0, 8)} | Admin` : 'Payment | Admin' },
  { name: 'robots', content: 'noindex, nofollow' },
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loader({ request, params }) {
  await requireAdmin(request);

  if (!UUID_RE.test(params.paymentId)) {
    throw new Response('Bad request', { status: 400 });
  }

  const payment = await adminGetPaymentDetail(params.paymentId);
  if (!payment) throw new Response('Not Found', { status: 404 });

  return { payment };
}

const STATUS_BADGE = {
  confirmed:        'badgeSuccess',
  pending:          'badgeNeutral',
  awaiting_payment: 'badgeWarning',
  failed:           'badgeError',
  expired:          'badgeError',
  refunded:         'badgeNeutral',
};

function formatCents(c) { return '$' + (c / 100).toFixed(2); }
function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

export default function AdminPaymentDetail() {
  const { payment } = useLoaderData();

  const meta = payment.metadata && typeof payment.metadata === 'object'
    ? payment.metadata
    : {};

  return (
    <>
      <Link to="/admin/payments" className={styles.backLink}>← Back to payments</Link>

      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Payment</h1>
          <p className={styles.pageSubtitle}>
            <span className={styles.mono}>{payment.id}</span>
          </p>
        </div>
        <div className={styles.pageHeaderActions}>
          <span className={`${styles.badge} ${styles[STATUS_BADGE[payment.status] || 'badgeNeutral']}`}>{payment.status}</span>
        </div>
      </header>

      <div className={styles.detailGrid}>
        <div className={styles.detailMain}>
          <section className={styles.panel}>
            <header className={styles.panelHead}>
              <h2 className={styles.panelTitle}>Payment</h2>
            </header>
            <div className={styles.kvList}>
              <div className={styles.kvKey}>Created</div>
              <div className={`${styles.kvValue} ${styles['kvValue--mono']}`}>{formatDate(payment.created_at)}</div>

              <div className={styles.kvKey}>Completed</div>
              <div className={`${styles.kvValue} ${styles['kvValue--mono']}`}>{formatDate(payment.completed_at)}</div>

              <div className={styles.kvKey}>Gateway</div>
              <div className={styles.kvValue}>{payment.gateway}</div>

              <div className={styles.kvKey}>Status</div>
              <div className={styles.kvValue}>
                <span className={`${styles.badge} ${styles[STATUS_BADGE[payment.status] || 'badgeNeutral']}`}>{payment.status}</span>
              </div>

              <div className={styles.kvKey}>Package</div>
              <div className={styles.kvValue}>{payment.package_key || '-'}</div>

              <div className={styles.kvKey}>Credits</div>
              <div className={`${styles.kvValue} ${styles['kvValue--mono']}`}>{formatInt(payment.credits)}</div>

              <div className={styles.kvKey}>Amount</div>
              <div className={`${styles.kvValue} ${styles['kvValue--mono']} ${styles['kvValue--accent']}`}>
                {formatCents(payment.amount_usd_cents)}
              </div>

              {payment.gateway_session_id ? (
                <>
                  <div className={styles.kvKey}>Session ID</div>
                  <div className={`${styles.kvValue} ${styles['kvValue--mono']}`}>{payment.gateway_session_id}</div>
                </>
              ) : null}

              {payment.gateway_payment_id ? (
                <>
                  <div className={styles.kvKey}>Gateway TX</div>
                  <div className={`${styles.kvValue} ${styles['kvValue--mono']}`}>{payment.gateway_payment_id}</div>
                </>
              ) : null}
            </div>
          </section>

          {Object.keys(meta).length > 0 ? (
            <section className={styles.panel}>
              <header className={styles.panelHead}>
                <h2 className={styles.panelTitle}>Metadata</h2>
              </header>
              <pre className={styles.codeBlock}>{JSON.stringify(meta, null, 2)}</pre>
            </section>
          ) : null}
        </div>

        <div className={styles.detailSide}>
          <section className={styles.panel}>
            <header className={styles.panelHead}>
              <h2 className={styles.panelTitle}>User</h2>
            </header>
            {payment.user_id ? (
              <div className={styles.userCard}>
                <p className={styles.userCardEmail}>{payment.user_email || '-'}</p>
                <p className={styles.userCardId}>{payment.user_id}</p>
                <Link to={`/admin/users/${payment.user_id}`} className={`${styles.formButton} ${styles['formButton--ghost']}`}>
                  View user
                </Link>
              </div>
            ) : (
              <p className={styles.muted}>User deleted or anonymous.</p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
