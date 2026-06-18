/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/jobs/:jobId/status

   Polling fallback for job progress. Returns a snapshot of where the
   job is right now: status, processed rows, per-category counts, and
   how many items are scheduled for retry.

   Pair with the SSE endpoint at /api/jobs/:jobId/stream which is the
   primary push channel. Polling is the fallback for environments where
   SSE breaks (some corporate proxies buffer aggressively, EventSource
   reconnect storms, etc).

   Auth: required, ownership enforced via getJobForUser.

   Response (200):
     {
       ok: true,
       progress: {
         id, status, totalRows, processedRows, completedAt,
         counts: { valid, invalid, risky, unknown, error },
         retrying
       }
     }

   Response (404): job not found OR not owned by this user (we don't
                   distinguish - returning 403 would leak job-id existence)
   ═══════════════════════════════════════════════════════════════════════════ */

import { requireUser }                  from '~/utils/session.server';
import { getJobForUser, getJobProgress } from '~/lib/jobQueue.server';

export async function loader({ request, params }) {
  const user = await requireUser(request);
  const jobId = params.jobId;

  if (!jobId) {
    return Response.json(
      { ok: false, code: 'BAD_JOB_ID', error: 'jobId is required' },
      { status: 400 },
    );
  }

  // Ownership check first - getJobProgress doesn't enforce ownership,
  // so without this any logged-in user could poll any job by id.
  const owned = await getJobForUser(jobId, user.id);
  if (!owned) {
    return Response.json(
      { ok: false, code: 'JOB_NOT_FOUND', error: 'Job not found' },
      { status: 404 },
    );
  }

  const progress = await getJobProgress(jobId);
  if (!progress) {
    return Response.json(
      { ok: false, code: 'JOB_NOT_FOUND', error: 'Job not found' },
      { status: 404 },
    );
  }

  return Response.json({ ok: true, progress });
}
