import { Link, Form, useLoaderData, useNavigate } from 'react-router';
import { requireAdmin, adminListJobs } from '~/utils/admin.server';
import EmptyState from '~/components/admin/EmptyState';
import styles from '~/styles/modules/routes/admin.module.css';

export const meta = () => [
  { title: 'Jobs | Trovarcis Admin' },
  { name: 'robots', content: 'noindex, nofollow' },
];

const STATUS_OPTS = ['', 'pending', 'processing', 'complete', 'partial', 'failed', 'cancelled'];
const KIND_OPTS = ['', 'email', 'phone'];

export async function loader({ request }) {
  await requireAdmin(request);
  const url = new URL(request.url);
  const status = url.searchParams.get('status') || null;
  const kind   = url.searchParams.get('kind')   || null;
  const page   = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = 50;
  const offset = (page - 1) * limit;

  const jobs = await adminListJobs({
    status: status || null,
    kind: kind || null,
    limit, offset,
  });

  return { jobs, status: status || '', kind: kind || '', page };
}

const STATUS_BADGE = {
  complete:   'badgeSuccess',
  partial:    'badgeWarning',
  pending:    'badgeNeutral',
  processing: 'badgeWarning',
  failed:     'badgeError',
  cancelled:  'badgeNeutral',
};

function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 16);
}

function progressPct(processed, total) {
  if (!total || total === 0) return 0;
  return Math.min(100, Math.round((processed / total) * 100));
}

export default function AdminJobs() {
  const { jobs, status, kind, page } = useLoaderData();
  const navigate = useNavigate();

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Verification jobs</h1>
          <p className={styles.pageSubtitle}>Page {page} - {jobs.length} {jobs.length === 1 ? 'row' : 'rows'}</p>
        </div>
      </header>

      <Form method="get" className={styles.filters}>
        <div className={styles.filterField}>
          <label className={styles.filterLabel} htmlFor="kind">Kind</label>
          <select id="kind" name="kind" defaultValue={kind} className={styles.filterSelect}>
            {KIND_OPTS.map((v) => <option key={v} value={v}>{v || 'all'}</option>)}
          </select>
        </div>
        <div className={styles.filterField}>
          <label className={styles.filterLabel} htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={status} className={styles.filterSelect}>
            {STATUS_OPTS.map((v) => <option key={v} value={v}>{v || 'all'}</option>)}
          </select>
        </div>
        <button type="submit" className={styles.formButton}>Apply</button>
      </Form>

      {jobs.length === 0 ? (
        <EmptyState
          variant="data"
          title="No jobs match"
          body="Adjust kind or status filters, or wait for the next bulk verification run."
        />
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>When</th>
                <th>User</th>
                <th>Kind</th>
                <th>Progress</th>
                <th className={styles['th--right']}>Credits</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => {
                const pct = progressPct(j.processed_items, j.total_items);
                return (
                  <tr
                    key={j.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/admin/jobs/${j.id}`)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        navigate(`/admin/jobs/${j.id}`);
                      }
                    }}
                    role="link"
                    tabIndex={0}
                    aria-label={`Open job ${j.id}`}
                  >
                    <td data-label="When" className={styles['td--mono']}>{formatDate(j.created_at)}</td>
                    <td data-label="User" onClick={(ev) => ev.stopPropagation()}>
                      {j.user_id
                        ? <Link to={`/admin/users/${j.user_id}`} className={styles.rowLink}>{j.user_email || '-'}</Link>
                        : <span className={styles['td--muted']}>-</span>}
                    </td>
                    <td data-label="Kind">{j.kind}</td>
                    <td data-label="Progress" className={styles['td--mono']}>
                      {j.processed_items.toLocaleString()} / {j.total_items.toLocaleString()}
                      <span style={{ color: 'var(--trov-text-muted)', marginLeft: 6 }}>· {pct}%</span>
                    </td>
                    <td data-label="Credits" className={styles['td--num']}>{j.credits_charged.toLocaleString()}</td>
                    <td data-label="Status">
                      <span className={`${styles.badge} ${styles[STATUS_BADGE[j.status] || 'badgeNeutral']}`}>{j.status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.pagination}>
        <span className={styles.pageNote}>Page {page}</span>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          {page > 1 ? (
            <Link to={`?${new URLSearchParams({ kind, status, page: String(page - 1) }).toString()}`}
                  className={`${styles.formButton} ${styles['formButton--ghost']}`}>Previous</Link>
          ) : null}
          {jobs.length === 50 ? (
            <Link to={`?${new URLSearchParams({ kind, status, page: String(page + 1) }).toString()}`}
                  className={`${styles.formButton} ${styles['formButton--ghost']}`}>Next</Link>
          ) : null}
        </div>
      </div>
    </>
  );
}
