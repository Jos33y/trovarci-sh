/* ═══════════════════════════════════════════════════════════════════════════
   /api/tools/score-email

   Orchestrates: auth -> rate limit -> input validation -> credit spend ->
   Claude API call -> (refund on failure) -> shaped response.

   Credit accounting pattern: spend-then-refund-on-fail.
     1. spendCredits decrements user balance atomically in a DB transaction
     2. Claude API is called
     3. On any failure after spend, refundCredits puts the credit back
        and writes a refund ledger row pointing at the original transaction
     4. On success, the shaped result is returned with the new balance

   Why this pattern, not pay-on-success:
     - Double-spend is impossible with FOR UPDATE row lock in spendCredits
     - Audit trail is clean: every API call leaves at least one ledger row
     - Refund ledger rows have reference_id = original tx, so failures are
       traceable without heuristics
     - Same pattern DNS scan, email verifier, and phone verifier will use
   ═══════════════════════════════════════════════════════════════════════════ */

import { requireUser } from '~/utils/session.server';
import { spendCredits, refundCredits } from '~/lib/credits.server';
import { CREDIT_COSTS } from '~/utils/creditsConfig.server';
import { scoreEmail, normalizeScoringInput, validateScoringInput } from '~/lib/arcis.server';
import { checkAndIncrement } from '~/utils/rateLimit.server';
import {
  hashScoringInput,
  checkIdempotency,
  registerInflight,
  checkResultCache,
  setResultCache,
} from '~/lib/scoreCache.server';

const TOOL_NAME = 'email_score';

/* Tool-specific rate limit policy. Following the same convention as the
   auth limits in rateLimit.server.js (windowMinutes + maxAttempts).
   10 scores per user per hour is generous for a real user and catches
   accidental loops / scripted abuse before Stripe telemetry notices. */
const SCORE_EMAIL_POLICY = { windowMinutes: 60, maxAttempts: 10 };
const RATE_LIMIT_BUCKET = (userId) => `score_email:user:${userId}`;

export async function action({ request }) {
  if (request.method !== 'POST') {
    return Response.json({ ok: false, error: 'Method not allowed' }, { status: 405 });
  }

  // 1. Auth. Throws a redirect for unauth'd browser requests; for fetch
  //    calls from our own SPA we want JSON back, so catch and return 401.
  let user;
  try {
    user = await requireUser(request);
  } catch (err) {
    // requireUser throws a Response (redirect or 401) for unauth'd sessions.
    // We want a JSON response instead so the client can show an auth prompt.
    return Response.json(
      { ok: false, error: 'Sign in required', code: 'AUTH_REQUIRED' },
      { status: 401 }
    );
  }

  // 1.5. Idempotency: if the client sent an Idempotency-Key header AND
  //      a request with that key from this user is already in-flight,
  //      wait on its result instead of starting a new one. Standard
  //      pattern (Stripe, Square, every modern payments API) for
  //      preventing double-charge on accidental retries.
  const idempotencyKey = request.headers.get('idempotency-key') || null;
  if (idempotencyKey) {
    const existing = checkIdempotency(user.id, idempotencyKey);
    if (existing) {
      // Return whatever the original request returned - including the
      // Response object verbatim (body cloned).
      const resp = await existing;
      return resp.clone ? resp.clone() : resp;
    }
  }

  // The actual work, wrapped so we can register it as in-flight before
  // awaiting. Anything inside this function is what the idempotency
  // cache "remembers" and replays.
  const work = (async () => {
    return await processScoreRequest(user, request, idempotencyKey);
  })();

  if (idempotencyKey) {
    registerInflight(user.id, idempotencyKey, work);
  }

  return await work;
}

async function processScoreRequest(user, request, idempotencyKey) {
  // 2. Parse input. Support both JSON and form-encoded bodies.
  let rawInput;
  try {
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      rawInput = await request.json();
    } else {
      const form = await request.formData();
      rawInput = {
        mode: form.get('mode'),
        subject: form.get('subject'),
        body: form.get('body'),
      };
    }
  } catch {
    return Response.json(
      { ok: false, error: 'Could not parse request body', code: 'BAD_REQUEST' },
      { status: 400 }
    );
  }

  // 3. Server-side input validation BEFORE charging a credit.
  //    Re-runs the normalizer so request-side tampering cannot bypass limits.
  const normalized = normalizeScoringInput(rawInput);
  const validation = validateScoringInput(normalized);
  if (!validation.valid) {
    return Response.json(
      { ok: false, error: validation.error, code: 'VALIDATION' },
      { status: 400 }
    );
  }

  // 3.5. Result cache: same user + same content within the last hour
  //      returns the prior result without spending a credit or hitting
  //      Anthropic. Two purposes:
  //        - UX: refresh / re-mount doesn't re-charge the user
  //        - Anti-gaming: paste-same-email-twice for free reads is
  //          mitigated by giving them the cached answer rather than a
  //          fresh score (cached === their previous score === useless
  //          to game)
  const contentHash = hashScoringInput(normalized);
  const cached = checkResultCache(user.id, contentHash);
  if (cached) {
    return Response.json({
      ok: true,
      result: cached,
      credits: {
        spent: 0,
        balance: null,         // unchanged - client should keep its current display
        transactionId: null,
        cached: true,
      },
      rateLimit: null,
    });
  }

  // 4. Rate limit via the shared Postgres-backed limiter. checkAndIncrement
  //    is atomic: it UPSERTs the counter and returns the windowed sum in a
  //    single round-trip, so two concurrent requests cannot both pass the
  //    check with stale data.
  const rl = await checkAndIncrement(RATE_LIMIT_BUCKET(user.id), SCORE_EMAIL_POLICY);
  if (!rl.allowed) {
    const retrySeconds = rl.retryAfterSeconds || 60;
    return Response.json(
      {
        ok: false,
        error: `Rate limit reached. Try again in ${retrySeconds} seconds.`,
        code: 'RATE_LIMITED',
        retryAfterSeconds: retrySeconds,
      },
      { status: 429, headers: { 'Retry-After': String(retrySeconds) } }
    );
  }

  // 5. Spend 1 credit atomically. The FOR UPDATE lock in spendCredits
  //    guarantees two concurrent requests from the same user cannot both
  //    pass the balance check with stale data.
  const cost = CREDIT_COSTS.email_score;
  const spend = await spendCredits(user.id, cost, TOOL_NAME, {
    metadata: { inputMode: normalized.mode },
  });

  if (!spend.ok) {
    return Response.json(
      {
        ok: false,
        error: `Insufficient credits. This scan costs ${cost}, balance is ${spend.balance}.`,
        code: 'INSUFFICIENT_CREDITS',
        balance: spend.balance,
        required: cost,
      },
      { status: 402 }
    );
  }

  // 6. Call the scoring engine. Any failure after this point must refund.
  const score = await scoreEmail(normalized);

  if (!score.ok) {
    // Refund and surface the error. The refund ledger row points at the
    // original spend transaction for a clean audit trail.
    try {
      await refundCredits(user.id, cost, {
        originalTransactionId: spend.transactionId,
        reason: score.code,
      });
    } catch (refundErr) {
      // Refund failure is a serious internal problem but must not hide the
      // original error from the user. Log server-side for monitoring.
      console.error('Email Scorer refund failed after API error:', refundErr);
    }

    // Map engine errors to HTTP status codes that match their semantics.
    const status = mapEngineErrorStatus(score.code);
    return Response.json(
      {
        ok: false,
        error: score.error,
        code: score.code,
        refunded: true,
      },
      { status }
    );
  }

  // 7. Success. Return the shaped result plus the new balance so the
  //    client can update the credit indicator without a separate fetch.
  setResultCache(user.id, contentHash, score.result);

  return Response.json({
    ok: true,
    result: score.result,
    credits: {
      spent: cost,
      balance: spend.newBalance,
      transactionId: spend.transactionId,
    },
    rateLimit: {
      remaining: rl.remaining,
      attempts: rl.attempts,
      windowMinutes: SCORE_EMAIL_POLICY.windowMinutes,
    },
  });
}

/* GETs fall through to a 405 so crawlers and curious visitors do not get
   an empty 200 response. */
export function loader() {
  return Response.json({ ok: false, error: 'Use POST' }, { status: 405 });
}

function mapEngineErrorStatus(code) {
  switch (code) {
    case 'ARCIS_VALIDATION':     return 400;
    case 'ARCIS_NO_API_KEY':     return 503;
    case 'ARCIS_RATE_LIMITED':   return 503;
    case 'ARCIS_TIMEOUT':        return 504;
    case 'ARCIS_BAD_SHAPE':      return 502;
    case 'ARCIS_API_ERROR':      return 502;
    default:                     return 500;
  }
}
