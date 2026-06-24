// Ranked country traffic bars with flag chips. 'XX' renders as 'unknown' fallback.
import styles from '~/styles/modules/admin/CountryMap.module.css';

export default function CountryMap({ rows = [], limit = 10 }) {
  if (!rows || rows.length === 0) {
    return (
      <div className={styles.wrap}>
        <header className={styles.head}>
          <h3 className={styles.title}>Top countries</h3>
        </header>
        <p className={styles.empty}>No country data yet.</p>
      </div>
    );
  }

  const top = rows.slice(0, limit);
  const max = Math.max(1, ...top.map((r) => r.n));
  const total = rows.reduce((s, r) => s + (r.n || 0), 0);

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <h3 className={styles.title}>Top countries</h3>
        <p className={styles.sub}>{total.toLocaleString()} pageviews · {rows.length} countries</p>
      </header>

      <ul className={styles.list}>
        {top.map((r) => {
          const pct = (r.n / max) * 100;
          const isUnknown = r.country === 'XX';
          return (
            <li key={r.country} className={styles.row}>
              <span className={styles.flag} aria-hidden="true">
                {isUnknown ? (
                  <span className={styles.flagFallback}>?</span>
                ) : (
                  <img
                    src={`https://flagcdn.com/w40/${r.country.toLowerCase()}.png`}
                    alt=""
                    width="20"
                    height="15"
                    loading="lazy"
                  />
                )}
              </span>
              <span className={styles.code}>{r.country}</span>
              <span className={styles.barTrack}>
                <span className={styles.bar} style={{ width: `${pct}%` }} />
              </span>
              <span className={styles.count}>{r.n.toLocaleString()}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
