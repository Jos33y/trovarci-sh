// Admin error detail - canonical detail page (drawer in list handles most triage).
import { Link, Form, useLoaderData, useActionData, useNavigation, data, redirect } from 'react-router';
import {
  requireAdmin,
  adminGetErrorDetail,
  adminMarkErrorResolved,
} from '~/utils/admin.server';
import styles from '~/styles/modules/routes/admin';

export const meta = ({ data }) => [
  { title: data?.error ? `Error ${data.error.id} | Admin` : 'Error | Admin' },
  { name: 'robots', content: 'noindex, nofollow' },
];

export async function loader({ request, params }) {
  await requireAdmin(request);
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id) || id < 1) {
    throw new Response('Bad request', { status: 400 });
  }
  const error = await adminGetErrorDetail(id);
  if (!error) throw new Response('Not Found', { status: 404 });
  return { error };
}

export async function action({ request, params }) {
  const admin = await requireAdmin(request);
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id) || id < 1) {
    return data({ errors: { _form: 'Invalid id' } }, { status: 400 });
  }

  const form = await request.formData();
  const intent = String(form.get('intent') || '');
  const note = String(form.get('note') || '').trim() || null;

  if (intent !== 'resolve') {
    return data({ errors: { _form: 'Unknown action' } }, { status: 400 });
  }
  if (note && note.length > 500) {
    return data({ errors: { note: 'Note too long (500 char max)' } }, { status: 400 });
  }

  await adminMarkErrorResolved(id, { actorId: admin.id, note });
  return redirect(`/admin/errors/${id}?resolved=ok`);
}

const SEV_BADGE = {
  fatal:   'badgeError',
  error:   'badgeError',
  warning: 'badgeWarning',
  info:    'badgeNeutral',
};

function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

export default function AdminErrorDetail() {
  const { error } = useLoaderData();
  const actionData = useActionData();
  const nav = useNavigation();
  const submitting = nav.state === 'submitting';

  const ctx = error.redacted_context && typeof error.redacted_context === 'object'
    ? error.redacted_context
    : {};

  return (
    <>
      <Link to="/admin/errors" className={styles.backLink}>← Back to errors</Link>

      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Error #{error.id}</h1>
          <p className={styles.pageSubtitle}>{formatDate(error.created_at)}</p>
        </div>
        <div className={styles.pageHeaderActions}>
          <span className={`${styles.badge} ${styles[SEV_BADGE[error.severity] || 'badgeNeutral']}`}>{error.severity}</span>
          <span className={`${styles.badge} ${styles.badgeNeutral}`}>{error.kind}</span>
          {error.resolved_at
            ? <span className={`${styles.badge} ${styles.badgeSuccess}`}>resolved</span>
            : <span className={`${styles.badge} ${styles.badgeWarning}`}>open</span>}
        </div>
      </header>

      <div className={styles.detailGrid}>
        <div className={styles.detailMain}>
          <section className={styles.panel}>
            <header className={styles.panelHead}>
              <h2 className={styles.panelTitle}>Message</h2>
            </header>
            <pre className={`${styles.codeBlock} ${styles['codeBlock--message']}`}>{error.message}</pre>
          </section>

          {error.stack ? (
            <section className={styles.panel}>
              <header className={styles.panelHead}>
                <h2 className={styles.panelTitle}>Stack trace</h2>
              </header>
              <pre className={`${styles.codeBlock} ${styles['codeBlock--stack']}`}>{error.stack}</pre>
            </section>
          ) : null}

          {Object.keys(ctx).length > 0 ? (
            <section className={styles.panel}>
              <header className={styles.panelHead}>
                <h2 className={styles.panelTitle}>Redacted context</h2>
              </header>
              <pre className={styles.codeBlock}>{JSON.stringify(ctx, null, 2)}</pre>
            </section>
          ) : null}
        </div>

        <div className={styles.detailSide}>
          <section className={styles.panel}>
            <header className={styles.panelHead}>
              <h2 className={styles.panelTitle}>Details</h2>
            </header>
            <div className={styles.kvList}>
              <div className={styles.kvKey}>Path</div>
              <div className={`${styles.kvValue} ${styles['kvValue--mono']}`}>{error.path || '-'}</div>

              <div className={styles.kvKey}>Method</div>
              <div className={`${styles.kvValue} ${styles['kvValue--mono']}`}>{error.method || '-'}</div>

              <div className={styles.kvKey}>Status</div>
              <div className={`${styles.kvValue} ${styles['kvValue--mono']}`}>{error.status_code || '-'}</div>

              <div className={styles.kvKey}>Country</div>
              <div className={`${styles.kvValue} ${styles['kvValue--mono']}`}>{error.country || '-'}</div>

              {error.user_agent ? (
                <>
                  <div className={styles.kvKey}>User agent</div>
                  <div className={`${styles.kvValue} ${styles['kvValue--mono']} ${styles['kvValue--small']}`}>{error.user_agent}</div>
                </>
              ) : null}

              {error.user_id ? (
                <>
                  <div className={styles.kvKey}>User</div>
                  <div className={styles.kvValue}>
                    <Link to={`/admin/users/${error.user_id}`} className={styles.rowLink}>{error.user_email || error.user_id.slice(0, 8)}</Link>
                  </div>
                </>
              ) : null}

              {error.resolved_at ? (
                <>
                  <div className={styles.kvKey}>Resolved at</div>
                  <div className={`${styles.kvValue} ${styles['kvValue--mono']}`}>{formatDate(error.resolved_at)}</div>

                  <div className={styles.kvKey}>Resolved by</div>
                  <div className={styles.kvValue}>{error.resolved_by_email || error.resolved_by?.slice(0, 8) || '-'}</div>

                  {error.resolution_note ? (
                    <>
                      <div className={styles.kvKey}>Note</div>
                      <div className={styles.kvValue}>{error.resolution_note}</div>
                    </>
                  ) : null}
                </>
              ) : null}
            </div>
          </section>

          {!error.resolved_at ? (
            <section className={styles.panel}>
              <header className={styles.panelHead}>
                <h2 className={styles.panelTitle}>Mark resolved</h2>
              </header>
              <Form method="post" className={styles.actionForm}>
                <input type="hidden" name="intent" value="resolve" />
                <div className={styles.formField}>
                  <label className={styles.filterLabel} htmlFor="note">Resolution note (optional)</label>
                  <textarea
                    id="note"
                    name="note"
                    maxLength={500}
                    className={styles.formTextarea}
                    placeholder="Optional. Up to 500 chars."
                  />
                  {actionData?.errors?.note && <div className={styles.formError}>{actionData.errors.note}</div>}
                </div>
                {actionData?.errors?._form && <div className={styles.formError}>{actionData.errors._form}</div>}
                <button type="submit" className={styles.formButton} disabled={submitting}>
                  {submitting ? 'Resolving...' : 'Mark resolved'}
                </button>
              </Form>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
