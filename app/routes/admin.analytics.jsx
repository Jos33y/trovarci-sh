import { Form, useLoaderData } from 'react-router';
import {
  requireAdmin,
  adminAnalyticsOverview,
  adminKpiSparklines,
  adminCountryTraffic,
} from '~/utils/admin.server';
import KPICard from '~/components/admin/KPICard';
import CountryMap from '~/components/admin/CountryMap';
import EmptyState from '~/components/admin/EmptyState';
import styles from '~/styles/modules/routes/admin.module.css';

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

  // Daily chart geometry (inline mini-chart - reusing the design language
  // from AreaChart but smaller and without hover, since this is one of many
  // panels on the page).
  const series = overview.dailySeries;
  const max = Math.max(1, ...series.map((d) => d.pageviews));

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Analytics</h1>
          <p className={styles.pageSubtitle}>Cookieless, in-house. Bots filtered server-side.</p>
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
        <KPICard
          label="Pageviews"
          value={overview.totals.pageviews.toLocaleString()}
          hint={`${overview.totals.unique_sessions.toLocaleString()} sessions`}
          spark={sparks.pageviews}
        />
        <KPICard
          label="Unique users"
          value={overview.totals.unique_users.toLocaleString()}
          hint="signed-in only"
        />
        <KPICard
          label="Signups"
          value={overview.totals.signups.toLocaleString()}
          spark={sparks.signups}
        />
        <KPICard
          label="Payments"
          value={overview.totals.payments.toLocaleString()}
          spark={sparks.payments}
          tone="accent"
        />
      </div>

      {/* Daily pageviews mini-chart */}
      <section className={styles.panel} style={{ marginBottom: 'var(--space-lg)' }}>
        <header className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Daily pageviews</h2>
          <span className={styles.panelSub}>{days}d window</span>
        </header>

        {series.length === 0 ? (
          <p className={styles['td--muted']}>No data in this window.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            {series.map((d) => {
              const pct = (d.pageviews / max) * 100;
              return (
                <div key={d.day} style={{
                  display: 'grid',
                  gridTemplateColumns: '92px 1fr 70px 50px',
                  gap: 'var(--space-sm)',
                  alignItems: 'center',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                }}>
                  <span style={{ color: 'var(--trov-text-muted)' }}>{d.day}</span>
                  <span style={{
                    position: 'relative', height: 10, background: 'var(--trov-surface-light)', borderRadius: 999, overflow: 'hidden',
                  }}>
                    <span style={{
                      display: 'block', height: '100%', width: `${pct}%`,
                      background: 'var(--trov-accent)', borderRadius: 999, transition: 'width var(--transition-normal)',
                    }} />
                  </span>
                  <span style={{ textAlign: 'right', color: 'var(--trov-text)' }}>{d.pageviews.toLocaleString()}</span>
                  <span style={{ textAlign: 'right', color: 'var(--trov-text-muted)' }}>{d.sessions}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className={styles.threeCol}>
        <section className={styles.panel}>
          <header className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Top paths</h2>
          </header>
          {overview.topPaths.length === 0 ? (
            <p className={styles['td--muted']}>No data.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {overview.topPaths.map((r) => (
                <li key={r.path} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                  <span style={{ color: 'var(--trov-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.path}</span>
                  <span style={{ color: 'var(--trov-text-muted)' }}>{r.n.toLocaleString()}</span>
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
            <p className={styles['td--muted']}>None - all direct.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {overview.topReferrers.map((r) => (
                <li key={r.referrer_domain} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                  <span style={{ color: 'var(--trov-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.referrer_domain}</span>
                  <span style={{ color: 'var(--trov-text-muted)' }}>{r.n.toLocaleString()}</span>
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
