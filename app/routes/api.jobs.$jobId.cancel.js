// POST /api/jobs/:jobId/cancel - cancel running job + refund unused credit hold. Type-aware (email vs phone).

import { requireUser }   from '~/utils/session.server';
import { cancelJob }     from '~/lib/jobQueue.server';
import { refundCredits } from '~/lib/credits.server';
import { bulkCost }      from '~/utils/creditsConfig.server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function action({ request, params }) {
  if (request.method !== 'POST') {
    return Response.json(
      { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'POST required' },
      { status: 405 },
    );
  }

  const user = await requireUser(request);
  const jobId = params.jobId;

  if (!jobId || !UUID_RE.test(jobId)) {
    return Response.json(
      { ok: false, code: 'BAD_JOB_ID', error: 'jobId must be a UUID' },
      { status: 400 },
    );
  }

  const result = await cancelJob(jobId, user.id);
  if (!result.ok) {
    const status =
      result.code === 'JOB_NOT_FOUND'       ? 404 :
      result.code === 'JOB_NOT_OWNED'       ? 403 :
      result.code === 'JOB_NOT_CANCELLABLE' ? 409 : 500;
    return Response.json(result, { status });
  }

  // Compute kept credits via type-aware dispatcher; refund the diff.
  let creditsKept;
  try {
    creditsKept = bulkCost(result.type, result.processedRows);
  } catch (err) {
    console.error(`[cancel] bulkCost dispatch failed for job ${result.jobId} (type=${result.type}):`, err);
    return Response.json({
      ok:              true,
      jobId:           result.jobId,
      type:            result.type,
      creditsHeld:     result.creditsHeld,
      creditsKept:     result.creditsHeld,
      creditsRefunded: 0,
      processedRows:   result.processedRows,
      totalRows:       result.totalRows,
      warning:         'REFUND_DISPATCH_FAILED',
    });
  }

  const refundAmount = Math.max(0, result.creditsHeld - creditsKept);
  let creditsRefunded = 0;

  if (refundAmount > 0) {
    // refundCredits resolves with { transactionId, newBalance, idempotent } on success, throws on hard failure.
    try {
      const refund = await refundCredits(user.id, refundAmount, {
        originalTransactionId: result.holdTransactionId,
        reason:                'job_cancelled',
      });
      if (refund && refund.transactionId) creditsRefunded = refundAmount;
    } catch (refundErr) {
      console.error(`[cancel] refund failed for job ${result.jobId} amount=${refundAmount}:`, refundErr);
      // Cancel is a success; refund is a separate concern. Ops can reconcile from the ledger.
    }
  }

  return Response.json({
    ok:              true,
    jobId:           result.jobId,
    type:            result.type,
    creditsHeld:     result.creditsHeld,
    creditsKept:     result.creditsHeld - creditsRefunded,
    creditsRefunded,
    processedRows:   result.processedRows,
    totalRows:       result.totalRows,
  });
}
