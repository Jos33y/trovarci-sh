// Lifecycle for bulk verification jobs. Does not touch credit balances: routes spend
// and refund, this module only reports the counts those decisions need.

import { sql } from '../utils/db.server.js';
import { refundCredits } from './credits.server.js';
import { bulkCost } from '../utils/creditsConfig.server.js';

const DEFAULT_RETENTION_HOURS = 48;
const MAX_BULK_SIZE = 50_000;
const MAX_INPUT_LENGTH = 254; // RFC 5321 mailbox cap

// ============================================================================
// createBulkJob
// ============================================================================

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

export async function markItemDone(itemId, verdict) {
  const {
    category,
    subcategory = null,
    smtpResponse = null,
    result = {},
    billable = null,
  } = verdict || {};

  if (!['valid', 'invalid', 'risky', 'unknown'].includes(category)) {
    throw new Error(`invalid category: ${category}`);
  }

  // null means unknown and counts as chargeable. Only explicit false earns a refund,
  // so a missing flag cannot give away verifications.
  const billableFlag = billable === true ? true : billable === false ? false : null;

  const res = await sql`
    UPDATE verification_job_items
    SET status        = 'done',
        category      = ${category},
        subcategory   = ${subcategory},
        smtp_response = ${smtpResponse},
        result        = ${sql.json(result)},
        billable      = ${billableFlag},
        processed_at  = now()
    WHERE id = ${itemId}
      AND status = 'processing'
  `;
  return { updated: res.count > 0 };
}

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

// Exactly ONE refund per job: errored rows plus rows no vendor charged for.
// refundCredits keys idempotency on (user_id, type, reference_id) with reason in
// metadata, so a second refund against the same hold silently pays zero. Both counts
// must settle here. NULL billable counts as chargeable.
export async function refundUnusedCreditsForJob(jobId) {
  const [job] = await sql`
    SELECT
      id,
      user_id            AS "userId",
      type,
      status,
      total_rows         AS "totalRows",
      credits_held       AS "creditsHeld",
      hold_transaction_id AS "holdTransactionId"
    FROM verification_jobs
    WHERE id = ${jobId}
    LIMIT 1
  `;
  if (!job) return { ok: false, reason: 'job_missing' };

  // Cancellation has its own refund path.
  if (job.status !== 'complete' && job.status !== 'partial') {
    return { ok: false, reason: 'not_terminal' };
  }
  if (!job.holdTransactionId) return { ok: false, reason: 'no_hold' };

  const [counts] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'error')::int AS "errorCount",
      COUNT(*) FILTER (WHERE status = 'done' AND billable = false)::int AS "nonBillableCount"
    FROM verification_job_items
    WHERE job_id = ${jobId}
  `;
  const errorCount = counts?.errorCount || 0;
  const nonBillableCount = counts?.nonBillableCount || 0;

  // Twilio bills every lookup including NOT_FOUND, so phone refunds errors only.
  const refundableRows = job.type === 'phone' ? errorCount : errorCount + nonBillableCount;
  if (refundableRows <= 0) return { ok: false, reason: 'nothing_refundable' };

  const refundAmount = Math.min(job.creditsHeld, bulkCost(job.type, refundableRows));
  if (refundAmount <= 0) return { ok: false, reason: 'nothing_refundable' };

  const result = await refundCredits(job.userId, refundAmount, {
    originalTransactionId: job.holdTransactionId,
    reason: 'bulk_job_unconsumed_rows',
    metadata: {
      jobId: job.id,
      jobType: job.type,
      errorCount,
      nonBillableCount,
      totalRows: job.totalRows,
      creditsHeld: job.creditsHeld,
    },
  });

  return { ok: true, refunded: refundAmount, errorCount, nonBillableCount, idempotent: result.idempotent };
}

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
    // finalization writes a no-op against the row now flipped to
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
    // billable_done drives the refund: a done row we were never charged for is not kept.
    const [counts] = await tx`
      SELECT
        COUNT(*) FILTER (WHERE status = 'done')::int AS processed_done,
        COUNT(*) FILTER (WHERE status = 'done' AND billable IS NOT false)::int AS billable_done
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
      billableRows: counts.billable_done,
      totalRows: job.total_rows,
      holdTransactionId: job.hold_transaction_id,
    };
  });
}

// ============================================================================
// Read helpers
// ============================================================================

export async function getJobForUser(jobId, userId) {
  const [job] = await sql`
    SELECT *
    FROM verification_jobs
    WHERE id = ${jobId} AND user_id = ${userId}
    LIMIT 1
  `;
  return job || null;
}

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

export async function cleanupExpiredJobs() {
  const result = await sql`
    DELETE FROM verification_jobs
    WHERE expires_at < now()
  `;
  return result.count;
}

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

export async function resetStuckItem(itemId) {
  await sql`
    UPDATE verification_job_items
    SET status = 'pending',
        claimed_at = NULL
    WHERE id = ${itemId}
      AND status = 'processing'
  `;
}
