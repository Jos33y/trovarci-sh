import Sparkline from './Sparkline';
import TrendBadge from './TrendBadge';
import styles from '~/styles/modules/admin/KPICard.module.css';

/**
 * Top-of-overview KPI tile. Five fields, each load-bearing.
 *
 *   label    - all-caps mono micro-copy
 *   value    - the headline number, formatted by caller
 *   hint     - one supporting line ("2 sessions", "1 new account total")
 *   spark    - optional [{day, n}] series for the inline trace
 *   delta    - optional { pct: number, label?: string, inverse?: bool }
 *
 * Card never gates on data: any combination of optional fields renders.
 * The sparkline area collapses gracefully when data is empty.
 */
export default function KPICard({ label, value, hint, spark, delta, tone = 'accent' }) {
  return (
    <article className={styles.card}>
      <div className={styles.head}>
        <span className={styles.label}>{label}</span>
        {delta ? (
          <TrendBadge deltaPct={delta.pct} label={delta.label} inverse={delta.inverse} />
        ) : null}
      </div>

      <div className={styles.value}>{value}</div>

      <div className={styles.foot}>
        {hint ? <span className={styles.hint}>{hint}</span> : <span className={styles.hint}>&nbsp;</span>}
        {spark && spark.length > 0 ? (
          <div className={styles.spark}>
            <Sparkline data={spark} width={120} height={28} tone={tone} />
          </div>
        ) : null}
      </div>
    </article>
  );
}
