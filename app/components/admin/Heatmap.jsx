// 7x24 activity heatmap. Empty cells render at baseline so the grid framework reads.
import { useState, useMemo } from 'react';
import styles from '~/styles/modules/admin/Heatmap.module.css';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function Heatmap({ cells = [] }) {
  const [active, setActive] = useState(null);

  const grid = useMemo(() => {
    const g = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
    let max = 0;
    for (const c of cells) {
      if (c.dow >= 0 && c.dow <= 6 && c.hour >= 0 && c.hour <= 23) {
        g[c.dow][c.hour] = c.n;
        if (c.n > max) max = c.n;
      }
    }
    return { g, max: Math.max(1, max) };
  }, [cells]);

  const cellOpacity = (n) => n === 0 ? 0 : 0.18 + (n / grid.max) * 0.72;

  const onCellEnter = (dow, hour, n) => setActive({ dow, hour, n });
  const onCellLeave = () => setActive(null);

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <h3 className={styles.title}>Activity heatmap</h3>
        <p className={styles.sub}>Pageviews by hour and day, last 7 days</p>
      </header>

      <div className={styles.readout} aria-live="polite">
        {active
          ? <span><span className={styles.readoutDay}>{DAYS[active.dow]} {String(active.hour).padStart(2, '0')}:00</span> · <span className={styles.readoutN}>{active.n} view{active.n === 1 ? '' : 's'}</span></span>
          : <span className={styles.readoutHint}>Hover or tap a cell</span>}
      </div>

      <div className={styles.desktopGrid}>
        <div className={styles.dayCol}>
          {DAYS.map((d) => <span key={d} className={styles.dayLabel}>{d}</span>)}
        </div>
        <div className={styles.cellsWrap}>
          <div className={styles.cellsGrid} role="presentation">
            {grid.g.map((row, dow) => (
              row.map((n, hour) => (
                <button
                  key={`${dow}-${hour}`}
                  type="button"
                  className={`${styles.cell} ${n === 0 ? styles.cellEmpty : ''}`}
                  style={n > 0 ? { background: `rgba(212, 168, 67, ${cellOpacity(n)})` } : undefined}
                  onMouseEnter={() => onCellEnter(dow, hour, n)}
                  onMouseLeave={onCellLeave}
                  onFocus={() => onCellEnter(dow, hour, n)}
                  onBlur={onCellLeave}
                  aria-label={`${DAYS[dow]} ${hour}:00 - ${n} views`}
                />
              ))
            ))}
          </div>
          <div className={styles.hourAxis}>
            <span>0</span><span>6</span><span>12</span><span>18</span><span>23</span>
          </div>
        </div>
      </div>

      <div className={styles.mobileGrid}>
        <div className={styles.mobileDayRow}>
          <span className={styles.mobileSpacer} />
          {DAYS_SHORT.map((d, i) => <span key={i} className={styles.mobileDayLabel}>{d}</span>)}
        </div>
        {Array.from({ length: 24 }, (_, hour) => (
          <div key={hour} className={styles.mobileHourRow}>
            <span className={styles.mobileHourLabel}>{hour % 6 === 0 ? String(hour).padStart(2, '0') : ''}</span>
            {grid.g.map((row, dow) => (
              <button
                key={`m-${dow}-${hour}`}
                type="button"
                className={`${styles.mobileCell} ${row[hour] === 0 ? styles.cellEmpty : ''}`}
                style={row[hour] > 0 ? { background: `rgba(212, 168, 67, ${cellOpacity(row[hour])})` } : undefined}
                onClick={() => onCellEnter(dow, hour, row[hour])}
                aria-label={`${DAYS[dow]} ${hour}:00 - ${row[hour]} views`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
