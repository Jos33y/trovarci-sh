// Reading: per page, how long people read, how far they got, what they did next, and whether it helped.

import { Link, useLoaderData } from 'react-router';
import { requireAdmin, adminPageEngagement, adminHelpfulNotes } from '~/utils/admin.server';
import KPICard from '~/components/admin/KPICard';
import EmptyState from '~/components/admin/EmptyState';
import { ShareLabel, Count, Meter, Takeaway } from '~/components/admin/MetricCells';
import styles from '~/styles/modules/routes/admin';
import { formatInt } from '~/utils/format';

export const meta = () => [
  { title: 'Reading | Trovarcis Admin' },
  { name: 'robots', content: 'noindex, nofollow' },
];

export async function loader({ request }) {
  await requireAdmin(request);
  const url = new URL(request.url);
  const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get('days') || '30', 10)));
  const [pages, notes] = await Promise.all([adminPageEngagement({ days }), adminHelpfulNotes({ days: 90 })]);
  return { pages, notes, days };
}

const pct = (part, whole) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '-');

function duration(seconds) {
  if (seconds == null) return '-';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

// What readers did next, as one short line: "2 to a tool, 1 to Sender".
function nextSteps(p) {
  const parts = [];
  if (p.to_tool) parts.push(`${formatInt(p.to_tool)} to a tool`);
  if (p.to_sender) parts.push(`${formatInt(p.to_sender)} to Sender`);
  if (p.to_signup) parts.push(`${formatInt(p.to_signup)} to sign up`);
  const other = p.acted - p.to_tool - p.to_sender - p.to_signup;
  if (other > 0) parts.push(`${formatInt(other)} to another page`);
  return parts.join(', ');
}

// The page most worth looking at first: most views among pages where most people left fast.
function worstPage(pages) {
  return pages
    .filter((p) => p.measured >= 3 && p.left_fast / p.measured >= 0.5)
    .sort((a, b) => b.measured - a.measured)[0] || null;
}

const date = (iso) => new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' }).format(new Date(iso));

export default function AdminReading() {
  const { pages, notes, days } = useLoaderData();
  const measured = pages.reduce((n, p) => n + p.measured, 0);
  const reachedEnd = pages.reduce((n, p) => n + p.reached_end, 0);
  const acted = pages.reduce((n, p) => n + p.acted, 0);
  const yes = pages.reduce((n, p) => n + p.helpful_yes, 0);
  const no = pages.reduce((n, p) => n + p.helpful_no, 0);
  const worst = worstPage(pages);

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Reading</h1>
          <p className={styles.pageSubtitle}>Time spent reading, how far people got and what they did next, last {days} days</p>
        </div>
        <div className={styles.pageHeaderActions}>
          {[7, 30, 90].map((d) => (
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

      <div className={styles.pageFlow}>
        <div className={styles.kpiStrip3}>
          <KPICard label="Reached the end" value={pct(reachedEnd, measured)} hint={`${formatInt(measured)} page views measured`} />
          <KPICard label="Did something next" value={pct(acted, measured)} hint="Opened a tool, Sender, signup or another page" />
          <KPICard label="Helpful" value={yes + no > 0 ? pct(yes, yes + no) : '-'} hint={`${formatInt(yes)} yes, ${formatInt(no)} no`} />
        </div>

        {pages.length === 0 ? (
          <EmptyState title="No page views yet" body="Reading data appears here as visitors read pages." />
        ) : (
          <section className={styles.panel}>
            <header className={styles.panelHead}>
              <h2 className={styles.panelTitle}>Pages</h2>
              <span className={styles.panelSub}>most viewed first</span>
            </header>
            <Takeaway>
              {worst
                ? <>Start with <strong>{worst.path}</strong>: {pct(worst.left_fast, worst.measured)} of its {formatInt(worst.measured)} readers left within 10 seconds.</>
                : 'No page has most of its readers leaving within 10 seconds.'}
              {' '}Reached end means they scrolled 75% of the page or more.
            </Takeaway>
            <div className={styles.tableWrap}>
              <table className={`${styles.table} ${styles['table--report']}`}>
                <thead>
                  <tr>
                    <th>Page</th>
                    <th>Views</th>
                    <th title="Half of readers spent less than this with the page visible">Median read</th>
                    <th title="Share of readers who left within 10 seconds">Left in 10s</th>
                    <th title="Share of readers who scrolled 75% of the page or more">Reached end</th>
                    <th className={styles['cell--text']} title="The first thing readers did after reading">Then</th>
                    <th className={styles['cell--text']} title="Answers to: Did this answer your question?">Helpful</th>
                  </tr>
                </thead>
                <tbody>
                  {pages.map((p) => {
                    const next = nextSteps(p);
                    const votes = p.helpful_yes + p.helpful_no;
                    return (
                      <tr key={p.path}>
                        <td data-label="Page"><ShareLabel label={p.path} value={p.views} max={pages[0].views} mono /></td>
                        <td data-label="Views"><Count n={p.views} /></td>
                        <td data-label="Median read" className={styles['td--num']}>{duration(p.median_seconds)}</td>
                        <td data-label="Left in 10s"><Meter part={p.left_fast} whole={p.measured} tone="bad" /></td>
                        <td data-label="Reached end"><Meter part={p.reached_end} whole={p.measured} /></td>
                        <td data-label="Then" className={`${styles['cell--text']} ${next ? styles['td--muted'] : styles.muted}`}>{next || 'Nothing'}</td>
                        <td data-label="Helpful" className={`${styles['cell--text']} ${votes ? '' : styles.muted}`}>
                          {votes ? `${formatInt(p.helpful_yes)} yes, ${formatInt(p.helpful_no)} no` : 'No votes'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className={styles.panel}>
          <header className={styles.panelHead}>
            <h2 className={styles.panelTitle}>What readers said was missing</h2>
            <span className={styles.panelSub}>notes left after a No, last 90 days</span>
          </header>
          {notes.length === 0 ? (
            <EmptyState title="No notes yet" body="When a reader answers No and says what they were looking for, it shows here." />
          ) : (
            <ul className={styles.noteList}>
              {notes.map((n, i) => (
                <li key={i} className={styles.noteItem}>
                  <p className={styles.noteText}>{n.note}</p>
                  <p className={styles.noteMeta}>{n.path} · {date(n.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
