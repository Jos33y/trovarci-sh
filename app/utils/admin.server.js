// Admin-side server helpers.

import { redirect } from 'react-router';
import { CRYPTOMUS_ENABLED, POLAR_ENABLED } from './paymentsConfig.server.js';
import { requireUser } from './session.server.js';
import { sql } from './db.server.js';

// Loader/action guard for /admin/* routes.
export async function requireAdmin(request) {
  const user = await requireUser(request, { redirectTo: '/login' });
  if (user.role !== 'admin') {
    // 404, not 403, so the admin area is not confirmed to exist.
    throw new Response('Not Found', { status: 404 });
  }
  return user;
}

// Soft variant of requireAdmin: returns a boolean instead of redirecting.
export async function isAdmin(request) {
  try {
    const user = await requireUser(request, { redirectTo: '/login' });
    return user.role === 'admin';
  } catch {
    return false;
  }
}

// User search + profile reads

// Search users by email substring or exact UUID.
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

// Full user record for /admin/users/:userId.
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
    FROM sales
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
    SELECT id, product, gateway, package_key, credits, amount_usd_cents, status,
           created_at, completed_at, admin_link
    FROM sales
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

// Payments list (cross-user)
export async function adminListPayments({
  gateway = null, status = null, limit = 50, offset = 0,
} = {}) {
  return sql`
    SELECT
      p.id, p.product, p.gateway, p.status, p.package_key, p.credits, p.amount_usd_cents,
      p.created_at, p.completed_at, p.user_id, COALESCE(u.email, p.email) AS user_email, p.admin_link
    FROM sales p
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

// Jobs list (cross-user)

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

// Analytics (read from the F1 tables)

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
      AND is_bot = FALSE AND is_internal = FALSE
  `;

  const topPaths = await sql`
    SELECT path, COUNT(*)::int AS n
    FROM analytics_events
    WHERE created_at > now() - ${since}::interval
      AND event_type = 'pageview'
      AND is_bot = FALSE AND is_internal = FALSE
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
      AND is_bot = FALSE AND is_internal = FALSE
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
      AND is_bot = FALSE AND is_internal = FALSE
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
      AND is_bot = FALSE AND is_internal = FALSE
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
    'gateway_redirect',
    'payment_confirmed',
    'payment_failed',
    'payment_abandoned',
    'sender_download',
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
      AND is_bot = FALSE AND is_internal = FALSE
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

// Per-tool runs: starts, successes, errors, sign-in walls, and the sessions behind them.
export async function adminToolUsage({ days = 7 } = {}) {
  const since = `${days} days`;

  const tools = await sql`
    SELECT
      regexp_replace(event_type, '^tool_(start|success|error)_', '') AS tool,
      COUNT(*) FILTER (WHERE event_type LIKE 'tool_start_%')::int   AS starts,
      COUNT(*) FILTER (WHERE event_type LIKE 'tool_success_%')::int AS successes,
      COUNT(*) FILTER (WHERE event_type LIKE 'tool_error_%')::int   AS errors,
      COUNT(*) FILTER (WHERE event_type LIKE 'tool_error_%' AND metadata->>'code' = 'AUTH_REQUIRED')::int AS auth_walls,
      COUNT(DISTINCT session_hash) FILTER (WHERE event_type LIKE 'tool_success_%')::int AS sessions
    FROM analytics_events
    WHERE event_type ~ '^tool_(start|success|error)_'
      AND created_at > now() - ${since}::interval
      AND is_bot = FALSE AND is_internal = FALSE
    GROUP BY 1
    ORDER BY successes DESC, starts DESC
  `;

  const errors = await sql`
    SELECT
      regexp_replace(event_type, '^tool_error_', '') AS tool,
      COALESCE(metadata->>'code', 'UNKNOWN') AS code,
      COUNT(*)::int AS n
    FROM analytics_events
    WHERE event_type LIKE 'tool_error_%'
      AND created_at > now() - ${since}::interval
      AND is_bot = FALSE AND is_internal = FALSE
    GROUP BY 1, 2
    ORDER BY n DESC
    LIMIT 12
  `;

  return { tools, errors };
}

// Each session's first pageview, its source, and whether that session ran a tool or signed up.
// Session hashes rotate daily, so a visit that spans midnight UTC counts as two sessions.
export async function adminLandingSessions({ days = 7 } = {}) {
  const since = `${days} days`;
  return sql`
    WITH landing AS (
      SELECT DISTINCT ON (session_hash)
        session_hash,
        path AS landing_path,
        COALESCE(utm_source, referrer_domain) AS source
      FROM analytics_events
      WHERE event_type = 'pageview'
        AND is_bot = FALSE AND is_internal = FALSE
        AND session_hash NOT IN ('bot', 'system', 'webhook')
        AND created_at > now() - ${since}::interval
      ORDER BY session_hash, created_at ASC, id ASC
    ),
    acts AS (
      SELECT
        session_hash,
        bool_or(event_type LIKE 'tool_success_%') AS ran_tool,
        bool_or(event_type = 'auth_signup_complete') AS signed_up
      FROM analytics_events
      WHERE is_bot = FALSE AND is_internal = FALSE
        AND created_at > now() - ${since}::interval
      GROUP BY session_hash
    )
    SELECT
      l.landing_path,
      l.source,
      COUNT(*)::int AS sessions,
      COUNT(*) FILTER (WHERE a.ran_tool)::int AS ran_tool,
      COUNT(*) FILTER (WHERE a.signed_up)::int AS signed_up
    FROM landing l
    LEFT JOIN acts a USING (session_hash)
    GROUP BY 1, 2
  `;
}

// Errors

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

// Mark an error_event as resolved.
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

// admin_actions feed

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

// Dashboard chart queries: plain SELECTs shaped for the SVG components in app/components/admin/.

// KPI deltas vs previous period.
export async function adminKpiDeltas({ days = 7 } = {}) {
  const cur = `${days} days`;
  const prev = `${days * 2} days`;

  const [pv, su, pay, rev, err, au, oj] = await Promise.all([
    sql`
      SELECT
        COUNT(*) FILTER (WHERE created_at > now() - ${cur}::interval)::int AS current,
        COUNT(*) FILTER (WHERE created_at > now() - ${prev}::interval AND created_at <= now() - ${cur}::interval)::int AS previous
      FROM analytics_events
      WHERE event_type = 'pageview' AND is_bot = FALSE AND is_internal = FALSE
        AND created_at > now() - ${prev}::interval
    `,
    sql`
      SELECT
        COUNT(*) FILTER (WHERE created_at > now() - ${cur}::interval)::int AS current,
        COUNT(*) FILTER (WHERE created_at > now() - ${prev}::interval AND created_at <= now() - ${cur}::interval)::int AS previous
      FROM users
      WHERE created_at > now() - ${prev}::interval AND deleted_at IS NULL AND email_verified_at IS NOT NULL
    `,
    sql`
      SELECT
        COUNT(*) FILTER (WHERE completed_at > now() - ${cur}::interval AND status = 'confirmed')::int AS current,
        COUNT(*) FILTER (WHERE completed_at > now() - ${prev}::interval AND completed_at <= now() - ${cur}::interval AND status = 'confirmed')::int AS previous
      FROM sales
      WHERE completed_at > now() - ${prev}::interval
    `,
    sql`
      SELECT
        COALESCE(SUM(amount_usd_cents) FILTER (WHERE completed_at > now() - ${cur}::interval AND status = 'confirmed'), 0)::int AS current_cents,
        COALESCE(SUM(amount_usd_cents) FILTER (WHERE completed_at > now() - ${prev}::interval AND completed_at <= now() - ${cur}::interval AND status = 'confirmed'), 0)::int AS previous_cents
      FROM sales
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
    pageviews: { current: pv[0].current, previous: pv[0].previous, deltaPct: pct(pv[0].current, pv[0].previous) },
    signups: { current: su[0].current, previous: su[0].previous, deltaPct: pct(su[0].current, su[0].previous) },
    payments: { current: pay[0].current, previous: pay[0].previous, deltaPct: pct(pay[0].current, pay[0].previous) },
    revenue: { current_cents: rev[0].current_cents, previous_cents: rev[0].previous_cents, deltaPct: pct(rev[0].current_cents, rev[0].previous_cents) },
    errors: { current: err[0].current, previous: err[0].previous, deltaPct: pct(err[0].current, err[0].previous) },
    activeUsers: { current: au[0].current },
    openJobs: { current: oj[0].current },
  };
}

// Daily counts for the last N days, grouped by metric.
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
       AND e.is_bot = FALSE AND e.is_internal = FALSE
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
       AND u.email_verified_at IS NOT NULL
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
      LEFT JOIN sales p
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

// Daily revenue series for the area chart, partitioned by status.
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
    LEFT JOIN sales p
      ON date_trunc('day', COALESCE(p.completed_at, p.created_at)) = s.day
    GROUP BY s.day
    ORDER BY s.day ASC
  `;
}

// 7×24 heatmap: pageview counts bucketed by day-of-week × hour-of-day across the last N days.
export async function adminAnalyticsHeatmap({ days = 7 } = {}) {
  const since = `${days} days`;
  return sql`
    SELECT
      EXTRACT(DOW  FROM created_at AT TIME ZONE 'UTC')::int AS dow,
      EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC')::int AS hour,
      COUNT(*)::int AS n
    FROM analytics_events
    WHERE event_type = 'pageview'
      AND is_bot = FALSE AND is_internal = FALSE
      AND created_at > now() - ${since}::interval
    GROUP BY dow, hour
    ORDER BY dow, hour
  `;
}

// Country traffic for the dot-map / ranked-bar fallback.
export async function adminCountryTraffic({ days = 30, limit = 50 } = {}) {
  const since = `${days} days`;
  return sql`
    SELECT country, COUNT(*)::int AS n
    FROM analytics_events
    WHERE event_type = 'pageview'
      AND is_bot = FALSE AND is_internal = FALSE
      AND country IS NOT NULL
      AND created_at > now() - ${since}::interval
    GROUP BY country
    ORDER BY n DESC
    LIMIT ${limit}
  `;
}

// Interleaved live-feed across signups / payments / errors / admin_actions.
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
        CASE p.product WHEN 'sender' THEN 'Sender ' ELSE '' END
          || '$' || to_char(p.amount_usd_cents / 100.0, 'FM999990.00')
          || ' ' || COALESCE(u.email, p.email, 'unknown') || ' / ' || p.status AS summary,
        p.admin_link                                                 AS link,
        NULL::text                                                   AS severity
      FROM sales p
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

// System health status.
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

  // Postgres is probed. Payment gateways show whether they are switched on; the rest are not probed yet.
  return {
    postgres: { status: postgresOk ? 'ok' : 'down', latency_ms: postgresLatencyMs },
    resend: { status: 'ok' },
    cryptomus: { status: CRYPTOMUS_ENABLED ? 'ok' : 'unknown' },
    polar: { status: POLAR_ENABLED ? 'ok' : 'unknown' },
    worker: { status: 'ok' },
  };
}

// Contact messages

export async function adminListContactMessages({ status = null, subject = null, q = null, limit = 50, offset = 0 } = {}) {
  const statusFilter = status ? sql`AND status = ${status}` : sql``;
  const subjectFilter = subject ? sql`AND subject = ${subject}` : sql``;
  const qFilter = q
    ? sql`AND (email ILIKE ${'%' + q + '%'} OR name ILIKE ${'%' + q + '%'} OR message ILIKE ${'%' + q + '%'})`
    : sql``;

  return sql`
    SELECT id, created_at, subject, name, email, source, status, user_id,
           substring(message from 1 for 120) AS message_preview,
           length(message) AS message_length
    FROM contact_messages
    WHERE 1=1
      ${statusFilter}
      ${subjectFilter}
      ${qFilter}
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

export async function adminGetContactMessage(id) {
  const [row] = await sql`
    SELECT cm.id, cm.created_at, cm.subject, cm.name, cm.email, cm.message,
           cm.source, cm.status, cm.notes, cm.user_id, cm.ip_address, cm.user_agent,
           u.email AS linked_user_email
    FROM contact_messages cm
    LEFT JOIN users u ON u.id = cm.user_id
    WHERE cm.id = ${id}
    LIMIT 1
  `;
  return row || null;
}

const CONTACT_VALID_STATUSES = new Set(['new', 'read', 'replied', 'spam']);

export async function adminUpdateContactMessageStatus(id, { status, notes = null }) {
  if (!CONTACT_VALID_STATUSES.has(status)) {
    throw new Error(`Invalid contact status: ${status}`);
  }
  const [updated] = await sql`
    UPDATE contact_messages
    SET status = ${status}, notes = ${notes}
    WHERE id = ${id}
    RETURNING id, status
  `;
  if (!updated) throw new Error(`Contact message not found: ${id}`);
  return updated;
}
// Reading per page: how long people actually read (visible time), how far they scrolled, what they
// did next, and the helpful votes. One engagement record per page view; the last one sent wins.
export async function adminPageEngagement({ days = 30, limit = 50 } = {}) {
  const interval = `${days} days`;
  return sql`
    WITH views AS (
      SELECT path, COUNT(*)::int AS views
      FROM analytics_events
      WHERE event_type = 'pageview' AND is_bot = FALSE AND is_internal = FALSE
        AND created_at > now() - ${interval}::interval
      GROUP BY path
    ),
    per_view AS (
      SELECT path,
             metadata->>'pv' AS pv,
             MAX((metadata->>'s')::int) AS seconds,
             MAX((metadata->>'d')::int) AS depth,
             MAX(NULLIF(metadata->>'a', 'none')) AS action
      FROM analytics_events
      WHERE event_type = 'page_engagement' AND is_bot = FALSE AND is_internal = FALSE
        AND created_at > now() - ${interval}::interval
        AND metadata->>'pv' IS NOT NULL
      GROUP BY path, metadata->>'pv'
    ),
    reading AS (
      SELECT path,
             COUNT(*)::int AS measured,
             ROUND(AVG(seconds))::int AS avg_seconds,
             ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY seconds))::int AS median_seconds,
             COUNT(*) FILTER (WHERE depth >= 75)::int AS reached_end,
             COUNT(*) FILTER (WHERE seconds < 10)::int AS left_fast,
             COUNT(*) FILTER (WHERE action IS NOT NULL)::int AS acted,
             COUNT(*) FILTER (WHERE action = 'tool')::int AS to_tool,
             COUNT(*) FILTER (WHERE action IN ('sender', 'download'))::int AS to_sender,
             COUNT(*) FILTER (WHERE action IN ('signup', 'credits'))::int AS to_signup
      FROM per_view
      GROUP BY path
    ),
    votes AS (
      SELECT path,
             COUNT(*) FILTER (WHERE metadata->>'v' = 'yes')::int AS helpful_yes,
             COUNT(*) FILTER (WHERE metadata->>'v' = 'no')::int AS helpful_no
      FROM analytics_events
      WHERE event_type = 'helpful_vote' AND is_bot = FALSE AND is_internal = FALSE
        AND created_at > now() - ${interval}::interval
      GROUP BY path
    )
    SELECT v.path, v.views,
           COALESCE(r.measured, 0) AS measured, r.avg_seconds, r.median_seconds,
           COALESCE(r.reached_end, 0) AS reached_end, COALESCE(r.left_fast, 0) AS left_fast,
           COALESCE(r.acted, 0) AS acted, COALESCE(r.to_tool, 0) AS to_tool,
           COALESCE(r.to_sender, 0) AS to_sender, COALESCE(r.to_signup, 0) AS to_signup,
           COALESCE(h.helpful_yes, 0) AS helpful_yes, COALESCE(h.helpful_no, 0) AS helpful_no
    FROM views v
    LEFT JOIN reading r ON r.path = v.path
    LEFT JOIN votes h ON h.path = v.path
    ORDER BY v.views DESC
    LIMIT ${limit}
  `;
}

// Which "What do you see?" answer readers picked, per page. One row per page view (pv),
// since a page view can send several engagement records; views with no pick count as none.
export async function adminPickerChoices({ days = 30 } = {}) {
  const interval = `${days} days`;
  return sql`
    WITH per_view AS (
      SELECT path,
             metadata->>'pv' AS pv,
             MAX(NULLIF(metadata->>'p', '')) AS pick
      FROM analytics_events
      WHERE event_type = 'page_engagement'
        AND metadata ? 'pv'
        AND is_bot = FALSE AND is_internal = FALSE
        AND created_at > now() - ${interval}::interval
      GROUP BY path, metadata->>'pv'
    )
    SELECT path, pick, COUNT(*)::int AS n
    FROM per_view
    WHERE path IN (SELECT path FROM per_view WHERE pick IS NOT NULL)
    GROUP BY path, pick
    ORDER BY path, n DESC
  `;
}

// "Did this check help?" answers per tool.
export async function adminToolVotes({ days = 7 } = {}) {
  const interval = `${days} days`;
  return sql`
    SELECT metadata->>'tool' AS tool,
           COUNT(*) FILTER (WHERE metadata->>'v' = 'yes')::int AS yes,
           COUNT(*) FILTER (WHERE metadata->>'v' = 'no')::int AS no
    FROM analytics_events
    WHERE event_type = 'helpful_vote' AND metadata ? 'tool'
      AND is_bot = FALSE AND is_internal = FALSE
      AND created_at > now() - ${interval}::interval
    GROUP BY 1
  `;
}

// What readers said was missing, newest first.
export async function adminHelpfulNotes({ days = 90, limit = 30 } = {}) {
  const interval = `${days} days`;
  return sql`
    SELECT created_at, path, metadata->>'note' AS note
    FROM analytics_events
    WHERE event_type = 'helpful_vote' AND metadata->>'v' = 'no'
      AND COALESCE(metadata->>'note', '') <> ''
      AND is_bot = FALSE AND is_internal = FALSE
      AND created_at > now() - ${interval}::interval
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}
