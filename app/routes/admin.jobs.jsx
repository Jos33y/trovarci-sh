// Admin verification jobs list - filterable by kind + status, click-through to detail.
import { Link, Form, useLoaderData, useNavigate, useSubmit } from 'react-router';
import { requireAdmin, adminListJobs } from '~/utils/admin.server';
import EmptyState from '~/components/admin/EmptyState';
import { LayersIcon } from '~/components/icons';
import styles from '~/styles/modules/routes/admin';

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
  const submit = useSubmit();

  const onFilterChange = (ev) => submit(ev.currentTarget.form, { replace: true });

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Verification jobs</h1>
          <p className={styles.pageSubtitle}>Bulk email and phone verification runs</p>
        </div>
      </header>

      <Form method="get" className={styles.tableToolbar}>
        <div className={styles.filterField}>
          <label className={styles.filterLabel} htmlFor="kind">Kind</label>
          <select id="kind" name="kind" defaultValue={kind} onChange={onFilterChange} className={styles.filterSelect}>
            {KIND_OPTS.map((v) => <option key={v} value={v}>{v || 'all'}</option>)}
          </select>
        </div>
        <div className={styles.filterField}>
          <label className={styles.filterLabel} htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={status} onChange={onFilterChange} className={styles.filterSelect}>
            {STATUS_OPTS.map((v) => <option key={v} value={v}>{v || 'all'}</option>)}
          </select>
        </div>
      </Form>

      {jobs.length === 0 ? (
        <EmptyState
          icon={LayersIcon}
          title="No jobs match"
          body="Adjust the kind or status filters, or wait for the next bulk verification run."
        />
      ) : (
        <>
          <div className={styles.tableCaption}>
            <span><strong>{jobs.length}</strong> {jobs.length === 1 ? 'row' : 'rows'} · page <strong>{page}</strong></span>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <colgroup>
                <col style={{ width: 160 }} />
                <col />
                <col style={{ width: 80 }} />
                <col style={{ width: 200 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 110 }} />
              </colgroup>
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
                        <span>{j.processed_items.toLocaleString()} / {j.total_items.toLocaleString()}</span>
                        <span className={styles.progressNote}>· {pct}%</span>
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

          <div className={styles.pagination}>
            <span className={styles.pageNote}>Page {page}</span>
            <div className={styles.paginationActions}>
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
      )}
    </>
  );
}
