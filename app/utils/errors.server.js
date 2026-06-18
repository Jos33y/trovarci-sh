/**
 * Error telemetry recording.
 *
 * Synchronous insert path. Errors must NEVER be lost - that's the entire
 * point of the table. Network outage to PG = log to stderr and continue,
 * but we don't ring-buffer errors because a crash before flush would lose
 * exactly the data we need to diagnose the crash.
 *
 * Three intake surfaces:
 *
 *   recordServerError(error, request, opts)
 *     Server-side route exceptions caught by handleError in entry.server.jsx.
 *
 *   recordClientError(payload, request)
 *     Client-side errors POSTed to /api/telemetry/error. Payload comes from
 *     window.onerror, unhandledrejection, or HydratedRouter onError={}.
 *
 *   recordWorkerError(error, opts)
 *     Worker process catches. No request context.
 *
 * PII redaction is enforced at intake. The redacted_context field is
 * shaped after cleaning, never raw.
 */

import { sql } from './db.server.js';
import { getCountry, deriveSessionHash } from './analytics.server.js';

const ERRORS_ENABLED = (process.env.ERRORS_ENABLED ?? 'true') !== 'false';

// ─────────────────────────────────────────────────────────────────────────
// PII redaction
//
// What we accept into redacted_context:
//   - HTTP method, route path, status code (no query string)
//   - Headers EXCEPT auth, cookie, x-api-key (full denylist below)
//   - User-Agent (kept raw - useful for debugging client bugs, not PII)
//   - Error name + message (truncated to 1KB each)
//   - Stack (truncated to 8KB)
//   - User id if known (UUID, not PII)
//   - Custom 'context' object passed by caller, walked recursively with
//     key-name redaction (passwords, tokens, emails -> hashes, etc)
//
// What we never accept:
//   - Raw IP (we have CF-IPCountry and the session hash; that's enough)
//   - Cookies, auth headers
//   - Email addresses in plaintext (hashed if present)
//   - Password / token / api-key fields (replaced with '[redacted]')
//   - Request bodies (could contain PII, never logged)
// ─────────────────────────────────────────────────────────────────────────

const HEADER_DENYLIST = new Set([
  'cookie', 'authorization', 'x-api-key', 'x-auth-token',
  'set-cookie', 'proxy-authorization', 'sign', 'stripe-signature',
]);

const KEY_DENYLIST_PARTIAL = [
  'password', 'token', 'secret', 'api_key', 'apikey',
  'access_key', 'auth', 'session', 'jwt', 'cookie', 'credit_card',
  'card_number', 'cvv', 'pan', 'ssn', 'social_security',
];

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

import crypto from 'node:crypto';
function hashEmail(email) {
  return 'email:' + crypto.createHash('sha256').update(String(email).toLowerCase()).digest('hex').slice(0, 12);
}

function redactString(s, maxLen = 1024) {
  if (typeof s !== 'string') return s;
  let out = s.length > maxLen ? s.slice(0, maxLen) + '…[truncated]' : s;
  out = out.replace(EMAIL_RE, hashEmail);
  return out;
}

function redactValue(value, depth = 0) {
  if (depth > 6) return '[depth_exceeded]';
  if (value == null) return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((v) => redactValue(v, depth + 1));
  }
  if (typeof value === 'object') {
    const out = {};
    let count = 0;
    for (const [k, v] of Object.entries(value)) {
      if (count++ >= 50) { out['[truncated]'] = true; break; }
      const lowerK = k.toLowerCase();
      if (KEY_DENYLIST_PARTIAL.some((p) => lowerK.includes(p))) {
        out[k] = '[redacted]';
      } else if (lowerK === 'email' && typeof v === 'string') {
        out[k] = hashEmail(v);
      } else {
        out[k] = redactValue(v, depth + 1);
      }
    }
    return out;
  }
  return String(value).slice(0, 256);
}

function redactHeaders(request) {
  if (!request?.headers) return {};
  const out = {};
  // Preserve only headers we know are safe + useful for debugging.
  const SAFE = ['user-agent', 'referer', 'accept-language', 'cf-ipcountry', 'sec-fetch-mode', 'sec-fetch-site', 'sec-fetch-dest'];
  for (const name of SAFE) {
    const v = request.headers.get(name);
    if (v) out[name] = redactString(v, 512);
  }
  // Note presence of denylisted headers without their values, so we can
  // see in admin "yes, an Authorization header was set, value not stored".
  for (const name of HEADER_DENYLIST) {
    if (request.headers.get(name)) out[`_${name}_present`] = true;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Recording
// ─────────────────────────────────────────────────────────────────────────

/**
 * @param {Error|unknown} error
 * @param {Request|undefined} request
 * @param {{
 *   kind?: 'server_route'|'client_route'|'client_script'|'client_async'|'api_call'|'worker'|'webhook',
 *   severity?: 'fatal'|'error'|'warning'|'info',
 *   userId?: string|null,
 *   statusCode?: number,
 *   context?: Record<string, unknown>,
 * }} [opts]
 */
export async function recordServerError(error, request, opts = {}) {
  if (!ERRORS_ENABLED) return;
  await record({
    kind: opts.kind ?? 'server_route',
    severity: opts.severity ?? 'error',
    error,
    request,
    userId: opts.userId ?? null,
    statusCode: opts.statusCode ?? null,
    context: opts.context ?? {},
  });
}

/**
 * Client-side error from /api/telemetry/error endpoint. The request
 * here is the BEACON request (client -> server), not the request that
 * caused the error - that lives in the payload.
 *
 * @param {object} payload - the JSON body the client sent
 * @param {Request} request - the beacon request (for IP/UA/country)
 * @param {string|null} [userId]
 */
export async function recordClientError(payload, request, userId = null) {
  if (!ERRORS_ENABLED) return;

  // The client-supplied data is untrusted: cap sizes, redact, never
  // execute. Stack/message/path are strings; everything else goes
  // through redactValue.
  const message = redactString(String(payload?.message ?? 'Unknown client error'), 1024);
  const stack = payload?.stack ? redactString(String(payload.stack), 8192) : null;
  const path = typeof payload?.path === 'string' ? payload.path.slice(0, 512) : null;
  const kindInput = payload?.kind;
  const kind = ['client_route', 'client_script', 'client_async'].includes(kindInput)
    ? kindInput
    : 'client_script';
  const severityInput = payload?.severity;
  const severity = ['fatal', 'error', 'warning', 'info'].includes(severityInput)
    ? severityInput
    : 'error';

  const ua = request.headers.get('user-agent') || null;

  await sql`
    INSERT INTO error_events (
      kind, severity, message, stack, path, method, status_code,
      user_id, session_hash, user_agent, country, redacted_context
    ) VALUES (
      ${kind}, ${severity}, ${message}, ${stack}, ${path}, NULL, NULL,
      ${userId}, ${deriveSessionHash(request)}, ${ua ? ua.slice(0, 512) : null},
      ${getCountry(request)},
      ${sql.json({
        client: redactValue(payload?.context ?? {}),
        url: typeof payload?.url === 'string' ? payload.url.slice(0, 512) : null,
        line: Number.isFinite(payload?.line) ? payload.line : null,
        column: Number.isFinite(payload?.column) ? payload.column : null,
      })}
    )
  `;
}

export async function recordWorkerError(error, opts = {}) {
  if (!ERRORS_ENABLED) return;
  await record({
    kind: 'worker',
    severity: opts.severity ?? 'error',
    error,
    request: null,
    userId: null,
    statusCode: null,
    context: opts.context ?? {},
  });
}

async function record({ kind, severity, error, request, userId, statusCode, context }) {
  const message = redactString(
    error instanceof Error ? error.message : String(error ?? 'Unknown error'),
    1024,
  );
  const stack = error instanceof Error && error.stack
    ? redactString(error.stack, 8192)
    : null;

  let path = null;
  let method = null;
  let userAgent = null;
  let sessionHash = null;
  let country = 'XX';

  if (request) {
    try {
      const url = new URL(request.url);
      path = url.pathname.slice(0, 512);
    } catch {
      path = null;
    }
    method = request.method;
    userAgent = request.headers.get('user-agent') || null;
    sessionHash = deriveSessionHash(request);
    country = getCountry(request);
  }

  const safeContext = {
    headers: request ? redactHeaders(request) : {},
    user_context: redactValue(context ?? {}),
    error_name: error instanceof Error ? error.name : null,
    error_code: error instanceof Error && 'code' in error ? String(error.code) : null,
  };

  try {
    await sql`
      INSERT INTO error_events (
        kind, severity, message, stack, path, method, status_code,
        user_id, session_hash, user_agent, country, redacted_context
      ) VALUES (
        ${kind}, ${severity}, ${message}, ${stack}, ${path}, ${method}, ${statusCode},
        ${userId}, ${sessionHash}, ${userAgent ? userAgent.slice(0, 512) : null}, ${country},
        ${sql.json(safeContext)}
      )
    `;
  } catch (insertErr) {
    // Last resort. If we cannot record errors, we cannot debug - but we
    // also cannot crash the whole request because of telemetry failure.
    console.error('[errors] insert failed:', insertErr.message, '| original:', message);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Retention
// ─────────────────────────────────────────────────────────────────────────

export async function cleanupOldErrorEvents() {
  const days = parseInt(process.env.ERROR_EVENT_RETENTION_DAYS || '180', 10);
  const r = await sql`
    DELETE FROM error_events
    WHERE created_at < now() - make_interval(days => ${days})
      AND resolved_at IS NULL
  `;
  return r.count || 0;
}

// Resolved errors stay forever (small, useful for post-mortems).
