/* ═══════════════════════════════════════════════════════════════════════════
   jobQueue.server.js

   Lifecycle for bulk verification jobs. Builds on the verification_jobs +
   verification_job_items tables created in the Batch 1 migration.

   This module does NOT touch credit balances. The route does spendCredits
   (with credits_held captured into the job row) BEFORE calling
   createBulkJob; cancelJob returns enough info for the route to compute
   the refund and call refundCredits. Same pattern as Email Scorer and
   Phone Verifier - credits and tool work are orchestrated in the route,
   not the lib.

   Worker contract:
     1. claimItems({ limit, type })  -> array of items, marked 'processing'
     2. ... process each via the probe lib ...
     3. markItemDone(id, ...) or markItemError(id, ...) or
        scheduleItemRetry(id, secs)
     4. tickJobProgress(jobId)  -> recomputes job status; if all items
        terminal, marks job 'complete' or 'partial'

   Concurrency safety:
     - claimItems uses FOR UPDATE OF vji SKIP LOCKED - two workers running
       in parallel cannot claim the same row
     - createBulkJob is one transaction with the items insert, so a
       crashed creation never leaves orphans
     - tickJobProgress runs as one transaction so the count and status
       update see the same snapshot
     - cancelJob locks the job row, then bulk-marks items error -
       concurrent worker that just claimed an item will find it
       'processing' (set by claim) and the cancel will move it to error.
       The status='processing' guard on markItemDone/markItemError ensures
       the worker's late finalization writes a no-op rather than
       resurrecting a cancelled item.
   ═══════════════════════════════════════════════════════════════════════════ */

import { sql } from '../utils/db.server.js';
import { refundCredits } from './credits.server.js';
import { bulkCost } from '../utils/creditsConfig.server.js';

const DEFAULT_RETENTION_HOURS = 48;
const MAX_BULK_SIZE = 50_000;
const MAX_INPUT_LENGTH = 254; // RFC 5321 mailbox cap

// ============================================================================
// createBulkJob
// ============================================================================

/**
 * Create a bulk verification job and insert all items in one transaction.
 * The credit hold MUST already be applied (the route calls spendCredits
 * before this); we just persist the job_row + items.
 *
 * Inputs are sanitized: each is trimmed, length-capped to 254 chars, and
 * stored verbatim. Higher-level filtering (dedupe, syntax check) is the
 * caller's responsibility - this lib trusts what it receives.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} [params.type] - 'email' (default). 'phone' reserved for future.
 * @param {string[]} params.inputs - array of raw input strings
 * @param {number} params.creditsHeld - integer credit amount held against this job
 * @param {string} params.holdTransactionId - UUID of the spend transaction
 * @param {string} [params.csvInputKey] - R2 key for the original upload (optional)
 * @param {object} [params.metadata] - JSONB blob for diagnostics
 * @param {number} [params.retentionHours] - default 48
 *
 * @returns {Promise<object>} the inserted verification_jobs row
 */
export async function createBulkJob(params) {
  const {
    userId,
    type = 'email',
    inputs,
    creditsHeld,
    holdTransactionId,
    csvInputKey = null,
    metadata = {},
    retentionHours = DEFAULT_RETENTION_HOURS,
  } = params;

  if (typeof userId !== 'string' || !userId) {
    throw new Error('userId is required');
  }
  if (!['email', 'phone'].includes(type)) {
    throw new Error(`invalid type: ${type}`);
  }
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new Error('inputs must be a non-empty array');
  }
  if (inputs.length > MAX_BULK_SIZE) {
    throw new Error(`bulk size ${inputs.length} exceeds limit ${MAX_BULK_SIZE}`);
  }
  if (!Number.isInteger(creditsHeld) || creditsHeld < 0) {
    throw new Error('creditsHeld must be a non-negative integer');
  }
  if (typeof holdTransactionId !== 'string' || !holdTransactionId) {
    throw new Error('holdTransactionId is required');
  }

  return await sql.begin(async (tx) => {
    const [job] = await tx`
      INSERT INTO verification_jobs (
        user_id, type, status, total_rows, credits_held,
        hold_transaction_id, csv_input_key, metadata, expires_at
      ) VALUES (
        ${userId},
        ${type},
        'pending',
        ${inputs.length},
        ${creditsHeld},
        ${holdTransactionId},
        ${csvInputKey},
        ${sql.json(metadata)},
        now() + make_interval(hours => ${retentionHours})
      )
      RETURNING *
    `;

    const itemRows = inputs.map((raw, i) => ({
      job_id: job.id,
      row_index: i,
      input: String(raw == null ? '' : raw).slice(0, MAX_INPUT_LENGTH),
    }));

    // Bulk insert via sql() helper. Postgres.js auto-batches large arrays.
    await tx`
      INSERT INTO verification_job_items ${tx(itemRows, 'job_id', 'row_index', 'input')}
    `;

    return job;
  });
}

// ============================================================================
// claimItems (worker hot path)
// ============================================================================

/**
 * Atomically claim up to `limit` pending items, marking them 'processing'.
 * Items returned are also subject to:
 *   - parent job status is pending or processing (skips items belonging
 *     to cancelled or completed jobs)
 *   - parent job type matches the requested type
 *   - next_retry is null OR <= now() (graylist retry slots)
 *
 * The FOR UPDATE OF vji SKIP LOCKED clause means concurrent workers
 * receive disjoint sets, never the same item. SKIP LOCKED is the magic;
 * without it, concurrent workers serialize on the lock and throughput
 * collapses.
 *
 * @param {object} [opts]
 * @param {number} [opts.limit] - max items to claim. Default 10.
 * @param {string} [opts.type]  - 'email' (default) or 'phone'
 * @returns {Promise<Array<{id, jobId, rowIndex, input, attempts, userId, jobMetadata}>>}
 */
export async function claimItems(opts = {}) {
  const limit = Number.isFinite(opts.limit) && opts.limit > 0 ? Math.floor(opts.limit) : 10;
  const type = opts.type || 'email';

  return await sql.begin(async (tx) => {
    const items = await tx`
      SELECT
        vji.id,
        vji.job_id    AS "jobId",
        vji.row_index AS "rowIndex",
        vji.input,
        vji.attempts,
        vj.user_id    AS "userId",
        vj.metadata   AS "jobMetadata"
      FROM verification_job_items vji
      JOIN verification_jobs vj ON vj.id = vji.job_id
      WHERE vji.status = 'pending'
        AND (vji.next_retry IS NULL OR vji.next_retry <= now())
        AND vj.status IN ('pending', 'processing')
        AND vj.type = ${type}
      ORDER BY vji.next_retry NULLS FIRST, vji.id
      LIMIT ${limit}
      FOR UPDATE OF vji SKIP LOCKED
    `;

    if (items.length === 0) return [];

    const ids = items.map((i) => i.id);
    await tx`
      UPDATE verification_job_items
      SET status = 'processing',
          claimed_at = now(),
          attempts = attempts + 1
      WHERE id = ANY(${ids})
    `;

    // Reflect the post-UPDATE attempts count in the returned items. The
    // SELECT above ran before the UPDATE, so items[i].attempts holds the
    // pre-claim value. Callers who write `if (item.attempts > MAX_RETRIES)`
    // would otherwise be off by one - the retry budget would burn at half
    // the intended rate. Mutate the returned objects so attempts means
    // "this is attempt N", which is what callers naturally expect.
    for (const item of items) {
      item.attempts = (item.attempts || 0) + 1;
    }

    // Also bump the parent job to processing if still pending. One UPDATE
    // covers all parents touched by this claim batch.
    const jobIds = [...new Set(items.map((i) => i.jobId))];
    await tx`
      UPDATE verification_jobs
      SET status = 'processing',
          started_at = COALESCE(started_at, now())
      WHERE id = ANY(${jobIds})
        AND status = 'pending'
    `;

    return items;
  });
}

// ============================================================================
// markItemDone / markItemError / scheduleItemRetry
// ============================================================================

/**
 * Mark an item as terminally complete with a verdict.
 *
 * Status guard: only updates rows still in 'processing'. If the item was
 * cancelled or already errored out (cancelJob bulk-flips items to 'error'
 * with code 'JOB_CANCELLED'), this UPDATE is a no-op. Without the guard,
 * a worker that finishes its probe AFTER cancelJob ran would resurrect
 * the cancelled item with a 'done' verdict - effectively un-cancelling it
 * and breaking the refund accounting.
 *
 * @param {bigint|number} itemId
 * @param {object} verdict
 * @param {'valid'|'invalid'|'risky'|'unknown'} verdict.category
 * @param {string|null} [verdict.subcategory]
 * @param {string|null} [verdict.smtpResponse]
 * @param {object} [verdict.result] - full result blob persisted to result jsonb
 * @returns {Promise<{ updated: boolean }>} updated=false means the row was
 *   already terminal (cancelled / errored) when we tried to write.
 */
export async function markItemDone(itemId, verdict) {
  const {
    category,
    subcategory = null,
    smtpResponse = null,
    result = {},
  } = verdict || {};

  if (!['valid', 'invalid', 'risky', 'unknown'].includes(category)) {
    throw new Error(`invalid category: ${category}`);
  }

  const res = await sql`
    UPDATE verification_job_items
    SET status        = 'done',
        category      = ${category},
        subcategory   = ${subcategory},
        smtp_response = ${smtpResponse},
        result        = ${sql.json(result)},
        processed_at  = now()
    WHERE id = ${itemId}
      AND status = 'processing'
  `;
  return { updated: res.count > 0 };
}

/**
 * Mark an item as terminally errored (infrastructure failure that we gave
 * up retrying). Unlike markItemDone with category='unknown', this signals
 * the worker hit a problem rather than received an inconclusive response.
 *
 * Status guard: same rationale as markItemDone. A late worker write after
 * cancelJob must not flip the cancelled-error row's error_code to a
 * different value (which would mask the cancellation in audit trails).
 *
 * @returns {Promise<{ updated: boolean }>}
 */
export async function markItemError(itemId, { errorCode, result = {} }) {
  if (typeof errorCode !== 'string' || !errorCode) {
    throw new Error('errorCode is required');
  }
  const res = await sql`
    UPDATE verification_job_items
    SET status       = 'error',
        error_code   = ${errorCode},
        result       = ${sql.json(result)},
        processed_at = now()
    WHERE id = ${itemId}
      AND status = 'processing'
  `;
  return { updated: res.count > 0 };
}

/**
 * Re-queue an item for a graylisting retry. Resets status to 'pending'
 * and sets next_retry to now() + retryAfterSeconds. claimed_at cleared
 * so the row looks fresh to the next claimer.
 *
 * Worker uses this when SMTP returns a 4xx greylist response. Standard
 * schedule per the handoff: +5min, +15min, +60min, then markItemError
 * with code='EMAIL_VERIFY_GREYLISTED_GAVE_UP'.
 *
 * The attempts counter incremented during claimItems is not reset -
 * caller checks attempts to decide whether to schedule another retry or
 * give up.
 *
 * Status guard: only re-queue rows currently 'processing'. A cancelled
 * item must stay errored, not bounce back to pending where the next
 * worker would try to probe it again.
 *
 * @returns {Promise<{ updated: boolean }>}
 */
export async function scheduleItemRetry(itemId, retryAfterSeconds) {
  if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds < 0) {
    throw new Error('retryAfterSeconds must be a non-negative number');
  }
  const res = await sql`
    UPDATE verification_job_items
    SET status     = 'pending',
        next_retry = now() + make_interval(secs => ${Math.floor(retryAfterSeconds)}),
        claimed_at = NULL
    WHERE id = ${itemId}
      AND status = 'processing'
  `;
  return { updated: res.count > 0 };
}

// ============================================================================
// tickJobProgress
// ============================================================================

/**
 * Recompute a job's processed_rows count and update its status if all
 * items are now terminal. Call after each markItemDone / markItemError
 * (cheap query, ~1ms on the (job_id, status) index). Returns the updated
 * counters so the SSE/polling endpoint can stream them without a second
 * query.
 *
 * Status transitions:
 *   pending    -> processing  (when first item starts)
 *   processing -> complete    (all items done, none errored)
 *   processing -> partial     (all items done, some errored)
 *   processing -> processing  (still work to do)
 */
/**
 * Recompute a job's processed_rows count and update its status if all
 * items are now terminal. Call after each markItemDone / markItemError
 * (cheap query, ~1ms on the (job_id, status) index). Returns the updated
 * counters so the SSE/polling endpoint can stream them without a second
 * query.
 *
 * Status transitions:
 *   pending    -> processing  (when first item starts)
 *   processing -> complete    (all items done, none errored)
 *   processing -> partial     (all items done, some errored)
 *   processing -> processing  (still work to do)
 *
 * Status guard: the UPDATE refuses to touch a job whose status is already
 * terminal ('cancelled', 'complete', 'partial'). Without this guard, a
 * worker finishing an in-flight item AFTER cancelJob already flipped the
 * job to 'cancelled' would compute nextStatus='partial' (because cancel
 * marked all remaining items 'error') and overwrite 'cancelled' to
 * 'partial'. The natural-completion refund logic would then fire on top
 * of the cancellation refund. The partial unique index would catch the
 * second refund as idempotent, but the job's display status would be
 * wrong. The guard prevents the race entirely.
 *
 * Return value:
 *   isComplete is true only when THIS tick caused the flip to terminal.
 *   Earlier ticks that found the job still in flight return false; later
 *   ticks where the guard kept us out also return false. Callers rely on
 *   this single-fire signal to drive the natural-completion refund -
 *   firing it on every tick would still be safe (idempotency), but
 *   wasteful.
 */
export async function tickJobProgress(jobId) {
  return await sql.begin(async (tx) => {
    const [counts] = await tx`
      SELECT
        COUNT(*)                                                                  ::int AS total,
        COUNT(*) FILTER (WHERE status IN ('done', 'error'))                       ::int AS terminal,
        COUNT(*) FILTER (WHERE status = 'done' AND category = 'valid')            ::int AS valid,
        COUNT(*) FILTER (WHERE status = 'done' AND category = 'invalid')          ::int AS invalid,
        COUNT(*) FILTER (WHERE status = 'done' AND category = 'risky')            ::int AS risky,
        COUNT(*) FILTER (WHERE status = 'done' AND category = 'unknown')          ::int AS unknown,
        COUNT(*) FILTER (WHERE status = 'error')                                  ::int AS error_count,
        COUNT(*) FILTER (WHERE status = 'pending' AND next_retry IS NOT NULL)     ::int AS retrying
      FROM verification_job_items
      WHERE job_id = ${jobId}
    `;

    const allTerminal = counts.terminal === counts.total;
    const nextStatus = computeNextStatus({
      allTerminal,
      hasErrors: counts.error_count > 0,
      anyTerminal: counts.terminal > 0,
    });

    const [job] = await tx`
      UPDATE verification_jobs
      SET processed_rows = ${counts.terminal},
          status         = COALESCE(${nextStatus}, status),
          completed_at   = CASE WHEN ${allTerminal} THEN now() ELSE completed_at END,
          started_at     = COALESCE(started_at, CASE WHEN ${counts.terminal > 0} THEN now() ELSE NULL END)
      WHERE id = ${jobId}
        AND status NOT IN ('cancelled', 'complete', 'partial')
      RETURNING id, status, processed_rows, total_rows, completed_at
    `;

    return {
      jobId,
      status: job?.status || null,
      processed: counts.terminal,
      total: counts.total,
      retrying: counts.retrying,
      counts: {
        valid: counts.valid,
        invalid: counts.invalid,
        risky: counts.risky,
        unknown: counts.unknown,
        error: counts.error_count,
      },
      // Only true when the UPDATE actually flipped status this call. If the
      // guard kept us out (job already terminal), or if items are still
      // pending, this is false.
      isComplete: !!job && allTerminal && (job.status === 'complete' || job.status === 'partial'),
      completedAt: job?.completed_at || null,
    };
  });
}

function computeNextStatus({ allTerminal, hasErrors, anyTerminal }) {
  if (allTerminal && !hasErrors) return 'complete';
  if (allTerminal && hasErrors)  return 'partial';
  if (anyTerminal)                return 'processing';
  return null; // leave job at whatever it was (pending or processing)
}

// ============================================================================
// refundUnusedCreditsForJob (natural-completion refund)
// ============================================================================

/**
 * Issue a partial refund for items that errored during a bulk job.
 *
 * Why this exists: at job start the route holds creditsHeld = bulkCost(type,
 * totalRows). If 3 of 100 emails fail to verify because IPRoyal hiccuped or
 * an MX briefly went unreachable, the user paid for 3 items they did not
 * receive. That is OUR infrastructure problem, not the user's. We refund
 * the cost of the errored items.
 *
 * Refund formula: bulkCost(type, errorCount).
 *   - For email (5x bulk discount): 1 errored email of a 100-row job is
 *     a 1-credit refund (rounded up in the user's favour, since email is
 *     billed in groups of 5).
 *   - For phone (linear): each errored number refunds the full per-call
 *     credit cost.
 *
 * Idempotency: writes a single 'refund' transaction with referenceId =
 * hold_transaction_id (one per job). The partial unique index
 * ct_idempotent_grant ensures any subsequent call for the same job is a
 * no-op that returns the already-issued refund.
 *
 * Race safety: two workers finishing the last two items concurrently will
 * both see isComplete=true from tickJobProgress (the status guard there
 * makes that race exclusive in practice, but assume not). Both call this
 * helper. The first INSERT wins, the second's INSERT raises 23505, the
 * caught exception path returns idempotent=true. No double refund.
 *
 * Status check: only fires for 'complete' or 'partial' jobs. Cancelled
 * jobs already had their refund issued by cancelJob with the same
 * referenceId, so calling this on a cancelled job would no-op
 * idempotently anyway - but we exit early to avoid the wasted INSERT
 * attempt.
 *
 * Called by: emailProcessor, phoneProcessor (after tickJobProgress
 * returns isComplete=true).
 *
 * @param {string} jobId
 * @returns {Promise<
 *   | { ok: true, refunded: number, idempotent: boolean }
 *   | { ok: false, reason: 'no_errors' | 'not_terminal' | 'job_missing' | 'no_hold' }
 * >}
 */
export async function refundUnusedCreditsForJob(jobId) {
  const [job] = await sql`
    SELECT
      id,
      user_id            AS "userId",
      type,
      status,
      credits_held       AS "creditsHeld",
      hold_transaction_id AS "holdTransactionId"
    FROM verification_jobs
    WHERE id = ${jobId}
    LIMIT 1
  `;
  if (!job) return { ok: false, reason: 'job_missing' };

  // Only natural-completion paths qualify. Cancellation has its own refund.
  if (job.status !== 'complete' && job.status !== 'partial') {
    return { ok: false, reason: 'not_terminal' };
  }

  // hold_transaction_id is set by createBulkJob. Defensive check in case a
  // legacy or hand-inserted row lacks it - we cannot generate an idempotent
  // refund without a referenceId.
  if (!job.holdTransactionId) {
    return { ok: false, reason: 'no_hold' };
  }

  // Pull the error count fresh from items. Could plumb this in from the
  // tick result, but a single indexed COUNT FILTER is sub-millisecond and
  // keeps the helper self-contained.
  const [errorRow] = await sql`
    SELECT COUNT(*) FILTER (WHERE status = 'error')::int AS "errorCount"
    FROM verification_job_items
    WHERE job_id = ${jobId}
  `;
  const errorCount = errorRow?.errorCount || 0;
  if (errorCount === 0) return { ok: false, reason: 'no_errors' };

  // Cap the refund at credits_held. Defence in depth - a reachable case
  // would be: bulk pricing changed between job start and completion, or
  // a future where errorCount somehow exceeds totalRows.
  const refundAmount = Math.min(job.creditsHeld, bulkCost(job.type, errorCount));
  if (refundAmount <= 0) return { ok: false, reason: 'no_errors' };

  const result = await refundCredits(job.userId, refundAmount, {
    originalTransactionId: job.holdTransactionId,
    reason: 'bulk_job_errored_items',
    metadata: {
      jobId: job.id,
      jobType: job.type,
      errorCount,
      creditsHeld: job.creditsHeld,
    },
  });

  return {
    ok: true,
    refunded: refundAmount,
    idempotent: result.idempotent,
  };
}

// ============================================================================
// cancelJob
// ============================================================================

/**
 * Cancel a job. Marks all unprocessed items as error with code
 * 'JOB_CANCELLED' so concurrent workers don't try to re-claim them. Sets
 * the job to 'cancelled'.
 *
 * Returns the data the caller needs to compute and apply the refund:
 *   type:               job type ('email' | 'phone'); used by the route
 *                       to dispatch the matching cost helper
 *   creditsHeld:        what was charged at job start
 *   processedRows:      count of items in terminal state at cancel time
 *   holdTransactionId:  reference for refundCredits()
 *
 * The caller computes refund using the bulkCost dispatcher:
 *   refund = creditsHeld - bulkCost(type, processedRows)
 * and calls refundCredits(userId, refund, { originalTransactionId: holdTransactionId, reason: 'job_cancelled' })
 *
 * Why the lib doesn't do credits itself:
 *   - Credit math is policy (1 per single, 1 per 5 bulk email, 2 per
 *     bulk phone). Putting it here couples the lib to the pricing model.
 *   - Same pattern as Phone Verifier and Email Scorer: tool libs return,
 *     routes do credits. Stays consistent.
 *
 * Returns:
 *   { ok: true, type, ... refund-info ... }
 *   { ok: false, code: 'JOB_NOT_FOUND' }
 *   { ok: false, code: 'JOB_NOT_OWNED' }
 *   { ok: false, code: 'JOB_NOT_CANCELLABLE' }   - already terminal
 */
export async function cancelJob(jobId, userId) {
  return await sql.begin(async (tx) => {
    const [job] = await tx`
      SELECT id, user_id, type, status, credits_held, total_rows, processed_rows,
             hold_transaction_id
      FROM verification_jobs
      WHERE id = ${jobId}
      FOR UPDATE
    `;

    if (!job) return { ok: false, code: 'JOB_NOT_FOUND' };
    if (job.user_id !== userId) return { ok: false, code: 'JOB_NOT_OWNED' };
    if (!['pending', 'processing'].includes(job.status)) {
      return { ok: false, code: 'JOB_NOT_CANCELLABLE', currentStatus: job.status };
    }

    // Mark remaining work as errored so workers don't pick up cancelled rows.
    // Items currently 'processing' get marked too. The status='processing'
    // guard on markItemDone/markItemError ensures the worker's late
    // finalization writes a no-op against the row we just flipped to
    // 'error', so the cancellation sticks.
    await tx`
      UPDATE verification_job_items
      SET status       = 'error',
          error_code   = 'JOB_CANCELLED',
          processed_at = now()
      WHERE job_id = ${jobId}
        AND status IN ('pending', 'processing')
    `;

    // Recount processed in case workers finalized something while we held the lock.
    const [counts] = await tx`
      SELECT COUNT(*) FILTER (WHERE status = 'done')::int AS processed_done
      FROM verification_job_items
      WHERE job_id = ${jobId}
    `;

    await tx`
      UPDATE verification_jobs
      SET status         = 'cancelled',
          processed_rows = ${counts.processed_done},
          completed_at   = now()
      WHERE id = ${jobId}
    `;

    return {
      ok: true,
      jobId: job.id,
      type: job.type,
      creditsHeld: job.credits_held,
      processedRows: counts.processed_done,
      totalRows: job.total_rows,
      holdTransactionId: job.hold_transaction_id,
    };
  });
}

// ============================================================================
// Read helpers
// ============================================================================

/**
 * Get a job by id, scoped to a user. Returns null if missing or not owned.
 * Used by the status endpoint and the SSE handler.
 */
export async function getJobForUser(jobId, userId) {
  const [job] = await sql`
    SELECT *
    FROM verification_jobs
    WHERE id = ${jobId} AND user_id = ${userId}
    LIMIT 1
  `;
  return job || null;
}

/**
 * Get a snapshot of a job's progress without locking. Cheap read for the
 * polling fallback endpoint.
 */
export async function getJobProgress(jobId) {
  const [row] = await sql`
    SELECT
      vj.id,
      vj.status,
      vj.total_rows                                                              AS "totalRows",
      vj.processed_rows                                                          AS "processedRows",
      vj.completed_at                                                            AS "completedAt",
      COUNT(vji.*) FILTER (WHERE vji.status = 'done' AND vji.category = 'valid')   ::int AS valid,
      COUNT(vji.*) FILTER (WHERE vji.status = 'done' AND vji.category = 'invalid') ::int AS invalid,
      COUNT(vji.*) FILTER (WHERE vji.status = 'done' AND vji.category = 'risky')   ::int AS risky,
      COUNT(vji.*) FILTER (WHERE vji.status = 'done' AND vji.category = 'unknown') ::int AS unknown,
      COUNT(vji.*) FILTER (WHERE vji.status = 'error')                             ::int AS error_count,
      COUNT(vji.*) FILTER (WHERE vji.status = 'pending' AND vji.next_retry IS NOT NULL)
                                                                                   ::int AS retrying
    FROM verification_jobs vj
    LEFT JOIN verification_job_items vji ON vji.job_id = vj.id
    WHERE vj.id = ${jobId}
    GROUP BY vj.id
  `;
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    totalRows: row.totalRows,
    processedRows: row.processedRows,
    completedAt: row.completedAt,
    counts: {
      valid: row.valid,
      invalid: row.invalid,
      risky: row.risky,
      unknown: row.unknown,
      error: row.error_count,
    },
    retrying: row.retrying,
  };
}

/**
 * List a user's recent bulk verification jobs for the dashboard.
 *
 * Includes per-job aggregates (validCount, errorCount) computed from the
 * items table via a single grouped LEFT JOIN. For ~hundreds of jobs this
 * is sub-50ms; if the table grows past ~10k jobs/user we should
 * denormalize valid_count / error_count into the parent row at
 * tickJobProgress time and switch this query to a flat SELECT.
 *
 * Pagination is offset-based; for 99% of users the total count never
 * exceeds a few hundred.
 *
 * @returns {Promise<Array<{
 *   id: string,
 *   type: 'email' | 'phone',
 *   status: 'pending' | 'processing' | 'complete' | 'partial' | 'cancelled',
 *   totalRows: number,
 *   processedRows: number,
 *   creditsHeld: number,
 *   validCount: number,
 *   errorCount: number,
 *   metadata: object,
 *   createdAt: Date,
 *   completedAt: Date | null,
 *   expiresAt: Date,
 * }>>}
 */
export async function listJobsForUser(userId, { limit = 100, offset = 0 } = {}) {
  const rows = await sql`
    SELECT
      vj.id,
      vj.type,
      vj.status,
      vj.total_rows                                          AS "totalRows",
      vj.processed_rows                                      AS "processedRows",
      vj.credits_held                                        AS "creditsHeld",
      vj.metadata,
      vj.created_at                                          AS "createdAt",
      vj.completed_at                                        AS "completedAt",
      vj.expires_at                                          AS "expiresAt",
      COALESCE(SUM(CASE WHEN vji.status = 'done'
                         AND vji.category = 'valid' THEN 1 ELSE 0 END), 0)::int AS "validCount",
      COALESCE(SUM(CASE WHEN vji.status = 'error'  THEN 1 ELSE 0 END), 0)::int AS "errorCount"
    FROM verification_jobs vj
    LEFT JOIN verification_job_items vji ON vji.job_id = vj.id
    WHERE vj.user_id = ${userId}
    GROUP BY vj.id
    ORDER BY vj.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return rows;
}

// ============================================================================
// Cleanup tasks (called from cron / worker tick)
// ============================================================================

/**
 * Drop expired jobs (and via ON DELETE CASCADE, their items). Returns
 * count deleted. Run nightly or every few hours.
 */
export async function cleanupExpiredJobs() {
  const result = await sql`
    DELETE FROM verification_jobs
    WHERE expires_at < now()
  `;
  return result.count;
}

/**
 * Find jobs that are stuck - items have been 'processing' for too long
 * (worker died mid-claim). Returns ids; caller decides what to do
 * (typically: reset items to 'pending' and let the next worker claim).
 *
 * Default threshold: 10 minutes. SMTP probes should never take longer.
 */
export async function findStuckItems({ olderThanMinutes = 10 } = {}) {
  const rows = await sql`
    SELECT id, job_id AS "jobId", input, attempts, claimed_at AS "claimedAt"
    FROM verification_job_items
    WHERE status = 'processing'
      AND claimed_at < now() - make_interval(mins => ${olderThanMinutes})
    LIMIT 200
  `;
  return rows;
}

/**
 * Reset a stuck item back to pending so the next worker tick can retry.
 * Does NOT increment attempts (the existing claim count stands).
 */
export async function resetStuckItem(itemId) {
  await sql`
    UPDATE verification_job_items
    SET status = 'pending',
        claimed_at = NULL
    WHERE id = ${itemId}
      AND status = 'processing'
  `;
}
