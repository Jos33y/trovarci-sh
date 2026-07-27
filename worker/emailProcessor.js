// Per-item email processor. Wraps verifyOneEmail with retry policy and progress ticking.
// Greylist retries at 5/15/60 min, infra retries once at 30s, then terminal error.

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
    billable:     result.result.billable,
  });
  await safeTick(item.jobId);
}

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

  // Natural-completion refund. Always call on completion: refundable rows are
  // errored items plus rows no vendor charged for, and the tick result only counts
  // the former. refundUnusedCreditsForJob returns reason:'nothing_refundable' when
  // there is nothing to pay back. The status guard in tickJobProgress and the
  // partial unique index on credit_transactions protect against double-firing.
  if (tickResult?.isComplete) {
    try {
      const r = await refundUnusedCreditsForJob(jobId);
      if (r?.ok && !r.idempotent) {
        console.log(`[worker:email] refunded ${r.refunded} credits on job ${jobId} (${r.errorCount} errored, ${r.nonBillableCount} non-billable)`);
      }
    } catch (err) {
      // Non-fatal. The job is terminal and the user has results. Log loudly so a
      // stuck refund is visible; admin can issue it manually.
      console.error(`[worker:email] refundUnusedCreditsForJob failed for ${jobId}:`, err.message);
    }
  }
}
