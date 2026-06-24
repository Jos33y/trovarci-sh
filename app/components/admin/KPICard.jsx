// KPI tile. Variants: default | hero | alert | snapshot.
import Sparkline from './Sparkline';
import TrendBadge from './TrendBadge';
import styles from '~/styles/modules/admin/KPICard.module.css';

export default function KPICard({
  label, value, hint, icon: Icon, spark, delta, tone = 'accent',
  variant = 'default', snapshot,
}) {
  const variantCls = styles[`v_${variant}`] || '';

  return (
    <article className={`${styles.card} ${variantCls}`}>
      <div className={styles.head}>
        <div className={styles.headLeft}>
          {Icon ? (
            <span className={styles.icon} aria-hidden="true">
              <Icon size={14} />
            </span>
          ) : null}
          <span className={styles.label}>{label}</span>
        </div>
        {delta ? <TrendBadge deltaPct={delta.pct} inverse={delta.inverse} /> : null}
      </div>

      {variant === 'snapshot' ? (
        <div className={styles.snapshot}>
          {snapshot && snapshot !== 'XX' ? (
            <img
              src={`https://flagcdn.com/w80/${snapshot.toLowerCase()}.png`}
              alt=""
              width="32"
              height="24"
              loading="lazy"
              className={styles.flag}
            />
          ) : (
            <span className={styles.flagFallback} aria-hidden="true">?</span>
          )}
          <span className={styles.snapshotCode}>{snapshot || '-'}</span>
        </div>
      ) : (
        <div className={styles.value}>{value}</div>
      )}

      <div className={styles.foot}>
        {hint ? <span className={styles.hint}>{hint}</span> : <span className={styles.hint}>&nbsp;</span>}
        {spark && spark.length > 0 ? (
          <div className={styles.spark}>
            <Sparkline data={spark} width={120} height={26} tone={tone} />
          </div>
        ) : null}
      </div>
    </article>
  );
}
