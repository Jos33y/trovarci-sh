/**
 * Analytics recording.
 *
 * Two surfaces:
 *
 *   recordEvent(...)  - async, lossy. Pushes onto an in-memory ring buffer.
 *                       Worker flushes to PG every 5s. Crash before flush
 *                       loses up to 5s of analytics; acceptable.
 *
 *   recordEventSync(...) - sync, never lost. Direct INSERT, awaited. Used
 *                       only for the most important conversion events
 *                       (payment_confirmed, signup_complete) where we
 *                       cannot afford the ring-buffer crash window.
 *
 * Cookieless session hash: sha256(ip + ua + utc_date) truncated to 16 hex.
 * Computed from request headers. Rotates daily; we cannot reconstruct
 * cross-day behaviour for one visitor (privacy by design, no consent
 * banner needed in EU).
 *
 * Bot filter: isbot UA regex + Sec-Fetch-Site=none heuristic. Bots get
 * tagged with is_bot=true and session_hash='bot' so SEO traffic is
 * measurable but not counted in conversion math.
 *
 * Geo: Cloudflare CF-IPCountry header. Two-letter ISO. Free at the
 * Cloudflare dashboard. Falls back to 'XX' (unknown) if absent.
 *
 * The ring buffer is module-level state, so the WEB process and the
 * WORKER process each have their own. Web flushes periodically through
 * a background timer; worker also flushes its own (rare events) plus
 * acts as the canonical flush path for events the web process queued
 * before its own timer fires. Both write to the same DB so duplication
 * is impossible (each event is removed from its local buffer on flush).
 */

import crypto from 'node:crypto';
import { isbot } from 'isbot';
import { sql } from './db.server.js';

// ─────────────────────────────────────────────────────────────────────────
// Tunables (env-overridable)
// ─────────────────────────────────────────────────────────────────────────

const RING_BUFFER_MAX = parseInt(process.env.ANALYTICS_RING_BUFFER_MAX || '500', 10);
const RING_FLUSH_INTERVAL_MS = parseInt(process.env.ANALYTICS_FLUSH_INTERVAL_MS || '5000', 10);
const ANALYTICS_ENABLED = (process.env.ANALYTICS_ENABLED ?? 'true') !== 'false';

// ─────────────────────────────────────────────────────────────────────────
// Pepper for session-hash derivation
//
// Reuses VERIFICATION_CODE_PEPPER (already required and asserted by
// session.server.js at module load). This means:
//   1. No new secret to manage.
//   2. The pepper is already 32+ chars and rotated like the rest of the
//      auth surface.
//   3. The session_hash cannot be reproduced offline by an attacker who
//      learns IP + UA + date but not the pepper.
// ─────────────────────────────────────────────────────────────────────────

const _pepper = process.env.VERIFICATION_CODE_PEPPER;
if (!_pepper || _pepper.length < 32) {
  throw new Error(
    'VERIFICATION_CODE_PEPPER must be set for analytics session hashing. ' +
    'See session.server.js (already enforced).'
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Ring buffer (per-process)
// ─────────────────────────────────────────────────────────────────────────

const buffer = [];
let bufferDropped = 0;

function pushToBuffer(row) {
  if (buffer.length >= RING_BUFFER_MAX) {
    // Buffer full: drop oldest (the analytics tail), not newest. The
    // newest events are most likely to be relevant for the very-current
    // dashboards; if we're dropping under sustained load the rollup will
    // catch yesterday's full picture from disk anyway.
    buffer.shift();
    bufferDropped++;
  }
  buffer.push(row);
}

// ─────────────────────────────────────────────────────────────────────────
// Request derivation
// ─────────────────────────────────────────────────────────────────────────

/**
 * Derive a daily-rotating cookieless session hash from request headers.
 *
 * @param {Request} request - Web fetch Request
 * @returns {string} 16 lowercase hex chars, or 'bot' for bot UAs
 */
export function deriveSessionHash(request) {
  const ua = request.headers.get('user-agent') || '';
  if (isbot(ua)) return 'bot';

  const ip = getClientIp(request);
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  const input = `${ip}|${ua}|${day}|${_pepper}`;
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}

/**
 * Authoritative client IP behind the Cloudflare/Coolify front. Picks the
 * leftmost X-Forwarded-For entry (the original visitor per RFC 7239),
 * falls back to X-Real-IP, then to the connecting-IP-equivalent header.
 */
export function getClientIp(request) {
  const cfip = request.headers.get('cf-connecting-ip');
  if (cfip) return cfip;
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

/**
 * Two-letter ISO country from Cloudflare's CF-IPCountry header. Returns
 * 'XX' if absent or invalid.
 */
export function getCountry(request) {
  const c = request.headers.get('cf-ipcountry');
  if (!c) return 'XX';
  if (!/^[A-Z]{2}$/.test(c)) return 'XX';
  return c;
}

/**
 * Coarse device class from UA. Three buckets is enough for admin
 * dashboards; finer breakdowns belong in a real analytics product.
 */
export function getDeviceClass(request) {
  const ua = request.headers.get('user-agent') || '';
  if (!ua) return 'unknown';
  if (isbot(ua)) return 'bot';
  if (/iPad|Tablet/i.test(ua)) return 'tablet';
  if (/Mobile|Android|iPhone/i.test(ua)) return 'mobile';
  return 'desktop';
}

/**
 * Parse referrer + UTM from request URL + Referer header. Stores only
 * the referrer DOMAIN (privacy: don't log full referring URLs which can
 * carry sensitive query strings).
 */
export function parseReferrerAndUtm(request) {
  let referrer_domain = null;
  const ref = request.headers.get('referer');
  if (ref) {
    try {
      const u = new URL(ref);
      const here = new URL(request.url);
      // Same-origin referrers are not useful for attribution.
      if (u.host !== here.host) {
        referrer_domain = u.hostname;
      }
    } catch {
      // Malformed referer header. Ignore.
    }
  }

  const url = (() => {
    try { return new URL(request.url); } catch { return null; }
  })();
  const params = url?.searchParams;

  return {
    referrer_domain,
    utm_source:   params?.get('utm_source')   || null,
    utm_medium:   params?.get('utm_medium')   || null,
    utm_campaign: params?.get('utm_campaign') || null,
  };
}

/**
 * Build a fully-populated analytics row from a request + event params.
 * Lets routes fire-and-forget without re-deriving hash/country/etc each time.
 */
export function buildEventFromRequest(request, { eventType, path, userId, metadata }) {
  const ua = request.headers.get('user-agent') || '';
  const isBot = isbot(ua);
  const { referrer_domain, utm_source, utm_medium, utm_campaign } = parseReferrerAndUtm(request);

  return {
    event_type: eventType,
    session_hash: deriveSessionHash(request),
    user_id: userId ?? null,
    path: path ?? null,
    referrer_domain,
    utm_source,
    utm_medium,
    utm_campaign,
    country: getCountry(request),
    device_class: getDeviceClass(request),
    is_bot: isBot,
    metadata: metadata ?? {},
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Recording API
// ─────────────────────────────────────────────────────────────────────────

/**
 * Async record. Pushes to ring buffer; worker flushes to PG.
 * No await, no Promise returned. Bot events are dropped at insertion
 * time (we still process them for is_bot=true SEO reports? No - they
 * pollute live dashboards. Drop here, count separately if ever needed).
 */
export function recordEvent(row) {
  if (!ANALYTICS_ENABLED) return;
  if (!row?.event_type) return;
  // Don't record bot events at all. Bot detection is for the bot filter,
  // not for inflating "we got 50k visits this week" with crawler noise.
  if (row.is_bot) return;
  pushToBuffer(row);
}

/**
 * Sync record. Direct INSERT, awaited. Use for events where data loss
 * would corrupt the conversion funnel: payment_confirmed (revenue
 * attribution), auth_welcome_credited (signup analytics).
 */
export async function recordEventSync(row) {
  if (!ANALYTICS_ENABLED) return;
  if (!row?.event_type) return;
  if (row.is_bot) return;
  await insertOne(row);
}

// ─────────────────────────────────────────────────────────────────────────
// Flush (batched insert via UNNEST)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Drain the ring buffer to PG. Returns the number of rows flushed.
 * Called by the worker on a 5s interval; can also be called manually
 * (tests, graceful shutdown).
 */
export async function flushAnalyticsBuffer() {
  if (buffer.length === 0) return 0;

  // Snapshot + clear so concurrent recordEvent calls don't double-flush.
  const batch = buffer.splice(0, buffer.length);

  try {
    await insertBatch(batch);
    return batch.length;
  } catch (err) {
    // Re-buffer on failure so we don't lose the batch. Bound the re-buffer
    // to RING_BUFFER_MAX so we don't OOM on prolonged DB outage.
    const retryRoom = Math.max(0, RING_BUFFER_MAX - buffer.length);
    const retryBatch = batch.slice(-retryRoom);
    for (const row of retryBatch) buffer.push(row);
    bufferDropped += batch.length - retryBatch.length;
    console.error('[analytics] flush failed, re-queued', retryBatch.length, 'dropped', batch.length - retryBatch.length, err.message);
    throw err;
  }
}

async function insertOne(row) {
  await sql`
    INSERT INTO analytics_events (
      event_type, session_hash, user_id, path,
      referrer_domain, utm_source, utm_medium, utm_campaign,
      country, device_class, is_bot, metadata
    ) VALUES (
      ${row.event_type}, ${row.session_hash}, ${row.user_id ?? null}, ${row.path ?? null},
      ${row.referrer_domain ?? null}, ${row.utm_source ?? null}, ${row.utm_medium ?? null}, ${row.utm_campaign ?? null},
      ${row.country ?? 'XX'}, ${row.device_class ?? 'unknown'}, ${row.is_bot ?? false}, ${sql.json(row.metadata ?? {})}
    )
  `;
}

async function insertBatch(rows) {
  if (rows.length === 0) return;
  if (rows.length === 1) return insertOne(rows[0]);

  // porsager/postgres handles array-of-objects insert natively. Keys must
  // exist on every row; we already normalise in buildEventFromRequest +
  // recordEvent's row shape.
  const normalised = rows.map((r) => ({
    event_type:      r.event_type,
    session_hash:    r.session_hash,
    user_id:         r.user_id ?? null,
    path:            r.path ?? null,
    referrer_domain: r.referrer_domain ?? null,
    utm_source:      r.utm_source ?? null,
    utm_medium:      r.utm_medium ?? null,
    utm_campaign:    r.utm_campaign ?? null,
    country:         r.country ?? 'XX',
    device_class:    r.device_class ?? 'unknown',
    is_bot:          r.is_bot ?? false,
    metadata:        r.metadata ?? {},
  }));

  await sql`
    INSERT INTO analytics_events ${sql(normalised,
      'event_type', 'session_hash', 'user_id', 'path',
      'referrer_domain', 'utm_source', 'utm_medium', 'utm_campaign',
      'country', 'device_class', 'is_bot', 'metadata'
    )}
  `;
}

// ─────────────────────────────────────────────────────────────────────────
// Daily rollup
// ─────────────────────────────────────────────────────────────────────────

/**
 * Compute analytics_daily rows for a given UTC day from analytics_events.
 * Idempotent via PRIMARY KEY ON CONFLICT - safe to re-run for any day.
 *
 * Worker invokes for "yesterday" at ~00:05 UTC. Admin can also invoke on
 * demand for backfills.
 *
 * @param {string} dayIso - 'YYYY-MM-DD'
 * @returns {Promise<number>} total rollup rows written
 */
export async function computeDailyRollup(dayIso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayIso)) {
    throw new Error(`computeDailyRollup: invalid day ${dayIso}`);
  }

  let total = 0;

  // pageview by path
  total += (await sql`
    INSERT INTO analytics_daily (day, dimension, dimension_value, event_count, unique_sessions, unique_users, computed_at)
    SELECT
      ${dayIso}::date,
      'pageview_path',
      COALESCE(path, '/unknown'),
      COUNT(*)::int,
      COUNT(DISTINCT session_hash)::int,
      COUNT(DISTINCT user_id)::int,
      now()
    FROM analytics_events
    WHERE created_at >= ${dayIso}::date
      AND created_at <  (${dayIso}::date + INTERVAL '1 day')
      AND event_type = 'pageview'
      AND is_bot = FALSE
    GROUP BY COALESCE(path, '/unknown')
    ON CONFLICT (day, dimension, dimension_value)
    DO UPDATE SET
      event_count     = EXCLUDED.event_count,
      unique_sessions = EXCLUDED.unique_sessions,
      unique_users    = EXCLUDED.unique_users,
      computed_at     = now()
  `).count || 0;

  // tool events
  total += (await sql`
    INSERT INTO analytics_daily (day, dimension, dimension_value, event_count, unique_sessions, unique_users, computed_at)
    SELECT
      ${dayIso}::date,
      'tool_event',
      event_type,
      COUNT(*)::int,
      COUNT(DISTINCT session_hash)::int,
      COUNT(DISTINCT user_id)::int,
      now()
    FROM analytics_events
    WHERE created_at >= ${dayIso}::date
      AND created_at <  (${dayIso}::date + INTERVAL '1 day')
      AND event_type LIKE 'tool_%'
      AND is_bot = FALSE
    GROUP BY event_type
    ON CONFLICT (day, dimension, dimension_value)
    DO UPDATE SET
      event_count     = EXCLUDED.event_count,
      unique_sessions = EXCLUDED.unique_sessions,
      unique_users    = EXCLUDED.unique_users,
      computed_at     = now()
  `).count || 0;

  // funnel steps (auth + purchase)
  total += (await sql`
    INSERT INTO analytics_daily (day, dimension, dimension_value, event_count, unique_sessions, unique_users, computed_at)
    SELECT
      ${dayIso}::date,
      'funnel_step',
      event_type,
      COUNT(*)::int,
      COUNT(DISTINCT session_hash)::int,
      COUNT(DISTINCT user_id)::int,
      now()
    FROM analytics_events
    WHERE created_at >= ${dayIso}::date
      AND created_at <  (${dayIso}::date + INTERVAL '1 day')
      AND (event_type LIKE 'auth_%' OR event_type IN ('credits_view','package_select','checkout_click','gateway_redirect','payment_pending','payment_confirmed','payment_failed','payment_abandoned'))
      AND is_bot = FALSE
    GROUP BY event_type
    ON CONFLICT (day, dimension, dimension_value)
    DO UPDATE SET
      event_count     = EXCLUDED.event_count,
      unique_sessions = EXCLUDED.unique_sessions,
      unique_users    = EXCLUDED.unique_users,
      computed_at     = now()
  `).count || 0;

  // country
  total += (await sql`
    INSERT INTO analytics_daily (day, dimension, dimension_value, event_count, unique_sessions, unique_users, computed_at)
    SELECT
      ${dayIso}::date,
      'country',
      COALESCE(country, 'XX'),
      COUNT(*)::int,
      COUNT(DISTINCT session_hash)::int,
      COUNT(DISTINCT user_id)::int,
      now()
    FROM analytics_events
    WHERE created_at >= ${dayIso}::date
      AND created_at <  (${dayIso}::date + INTERVAL '1 day')
      AND is_bot = FALSE
    GROUP BY COALESCE(country, 'XX')
    ON CONFLICT (day, dimension, dimension_value)
    DO UPDATE SET
      event_count     = EXCLUDED.event_count,
      unique_sessions = EXCLUDED.unique_sessions,
      unique_users    = EXCLUDED.unique_users,
      computed_at     = now()
  `).count || 0;

  // referrer domain
  total += (await sql`
    INSERT INTO analytics_daily (day, dimension, dimension_value, event_count, unique_sessions, unique_users, computed_at)
    SELECT
      ${dayIso}::date,
      'referrer_domain',
      referrer_domain,
      COUNT(*)::int,
      COUNT(DISTINCT session_hash)::int,
      COUNT(DISTINCT user_id)::int,
      now()
    FROM analytics_events
    WHERE created_at >= ${dayIso}::date
      AND created_at <  (${dayIso}::date + INTERVAL '1 day')
      AND referrer_domain IS NOT NULL
      AND is_bot = FALSE
    GROUP BY referrer_domain
    ON CONFLICT (day, dimension, dimension_value)
    DO UPDATE SET
      event_count     = EXCLUDED.event_count,
      unique_sessions = EXCLUDED.unique_sessions,
      unique_users    = EXCLUDED.unique_users,
      computed_at     = now()
  `).count || 0;

  // utm_source
  total += (await sql`
    INSERT INTO analytics_daily (day, dimension, dimension_value, event_count, unique_sessions, unique_users, computed_at)
    SELECT
      ${dayIso}::date,
      'utm_source',
      utm_source,
      COUNT(*)::int,
      COUNT(DISTINCT session_hash)::int,
      COUNT(DISTINCT user_id)::int,
      now()
    FROM analytics_events
    WHERE created_at >= ${dayIso}::date
      AND created_at <  (${dayIso}::date + INTERVAL '1 day')
      AND utm_source IS NOT NULL
      AND is_bot = FALSE
    GROUP BY utm_source
    ON CONFLICT (day, dimension, dimension_value)
    DO UPDATE SET
      event_count     = EXCLUDED.event_count,
      unique_sessions = EXCLUDED.unique_sessions,
      unique_users    = EXCLUDED.unique_users,
      computed_at     = now()
  `).count || 0;

  return total;
}

// ─────────────────────────────────────────────────────────────────────────
// Retention sweep
// ─────────────────────────────────────────────────────────────────────────

/**
 * Drop analytics_events older than ANALYTICS_EVENT_RETENTION_DAYS.
 * Daily rollups (analytics_daily) survive forever - they're small.
 */
export async function cleanupOldAnalyticsEvents() {
  const days = parseInt(process.env.ANALYTICS_EVENT_RETENTION_DAYS || '90', 10);
  const r = await sql`
    DELETE FROM analytics_events
    WHERE created_at < now() - make_interval(days => ${days})
  `;
  return r.count || 0;
}

// ─────────────────────────────────────────────────────────────────────────
// Telemetry on the telemetry
// ─────────────────────────────────────────────────────────────────────────

export function getBufferStats() {
  return {
    queued: buffer.length,
    dropped: bufferDropped,
    max: RING_BUFFER_MAX,
    flushIntervalMs: RING_FLUSH_INTERVAL_MS,
  };
}

export const ANALYTICS_FLUSH_INTERVAL_MS = RING_FLUSH_INTERVAL_MS;

// ─────────────────────────────────────────────────────────────────────────
// Auto-start web-process flush timer
//
// The worker has its own loop (see worker/index.js) which is the
// canonical flush path. The web process also accumulates events in its
// own ring buffer (different process = different buffer). Without a
// timer here, web events would only flush when the buffer hits
// RING_BUFFER_MAX, then trigger an oldest-drop. Cleaner: web process
// flushes itself on the same cadence.
//
// Guarded with globalThis to survive Vite HMR module reloads in dev
// (otherwise we'd accumulate timers on every save).
//
// Disabled when:
//   - ANALYTICS_ENABLED=false
//   - NODE_ENV='test' (tests should call flushAnalyticsBuffer explicitly)
//   - This file is loaded inside the worker process (the worker has its
//     own loop). Detected via env IS_WORKER set by worker/index.js boot.
// ─────────────────────────────────────────────────────────────────────────

if (
  ANALYTICS_ENABLED &&
  process.env.NODE_ENV !== 'test' &&
  process.env.IS_WORKER !== 'true' &&
  !globalThis.__trov_analytics_timer
) {
  globalThis.__trov_analytics_timer = setInterval(() => {
    flushAnalyticsBuffer().catch((err) => {
      console.error('[analytics] auto-flush failed:', err.message);
    });
  }, RING_FLUSH_INTERVAL_MS);
  // Don't keep the event loop alive just for this timer (process exit
  // shouldn't be blocked by analytics flushing).
  if (typeof globalThis.__trov_analytics_timer.unref === 'function') {
    globalThis.__trov_analytics_timer.unref();
  }
}
