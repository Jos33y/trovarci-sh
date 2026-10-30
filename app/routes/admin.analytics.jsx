// Admin analytics index - traffic, where visitors come from, landing pages, free tool usage, countries.
import { Form, useLoaderData, useSubmit } from 'react-router';
import {
  requireAdmin,
  adminAnalyticsOverview,
  adminKpiSparklines,
  adminCountryTraffic,
  adminToolUsage,
  adminLandingSessions,
} from '~/utils/admin.server';
import { classifySource } from '~/utils/trafficSource';
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

  const [overview, sparks, countries, toolUsage, landingRows] = await Promise.all([
    adminAnalyticsOverview({ days }),
    adminKpiSparklines({ days: Math.min(30, Math.max(7, days)) }),
    adminCountryTraffic({ days, limit: 30 }),
    adminToolUsage({ days }),
    adminLandingSessions({ days }),
  ]);

  return { overview, sparks, countries, toolUsage, ...summariseLanding(landingRows), days };
}

const TOOL_LABELS = {
  domain_check: 'Domain Checker',
  email_score: 'Email Scorer',
  email_verify: 'Email Verifier',
  phone_verify: 'Number Verifier (carrier)',
  phone_format: 'Number Verifier (format)',
  smtp_test: 'SMTP Tester',
  dns_generate: 'DNS Generator',
};

function blankRow(key) {
  return { key, sessions: 0, ranTool: 0, signedUp: 0, fromSearch: 0, fromAi: 0 };
}

// Groups landing sessions two ways: by traffic source and by landing page.
function summariseLanding(rows) {
  const bySource = new Map();
  const byPage = new Map();
  for (const r of rows) {
    const { group, kind } = classifySource(r.source);
    const src = bySource.get(group) || { ...blankRow(group), kind };
    src.sessions += r.sessions;
    src.ranTool += r.ran_tool;
    src.signedUp += r.signed_up;
    bySource.set(group, src);

    const page = byPage.get(r.landing_path) || blankRow(r.landing_path);
    page.sessions += r.sessions;
    page.ranTool += r.ran_tool;
    page.signedUp += r.signed_up;
    if (kind === 'search') page.fromSearch += r.sessions;
    if (kind === 'ai') page.fromAi += r.sessions;
    byPage.set(r.landing_path, page);
  }
  const bySessions = (a, b) => b.sessions - a.sessions;
  return {
    sources: [...bySource.values()].sort(bySessions).slice(0, 15),
    landingPages: [...byPage.values()].sort(bySessions).slice(0, 20),
  };
}

function pct(part, whole) {
  if (!whole) return '-';
  return `${Math.round((part / whole) * 100)}%`;
}

export default function AdminAnalytics() {
  const { overview, sparks, countries, toolUsage, sources, landingPages, days } = useLoaderData();
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

      <section className={styles.panel}>
        <header className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Where visitors come from</h2>
          <span className={styles.panelSub}>sessions by first pageview, {days}d</span>
        </header>
        {sources.length === 0 ? (
          <EmptyState title="No sessions yet" body="Sources appear once visitors land with the updated tracking." />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Type</th>
                  <th className={styles['th--right']}>Sessions</th>
                  <th className={styles['th--right']}>Ran a tool</th>
                  <th className={styles['th--right']}>Signed up</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.key}>
                    <td data-label="Source">{s.key}</td>
                    <td data-label="Type" className={styles['td--muted']}>{s.kind}</td>
                    <td data-label="Sessions" className={styles['td--num']}>{formatInt(s.sessions)}</td>
                    <td data-label="Ran a tool" className={styles['td--num']}>{formatInt(s.ranTool)} ({pct(s.ranTool, s.sessions)})</td>
                    <td data-label="Signed up" className={styles['td--num']}>{formatInt(s.signedUp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.panel}>
        <header className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Landing pages</h2>
          <span className={styles.panelSub}>where sessions start, and what they did next</span>
        </header>
        {landingPages.length === 0 ? (
          <EmptyState title="No landing pages yet" body="Each session's first page will rank here." />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Page</th>
                  <th className={styles['th--right']}>Sessions</th>
                  <th className={styles['th--right']}>From search</th>
                  <th className={styles['th--right']}>From AI</th>
                  <th className={styles['th--right']}>Ran a tool</th>
                  <th className={styles['th--right']}>Signed up</th>
                </tr>
              </thead>
              <tbody>
                {landingPages.map((p) => (
                  <tr key={p.key}>
                    <td data-label="Page" className={styles['td--mono']}>{p.key}</td>
                    <td data-label="Sessions" className={styles['td--num']}>{formatInt(p.sessions)}</td>
                    <td data-label="From search" className={styles['td--num']}>{formatInt(p.fromSearch)}</td>
                    <td data-label="From AI" className={styles['td--num']}>{formatInt(p.fromAi)}</td>
                    <td data-label="Ran a tool" className={styles['td--num']}>{formatInt(p.ranTool)} ({pct(p.ranTool, p.sessions)})</td>
                    <td data-label="Signed up" className={styles['td--num']}>{formatInt(p.signedUp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className={styles.twoCol}>
        <section className={styles.panel}>
          <header className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Free tool usage</h2>
            <span className={styles.panelSub}>{days}d window</span>
          </header>
          {toolUsage.tools.length === 0 ? (
            <EmptyState title="No tool runs yet" body="Every check, test and generation is counted here, signed in or not." />
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Tool</th>
                    <th className={styles['th--right']}>Started</th>
                    <th className={styles['th--right']}>Finished</th>
                    <th className={styles['th--right']}>Errors</th>
                    <th className={styles['th--right']}>Hit sign-in</th>
                    <th className={styles['th--right']}>Sessions</th>
                  </tr>
                </thead>
                <tbody>
                  {toolUsage.tools.map((t) => (
                    <tr key={t.tool}>
                      <td data-label="Tool">{TOOL_LABELS[t.tool] || t.tool}</td>
                      <td data-label="Started" className={styles['td--num']}>{formatInt(t.starts)}</td>
                      <td data-label="Finished" className={styles['td--num']}>{formatInt(t.successes)}</td>
                      <td data-label="Errors" className={styles['td--num']}>{formatInt(t.errors)}</td>
                      <td data-label="Hit sign-in" className={styles['td--num']}>{formatInt(t.auth_walls)}</td>
                      <td data-label="Sessions" className={styles['td--num']}>{formatInt(t.sessions)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={styles.panel}>
          <header className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Top tool errors</h2>
          </header>
          {toolUsage.errors.length === 0 ? (
            <EmptyState title="No tool errors" body="Error codes from tool runs rank here." />
          ) : (
            <ul className={styles.rankList}>
              {toolUsage.errors.map((e) => (
                <li key={`${e.tool}-${e.code}`} className={styles.rankListItem}>
                  <span className={styles.rankListLabel}>{TOOL_LABELS[e.tool] || e.tool} · {e.code}</span>
                  <span className={styles.rankListValue}>{formatInt(e.n)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
