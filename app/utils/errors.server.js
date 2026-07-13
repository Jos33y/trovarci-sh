// Error telemetry recording - server routes, client beacons, worker catches.
// Synchronous insert path. PII redacted at intake via KEY_DENYLIST_PARTIAL, HEADER_DENYLIST, and hashEmail.
// No ring buffer: a crash before flush would lose exactly the data we need to diagnose the crash.

import { sql } from './db.server.js';
import { getCountry, deriveSessionHash } from './analytics.server.js';
import crypto from 'node:crypto';

const ERRORS_ENABLED = (process.env.ERRORS_ENABLED ?? 'true') !== 'false';

// PII redaction

// Header names whose values are never stored. Presence marked with `_${name}_present: true`.
const HEADER_DENYLIST = new Set([
  'cookie', 'authorization', 'x-api-key', 'x-auth-token',
  'set-cookie', 'proxy-authorization', 'sign', 'stripe-signature',
]);

// Object key substrings that trigger '[redacted]' replacement in redacted_context.
const KEY_DENYLIST_PARTIAL = [
  'password', 'token', 'secret', 'api_key', 'apikey',
  'access_key', 'auth', 'session', 'jwt', 'cookie', 'credit_card',
  'card_number', 'cvv', 'pan', 'ssn', 'social_security',
];

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

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
  const SAFE = ['user-agent', 'referer', 'accept-language', 'cf-ipcountry', 'sec-fetch-mode', 'sec-fetch-site', 'sec-fetch-dest'];
  for (const name of SAFE) {
    const v = request.headers.get(name);
    if (v) out[name] = redactString(v, 512);
  }
  for (const name of HEADER_DENYLIST) {
    if (request.headers.get(name)) out[`_${name}_present`] = true;
  }
  return out;
}

// Error extraction - handles Error instances, plain objects thrown as { message, code }, strings,
// Response instances, and unknowns. Prevents '[object Object]' rows when code does `throw { ... }`
// instead of `throw new Error(...)`.

function extractMessage(error) {
  if (error == null) return 'Unknown error';
  if (error instanceof Error) return error.message || error.toString() || 'Unknown error';
  if (typeof error === 'string') return error || 'Unknown error';
  if (typeof error === 'number' || typeof error === 'boolean') return String(error);
  if (typeof Response !== 'undefined' && error instanceof Response) {
    return `HTTP ${error.status}${error.statusText ? ' ' + error.statusText : ''}`;
  }
  if (typeof error === 'object') {
    if (typeof error.message === 'string' && error.message) return error.message;
    if (typeof error.error === 'string'   && error.error)   return error.error;
    if (typeof error.reason === 'string'  && error.reason)  return error.reason;
    if (typeof error.msg === 'string'     && error.msg)     return error.msg;
    // Bounded JSON fallback captures shape when no known text field is present.
    try {
      const json = JSON.stringify(error);
      if (json && json !== '{}') return json.slice(0, 512);
    } catch { /* circular refs or non-serializable - fall through */ }
    return '[object] ' + (error.constructor?.name || 'Object');
  }
  return String(error);
}

function extractStack(error) {
  if (error instanceof Error && error.stack) return error.stack;
  if (error && typeof error === 'object' && typeof error.stack === 'string') return error.stack;
  return null;
}

function extractName(error) {
  if (error instanceof Error) return error.name;
  if (error && typeof error === 'object' && typeof error.name === 'string') return error.name;
  return null;
}

function extractCode(error) {
  if (error && typeof error === 'object' && 'code' in error && error.code != null) {
    return String(error.code);
  }
  return null;
}

// Recording

// Server-side route errors caught by handleError in entry.server.jsx.
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

// Client-side errors POSTed to /api/telemetry/beacon. The `request` is the beacon request,
// not the request that caused the error - that context lives in the payload.
export async function recordClientError(payload, request, userId = null) {
  if (!ERRORS_ENABLED) return;

  const message = redactString(extractMessage(payload?.message ?? payload), 1024);
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

// Worker process errors. No request context.
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
  const message = redactString(extractMessage(error), 1024);
  const rawStack = extractStack(error);
  const stack = rawStack ? redactString(rawStack, 8192) : null;

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
    error_name: extractName(error),
    error_code: extractCode(error),
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
    // Telemetry failure must not crash the request. Log to stderr and continue.
    console.error('[errors] insert failed:', insertErr.message, '| original:', message);
  }
}

// Retention

export async function cleanupOldErrorEvents() {
  const days = parseInt(process.env.ERROR_EVENT_RETENTION_DAYS || '180', 10);
  const r = await sql`
    DELETE FROM error_events
    WHERE created_at < now() - make_interval(days => ${days})
      AND resolved_at IS NULL
  `;
  return r.count || 0;
}

// Resolved errors are kept forever. Small footprint, useful for post-mortems.
