import { Link, Form, useLoaderData } from 'react-router';
import { requireAdmin, adminListPayments } from '~/utils/admin.server';
import EmptyState from '~/components/admin/EmptyState';
import styles from '~/styles/modules/routes/admin.module.css';

export const meta = () => [
  { title: 'Payments | Trovarcis Admin' },
  { name: 'robots', content: 'noindex, nofollow' },
];

const STATUS_OPTS = ['', 'pending', 'awaiting_payment', 'confirmed', 'failed', 'expired', 'refunded'];
const GATEWAY_OPTS = ['', 'cryptomus', 'stripe'];

export async function loader({ request }) {
  await requireAdmin(request);
  const url = new URL(request.url);
  const gateway = url.searchParams.get('gateway') || null;
  const status  = url.searchParams.get('status')  || null;
  const page    = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = 50;
  const offset = (page - 1) * limit;

  const payments = await adminListPayments({
    gateway: gateway || null,
    status: status || null,
    limit,
    offset,
  });

  return { payments, gateway: gateway || '', status: status || '', page };
}

const STATUS_BADGE = {
  confirmed:        'badgeSuccess',
  pending:          'badgeNeutral',
  awaiting_payment: 'badgeWarning',
  failed:           'badgeError',
  expired:          'badgeError',
  refunded:         'badgeNeutral',
};

function formatCents(c) { return '$' + (c / 100).toFixed(2); }
function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 16);
}

export default function AdminPayments() {
  const { payments, gateway, status, page } = useLoaderData();

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Payments</h1>
          <p className={styles.pageSubtitle}>Page {page} - {payments.length} {payments.length === 1 ? 'row' : 'rows'}</p>
        </div>
      </header>

      <Form method="get" className={styles.filters}>
        <div className={styles.filterField}>
          <label className={styles.filterLabel} htmlFor="gateway">Gateway</label>
          <select id="gateway" name="gateway" defaultValue={gateway} className={styles.filterSelect}>
            {GATEWAY_OPTS.map((v) => <option key={v} value={v}>{v || 'all'}</option>)}
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

      {payments.length === 0 ? (
        <EmptyState
          variant="data"
          title="No payments match"
          body="Adjust gateway or status filters, or wait for the first payment to land."
        />
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>When</th>
                <th>User</th>
                <th>Gateway</th>
                <th>Package</th>
                <th className={styles['th--right']}>Credits</th>
                <th className={styles['th--right']}>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td data-label="When" className={styles['td--mono']}>{formatDate(p.created_at)}</td>
                  <td data-label="User">
                    {p.user_id
                      ? <Link to={`/admin/users/${p.user_id}`} className={styles.rowLink}>{p.user_email || '-'}</Link>
                      : <span className={styles['td--muted']}>-</span>}
                  </td>
                  <td data-label="Gateway">{p.gateway}</td>
                  <td data-label="Package">
                    <Link to={`/admin/payments/${p.id}`} className={styles.rowLink}>{p.package_key || '-'}</Link>
                  </td>
                  <td data-label="Credits" className={styles['td--num']}>{p.credits.toLocaleString()}</td>
                  <td data-label="Amount" className={styles['td--num']}>{formatCents(p.amount_usd_cents)}</td>
                  <td data-label="Status">
                    <span className={`${styles.badge} ${styles[STATUS_BADGE[p.status] || 'badgeNeutral']}`}>{p.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.pagination}>
        <span className={styles.pageNote}>Page {page}</span>
        <div className={styles['stack--sm']} style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          {page > 1 ? (
            <Link
              to={`?${new URLSearchParams({ gateway, status, page: String(page - 1) }).toString()}`}
              className={`${styles.formButton} ${styles['formButton--ghost']}`}
            >Previous</Link>
          ) : null}
          {payments.length === 50 ? (
            <Link
              to={`?${new URLSearchParams({ gateway, status, page: String(page + 1) }).toString()}`}
              className={`${styles.formButton} ${styles['formButton--ghost']}`}
            >Next</Link>
          ) : null}
        </div>
      </div>
    </>
  );
}
