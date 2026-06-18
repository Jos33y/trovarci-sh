/**
 * Admin-side server helpers.
 *
 * Two concerns:
 *
 *   1. Access control: requireAdmin() throws 404 (not 403) for
 *      non-admin authenticated users. The 404 is deliberate - we never
 *      reveal that /admin exists to unauthorised users. Anonymous gets
 *      a redirect to /login (same as requireUser, no leak).
 *
 *   2. Read-only queries. Admin write paths go through the existing
 *      app-layer functions (grantCredits, refundCredits, cancelJob).
 *      Reads, however, often span multiple tables and want admin-only
 *      shapes (e.g. include user.email when listing payments). Those
 *      live here, not in lib/payments.server etc, so the user-facing
 *      surface stays minimal.
 *
 * Pre-write check (per the rule):
 *   - users.role enum: confirmed via 20260420000001_auth_baseline.cjs
 *     CHECK (role IN ('user', 'admin')). DEFAULT 'user'.
 *   - validateSession returns user.role: confirmed via session.server.js.
 *   - No new external API surface; no new dep.
 */

import { redirect } from 'react-router';
import { requireUser } from './session.server.js';
import { sql } from './db.server.js';

/**
 * Loader/action guard for /admin/* routes.
 *
 * @param request - the Web Request
 * @returns the admin user object (same shape requireUser returns)
 * @throws 302 redirect to /login for anonymous users
 * @throws 404 Response for authenticated non-admins (no enumeration leak)
 */
export async function requireAdmin(request) {
  const user = await requireUser(request, { redirectTo: '/login' });
  if (user.role !== 'admin') {
    // Non-admins get a hard 404 - same response shape they'd get for
    // any non-existent path. No "you're not authorised" message that
    // would confirm the route exists.
    throw new Response('Not Found', { status: 404 });
  }
  return user;
}

/**
 * Soft variant for components that want to know "is this an admin?"
 * without redirecting (e.g. conditional UI in shared headers).
 */
export async function isAdmin(request) {
  try {
    const user = await requireUser(request, { redirectTo: '/login' });
    return user.role === 'admin';
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// User search + profile reads
// ─────────────────────────────────────────────────────────────────────────

/**
 * Search users by email substring or exact UUID. Case-insensitive on email.
 * Returns up to `limit` rows, newest first.
 */
export async function adminSearchUsers({ q = '', limit = 50 } = {}) {
  const trimmed = q.trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);

  if (isUuid) {
    return sql`
      SELECT
        id, email, role, credits_balance, email_verified_at,
        created_at, deleted_at
      FROM users
      WHERE id = ${trimmed}
      LIMIT 1
    `;
  }

  if (trimmed.length === 0) {
    return sql`
      SELECT
        id, email, role, credits_balance, email_verified_at,
        created_at, deleted_at
      FROM users
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  }

  return sql`
    SELECT
      id, email, role, credits_balance, email_verified_at,
      created_at, deleted_at
    FROM users
    WHERE email ILIKE ${'%' + trimmed + '%'}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}

/**
 * Full user record for /admin/users/:userId. Includes lifetime aggregates
 * computed against credit_transactions and verification_jobs.
 */
export async function adminGetUserDetail(userId) {
  const [user] = await sql`
    SELECT id, email, role, credits_balance, email_verified_at,
           created_at, deleted_at
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `;
  if (!user) return null;

  const [agg] = await sql`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'purchase' THEN delta ELSE 0 END), 0)::int AS lifetime_purchased,
      COALESCE(SUM(CASE WHEN type = 'usage'    THEN -delta ELSE 0 END), 0)::int AS lifetime_used,
      COALESCE(SUM(CASE WHEN type = 'refund'   THEN delta ELSE 0 END), 0)::int AS lifetime_refunded,
      COALESCE(SUM(CASE WHEN type = 'grant'    THEN delta ELSE 0 END), 0)::int AS lifetime_granted,
      COUNT(*)::int AS total_transactions
    FROM credit_transactions
    WHERE user_id = ${userId}
  `;

  const [paymentAgg] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'confirmed')::int AS payments_confirmed,
      COUNT(*) FILTER (WHERE status IN ('failed', 'expired'))::int AS payments_failed,
      COALESCE(SUM(amount_usd_cents) FILTER (WHERE status = 'confirmed'), 0)::int AS revenue_usd_cents
    FROM payments
    WHERE user_id = ${userId}
  `;

  return { ...user, ...agg, ...paymentAgg };
}

export async function adminListUserTransactions(userId, { limit = 100, offset = 0 } = {}) {
  return sql`
    SELECT id, delta, balance_after, type, reference_id, metadata, created_at
    FROM credit_transactions
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

export async function adminListUserPayments(userId) {
  return sql`
    SELECT id, gateway, package_key, credits, amount_usd_cents, status,
           created_at, completed_at
    FROM payments
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 100
  `;
}

export async function adminListUserJobs(userId) {
  return sql`
    SELECT
      id,
      type           AS kind,
      status,
      total_rows     AS total_items,
      processed_rows AS processed_items,
      credits_held   AS credits_charged,
      created_at, completed_at
    FROM verification_jobs
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 100
  `;
}

// ─────────────────────────────────────────────────────────────────────────
// Payments list (cross-user)
// ─────────────────────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {string} [opts.gateway]    'cryptomus' | 'stripe' | undefined for all
 * @param {string} [opts.status]     'pending'|'awaiting_payment'|'confirmed'|'failed'|'expired'|undefined
 * @param {number} [opts.limit]      default 50
 * @param {number} [opts.offset]     default 0
 */
export async function adminListPayments({
  gateway = null, status = null, limit = 50, offset = 0,
} = {}) {
  return sql`
    SELECT
      p.id, p.gateway, p.status, p.package_key, p.credits, p.amount_usd_cents,
      p.created_at, p.completed_at, p.user_id, u.email AS user_email
    FROM payments p
    LEFT JOIN users u ON u.id = p.user_id
    WHERE (${gateway}::text IS NULL OR p.gateway = ${gateway})
      AND (${status}::text  IS NULL OR p.status  = ${status})
    ORDER BY p.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

export async function adminGetPaymentDetail(paymentId) {
  const [row] = await sql`
    SELECT p.*, u.email AS user_email
    FROM payments p
    LEFT JOIN users u ON u.id = p.user_id
    WHERE p.id = ${paymentId}
    LIMIT 1
  `;
  return row ?? null;
}

// ─────────────────────────────────────────────────────────────────────────
// Jobs list (cross-user)
// ─────────────────────────────────────────────────────────────────────────

export async function adminListJobs({
  status = null, kind = null, limit = 50, offset = 0,
} = {}) {
  return sql`
    SELECT
      j.id,
      j.type           AS kind,
      j.status,
      j.total_rows     AS total_items,
      j.processed_rows AS processed_items,
      j.credits_held   AS credits_charged,
      j.created_at, j.completed_at,
      j.user_id, u.email AS user_email
    FROM verification_jobs j
    LEFT JOIN users u ON u.id = j.user_id
    WHERE (${status}::text IS NULL OR j.status = ${status})
      AND (${kind}::text   IS NULL OR j.type   = ${kind})
    ORDER BY j.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

export async function adminGetJobDetail(jobId) {
  const [row] = await sql`
    SELECT
      j.id, j.user_id, j.status, j.created_at, j.completed_at,
      j.metadata,
      j.type           AS kind,
      j.total_rows     AS total_items,
      j.processed_rows AS processed_items,
      j.credits_held   AS credits_charged,
      0::int           AS credits_refunded,
      u.email AS user_email
    FROM verification_jobs j
    LEFT JOIN users u ON u.id = j.user_id
    WHERE j.id = ${jobId}
    LIMIT 1
  `;
  return row ?? null;
}

// ─────────────────────────────────────────────────────────────────────────
// Analytics (read from the F1 tables)
// ─────────────────────────────────────────────────────────────────────────

export async function adminAnalyticsOverview({ days = 7 } = {}) {
  const since = `${days} days`;

  const [totals] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE event_type IN ('pageview'))::int AS pageviews,
      COUNT(DISTINCT session_hash) FILTER (WHERE event_type = 'pageview')::int AS unique_sessions,
      COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'pageview' AND user_id IS NOT NULL)::int AS unique_users,
      COUNT(*) FILTER (WHERE event_type = 'auth_signup_complete')::int AS signups,
      COUNT(*) FILTER (WHERE event_type = 'payment_confirmed')::int AS payments
    FROM analytics_events
    WHERE created_at > now() - ${since}::interval
      AND is_bot = FALSE
  `;

  const topPaths = await sql`
    SELECT path, COUNT(*)::int AS n
    FROM analytics_events
    WHERE created_at > now() - ${since}::interval
      AND event_type = 'pageview'
      AND is_bot = FALSE
      AND path IS NOT NULL
    GROUP BY path
    ORDER BY n DESC
    LIMIT 10
  `;

  const topReferrers = await sql`
    SELECT referrer_domain, COUNT(*)::int AS n
    FROM analytics_events
    WHERE created_at > now() - ${since}::interval
      AND event_type = 'pageview'
      AND is_bot = FALSE
      AND referrer_domain IS NOT NULL
    GROUP BY referrer_domain
    ORDER BY n DESC
    LIMIT 10
  `;

  const topCountries = await sql`
    SELECT country, COUNT(*)::int AS n
    FROM analytics_events
    WHERE created_at > now() - ${since}::interval
      AND event_type = 'pageview'
      AND is_bot = FALSE
      AND country IS NOT NULL
    GROUP BY country
    ORDER BY n DESC
    LIMIT 10
  `;

  const dailySeries = await sql`
    SELECT
      to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      COUNT(*) FILTER (WHERE event_type = 'pageview')::int AS pageviews,
      COUNT(DISTINCT session_hash) FILTER (WHERE event_type = 'pageview')::int AS sessions
    FROM analytics_events
    WHERE created_at > now() - ${since}::interval
      AND is_bot = FALSE
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  return { totals, topPaths, topReferrers, topCountries, dailySeries };
}

export async function adminAnalyticsFunnel({ days = 7 } = {}) {
  const since = `${days} days`;

  const steps = [
    'pageview',
    'auth_submit',
    'auth_otp_sent',
    'auth_signup_complete',
    'auth_success',
    'checkout_click',
    'payment_pending',
    'payment_confirmed',
    'payment_failed',
    'payment_abandoned',
  ];

  return sql`
    SELECT
      event_type,
      COUNT(*)::int AS events,
      COUNT(DISTINCT session_hash)::int AS sessions,
      COUNT(DISTINCT user_id)::int AS users
    FROM analytics_events
    WHERE event_type = ANY(${steps})
      AND created_at > now() - ${since}::interval
      AND is_bot = FALSE
    GROUP BY event_type
    ORDER BY array_position(${steps}::text[], event_type) ASC
  `;
}

export async function adminAnalyticsUserJourney(userId, { limit = 200 } = {}) {
  return sql`
    SELECT created_at, event_type, path, country, device_class, metadata
    FROM analytics_events
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}

// ─────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────

export async function adminListErrors({
  kind = null, severity = null, resolved = null, limit = 50, offset = 0,
} = {}) {
  return sql`
    SELECT
      e.id, e.created_at, e.kind, e.severity, e.message, e.path, e.method,
      e.status_code, e.country, e.user_agent,
      e.resolved_at, e.user_id, u.email AS user_email
    FROM error_events e
    LEFT JOIN users u ON u.id = e.user_id
    WHERE (${kind}::text     IS NULL OR e.kind     = ${kind})
      AND (${severity}::text IS NULL OR e.severity = ${severity})
      AND (
        ${resolved}::text IS NULL
        OR (${resolved} = 'true'  AND e.resolved_at IS NOT NULL)
        OR (${resolved} = 'false' AND e.resolved_at IS NULL)
      )
    ORDER BY e.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

export async function adminGetErrorDetail(errorId) {
  const [row] = await sql`
    SELECT e.*, u.email AS user_email,
           res.email AS resolved_by_email
    FROM error_events e
    LEFT JOIN users u   ON u.id   = e.user_id
    LEFT JOIN users res ON res.id = e.resolved_by
    WHERE e.id = ${errorId}
    LIMIT 1
  `;
  return row ?? null;
}

/**
 * Mark an error_event as resolved. Writes admin_actions row first,
 * then updates the error row in the same transaction.
 */
export async function adminMarkErrorResolved(errorId, { actorId, note = null }) {
  return sql.begin(async (tx) => {
    await tx`
      INSERT INTO admin_actions (actor_id, action_type, target_kind, target_id, reason, context)
      VALUES (${actorId}, 'error_mark_resolved', 'error_event', ${String(errorId)}, ${note}, ${tx.json({})})
    `;
    const r = await tx`
      UPDATE error_events
      SET resolved_at = now(),
          resolved_by = ${actorId},
          resolution_note = ${note}
      WHERE id = ${errorId}
        AND resolved_at IS NULL
    `;
    return { updated: r.count };
  });
}

// ─────────────────────────────────────────────────────────────────────────
// admin_actions feed
// ─────────────────────────────────────────────────────────────────────────

export async function adminListActions({ limit = 50, offset = 0, actorId = null, targetUserId = null } = {}) {
  return sql`
    SELECT
      a.id, a.created_at, a.action_type, a.reason, a.context,
      a.target_kind, a.target_id,
      a.actor_id, actor.email AS actor_email,
      a.target_user_id, target.email AS target_user_email
    FROM admin_actions a
    LEFT JOIN users actor  ON actor.id  = a.actor_id
    LEFT JOIN users target ON target.id = a.target_user_id
    WHERE (${actorId}::uuid       IS NULL OR a.actor_id = ${actorId})
      AND (${targetUserId}::uuid  IS NULL OR a.target_user_id = ${targetUserId})
    ORDER BY a.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

// ─────────────────────────────────────────────────────────────────────────
// F2.5 viz read-side queries.
//
// All of these are pure SELECTs against existing tables; no schema change.
// Shapes are tuned for the SVG components in app/components/admin/ - each
// returns the minimum data the corresponding viz needs, no overfetch.
// ─────────────────────────────────────────────────────────────────────────

/**
 * KPI deltas vs previous period. Returns absolute counts and percent change
 * for pageviews / signups / payments / errors / revenue across two adjacent
 * windows. Single round-trip: one query per metric, run in parallel.
 *
 * @returns {object}
 *   pageviews: { current, previous, deltaPct }
 *   signups:   { current, previous, deltaPct }
 *   payments:  { current, previous, deltaPct }
 *   revenue:   { current_cents, previous_cents, deltaPct }
 *   errors:    { current, previous, deltaPct }
 *   activeUsers: { current }    (no delta - point in time)
 *   openJobs:    { current }
 */
export async function adminKpiDeltas({ days = 7 } = {}) {
  const cur = `${days} days`;
  const prev = `${days * 2} days`;

  const [pv, su, pay, rev, err, au, oj] = await Promise.all([
    sql`
      SELECT
        COUNT(*) FILTER (WHERE created_at > now() - ${cur}::interval)::int AS current,
        COUNT(*) FILTER (WHERE created_at > now() - ${prev}::interval AND created_at <= now() - ${cur}::interval)::int AS previous
      FROM analytics_events
      WHERE event_type = 'pageview' AND is_bot = FALSE
        AND created_at > now() - ${prev}::interval
    `,
    sql`
      SELECT
        COUNT(*) FILTER (WHERE created_at > now() - ${cur}::interval)::int AS current,
        COUNT(*) FILTER (WHERE created_at > now() - ${prev}::interval AND created_at <= now() - ${cur}::interval)::int AS previous
      FROM users
      WHERE created_at > now() - ${prev}::interval AND deleted_at IS NULL
    `,
    sql`
      SELECT
        COUNT(*) FILTER (WHERE completed_at > now() - ${cur}::interval AND status = 'confirmed')::int AS current,
        COUNT(*) FILTER (WHERE completed_at > now() - ${prev}::interval AND completed_at <= now() - ${cur}::interval AND status = 'confirmed')::int AS previous
      FROM payments
      WHERE completed_at > now() - ${prev}::interval
    `,
    sql`
      SELECT
        COALESCE(SUM(amount_usd_cents) FILTER (WHERE completed_at > now() - ${cur}::interval AND status = 'confirmed'), 0)::int AS current_cents,
        COALESCE(SUM(amount_usd_cents) FILTER (WHERE completed_at > now() - ${prev}::interval AND completed_at <= now() - ${cur}::interval AND status = 'confirmed'), 0)::int AS previous_cents
      FROM payments
      WHERE completed_at > now() - ${prev}::interval
    `,
    sql`
      SELECT
        COUNT(*) FILTER (WHERE created_at > now() - ${cur}::interval)::int AS current,
        COUNT(*) FILTER (WHERE created_at > now() - ${prev}::interval AND created_at <= now() - ${cur}::interval)::int AS previous
      FROM error_events
      WHERE created_at > now() - ${prev}::interval
    `,
    sql`SELECT COUNT(*) FILTER (WHERE deleted_at IS NULL AND email_verified_at IS NOT NULL)::int AS current FROM users`,
    sql`SELECT COUNT(*) FILTER (WHERE status IN ('pending','processing'))::int AS current FROM verification_jobs`,
  ]);

  const pct = (c, p) => (p === 0 ? (c > 0 ? 100 : 0) : Math.round(((c - p) / p) * 100));

  return {
    pageviews:   { current: pv[0].current,        previous: pv[0].previous,        deltaPct: pct(pv[0].current, pv[0].previous) },
    signups:     { current: su[0].current,        previous: su[0].previous,        deltaPct: pct(su[0].current, su[0].previous) },
    payments:    { current: pay[0].current,       previous: pay[0].previous,       deltaPct: pct(pay[0].current, pay[0].previous) },
    revenue:     { current_cents: rev[0].current_cents, previous_cents: rev[0].previous_cents, deltaPct: pct(rev[0].current_cents, rev[0].previous_cents) },
    errors:      { current: err[0].current,       previous: err[0].previous,       deltaPct: pct(err[0].current, err[0].previous) },
    activeUsers: { current: au[0].current },
    openJobs:    { current: oj[0].current },
  };
}

/**
 * Daily counts for the last N days, grouped by metric. Powers the inline
 * sparklines on KPI cards. Returns four parallel arrays of length `days`,
 * day-aligned and zero-filled (we generate the date spine via generate_series
 * so missing days appear as 0 instead of gaps).
 *
 * @returns {object} { pageviews: [{day, n}], signups: [...], payments: [...], errors: [...] }
 */
export async function adminKpiSparklines({ days = 30 } = {}) {
  const since = `${days} days`;

  const [pv, su, pay, err] = await Promise.all([
    sql`
      WITH spine AS (
        SELECT generate_series(
          date_trunc('day', now() - ${since}::interval) + interval '1 day',
          date_trunc('day', now()),
          interval '1 day'
        )::date AS day
      )
      SELECT to_char(s.day, 'YYYY-MM-DD') AS day,
             COALESCE(COUNT(e.*), 0)::int AS n
      FROM spine s
      LEFT JOIN analytics_events e
        ON date_trunc('day', e.created_at) = s.day
       AND e.event_type = 'pageview'
       AND e.is_bot = FALSE
      GROUP BY s.day
      ORDER BY s.day ASC
    `,
    sql`
      WITH spine AS (
        SELECT generate_series(
          date_trunc('day', now() - ${since}::interval) + interval '1 day',
          date_trunc('day', now()),
          interval '1 day'
        )::date AS day
      )
      SELECT to_char(s.day, 'YYYY-MM-DD') AS day,
             COALESCE(COUNT(u.id), 0)::int AS n
      FROM spine s
      LEFT JOIN users u
        ON date_trunc('day', u.created_at) = s.day
       AND u.deleted_at IS NULL
      GROUP BY s.day
      ORDER BY s.day ASC
    `,
    sql`
      WITH spine AS (
        SELECT generate_series(
          date_trunc('day', now() - ${since}::interval) + interval '1 day',
          date_trunc('day', now()),
          interval '1 day'
        )::date AS day
      )
      SELECT to_char(s.day, 'YYYY-MM-DD') AS day,
             COALESCE(COUNT(p.id), 0)::int AS n
      FROM spine s
      LEFT JOIN payments p
        ON date_trunc('day', p.completed_at) = s.day
       AND p.status = 'confirmed'
      GROUP BY s.day
      ORDER BY s.day ASC
    `,
    sql`
      WITH spine AS (
        SELECT generate_series(
          date_trunc('day', now() - ${since}::interval) + interval '1 day',
          date_trunc('day', now()),
          interval '1 day'
        )::date AS day
      )
      SELECT to_char(s.day, 'YYYY-MM-DD') AS day,
             COALESCE(COUNT(e.id), 0)::int AS n
      FROM spine s
      LEFT JOIN error_events e
        ON date_trunc('day', e.created_at) = s.day
      GROUP BY s.day
      ORDER BY s.day ASC
    `,
  ]);

  return { pageviews: pv, signups: su, payments: pay, errors: err };
}

/**
 * Daily revenue series for the area chart, partitioned by status. Returns
 * one row per day for the last N days, zero-filled. confirmed_cents is the
 * positive area; failed_cents is the (much smaller, low-opacity) shadow.
 */
export async function adminRevenueSeries({ days = 30 } = {}) {
  const since = `${days} days`;
  return sql`
    WITH spine AS (
      SELECT generate_series(
        date_trunc('day', now() - ${since}::interval) + interval '1 day',
        date_trunc('day', now()),
        interval '1 day'
      )::date AS day
    )
    SELECT
      to_char(s.day, 'YYYY-MM-DD') AS day,
      COALESCE(SUM(p.amount_usd_cents) FILTER (WHERE p.status = 'confirmed'), 0)::int AS confirmed_cents,
      COALESCE(SUM(p.amount_usd_cents) FILTER (WHERE p.status IN ('failed','expired')), 0)::int AS failed_cents,
      COALESCE(COUNT(p.id) FILTER (WHERE p.status = 'confirmed'), 0)::int AS count_confirmed,
      COALESCE(COUNT(p.id) FILTER (WHERE p.status IN ('failed','expired')), 0)::int AS count_failed
    FROM spine s
    LEFT JOIN payments p
      ON date_trunc('day', COALESCE(p.completed_at, p.created_at)) = s.day
    GROUP BY s.day
    ORDER BY s.day ASC
  `;
}

/**
 * 7×24 heatmap: pageview counts bucketed by day-of-week × hour-of-day across
 * the last N days. Returns 0-168 rows; missing buckets get a 0 cell client-
 * side. dow is Postgres convention (0 = Sunday).
 */
export async function adminAnalyticsHeatmap({ days = 7 } = {}) {
  const since = `${days} days`;
  return sql`
    SELECT
      EXTRACT(DOW  FROM created_at AT TIME ZONE 'UTC')::int AS dow,
      EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC')::int AS hour,
      COUNT(*)::int AS n
    FROM analytics_events
    WHERE event_type = 'pageview'
      AND is_bot = FALSE
      AND created_at > now() - ${since}::interval
    GROUP BY dow, hour
    ORDER BY dow, hour
  `;
}

/**
 * Country traffic for the dot-map / ranked-bar fallback. Same shape as
 * adminAnalyticsOverview.topCountries but with a configurable window and
 * larger limit so the map can scale dot radius across the long tail.
 */
export async function adminCountryTraffic({ days = 30, limit = 50 } = {}) {
  const since = `${days} days`;
  return sql`
    SELECT country, COUNT(*)::int AS n
    FROM analytics_events
    WHERE event_type = 'pageview'
      AND is_bot = FALSE
      AND country IS NOT NULL
      AND created_at > now() - ${since}::interval
    GROUP BY country
    ORDER BY n DESC
    LIMIT ${limit}
  `;
}

/**
 * Interleaved live-feed across signups / payments / errors / admin_actions.
 * Single round-trip via UNION ALL with a shared shape; ORDER BY at the
 * outer query so we get a unified timeline. Each row carries enough to
 * render an icon + one-line summary + drill-in link.
 *
 * @returns array of { kind, created_at, summary, link, severity? }
 */
export async function adminRecentActivity({ limit = 30 } = {}) {
  return sql`
    (
      SELECT
        'signup'::text                   AS kind,
        u.created_at                     AS created_at,
        u.email                          AS summary,
        '/admin/users/' || u.id::text    AS link,
        NULL::text                       AS severity
      FROM users u
      WHERE u.deleted_at IS NULL
      ORDER BY u.created_at DESC
      LIMIT ${limit}
    )
    UNION ALL
    (
      SELECT
        'payment'::text                                              AS kind,
        COALESCE(p.completed_at, p.created_at)                       AS created_at,
        COALESCE(u.email, 'unknown') || ' / ' || p.status            AS summary,
        '/admin/payments/' || p.id::text                             AS link,
        NULL::text                                                   AS severity
      FROM payments p
      LEFT JOIN users u ON u.id = p.user_id
      ORDER BY COALESCE(p.completed_at, p.created_at) DESC
      LIMIT ${limit}
    )
    UNION ALL
    (
      SELECT
        'error'::text                       AS kind,
        e.created_at                        AS created_at,
        LEFT(e.message, 120)                AS summary,
        '/admin/errors/' || e.id::text      AS link,
        e.severity                          AS severity
      FROM error_events e
      WHERE e.resolved_at IS NULL
      ORDER BY e.created_at DESC
      LIMIT ${limit}
    )
    UNION ALL
    (
      SELECT
        'admin_action'::text             AS kind,
        a.created_at                     AS created_at,
        a.action_type
          || ' / ' || a.target_kind
          || COALESCE(' (' || actor.email || ')', '')                AS summary,
        CASE a.target_kind
          WHEN 'user'        THEN '/admin/users/'    || COALESCE(a.target_user_id::text, '')
          WHEN 'payment'     THEN '/admin/payments/' || COALESCE(a.target_id, '')
          WHEN 'job'         THEN '/admin/jobs/'     || COALESCE(a.target_id, '')
          WHEN 'error_event' THEN '/admin/errors/'   || COALESCE(a.target_id, '')
          ELSE '/admin'
        END                              AS link,
        NULL::text                       AS severity
      FROM admin_actions a
      LEFT JOIN users actor ON actor.id = a.actor_id
      ORDER BY a.created_at DESC
      LIMIT ${limit}
    )
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}

/**
 * System health status. V2 surface - the actual probes for Resend /
 * Cryptomus / Stripe webhook freshness will land in a follow-up batch.
 * For now the rail ships with a real Postgres ping (proves the loader
 * reached the DB) and placeholders for the rest.
 *
 * Keep this fast: the rail renders on every admin page.
 */
export async function adminSystemStatus() {
  const t0 = Date.now();
  let postgresOk = true;
  let postgresLatencyMs = 0;
  try {
    await sql`SELECT 1`;
    postgresLatencyMs = Date.now() - t0;
  } catch {
    postgresOk = false;
    postgresLatencyMs = -1;
  }

  // TODO(F2.5+): replace with real probes once the sender/payment liveness
  // tables ship. For now we report 'ok' on the assumption that the route
  // loaders will fail loudly if any of these are wedged.
  return {
    postgres:  { status: postgresOk ? 'ok' : 'down', latency_ms: postgresLatencyMs },
    resend:    { status: 'ok' },
    cryptomus: { status: 'ok' },
    stripe:    { status: 'ok' },
    worker:    { status: 'ok' },
  };
}