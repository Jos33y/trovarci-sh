// Admin analytics index - traffic overview with window picker, KPI strip, daily bars, top lists, country map.
import { Form, useLoaderData, useSubmit } from 'react-router';
import {
  requireAdmin,
  adminAnalyticsOverview,
  adminKpiSparklines,
  adminCountryTraffic,
} from '~/utils/admin.server';
import KPICard from '~/components/admin/KPICard';
import CountryMap from '~/components/admin/CountryMap';
import DailyBars from '~/components/admin/DailyBars';
import EmptyState from '~/components/admin/EmptyState';
import styles from '~/styles/modules/routes/admin';
import { formatInt } from '~/utils/format';

export const meta = () => [
  { title: 'Analytics | Trovarcis Admin' },
  { name: 'robots', content: 'noindex, nofollow' },
];

export async function loader({ request }) {
  await requireAdmin(request);
  const url = new URL(request.url);
  const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get('days') || '7', 10)));

  const [overview, sparks, countries] = await Promise.all([
    adminAnalyticsOverview({ days }),
    adminKpiSparklines({ days: Math.min(30, Math.max(7, days)) }),
    adminCountryTraffic({ days, limit: 30 }),
  ]);

  return { overview, sparks, countries, days };
}

export default function AdminAnalytics() {
  const { overview, sparks, countries, days } = useLoaderData();
  const submit = useSubmit();
  const onFilterChange = (ev) => submit(ev.currentTarget.form, { replace: true });

  const series = overview.dailySeries;

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Analytics</h1>
          <p className={styles.pageSubtitle}>Cookieless, in-house. Bots filtered server-side.</p>
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
          label="Pageviews"
          value={formatInt(overview.totals.pageviews)}
          hint={`${formatInt(overview.totals.unique_sessions)} sessions`}
          spark={sparks.pageviews}
        />
        <KPICard
          label="Unique users"
          value={formatInt(overview.totals.unique_users)}
          hint="signed-in only"
        />
        <KPICard
          label="Signups"
          value={formatInt(overview.totals.signups)}
          spark={sparks.signups}
        />
        <KPICard
          label="Payments"
          value={formatInt(overview.totals.payments)}
          spark={sparks.payments}
          variant="hero"
        />
      </div>

      <section className={styles.panel}>
        <header className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Daily pageviews</h2>
          <span className={styles.panelSub}>{days}d window</span>
        </header>
        {series.length === 0 ? (
          <EmptyState
            title="No data in this window"
            body="Once visitors arrive, daily pageviews will show up here."
          />
        ) : (
          <DailyBars series={series} />
        )}
      </section>

      <div className={styles.threeCol}>
        <section className={styles.panel}>
          <header className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Top paths</h2>
          </header>
          {overview.topPaths.length === 0 ? (
            <EmptyState title="No paths yet" body="Paths visited will rank here as traffic comes in." />
          ) : (
            <ul className={styles.rankList}>
              {overview.topPaths.map((r) => (
                <li key={r.path} className={styles.rankListItem}>
                  <span className={styles.rankListLabel}>{r.path}</span>
                  <span className={styles.rankListValue}>{formatInt(r.n)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.panel}>
          <header className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Top referrers</h2>
          </header>
          {overview.topReferrers.length === 0 ? (
            <EmptyState title="Direct traffic only" body="No external referrers in this window. All visits are direct or organic." />
          ) : (
            <ul className={styles.rankList}>
              {overview.topReferrers.map((r) => (
                <li key={r.referrer_domain} className={styles.rankListItem}>
                  <span className={styles.rankListLabel}>{r.referrer_domain}</span>
                  <span className={styles.rankListValue}>{formatInt(r.n)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <CountryMap rows={countries} limit={10} />
      </div>
    </>
  );
}
