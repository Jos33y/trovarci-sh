// GET /api/jobs/:jobId/status - polling snapshot. Pair with /stream SSE for the push channel.

import { requireUser }                  from '~/utils/session.server';
import { getJobForUser, getJobProgress } from '~/lib/jobQueue.server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loader({ request, params }) {
  const user = await requireUser(request);
  const jobId = params.jobId;

  if (!jobId || !UUID_RE.test(jobId)) {
    return Response.json(
      { ok: false, code: 'BAD_JOB_ID', error: 'jobId must be a UUID' },
      { status: 400 },
    );
  }

  // getJobProgress doesn't enforce ownership - check first.
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
