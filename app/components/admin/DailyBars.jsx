// Horizontal bar chart for daily pageview series. One row per day.
import styles from '~/styles/modules/admin/DailyBars.module.css';
import { formatInt } from '~/utils/format';

export default function DailyBars({ series }) {
  if (!series || series.length === 0) return null;
  const max = Math.max(1, ...series.map((d) => d.pageviews));

  return (
    <div className={styles.chart}>
      {series.map((d) => {
        const pct = (d.pageviews / max) * 100;
        return (
          <div key={d.day} className={styles.row}>
            <span className={styles.day}>{d.day}</span>
            <span className={styles.bar}>
              <span className={styles.barFill} style={{ width: `${pct}%` }} />
            </span>
            <span className={styles.value}>{formatInt(d.pageviews)}</span>
            <span className={styles.sessions}>{d.sessions}</span>
          </div>
        );
      })}
    </div>
  );
}
