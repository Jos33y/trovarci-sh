/* ═══════════════════════════════════════════════════════════════════════════
   worker/emailProcessor.js

   Per-item processor. Wraps verifyOneEmail with retry policy and
   progress ticking. The main loop calls processItem(claimedItem) once
   per claim; this function does the rest (probe, classify, write back,
   update job counter).

   Retry policy:

     Greylist (4xx SMTP, ok:true with greylisted:true):
       attempt 1 -> retry in 5min
       attempt 2 -> retry in 15min
       attempt 3 -> retry in 60min
       attempt 4 -> mark final unknown/greylist (gave up)

     Infrastructure failure (ok:false from verifyOneEmail):
       attempt 1 -> retry in 30s
       attempt 2 -> mark error with the failure code

     Successful verdict (ok:true, no greylist):
       always terminal; markItemDone with the verdict

   Why retry infra failures only once:
     A transient proxy timeout or TCP reset is worth one redo. Persistent
     infra failure means the worker hit something fundamentally broken
     (proxy down, MX permanently unreachable). Pounding on it eats the
     queue.

   Why retry greylist 3x with growing intervals:
     Standard postgrey defaults at 5min. Sendmail-style milter-greylist
     unblocks at 15. The 60min hop catches the long tail. Beyond an
     hour it stops being "try later" and starts being "this server is
     not coming back to us" - mark as unknown and move on.

   Never throws. verifyOneEmail is contractually never-throws; this
   function still wraps it in try/catch as belt-and-braces because a
   crash here would leave an item stuck in 'processing' forever.
   ═══════════════════════════════════════════════════════════════════════════ */

import { verifyOneEmail } from '../app/lib/emailVerify.server.js';
import {
  markItemDone,
  markItemError,
  scheduleItemRetry,
  tickJobProgress,
  refundUnusedCreditsForJob,
} from '../app/lib/jobQueue.server.js';

// Greylisting retry schedule, in seconds: 5min, 15min, 60min
const GREYLIST_RETRY_SECONDS = [5 * 60, 15 * 60, 60 * 60];

// Infrastructure failure retry: 1 retry after 30s
const INFRA_RETRY_SECONDS = 30;
const INFRA_RETRY_LIMIT   = 1; // attempts <= this means "still has retry budget"

/**
 * Process a single claimed item end-to-end. Always finalizes the item
 * row (done | error | scheduled_retry) and ticks the parent job's
 * progress count.
 *
 * @param {object} item - row returned by jobQueue.claimItems()
 *   { id, jobId, rowIndex, input, attempts, userId, jobMetadata }
 */
export async function processItem(item) {
  let result;
  try {
    result = await verifyOneEmail(item.input);
  } catch (err) {
    // verifyOneEmail is contractually never-throws, but we belt-and-brace
    // because a thrown error here would orphan the row in 'processing'.
    console.error(`[worker] uncaught throw verifying ${item.input}:`, err);
    await safeMarkError(item.id, 'EMAIL_VERIFY_UNCAUGHT', { error: String(err) });
    await safeTick(item.jobId);
    return;
  }

  // Greylist branch (ok:true, greylisted:true)
  if (result.ok && result.greylisted) {
    if (item.attempts > GREYLIST_RETRY_SECONDS.length) {
      // Used all retries - accept the unknown verdict as terminal
      await safeMarkDone(item.id, {
        category:     'unknown',
        subcategory:  'greylist',
        smtpResponse: result.result?.smtpResponse || null,
        result:       { ...(result.result || {}), greylistGaveUp: true },
      });
    } else {
      const delay = GREYLIST_RETRY_SECONDS[item.attempts - 1];
      await safeScheduleRetry(item.id, delay);
    }
    await safeTick(item.jobId);
    return;
  }

  // Infrastructure failure (ok:false)
  if (!result.ok) {
    if (item.attempts <= INFRA_RETRY_LIMIT) {
      await safeScheduleRetry(item.id, INFRA_RETRY_SECONDS);
    } else {
      await safeMarkError(item.id, result.code || 'EMAIL_VERIFY_PROBE_FAILED', {
        error:   result.error,
        partial: result.result || null,
      });
    }
    await safeTick(item.jobId);
    return;
  }

  // Successful verdict (ok:true, no greylist)
  await safeMarkDone(item.id, {
    category:     result.result.category,
    subcategory:  result.result.subcategory,
    smtpResponse: result.result.smtpResponse,
    result:       result.result,
  });
  await safeTick(item.jobId);
}

/* ─── Safe wrappers ────────────────────────────────────────────────────────
   The processor must finish even if a finalize call throws (e.g. transient
   DB hiccup). We log and move on; the stuck-item recovery loop will pick
   up anything left in 'processing' state after 10 minutes.
   ──────────────────────────────────────────────────────────────────────── */

async function safeMarkDone(itemId, verdict) {
  try { await markItemDone(itemId, verdict); }
  catch (err) { console.error(`[worker] markItemDone failed for ${itemId}:`, err.message); }
}

async function safeMarkError(itemId, code, payload) {
  try { await markItemError(itemId, { errorCode: code, result: payload }); }
  catch (err) { console.error(`[worker] markItemError failed for ${itemId}:`, err.message); }
}

async function safeScheduleRetry(itemId, delaySeconds) {
  try { await scheduleItemRetry(itemId, delaySeconds); }
  catch (err) { console.error(`[worker] scheduleItemRetry failed for ${itemId}:`, err.message); }
}

async function safeTick(jobId) {
  let tickResult = null;
  try {
    tickResult = await tickJobProgress(jobId);
  } catch (err) {
    console.error(`[worker] tickJobProgress failed for ${jobId}:`, err.message);
    return;
  }

  // Natural-completion refund path. Fires once per job lifecycle, on the
  // tick that flipped status to 'complete' or 'partial'. The status guard
  // in tickJobProgress and the partial unique index on credit_transactions
  // both protect against double-firing in race conditions.
  if (tickResult?.isComplete && tickResult.counts.error > 0) {
    try {
      const r = await refundUnusedCreditsForJob(jobId);
      if (r?.ok && !r.idempotent) {
        console.log(`[worker:email] refunded ${r.refunded} credits on natural completion of job ${jobId} (${tickResult.counts.error} errored items)`);
      }
    } catch (err) {
      // Non-fatal. The job is already terminal; the user got their results.
      // Refund will need to be issued manually via admin if this keeps
      // failing. Log loudly so the next time someone opens logs they see it.
      console.error(`[worker:email] refundUnusedCreditsForJob failed for ${jobId}:`, err.message);
    }
  }
}
