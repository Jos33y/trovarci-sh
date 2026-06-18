/**
 * Rate limiting via bucketed counters in Postgres.
 *
 * Design:
 *   - One row per (bucket_key, minute_window_start).
 *   - increment() does an UPSERT, incrementing on conflict. Atomic.
 *   - check() runs a bounded SUM() over the sliding window.
 *   - Cleanup runs nightly to drop rows > 24h old (see SETUP.md for the cron).
 *
 * At the TODO-specified limits (5 per 15 min per IP, 10 per 15 min per email)
 * each bucket holds at most ~15 rows. Query plan for the SUM is a bounded
 * index range scan. Sub-millisecond on hot data.
 *
 * When to move to Redis: if you hit thousands of login attempts per second
 * and want the DB off the hot path. Not a 2026 problem.
 */

import { sql } from './db.server.js';

/**
 * Standard bucket keys. Keep them short and prefixed so forensic queries
 * can pattern-match easily, e.g. bucket_key LIKE 'login:ip:%'.
 */
export const rateLimitKeys = {
  loginByIp:                    (ip)     => `login:ip:${ip}`,
  loginByEmail:                 (email)  => `login:email:${String(email).toLowerCase()}`,
  signupByIp:                   (ip)     => `signup:ip:${ip}`,
  signupCollisionByEmail:       (email)  => `signup:collision:${String(email).toLowerCase()}`,
  forgotPasswordByIp:           (ip)     => `forgot:ip:${ip}`,
  forgotPasswordByEmail:        (email)  => `forgot:email:${String(email).toLowerCase()}`,
  verifyCodeByUser:             (userId) => `verify:user:${userId}`,
  resendCodeByUser:             (userId) => `resend:user:${userId}`,
  emailVerifySingleByUser:      (userId) => `emailverify:single:user:${userId}`,
  emailVerifyBulkStartByUser:   (userId) => `emailverify:bulk_start:user:${userId}`,
  emailVerifyAnonByIp:          (ip)     => `emailverify:anon:ip:${ip}`,
  // Phone Verifier bulk start. Single-mode phone uses ad-hoc keys in
  // api.tools.verify-number.js (CARRIER_RL_BUCKET); bulk gets its own
  // standardised key here so cancellation refunds and rate-limit logging
  // share the same prefix scheme as the email tool.
  phoneVerifyBulkStartByUser:   (userId) => `phoneverify:bulk_start:user:${userId}`,
};

/**
 * Standard limit policies. Match the Section 01 spec for auth flows.
 * Tool-specific policies match what each tool's API route enforces.
 */
export const rateLimitPolicies = {
  loginByIp:                    { windowMinutes: 15, maxAttempts: 5 },
  loginByEmail:                 { windowMinutes: 15, maxAttempts: 10 },
  signupByIp:                   { windowMinutes: 60, maxAttempts: 10 },
  signupCollisionByEmail:       { windowMinutes: 60, maxAttempts: 1 },
  forgotPasswordByIp:           { windowMinutes: 15, maxAttempts: 5 },
  forgotPasswordByEmail:        { windowMinutes: 60, maxAttempts: 3 },
  resendCodePerMinute:          { windowMinutes: 1,  maxAttempts: 1 },
  resendCodePerHour:            { windowMinutes: 60, maxAttempts: 3 },
  // Email Verifier tool policies.
  // Single mode is auth-required (per the no-free-trial principle), so
  // 100/hour per user is generous for real workflows and tight enough to
  // catch scripted abuse before it bleeds proxy budget.
  emailVerifySingleByUser:      { windowMinutes: 60, maxAttempts: 100 },
  // Bulk job starts are expensive (proxy spend, worker time). 10/hour
  // per user matches the handoff requirement and stops anyone uploading
  // a fresh 50k-row CSV every minute.
  emailVerifyBulkStartByUser:   { windowMinutes: 60, maxAttempts: 10 },
  // Anonymous hits to either endpoint return 401 AUTH_REQUIRED before
  // any probe runs, but the route still hits the DB. This bucket
  // protects against unauthenticated flood attacks. 10/hour is tight
  // because legitimate users pass through this path at most once per
  // session before signup.
  emailVerifyAnonByIp:          { windowMinutes: 60, maxAttempts: 10 },
  // Phone Verifier bulk job starts. Each successful start commits credits
  // and creates queue rows that the worker burns Twilio API budget on.
  // Same 10/hour ceiling as email bulk: tight enough to catch accidental
  // double-clicks and scripted abuse, generous enough for any real workflow.
  phoneVerifyBulkStartByUser:   { windowMinutes: 60, maxAttempts: 10 },
};

/**
 * Increment the counter and return whether the caller is still within the
 * policy. Single round-trip via CTE (upsert + windowed sum in one statement).
 *
 * Returns:
 *   {
 *     allowed:   boolean,    // true if attempts <= maxAttempts AFTER this one
 *     attempts:  number,     // current count in window (inclusive of this attempt)
 *     remaining: number,     // max(0, maxAttempts - attempts)
 *     retryAfterSeconds: number | null  // when the next slot frees up, if over limit
 *   }
 */
export async function checkAndIncrement(bucketKey, policy) {
  const { windowMinutes, maxAttempts } = policy;

  const [row] = await sql`
    WITH upsert AS (
      INSERT INTO auth_rate_limits (bucket_key, window_start, attempts)
      VALUES (${bucketKey}, date_trunc('minute', now()), 1)
      ON CONFLICT (bucket_key, window_start)
      DO UPDATE SET attempts = auth_rate_limits.attempts + 1
      RETURNING 1
    )
    SELECT
      COALESCE(SUM(attempts), 0)::int AS total,
      MIN(window_start)               AS oldest_window
    FROM auth_rate_limits
    WHERE bucket_key = ${bucketKey}
      AND window_start > now() - make_interval(mins => ${windowMinutes})
  `;

  const attempts = row.total;
  const allowed = attempts <= maxAttempts;
  const remaining = Math.max(0, maxAttempts - attempts);

  let retryAfterSeconds = null;
  if (!allowed && row.oldest_window) {
    // The oldest attempt in the window falls off `windowMinutes` after it was
    // recorded. That's when the sum drops by at least 1.
    const freesAt =
      new Date(row.oldest_window).getTime() + windowMinutes * 60 * 1000;
    retryAfterSeconds = Math.max(1, Math.ceil((freesAt - Date.now()) / 1000));
  }

  return { allowed, attempts, remaining, retryAfterSeconds };
}

/**
 * Clear a bucket. Use after a successful login to reset the per-email counter
 * so the user does not get locked out by their own earlier typos.
 */
export async function resetBucket(bucketKey) {
  await sql`DELETE FROM auth_rate_limits WHERE bucket_key = ${bucketKey}`;
}

/**
 * Housekeeping. Call from a nightly job (see SETUP.md). Keeps the table
 * bounded regardless of traffic patterns.
 */
export async function cleanupOldRateLimitRows({ keepHours = 24 } = {}) {
  const result = await sql`
    DELETE FROM auth_rate_limits
    WHERE window_start < now() - make_interval(hours => ${keepHours})
  `;
  return result.count;
}
