// Horizontal bar chart for daily pageview series. One row per day, with labelled columns.
import styles from '~/styles/modules/admin/DailyBars.module.css';
import { formatInt } from '~/utils/format';

const dayLabel = (iso) =>
  new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${iso}T00:00:00Z`));

export default function DailyBars({ series }) {
  if (!series || series.length === 0) return null;
  const max = Math.max(1, ...series.map((d) => d.pageviews));

  return (
    <div className={styles.chart} role="table" aria-label="Pageviews and sessions per day">
      <div className={`${styles.row} ${styles.head}`} role="row">
        <span role="columnheader">Day</span>
        <span role="columnheader" className={styles.barHead}>Pageviews</span>
        <span role="columnheader" className={styles.num}>Pageviews</span>
        <span role="columnheader" className={styles.num}>Sessions</span>
      </div>
      {series.map((d) => (
        <div key={d.day} className={styles.row} role="row">
          <span className={styles.day} role="cell">{dayLabel(d.day)}</span>
          <span className={styles.bar} role="cell" aria-hidden="true">
            <span className={styles.barFill} style={{ width: `${(d.pageviews / max) * 100}%` }} />
          </span>
          <span className={`${styles.num} ${styles.value}`} role="cell">{formatInt(d.pageviews)}</span>
          <span className={`${styles.num} ${styles.sessions}`} role="cell">{formatInt(d.sessions)}</span>
        </div>
      ))}
    </div>
  );
}
