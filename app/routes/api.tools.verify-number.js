/* /api/tools/verify-number - format check (free/anon) + carrier lookup (2 credits, authed).
   Two tool identities in analytics: phone_format (anon) and phone_verify (authed carrier). */

import { requireUser } from '~/utils/session.server';
import { spendCredits, refundCredits } from '~/lib/credits.server';
import { CREDIT_COSTS } from '~/utils/creditsConfig.server';
import { validateAndFormat } from '~/lib/phoneFormat.server';
import { lookupCarrier } from '~/lib/twilioLookup.server';
import { checkAndIncrement } from '~/utils/rateLimit.server';
import { recordToolEvent } from '~/utils/toolAnalytics.server';

const TOOL_NAME = 'phone_verify';
const ANALYTICS_TOOL_FORMAT = 'phone_format';
const ANALYTICS_TOOL_CARRIER = 'phone_verify';

const FORMAT_POLICY = { windowMinutes: 60, maxAttempts: 100 };
const CARRIER_POLICY = { windowMinutes: 60, maxAttempts: 30 };

const FORMAT_RL_BUCKET  = (key)    => `phone_format:${key}`;
const CARRIER_RL_BUCKET = (userId) => `phone_carrier:user:${userId}`;

const MAX_INPUT_BYTES = 64;

export async function action({ request }) {
  if (request.method !== 'POST') {
    return jsonError(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  }

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
    const tool = mode === 'carrier' ? ANALYTICS_TOOL_CARRIER : ANALYTICS_TOOL_FORMAT;
    recordToolEvent(request, { tool, phase: 'error', code: 'INPUT_TOO_LONG' });
    return jsonError(400, 'Phone number is too long', 'INPUT_TOO_LONG');
  }

  if (mode === 'format') {
    return handleFormat(request, { rawNumber, country });
  }
  return handleCarrier(request, { rawNumber, country });
}

export function loader() {
  return jsonError(405, 'Use POST', 'METHOD_NOT_ALLOWED');
}

// Tier 1: format check (free, no auth)
async function handleFormat(request, { rawNumber, country }) {
  const ip = getClientIp(request);
  const rl = await checkAndIncrement(FORMAT_RL_BUCKET('ip:' + ip), FORMAT_POLICY);
  if (!rl.allowed) {
    recordToolEvent(request, { tool: ANALYTICS_TOOL_FORMAT, phase: 'error', code: 'RATE_LIMITED' });
    return jsonError(
      429,
      `Rate limit reached. Try again in ${rl.retryAfterSeconds || 60} seconds.`,
      'RATE_LIMITED',
      { retryAfterSeconds: rl.retryAfterSeconds }
    );
  }

  recordToolEvent(request, { tool: ANALYTICS_TOOL_FORMAT, phase: 'start' });

  const fmt = validateAndFormat(rawNumber, country);

  if (!fmt.ok) {
    recordToolEvent(request, { tool: ANALYTICS_TOOL_FORMAT, phase: 'error', code: fmt.code || 'FORMAT_INVALID' });
    return Response.json({
      ok: false,
      error: fmt.error,
      code: fmt.code,
      partial: fmt.partial || null,
    });
  }

  recordToolEvent(request, { tool: ANALYTICS_TOOL_FORMAT, phase: 'success' });
  return Response.json({
    ok: true,
    formatResult: fmt.result,
  });
}

// Tier 2: carrier lookup (auth required, 2 credits)
async function handleCarrier(request, { rawNumber, country }) {
  let user;
  try {
    user = await requireUser(request);
  } catch {
    recordToolEvent(request, { tool: ANALYTICS_TOOL_CARRIER, phase: 'error', code: 'AUTH_REQUIRED' });
    return jsonError(401, 'Sign in for carrier lookup', 'AUTH_REQUIRED');
  }

  recordToolEvent(request, { tool: ANALYTICS_TOOL_CARRIER, phase: 'start', userId: user.id });

  const rl = await checkAndIncrement(CARRIER_RL_BUCKET(user.id), CARRIER_POLICY);
  if (!rl.allowed) {
    recordToolEvent(request, { tool: ANALYTICS_TOOL_CARRIER, phase: 'error', code: 'RATE_LIMITED', userId: user.id });
    return jsonError(
      429,
      `Rate limit reached. Try again in ${rl.retryAfterSeconds || 60} seconds.`,
      'RATE_LIMITED',
      { retryAfterSeconds: rl.retryAfterSeconds }
    );
  }

  const fmt = validateAndFormat(rawNumber, country);
  if (!fmt.ok) {
    recordToolEvent(request, {
      tool: ANALYTICS_TOOL_CARRIER,
      phase: 'error',
      code: fmt.code || 'FORMAT_INVALID',
      userId: user.id,
    });
    return Response.json({
      ok: false,
      error: fmt.error,
      code: fmt.code,
      partial: fmt.partial || null,
      formatValid: false,
    });
  }

  const cost = CREDIT_COSTS.phone_verify;
  const spend = await spendCredits(user.id, cost, TOOL_NAME, {
    metadata: {
      e164: fmt.result.e164,
      country: fmt.result.country,
    },
  });

  if (!spend.ok) {
    recordToolEvent(request, {
      tool: ANALYTICS_TOOL_CARRIER,
      phase: 'error',
      code: 'INSUFFICIENT_CREDITS',
      userId: user.id,
      metadata: { balance: spend.balance ?? null, required: cost },
    });
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

  const lookup = await lookupCarrier(fmt.result.e164);

  if (!lookup.ok) {
    try {
      await refundCredits(user.id, cost, {
        originalTransactionId: spend.transactionId,
        reason: lookup.code,
      });
    } catch (refundErr) {
      console.error('Phone Verifier refund failed:', refundErr);
    }

    recordToolEvent(request, {
      tool: ANALYTICS_TOOL_CARRIER,
      phase: 'error',
      code: lookup.code || 'CARRIER_LOOKUP_FAILED',
      userId: user.id,
      metadata: { refunded: true },
    });

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

  recordToolEvent(request, {
    tool: ANALYTICS_TOOL_CARRIER,
    phase: 'success',
    userId: user.id,
    metadata: { spent: cost, country: fmt.result.country },
  });

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

// Helpers

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

function getClientIp(request) {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const xr = request.headers.get('x-real-ip');
  if (xr) return xr.trim();
  const cf = request.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  return 'unknown';
}
