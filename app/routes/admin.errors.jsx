import { Link, Form, useLoaderData, useNavigate } from 'react-router';
import { requireAdmin, adminListErrors } from '~/utils/admin.server';
import EmptyState from '~/components/admin/EmptyState';
import styles from '~/styles/modules/routes/admin.module.css';

export const meta = () => [
  { title: 'Errors | Trovarcis Admin' },
  { name: 'robots', content: 'noindex, nofollow' },
];

const KIND_OPTS = ['', 'server_route', 'client_route', 'client_script', 'client_async', 'api_call', 'worker', 'webhook'];
const SEV_OPTS  = ['', 'fatal', 'error', 'warning', 'info'];
const RES_OPTS  = ['', 'false', 'true'];

export async function loader({ request }) {
  await requireAdmin(request);
  const url = new URL(request.url);
  const kind     = url.searchParams.get('kind') || null;
  const severity = url.searchParams.get('severity') || null;
  const resolved = url.searchParams.get('resolved') || null;
  const page     = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = 50;
  const offset = (page - 1) * limit;

  const errors = await adminListErrors({
    kind: kind || null,
    severity: severity || null,
    resolved: resolved || null,
    limit, offset,
  });

  return { errors, kind: kind || '', severity: severity || '', resolved: resolved || '', page };
}

const SEV_BADGE = {
  fatal:   'badgeError',
  error:   'badgeError',
  warning: 'badgeWarning',
  info:    'badgeNeutral',
};

// Renders message safely. Upstream non-string captures occasionally land as '[object Object]' - flag them.
function safeMessage(msg) {
  if (!msg) return '-';
  const s = String(msg);
  if (s === '[object Object]') return '(non-string error - open to inspect)';
  return s.length > 120 ? s.slice(0, 120) + '...' : s;
}

function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const RESOLVED_LABEL = { '': 'all', 'false': 'unresolved', 'true': 'resolved' };

export default function AdminErrors() {
  const { errors, kind, severity, resolved, page } = useLoaderData();
  const navigate = useNavigate();

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Errors</h1>
          <p className={styles.pageSubtitle}>Page {page} - {errors.length} {errors.length === 1 ? 'event' : 'events'}</p>
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
          <label className={styles.filterLabel} htmlFor="severity">Severity</label>
          <select id="severity" name="severity" defaultValue={severity} className={styles.filterSelect}>
            {SEV_OPTS.map((v) => <option key={v} value={v}>{v || 'all'}</option>)}
          </select>
        </div>
        <div className={styles.filterField}>
          <label className={styles.filterLabel} htmlFor="resolved">Resolved</label>
          <select id="resolved" name="resolved" defaultValue={resolved} className={styles.filterSelect}>
            {RES_OPTS.map((v) => <option key={v} value={v}>{RESOLVED_LABEL[v]}</option>)}
          </select>
        </div>
        <button type="submit" className={styles.formButton}>Apply</button>
      </Form>

      {errors.length === 0 ? (
        <EmptyState
          variant="error"
          title="No errors match"
          body="Either nothing has gone wrong, or your filters are too narrow. The latter is more likely."
        />
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>When</th>
                <th>Kind</th>
                <th>Sev</th>
                <th>Path</th>
                <th>Message</th>
                <th>User</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {errors.map((e) => (
                <tr
                  key={e.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/admin/errors/${e.id}`)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault();
                      navigate(`/admin/errors/${e.id}`);
                    }
                  }}
                  role="link"
                  tabIndex={0}
                  aria-label={`Open error ${e.id}`}
                >
                  <td data-label="When" className={styles['td--muted']}>{timeAgo(e.created_at)}</td>
                  <td data-label="Kind" className={styles['td--mono']}>{e.kind}</td>
                  <td data-label="Sev">
                    <span className={`${styles.badge} ${styles[SEV_BADGE[e.severity] || 'badgeNeutral']}`}>{e.severity}</span>
                  </td>
                  <td data-label="Path" className={styles['td--mono']}>{e.path || '-'}</td>
                  <td data-label="Message">{safeMessage(e.message)}</td>
                  <td data-label="User" onClick={(ev) => ev.stopPropagation()}>
                    {e.user_id
                      ? <Link to={`/admin/users/${e.user_id}`} className={styles.rowLink}>{e.user_email || '-'}</Link>
                      : <span className={styles['td--muted']}>-</span>}
                  </td>
                  <td data-label="Status">
                    {e.resolved_at
                      ? <span className={`${styles.badge} ${styles.badgeSuccess}`}>resolved</span>
                      : <span className={`${styles.badge} ${styles.badgeNeutral}`}>open</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.pagination}>
        <span className={styles.pageNote}>Page {page}</span>
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          {page > 1 ? (
            <Link to={`?${new URLSearchParams({ kind, severity, resolved, page: String(page - 1) }).toString()}`}
                  className={`${styles.formButton} ${styles['formButton--ghost']}`}>Previous</Link>
          ) : null}
          {errors.length === 50 ? (
            <Link to={`?${new URLSearchParams({ kind, severity, resolved, page: String(page + 1) }).toString()}`}
                  className={`${styles.formButton} ${styles['formButton--ghost']}`}>Next</Link>
          ) : null}
        </div>
      </div>
    </>
  );
}
