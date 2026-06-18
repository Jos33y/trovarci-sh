import { useLoaderData } from 'react-router';
import {
  requireAdmin,
  adminAnalyticsOverview,
  adminAnalyticsFunnel,
  adminKpiDeltas,
  adminKpiSparklines,
  adminRevenueSeries,
  adminAnalyticsHeatmap,
  adminCountryTraffic,
  adminRecentActivity,
} from '~/utils/admin.server';
import KPICard from '~/components/admin/KPICard';
import AreaChart from '~/components/admin/AreaChart';
import Funnel from '~/components/admin/Funnel';
import Heatmap from '~/components/admin/Heatmap';
import CountryMap from '~/components/admin/CountryMap';
import LiveFeed from '~/components/admin/LiveFeed';
import styles from '~/styles/modules/routes/admin.module.css';

export const meta = () => [
  { title: 'Overview | Trovarcis Admin' },
  { name: 'robots', content: 'noindex, nofollow' },
];

const FUNNEL_LABELS = {
  pageview:             'Pageview',
  auth_submit:          'Auth submit',
  auth_otp_sent:        'OTP sent',
  auth_signup_complete: 'Signup',
  auth_success:         'Authenticated',
  checkout_click:       'Checkout',
  payment_pending:      'Payment pending',
  payment_confirmed:    'Paid',
};

// Slim the funnel to the 4 most load-bearing stages on the overview.
// The full 8-stage funnel lives at /admin/analytics/funnel.
const OVERVIEW_FUNNEL_KEYS = ['pageview', 'auth_signup_complete', 'checkout_click', 'payment_confirmed'];

function formatCents(c) { return '$' + (c / 100).toFixed(2); }

export async function loader({ request }) {
  await requireAdmin(request);

  const [
    deltas,
    sparks,
    revenue,
    overview,
    funnel,
    heatmap,
    countries,
    recentActivity,
  ] = await Promise.all([
    adminKpiDeltas({ days: 7 }),
    adminKpiSparklines({ days: 30 }),
    adminRevenueSeries({ days: 30 }),
    adminAnalyticsOverview({ days: 7 }),
    adminAnalyticsFunnel({ days: 7 }),
    adminAnalyticsHeatmap({ days: 7 }),
    adminCountryTraffic({ days: 30, limit: 20 }),
    adminRecentActivity({ limit: 25 }),
  ]);

  return { deltas, sparks, revenue, overview, funnel, heatmap, countries, recentActivity };
}

export default function AdminOverview() {
  const {
    deltas, sparks, revenue, overview, funnel, heatmap, countries, recentActivity,
  } = useLoaderData();

  // Project the slim overview funnel from the full result.
  const funnelByType = new Map(funnel.map((s) => [s.event_type, s]));
  const overviewFunnel = OVERVIEW_FUNNEL_KEYS
    .map((k) => {
      const row = funnelByType.get(k);
      return row
        ? { ...row, label: FUNNEL_LABELS[k] }
        : { event_type: k, label: FUNNEL_LABELS[k], events: 0, sessions: 0, users: 0 };
    });

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Overview</h1>
          <p className={styles.pageSubtitle}>Last 7 days unless noted</p>
        </div>
      </header>

      {/* KPI strip - 4 wide on desktop, 2 on tablet, 1 on phone */}
      <div className={styles.kpiStrip}>
        <KPICard
          label="Pageviews (7d)"
          value={deltas.pageviews.current.toLocaleString()}
          hint={`${overview.totals.unique_sessions.toLocaleString()} sessions`}
          spark={sparks.pageviews}
          delta={{ pct: deltas.pageviews.deltaPct, label: 'vs prev 7d' }}
        />
        <KPICard
          label="Signups (7d)"
          value={deltas.signups.current.toLocaleString()}
          hint={`${overview.totals.unique_users.toLocaleString()} signed-in users`}
          spark={sparks.signups}
          delta={{ pct: deltas.signups.deltaPct, label: 'vs prev 7d' }}
        />
        <KPICard
          label="Paid (7d)"
          value={deltas.payments.current.toLocaleString()}
          hint={`${deltas.payments.previous} prev period`}
          spark={sparks.payments}
          delta={{ pct: deltas.payments.deltaPct, label: 'vs prev 7d' }}
        />
        <KPICard
          label="Revenue (30d)"
          value={formatCents(deltas.revenue.current_cents)}
          hint={`${deltas.payments.current.toLocaleString()} confirmed payments`}
          delta={{ pct: deltas.revenue.deltaPct, label: 'vs prev 30d' }}
          tone="accent"
        />
      </div>

      <div className={styles.kpiStrip}>
        <KPICard
          label="Unresolved errors"
          value={deltas.errors.current.toLocaleString()}
          hint="last 7d"
          spark={sparks.errors}
          delta={{ pct: deltas.errors.deltaPct, label: 'vs prev 7d', inverse: true }}
          tone="error"
        />
        <KPICard
          label="Active users"
          value={deltas.activeUsers.current.toLocaleString()}
          hint="verified, not deleted"
        />
        <KPICard
          label="Open jobs"
          value={deltas.openJobs.current.toLocaleString()}
          hint="pending or processing"
        />
        <KPICard
          label="Top country (7d)"
          value={overview.topCountries[0]?.country || '-'}
          hint={overview.topCountries[0] ? `${overview.topCountries[0].n.toLocaleString()} pageviews` : 'no data'}
        />
      </div>

      {/* Main content + live-feed rail */}
      <div className={styles.overviewLayout}>
        <div className={styles.overviewMain}>
          <AreaChart data={revenue} />
          <Funnel steps={overviewFunnel} />
          <Heatmap cells={heatmap} />
          <CountryMap rows={countries} limit={10} />
        </div>

        <LiveFeed initial={recentActivity} refreshPath="/admin" />
      </div>
    </>
  );
}
