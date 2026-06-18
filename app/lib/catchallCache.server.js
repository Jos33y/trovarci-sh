/* ═══════════════════════════════════════════════════════════════════════════
   catchallCache.server.js

   24-hour cache for catch-all status per domain. Without this cache, a
   50,000-row bulk job at one corporate domain would probe the same MX
   50,000 times - guaranteed IP block within minutes.

   Schema lives in domain_catchall_cache (created by the verification_jobs
   migration). Operations:

     getCatchall(domain)           -> { isCatchall, lastChecked, detectedVia } | null
     setCatchall(domain, val, ...) -> upsert with TTL
     invalidate(domain)            -> drop the row (admin override path)
     cleanupExpired()              -> housekeeping

   Why 24h:
     Industry baseline (NeverBounce, ZeroBounce both refresh in 24-48h
     windows publicly). Long enough to amortize probe cost across a busy
     job; short enough that a server admin's catch-all config change is
     reflected within a day.

   Why a separate table not a JSONB column on something else:
     Catch-all status is keyed by domain, not by user or job. Hosting it
     anywhere user-scoped would mean re-probing the same domain N times
     per N customers verifying the same list. The shared cache is a
     legitimate performance optimisation that benefits every customer.

   Concurrency:
     The setCatchall path uses ON CONFLICT (domain) DO UPDATE so two
     workers probing the same domain at the same time do not race. The
     last writer wins, which is fine - both should agree on the verdict
     anyway.
   ═══════════════════════════════════════════════════════════════════════════ */

import { sql } from '../utils/db.server.js';

const DEFAULT_TTL_HOURS = 24;

/**
 * Look up cached catch-all status for a domain. Returns null on cache miss
 * or if the cached entry has expired.
 *
 * @param {string} domain - lowercased domain
 * @returns {Promise<{isCatchall: boolean, lastChecked: Date, detectedVia: string} | null>}
 */
export async function getCatchall(domain) {
  if (typeof domain !== 'string' || !domain) return null;
  const normalized = domain.trim().toLowerCase();
  if (!normalized) return null;

  const [row] = await sql`
    SELECT is_catchall, last_checked, detected_via
    FROM domain_catchall_cache
    WHERE domain = ${normalized}
      AND expires_at > now()
    LIMIT 1
  `;

  if (!row) return null;
  return {
    isCatchall: row.is_catchall,
    lastChecked: row.last_checked,
    detectedVia: row.detected_via,
  };
}

/**
 * Upsert a catch-all verdict for a domain.
 *
 * detectedVia values:
 *   'rcpt_random'  - probed via random-local-part RCPT TO (the normal path)
 *   'manual_admin' - admin override (force a specific verdict, say after
 *                    a customer dispute). Same TTL as auto-detected unless
 *                    a longer ttlHours is passed explicitly.
 *   'imported'     - bulk imported from an external source. Reserved for
 *                    future use; nothing currently uses this.
 *
 * @param {string} domain - lowercased domain
 * @param {boolean} isCatchall - the verdict
 * @param {object} [opts]
 * @param {string} [opts.detectedVia] - default 'rcpt_random'
 * @param {number} [opts.ttlHours] - default 24
 */
export async function setCatchall(domain, isCatchall, opts = {}) {
  if (typeof domain !== 'string' || !domain) {
    throw new Error('domain is required');
  }
  if (typeof isCatchall !== 'boolean') {
    throw new Error('isCatchall must be a boolean');
  }

  const normalized = domain.trim().toLowerCase();
  const detectedVia = opts.detectedVia || 'rcpt_random';
  const ttlHours = Number.isFinite(opts.ttlHours) && opts.ttlHours > 0
    ? opts.ttlHours
    : DEFAULT_TTL_HOURS;

  await sql`
    INSERT INTO domain_catchall_cache (
      domain, is_catchall, detected_via, last_checked, expires_at
    )
    VALUES (
      ${normalized},
      ${isCatchall},
      ${detectedVia},
      now(),
      now() + make_interval(hours => ${ttlHours})
    )
    ON CONFLICT (domain) DO UPDATE SET
      is_catchall  = EXCLUDED.is_catchall,
      detected_via = EXCLUDED.detected_via,
      last_checked = EXCLUDED.last_checked,
      expires_at   = EXCLUDED.expires_at
  `;
}

/**
 * Drop the cache entry for a domain. Use when an admin disputes a verdict
 * or when the team manually flushes a stale entry. Returns true if a row
 * was deleted, false if there was nothing to drop.
 */
export async function invalidate(domain) {
  if (typeof domain !== 'string' || !domain) return false;
  const normalized = domain.trim().toLowerCase();
  const result = await sql`
    DELETE FROM domain_catchall_cache WHERE domain = ${normalized}
  `;
  return result.count > 0;
}

/**
 * Drop every cache entry whose TTL has expired. Call from the nightly
 * cleanup task. Returns the count of rows deleted.
 *
 * The dcc_expires index makes this an indexed range scan, not a seq scan -
 * fast even with millions of cached domains.
 */
export async function cleanupExpired() {
  const result = await sql`
    DELETE FROM domain_catchall_cache WHERE expires_at < now()
  `;
  return result.count;
}

/**
 * Diagnostics. Returns aggregate counts; never includes raw domains.
 */
export async function getStats() {
  const [row] = await sql`
    SELECT
      COUNT(*)::int                                              AS total,
      COUNT(*) FILTER (WHERE is_catchall)::int                   AS catchall,
      COUNT(*) FILTER (WHERE NOT is_catchall)::int               AS not_catchall,
      COUNT(*) FILTER (WHERE expires_at < now())::int            AS expired
    FROM domain_catchall_cache
  `;
  return row;
}
