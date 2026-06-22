/* ═══════════════════════════════════════════════════════════════════════════
   GET /jobs/:jobId

   Universal user-facing job detail page. Reachable from:
     - Dashboard "Bulk jobs" rows (link target)
     - Verifier pages once a bulk job is submitted (redirect destination)
     - Direct paste of a job link by the user

   Renders three states from one route, gated by progress.status:

     terminal (complete | partial | cancelled | failed)
       -> <BulkVerificationResult />: full results panel with filter tabs,
          copy/download actions, partial-refund banner when applicable,
          retry CTA when failed. Read-only for the user.

     running (pending | processing)
       -> live progress card with a hard-cancel button. SSE drives the
          counts; on the 'complete' event we revalidate the loader and the
          page swaps to the terminal view in-place.

   Ownership: getJobForUser returns null when the job either doesn't
   exist or belongs to another user. We collapse both into a 404 so the
   route doesn't leak whether a job id exists for someone else.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useState } from 'react';
import { Link, useLoaderData, useNavigate, useRevalidator } from 'react-router';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';
import BulkVerificationResult from '~/components/tools/BulkVerificationResult';
import { requireUser } from '~/utils/session.server';
import { getJobForUser, getJobProgress } from '~/lib/jobQueue.server';
import styles from '~/styles/modules/routes/job-detail.module.css';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TERMINAL_STATES = new Set(['complete', 'partial', 'cancelled', 'failed']);

export const meta = ({ data }) => {
  const id = data?.job?.id ? data.job.id.slice(0, 8) : 'Job';
  return [
    { title: `Job ${id} | Trovarcis Reach` },
    { name: 'robots', content: 'noindex, nofollow' },
  ];
};

export async function loader({ request, params }) {
  const user = await requireUser(request);

  if (!UUID_RE.test(params.jobId)) {
    throw new Response('Bad request', { status: 400 });
  }

  const job = await getJobForUser(params.jobId, user.id);
  if (!job) throw new Response('Not Found', { status: 404 });

  const progress = await getJobProgress(params.jobId);
  if (!progress) throw new Response('Not Found', { status: 404 });

  return { job, progress };
}

/* ═══════════════════════════════════════════════════════════════════════════
   ICONS
   ═══════════════════════════════════════════════════════════════════════════ */

function ArrowLeftIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SpinnerIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={styles.spin} aria-hidden="true">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function AlertIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
        stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */

function typeLabel(type) {
  return type === 'phone' ? 'Phone lookup' : 'Email verification';
}

function toolHref(type) {
  return type === 'phone' ? '/verify-number' : '/verify';
}

function statusClass(status) {
  if (status === 'complete')                                  return styles.pillSuccess;
  if (status === 'partial')                                   return styles.pillWarning;
  if (status === 'failed')                                    return styles.pillError;
  if (status === 'cancelled')                                 return styles.pillNeutral;
  if (status === 'processing' || status === 'pending')        return styles.pillRunning;
  return styles.pillNeutral;
}

function statusLabel(status) {
  if (status === 'complete')   return 'Complete';
  if (status === 'partial')    return 'Partial';
  if (status === 'failed')     return 'Failed';
  if (status === 'cancelled')  return 'Cancelled';
  if (status === 'processing') return 'Processing';
  if (status === 'pending')    return 'Pending';
  return status;
}

function fmtTimestamp(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function computeDurationMs(job, progress) {
  const start = job?.createdAt ? new Date(job.createdAt).getTime() : null;
  const endRaw = progress?.completedAt || job?.completedAt || null;
  const end = endRaw ? new Date(endRaw).getTime() : Date.now();
  if (!start || Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.max(0, end - start);
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════════════════════════════════════ */

export default function JobDetailPage() {
  const { job, progress: initialProgress } = useLoaderData();
  const navigate = useNavigate();
  const revalidator = useRevalidator();

  /* Live progress only matters while the job is non-terminal. Once terminal,
     we use the loader-supplied progress directly. */
  const [progress, setProgress] = useState(initialProgress);
  const isTerminal = TERMINAL_STATES.has(progress.status);

  /* ── SSE subscription for running jobs ──
     We pull initial state from the loader, then EventSource overlays
     real-time updates. On 'complete' we revalidate so the loader's
     authoritative job row drives the terminal render path. */
  useEffect(() => {
    if (isTerminal) return undefined;

    const es = new EventSource(`/api/jobs/${job.id}/stream`);

    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data && data.status) {
          setProgress((prev) => ({ ...prev, ...data }));
        }
      } catch {
        /* malformed payload - ignore */
      }
    };

    const finalize = () => {
      try { es.close(); } catch { /* noop */ }
      revalidator.revalidate();
    };

    es.addEventListener('complete', finalize);
    es.addEventListener('timeout',  finalize);
    es.addEventListener('gone',     finalize);

    es.onerror = () => {
      /* EventSource auto-reconnects unless we close it. Let it retry. */
    };

    return () => {
      try { es.close(); } catch { /* noop */ }
    };
  }, [isTerminal, job.id, revalidator]);

  /* Cancel state for running jobs */
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');

  const handleCancel = async () => {
    if (cancelling) return;
    const ok = window.confirm(
      'Cancel this job? Unprocessed credits will be refunded automatically.',
    );
    if (!ok) return;

    setCancelling(true);
    setCancelError('');
    try {
      const res = await fetch(`/api/jobs/${job.id}/cancel`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setCancelError(body.error || `Cancel failed (${res.status})`);
        setCancelling(false);
        return;
      }
      /* Cancel succeeded. Revalidate so the loader fetches the terminal row. */
      revalidator.revalidate();
    } catch (err) {
      setCancelError(err?.message || 'Cancel failed');
      setCancelling(false);
    }
  };

  /* Counts and totals from progress (best-effort for the BulkVerificationResult
     hint; the component fetches its own items on mount for terminal jobs). */
  const counts = useMemo(() => {
    const c = progress.counts || {};
    return {
      valid:   c.valid   || 0,
      risky:   c.risky   || 0,
      invalid: c.invalid || 0,
      unknown: c.unknown || 0,
      error:   c.error   || 0,
      mobile:  c.mobile  || 0,
    };
  }, [progress.counts]);

  const totalRows     = progress.totalRows     ?? job.totalRows     ?? 0;
  const processedRows = progress.processedRows ?? job.processedRows ?? 0;
  const pct = totalRows > 0 ? Math.min(100, Math.round((processedRows / totalRows) * 100)) : 0;
  const durationMs = computeDurationMs(job, progress);

  const createdAtPretty   = fmtTimestamp(job.createdAt);
  const completedAtPretty = fmtTimestamp(progress.completedAt || job.completedAt);

  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.main}>
        <div className="container">

          {/* ── Breadcrumb ── */}
          <Link to="/dashboard" className={styles.backLink}>
            <ArrowLeftIcon size={12} />
            Back to dashboard
          </Link>

          {/* ── Header ── */}
          <header className={styles.head}>
            <div className={styles.headLeft}>
              <span className={styles.kindPill}>{typeLabel(job.type)}</span>
              <h1 className={styles.title}>
                Job <span className={styles.titleId}>{job.id.slice(0, 8)}</span>
              </h1>
              <div className={styles.meta}>
                {createdAtPretty && <span>Created {createdAtPretty}</span>}
                {completedAtPretty && isTerminal && (
                  <>
                    <span className={styles.metaDot} aria-hidden="true">·</span>
                    <span>Finished {completedAtPretty}</span>
                  </>
                )}
              </div>
            </div>
            <span className={`${styles.statusPill} ${statusClass(progress.status)}`}>
              {!isTerminal && <SpinnerIcon size={11} />}
              {statusLabel(progress.status)}
            </span>
          </header>

          {/* ── Running state: progress + cancel ── */}
          {!isTerminal && (
            <section className={styles.runningCard}>
              <div className={styles.runningHead}>
                <div>
                  <div className={styles.runningTitle}>Job is processing</div>
                  <p className={styles.runningSub}>
                    Safe to navigate away. Progress persists on the server and you can come
                    back to this page anytime.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={cancelling}
                  className={styles.cancelBtn}
                >
                  {cancelling ? 'Cancelling...' : 'Cancel job'}
                </button>
              </div>

              <div className={styles.progressRow}>
                <span className={styles.progressLabel}>
                  {processedRows.toLocaleString()} / {totalRows.toLocaleString()} processed
                </span>
                <span className={styles.progressPct}>{pct}%</span>
              </div>
              <div className={styles.progressTrack} role="progressbar"
                aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                <div className={styles.progressBar} style={{ width: `${pct}%` }} />
              </div>

              {(counts.valid > 0 || counts.mobile > 0 || counts.risky > 0 || counts.invalid > 0 || counts.error > 0) && (
                <div className={styles.runningCounts}>
                  {(counts.valid > 0 || counts.mobile > 0) && (
                    <div className={styles.runningCount}>
                      <span className={`${styles.runningDot} ${styles.dotGood}`} aria-hidden="true" />
                      <span className={styles.runningCountNum}>{(counts.valid || counts.mobile).toLocaleString()}</span>
                      <span className={styles.runningCountLabel}>{job.type === 'phone' ? 'mobile' : 'valid'}</span>
                    </div>
                  )}
                  {counts.risky > 0 && (
                    <div className={styles.runningCount}>
                      <span className={`${styles.runningDot} ${styles.dotRisky}`} aria-hidden="true" />
                      <span className={styles.runningCountNum}>{counts.risky.toLocaleString()}</span>
                      <span className={styles.runningCountLabel}>{job.type === 'phone' ? 'landline' : 'risky'}</span>
                    </div>
                  )}
                  {counts.invalid > 0 && (
                    <div className={styles.runningCount}>
                      <span className={`${styles.runningDot} ${styles.dotBad}`} aria-hidden="true" />
                      <span className={styles.runningCountNum}>{counts.invalid.toLocaleString()}</span>
                      <span className={styles.runningCountLabel}>invalid</span>
                    </div>
                  )}
                  {counts.error > 0 && (
                    <div className={styles.runningCount}>
                      <span className={`${styles.runningDot} ${styles.dotError}`} aria-hidden="true" />
                      <span className={styles.runningCountNum}>{counts.error.toLocaleString()}</span>
                      <span className={styles.runningCountLabel}>errored</span>
                    </div>
                  )}
                </div>
              )}

              {cancelError && (
                <div className={styles.cancelError} role="alert">
                  <AlertIcon size={14} />
                  {cancelError}
                </div>
              )}
            </section>
          )}

          {/* ── Failed state: friendly banner ── */}
          {isTerminal && progress.status === 'failed' && (
            <div className={styles.failedBanner} role="alert">
              <AlertIcon size={18} />
              <div>
                <div className={styles.failedTitle}>This job failed before completing</div>
                <p className={styles.failedSub}>
                  Credits charged at submission were refunded automatically. You can retry from
                  the verifier or contact support if this keeps happening.
                </p>
              </div>
            </div>
          )}

          {/* ── Terminal state: full results panel ── */}
          {isTerminal && (
            <div className={styles.resultsWrap}>
              <BulkVerificationResult
                type={job.type}
                jobId={job.id}
                totalRows={totalRows}
                processedRows={processedRows}
                status={progress.status}
                durationMs={durationMs}
                creditsRefunded={job.creditsRefunded || 0}
                countsHint={counts}
                onNewJob={() => navigate(toolHref(job.type))}
                onBackToSingle={() => navigate(toolHref(job.type))}
              />
            </div>
          )}

        </div>
      </main>
      <Footer />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ERROR BOUNDARY - shows a friendly 404/400 instead of the framework default
   ═══════════════════════════════════════════════════════════════════════════ */

export function ErrorBoundary() {
  return (
    <div className={styles.page}>
      <Header />
      <main className={styles.main}>
        <div className="container">
          <div className={styles.errorState}>
            <AlertIcon size={28} />
            <h1 className={styles.errorTitle}>Job not found</h1>
            <p className={styles.errorSub}>
              The job you're looking for doesn't exist, has been deleted, or belongs to a
              different account.
            </p>
            <Link to="/dashboard" className={styles.errorAction}>
              <ArrowLeftIcon size={12} />
              Back to dashboard
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
