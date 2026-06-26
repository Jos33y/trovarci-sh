// Admin payments list - filterable by gateway + status, click-through to detail.
import { Link, Form, useLoaderData, useNavigate, useSubmit } from 'react-router';
import { requireAdmin, adminListPayments } from '~/utils/admin.server';
import EmptyState from '~/components/admin/EmptyState';
import { CardIcon } from '~/components/icons';
import styles from '~/styles/modules/routes/admin';

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
  const navigate = useNavigate();
  const submit = useSubmit();

  const onFilterChange = (ev) => submit(ev.currentTarget.form, { replace: true });

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Payments</h1>
          <p className={styles.pageSubtitle}>Crypto + card transactions across both gateways</p>
        </div>
      </header>

      <Form method="get" className={styles.tableToolbar}>
        <div className={styles.filterField}>
          <label className={styles.filterLabel} htmlFor="gateway">Gateway</label>
          <select id="gateway" name="gateway" defaultValue={gateway} onChange={onFilterChange} className={styles.filterSelect}>
            {GATEWAY_OPTS.map((v) => <option key={v} value={v}>{v || 'all'}</option>)}
          </select>
        </div>
        <div className={styles.filterField}>
          <label className={styles.filterLabel} htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={status} onChange={onFilterChange} className={styles.filterSelect}>
            {STATUS_OPTS.map((v) => <option key={v} value={v}>{v || 'all'}</option>)}
          </select>
        </div>
      </Form>

      {payments.length === 0 ? (
        <EmptyState
          icon={CardIcon}
          title="No payments match"
          body="Adjust the gateway or status filters, or wait for the next payment to land."
        />
      ) : (
        <>
          <div className={styles.tableCaption}>
            <span><strong>{payments.length}</strong> {payments.length === 1 ? 'row' : 'rows'} · page <strong>{page}</strong></span>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <colgroup>
                <col style={{ width: 160 }} />
                <col />
                <col style={{ width: 100 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 110 }} />
              </colgroup>
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
                  <tr
                    key={p.id}
                    onClick={() => navigate(`/admin/payments/${p.id}`)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        navigate(`/admin/payments/${p.id}`);
                      }
                    }}
                    role="link"
                    tabIndex={0}
                    aria-label={`Open payment ${p.id}`}
                  >
                    <td data-label="When" className={styles['td--mono']}>{formatDate(p.created_at)}</td>
                    <td data-label="User" onClick={(ev) => ev.stopPropagation()}>
                      {p.user_id
                        ? <Link to={`/admin/users/${p.user_id}`} className={styles.rowLink}>{p.user_email || '-'}</Link>
                        : <span className={styles['td--muted']}>-</span>}
                    </td>
                    <td data-label="Gateway">{p.gateway}</td>
                    <td data-label="Package">{p.package_key || '-'}</td>
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

          <div className={styles.pagination}>
            <span className={styles.pageNote}>Page {page}</span>
            <div className={styles.paginationActions}>
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
      )}
    </>
  );
}
