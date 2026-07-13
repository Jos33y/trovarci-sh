// Revenue area chart. Confirmed (gold) over failed (red, low opacity). Hover crosshair + tooltip.
import { useState, useRef, useId } from 'react';
import styles from '~/styles/modules/admin/AreaChart.module.css';
import { formatInt } from '~/utils/format';

const W = 760;
const H = 240;
const PAD_L = 48;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 32;

function formatCents(c) { return '$' + (c / 100).toFixed(2); }
function shortDay(iso) { return iso ? iso.slice(5) : ''; }

export default function AreaChart({ data = [] }) {
  const id = useId().replace(/:/g, '');
  const [hover, setHover] = useState(null);
  const wrapRef = useRef(null);

  if (!data || data.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>No revenue yet</p>
        <p className={styles.emptySub}>Your first confirmed payment will plot here.</p>
      </div>
    );
  }

  const totalConfirmed = data.reduce((s, d) => s + (d.confirmed_cents || 0), 0);
  const totalFailed    = data.reduce((s, d) => s + (d.failed_cents    || 0), 0);
  const allZero = totalConfirmed === 0 && totalFailed === 0;

  const max = Math.max(1, ...data.map((d) => Math.max(d.confirmed_cents || 0, d.failed_cents || 0)));

  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;
  const xAt = (i) => PAD_L + i * stepX;
  const yAt = (v) => PAD_T + innerH - (v / max) * innerH;

  const buildPath = (key) => {
    if (data.length === 0) return '';
    const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(2)} ${yAt(d[key] || 0).toFixed(2)}`).join(' ');
    const closeY = (PAD_T + innerH).toFixed(2);
    return `${line} L ${xAt(data.length - 1).toFixed(2)} ${closeY} L ${xAt(0).toFixed(2)} ${closeY} Z`;
  };

  const buildLine = (key) => data.map((d, i) =>
    `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(2)} ${yAt(d[key] || 0).toFixed(2)}`
  ).join(' ');

  const gridSteps = 4;
  const gridLines = [];
  for (let i = 0; i <= gridSteps; i++) {
    const v = (max / gridSteps) * i;
    const y = yAt(v);
    gridLines.push({ y, label: '$' + formatInt(Math.round(v / 100)) });
  }

  const tickEvery = Math.max(1, Math.ceil(data.length / 8));

  const onMove = (e) => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const xRatio = (px / rect.width) * W;
    const i = Math.round((xRatio - PAD_L) / Math.max(1, stepX));
    const clamped = Math.max(0, Math.min(data.length - 1, i));
    setHover(clamped);
  };

  const onLeave = () => setHover(null);
  const hoverDay = hover != null ? data[hover] : null;

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <div>
          <h3 className={styles.title}>Revenue</h3>
          <p className={styles.sub}>Last {data.length} days</p>
        </div>
        <div className={styles.totals}>
          <span className={styles.totalConfirmed}>{formatCents(totalConfirmed)}</span>
          {totalFailed > 0 ? <span className={styles.totalFailed}>{formatCents(totalFailed)} failed</span> : null}
        </div>
      </header>

      <div ref={wrapRef} className={styles.chartWrap} onMouseMove={onMove} onMouseLeave={onLeave}>
        <svg
          className={styles.svg}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Revenue area chart, ${data.length} days, total ${formatCents(totalConfirmed)}`}
        >
          <defs>
            <linearGradient id={`ac-confirmed-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="var(--trov-accent)" stopOpacity="0.55" />
              <stop offset="100%" stopColor="var(--trov-accent)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={`ac-failed-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="var(--trov-error)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--trov-error)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {gridLines.map((g, i) => (
            <g key={i}>
              <line x1={PAD_L} x2={W - PAD_R} y1={g.y} y2={g.y} stroke="var(--trov-border)" strokeWidth="1" strokeDasharray="2 4" />
              <text x={PAD_L - 8} y={g.y + 4} textAnchor="end" className={styles.axisLabel}>{g.label}</text>
            </g>
          ))}

          {totalFailed > 0 ? (
            <>
              <path d={buildPath('failed_cents')} fill={`url(#ac-failed-${id})`} />
              <path d={buildLine('failed_cents')} fill="none" stroke="var(--trov-error)" strokeWidth="1.25" strokeOpacity="0.65" />
            </>
          ) : null}

          <path d={buildPath('confirmed_cents')} fill={`url(#ac-confirmed-${id})`} />
          <path d={buildLine('confirmed_cents')} fill="none" stroke="var(--trov-accent)" strokeWidth="2" />

          {data.map((d, i) => i % tickEvery === 0 ? (
            <text key={i} x={xAt(i)} y={H - 8} textAnchor="middle" className={styles.axisLabel}>{shortDay(d.day)}</text>
          ) : null)}

          {hoverDay ? (
            <g pointerEvents="none">
              <line x1={xAt(hover)} x2={xAt(hover)} y1={PAD_T} y2={H - PAD_B} stroke="var(--trov-text-muted)" strokeWidth="1" strokeDasharray="2 3" />
              <circle cx={xAt(hover)} cy={yAt(hoverDay.confirmed_cents || 0)} r="4" fill="var(--trov-accent)" stroke="var(--trov-bg)" strokeWidth="2" />
            </g>
          ) : null}

          {allZero ? (
            <text x={W / 2} y={H / 2} textAnchor="middle" className={styles.zeroLabel}>
              No payments in this window
            </text>
          ) : null}
        </svg>

        {hoverDay ? (
          <div
            className={styles.tooltip}
            style={{ left: `${(xAt(hover) / W) * 100}%` }}
            role="status"
          >
            <div className={styles.tipDay}>{hoverDay.day}</div>
            <div className={styles.tipRow}><span>Confirmed</span><span>{formatCents(hoverDay.confirmed_cents || 0)}</span></div>
            {hoverDay.count_confirmed > 0 ? (
              <div className={styles.tipMeta}>{hoverDay.count_confirmed} payment{hoverDay.count_confirmed === 1 ? '' : 's'}</div>
            ) : null}
            {(hoverDay.failed_cents || 0) > 0 ? (
              <div className={styles.tipRow}><span>Failed</span><span>{formatCents(hoverDay.failed_cents || 0)}</span></div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
