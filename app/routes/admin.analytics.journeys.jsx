import { Form, Link, useLoaderData } from 'react-router';
import { requireAdmin, adminAnalyticsUserJourney, adminSearchUsers } from '~/utils/admin.server';
import ActivityIcon from '~/components/admin/ActivityIcon';
import EmptyState from '~/components/admin/EmptyState';
import styles from '~/styles/modules/routes/admin.module.css';

export const meta = () => [
  { title: 'User journeys | Trovarcis Admin' },
  { name: 'robots', content: 'noindex, nofollow' },
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loader({ request }) {
  await requireAdmin(request);
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId') || '';
  const limit = Math.min(500, Math.max(50, parseInt(url.searchParams.get('limit') || '200', 10)));

  let user = null;
  let events = [];

  if (UUID_RE.test(userId)) {
    const matches = await adminSearchUsers({ q: userId, limit: 1 });
    user = matches[0] || null;
    if (user) {
      events = await adminAnalyticsUserJourney(userId, { limit });
    }
  }

  return { user, events, userId, limit };
}

const EVENT_TONE = {
  pageview:              'signup',
  tool_start:            'admin_action',
  tool_success:          'signup',
  tool_error:            'error',
  auth_submit:           'admin_action',
  auth_otp_sent:         'admin_action',
  auth_otp_verified:     'signup',
  auth_signup_complete:  'signup',
  auth_welcome_credited: 'payment',
  package_select:        'payment',
  checkout_click:        'payment',
  gateway_redirect:      'payment',
  payment_pending:       'payment',
  payment_confirmed:     'payment',
  payment_failed:        'error',
  payment_abandoned:     'error',
};

function tone(eventType) {
  return EVENT_TONE[eventType] || 'admin_action';
}

function fmtDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 19);
}

export default function AdminJourneys() {
  const { user, events, userId, limit } = useLoaderData();

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>User journeys</h1>
          <p className={styles.pageSubtitle}>Per-user event timeline (signed-in users only)</p>
        </div>
      </header>

      <Form method="get" className={styles.filters}>
        <div className={`${styles.filterField} ${styles['filterField--grow']}`}>
          <label className={styles.filterLabel} htmlFor="userId">User ID</label>
          <input
            id="userId"
            name="userId"
            type="text"
            placeholder="paste user UUID"
            defaultValue={userId}
            className={styles.filterInput}
          />
        </div>
        <div className={styles.filterField}>
          <label className={styles.filterLabel} htmlFor="limit">Events</label>
          <select id="limit" name="limit" defaultValue={String(limit)} className={styles.filterSelect}>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="200">200</option>
            <option value="500">500</option>
          </select>
        </div>
        <button type="submit" className={styles.formButton}>Load</button>
      </Form>

      {!userId ? (
        <EmptyState
          variant="search"
          title="Enter a user ID"
          body="Paste a user UUID above to see their event timeline. Find one on the Users page."
        />
      ) : !user ? (
        <EmptyState
          variant="search"
          title="User not found"
          body={`No user matches ${userId}.`}
        />
      ) : events.length === 0 ? (
        <EmptyState
          title="No events yet"
          body={`${user.email} has no recorded analytics events.`}
        />
      ) : (
        <>
          <div className={styles.panel} style={{ marginBottom: 'var(--space-lg)' }}>
            <header className={styles.panelHead}>
              <h2 className={styles.panelTitle}>{user.email}</h2>
              <span className={styles.panelSub}>{events.length} events</span>
            </header>
            <Link to={`/admin/users/${user.id}`} className={styles.rowLink}>View user detail →</Link>
          </div>

          <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
            {events.map((e, i) => (
              <li
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 160px 200px 1fr',
                  gap: 'var(--space-md)',
                  alignItems: 'center',
                  padding: '12px var(--space-md)',
                  background: i % 2 === 0 ? 'var(--trov-surface)' : 'transparent',
                  borderTop: i === 0 ? '1px solid var(--trov-border)' : 'none',
                  borderBottom: '1px solid var(--trov-border)',
                  borderLeft: '1px solid var(--trov-border)',
                  borderRight: '1px solid var(--trov-border)',
                  borderTopLeftRadius: i === 0 ? 'var(--radius-md)' : 0,
                  borderTopRightRadius: i === 0 ? 'var(--radius-md)' : 0,
                  borderBottomLeftRadius: i === events.length - 1 ? 'var(--radius-md)' : 0,
                  borderBottomRightRadius: i === events.length - 1 ? 'var(--radius-md)' : 0,
                }}
              >
                <ActivityIcon kind={tone(e.event_type)} size={28} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--trov-text-muted)' }}>
                  {fmtDate(e.created_at)}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--trov-accent)', fontWeight: 500 }}>
                  {e.event_type}
                </span>
                <span style={{ fontSize: 12, color: 'var(--trov-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.path || '-'}
                  {e.country && e.country !== 'XX' ? <span style={{ color: 'var(--trov-text-muted)', marginLeft: 8 }}>· {e.country}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </>
  );
}
