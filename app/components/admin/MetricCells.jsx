// Table cells for the analytics reports, built to be read at a glance:
// a share bar under each row's label, dimmed zeros, and rates that show the count behind them.

import { formatInt } from '~/utils/format';
import styles from '~/styles/modules/admin/MetricCells.module.css';

// Row label with a thin bar showing this row's share of the largest row.
export function ShareLabel({ label, value, max, mono = false, tag = null, title }) {
  const width = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <span className={styles.share}>
      <span className={styles.shareTop}>
        <span className={`${styles.shareText} ${mono ? styles.mono : ''}`} title={title || label}>{label}</span>
        {tag ? <span className={`${styles.tag} ${styles[`tag_${tag}`] || ''}`}>{tag}</span> : null}
      </span>
      <span className={styles.shareTrack} aria-hidden="true">
        <span className={styles.shareFill} style={{ width: `${width}%` }} />
      </span>
    </span>
  );
}

// A plain count. Zero is dimmed so the rows with something in them stand out.
export function Count({ n }) {
  return <span className={n ? styles.num : `${styles.num} ${styles.zero}`}>{formatInt(n)}</span>;
}

// A count with its rate underneath: "3" over "27% of 11". Small samples stay honest.
export function Rate({ part, whole }) {
  if (!part) return <span className={`${styles.num} ${styles.zero}`}>0</span>;
  const pct = whole > 0 ? Math.round((part / whole) * 100) : 0;
  return (
    <span className={styles.rate}>
      <span className={styles.num}>{formatInt(part)}</span>
      <span className={styles.rateOf}>{pct}% of {formatInt(whole)}</span>
    </span>
  );
}

// A percentage with a short bar, for rates where the share matters more than the count.
// tone="bad" colours it as a warning once it passes half (for "left within 10s").
export function Meter({ part, whole, tone = 'good' }) {
  if (!whole) return <span className={`${styles.num} ${styles.zero}`}>-</span>;
  const pct = Math.round((part / whole) * 100);
  const warn = tone === 'bad' ? pct >= 50 : false;
  return (
    <span className={styles.meter} title={`${formatInt(part)} of ${formatInt(whole)}`}>
      <span className={`${styles.num} ${part ? '' : styles.zero}`}>{pct}%</span>
      <span className={styles.meterTrack} aria-hidden="true">
        <span className={`${styles.meterFill} ${warn ? styles.meterWarn : ''}`} style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}

// One plain sentence above a table that says what the table shows.
export function Takeaway({ children }) {
  return <p className={styles.takeaway}>{children}</p>;
}
