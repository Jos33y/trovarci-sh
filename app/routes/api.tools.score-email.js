/* /api/tools/score-email - Email Scorer endpoint. Auth-gated, 1 credit, spend-then-refund-on-fail. */

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
import { recordToolEvent } from '~/utils/toolAnalytics.server';

const TOOL_NAME = 'email_score';
const ANALYTICS_TOOL = 'email_score';

const SCORE_EMAIL_POLICY = { windowMinutes: 60, maxAttempts: 10 };
const RATE_LIMIT_BUCKET = (userId) => `score_email:user:${userId}`;

export async function action({ request }) {
  if (request.method !== 'POST') {
    return Response.json({ ok: false, error: 'Method not allowed' }, { status: 405 });
  }

  let user;
  try {
    user = await requireUser(request);
  } catch (err) {
    recordToolEvent(request, { tool: ANALYTICS_TOOL, phase: 'error', code: 'AUTH_REQUIRED' });
    return Response.json(
      { ok: false, error: 'Sign in required', code: 'AUTH_REQUIRED' },
      { status: 401 }
    );
  }

  const idempotencyKey = request.headers.get('idempotency-key') || null;
  if (idempotencyKey) {
    const existing = checkIdempotency(user.id, idempotencyKey);
    if (existing) {
      const resp = await existing;
      return resp.clone ? resp.clone() : resp;
    }
  }

  const work = (async () => {
    return await processScoreRequest(user, request, idempotencyKey);
  })();

  if (idempotencyKey) {
    registerInflight(user.id, idempotencyKey, work);
  }

  return await work;
}

async function processScoreRequest(user, request, idempotencyKey) {
  recordToolEvent(request, { tool: ANALYTICS_TOOL, phase: 'start', userId: user.id });

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
    recordToolEvent(request, { tool: ANALYTICS_TOOL, phase: 'error', code: 'BAD_REQUEST', userId: user.id });
    return Response.json(
      { ok: false, error: 'Could not parse request body', code: 'BAD_REQUEST' },
      { status: 400 }
    );
  }

  const normalized = normalizeScoringInput(rawInput);
  const validation = validateScoringInput(normalized);
  if (!validation.valid) {
    recordToolEvent(request, { tool: ANALYTICS_TOOL, phase: 'error', code: 'VALIDATION', userId: user.id });
    return Response.json(
      { ok: false, error: validation.error, code: 'VALIDATION' },
      { status: 400 }
    );
  }

  const contentHash = hashScoringInput(normalized);
  const cached = checkResultCache(user.id, contentHash);
  if (cached) {
    recordToolEvent(request, {
      tool: ANALYTICS_TOOL,
      phase: 'success',
      userId: user.id,
      metadata: { cached: true, spent: 0 },
    });
    return Response.json({
      ok: true,
      result: cached,
      credits: {
        spent: 0,
        balance: null,
        transactionId: null,
        cached: true,
      },
      rateLimit: null,
    });
  }

  const rl = await checkAndIncrement(RATE_LIMIT_BUCKET(user.id), SCORE_EMAIL_POLICY);
  if (!rl.allowed) {
    recordToolEvent(request, { tool: ANALYTICS_TOOL, phase: 'error', code: 'RATE_LIMITED', userId: user.id });
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

  const cost = CREDIT_COSTS.email_score;
  const spend = await spendCredits(user.id, cost, TOOL_NAME, {
    metadata: { inputMode: normalized.mode },
  });

  if (!spend.ok) {
    recordToolEvent(request, {
      tool: ANALYTICS_TOOL,
      phase: 'error',
      code: 'INSUFFICIENT_CREDITS',
      userId: user.id,
      metadata: { balance: spend.balance ?? null, required: cost },
    });
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

  const score = await scoreEmail(normalized);

  if (!score.ok) {
    try {
      await refundCredits(user.id, cost, {
        originalTransactionId: spend.transactionId,
        reason: score.code,
      });
    } catch (refundErr) {
      console.error('Email Scorer refund failed after API error:', refundErr);
    }

    recordToolEvent(request, {
      tool: ANALYTICS_TOOL,
      phase: 'error',
      code: score.code || 'ARCIS_UNKNOWN',
      userId: user.id,
      metadata: { refunded: true },
    });

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

  setResultCache(user.id, contentHash, score.result);

  recordToolEvent(request, {
    tool: ANALYTICS_TOOL,
    phase: 'success',
    userId: user.id,
    metadata: { cached: false, spent: cost },
  });

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
