// Admin job detail - progress bar, kvList of run stats, force-cancel form.
import { Link, Form, useLoaderData, useActionData, useNavigation, data, redirect } from 'react-router';
import { requireAdmin, adminGetJobDetail } from '~/utils/admin.server';
import { logAdminAction } from '~/utils/adminActions.server';
import { cancelJob } from '~/lib/jobQueue.server';
import styles from '~/styles/modules/routes/admin';
import { formatInt } from '~/utils/format';

export const meta = ({ data }) => [
  { title: data?.job ? `Job ${data.job.id.slice(0, 8)} | Admin` : 'Job | Admin' },
  { name: 'robots', content: 'noindex, nofollow' },
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loader({ request, params }) {
  await requireAdmin(request);

  if (!UUID_RE.test(params.jobId)) {
    throw new Response('Bad request', { status: 400 });
  }

  const job = await adminGetJobDetail(params.jobId);
  if (!job) throw new Response('Not Found', { status: 404 });

  return { job };
}

export async function action({ request, params }) {
  const admin = await requireAdmin(request);
  if (!UUID_RE.test(params.jobId)) {
    return data({ errors: { _form: 'Invalid job id' } }, { status: 400 });
  }

  const form = await request.formData();
  const intent = String(form.get('intent') || '');
  const reason = String(form.get('reason') || '').trim();

  if (intent !== 'cancel') {
    return data({ errors: { _form: 'Unknown action' } }, { status: 400 });
  }
  if (reason.length < 5 || reason.length > 500) {
    return data({ errors: { reason: 'Reason must be 5-500 characters' } }, { status: 400 });
  }

  const job = await adminGetJobDetail(params.jobId);
  if (!job) {
    return data({ errors: { _form: 'Job not found' } }, { status: 404 });
  }
  if (!['pending', 'processing'].includes(job.status)) {
    return data({ errors: { _form: `Cannot cancel a job in status "${job.status}"` } }, { status: 400 });
  }

  await logAdminAction(null, {
    actorId: admin.id,
    actionType: 'job_cancel',
    targetUserId: job.user_id,
    targetKind: 'job',
    targetId: job.id,
    reason,
    context: { previous_status: job.status, kind: job.kind },
  });

  const result = await cancelJob(params.jobId, job.user_id);
  if (!result.ok) {
    return data({ errors: { _form: `Cancel failed: ${result.code}` } }, { status: 400 });
  }

  return redirect(`/admin/jobs/${params.jobId}?cancelled=ok`);
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
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

export default function AdminJobDetail() {
  const { job } = useLoaderData();
  const actionData = useActionData();
  const nav = useNavigation();
  const submitting = nav.state === 'submitting';

  const cancellable = ['pending', 'processing'].includes(job.status);
  const pct = job.total_items > 0 ? Math.min(100, Math.round((job.processed_items / job.total_items) * 100)) : 0;

  const meta = job.metadata && typeof job.metadata === 'object' ? job.metadata : {};

  return (
    <>
      <Link to="/admin/jobs" className={styles.backLink}>← Back to jobs</Link>

      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Job</h1>
          <p className={styles.pageSubtitle}><span className={styles.mono}>{job.id}</span></p>
        </div>
        <div className={styles.pageHeaderActions}>
          <span className={`${styles.badge} ${styles[STATUS_BADGE[job.status] || 'badgeNeutral']}`}>{job.status}</span>
        </div>
      </header>

      <div className={styles.detailGrid}>
        <div className={styles.detailMain}>
          <section className={styles.panel}>
            <header className={styles.panelHead}>
              <h2 className={styles.panelTitle}>Progress</h2>
              <span className={styles.panelSub}>{pct}%</span>
            </header>
            <div className={styles.progressBar}>
              <div
                className={`${styles.progressBarFill} ${job.status === 'failed' ? styles['progressBarFill--error'] : ''}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className={styles.kvList}>
              <div className={styles.kvKey}>Items</div>
              <div className={`${styles.kvValue} ${styles['kvValue--mono']}`}>{formatInt(job.processed_items)} / {formatInt(job.total_items)}</div>

              <div className={styles.kvKey}>Kind</div>
              <div className={styles.kvValue}>{job.kind}</div>

              <div className={styles.kvKey}>Created</div>
              <div className={`${styles.kvValue} ${styles['kvValue--mono']}`}>{formatDate(job.created_at)}</div>

              <div className={styles.kvKey}>Completed</div>
              <div className={`${styles.kvValue} ${styles['kvValue--mono']}`}>{formatDate(job.completed_at)}</div>

              <div className={styles.kvKey}>Credits charged</div>
              <div className={`${styles.kvValue} ${styles['kvValue--mono']}`}>{formatInt(job.credits_charged)}</div>

              <div className={styles.kvKey}>Credits refunded</div>
              <div className={`${styles.kvValue} ${styles['kvValue--mono']}`}>{formatInt(job.credits_refunded)}</div>
            </div>
          </section>

          {Object.keys(meta).length > 0 ? (
            <section className={styles.panel}>
              <header className={styles.panelHead}>
                <h2 className={styles.panelTitle}>Metadata</h2>
              </header>
              <pre className={styles.codeBlock}>{JSON.stringify(meta, null, 2)}</pre>
            </section>
          ) : null}
        </div>

        <div className={styles.detailSide}>
          <section className={styles.panel}>
            <header className={styles.panelHead}>
              <h2 className={styles.panelTitle}>User</h2>
            </header>
            {job.user_id ? (
              <div className={styles.userCard}>
                <p className={styles.userCardEmail}>{job.user_email || '-'}</p>
                <p className={styles.userCardId}>{job.user_id}</p>
                <Link to={`/admin/users/${job.user_id}`} className={`${styles.formButton} ${styles['formButton--ghost']}`}>
                  View user
                </Link>
              </div>
            ) : (
              <p className={styles.muted}>User deleted.</p>
            )}
          </section>

          {cancellable ? (
            <section className={styles.panel}>
              <header className={styles.panelHead}>
                <h2 className={styles.panelTitle}>Force cancel</h2>
              </header>
              <Form method="post" className={styles.actionForm}>
                <input type="hidden" name="intent" value="cancel" />
                <div className={styles.formField}>
                  <label className={styles.filterLabel} htmlFor="reason">Reason</label>
                  <textarea
                    id="reason"
                    name="reason"
                    required
                    minLength={5}
                    maxLength={500}
                    className={styles.formTextarea}
                    placeholder="5-500 chars. Audit logged."
                  />
                  {actionData?.errors?.reason && <div className={styles.formError}>{actionData.errors.reason}</div>}
                </div>
                {actionData?.errors?._form && <div className={styles.formError}>{actionData.errors._form}</div>}
                <button type="submit" className={`${styles.formButton} ${styles['formButton--danger']}`} disabled={submitting}>
                  {submitting ? 'Cancelling...' : 'Cancel job'}
                </button>
              </Form>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
