// Analytics recording: cookieless session hash, bot filter, attribution from the visited page, batched PG writes.

import crypto from 'node:crypto';
import { isbot } from 'isbot';
import { sql } from './db.server.js';

const RING_BUFFER_MAX = parseInt(process.env.ANALYTICS_RING_BUFFER_MAX || '500', 10);
const RING_FLUSH_INTERVAL_MS = parseInt(process.env.ANALYTICS_FLUSH_INTERVAL_MS || '5000', 10);
const ANALYTICS_ENABLED = (process.env.ANALYTICS_ENABLED ?? 'true') !== 'false';

// Reuses VERIFICATION_CODE_PEPPER so the session hash cannot be rebuilt offline from IP + UA + date.
const _pepper = process.env.VERIFICATION_CODE_PEPPER;
if (!_pepper || _pepper.length < 32) {
  throw new Error('VERIFICATION_CODE_PEPPER must be set for analytics session hashing.');
}

// Hosts that count as our own site, so internal navigation is never a referrer.
const OWN_HOSTS = new Set(['trovarci.sh', 'www.trovarci.sh', 'localhost']);

const buffer = [];
let bufferDropped = 0;

function pushToBuffer(row) {
  if (buffer.length >= RING_BUFFER_MAX) {
    buffer.shift();
    bufferDropped++;
  }
  buffer.push(row);
}

// Daily-rotating hash of IP + UA + UTC date. Returns 'bot' for crawler UAs.
export function deriveSessionHash(request) {
  const ua = request.headers.get('user-agent') || '';
  if (isbot(ua)) return 'bot';

  const ip = getClientIp(request);
  const day = new Date().toISOString().slice(0, 10);
  const input = `${ip}|${ua}|${day}|${_pepper}`;
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export function getClientIp(request) {
  const cfip = request.headers.get('cf-connecting-ip');
  if (cfip) return cfip;
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

export function getCountry(request) {
  const c = request.headers.get('cf-ipcountry');
  if (!c) return 'XX';
  if (!/^[A-Z]{2}$/.test(c)) return 'XX';
  return c;
}

export function getDeviceClass(request) {
  const ua = request.headers.get('user-agent') || '';
  if (!ua) return 'unknown';
  if (isbot(ua)) return 'bot';
  if (/iPad|Tablet/i.test(ua)) return 'tablet';
  if (/Mobile|Android|iPhone/i.test(ua)) return 'mobile';
  return 'desktop';
}

// Hostname without "www.", lowercased, or null for our own site and malformed URLs.
export function referrerDomainOf(url) {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (!host || OWN_HOSTS.has(host)) return null;
    return host.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// Stores only the referring domain, never the full referring URL (it can carry private query strings).
// pageUrl and referrer describe the page the visitor is on; without them the request itself is used.
export function parseReferrerAndUtm(request, { pageUrl = null, referrer } = {}) {
  const referrer_domain = referrerDomainOf(
    referrer !== undefined ? referrer : request.headers.get('referer'),
  );

  let params = null;
  try {
    params = new URL(pageUrl || request.url, request.url).searchParams;
  } catch {
    params = null;
  }
  const utm = (key) => {
    const v = params?.get(key);
    return v ? v.slice(0, 128) : null;
  };

  return {
    referrer_domain,
    utm_source: utm('utm_source'),
    utm_medium: utm('utm_medium'),
    utm_campaign: utm('utm_campaign'),
  };
}

export function buildEventFromRequest(request, { eventType, path, userId, metadata, pageUrl, referrer }) {
  const ua = request.headers.get('user-agent') || '';
  const isBot = isbot(ua);
  const attribution = parseReferrerAndUtm(request, { pageUrl, referrer });

  return {
    event_type: eventType,
    session_hash: deriveSessionHash(request),
    user_id: userId ?? null,
    path: path ?? null,
    ...attribution,
    country: getCountry(request),
    device_class: getDeviceClass(request),
    is_bot: isBot,
    metadata: metadata ?? {},
    created_at: new Date(),
  };
}

// Async and lossy: queued, flushed every few seconds. Bot rows are dropped here.
export function recordEvent(row) {
  if (!ANALYTICS_ENABLED) return;
  if (!row?.event_type) return;
  if (row.is_bot) return;
  if (!row.created_at) row.created_at = new Date();
  pushToBuffer(row);
}

// Awaited direct insert, for conversions the funnel cannot afford to lose.
export async function recordEventSync(row) {
  if (!ANALYTICS_ENABLED) return;
  if (!row?.event_type) return;
  if (row.is_bot) return;
  await insertOne({ ...row, created_at: row.created_at ?? new Date() });
}

export async function flushAnalyticsBuffer() {
  if (buffer.length === 0) return 0;

  const batch = buffer.splice(0, buffer.length);

  try {
    await insertBatch(batch);
    return batch.length;
  } catch (err) {
    // Re-queue on failure, bounded so a long DB outage cannot exhaust memory.
    const retryRoom = Math.max(0, RING_BUFFER_MAX - buffer.length);
    const retryBatch = batch.slice(-retryRoom);
    for (const row of retryBatch) buffer.push(row);
    bufferDropped += batch.length - retryBatch.length;
    console.error('[analytics] flush failed, re-queued', retryBatch.length, 'dropped', batch.length - retryBatch.length, err.message);
    throw err;
  }
}

function normalise(r) {
  return {
    created_at: r.created_at ?? new Date(),
    event_type: r.event_type,
    session_hash: r.session_hash,
    user_id: r.user_id ?? null,
    path: r.path ?? null,
    referrer_domain: r.referrer_domain ?? null,
    utm_source: r.utm_source ?? null,
    utm_medium: r.utm_medium ?? null,
    utm_campaign: r.utm_campaign ?? null,
    country: r.country ?? 'XX',
    device_class: r.device_class ?? 'unknown',
    is_bot: r.is_bot ?? false,
    metadata: r.metadata ?? {},
  };
}

const COLUMNS = [
  'created_at', 'event_type', 'session_hash', 'user_id', 'path',
  'referrer_domain', 'utm_source', 'utm_medium', 'utm_campaign',
  'country', 'device_class', 'is_bot', 'metadata',
];

async function insertOne(row) {
  const r = normalise(row);
  await sql`
    INSERT INTO analytics_events (
      created_at, event_type, session_hash, user_id, path,
      referrer_domain, utm_source, utm_medium, utm_campaign,
      country, device_class, is_bot, metadata
    ) VALUES (
      ${r.created_at}, ${r.event_type}, ${r.session_hash}, ${r.user_id}, ${r.path},
      ${r.referrer_domain}, ${r.utm_source}, ${r.utm_medium}, ${r.utm_campaign},
      ${r.country}, ${r.device_class}, ${r.is_bot}, ${sql.json(r.metadata)}
    )
  `;
}

async function insertBatch(rows) {
  if (rows.length === 0) return;
  if (rows.length === 1) return insertOne(rows[0]);
  await sql`INSERT INTO analytics_events ${sql(rows.map(normalise), ...COLUMNS)}`;
}

// Idempotent: safe to re-run for any day. Worker runs it for yesterday shortly after midnight UTC.
export async function computeDailyRollup(dayIso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayIso)) {
    throw new Error(`computeDailyRollup: invalid day ${dayIso}`);
  }

  let total = 0;

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

// Raw events expire after ANALYTICS_EVENT_RETENTION_DAYS; daily rollups are kept.
export async function cleanupOldAnalyticsEvents() {
  const days = parseInt(process.env.ANALYTICS_EVENT_RETENTION_DAYS || '90', 10);
  const r = await sql`
    DELETE FROM analytics_events
    WHERE created_at < now() - make_interval(days => ${days})
  `;
  return r.count || 0;
}

export function getBufferStats() {
  return {
    queued: buffer.length,
    dropped: bufferDropped,
    max: RING_BUFFER_MAX,
    flushIntervalMs: RING_FLUSH_INTERVAL_MS,
  };
}

export const ANALYTICS_FLUSH_INTERVAL_MS = RING_FLUSH_INTERVAL_MS;

// Web process flushes its own buffer; the worker runs its own loop (IS_WORKER). globalThis guard survives HMR.
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
  if (typeof globalThis.__trov_analytics_timer.unref === 'function') {
    globalThis.__trov_analytics_timer.unref();
  }
}
