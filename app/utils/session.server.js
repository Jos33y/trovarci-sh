/**
 * Session management.
 *
 * Model: opaque bearer tokens, server-side state.
 *   - Cookie value is a 256-bit random token, base64url-encoded (43 chars).
 *   - DB stores SHA-256 hash of the token, never the token itself.
 *   - Revocation is a boolean on the session row (revoked_at).
 *   - last_seen_at updates only when stale (> 5 min old) to avoid write
 *     amplification on active sessions.
 *
 * Also exposes:
 *   - Loader helpers:   requireUser, requireGuest, getOptionalUser
 *   - Pending cookie:   pendingVerificationCookie (for signup step 2)
 */

import crypto from 'node:crypto';
import { createCookie, redirect } from 'react-router';
import { sql } from './db.server.js';

const SESSION_COOKIE_NAME = 'trov_session';

export const SESSION_DURATION_MS  = 7 * 24 * 60 * 60 * 1000;   // 7 days
export const SESSION_REMEMBER_MS  = 30 * 24 * 60 * 60 * 1000;  // 30 days
const SESSION_TOUCH_THRESHOLD_MS  = 5 * 60 * 1000;             // 5 minutes

// ── Pepper assertion (fail-fast at module load) ─────────────────────────
// The previous implementation fell back to a hard-coded
// 'dev-only-fallback-do-not-use-in-prod' string when VERIFICATION_CODE_PEPPER
// was unset. In production that string would silently sign every signup
// pending-verification cookie, and an attacker who learned the fallback
// could forge any user's pending state.
//
// This module is imported by root.jsx and every authenticated route, so
// throwing here means a misconfigured production process refuses to serve
// its first request rather than silently degrading. Devs see the same
// error and set the env var.
const _pepper = process.env.VERIFICATION_CODE_PEPPER;
if (!_pepper || _pepper.length < 32) {
  throw new Error(
    'VERIFICATION_CODE_PEPPER must be set and at least 32 chars. ' +
    'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
  );
}

// -----------------------------------------------------------------------
// Token primitives
// -----------------------------------------------------------------------

function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// -----------------------------------------------------------------------
// Session CRUD
// -----------------------------------------------------------------------

export async function createSession(userId, options = {}) {
  const {
    userAgent = null,
    ipAddress = null,
    durationMs = SESSION_DURATION_MS,
  } = options;

  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + durationMs);

  const [row] = await sql`
    INSERT INTO sessions (user_id, token_hash, expires_at, user_agent, ip_address)
    VALUES (${userId}, ${tokenHash}, ${expiresAt}, ${userAgent}, ${ipAddress})
    RETURNING id, expires_at
  `;

  return { token, sessionId: row.id, expiresAt: row.expires_at };
}

export async function validateSession(token) {
  if (!token || typeof token !== 'string') return null;
  const tokenHash = hashToken(token);

  const [row] = await sql`
    SELECT
      s.id            AS session_id,
      s.last_seen_at  AS last_seen_at,
      s.expires_at    AS expires_at,
      u.id            AS user_id,
      u.email         AS email,
      u.email_verified_at,
      u.credits_balance,
      u.role
    FROM sessions s
    INNER JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${tokenHash}
      AND s.revoked_at IS NULL
      AND s.expires_at > now()
      AND u.deleted_at IS NULL
    LIMIT 1
  `;

  if (!row) return null;

  // Fire-and-forget stale-gated touch.
  const staleCutoff = new Date(Date.now() - SESSION_TOUCH_THRESHOLD_MS);
  if (row.last_seen_at < staleCutoff) {
    sql`
      UPDATE sessions
      SET last_seen_at = now()
      WHERE id = ${row.session_id}
        AND last_seen_at < ${staleCutoff}
    `.catch(() => {});
  }

  return {
    sessionId: row.session_id,
    expiresAt: row.expires_at,
    user: {
      id: row.user_id,
      email: row.email,
      emailVerifiedAt: row.email_verified_at,
      creditsBalance: row.credits_balance,
      role: row.role,
    },
  };
}

export async function revokeSession(token) {
  if (!token) return;
  const tokenHash = hashToken(token);
  await sql`
    UPDATE sessions
    SET revoked_at = now()
    WHERE token_hash = ${tokenHash}
      AND revoked_at IS NULL
  `;
}

export async function revokeAllUserSessions(userId) {
  await sql`
    UPDATE sessions
    SET revoked_at = now()
    WHERE user_id = ${userId}
      AND revoked_at IS NULL
  `;
}

export async function listUserSessions(userId) {
  return await sql`
    SELECT id, user_agent, ip_address, created_at, last_seen_at, expires_at
    FROM sessions
    WHERE user_id = ${userId}
      AND revoked_at IS NULL
      AND expires_at > now()
    ORDER BY last_seen_at DESC
  `;
}

// -----------------------------------------------------------------------
// Cookie plumbing
// -----------------------------------------------------------------------

export function parseSessionCookie(cookieHeader) {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';');
  for (const raw of cookies) {
    const idx = raw.indexOf('=');
    if (idx === -1) continue;
    const name = raw.slice(0, idx).trim();
    if (name !== SESSION_COOKIE_NAME) continue;
    const value = raw.slice(idx + 1).trim();
    return value || null;
  }
  return null;
}

export function serializeSessionCookie(token, expiresAt) {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  return buildCookie(token, { maxAge, expires: expiresAt.toUTCString() });
}

export function clearSessionCookie() {
  return buildCookie('', { maxAge: 0, expires: new Date(0).toUTCString() });
}

function buildCookie(value, { maxAge, expires }) {
  const parts = [
    `${SESSION_COOKIE_NAME}=${value}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=${maxAge}`,
    `Expires=${expires}`,
  ];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

// -----------------------------------------------------------------------
// Pending verification cookie (signup step 1 -> step 2)
//
// Signed via HMAC (React Router's createCookie handles this given `secrets`).
// Short-lived: matches verification code expiry.
//
// `secrets` is sourced from the same VERIFICATION_CODE_PEPPER asserted at
// module load. No fallback - if the pepper isn't set, the assertion above
// already crashed the process.
// -----------------------------------------------------------------------

export const pendingVerificationCookie = createCookie('trov_pending_verification', {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: 15 * 60, // 15 minutes
  secrets: [_pepper],
});

// -----------------------------------------------------------------------
// Request-level helpers
// -----------------------------------------------------------------------

export async function getSessionFromRequest(request) {
  const token = parseSessionCookie(request.headers.get('Cookie'));
  return validateSession(token);
}

/**
 * Use in loaders/actions on protected routes. Throws a redirect to /login
 * (preserving the intended destination) if unauthenticated.
 */
export async function requireUser(request, { redirectTo = '/login' } = {}) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    const url = new URL(request.url);
    const qs = new URLSearchParams({ redirectTo: url.pathname + url.search });
    throw redirect(`${redirectTo}?${qs.toString()}`);
  }
  return session.user;
}

/**
 * Use in loaders on /login and /signup to bounce already-authenticated users
 * into the app.
 */
export async function requireGuest(request, { redirectTo = '/dashboard' } = {}) {
  const session = await getSessionFromRequest(request);
  if (session) throw redirect(redirectTo);
  return null;
}

/**
 * Returns the user if authenticated, null otherwise. Does not redirect.
 */
export async function getOptionalUser(request) {
  const session = await getSessionFromRequest(request);
  return session?.user ?? null;
}

export { SESSION_COOKIE_NAME };
