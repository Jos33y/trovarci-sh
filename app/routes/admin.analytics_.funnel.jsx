// Funnel dashboard: pageview -> auth -> checkout -> payment.

import { Link, useLoaderData } from 'react-router';
import { requireAdmin, adminAnalyticsFunnel } from '~/utils/admin.server';
import Funnel from '~/components/admin/Funnel';
import styles from '~/styles/modules/routes/admin';

export const meta = () => [
  { title: 'Funnel | Trovarcis Admin' },
  { name: 'robots', content: 'noindex, nofollow' },
];

const FUNNEL_LABELS = {
  pageview:             'Pageview',
  auth_submit:          'Auth submit',
  auth_otp_sent:        'OTP sent',
  auth_signup_complete: 'Signup complete',
  auth_success:         'Authenticated',
  checkout_click:       'Checkout click',
  payment_pending:      'Payment pending',
  gateway_redirect:     'Gateway redirect',
  payment_confirmed:    'Payment confirmed',
  payment_failed:       'Payment failed',
  payment_abandoned:    'Payment abandoned',
};

const FUNNEL_KEYS = Object.keys(FUNNEL_LABELS);

export async function loader({ request }) {
  await requireAdmin(request);
  const url = new URL(request.url);
  const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get('days') || '7', 10)));
  const funnel = await adminAnalyticsFunnel({ days });
  return { funnel, days };
}

export default function AdminFunnel() {
  const { funnel, days } = useLoaderData();

  const byType = new Map(funnel.map((s) => [s.event_type, s]));
  const steps = FUNNEL_KEYS.map((k) => {
    const row = byType.get(k);
    return row
      ? { ...row, label: FUNNEL_LABELS[k] }
      : { event_type: k, label: FUNNEL_LABELS[k], events: 0, sessions: 0, users: 0 };
  });

  const totalSessions = steps[0]?.sessions || 0;
  const finalSessions = steps[steps.length - 1]?.sessions || 0;
  const conversion = totalSessions > 0
    ? ((finalSessions / totalSessions) * 100).toFixed(2)
    : '0.00';

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Funnel</h1>
          <p className={styles.pageSubtitle}>Pageview to payment conversion over last {days} days</p>
        </div>
        <div className={styles.pageActions}>
          {[1, 7, 30, 90].map((d) => (
            <Link
              key={d}
              to={`?days=${d}`}
              className={`${styles.formButton} ${styles['formButton--ghost']} ${d === days ? styles['formButton--active'] : ''}`}
            >
              {d}d
            </Link>
          ))}
        </div>
      </header>

      <div className={styles.summaryRow}>
        <div className={styles.summaryTile}>
          <div className={styles.summaryLabel}>Overall conversion</div>
          <div className={styles.summaryValue}>{conversion}%</div>
          <div className={styles.summarySub}>Pageview to payment confirmed</div>
        </div>
        <div className={styles.summaryTile}>
          <div className={styles.summaryLabel}>Sessions</div>
          <div className={styles.summaryValue}>{totalSessions.toLocaleString()}</div>
          <div className={styles.summarySub}>Entered funnel</div>
        </div>
        <div className={styles.summaryTile}>
          <div className={styles.summaryLabel}>Conversions</div>
          <div className={styles.summaryValue}>{finalSessions.toLocaleString()}</div>
          <div className={styles.summarySub}>Reached payment confirmed</div>
        </div>
      </div>

      <Funnel steps={steps} />
    </>
  );
}
