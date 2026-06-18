/* ═══════════════════════════════════════════════════════════════════════════
   /api/tools/verify-number

   One endpoint, two modes. Mirrors the spend-then-refund-on-fail pattern
   established by /api/tools/score-email.

   Modes (selected via body.mode):

     'format'   Tier 1 only. Free. No auth required. IP rate-limited.
                Runs libphonenumber-js validation and returns format data.

     'carrier'  Tier 1 + Tier 2. Auth required. 2 credits per call.
                Runs format validation FIRST (free) - if format is invalid,
                no credit is charged and an error is returned. Otherwise
                spends credit, calls Twilio Lookup v2, refunds on failure.

   Why one endpoint, not two:
     - Same shape on success (formatResult always present, carrierResult
       added in carrier mode). Frontend handles both responses with one
       parser.
     - Tier 2 always runs Tier 1 first server-side. We never trust a
       client-supplied E.164.

   Refund logic:
     - Twilio returns ok:true (full or partial data) -> NO refund. Twilio
       billed us either way.
     - Twilio returns ok:false (auth, 404, 429, 5xx, timeout, TLS) -> refund.
       These cases are not billed.
   ═══════════════════════════════════════════════════════════════════════════ */

import { requireUser } from '~/utils/session.server';
import { spendCredits, refundCredits } from '~/lib/credits.server';
import { CREDIT_COSTS } from '~/utils/creditsConfig.server';
import { validateAndFormat } from '~/lib/phoneFormat.server';
import { lookupCarrier } from '~/lib/twilioLookup.server';
import { checkAndIncrement } from '~/utils/rateLimit.server';

const TOOL_NAME = 'phone_verify';

// Format check is cheap (no external API, no credit). Generous IP limit
// so legitimate paste-test-clear-paste workflows are not blocked.
const FORMAT_POLICY = { windowMinutes: 60, maxAttempts: 100 };

// Carrier lookup costs us money on every call. Tighter user-scoped limit
// catches scripted abuse before it bleeds budget.
const CARRIER_POLICY = { windowMinutes: 60, maxAttempts: 30 };

const FORMAT_RL_BUCKET  = (key)    => `phone_format:${key}`;
const CARRIER_RL_BUCKET = (userId) => `phone_carrier:user:${userId}`;

// Hard cap on raw input before we even try to parse. 64 leaves headroom
// over the 32 cap inside phoneFormat.server.js without becoming a DoS vector.
const MAX_INPUT_BYTES = 64;

// ============================================================================
// Action entry point
// ============================================================================

export async function action({ request }) {
  if (request.method !== 'POST') {
    return jsonError(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  }

  // Parse body. Accept JSON only - this is an SPA fetch endpoint.
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'Invalid JSON body', 'BAD_REQUEST');
  }

  const mode = body?.mode === 'carrier' ? 'carrier' : 'format';
  const rawNumber = typeof body?.number === 'string' ? body.number : '';
  const rawCountry = typeof body?.country === 'string' ? body.country : 'US';
  const country = rawCountry.toUpperCase();

  if (rawNumber.length > MAX_INPUT_BYTES) {
    return jsonError(400, 'Phone number is too long', 'INPUT_TOO_LONG');
  }

  if (mode === 'format') {
    return handleFormat(request, { rawNumber, country });
  }
  return handleCarrier(request, { rawNumber, country });
}

/* GETs land on a 405 so crawlers and curious visitors do not pollute
   counters or logs with empty 200s. */
export function loader() {
  return jsonError(405, 'Use POST', 'METHOD_NOT_ALLOWED');
}

// ============================================================================
// Tier 1: format check (free, no auth)
// ============================================================================

async function handleFormat(request, { rawNumber, country }) {
  // IP-scoped rate limit. Anonymous-allowed endpoints always need an IP gate.
  const ip = getClientIp(request);
  const rl = await checkAndIncrement(FORMAT_RL_BUCKET('ip:' + ip), FORMAT_POLICY);
  if (!rl.allowed) {
    return jsonError(
      429,
      `Rate limit reached. Try again in ${rl.retryAfterSeconds || 60} seconds.`,
      'RATE_LIMITED',
      { retryAfterSeconds: rl.retryAfterSeconds }
    );
  }

  const fmt = validateAndFormat(rawNumber, country);

  // Format failures return HTTP 200 with ok:false. They are tool results,
  // not transport errors - the frontend renders them inline rather than
  // as an error toast.
  if (!fmt.ok) {
    return Response.json({
      ok: false,
      error: fmt.error,
      code: fmt.code,
      partial: fmt.partial || null,
    });
  }

  return Response.json({
    ok: true,
    formatResult: fmt.result,
  });
}

// ============================================================================
// Tier 2: carrier lookup (auth required, 2 credits)
// ============================================================================

async function handleCarrier(request, { rawNumber, country }) {
  // 1. Auth. requireUser throws a redirect for browser nav; for SPA fetches
  //    we want JSON 401 so the client can show an inline signup CTA.
  let user;
  try {
    user = await requireUser(request);
  } catch {
    return jsonError(401, 'Sign in for carrier lookup', 'AUTH_REQUIRED');
  }

  // 2. User-scoped rate limit. Cheap reject before any DB write or API call.
  const rl = await checkAndIncrement(CARRIER_RL_BUCKET(user.id), CARRIER_POLICY);
  if (!rl.allowed) {
    return jsonError(
      429,
      `Rate limit reached. Try again in ${rl.retryAfterSeconds || 60} seconds.`,
      'RATE_LIMITED',
      { retryAfterSeconds: rl.retryAfterSeconds }
    );
  }

  // 3. Tier 1 ALWAYS runs first server-side. We never trust client E.164.
  //    If format is bad, we return early with no credit charged.
  const fmt = validateAndFormat(rawNumber, country);
  if (!fmt.ok) {
    return Response.json({
      ok: false,
      error: fmt.error,
      code: fmt.code,
      partial: fmt.partial || null,
      formatValid: false,
    });
  }

  // 4. Spend 2 credits atomically. FOR UPDATE row lock prevents double-spend
  //    across concurrent requests from the same user.
  const cost = CREDIT_COSTS.phone_verify;
  const spend = await spendCredits(user.id, cost, TOOL_NAME, {
    metadata: {
      e164: fmt.result.e164,
      country: fmt.result.country,
    },
  });

  if (!spend.ok) {
    // Insufficient credits. Return Tier 1 data anyway so the user still
    // gets the format check value they asked for.
    return Response.json(
      {
        ok: false,
        error: `Not enough credits. Carrier lookup costs ${cost}, balance is ${spend.balance}.`,
        code: 'INSUFFICIENT_CREDITS',
        balance: spend.balance,
        required: cost,
        formatResult: fmt.result,
      },
      { status: 402 }
    );
  }

  // 5. Twilio Lookup v2. lookupCarrier never throws.
  const lookup = await lookupCarrier(fmt.result.e164);

  if (!lookup.ok) {
    // Refund and surface. The refund row references the original spend
    // for a clean audit trail.
    try {
      await refundCredits(user.id, cost, {
        originalTransactionId: spend.transactionId,
        reason: lookup.code,
      });
    } catch (refundErr) {
      // Refund itself failed. This is an internal alarm condition - log
      // for ops and continue. Do not hide the original error from the user.
      console.error('Phone Verifier refund failed:', refundErr);
    }

    return Response.json(
      {
        ok: false,
        error: lookup.error,
        code: lookup.code,
        refunded: true,
        formatResult: fmt.result,
      },
      { status: mapTwilioStatus(lookup.code) }
    );
  }

  // 6. Success. Return Tier 1 + Tier 2 + the new balance so the client
  //    can update its credit pill without a separate fetch.
  return Response.json({
    ok: true,
    formatResult: fmt.result,
    carrierResult: lookup.result,
    credits: {
      spent: cost,
      balance: spend.newBalance,
      transactionId: spend.transactionId,
    },
    rateLimit: {
      remaining: rl.remaining,
      attempts: rl.attempts,
      windowMinutes: CARRIER_POLICY.windowMinutes,
    },
  });
}

// ============================================================================
// Helpers
// ============================================================================

function jsonError(status, error, code, extra = {}) {
  return Response.json(
    { ok: false, error, code, ...extra },
    {
      status,
      headers: code === 'RATE_LIMITED' && extra.retryAfterSeconds
        ? { 'Retry-After': String(extra.retryAfterSeconds) }
        : undefined,
    }
  );
}

function mapTwilioStatus(code) {
  switch (code) {
    case 'TWILIO_NOT_FOUND':       return 404;
    case 'TWILIO_RATE_LIMITED':    return 503;
    case 'TWILIO_TIMEOUT':         return 504;
    case 'TWILIO_NO_CREDENTIALS':  return 503;
    case 'TWILIO_AUTH_FAILED':     return 503;
    case 'TWILIO_TLS_FAILED':      return 503;
    case 'TWILIO_BAD_INPUT':       return 400;
    case 'TWILIO_BAD_SHAPE':       return 502;
    case 'TWILIO_API_ERROR':       return 502;
    default:                       return 500;
  }
}

/* Best-effort client IP. Trust order:
     1. X-Forwarded-For first hop (Coolify / nginx prepend)
     2. X-Real-IP
     3. CF-Connecting-IP (Cloudflare)
     4. Fallback to a constant so the rate limiter has a stable bucket key
   In production behind Coolify + Cloudflare, X-Forwarded-For will always
   be set. The fallback only triggers in tests and local dev. */
function getClientIp(request) {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const xr = request.headers.get('x-real-ip');
  if (xr) return xr.trim();
  const cf = request.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  return 'unknown';
}
