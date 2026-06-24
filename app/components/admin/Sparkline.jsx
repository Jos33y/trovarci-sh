// Line+area trace. Auto-scales to container; empty input renders a flat baseline strip.
import styles from '~/styles/modules/admin/Sparkline.module.css';

export default function Sparkline({ data = [], width = 120, height = 32, tone = 'accent' }) {
  const pts = Array.isArray(data) ? data : [];
  const n = pts.length;

  if (n === 0) {
    return <div className={styles.empty} style={{ width, height }} aria-hidden="true" />;
  }

  const values = pts.map((d) => Number.isFinite(d.n) ? d.n : 0);
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const range = max - min || 1;

  const stepX = n > 1 ? (width - 2) / (n - 1) : 0;
  const baseY = height - 1;

  const coords = values.map((v, i) => {
    const x = 1 + i * stepX;
    const y = 1 + ((max - v) / range) * (height - 2);
    return [x, y];
  });

  const linePath = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  const areaPath = `${linePath} L ${coords[coords.length - 1][0].toFixed(2)} ${baseY} L ${coords[0][0].toFixed(2)} ${baseY} Z`;

  const stroke = tone === 'success' ? 'var(--trov-success)'
               : tone === 'error'   ? 'var(--trov-error)'
               : 'var(--trov-accent)';

  const gradId = `spark-grad-${tone}`;

  return (
    <svg
      className={styles.svg}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
