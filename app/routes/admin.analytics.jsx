// Admin analytics index - traffic, where visitors come from, landing pages, free tool usage, countries.
import { Form, useLoaderData, useSubmit } from 'react-router';
import {
  requireAdmin,
  adminAnalyticsOverview,
  adminKpiSparklines,
  adminCountryTraffic,
  adminToolUsage,
  adminLandingSessions,
  adminToolVotes,
} from '~/utils/admin.server';
import { classifySource } from '~/utils/trafficSource';
import KPICard from '~/components/admin/KPICard';
import CountryMap from '~/components/admin/CountryMap';
import DailyBars from '~/components/admin/DailyBars';
import EmptyState from '~/components/admin/EmptyState';
import { ShareLabel, Count, Rate, Takeaway } from '~/components/admin/MetricCells';
import styles from '~/styles/modules/routes/admin';
import { formatInt } from '~/utils/format';

export const meta = () => [
  { title: 'Analytics | Trovarcis Admin' },
  { name: 'robots', content: 'noindex, nofollow' },
];

export async function loader({ request }) {
  await requireAdmin(request);
  const url = new URL(request.url);
  const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get('days') || '7', 10) || 7));

  const [overview, sparks, countries, toolUsage, landingRows, voteRows] = await Promise.all([
    adminAnalyticsOverview({ days }),
    adminKpiSparklines({ days: Math.min(30, Math.max(7, days)) }),
    adminCountryTraffic({ days, limit: 30 }),
    adminToolUsage({ days }),
    adminLandingSessions({ days }),
    adminToolVotes({ days }),
  ]);

  const toolVotes = Object.fromEntries(voteRows.map((r) => [r.tool, { yes: r.yes, no: r.no }]));
  return { overview, sparks, countries, toolUsage, toolVotes, ...summariseLanding(landingRows), days };
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

const plural = (n, one, many) => `${formatInt(n)} ${n === 1 ? one : many}`;

function sourceSummary(sources) {
  const total = sources.reduce((n, s) => n + s.sessions, 0);
  const byKind = (kind) => sources.filter((s) => s.kind === kind).reduce((n, s) => n + s.sessions, 0);
  const ranTool = sources.reduce((n, s) => n + s.ranTool, 0);
  const signedUp = sources.reduce((n, s) => n + s.signedUp, 0);
  return { total, search: byKind('search'), ai: byKind('ai'), direct: byKind('direct'), ranTool, signedUp };
}

// Names the pages search and AI visitors landed on, since those are the ones content work moves.
function searchLandings(pages) {
  return pages
    .filter((p) => p.fromSearch + p.fromAi > 0)
    .sort((a, b) => (b.fromSearch + b.fromAi) - (a.fromSearch + a.fromAi))
    .slice(0, 3);
}

export default function AdminAnalytics() {
  const { overview, sparks, countries, toolUsage, toolVotes, sources, landingPages, days } = useLoaderData();
  const submit = useSubmit();
  const onFilterChange = (ev) => submit(ev.currentTarget.form, { replace: true });

  const series = overview.dailySeries;
  const sum = sourceSummary(sources);
  const landedFromSearch = searchLandings(landingPages);
  const toolMax = Math.max(0, ...toolUsage.tools.map((t) => t.starts));

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Analytics</h1>
          <p className={styles.pageSubtitle}>Cookieless, in-house. Bots filtered server-side. Raw events kept 13 months.</p>
        </div>
        <div className={styles.pageHeaderActions}>
          {/* Plain links: these are file downloads, not client-side navigation. */}
          <a className={`${styles.formButton} ${styles['formButton--ghost']}`} href={`/admin/analytics/export?kind=events&days=${days}`} download>
            Export events ({days}d)
          </a>
          <a className={`${styles.formButton} ${styles['formButton--ghost']}`} href="/admin/analytics/export?kind=daily" download>
            Export daily totals
          </a>
        </div>
      </header>

      <div className={styles.pageFlow}>
        <Form method="get" className={styles.tableToolbar}>
          <div className={styles.filterField}>
            <label className={styles.filterLabel} htmlFor="days">Window</label>
            <select id="days" name="days" defaultValue={String(days)} onChange={onFilterChange} className={styles.filterSelect}>
              <option value="1">Last 24h</option>
              <option value="7">Last 7d</option>
              <option value="30">Last 30d</option>
              <option value="90">Last 90d</option>
              <option value="180">Last 180d</option>
              <option value="365">Last 365d</option>
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
            <span className={styles.panelSub}>by the page each session started on</span>
          </header>
          {sources.length === 0 ? (
            <EmptyState title="No sessions yet" body="Sources appear once visitors land with the updated tracking." />
          ) : (
            <>
              <Takeaway>
                <strong>{plural(sum.total, 'session', 'sessions')}</strong> in {days} days.
                {' '}Search brought {formatInt(sum.search)}, AI tools {formatInt(sum.ai)}, direct {formatInt(sum.direct)}.
                {' '}{plural(sum.ranTool, 'session', 'sessions')} ran a tool and {formatInt(sum.signedUp)} signed up.
              </Takeaway>
              <div className={styles.tableWrap}>
                <table className={`${styles.table} ${styles['table--report']}`}>
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Sessions</th>
                      <th title="Sessions that ran at least one tool">Ran a tool</th>
                      <th title="Sessions that created an account">Signed up</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sources.map((s) => (
                      <tr key={s.key}>
                        <td data-label="Source">
                          <ShareLabel label={s.key} value={s.sessions} max={sources[0].sessions} tag={s.kind === 'other' || s.kind === 'direct' ? null : s.kind} />
                        </td>
                        <td data-label="Sessions"><Count n={s.sessions} /></td>
                        <td data-label="Ran a tool"><Rate part={s.ranTool} whole={s.sessions} /></td>
                        <td data-label="Signed up"><Rate part={s.signedUp} whole={s.sessions} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
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
            <>
              <Takeaway>
                {landedFromSearch.length === 0
                  ? 'No visitor from search or an AI tool started on a page in this window.'
                  : <>Search and AI visitors started on{' '}
                      {landedFromSearch.map((p, i) => (
                        <span key={p.key}>
                          {i > 0 ? (i === landedFromSearch.length - 1 ? ' and ' : ', ') : ''}
                          <strong>{p.key}</strong> ({formatInt(p.fromSearch + p.fromAi)})
                        </span>
                      ))}.
                    </>}
              </Takeaway>
              <div className={styles.tableWrap}>
                <table className={`${styles.table} ${styles['table--report']}`}>
                  <thead>
                    <tr>
                      <th>Page</th>
                      <th>Sessions</th>
                      <th title="Sessions that arrived from a search engine">From search</th>
                      <th title="Sessions that arrived from ChatGPT, Copilot, Perplexity and similar">From AI</th>
                      <th title="Sessions that ran at least one tool">Ran a tool</th>
                      <th title="Sessions that created an account">Signed up</th>
                    </tr>
                  </thead>
                  <tbody>
                    {landingPages.map((p) => (
                      <tr key={p.key}>
                        <td data-label="Page">
                          <ShareLabel label={p.key} value={p.sessions} max={landingPages[0].sessions} mono />
                        </td>
                        <td data-label="Sessions"><Count n={p.sessions} /></td>
                        <td data-label="From search"><Count n={p.fromSearch} /></td>
                        <td data-label="From AI"><Count n={p.fromAi} /></td>
                        <td data-label="Ran a tool"><Rate part={p.ranTool} whole={p.sessions} /></td>
                        <td data-label="Signed up"><Rate part={p.signedUp} whole={p.sessions} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <div className={styles.twoCol}>
          <section className={styles.panel}>
            <header className={styles.panelHead}>
              <h2 className={styles.panelTitle}>Tool usage</h2>
              <span className={styles.panelSub}>{days}d window</span>
            </header>
            {toolUsage.tools.length === 0 ? (
              <EmptyState title="No tool runs yet" body="Every check, test and generation is counted here, signed in or not." />
            ) : (
              <div className={styles.tableWrap}>
                <table className={`${styles.table} ${styles['table--report']}`}>
                  <thead>
                    <tr>
                      <th>Tool</th>
                      <th>Started</th>
                      <th>Finished</th>
                      <th>Errors</th>
                      <th title="Runs stopped because the tool needs an account">Hit sign-in</th>
                      <th>Sessions</th>
                      <th className={styles['cell--text']} title='Answers to "Did this check help?" under the result'>Helpful</th>
                    </tr>
                  </thead>
                  <tbody>
                    {toolUsage.tools.map((t) => (
                      <tr key={t.tool}>
                        <td data-label="Tool">
                          <ShareLabel label={TOOL_LABELS[t.tool] || t.tool} value={t.starts} max={toolMax} />
                        </td>
                        <td data-label="Started"><Count n={t.starts} /></td>
                        <td data-label="Finished"><Rate part={t.successes} whole={t.starts} /></td>
                        <td data-label="Errors"><Count n={t.errors} /></td>
                        <td data-label="Hit sign-in"><Count n={t.auth_walls} /></td>
                        <td data-label="Sessions"><Count n={t.sessions} /></td>
                        <td data-label="Helpful" className={`${styles['cell--text']} ${toolVotes[t.tool] ? '' : styles.muted}`}>
                          {toolVotes[t.tool] ? `${formatInt(toolVotes[t.tool].yes)} yes, ${formatInt(toolVotes[t.tool].no)} no` : 'No votes'}
                        </td>
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
      </div>
    </>
  );
}
