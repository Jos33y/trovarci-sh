import styles from '~/styles/modules/admin/Funnel.module.css';

const W = 600;
const STEP_H = 64;     // body of one step
const GAP_H = 28;      // space between steps for conversion label
const PAD_X = 80;
const MIN_W = 60;      // minimum trapezoid top/bottom width so labels fit

/**
 * Real funnel - trapezoid sections narrowing from top-of-funnel down.
 * Each step's width is proportional to (sessions / topOfFunnel.sessions).
 * The drop-off between consecutive steps is a visible width delta;
 * conversion % is rendered between trapezoids.
 *
 * @param {{event_type: string, events: number, sessions: number, users: number, label?: string}[]} steps
 *
 * Steps are passed in funnel order (top-of-funnel first). Empty steps still
 * render with a tiny stub so the user sees the drop point as data, not gaps.
 */
export default function Funnel({ steps = [] }) {
  if (!steps || steps.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>No funnel data yet</p>
        <p className={styles.emptySub}>Funnel populates as users move through pageview to payment.</p>
      </div>
    );
  }

  const top = steps[0].sessions || 1;
  const totalH = steps.length * STEP_H + (steps.length - 1) * GAP_H;
  const innerW = W - PAD_X * 2;

  const widthFor = (sessions) => {
    const ratio = top === 0 ? 0 : (sessions / top);
    return Math.max(MIN_W, ratio * innerW);
  };

  return (
    <div className={styles.wrap}>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${W} ${totalH}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Conversion funnel with ${steps.length} steps`}
      >
        {steps.map((step, i) => {
          const next = steps[i + 1];
          const yTop = i * (STEP_H + GAP_H);
          const yBot = yTop + STEP_H;

          const wTop = widthFor(step.sessions);
          const wBot = next ? widthFor(next.sessions) : wTop * 0.7;

          const xTopL = (W - wTop) / 2;
          const xTopR = xTopL + wTop;
          const xBotL = (W - wBot) / 2;
          const xBotR = xBotL + wBot;

          const path = `M ${xTopL} ${yTop} L ${xTopR} ${yTop} L ${xBotR} ${yBot} L ${xBotL} ${yBot} Z`;

          const conv = next && step.sessions > 0
            ? Math.round((next.sessions / step.sessions) * 100)
            : null;

          const dropoff = next && step.sessions > 0
            ? step.sessions - next.sessions
            : 0;

          return (
            <g key={step.event_type}>
              <path
                d={path}
                fill="var(--trov-accent)"
                fillOpacity={0.16 + (1 - i / Math.max(1, steps.length - 1)) * 0.18}
                stroke="var(--trov-accent)"
                strokeOpacity="0.6"
                strokeWidth="1"
              />

              {/* Step label inside the trapezoid */}
              <text
                x={W / 2}
                y={yTop + STEP_H / 2 - 4}
                textAnchor="middle"
                className={styles.stepLabel}
              >
                {step.label || step.event_type}
              </text>
              <text
                x={W / 2}
                y={yTop + STEP_H / 2 + 14}
                textAnchor="middle"
                className={styles.stepValue}
              >
                {step.sessions.toLocaleString()} sessions
              </text>

              {/* Conversion + drop-off between this and next */}
              {conv != null ? (
                <g>
                  <text
                    x={W / 2}
                    y={yBot + GAP_H / 2 + 4}
                    textAnchor="middle"
                    className={styles.convLabel}
                  >
                    {conv}% continue
                  </text>
                  {dropoff > 0 ? (
                    <text
                      x={W / 2}
                      y={yBot + GAP_H / 2 + 18}
                      textAnchor="middle"
                      className={styles.dropoff}
                    >
                      -{dropoff.toLocaleString()} dropped
                    </text>
                  ) : null}
                </g>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
