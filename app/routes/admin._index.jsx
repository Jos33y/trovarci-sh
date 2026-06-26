// Admin overview - clustered KPIs (Growth, Health & range), revenue + funnel, heatmap + countries, live feed rail.
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
import {
  GlobeIcon, UsersIcon, CardIcon, TagIcon,
  AlertIcon, CheckIcon, LayersIcon,
} from '~/components/icons';
import styles from '~/styles/modules/routes/admin';

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

// Overview shows the 4 load-bearing stages; full 8-stage view lives at /admin/analytics/funnel.
const OVERVIEW_FUNNEL_KEYS = ['pageview', 'auth_signup_complete', 'checkout_click', 'payment_confirmed'];

function formatCents(c) { return '$' + (c / 100).toFixed(2); }

export async function loader({ request }) {
  await requireAdmin(request);

  const [deltas, sparks, revenue, overview, funnel, heatmap, countries, recentActivity] = await Promise.all([
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

  const funnelByType = new Map(funnel.map((s) => [s.event_type, s]));
  const overviewFunnel = OVERVIEW_FUNNEL_KEYS.map((k) => {
    const row = funnelByType.get(k);
    return row
      ? { ...row, label: FUNNEL_LABELS[k] }
      : { event_type: k, label: FUNNEL_LABELS[k], events: 0, sessions: 0, users: 0 };
  });

  const errorsHigh = (deltas.errors?.current || 0) > 0;
  const topCountry = overview.topCountries[0];

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Overview</h1>
          <p className={styles.pageSubtitle}>Last 7 days unless noted</p>
        </div>
      </header>

      <div className={`${styles.kpiCluster} ${styles.kpiClusterFirst}`}>Growth</div>
      <div className={styles.kpiStrip}>
        <KPICard
          label="Pageviews (7d)"
          value={deltas.pageviews.current.toLocaleString()}
          hint={`${overview.totals.unique_sessions.toLocaleString()} sessions`}
          icon={GlobeIcon}
          spark={sparks.pageviews}
          delta={{ pct: deltas.pageviews.deltaPct }}
        />
        <KPICard
          label="Signups (7d)"
          value={deltas.signups.current.toLocaleString()}
          hint={`${overview.totals.unique_users.toLocaleString()} signed-in users`}
          icon={UsersIcon}
          spark={sparks.signups}
          delta={{ pct: deltas.signups.deltaPct }}
        />
        <KPICard
          label="Paid (7d)"
          value={deltas.payments.current.toLocaleString()}
          hint={`${deltas.payments.previous} prev period`}
          icon={CardIcon}
          spark={sparks.payments}
          delta={{ pct: deltas.payments.deltaPct }}
        />
        <KPICard
          label="Revenue (30d)"
          value={formatCents(deltas.revenue.current_cents)}
          hint={`${deltas.payments.current.toLocaleString()} confirmed payments`}
          icon={TagIcon}
          spark={sparks.payments}
          delta={{ pct: deltas.revenue.deltaPct }}
          variant="hero"
        />
      </div>

      <div className={`${styles.kpiCluster} ${styles.kpiClusterAfter}`}>Health &amp; range</div>
      <div className={styles.kpiStrip}>
        <KPICard
          label="Unresolved errors"
          value={deltas.errors.current.toLocaleString()}
          hint="last 7d"
          icon={AlertIcon}
          spark={sparks.errors}
          delta={{ pct: deltas.errors.deltaPct, inverse: true }}
          tone="error"
          variant={errorsHigh ? 'alert' : 'default'}
        />
        <KPICard
          label="Active users"
          value={deltas.activeUsers?.current?.toLocaleString() || '0'}
          hint="verified, not deleted"
          icon={CheckIcon}
          delta={Number.isFinite(deltas.activeUsers?.deltaPct) ? { pct: deltas.activeUsers.deltaPct } : undefined}
        />
        <KPICard
          label="Open jobs"
          value={deltas.openJobs?.current?.toLocaleString() || '0'}
          hint="pending or processing"
          icon={LayersIcon}
          delta={Number.isFinite(deltas.openJobs?.deltaPct) ? { pct: deltas.openJobs.deltaPct } : undefined}
        />
        <KPICard
          label="Top country (7d)"
          hint={topCountry ? `${topCountry.n.toLocaleString()} pageviews` : 'no data'}
          variant="snapshot"
          snapshot={topCountry?.country}
        />
      </div>

      <div className={styles.overviewLayout}>
        <div className={styles.overviewMain}>
          <AreaChart data={revenue} />
          <Funnel steps={overviewFunnel} />
          <div className={styles.twoColInner}>
            <Heatmap cells={heatmap} />
            <CountryMap rows={countries} limit={8} />
          </div>
        </div>

        <LiveFeed initial={recentActivity} refreshPath="/admin" />
      </div>
    </>
  );
}
