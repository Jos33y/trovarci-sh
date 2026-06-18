import { useEffect } from 'react';
import { Link, useFetcher } from 'react-router';
import ActivityIcon from './ActivityIcon';
import styles from '~/styles/modules/admin/LiveFeed.module.css';

const KIND_LABEL = {
  signup:        'New signup',
  payment:       'Payment',
  error:         'Error',
  admin_action:  'Admin action',
};

function timeAgo(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'now';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

/**
 * Right-rail interleaved timeline. Source rows come from the loader
 * (initial server-side render); a fetcher polls /admin every 30s and
 * the parent reloads. The fetcher avoids a hard navigation - we use
 * useFetcher().load() against the current page so the loader's other
 * data refreshes too.
 *
 * Row click = drill-in via the row's Link. Whole row is the hit zone;
 * tap target is the full row height (44px+) on mobile.
 *
 * @param {object[]} initial      [{kind, created_at, summary, link, severity?}]
 * @param {string} [refreshPath]  defaults to current admin path; pass to override
 */
export default function LiveFeed({ initial = [], refreshPath = '/admin' }) {
  const fetcher = useFetcher();

  // The fetcher mirrors the route data. If the polled response carries
  // `recentActivity`, replace the local list. Otherwise show the SSR list.
  const items = Array.isArray(fetcher.data?.recentActivity)
    ? fetcher.data.recentActivity
    : initial;

  useEffect(() => {
    const id = setInterval(() => {
      // Only poll when tab is visible. Saves DB hits on backgrounded tabs.
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetcher.load(refreshPath);
      }
    }, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshPath]);

  if (!items || items.length === 0) {
    return (
      <aside className={styles.wrap}>
        <header className={styles.head}>
          <h3 className={styles.title}>Live feed</h3>
          <span className={styles.dot} aria-label="live" />
        </header>
        <p className={styles.empty}>Activity will appear here.</p>
      </aside>
    );
  }

  return (
    <aside className={styles.wrap}>
      <header className={styles.head}>
        <h3 className={styles.title}>Live feed</h3>
        <span className={`${styles.dot} ${fetcher.state !== 'idle' ? styles.dotActive : ''}`} aria-label="live" />
      </header>

      <ol className={styles.list}>
        {items.map((it, i) => (
          <li key={`${it.kind}-${it.created_at}-${i}`} className={styles.item}>
            <Link to={it.link || '#'} className={styles.row}>
              <ActivityIcon kind={it.kind} size={28} />
              <div className={styles.body}>
                <div className={styles.line1}>
                  <span className={styles.kindLabel}>{KIND_LABEL[it.kind] || it.kind}</span>
                  <span className={styles.timeAgo}>{timeAgo(it.created_at)}</span>
                </div>
                <div className={styles.summary}>{it.summary}</div>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </aside>
  );
}
