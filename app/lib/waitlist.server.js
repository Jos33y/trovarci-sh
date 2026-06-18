/**
 * Waitlist email capture.
 *
 * Two callers:
 *   - /api/waitlist resource route (anon + authed, JSON POST)
 *   - dashboard loader (authed only, "is this user already on the list?")
 *
 * The lib does NOT do rate limiting; that lives on the resource route per
 * the same separation we use elsewhere (lib = business logic, route =
 * orchestration + auth + abuse controls).
 */

import { sql } from '../utils/db.server.js';
import { validateEmail } from '../utils/validation.server.js';

// Surfaces we accept attribution from. Free-text in the DB so the lib is
// not the gatekeeper for adding a new surface, but we reject obvious
// garbage to prevent random callers polluting the column.
const ALLOWED_SOURCES = new Set(['download_page', 'dashboard_panel']);

/**
 * Add an email to the waitlist. Idempotent on lowercased email - resubmitting
 * the same address from any surface is a no-op that returns alreadyOnList.
 *
 * @param {string} rawEmail
 * @param {object} opts
 * @param {string} opts.source        - one of ALLOWED_SOURCES
 * @param {string} [opts.userId]      - authed signups carry their user_id
 * @param {string} [opts.userAgent]
 * @param {string} [opts.ipAddress]
 * @returns {Promise<
 *   | { ok: true, alreadyOnList: boolean }
 *   | { ok: false, error: string }
 * >}
 */
export async function addToWaitlist(rawEmail, { source, userId = null, userAgent = null, ipAddress = null } = {}) {
  const v = validateEmail(rawEmail);
  if (!v.ok) return { ok: false, error: v.error };

  if (!ALLOWED_SOURCES.has(source)) {
    return { ok: false, error: 'Invalid source' };
  }

  // ON CONFLICT lets the unique index decide; we don't pre-SELECT (which
  // would race a concurrent submit of the same address). Returning the
  // row when inserted, or zero rows when the conflict fired, gives us
  // alreadyOnList without a second query.
  const inserted = await sql`
    INSERT INTO waitlist_emails (email, source, user_id, user_agent, ip_address)
    VALUES (${v.value}, ${source}, ${userId}, ${userAgent}, ${ipAddress})
    ON CONFLICT ((lower(email))) DO NOTHING
    RETURNING id
  `;

  return { ok: true, alreadyOnList: inserted.length === 0 };
}

/**
 * Cheap check - "is this address already on the waitlist?" Used by the
 * dashboard loader to render the success state immediately when the user
 * has already signed up, instead of forcing them to resubmit.
 *
 * Single-row indexed lookup; runs sub-millisecond.
 */
export async function isEmailOnWaitlist(rawEmail) {
  const v = validateEmail(rawEmail);
  if (!v.ok) return false;

  const [row] = await sql`
    SELECT 1
    FROM waitlist_emails
    WHERE lower(email) = lower(${v.value})
    LIMIT 1
  `;
  return Boolean(row);
}
