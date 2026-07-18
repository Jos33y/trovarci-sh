// Right-rail timeline. SSR initial + 30s fetcher refresh while tab visible.
import { useEffect, useState } from 'react';
import { Link, useFetcher } from 'react-router';
import ActivityIcon from './ActivityIcon';
import styles from '~/styles/modules/admin/LiveFeed.module.css';

const KIND_LABEL = {
  signup:       'New signup',
  payment:      'Payment',
  error:        'Error',
  admin_action: 'Admin action',
};

// Deterministic absolute date for SSR - matches "2026-07-14" format so hydration is stable.
function absoluteDate(iso) {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 10);
}

// Client-only relative time. Computes ms diff on mount, refreshes every 30s.
function computeAgo(iso) {
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
  return absoluteDate(iso);
}

// Renders absolute date server-side, swaps to relative on client. Prevents Date.now() hydration mismatch.
function TimeAgo({ iso }) {
  const [display, setDisplay] = useState(() => absoluteDate(iso));
  useEffect(() => {
    if (!iso) return undefined;
    setDisplay(computeAgo(iso));
    const t = setInterval(() => setDisplay(computeAgo(iso)), 30_000);
    return () => clearInterval(t);
  }, [iso]);
  return <span>{display}</span>;
}

export default function LiveFeed({ initial = [], refreshPath = '/admin' }) {
  const fetcher = useFetcher();

  const items = Array.isArray(fetcher.data?.recentActivity)
    ? fetcher.data.recentActivity
    : initial;

  useEffect(() => {
    const id = setInterval(() => {
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
                  <span className={styles.timeAgo}><TimeAgo iso={it.created_at} /></span>
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
