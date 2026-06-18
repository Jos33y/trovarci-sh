import { Form, useLoaderData } from 'react-router';
import { requireAdmin, adminAnalyticsFunnel } from '~/utils/admin.server';
import Funnel from '~/components/admin/Funnel';
import EmptyState from '~/components/admin/EmptyState';
import styles from '~/styles/modules/routes/admin.module.css';

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
  payment_confirmed:    'Payment confirmed',
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

  // Project all 8 known steps in canonical order, zero-fill missing ones.
  const byType = new Map(funnel.map((s) => [s.event_type, s]));
  const steps = FUNNEL_KEYS.map((k) => {
    const row = byType.get(k);
    return row
      ? { ...row, label: FUNNEL_LABELS[k] }
      : { event_type: k, label: FUNNEL_LABELS[k], events: 0, sessions: 0, users: 0 };
  });

  const totalSessions = steps[0].sessions;
  const finalSessions = steps[steps.length - 1].sessions;
  const overallRate = totalSessions > 0 ? Math.round((finalSessions / totalSessions) * 100) : 0;

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Conversion funnel</h1>
          <p className={styles.pageSubtitle}>Pageview → Payment, last {days} days</p>
        </div>
      </header>

      <Form method="get" className={styles.filters}>
        <div className={styles.filterField}>
          <label className={styles.filterLabel} htmlFor="days">Window</label>
          <select id="days" name="days" defaultValue={String(days)} className={styles.filterSelect}>
            <option value="1">Last 24h</option>
            <option value="7">Last 7d</option>
            <option value="30">Last 30d</option>
            <option value="90">Last 90d</option>
          </select>
        </div>
        <button type="submit" className={styles.formButton}>Apply</button>
      </Form>

      <div className={styles.kpiStrip}>
        <div className={styles.panel}>
          <span className={styles['td--muted']} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Top of funnel</span>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--trov-text)' }}>{totalSessions.toLocaleString()}</div>
          <div style={{ fontSize: 12, color: 'var(--trov-text-muted)' }}>sessions reached pageview</div>
        </div>
        <div className={styles.panel}>
          <span className={styles['td--muted']} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Bottom of funnel</span>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--trov-accent)' }}>{finalSessions.toLocaleString()}</div>
          <div style={{ fontSize: 12, color: 'var(--trov-text-muted)' }}>confirmed payments</div>
        </div>
        <div className={styles.panel}>
          <span className={styles['td--muted']} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Overall rate</span>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--trov-text)' }}>{overallRate}%</div>
          <div style={{ fontSize: 12, color: 'var(--trov-text-muted)' }}>pageview to paid</div>
        </div>
        <div className={styles.panel}>
          <span className={styles['td--muted']} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Drop-off</span>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--trov-error)' }}>{(totalSessions - finalSessions).toLocaleString()}</div>
          <div style={{ fontSize: 12, color: 'var(--trov-text-muted)' }}>sessions lost across funnel</div>
        </div>
      </div>

      {totalSessions === 0 ? (
        <EmptyState
          title="No funnel data yet"
          body="Once users land and move through signup and payment, this view will populate."
        />
      ) : (
        <Funnel steps={steps} />
      )}
    </>
  );
}
