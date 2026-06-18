/**
 * Analytics + error telemetry tables.
 *
 * Three tables, one purpose: know what users do and why things fail before
 * they tell us. In-house, cookieless, server-side bot filtered. No third-
 * party analytics or error trackers; this is the source of truth.
 *
 * ─── analytics_events ────────────────────────────────────────────────────
 *
 *   One row per discrete user action. Page view, tool start/complete,
 *   purchase funnel step, signup funnel step, etc. Append-only; never
 *   updated. The analytics_daily rollup table reads from this for fast
 *   admin dashboards.
 *
 *   Cookieless session model: `session_hash` is sha256(ip + ua + utc_date)
 *   truncated to 16 hex chars, computed server-side. Rotates every UTC
 *   midnight so we cannot reconstruct cross-day behaviour for a single
 *   visitor (privacy by design, no consent banner needed in EU).
 *
 *   `event_type` is a short tag. Categorised as:
 *     pageview, tool_start, tool_success, tool_error,
 *     auth_view, auth_submit, auth_otp_sent, auth_otp_verified, auth_welcome_credited,
 *     credits_view, package_select, checkout_click, gateway_redirect,
 *     payment_pending, payment_confirmed, payment_failed, payment_abandoned,
 *     waitlist_signup, click_outbound, click_internal_cta
 *
 *   Volume estimate: 5-10 events per visitor session at MVP. With 1k
 *   sessions/day that's ~10k rows/day. Indexed by (created_at) for the
 *   nightly rollup, by (event_type, created_at) for type-filtered queries,
 *   by (user_id, created_at) for per-user journeys, and by (path, created_at)
 *   for top-pages reports.
 *
 *   Retention: ANALYTICS_EVENT_RETENTION_DAYS (default 90). After that,
 *   only the daily rollups remain. Cleaned by the worker's auth-cleanup
 *   loop (extended in this batch).
 *
 * ─── analytics_daily ─────────────────────────────────────────────────────
 *
 *   Pre-aggregated rollup. One row per (date, dimension, dimension_value).
 *   Computed by the worker at ~00:05 UTC daily from the previous day's
 *   raw events. Admin dashboards query this, not the raw table.
 *
 *   Dimensions: 'pageview_path', 'tool_event', 'funnel_step',
 *   'country', 'referrer_domain', 'utm_source', 'utm_campaign'.
 *
 *   This is a star schema lite: one row per dimension+value+day with
 *   pre-summed counts. Total rows per day < 1k regardless of traffic
 *   volume. Kept forever (small).
 *
 * ─── error_events ────────────────────────────────────────────────────────
 *
 *   Server + client errors with full context. Synchronous insert path
 *   (errors must NEVER be lost; analytics events can be lossy).
 *
 *   `severity` discriminates fatal vs handled vs warning. `kind` discriminates
 *   server-route, client-route, client-script, client-async, api-call.
 *   `redacted_context` is JSONB with PII stripped: emails -> hash,
 *   passwords -> '[redacted]', auth headers -> '[redacted]', card data
 *   never reaches here (Stripe Checkout is hosted, we never see PAN).
 *
 *   Retention: ERROR_EVENT_RETENTION_DAYS (default 180). Long enough to
 *   correlate post-launch incident reports back to their root cause.
 *
 * Privacy notes:
 *   - No raw IP stored. `session_hash` derives from IP+UA+date but the
 *     IP itself is never written to disk.
 *   - User-Agent hashed (not stored verbatim) on analytics; preserved on
 *     error_events because debugging client-side bugs requires the
 *     browser/version string.
 *   - `country` is from Cloudflare's CF-IPCountry header. Free, two-letter
 *     ISO. No city or finer geo.
 */

exports.up = (pgm) => {
  // ──────────────────────────────────────────────────────────────────────
  // analytics_events
  // ──────────────────────────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE analytics_events (
      id              BIGSERIAL    PRIMARY KEY,
      created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
      event_type      TEXT         NOT NULL,
      session_hash    TEXT         NOT NULL,
      user_id         UUID         REFERENCES users(id) ON DELETE SET NULL,
      path            TEXT,
      referrer_domain TEXT,
      utm_source      TEXT,
      utm_medium      TEXT,
      utm_campaign    TEXT,
      country         TEXT,
      device_class    TEXT,
      is_bot          BOOLEAN      NOT NULL DEFAULT FALSE,
      metadata        JSONB        NOT NULL DEFAULT '{}'::jsonb,

      CONSTRAINT ae_session_hash_format CHECK (session_hash ~ '^[a-f0-9]{16}$' OR session_hash IN ('bot', 'webhook', 'system')),
      CONSTRAINT ae_country_format      CHECK (country IS NULL OR country ~ '^[A-Z]{2}$' OR country = 'XX'),
      CONSTRAINT ae_device_class_valid  CHECK (device_class IS NULL OR device_class IN ('mobile', 'tablet', 'desktop', 'bot', 'unknown'))
    );
  `);

  // Hot path: nightly rollup scans yesterday's window.
  pgm.sql(`
    CREATE INDEX ae_created_at
      ON analytics_events (created_at);
  `);

  // Tool dashboards / event-type filters.
  pgm.sql(`
    CREATE INDEX ae_event_type_created
      ON analytics_events (event_type, created_at DESC);
  `);

  // Per-user journey reconstruction.
  pgm.sql(`
    CREATE INDEX ae_user_created
      ON analytics_events (user_id, created_at DESC)
      WHERE user_id IS NOT NULL;
  `);

  // Top-pages reports.
  pgm.sql(`
    CREATE INDEX ae_path_created
      ON analytics_events (path, created_at DESC)
      WHERE path IS NOT NULL AND is_bot = FALSE;
  `);

  // Funnel reconstruction by session.
  pgm.sql(`
    CREATE INDEX ae_session_created
      ON analytics_events (session_hash, created_at);
  `);

  // ──────────────────────────────────────────────────────────────────────
  // analytics_daily
  // ──────────────────────────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE analytics_daily (
      day             DATE         NOT NULL,
      dimension       TEXT         NOT NULL,
      dimension_value TEXT         NOT NULL,
      event_count     INTEGER      NOT NULL DEFAULT 0,
      unique_sessions INTEGER      NOT NULL DEFAULT 0,
      unique_users    INTEGER      NOT NULL DEFAULT 0,
      computed_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),

      PRIMARY KEY (day, dimension, dimension_value),
      CONSTRAINT ad_event_count_nonneg     CHECK (event_count >= 0),
      CONSTRAINT ad_unique_sessions_nonneg CHECK (unique_sessions >= 0),
      CONSTRAINT ad_unique_users_nonneg    CHECK (unique_users >= 0)
    );
  `);

  pgm.sql(`
    CREATE INDEX ad_day_dimension
      ON analytics_daily (day DESC, dimension);
  `);

  // ──────────────────────────────────────────────────────────────────────
  // error_events
  // ──────────────────────────────────────────────────────────────────────
  pgm.sql(`
    CREATE TABLE error_events (
      id              BIGSERIAL    PRIMARY KEY,
      created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
      kind            TEXT         NOT NULL,
      severity        TEXT         NOT NULL DEFAULT 'error',
      message         TEXT         NOT NULL,
      stack           TEXT,
      path            TEXT,
      method          TEXT,
      status_code     INTEGER,
      user_id         UUID         REFERENCES users(id) ON DELETE SET NULL,
      session_hash    TEXT,
      user_agent      TEXT,
      country         TEXT,
      redacted_context JSONB       NOT NULL DEFAULT '{}'::jsonb,
      resolved_at     TIMESTAMPTZ,
      resolved_by     UUID         REFERENCES users(id) ON DELETE SET NULL,
      resolution_note TEXT,

      CONSTRAINT ee_kind_valid     CHECK (kind IN ('server_route', 'client_route', 'client_script', 'client_async', 'api_call', 'worker', 'webhook')),
      CONSTRAINT ee_severity_valid CHECK (severity IN ('fatal', 'error', 'warning', 'info')),
      CONSTRAINT ee_method_valid   CHECK (method IS NULL OR method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS')),
      CONSTRAINT ee_country_format CHECK (country IS NULL OR country ~ '^[A-Z]{2}$' OR country = 'XX')
    );
  `);

  pgm.sql(`
    CREATE INDEX ee_created_at
      ON error_events (created_at DESC);
  `);

  pgm.sql(`
    CREATE INDEX ee_unresolved_severity
      ON error_events (severity, created_at DESC)
      WHERE resolved_at IS NULL;
  `);

  pgm.sql(`
    CREATE INDEX ee_kind_created
      ON error_events (kind, created_at DESC);
  `);

  pgm.sql(`
    CREATE INDEX ee_path_created
      ON error_events (path, created_at DESC)
      WHERE path IS NOT NULL;
  `);

  pgm.sql(`
    CREATE INDEX ee_user_created
      ON error_events (user_id, created_at DESC)
      WHERE user_id IS NOT NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS error_events;`);
  pgm.sql(`DROP TABLE IF EXISTS analytics_daily;`);
  pgm.sql(`DROP TABLE IF EXISTS analytics_events;`);
};
