import { Link, Form, useLoaderData } from 'react-router';
import { requireAdmin, adminSearchUsers } from '~/utils/admin.server';
import EmptyState from '~/components/admin/EmptyState';
import styles from '~/styles/modules/routes/admin.module.css';

export const meta = () => [
  { title: 'Users | Trovarcis Admin' },
  { name: 'robots', content: 'noindex, nofollow' },
];

export async function loader({ request }) {
  await requireAdmin(request);
  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? '';

  const users = await adminSearchUsers({ q, limit: 100 });
  return { users, q };
}

function timeAgo(iso) {
  if (!iso) return '-';
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86_400_000);
  if (d === 0) return 'today';
  if (d === 1) return '1d ago';
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

export default function AdminUsers() {
  const { users, q } = useLoaderData();

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Users</h1>
          <p className={styles.pageSubtitle}>{users.length} {users.length === 1 ? 'result' : 'results'}{q ? ` for "${q}"` : ''}</p>
        </div>
      </header>

      <Form method="get" className={styles.filters}>
        <div className={`${styles.filterField} ${styles['filterField--grow']}`}>
          <label className={styles.filterLabel} htmlFor="q">Search</label>
          <input
            id="q"
            name="q"
            type="text"
            placeholder="email or user ID"
            defaultValue={q}
            className={styles.filterInput}
          />
        </div>
        <button type="submit" className={styles.formButton}>Search</button>
      </Form>

      {users.length === 0 ? (
        <EmptyState
          variant="search"
          title="No users found"
          body={q ? 'Try a partial email or paste a user UUID.' : 'No accounts have been created yet.'}
        />
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Verified</th>
                <th className={styles['th--right']}>Credits</th>
                <th>Joined</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td data-label="Email">
                    <Link to={`/admin/users/${u.id}`} className={styles.rowLink}>{u.email}</Link>
                  </td>
                  <td data-label="Role">
                    {u.role === 'admin'
                      ? <span className={`${styles.badge} ${styles.badgeAccent}`}>Admin</span>
                      : <span className={`${styles.badge} ${styles.badgeNeutral}`}>User</span>}
                  </td>
                  <td data-label="Verified">
                    {u.email_verified_at
                      ? <span className={`${styles.badge} ${styles.badgeSuccess}`}>Verified</span>
                      : <span className={`${styles.badge} ${styles.badgeWarning}`}>Unverified</span>}
                  </td>
                  <td data-label="Credits" className={styles['td--num']}>
                    {u.credits_balance.toLocaleString()}
                  </td>
                  <td data-label="Joined" className={styles['td--muted']}>{timeAgo(u.created_at)}</td>
                  <td data-label="Status">
                    {u.deleted_at
                      ? <span className={`${styles.badge} ${styles.badgeError}`}>Deleted</span>
                      : <span className={`${styles.badge} ${styles.badgeSuccess}`}>Active</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
