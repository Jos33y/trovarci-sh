// Conversion funnel - horizontal bars sized by % of top-of-funnel.
// Each step gets a bar, value, and percent-of-top.
// Conversion arrows show drop / gain between consecutive steps.
import styles from '~/styles/modules/admin/Funnel.module.css';
import { formatInt } from '~/utils/format';

export default function Funnel({ steps = [] }) {
  if (!steps || steps.length === 0) {
    return (
      <div className={styles.wrap}>
        <header className={styles.head}>
          <h3 className={styles.title}>Conversion funnel</h3>
        </header>
        <p className={styles.empty}>No funnel data yet. Steps populate as users move from pageview to payment.</p>
      </div>
    );
  }

  const top = steps[0].sessions || 1;

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <h3 className={styles.title}>Conversion funnel</h3>
        <p className={styles.sub}>{formatInt(top)} at top · last 7 days</p>
      </header>

      <ol className={styles.steps}>
        {steps.map((step, i) => {
          const next = steps[i + 1];
          const pct = top > 0 ? (step.sessions / top) * 100 : 0;
          const hasConv = next != null;
          const conv = hasConv && step.sessions > 0
            ? Math.round((next.sessions / step.sessions) * 100)
            : null;
          const drop = hasConv ? step.sessions - next.sessions : 0;

          return (
            <li key={step.event_type} className={styles.step}>
              <div className={styles.row}>
                <span className={styles.label}>{step.label || step.event_type}</span>
                <div className={styles.barTrack} aria-hidden="true">
                  <span
                    className={styles.bar}
                    style={{ width: `${Math.max(pct, 1.5)}%` }}
                  />
                  <span className={styles.value}>{formatInt(step.sessions)}</span>
                </div>
                <span className={styles.pct}>{pct.toFixed(0)}%</span>
              </div>

              {hasConv ? (
                <div className={styles.conv}>
                  <span className={styles.arrow} aria-hidden="true">
                    {drop > 0 ? '↓' : drop < 0 ? '↑' : '·'}
                  </span>
                  <span className={styles.convText}>
                    {drop > 0 ? `${formatInt(drop)} dropped` : null}
                    {drop < 0 ? `${formatInt(Math.abs(drop))} gained` : null}
                    {drop === 0 ? 'no change' : null}
                    {conv != null ? <> · <span className={styles.convPct}>{conv}% continue</span></> : null}
                  </span>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
