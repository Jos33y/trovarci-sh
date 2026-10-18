// Admin Sender licenses list - every issued key with owner, seats and last check-in.
import { Form, useLoaderData, useNavigate } from 'react-router';
import { requireAdmin } from '~/utils/admin.server';
import { adminListLicenses, adminLicenseCounts, LICENSE_STATUSES } from '~/lib/licenseAdmin.server';
import EmptyState from '~/components/admin/EmptyState';
import KPICard from '~/components/admin/KPICard';
import { KeyIcon, DevicesIcon, ShieldIcon } from '~/components/icons';
import styles from '~/styles/modules/routes/admin';
import { formatInt } from '~/utils/format';

export const meta = () => [
  { title: 'Licenses | Trovarcis Admin' },
  { name: 'robots', content: 'noindex, nofollow' },
];

export async function loader({ request }) {
  await requireAdmin(request);
  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? '';
  const statusParam = url.searchParams.get('status');
  const status = LICENSE_STATUSES.includes(statusParam) ? statusParam : '';

  const [licenses, counts] = await Promise.all([
    adminListLicenses({ q, status: status || null, limit: 200 }),
    adminLicenseCounts(),
  ]);
  return { licenses, counts, q, status };
}

function formatDay(input) {
  if (!input) return '-';
  return new Date(input).toISOString().slice(0, 10);
}

function timeAgo(input) {
  if (!input) return 'never';
  const d = Math.floor((Date.now() - new Date(input).getTime()) / 86_400_000);
  if (d <= 0) return 'today';
  if (d === 1) return '1d ago';
  if (d < 30) return `${d}d ago`;
  return formatDay(input);
}

export default function AdminLicenses() {
  const { licenses, counts, q, status } = useLoaderData();
  const navigate = useNavigate();
  const filtered = Boolean(q || status);

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Licenses</h1>
          <p className={styles.pageSubtitle}>Trovarcis Sender keys. Issue a new one from the owner's user page.</p>
        </div>
      </header>

      <div className={styles.kpiStrip}>
        <KPICard label="Active licenses" value={formatInt(counts.active)} hint={`${formatInt(counts.total)} issued`} icon={KeyIcon} variant="hero" />
        <KPICard label="Live devices" value={formatInt(counts.live_devices)} hint="on active licenses" icon={DevicesIcon} />
        <KPICard label="Revoked" value={formatInt(counts.revoked)} hint="locked at next check-in" icon={ShieldIcon} />
      </div>

      <Form method="get" className={styles.tableToolbar}>
        <div className={styles.toolbarSearch}>
          <input
            id="q"
            name="q"
            type="search"
            placeholder="Search by owner email, license ID or payment reference"
            defaultValue={q}
            className={styles.filterInput}
            aria-label="Search licenses"
          />
        </div>
        <select name="status" defaultValue={status} className={styles.filterSelect} aria-label="Status">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="revoked">Revoked</option>
        </select>
        <button type="submit" className={styles.formButton}>Search</button>
      </Form>

      {licenses.length === 0 ? (
        <EmptyState
          variant={filtered ? 'search' : 'data'}
          icon={filtered ? undefined : KeyIcon}
          title={filtered ? 'No licenses match' : 'No licenses issued yet'}
          body={filtered
            ? 'Try part of an email, the first characters of a license ID, or clear the status filter.'
            : 'Open a user and use Issue Sender license. Keys are signed on this server.'}
        />
      ) : (
        <>
          <div className={styles.tableCaption}>
            <span><strong>{licenses.length}</strong> {licenses.length === 1 ? 'license' : 'licenses'}{q ? <> for <strong>"{q}"</strong></> : null}</span>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <colgroup>
                <col style={{ width: 120 }} />
                <col />
                <col style={{ width: 100 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 120 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>License</th>
                  <th>Owner</th>
                  <th>Status</th>
                  <th className={styles['th--right']}>Devices</th>
                  <th>Last check-in</th>
                  <th>Issued</th>
                </tr>
              </thead>
              <tbody>
                {licenses.map((l) => {
                  const to = `/admin/users/${l.user_id}#license-${l.id}`;
                  return (
                    <tr
                      key={l.id}
                      onClick={() => navigate(to)}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                          ev.preventDefault();
                          navigate(to);
                        }
                      }}
                      role="link"
                      tabIndex={0}
                      aria-label={`Open license ${l.id.slice(0, 8).toUpperCase()} for ${l.owner_email}`}
                    >
                      <td data-label="License" className={styles['td--mono']}>{l.id.slice(0, 8).toUpperCase()}</td>
                      <td data-label="Owner">{l.owner_email}</td>
                      <td data-label="Status">
                        {l.status === 'active'
                          ? <span className={`${styles.badge} ${styles.badgeSuccess}`}>Active</span>
                          : <span className={`${styles.badge} ${styles.badgeError}`}>Revoked</span>}
                      </td>
                      <td data-label="Devices" className={styles['td--num']}>{l.live_devices} / {l.max_devices}</td>
                      <td data-label="Last check-in" className={styles['td--muted']}>{timeAgo(l.last_seen_at)}</td>
                      <td data-label="Issued" className={styles['td--muted']}>{formatDay(l.issued_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
