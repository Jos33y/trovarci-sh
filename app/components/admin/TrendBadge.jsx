// Percent-change pill - sign-flipped arrow + tone. No inline label (caller's card label provides context).
import styles from '~/styles/modules/admin/TrendBadge.module.css';

export default function TrendBadge({ deltaPct, inverse = false }) {
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
    </span>
  );
}
