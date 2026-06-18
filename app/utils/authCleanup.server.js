/**
 * Auth-state cleanup helpers.
 *
 * Three tables grow without bound under live traffic and have no foreign-key
 * cascade or TTL constraint to clip them:
 *
 *   1. auth_rate_limits        - one row per (bucket, minute) since the last
 *                                cleanup. Bounded by traffic, not by users.
 *   2. sessions                - one row per login. Expired or revoked rows
 *                                are dead weight; the partial unique index on
 *                                token_hash means lookups stay fast either
 *                                way, but VACUUM gets slower as bloat grows.
 *   3. email_verification_codes - one row per OTP / reset-token issuance.
 *                                Consumed rows and expired-unconsumed rows
 *                                are equally dead.
 *
 * This module exposes targeted cleanup for each, plus a single orchestrator
 * `runAuthCleanups()` that the worker schedules hourly. Each function is
 * independent and idempotent: running twice in a row deletes nothing the
 * second time.
 *
 * Index hits (verify with EXPLAIN if scale changes):
 *
 *   sessions branch 1 (expires_at < X AND revoked_at IS NULL)
 *     -> partial index `sessions_cleanup` on (expires_at) WHERE revoked_at IS NULL
 *   sessions branch 2 (revoked_at IS NOT NULL AND revoked_at < X)
 *     -> seq scan; low volume in practice, no dedicated index. If revocation
 *        rate ever climbs, add INDEX ON sessions (revoked_at) WHERE revoked_at IS NOT NULL.
 *
 *   email_verification_codes
 *     -> seq scan; the only EVC index is the partial unique on
 *        (user_id, purpose) WHERE consumed_at IS NULL AND expires_at > now(),
 *        which by definition can't be used for cleanup of dead rows.
 *        Volume is signups + password resets; bounded.
 *
 *   auth_rate_limits
 *     -> partial index `auth_rate_limits_cleanup` on (window_start). Already
 *        in production. cleanupOldRateLimitRows lives in rateLimit.server.js.
 *
 * Worker import path: `../app/utils/authCleanup.server.js`. This file uses
 * relative imports only (no `~/` alias) so it resolves under bare Node.
 */

import { sql } from './db.server.js';
import { cleanupOldRateLimitRows } from './rateLimit.server.js';

// ─────────────────────────────────────────────────────────────────────────
// Sessions
// ─────────────────────────────────────────────────────────────────────────

/**
 * Delete sessions that are either expired-and-not-revoked, or revoked
 * older than `graceHours`. Two DELETEs so each query plan is straightforward
 * and uses the available index for branch 1.
 *
 * @param {{ graceHours?: number }} [opts]
 * @returns {Promise<number>} total rows deleted
 */
export async function cleanupExpiredSessions({ graceHours = 24 } = {}) {
  const expiredResult = await sql`
    DELETE FROM sessions
    WHERE revoked_at IS NULL
      AND expires_at < now() - make_interval(hours => ${graceHours})
  `;

  const revokedResult = await sql`
    DELETE FROM sessions
    WHERE revoked_at IS NOT NULL
      AND revoked_at < now() - make_interval(hours => ${graceHours})
  `;

  return (expiredResult.count || 0) + (revokedResult.count || 0);
}

// ─────────────────────────────────────────────────────────────────────────
// Email verification codes (OTPs + password reset tokens)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Delete EVC rows that are either consumed (regardless of age, after a small
 * grace) or expired-unconsumed past the grace. The partial unique index that
 * gates active codes already excludes both states, so deletion has no effect
 * on live auth flows.
 *
 * Grace exists so a freshly-consumed reset token isn't deleted milliseconds
 * after success in case a retry hits within the same second; default 1 hour
 * is comfortable.
 *
 * @param {{ graceHours?: number }} [opts]
 * @returns {Promise<number>} rows deleted
 */
export async function cleanupExpiredEmailVerificationCodes({ graceHours = 1 } = {}) {
  const result = await sql`
    DELETE FROM email_verification_codes
    WHERE (consumed_at IS NOT NULL AND consumed_at < now() - make_interval(hours => ${graceHours}))
       OR (consumed_at IS NULL     AND expires_at  < now() - make_interval(hours => ${graceHours}))
  `;
  return result.count || 0;
}

// ─────────────────────────────────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────────────────────────────────

/**
 * Run all three auth-state cleanups in sequence. Errors in one branch are
 * isolated: the others still run, the failure is returned in the result.
 *
 * Sequenced (not parallel) because each is a write transaction and they
 * touch different tables; running serially keeps lock contention to zero
 * and the total runtime is dominated by network round-trips to PG, not
 * compute. At expected volumes the whole sweep is sub-second.
 *
 * @param {{
 *   rateLimitKeepHours?: number,
 *   sessionGraceHours?: number,
 *   evcGraceHours?: number,
 * }} [opts]
 * @returns {Promise<{
 *   rateLimits: number,
 *   sessions: number,
 *   evcs: number,
 *   durationMs: number,
 *   errors: { stage: string, message: string }[]
 * }>}
 */
export async function runAuthCleanups(opts = {}) {
  const {
    rateLimitKeepHours = parseInt(process.env.AUTH_CLEANUP_RATE_LIMIT_KEEP_HOURS || '24', 10),
    sessionGraceHours  = parseInt(process.env.AUTH_CLEANUP_SESSION_GRACE_HOURS  || '24', 10),
    evcGraceHours      = parseInt(process.env.AUTH_CLEANUP_EVC_GRACE_HOURS      || '1',  10),
  } = opts;

  const startedAt = Date.now();
  const errors = [];
  let rateLimits = 0;
  let sessions = 0;
  let evcs = 0;

  try {
    rateLimits = (await cleanupOldRateLimitRows({ keepHours: rateLimitKeepHours })) || 0;
  } catch (err) {
    errors.push({ stage: 'rateLimits', message: err.message });
  }

  try {
    sessions = await cleanupExpiredSessions({ graceHours: sessionGraceHours });
  } catch (err) {
    errors.push({ stage: 'sessions', message: err.message });
  }

  try {
    evcs = await cleanupExpiredEmailVerificationCodes({ graceHours: evcGraceHours });
  } catch (err) {
    errors.push({ stage: 'evcs', message: err.message });
  }

  return {
    rateLimits,
    sessions,
    evcs,
    durationMs: Date.now() - startedAt,
    errors,
  };
}
