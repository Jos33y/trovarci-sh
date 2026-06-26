// Admin conversion funnel. Pageview through Payment confirmed.
// Filename uses trailing underscore on `analytics_` so this is a sibling route, not a child of admin.analytics.
import { Form, useLoaderData, useSubmit } from 'react-router';
import { requireAdmin, adminAnalyticsFunnel } from '~/utils/admin.server';
import KPICard from '~/components/admin/KPICard';
import Funnel from '~/components/admin/Funnel';
import EmptyState from '~/components/admin/EmptyState';
import { FunnelIcon, TagIcon, ChartIcon, AlertIcon } from '~/components/icons';
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
  const submit = useSubmit();
  const onFilterChange = (ev) => submit(ev.currentTarget.form, { replace: true });

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
  const dropoff = Math.max(0, totalSessions - finalSessions);

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Conversion funnel</h1>
          <p className={styles.pageSubtitle}>Pageview → Payment, last {days} days</p>
        </div>
      </header>

      <Form method="get" className={styles.tableToolbar}>
        <div className={styles.filterField}>
          <label className={styles.filterLabel} htmlFor="days">Window</label>
          <select id="days" name="days" defaultValue={String(days)} onChange={onFilterChange} className={styles.filterSelect}>
            <option value="1">Last 24h</option>
            <option value="7">Last 7d</option>
            <option value="30">Last 30d</option>
            <option value="90">Last 90d</option>
          </select>
        </div>
      </Form>

      <div className={styles.kpiStrip}>
        <KPICard
          label="Top of funnel"
          value={totalSessions.toLocaleString()}
          hint="sessions reached pageview"
          icon={FunnelIcon}
        />
        <KPICard
          label="Bottom of funnel"
          value={finalSessions.toLocaleString()}
          hint="confirmed payments"
          icon={TagIcon}
          variant="hero"
        />
        <KPICard
          label="Overall rate"
          value={`${overallRate}%`}
          hint="pageview to paid"
          icon={ChartIcon}
        />
        <KPICard
          label="Drop-off"
          value={dropoff.toLocaleString()}
          hint="sessions lost across funnel"
          icon={AlertIcon}
        />
      </div>

      {totalSessions === 0 ? (
        <EmptyState
          icon={FunnelIcon}
          title="No funnel data yet"
          body="Once users land and move through signup and payment, this view will populate."
        />
      ) : (
        <Funnel steps={steps} />
      )}
    </>
  );
}
