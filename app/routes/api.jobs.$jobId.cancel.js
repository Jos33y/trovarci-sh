/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/jobs/:jobId/cancel

   Cancel a running bulk job. Refunds the unused portion of the credit
   hold based on processed rows. Type-aware: dispatches to the matching
   cost helper based on job.type ('email' or 'phone').

   Refund math:
     creditsHeld = bulkCost(type, totalRows)        (computed at job start)
     creditsKept = bulkCost(type, processedRows)    (user keeps these for work done)
     refund      = max(0, creditsHeld - creditsKept)

   Email example: 5,000-email job, charged 1,000 credits up front
   (ceil(5000/5) * 1). User cancels at 2,847 processed.
     creditsKept = ceil(2847/5) = 570
     refund      = 1000 - 570 = 430

   Phone example: 100-number job, charged 200 credits up front
   (100 * 2). User cancels at 47 processed.
     creditsKept = 47 * 2 = 94
     refund      = 200 - 94 = 106

   Why bulkCost(processedRows) rather than strict pro-rata:
     For email, the pricing model is per-5 batches. Charging for a
     partial batch would be inconsistent with how the job was billed at
     start. Round to the batch boundary in the user's favour at start,
     in our favour at cancel - a wash that matches what the user expects.

     For phone, the pricing is linear (no batches), so bulkCost and
     pro-rata are mathematically identical. The dispatcher pattern still
     applies for code consistency.

   Auth: required, ownership enforced via cancelJob.

   Response (200):
     {
       ok: true,
       jobId,
       type,                  // 'email' or 'phone'
       creditsHeld,           // what was charged at job start
       creditsKept,           // what the user paid for completed work
       creditsRefunded,       // creditsHeld - creditsKept
       processedRows,
       totalRows
     }

   Response (404): job not found
   Response (403): job not owned (we use 403 here because cancelJob
                   distinguishes; status's ownership opacity matters less
                   for an action endpoint)
   Response (409): job already terminal (can't cancel a complete job)

   ─── Bug fix relative to prior version ───
     The previous cancel route checked `if (refund.ok) creditsRefunded
     = refundAmount` to decide whether to report the refund. But
     refundCredits returns { transactionId, newBalance, idempotent } on
     success and THROWS on hard failure - it never returns { ok: true }.
     So `refund.ok` was always undefined and the response always reported
     creditsRefunded: 0 even when the credit had actually been refunded.
     This route uses .catch() for the rare hard-failure case and assumes
     success when the call returns - which matches the lib's contract.
   ═══════════════════════════════════════════════════════════════════════════ */

import { requireUser }       from '~/utils/session.server';
import { cancelJob }          from '~/lib/jobQueue.server';
import { refundCredits }      from '~/lib/credits.server';
import { bulkCost }           from '~/utils/creditsConfig.server';

export async function action({ request, params }) {
  if (request.method !== 'POST') {
    return Response.json(
      { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'POST required' },
      { status: 405 },
    );
  }

  const user = await requireUser(request);
  const jobId = params.jobId;

  if (!jobId) {
    return Response.json(
      { ok: false, code: 'BAD_JOB_ID', error: 'jobId is required' },
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

  // Compute refund using the type-aware dispatcher. cancelJob now
  // returns result.type ('email' | 'phone'); the dispatcher picks the
  // matching cost function. If somehow type is missing or unknown
  // (shouldn't happen given the schema CHECK), bulkCost throws and the
  // outer try ensures the user still sees a refundable error.
  let creditsKept;
  try {
    creditsKept = bulkCost(result.type, result.processedRows);
  } catch (err) {
    console.error(
      `[cancel] bulkCost dispatch failed for job ${result.jobId} (type=${result.type}):`,
      err,
    );
    // Job is already cancelled in the DB. Return what we know with
    // creditsRefunded=0 and the original code so ops can investigate.
    return Response.json(
      {
        ok:              true,
        jobId:           result.jobId,
        type:            result.type,
        creditsHeld:     result.creditsHeld,
        creditsKept:     result.creditsHeld,
        creditsRefunded: 0,
        processedRows:   result.processedRows,
        totalRows:       result.totalRows,
        warning:         'REFUND_DISPATCH_FAILED',
      },
    );
  }

  const refundAmount = Math.max(0, result.creditsHeld - creditsKept);

  let creditsRefunded = 0;
  if (refundAmount > 0) {
    // refundCredits resolves with { transactionId, newBalance, idempotent }
    // on success and throws on hard failure. We .catch() the throw because
    // the job is already cancelled - we want to surface the cancellation
    // even if the refund itself hit a transient DB issue. Ops can
    // reconcile manually from the ledger; the user has support recourse.
    try {
      const refund = await refundCredits(user.id, refundAmount, {
        originalTransactionId: result.holdTransactionId,
        reason:                'job_cancelled',
      });
      // The lib guarantees a transactionId on success. Treat truthy
      // transactionId as confirmation the refund row was written.
      if (refund && refund.transactionId) {
        creditsRefunded = refundAmount;
      }
    } catch (refundErr) {
      console.error(
        `[cancel] refund failed for job ${result.jobId} amount=${refundAmount}:`,
        refundErr,
      );
      // Continue - cancel is a success; refund is a separate concern.
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
