// Admin user journeys - per-user event timeline. Accepts email or UUID.
// Filename uses trailing underscore on `analytics_` so this is a sibling route, not a child of admin.analytics.
import { Form, Link, useLoaderData, useSubmit } from 'react-router';
import { requireAdmin, adminAnalyticsUserJourney, adminSearchUsers } from '~/utils/admin.server';
import EmptyState from '~/components/admin/EmptyState';
import JourneyTimeline from '~/components/admin/JourneyTimeline';
import styles from '~/styles/modules/routes/admin';

export const meta = () => [
  { title: 'User journeys | Trovarcis Admin' },
  { name: 'robots', content: 'noindex, nofollow' },
];

export async function loader({ request }) {
  await requireAdmin(request);
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  const limit = Math.min(500, Math.max(50, parseInt(url.searchParams.get('limit') || '200', 10)));

  let user = null;
  let events = [];

  if (q.length >= 2) {
    const matches = await adminSearchUsers({ q, limit: 1 });
    user = matches[0] || null;
    if (user) {
      events = await adminAnalyticsUserJourney(user.id, { limit });
    }
  }

  return { user, events, q, limit };
}

export default function AdminJourneys() {
  const { user, events, q, limit } = useLoaderData();
  const submit = useSubmit();
  const onSelectChange = (ev) => submit(ev.currentTarget.form, { replace: true });

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>User journeys</h1>
          <p className={styles.pageSubtitle}>Per-user event timeline (signed-in users only)</p>
        </div>
      </header>

      <Form method="get" className={styles.tableToolbar}>
        <div className={styles.toolbarSearch}>
          <input
            id="q"
            name="q"
            type="search"
            placeholder="Email or UUID"
            defaultValue={q}
            className={styles.filterInput}
            aria-label="User email or UUID"
          />
        </div>
        <div className={styles.filterField}>
          <label className={styles.filterLabel} htmlFor="limit">Events</label>
          <select id="limit" name="limit" defaultValue={String(limit)} onChange={onSelectChange} className={styles.filterSelect}>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="200">200</option>
            <option value="500">500</option>
          </select>
        </div>
        <button type="submit" className={styles.formButton}>Load</button>
      </Form>

      {!q ? (
        <EmptyState
          variant="search"
          title="Find a user"
          body="Type an email or paste a UUID above. Partial emails work too."
        />
      ) : !user ? (
        <EmptyState
          variant="search"
          title="User not found"
          body={`No user matches "${q}". Try a different email fragment or paste a UUID from the Users page.`}
        />
      ) : events.length === 0 ? (
        <EmptyState
          title="No events for this user yet"
          body={`${user.email} has no recorded analytics events. Either they have not navigated the app since signup, or analytics events are not being stamped with user_id.`}
        />
      ) : (
        <>
          <section className={styles.panel}>
            <header className={styles.panelHead}>
              <h2 className={styles.panelTitle}>{user.email}</h2>
              <span className={styles.panelSub}>{events.length} events</span>
            </header>
            <Link to={`/admin/users/${user.id}`} className={styles.rowLink}>View user detail →</Link>
          </section>

          <JourneyTimeline events={events} />
        </>
      )}
    </>
  );
}
