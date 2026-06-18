import styles from '~/styles/modules/admin/TrendBadge.module.css';

/**
 * Small percent-change pill rendered next to the KPI value. Sign-flips
 * the arrow + colour automatically; "lower is better" metrics (e.g. errors)
 * pass `inverse` to flip success/error colours.
 *
 * @param {object} props
 * @param {number} props.deltaPct
 * @param {string} [props.label]   e.g. "vs prev 7d"
 * @param {boolean} [props.inverse]  true → negative is good (errors)
 */
export default function TrendBadge({ deltaPct, label, inverse = false }) {
  if (!Number.isFinite(deltaPct)) {
    return <span className={`${styles.badge} ${styles.neutral}`}>-</span>;
  }
  const isUp = deltaPct > 0;
  const isFlat = deltaPct === 0;

  const tone = isFlat ? 'neutral'
    : (isUp ? (inverse ? 'bad'  : 'good')
            : (inverse ? 'good' : 'bad'));

  const arrow = isFlat ? '·' : (isUp ? '▲' : '▼');
  const sign = isUp && !isFlat ? '+' : '';

  return (
    <span className={`${styles.badge} ${styles[tone]}`}>
      <span className={styles.arrow} aria-hidden="true">{arrow}</span>
      {sign}{deltaPct}%
      {label ? <span className={styles.label}>{label}</span> : null}
    </span>
  );
}
